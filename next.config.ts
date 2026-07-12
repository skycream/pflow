import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3(네이티브 모듈)는 번들링하지 않고 외부 패키지로 둔다.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
