import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // better-sqlite3(네이티브 모듈)는 번들링하지 않고 외부 패키지로 둔다.
  serverExternalPackages: ["better-sqlite3"],
  // 워크스페이스 루트를 이 프로젝트로 고정한다.
  // 홈(~/)에 package-lock.json이 있으면 Next.js가 홈 전체를 루트로 오인해
  // 홈 폴더(수많은 프로젝트)를 통째로 스캔 → 컴파일이 28s~80s로 폭증한다.
  // CWD가 아닌 이 설정 파일 위치 기준의 절대 경로여야 어디서 실행해도 안전하다.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
