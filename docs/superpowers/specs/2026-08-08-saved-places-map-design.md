# 맛집 지도(저장·폴더·공유) 설계

**작성일:** 2026-08-08
**대상:** `app/`, `components/`, `lib/`, `supabase/migrations/`
**근거 규칙:** 프로젝트 루트 `CLAUDE.md` (Next.js / Frontend / TypeScript / 보안·RLS 규칙)

---

## 1. 배경과 목표

이 앱은 지금까지 "오늘 뭐 먹지"를 한 번에 골라 주는 추천 도구였습니다. 여기에 **개인이 맛집을
모아 두는 지도**를 더합니다.

**목표**

- 로그인한 사용자가 맛집을 저장하고, **폴더**로 나눠 관리한다.
- 저장한 맛집을 **지도에 핀**으로 보고(주), 목록으로도 본다(보조).
- 폴더를 **초대코드**로 공유해, 다른 사람에게 읽기 또는 편집(수정·삭제) 권한을 준다.

**비목표**

- 추천 알고리즘 자체는 바꾸지 않는다(그룹 평균 제거로 인한 단순화만 반영).
- 실시간 협업(동시 편집 표시 등)은 다루지 않는다.
- 맛집 공개 검색·탐색(남의 폴더를 코드 없이 찾기)은 다루지 않는다.

**전제**

- 로그인은 optional이지만, 맛집 지도는 **로그인 필수**다. 익명 세션은 접근할 수 없다.
- 지오코딩·장소 검색은 이미 서버 Edge Function(`geocode` 등)이 있으므로 재활용한다.

## 2. 기존 그룹 로직 폐기

현재 `groups` / `group_members` / `create_group()` / `join_group_by_code()` 초대코드 로직과
`GroupManager` 모달이 있으나 실사용되지 않는다. 추천 점수에는 "그룹원 평균 평점"(`groupAverage`)이
물려 있다.

이 기능 전체를 **폐기**하고, 초대코드라는 개념만 새 폴더 공유로 옮긴다.

- 마이그레이션으로 `groups` · `group_members` 테이블과 `create_group` · `join_group_by_code` ·
  `shares_group_with` 함수를 drop한다.
- 프론트에서 `GroupManager`와 관련 API/훅/타입/상수를 제거한다.
- 추천 계산에서 `groupAverage`를 제거한다. 추천은 **개인 평점 + Google 평점 + 거리 + 카테고리
  기호**로 계산된다. `lib/recommend.ts`의 `scoreCandidate`와 `lib/mergeCandidates.ts`를 그에 맞게
  정리한다.

`ratings` 테이블의 RLS `ratings_select`가 `shares_group_with`에 의존하므로, 이 정책을
"본인 것만 조회"로 교체한다(그룹이 없어졌으므로 남의 평점을 볼 이유가 없다).

## 3. 데이터 모델

새 테이블 네 개를 만든다. 용어를 먼저 정한다.

- **폴더(folder)**: 맛집을 담는 이름 있는 묶음. 한 명의 소유자가 있다.
- **저장 맛집(saved place)**: 폴더에 담긴 가게 하나. 저장 시점의 표시 정보를 스냅샷으로 갖는다.
- **폴더 멤버(folder member)**: 초대코드로 폴더에 참여한 사람과 그 권한.
- **폴더 초대(folder invite)**: 폴더에 참여할 수 있는 코드. 코드마다 권한 단계가 실려 있다.

```sql
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 공유받은 사람과 권한. 소유자는 folders.owner_id로 전권을 가지므로 이 표에 넣지 않는다.
create table public.folder_members (
  folder_id uuid not null references public.folders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (folder_id, user_id)
);

-- 폴더에 참여할 수 있는 코드. 폴더마다 뷰어 코드·에디터 코드를 따로 둘 수 있다.
create table public.folder_invites (
  code text primary key,
  folder_id uuid not null references public.folders(id) on delete cascade,
  permission text not null check (permission in ('viewer', 'editor')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index folder_invites_folder_idx on public.folder_invites(folder_id);

-- 저장 맛집. name/lat/lng/address는 저장 시점 스냅샷이라 restaurants 캐시가 바뀌어도 유지된다.
create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  place_id text not null,
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  address text null,
  memo text null check (memo is null or length(memo) <= 500),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 같은 폴더에 같은 가게를 두 번 담지 않는다.
  unique (folder_id, place_id)
);
create index saved_places_folder_idx on public.saved_places(folder_id);
```

**설계 결정 근거**

- **소유자를 folder_members에 넣지 않는 이유**: 소유자 권한은 폴더 삭제·이름변경·코드발급·멤버관리까지
  포함해 editor보다 넓다. `owner_id` 하나로 판단하면 "소유자인가?"와 "editor 이상인가?"를 명확히
  나눌 수 있다.
- **스냅샷 컬럼**: `restaurants` 캐시는 15분 TTL로 덮어써지고 삭제될 수 있다. 저장 맛집이 캐시에
  의존하면 데이터가 사라질 위험이 있으므로 표시 정보를 복사한다. `place_id`는 Google 지도 상세
  링크와 폴더 내 중복 방지에만 쓴다(캐시 FK로 걸지 않는다).
- **place_id 유니크 범위**: 폴더 단위다. 다른 폴더에는 같은 가게를 담을 수 있다.

## 4. 권한과 RLS

익명 사용자는 이 도메인 전체에서 차단한다(로그인 필수). 기존 `is_anonymous_user()`를 재활용한다.

접근 판단을 돕는 헬퍼 함수를 둔다.

```sql
-- 폴더를 볼 수 있는가? (소유자 또는 멤버)
create function public.can_view_folder(target uuid) returns boolean ...
  → owner_id = auth.uid() OR exists(folder_members where folder_id=target and user_id=auth.uid())

-- 폴더를 편집할 수 있는가? (소유자 또는 editor 멤버)
create function public.can_edit_folder(target uuid) returns boolean ...
  → owner_id = auth.uid() OR exists(folder_members where folder_id=target and user_id=auth.uid() and permission='editor')
```

두 함수는 `security definer`로 두어, RLS 정책이 서로의 표를 참조할 때 생기는 재귀·권한 문제를
피한다(기존 `shares_group_with` 패턴과 동일한 이유).

| 테이블           | select               | insert                                            | update      | delete                 |
| ---------------- | -------------------- | ------------------------------------------------- | ----------- | ---------------------- |
| `folders`        | 소유자 or 멤버       | 본인 소유로만(`owner_id=auth.uid()`, 익명 아님)   | 소유자      | 소유자                 |
| `folder_members` | 소유자 or 본인 행    | (join RPC 전용, 직접 insert 불가)                 | 소유자      | 소유자 or 본인(나가기) |
| `folder_invites` | 소유자               | (create_folder_invite RPC 전용, 직접 insert 불가) | —           | 소유자                 |
| `saved_places`   | 폴더 볼 수 있는 사람 | editor 이상                                       | editor 이상 | editor 이상            |

`folder_members`의 insert는 코드 검증이 필요하므로 직접 insert를 막고 `join_folder_by_code()`
RPC로만 넣는다.

## 5. RPC (SECURITY DEFINER)

코드로 남의 폴더에 참여하려면 그 폴더 행을 읽어야 하는데, RLS상 아직 멤버가 아니라 읽을 수 없다.
그래서 참여는 서버 권한으로 도는 함수를 통한다.

```sql
-- 코드로 폴더에 참여한다. 코드의 권한으로 folder_members에 넣는다.
create function public.join_folder_by_code(code text)
  returns table(folder_id uuid, folder_name text, permission text) ...
```

동작:

1. 익명 사용자면 거부한다.
2. `folder_invites`에서 코드를 찾는다. 없으면 "유효하지 않은 코드" 오류.
3. 소유자가 자기 폴더 코드로 참여하려 하면 무의미하므로 거부하거나 그대로 통과시킨다(무해).
4. 이미 멤버면 권한을 코드 권한으로 갱신한다(`on conflict do update`). 뷰어였다가 에디터 코드로
   들어오면 승격된다.
5. 폴더 id·이름·권한을 돌려준다.

코드 발급은 `create_folder_invite(folder_id, permission)` RPC로 한다. 코드 문자열을 서버가
생성해야(예측 불가·유니크) 하기 때문이다. RPC는 호출자가 그 폴더의 소유자인지 확인한 뒤,
기존 `create_group`과 같은 방식(`upper(substr(md5(random()||clock_timestamp()),1,12))`)으로 코드를
만들어 `folder_invites`에 넣고 코드를 돌려준다. 따라서 `folder_invites`에는 클라이언트 직접 insert
정책을 두지 않는다(RPC 전용).

폴더 생성·이름변경·삭제, 맛집 CRUD는 RLS가 통제하는 직접 테이블 접근으로 처리한다(별도 RPC 불필요).

## 6. Edge Function / 과금

새 서버 함수는 필요 없다. 폴더·맛집·멤버·초대는 Supabase 테이블/RPC + RLS로 처리하므로 Google API
추가 호출이 없다. 저장 진입점 중 "장소 검색으로 추가"는 이미 있는 `geocode`(또는 장소 검색) 함수를
재활용한다. 추천 카드에서 저장할 때는 이미 받아 둔 추천 데이터를 그대로 스냅샷한다(추가 호출 없음).

## 7. 프론트엔드

### 7.1 라우트와 진입

- 새 라우트 `/places`(가칭). 로그인 필수 — 진입 시 세션이 익명/없음이면 로그인으로 유도한다.
- 헤더에 로그인 상태에서만 "내 맛집 지도" 링크를 노출한다.

### 7.2 화면 구성

- **폴더 선택** → 그 폴더의 저장 맛집만 지도에 핀으로 표시. 목록은 보조로 함께 보여준다.
- 내가 소유한 폴더와 공유받은 폴더를 함께 나열하되, 권한(뷰어/에디터)과 소유 여부를 표시한다.
- 핀/목록 항목을 누르면 상세(이름·주소·메모·Google 지도 링크)를 본다. editor는 메모 수정·삭제 가능.

### 7.3 저장 진입점

1. **추천 카드의 "폴더에 저장"**: 추천 결과에서 폴더를 골라 저장. 저장 시점의 이름/좌표/주소를
   스냅샷한다.
2. **장소 검색으로 추가**: 맛집 지도에서 가게 이름·주소를 검색해 직접 추가.

두 경로 모두 editor 이상 권한이 있는 폴더에만 저장할 수 있다.

### 7.4 공유 UI

- 폴더별 "공유"에서 **뷰어 코드**·**에디터 코드**를 발급·복사한다(재발급·삭제 가능).
- "코드로 폴더 참여" 입력으로 남의 폴더에 참여한다.

### 7.5 데이터 레이어

`CLAUDE.md`의 4파일 세트를 따른다: `lib/api/folders.ts` 등 API 함수, `lib/types/api/*.types.ts`
타입, `lib/hooks/queries|mutations/*` 훅. Supabase 직접 접근은 API 함수 레이어에만 둔다.

## 8. 단계 분리 (구현 순서)

- **Phase 1**: 그룹 폐기 + 폴더·맛집 CRUD + 지도/목록 + 추천 카드 저장 + 장소 검색 저장 (개인, 공유 없음)
- **Phase 2**: 초대코드 발급·참여 + 뷰어/에디터 권한 RLS + 공유 UI

각 Phase는 자체 마이그레이션·테스트로 독립 검증한다.

## 9. 검증 기준

| 항목          | 명령                                            | 기준       |
| ------------- | ----------------------------------------------- | ---------- |
| 타입          | `npm run typecheck`                             | 오류 0     |
| 린트          | `npm run lint`                                  | 경고 0     |
| 프론트 테스트 | `npm test`                                      | 전체 통과  |
| DB(RLS)       | `npx supabase db reset && npx supabase test db` | pgTAP 통과 |
| 빌드          | `npm run build`                                 | 성공       |

특히 RLS는 pgTAP으로 다음을 고정한다: 뷰어는 읽기만·쓰기 거부, editor는 쓰기 허용, 비멤버는 조회
거부, 익명은 전부 거부, 코드로만 멤버가 되는지.

## 10. 남는 과제 / 위험

- 폴더 삭제 시 `saved_places`·`folder_members`·`folder_invites`는 `on delete cascade`로 정리된다.
- 코드 유출 시 그 권한으로 누구나 참여할 수 있다. 소유자가 코드를 재발급(기존 코드 삭제)해 무효화한다.
- 스냅샷은 저장 시점 고정이라 가게 정보가 바뀌어도 갱신되지 않는다. 필요하면 "새로고침"으로 place_id
  기준 재조회하는 기능을 후속으로 둘 수 있다(v1 비목표).
