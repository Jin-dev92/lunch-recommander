# Next.js 패치 및 Prettier 설정 적용 설계

## 목적

- 보안 취약점이 보고된 `next@15.5.20`을 수정 버전인 `15.5.21` 이상으로 올린다.
- 팀에서 일관되게 사용할 수 있는 일반적인 TypeScript 웹 프로젝트용 Prettier 규칙을 명시한다.
- 설정을 전체 코드에 적용하고 기존 동작이 유지되는지 검증한다.

## 변경 범위

- `next`와 `eslint-config-next`를 동일한 `15.5.21` 버전으로 갱신한다.
- `.prettierrc.json`에 다음 규칙을 추가한다.
  - `semi: true`
  - `singleQuote: true`
  - `trailingComma: "all"`
  - `tabWidth: 2`
  - `useTabs: false`
  - `printWidth: 100`
  - `bracketSpacing: true`
  - `arrowParens: "always"`
  - `endOfLine: "lf"`
- 기존 `.prettierignore`, `format`, `format:check` 구성을 유지한다.
- Prettier가 지원하는 추적 파일 전체에 설정을 적용한다.

## 제외 범위

- Next.js 메이저 버전 업그레이드
- 애플리케이션 기능 및 데이터 모델 변경
- `npm audit`에서 새롭게 발견되는 별도 취약점의 임의 수정

## 검증 기준

- `npm run format:check`가 통과한다.
- 전체 Vitest 테스트가 통과한다.
- TypeScript 타입 검사가 통과한다.
- `npm audit`에서 기존 Next.js `15.5.21` 미만 취약점이 제거된다.
- `git diff --check`가 통과한다.
