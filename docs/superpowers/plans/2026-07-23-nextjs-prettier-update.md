# Next.js 패치 및 Prettier 설정 적용 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 취약한 Next.js 패치 버전을 갱신하고 명시적인 Prettier 규칙을 전체 프로젝트에 적용한다.

**Architecture:** 애플리케이션 구조는 변경하지 않는다. 패키지 버전과 포맷 설정만 변경하고, Prettier로 추적 파일을 정규화한 뒤 기존 테스트와 타입 검사로 동작 보존을 확인한다.

**Tech Stack:** Next.js 15.5.21, React 19, TypeScript 5.8, Prettier 3.9.6, Vitest 3.2

## Global Constraints

- `next`와 `eslint-config-next`는 동일한 `15.5.21` 버전을 사용한다.
- Prettier는 `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `tabWidth: 2`, `useTabs: false`, `printWidth: 100`, `bracketSpacing: true`, `arrowParens: "always"`, `endOfLine: "lf"`를 사용한다.
- Next.js 메이저 버전, 애플리케이션 기능, 데이터 모델은 변경하지 않는다.
- 설계 근거는 `docs/superpowers/specs/2026-07-23-nextjs-prettier-update-design.md`를 따른다.

---

### Task 1: Next.js 보안 패치 적용

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: npm 패키지 레지스트리와 기존 `package-lock.json`
- Produces: `next@15.5.21`, `eslint-config-next@15.5.21`이 고정된 의존성 트리

- [ ] **Step 1: 현재 보안 감사 실패를 재현한다**

Run: `npm audit --audit-level=moderate`

Expected: FAIL이며 `next@15.5.20`, `postcss@8.4.31`, `sharp@0.34.5` 관련 취약점이 보고된다.

- [ ] **Step 2: Next.js 런타임 패치를 설치한다**

Run: `npm install next@15.5.21`

Expected: `package.json`과 `package-lock.json`의 Next.js 버전이 `15.5.21`로 갱신된다.

- [ ] **Step 3: ESLint용 Next.js 설정 버전을 맞춘다**

Run: `npm install --save-dev eslint-config-next@15.5.21`

Expected: `next`와 `eslint-config-next`가 동일한 패치 버전을 사용한다.

- [ ] **Step 4: Next.js advisory 제거 여부를 확인한다**

Run: `npm audit --json`

Expected: `next`의 `>=13.0.0 <15.5.21` 범위 advisory가 더 이상 보고되지 않는다. 별도 간접 의존성 advisory가 남으면 임의 수정하지 않고 결과에 기록한다.

- [ ] **Step 5: 의존성 변경을 커밋한다**

```bash
git add package.json package-lock.json
git commit -m "fix: Next.js 보안 패치 적용"
```

### Task 2: Prettier 규칙 명시 및 전체 포맷 적용

**Files:**
- Create: `.prettierrc.json`
- Modify: Prettier가 지원하는 프로젝트 내 추적 파일

**Interfaces:**
- Consumes: `package.json`의 `format`, `format:check` 스크립트와 `.prettierignore`
- Produces: 로컬과 CI에서 동일하게 재현되는 코드 포맷

- [ ] **Step 1: Prettier 설정 파일을 추가한다**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "useTabs": false,
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 2: 새 규칙이 기존 파일과 불일치함을 확인한다**

Run: `npm run format:check`

Expected: FAIL이며 새 규칙과 다른 파일 경로가 출력된다.

- [ ] **Step 3: 전체 프로젝트에 규칙을 적용한다**

Run: `npm run format`

Expected: `.prettierignore` 대상 외의 지원 파일이 새 규칙으로 정규화된다.

- [ ] **Step 4: 포맷 검사를 통과시킨다**

Run: `npm run format:check`

Expected: PASS이며 `All matched files use Prettier code style!`가 출력된다.

- [ ] **Step 5: 포맷 변경을 커밋한다**

```bash
git add .prettierrc.json .prettierignore package.json package-lock.json app components docs lib supabase tests eslint.config.mjs middleware.ts middleware.test.ts next.config.ts vitest.config.ts vitest.setup.ts
git commit -m "style: Prettier 규칙을 전체 프로젝트에 적용"
```

### Task 3: 회귀 및 최종 상태 검증

**Files:**
- Verify: 전체 작업 트리

**Interfaces:**
- Consumes: Task 1과 Task 2의 변경 결과
- Produces: 포맷, 테스트, 타입, 보안 감사 결과

- [ ] **Step 1: 전체 테스트를 실행한다**

Run: `npm test`

Expected: 12개 테스트 파일과 52개 테스트가 모두 통과한다.

- [ ] **Step 2: TypeScript 타입 검사를 실행한다**

Run: `npm run typecheck`

Expected: 오류 없이 종료 코드 0을 반환한다.

- [ ] **Step 3: 포맷과 diff 무결성을 다시 검사한다**

Run: `npm run format:check`

Expected: 모든 대상 파일이 Prettier 규칙을 따른다.

Run: `git diff --check`

Expected: 공백 오류 없이 종료 코드 0을 반환한다.

- [ ] **Step 4: 설치된 버전과 남은 취약점을 기록한다**

Run: `npm ls next eslint-config-next prettier postcss sharp`

Expected: 직접 의존성 버전과 남은 간접 의존성 경로가 출력된다.

Run: `npm audit --json`

Expected: Next.js `15.5.21` 미만 advisory는 제거되어 있다. 남은 advisory가 있으면 패키지, 심각도, 현재 코드 노출 여부를 최종 보고에 포함한다.
