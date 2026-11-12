# CLAUDE.md

Workday: a local web app (Node 22, TypeScript) that replaces a Windows tray app for daily work-log entries.
Plan notes live in `docs/web-foundation/`.

## Commands

Run from the repo root.

```sh
npm install
npm run dev        # server (tsx watch, port 4870) + Vite client (port 5173)
npm run build      # tsc -b for core + server, then vite build
npm start          # node --env-file-if-exists=.env packages/server/dist/main.js (serves packages/client/dist)
npm test           # all three workspaces
npm run typecheck
npm run lint
npm run format

# One workspace / one test file / one test
npm test -w @workday/server
npx vitest run packages/server/src/app.test.ts
npx vitest run -t "health returns ok" --root packages/server
```

## Layout

- `packages/core` (`@workday/core`): domain logic and the port interfaces. No I/O.
- `packages/server` (`@workday/server`): Fastify app (`createApp(deps)`), REST + WebSocket, adapters for the ports.
- `packages/client` (`@workday/client`): Vite + React UI.

`@workday/core` exports a `development` condition pointing at `src`, so dev and tests need no core build;
`npm start` uses the built `dist`.

## Rules

- Core does no I/O: no fs, network, clock or env access; those arrive as arguments or port implementations.
- Every company-specific value (URLs, project keys, names) lives in config, never in code.
- Each integration is an interface in `packages/core/src/ports`; adapters live in the server.
- The server listens on 127.0.0.1 only and rejects a foreign `Host` or WebSocket `Origin`
  (`packages/server/src/security/allowedHosts.ts`). Keep that until sign-in exists.
- No `any` (lint error). English, ASCII punctuation in code, comments and docs.
