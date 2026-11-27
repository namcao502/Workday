# Workday

A local web app that keeps a developer's day in one window: the Jira tickets, their pull requests, a Claude Code
session per ticket, the Teams threads about them, and the daily work log to HRM and the TSC sheet. It runs on your
own machine, listens on 127.0.0.1 only, and comes with a Windows desktop shell (tray, notifications, auto-start). A
paired phone can reach it over a VPN or a Cloudflare tunnel.

- [Features](#features)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Windows desktop app](#windows-desktop-app)
- [Remote access from a phone](#remote-access-from-a-phone)
- [Moving to another PC](#moving-to-another-pc)
- [Another project or company](#another-project-or-company)
- [Development](#development)
- [Testing and CI](#testing-and-ci)
- [Repository layout](#repository-layout)
- [How it works](#how-it-works)

## Features

- **Tickets**: the Jira board in four views (Working, Available tickets to take, Done, Dismissed). A **To do**
  section above every view gathers what waits on you: Claude waiting, Teams messages, new PR comments, QC bugs,
  tickets ready to move on. Each row shows its pull requests' state from Azure DevOps; **Start** creates the ticket's
  worktree and starts Claude on it.
- **Workspace**: a tab per ticket. The ticket's Claude (Claude Agent SDK) sits on the right; the left shows the
  ticket's **Files**, its **Changes** (the branch diff with the PR comments in place) or its **Teams** post and chats,
  with suggested replies.
- **Timesheet**: queue tickets for a day and they are logged to TSC and HRM at the auto-log time (6:00 PM by
  default). A week table shows HRM and TSC per day, the totals and what is still missing, with a card per day below.
- **Insights**: per ticket over a date range: HRM hours, Claude sessions, turns, time and tokens, commits, files and
  lines, a by-day chart, and each ticket's Claude detail (skills, tools, subagents, compacts).
- **Settings**: one entry per page beside a two-level menu, with a dot on the integrations that are set up.

Around them: a notice bell with per-topic toasts, desktop and phone notifications; English and Vietnamese; light and
dark themes with seasonal backgrounds; an in-app guide (Settings > Guide).

## Requirements

- **Windows 10 or 11.** Linux scripts exist in `deploy/linux` but are untested.
- **Node 22** and npm (see `.nvmrc`).
- **Git**, and a clone of the dev repo the tickets are worked in.
- **Microsoft Edge**: Playwright drives it for the TSC and Teams sign-ins.
- **Claude Code**, signed in on the machine: the Workspace chat runs on the Claude Agent SDK.
- **.NET 10 SDK**, only to build the desktop shell.

## Getting started

```sh
npm install
npm run build
npm start
```

Open http://127.0.0.1:4870, then fill in **Settings > Integrations > Jira** (site URL, email, API token from
id.atlassian.com > Security > API tokens) and **Settings > Work > Timesheet** (HRM key, TSC share link). Everything
else is optional and has defaults.

For day-to-day use, install the [desktop app](#windows-desktop-app) instead of running `npm start` by hand.

## Configuration

### Data directory

Everything the server writes lives in one folder:

- Windows: `%AppData%\Workday`
- Linux and others: `$XDG_DATA_HOME/workday`, default `~/.local/share/workday`
- `WORKDAY_DATA_DIR` overrides both.

It holds `config.json` (the settings), `secrets.json` (tokens, encrypted with `master.key` beside it), `board.json`
and the other state files, the browser profiles for TSC and Teams, and the logs. Each JSON file is validated when
read and written atomically; a corrupt one is kept as `<file>.bad` and replaced by defaults, so it never stops the
server.

Most settings are edited in the app. `config.json` also holds a few that have no screen: `port` (default 4870),
`host` (`127.0.0.1` or `localhost`; anything else exits with "Remote access is not available yet") and `timeZone`
(default `Asia/Ho_Chi_Minh`).

### Environment variables

`npm start` and `npm run dev` read a `.env` file at the repo root when there is one (gitignored; never commit it).
All of these are optional overrides; secrets normally live in `secrets.json`, saved from Settings.

| Variable                 | Effect                                                                            |
| ------------------------ | --------------------------------------------------------------------------------- |
| `WORKDAY_JIRA_API_TOKEN` | Jira API token; wins over the saved one and locks its box in Settings             |
| `WORKDAY_HRM_API_KEY`    | HRM API key, the same way                                                         |
| `WORKDAY_ADO_PAT`        | Azure DevOps personal access token                                                |
| `WORKDAY_TUNNEL_TOKEN`   | Cloudflare tunnel token                                                           |
| `WORKDAY_MASTER_KEY`     | base64 key for `secrets.json`; wins over `master.key` in the data dir             |
| `WORKDAY_MS_GRAPH_TOKEN` | a Microsoft Graph token that replaces the TSC sign-in (a machine with no display) |
| `WORKDAY_PORT`           | the port, over `config.json`                                                      |
| `WORKDAY_DATA_DIR`       | the data directory                                                                |

## Windows desktop app

```powershell
powershell -File deploy/windows/install-desktop.ps1
```

This builds the WinForms + WebView2 shell (`desktop/WorkdayDesktop`) into `%LOCALAPPDATA%\Programs\Workday` and adds
a **Workday** Start Menu shortcut; `-Remove` uninstalls it. The app starts the server from this repo, shows the UI in
its own window and stays in the tray. The tray menu: open Workday, start with Windows, restart the server if it stops,
**Build & restart server** (after a `git pull`), **Update desktop app** (runs the script above again), the server log,
and quit.

## Remote access from a phone

The server only listens on 127.0.0.1. A phone gets in one of two ways, both set up in **Settings > Remote access**,
and both only for a device you paired:

- **VPN**: an HTTPS listener on the PC's VPN address (default port 8443) that accepts only the allowed IP ranges.
  The PC makes its own certificate authority; the phone installs it once from a plain-HTTP setup page (port 8444,
  open only while pairing). Settings can open the Windows firewall for both ports.
- **Cloudflare**: a Cloudflare tunnel with Cloudflare Access in front; every request must carry a valid Access JWT.

Both can run together. Pairing shows a QR code; the phone then gets the full app (installable as a web app) and can
receive push notifications. **Settings > Remote access > Devices** lists the paired devices, their activity, and
revokes them.

## Moving to another PC

**Settings > General > Backup & move to another PC** exports the whole data dir (settings, encrypted secrets with the
key that opens them, the board and its history) to one `.wdbackup` file locked with a password of 8 characters or
more. On the new PC, import it in the same place and restart; the files it replaces are kept in
`before-import-<stamp>/`. Keep the file and the password apart: together they open your tokens.

Sign-ins do not move: sign in again under **Work > Timesheet** (TSC) and **Integrations > Teams**.

## Another project or company

Every company-specific value is a setting, so a new project is mostly Settings. Start from an empty data dir, not a
copy of someone else's: a copied config keeps signing in to their systems.

| What                                    | Where in Settings           | Off when                    |
| --------------------------------------- | --------------------------- | --------------------------- |
| Jira site, email, token, key prefix     | Integrations > Jira         | required                    |
| Board queries, field ids, status flow   | Jira > Advanced             | defaults apply              |
| Available to take queries               | Jira > Advanced             | the three queries are empty |
| Azure DevOps org, project, repos, PAT   | Integrations > Azure DevOps | org or project is empty     |
| Teams channels, posts, DB review        | Integrations > Teams        | no `Team > Channel` line    |
| HRM, TSC, log time                      | Work > Timesheet            | a required field is empty   |
| Public holidays (default: Vietnam's)    | Work > Public holidays      |                             |
| Dev repo, sibling repos, start prompt   | Work > Workspace            |                             |
| Knowledge scan command                  | Work > Schedules            | not set                     |
| `timeZone` (default `Asia/Ho_Chi_Minh`) | `config.json` only          |                             |

HRM and TSC are NOIS systems; elsewhere leave them empty and the Timesheet page has nothing to log to.

Still built in, so a project that differs needs a code change:

- Jira is the only tracker and Azure DevOps the only PR host (`packages/core/src/ports`).
- Two PRs per ticket: branch `<KEY>` into `main` and `<KEY>-dev` into `development`
  (`server/src/azureDevOps/adoClient.ts`, `server/src/prs/prPass.ts`, `core/src/prTracking.ts`,
  `core/src/gitParse.ts`).
- Ticket notes in `<dev repo>/docs/<KEY>/`, written by the Claude skills of the dev repo (`teams-post.md`,
  `teams-analysis.json`).
- The Teams thread analysis asks Claude for Vietnamese replies (`server/src/teams/teamsAnalysis.ts`).
- The in-app guide (`packages/client/src/guide/`) describes NOIS's setup.

## Development

```sh
npm run dev
```

Open http://localhost:5173. Vite serves the UI with hot reload and proxies `/api` (the WebSocket too) to the server
on port 4870, which restarts on every change (`node --watch`). The dev server adds Vite's port to the allowed hosts.

| Command                 | Does                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm run dev`           | server + Vite client in watch mode                                       |
| `npm run build`         | `tsc -b` for core and server, then the client's typecheck and Vite build |
| `npm start`             | the built server, serving the built client                               |
| `npm test`              | the unit and integration tests of core, server and client (Vitest)       |
| `npm run test:coverage` | the same with v8 coverage; HTML report in `packages/*/coverage/`         |
| `npm run test:e2e`      | end-to-end tests against the built app (run `npm run build` first)       |
| `npm run typecheck`     | `tsc` in every workspace                                                 |
| `npm run lint`          | ESLint, `strictTypeChecked`, no `any`                                    |
| `npm run format`        | Prettier over the repo                                                   |

One workspace, file or test:

```sh
npm test -w @workday/server
npx vitest run packages/server/src/app.test.ts
npx vitest run -t "health returns ok" --root packages/server
dotnet test desktop/WorkdayDesktop.Tests
```

Run the client tests from `packages/client` (or with `--root packages/client`): from the repo root they miss the
jsdom setup. All UI text lives in `packages/client/src/i18n/en.ts` and `vi.ts`; add every new key to both (`vi` is
typed against `en`, so a missing one fails the typecheck).

## Testing and CI

- **Unit and integration tests** sit next to the code (`*.test.ts`, `*.test.tsx`). The server runs its routes
  against fakes of every integration (`packages/server/src/testing/`); the browser sniffers and the Claude SDK
  adapter run against a fake Playwright context and a mocked SDK.
- **End-to-end tests** (`packages/e2e`, `*.e2e.ts`) start the built server on a free port with an empty data dir, so
  no Jira, Teams, HRM or TSC is touched, and drive Edge headless through the pages.
- **Desktop tests**: xUnit in `desktop/WorkdayDesktop.Tests`.
- **CI** (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request, on Windows: Prettier check,
  lint, typecheck, tests, build and the end-to-end tests; and the desktop tests in a second job.

## Repository layout

```
packages/
  core/      domain logic and the port interfaces, no I/O (@workday/core)
  server/    Fastify app, REST + WebSocket, the adapters for the ports (@workday/server)
  client/    React UI on HeroUI + Tailwind (@workday/client)
  e2e/       end-to-end tests (@workday/e2e)
desktop/
  WorkdayDesktop/        .NET WinForms + WebView2 shell
  WorkdayDesktop.Tests/  its tests
deploy/
  windows/install-desktop.ps1   builds and installs the desktop shell
  linux/                        systemd user unit (untested)
scripts/                        dev helpers
.github/workflows/ci.yml        CI
```

Inside each package, code is grouped by feature: `server/src/jira`, `hrm`, `tsc`, `teams`, `workspace`, `remote`,
`timesheet`, `prs`, ...; `client/src/board`, `workspace`, `timesheet`, `insights`, `settings`, with shared pieces in
`client/src/ui`, `shell` and `api`.

## How it works

- **Ports and adapters.** Core holds the logic and an interface per outside system: `ticketTracker` (Jira),
  `hoursLog` (HRM), `sheetLog` (TSC), `pullRequests` (Azure DevOps), `teamsChat` and `claudeAgent`. The server
  implements them; core never touches the file system, network, clock or environment, so it is tested on its own.
- **One wiring point.** `packages/server/src/services.ts` builds every service; `main.ts` and the tests share it.
- **State changes in order.** A service runs each change through one serial chain: save to disk first, then swap the
  in-memory state, then broadcast.
- **Thin events.** The WebSocket (`/api/events`) only says what changed; the client refetches it through React Query.
- **No display text from the server.** Errors are codes; the client translates them.
- **Security.** The server rejects a foreign `Host` or WebSocket `Origin` (DNS rebinding). A remote request needs a
  paired device, plus a valid Cloudflare Access JWT over the tunnel or an allowed IP range over the VPN. A saved
  secret is only ever sent to the URL it was saved for.
- **Claude.** Each Workspace session is an Agent SDK session; permission, question and plan prompts come through
  `canUseTool` and wait in the UI. The chat history is read from Claude's own transcript.

More detail for contributors: [CLAUDE.md](CLAUDE.md).
