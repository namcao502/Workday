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
- `packages/client` (`@workday/client`): Vite + React UI built on HeroUI + Tailwind; `src/ui/` holds the shared components, hand-written CSS remains only for the Claude pane and rendered content.

`@workday/core` exports a `development` condition pointing at `src`, so dev and tests need no core build;
`npm start` uses the built `dist`.

Each package has two tsconfigs: `tsconfig.json` (noEmit, includes tests; used by typecheck and lint) and
`tsconfig.build.json` (composite, no tests). `npm run dev` sets `WORKDAY_DEV=1` via `packages/server/dev.env`
(adds Vite's port to the allowed hosts); both `dev` and `start` read a root `.env` if present.

## How the pieces fit

- `packages/server/src/services.ts` wires everything (`createServices`), shared by `main.ts` and the tests
  (`src/testing/testApp.ts`, `src/testing/fakes.ts`). `main.ts` calls `settings.start()` after `listen`.
- State-owning services (`BoardService`) run every mutation through one serial `Promise` chain, save to disk
  first, then swap the in-memory state and broadcast. Core functions return the same object when nothing
  changed, so the service compares with `!==` to decide whether to save.
- WebSocket events (`/api/events`, `ServerEvent` in `core/src/api.ts`) carry no data: the client refetches
  through `@tanstack/react-query`.
- `SettingsService.apply` rebuilds the adapters (e.g. `JiraTracker`) and restarts the scheduler when config
  or a secret changes. A saved secret is only ever sent to the URL it was saved with.
- The server never sends display text: errors are `AppError` codes, translated in `packages/client/src/errors.ts`
  with `t(en, vi)` (`i18n.ts`).
- Per-user JSON files (`config.json`, `secrets.json`, `board.json`) go through `jsonFile.ts`: runtime-validated
  parse, atomic write, a corrupt file renamed to `<file>.bad`. Data dir: `dataDir.ts` (`WORKDAY_DATA_DIR` overrides).
  Everything the server writes lives in the data dir (browser profiles, hook files, scan logs, `tmp/` for Teams
  hand-offs); secrets belong in the encrypted `secrets.json`, the `WORKDAY_*` env variables are only overrides.
- The C# app in `C:\Project\NoisWorkday` is the spec being ported phase by phase; its tests become Vitest tests.
  Plans and impl notes per phase live in `docs/<slug>/` (`plan.md` has the phase roadmap in `docs/web-foundation/`).

## Rules

- Core does no I/O: no fs, network, clock or env access; those arrive as arguments or port implementations.
- Every company-specific value (URLs, project keys, names) lives in config, never in code.
- Each integration is an interface in `packages/core/src/ports`; adapters live in the server.
- The server listens on 127.0.0.1 only and rejects a foreign `Host` or WebSocket `Origin`
  (`packages/server/src/security/allowedHosts.ts`).
- A remote request (via the tunnel) must carry a valid Cloudflare Access JWT, come from a paired device,
  and have the right the route declares in `config.access`. A route with no `config.access` is local-only.
- No `any` (lint error). English, ASCII punctuation in code, comments and docs.
