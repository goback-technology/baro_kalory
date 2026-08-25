// Vite 설정 — dev 서버와 dist 빌드를 Vite 가 맡는다(2026-08-22 React 전환).
// 무빌드 시절의 server.mjs·pack.mjs 는 2026-08-25 전 화면이 라우트가 되면서 함께 퇴역했다.
//
// 지켜야 하는 기존 계약:
//   - .env 의 BARO_* 이름 규칙 (주소를 저장소에 박지 않는다)
//   - /api/*·/home-frame/* 프록시 + `x-baro-upstream` 응답 헤더 (설정 화면이 「지금 어느
//     backend 를 보나」를 이 헤더로 읽는다)
//   - base "./" — 정적 배포에서는 저장소 이름이 base path 가 되므로 링크는 전부 상대경로
//   - 옛 주소(`<slug>.html`)는 리다이렉트 셸이 받는다 (플러그인 kalory-compat 이 발행한다)

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { kaloryCompat } from "./build/vite-kalory.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// server.mjs 와 같은 규칙: .env 는 있으면 읽고 없으면 조용히 기본값. 값은 커밋하지 않는다.
try { process.loadEnvFile(resolve(here, ".env")); } catch {}

const backend = process.env.BARO_BACKEND_URL || "http://127.0.0.1:8080";
// 화면(설정 탭)이 읽는 「지금 보는 backend」 라벨 — server.mjs 의 backendLabel 과 동일 규칙.
const backendUrl = new URL(backend);
const backendLabel = `${backendUrl.origin}${backendUrl.pathname.replace(/\/$/, "")}`;

const proxyRoute = {
  target: backend,            // 경로가 있으면 마운트 프리픽스로 그대로 이어 붙는다
  changeOrigin: true,         // Host 는 backend 가 아는 자기 이름 — 터널·가상호스트 라우팅
  configure(proxy) {
    proxy.on("proxyRes", (proxyRes) => { proxyRes.headers["x-baro-upstream"] = backendLabel; });
    proxy.on("error", (err, req, res) => {
      if (res && !res.headersSent && res.writeHead) {
        res.writeHead(502, { "content-type": "application/json", "x-baro-upstream": backendLabel });
        res.end(JSON.stringify({ error: `backend 에 연결할 수 없습니다 (${backendLabel})` }));
      }
    });
  },
};

export default defineConfig({
  // 셸이 사는 곳이 root — dist 가 root 를 미러하므로 URL 공간이 지금과 같다.
  root: join(here, "public"),
  base: "./",
  // Vite 의 publicDir 개념(무처리 복사)은 쓰지 않는다 — 우리 public/ 은 소스다.
  publicDir: false,
  plugins: [react(), kaloryCompat()],
  server: {
    // 파일럿이 왕복을 증명한 시점(2026-08-22)부터 BARO_FRONTEND_PORT 를 승계한다 —
    // pm2 상주(kalory-dev)가 이 포트로 뜬다. 값이 없으면 vite 기본(5173).
    // 808x/809x 는 UE 시뮬레이터 카메라 대역이라 피한다.
    port: Number(process.env.BARO_FRONTEND_PORT) || 5173,
    host: process.env.BARO_FRONTEND_HOST || "127.0.0.1",
    proxy: { "/api": proxyRoute, "/home-frame": proxyRoute },
  },
  build: {
    outDir: join(here, "dist"),
    emptyOutDir: true,
    // 진입점은 셸 하나다. 옛 주소는 문서가 아니라 **리다이렉트 셸**이라 번들 대상이 아니고,
    // closeBundle 이 발행한다(build/vite-kalory.mjs).
    rollupOptions: {
      input: { index: join(here, "public", "index.html") },
    },
  },
});
