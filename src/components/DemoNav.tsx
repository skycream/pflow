"use client";

// 레이아웃 비교용 상단 네비. 메인(2-pane)과 데모 3종을 오갈 수 있다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  { href: "/", label: "메인 · 2-pane" },
  { href: "/demo/kanban", label: "칸반" },
  { href: "/demo/wall", label: "전광판" },
  { href: "/demo/feed", label: "피드" },
];

export function DemoNav() {
  const path = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-700">
      <span className="mr-1 text-sm font-bold tracking-tight text-zinc-900 dark:text-white">
        project_flow
      </span>
      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        레이아웃 비교
      </span>
      <nav className="flex items-center gap-1 text-sm">
        {LINKS.map((l) => {
          const active = path === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-2.5 py-1 font-medium ${
                active
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
