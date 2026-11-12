# Workday

A local web app for daily work-log entries. It runs on your machine and is reachable only from it.

## Requirements

- Node 22 (see `.nvmrc`) and npm

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
```

## Move the board from NOIS Workday (Windows)

The first Jira poll only takes a baseline, so a new board starts empty. To carry over the NOIS Workday Tasks board
(Working, Done, dismissed and the seen keys), stop the server and run:

```sh
node scripts/import-noisworkday-board.mjs
```

It keeps the old file as `board.json.before-import`.

## Data directory

Per-user data (`config.json`, `secrets.json`, `board.json`) goes under `WORKDAY_DATA_DIR` when set, else:

- Windows: `%AppData%\Workday`
- Linux and others: `$XDG_DATA_HOME/workday`, default `~/.local/share/workday`

A corrupt file is kept as `<file>.bad` and replaced by defaults; it never stops the server.
