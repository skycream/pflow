"use client";

// Claude 응답/질문(마크다운)을 서식대로 렌더링.
// remark-gfm: 표/체크박스/취소선, rehype-highlight: 코드블록 구문강조(highlight.js).
// react-markdown은 기본적으로 raw HTML을 무시하므로 XSS 안전.
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// 링크 클릭 → 사파리 새 탭에서 열기. 대시보드가 그 주소로 넘어가지 않게 기본동작 막고 서버에 위임.
function openInSafari(e: React.MouseEvent<HTMLAnchorElement>, href?: string) {
  if (!href || !/^https?:\/\//i.test(href)) return; // http(s)만 가로챔
  e.preventDefault();
  fetch("/api/open-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: href }),
  }).catch(() => window.open(href, "_blank", "noopener")); // 실패 시 폴백
}

// 터미널 모드 글자색 — prose-invert 클래스 생성에 의존하지 않고 변수로 직접 밝게.
const TERMINAL_VARS = {
  color: "#e4e4e7",
  "--tw-prose-body": "#e4e4e7",
  "--tw-prose-headings": "#ffffff",
  "--tw-prose-bold": "#ffffff",
  "--tw-prose-links": "#93c5fd",
  "--tw-prose-bullets": "#a1a1aa",
  "--tw-prose-counters": "#a1a1aa",
  "--tw-prose-code": "#ffffff",
  "--tw-prose-quotes": "#d4d4d8",
  "--tw-prose-hr": "#3f3f46",
  "--tw-prose-quote-borders": "#3f3f46",
  "--tw-prose-th-borders": "#52525b",
  "--tw-prose-td-borders": "#3f3f46",
} as React.CSSProperties;

// memo: children(마크다운 원문)과 terminal이 그대로면 재파싱/재렌더를 건너뛴다.
// 입력창 타이핑 등으로 부모가 리렌더돼도 답변 마크다운은 다시 안 그린다.
export const Markdown = memo(function Markdown({
  children,
  terminal,
}: {
  children: string;
  terminal?: boolean;
}) {
  // terminal: 검은 배경 위 밝은 글씨(모노스페이스) — 터미널처럼.
  const cls = terminal
    ? "prose prose-sm max-w-none break-words font-mono prose-pre:bg-black/40"
    : "prose prose-sm dark:prose-invert max-w-none break-words prose-pre:bg-zinc-900 prose-pre:text-zinc-100";
  return (
    <div className={cls} style={terminal ? TERMINAL_VARS : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // 답변 속 링크는 클릭 시 사파리 새 탭에서 (plain URL도 remark-gfm이 자동 링크로 만듦)
          a: ({ node, href, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openInSafari(e, href)}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
