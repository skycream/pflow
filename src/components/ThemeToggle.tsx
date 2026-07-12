"use client";

import { useEffect, useState } from "react";

// 라이트/다크 토글. 기본 라이트, 선택은 localStorage에 저장.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem("theme") === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {dark ? "☀ 라이트" : "☾ 다크"}
    </button>
  );
}
