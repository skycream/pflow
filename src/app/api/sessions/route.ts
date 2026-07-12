// 대시보드 초기 스냅샷. home(홈 루트)을 함께 줘서 주기작업/프로젝트를 구분한다.
import os from "node:os";
import { getSessions } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 항상 최신 DB 상태

export async function GET() {
  return Response.json({ sessions: getSessions(), home: os.homedir() });
}
