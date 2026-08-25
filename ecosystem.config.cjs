// pm2 설정. 루트 package.json 이 ESM(`"type": "module"`)이므로 확장자는 .cjs 여야 한다.
//
//   pm2 start ecosystem.config.cjs && pm2 save
//
// `pm2 save` 를 빠뜨리면 재부팅 후 사라진다 — 등록이 아니라 저장이 상주를 만든다.
//
// **설정값을 이 파일에 두지 않는다.** 포트·바인딩·backend 주소는 저장소 루트의 `.env` 가
// 유일한 출처이고, `vite.config.mjs` 가 스스로 읽는다(node 내장 loadEnvFile — 의존성 없음).
// pm2 의 `env` 로 같은 값을 주면 두 가지가 무너진다.
//   1. pm2 가 주는 값이 셸 환경으로 들어가 `.env` 를 덮는다(우선순위:
//      CLI > 환경변수 > .env). 즉 .env 를 고쳐도 안 듣는 상태가 된다.
//   2. 그 값이 `~/.pm2/dump.pm2` 에 복사돼 굳는다 — 이 저장소는 공개이고 backend 주소는
//      커밋하지 않는 것이 규칙인데, 주소의 사본이 저장소 밖에 조용히 하나 더 생긴다.
// 그래서 여기에는 **무엇을 띄우는가**만 적는다.
//
// 이 서버는 개발용 정적 서버 + API 프록시다(무인증). 기본 바인딩이 127.0.0.1 인 이유가
// 그것이므로, LAN 노출이 필요하면 `.env` 의 BARO_FRONTEND_HOST 를 명시적으로 바꾼다 —
// 여기에 --host 를 박아 두면 그 선택이 눈에 안 보이는 곳으로 숨는다.
//
// 프로세스만 관리한다 — 빌드는 pm2 의 일이 아니다. `public/app.css` 는 커밋하지 않는
// 산출물이므로 clone 직후에는 `pnpm build` 를 한 번 돌려야 UI 가 스타일을 갖는다.
const apps = [
  {
    // React 파일럿(2026-08-22)부터 개발 서버는 Vite 다(무빌드 server.mjs 는 2026-08-25 퇴역).
    // 이름의 「dev」가 곧 경고다: 이 프로세스는 개발 도구지 서비스가 아니다(kalory 는
    // 프런트 전용 저장소고 백엔드는 따로 있다 — 이름이 서비스처럼 읽혀 실제 혼동이 났었다).
    name: 'kalory-dev',
    script: 'node_modules/vite/bin/vite.js',
    cwd: __dirname,
    interpreter: 'node',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
    },
  },
];

module.exports = { apps };
