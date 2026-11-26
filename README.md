# Workday

A local web app for daily work-log entries. It runs on your machine and listens on 127.0.0.1 only. Optional remote access goes through a Cloudflare tunnel
(paired devices only). VPN mode is the alternative: an HTTPS listener on the PC's VPN
address (default port 8443) that accepts only the allowed IP ranges and paired devices, with a self-made CA the phone
installs once from a plain-HTTP setup page (port 8444, open only while pairing). Settings can open the Windows
firewall for both ports. Cloudflare stays fully supported; both can run together.

## Requirements

- Node 22 (see `.nvmrc`) and npm
- Microsoft Edge (Playwright drives it for the TSC and Teams sign-ins)
- Claude Code sign-in on the machine (the Workspace chat runs on the Claude Agent SDK)

## Install

```sh
npm install
```

## Run in development

```sh
npm run dev
```

Open http://localhost:5173. Vite serves the UI and proxies `/api` (including the WebSocket) to the server
on port 4870.

## Build and start

```sh
npm run build
npm start
```

Open http://127.0.0.1:4870. The port and host come from `config.json` (host must be `127.0.0.1` or
`localhost`; anything else exits with "Remote access is not available yet"). `WORKDAY_PORT` overrides the port.

## Secrets: `.env`

`npm start` and `npm run dev` load a `.env` file at the repo root when it exists (gitignored by `.env*`; never
commit it). `WORKDAY_JIRA_API_TOKEN` there wins over a token saved in Settings, and locks the token box.

```sh
WORKDAY_JIRA_API_TOKEN=<your Jira API token>
WORKDAY_HRM_API_KEY=<your HRM API key>
```

Other overrides, all optional: `WORKDAY_ADO_PAT` (Azure DevOps), `WORKDAY_TUNNEL_TOKEN` (Cloudflare tunnel),
`WORKDAY_MASTER_KEY` (base64 key for `secrets.json`, wins over `master.key` in the data dir).
`WORKDAY_MS_GRAPH_TOKEN` (env only) replaces the TSC token sniff, for a machine without a display.

## Windows desktop app

`powershell -File deploy/windows/install-desktop.ps1` publishes the WinForms + WebView2 shell to
`%LOCALAPPDATA%\Programs\Workday` with a Start Menu shortcut (`-Remove` uninstalls). It starts the server, lives in
the tray (start with Windows, build and restart the server, update the desktop app) and shows the UI in its own window.

Linux (systemd user unit): `deploy/linux/install.sh` and `deploy/linux/workday.service`.

## Data directory

Per-user data (`config.json`, `secrets.json`, `board.json`) goes under `WORKDAY_DATA_DIR` when set, else:

- Windows: `%AppData%\Workday`
- Linux and others: `$XDG_DATA_HOME/workday`, default `~/.local/share/workday`

A corrupt file is kept as `<file>.bad` and replaced by defaults; it never stops the server.

## Moving to another PC

Settings > General > **Backup & move to another PC** exports the whole data dir (config, encrypted secrets, board,
history and the key that opens `secrets.json`) into one `.wdbackup` file locked with a password (8 characters or more).
On the new PC, import it in the same place and restart; the files it replaces are kept in `before-import-<stamp>/`.
Sign-ins (TSC, Teams) do not move: sign in again from Settings > Work > Timesheet and Settings > Integrations > Teams.

## Another project or company

Every company value is in config, so a new project is mostly Settings (or `config.json` in the data dir). Start from
an empty data dir rather than a copy of someone else's: a copied config keeps signing in to their systems.

| What                                    | Where                       | Off when                    |
| --------------------------------------- | --------------------------- | --------------------------- |
| Jira site, email, token, key prefix     | Integrations > Connections  | required                    |
| Board queries, field ids, status flow   | Connections > Advanced      | defaults apply              |
| Available to take queries               | Connections > Advanced      | the three queries are empty |
| Azure DevOps org, project, repos, PAT   | Integrations > Azure DevOps | org or project is empty     |
| Teams channels, posts, DB review        | Integrations > Teams        | no `Team > Channel` line    |
| HRM, TSC, log time                      | Work > Timesheet            | a required field is empty   |
| Public holidays (default: Vietnam's)    | Work > Public holidays      |                             |
| Dev repo, sibling repos, start prompt   | Work > Workspace            |                             |
| Knowledge scan command                  | Work > Schedules            | not set                     |
| `timeZone` (default `Asia/Ho_Chi_Minh`) | `config.json` only          |                             |

HRM and TSC are NOIS systems; another company leaves them empty, and the Timesheet page then has nothing to log to.

Still built in, so a project that differs needs a code change:

- Jira is the only tracker and Azure DevOps the only PR host (`packages/core/src/ports`).
- Two PRs per ticket: branch `<KEY>` into `main` and `<KEY>-dev` into `development` (`server/src/azureDevOps/adoClient.ts`,
  `server/src/prs/prPass.ts`, `core/src/prTracking.ts`, `core/src/gitParse.ts`).
- Ticket notes in `<dev repo>/docs/<KEY>/`, written by the Claude skills of the dev repo (`teams-post.md`,
  `teams-analysis.json`).
- The Teams thread analysis asks Claude for Vietnamese replies (`server/src/teams/teamsAnalysis.ts`).
- The in-app guide (`packages/client/src/guide/`) describes NOIS's setup.
