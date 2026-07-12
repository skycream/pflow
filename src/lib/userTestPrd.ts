// 전체 사이트 유저테스트 PRD v2 (근거기반). 🕵️ 유저테스트 버튼이 이 텍스트를 세션에 주입한다.
// 출처: Playwright 공식 3-에이전트, NN/g 사용성 지표, SyntheticUsers(OCEAN·calibration), WCAG/axe, Nielsen 10원칙.
export const USERTEST_PRD = `이 프로젝트(웹사이트)를 아래 PRD에 따라 **전체 유저테스트**를 자율로 진행해줘. 4계층(자동 E2E·휴리스틱·합성 사용성·접근성)으로 측정 가능한 지표와 우선순위까지 내줘. 막히는 부분만 물어보고 나머지는 끝까지.

[사전조건] 대상 URL(로컬 dev 또는 배포; 없으면 먼저 띄워). Playwright MCP로 실제 브라우저 주행(없으면 알려줘). 시작 전 코드+실제 탐색으로 핵심 플로우 목록부터 파악.

[① 자동 E2E — Playwright Agents]
- 셋업: npx playwright init-agents --loop=claude
- Planner: 앱 탐색 + 이 PRD + seed.spec.ts → specs/*.md 테스트 계획
- Generator: specs/ → tests/ 실행코드(셀렉터·단언 라이브 검증, getByRole·expect(page).toHaveURL/Title)
- Healer: 실패 재생→UI 재검사→로케이터/대기 패치→통과까지 자가수정. trace:'on-first-retry'로 DOM+네트워크 trace 첨부.
- 커버리지: 해피패스 + 네거티브(잘못된 입력) + 엣지 + 반응형(모바일/데스크톱).

[② 휴리스틱 — Nielsen 10원칙] 시스템상태가시성/현실일치/사용자제어/일관성/에러예방/인식>회상/유연성/미니멀/에러복구/도움말 — 화면별 위반 채점.

[③ 합성 사용성 — Synthetic Users 방식] OCEAN(빅5)+감정상태로 페르소나 모델링(chain-of-feeling). 최소 3종: P1 초보·불안형, P2 효율·성급형, P3 접근성·신중형. 각자 think-aloud로 주행하며 작업 성공/실패·막힌 지점·헷갈린 문구·기대 불일치 기록. (합성유저는 낙관 편향 가능 — calibration 안 하면 집단적으로 틀림을 명시.)

[④ 접근성 — WCAG 2.2 AA] axe-core 자동 스캔 + 키보드 단독 내비 + 명도대비 + 포커스 순서.

[지표 — NN/g 4대 + 보조] Task Success Rate(핵심플로우≥90%), Time on Task(기준선 기록), Error Rate(P0 플로우 0), SEQ(과제직후 7점≥5.5), SUS(10문항 0~100, ≥68), 보조: 최적경로 이행률%·백트래킹 횟수. 표본: 정성 3~5, 정량 ~20런.

[심각도] P0 핵심플로우 차단(가입·결제 불가·500) / P1 주요 마찰·데이터손실 / P2 사용성저하·시각깨짐 / P3 사소.

[산출물] specs/*.md, tests/*, trace 파일, axe 리포트, 그리고 **USERTEST_REPORT.md**: 6지표 표 + 이슈표[P0~3 | 유형(버그/사용성/a11y/시각) | 위치(URL·요소) | 재현단계+trace/스크린샷 | 수정제안] + 페르소나 think-aloud 하이라이트 + 휴리스틱 위반 목록 + (빠른수정 vs 추후) 분류.

[수용기준] 핵심 플로우 E2E가 Healer까지 통과(trace 존재) / axe 위반 0 또는 전부 리포트+키보드만으로 핵심플로우 완주 / 페르소나 3종 각 success·SEQ 기록 / P0·P1은 재현단계+trace 포함.

[한계] 합성유저 실제대비 85~92% parity·완벽 아님 → 고위험·정서 평가는 실유저 소수(3~5)로 보완 권장. 부하/보안 침투·실결제 승인은 범위 밖.`;
