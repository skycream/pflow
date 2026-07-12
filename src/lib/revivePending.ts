// 죽은 세션을 되살릴 때 "기동 후 자동 전송할 메시지"를 잠깐 보관하는 큐.
// revive 라우트가 넣고, hook 라우트가 SessionStart 때 꺼내 주입한다.
// dev 서버 핫리로드에도 유지되도록 globalThis에 캐시.
const g = globalThis as unknown as { __revivePending?: Map<string, string> };
if (!g.__revivePending) g.__revivePending = new Map();

export const revivePending: Map<string, string> = g.__revivePending;
