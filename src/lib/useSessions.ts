"use client";

// 세션 목록 + 실시간(SSE) + 상대시간 틱을 한 번에 제공하는 공통 훅.
// 메인 보드와 데모 레이아웃들이 동일한 라이브 데이터를 공유한다.
import { useEffect, useState } from "react";
import type { SessionRow } from "@/lib/db";
import { STATUS_WEIGHT } from "@/lib/status";

function sortSessions(rows: SessionRow[]): SessionRow[] {
  return [...rows].sort(
    (a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status] || b.last_event_at - a.last_event_at,
  );
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [home, setHome] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((d) => {
        setSessions(d.sessions ?? []);
        setHome(d.home ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.__deleted) {
        setSessions((prev) => prev.filter((s) => s.session_id !== data.__deleted));
        return;
      }
      const row: SessionRow = data;
      setSessions((prev) => {
        const map = new Map(prev.map((s) => [s.session_id, s]));
        map.set(row.session_id, row);
        return sortSessions([...map.values()]);
      });
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  return { sessions, home, now };
}
