# NOIS Workday guide

NOIS Workday logs your daily work to **TSC** (the shared Excel sheet) and **HRM**, and keeps your Jira tickets, pull requests,
Claude sessions and Teams threads in one window.

## Getting around

- The **sidebar** on the left switches pages: Tickets, Workspace, Timesheet, Insights, and Settings at the bottom. The ☰
  button at the top left folds it to icons.
- The **top bar** holds each page's own controls (view switch, search, buttons, status) next to the page title.
- At the top right: the **bell** with your notices; while work runs in the background the bell turns into a spinning circle,
  and the work is listed under **Running now** at the top of the notices.
- Esc clears the text box you are typing in.

## Tickets: the ticket board

The top bar of the Tickets page, left to right: the view switch, the search box, **Check now**, then when Jira was last
checked. The views, each with its count: **To do**, **Working** (the default), **Available**, **Done** and **Dismissed**.
A dot on To do means something waits on you; a dot on Available means an urgent ticket to take (High, or due within 2 days)
you have not looked at yet.

- The search box filters every view, the to-do groups and the tickets to take (every word must match); the counts follow
  it, and when the view you are on has no hit the board shows the first one that has. Type or paste a ticket key or Jira
  link that is not on the board and **Add** puts it there. A ticket's own sub-branch with no Jira issue, typed as its
  branch name (`MDP-9430-phase-2`), is added the same way: its row takes the ticket's summary, Start and Open give it its
  own worktree and tab, and its time is logged to the ticket.
- **Check now** reads Jira and the PRs at once; otherwise it happens every few minutes (Settings > Work > Schedules).
- **Working** lists your tickets, earliest due first; **Done** and **Dismissed** the most recently updated first. Each row:
  KEY (opens Jira), SUMMARY, PR, STATUS, DUE, ETA, P (dev priority), then the ⋮ menu. Hover a cell for details.
  - PR: one button for all the ticket's PRs, its dot and word the worst state: green merged, blue approved, gray waiting,
    orange needs work, red blocked (build failed, conflict, rejected), gray abandoned; an orange comment mark counts the
    open comments. Click it for each PR (repo, branch, state) with a link to Azure DevOps.
  - The ⋮ menu: **Start** and **Open** (Working), **Ready to Test** (when the ticket can move there), **Done**, **Reopen**
    (Done), **Dismiss**, **Restore** (Dismissed).
- **Start** creates the ticket's worktree, opens its tab in Workspace with Claude running the start prompt, and queues it
  for today. A sub-task's worktree starts from its parent's branch; until the lead pushes that branch, Start says so and
  makes no worktree. A ticket newly assigned to you is started this way by itself at the next Jira check.
- **Ready to Test** asks first. You rarely need it: once the dev PRs merge the app moves the ticket along the Ready to Test
  path set in Settings by itself (a notice says so; a failed move says why).
- **To do** groups what waits on you by ticket, each item with its own buttons: Claude waiting, Teams messages, approved DB
  changes, QC bugs and their replies, Jira updates, Ready to Test, blocked PRs, new PR comments, a teammate's PR to review,
  Done in Jira, overdue.
- **Available**: unassigned tickets of this month's epic (its key at the top opens it), best first. **Take** assigns one to
  you (it asks first); **Hide** removes it from the list. The best 10 show first; **Show 10 more** at the bottom adds the
  next ones.

## Logging your hours

The **Timesheet** page, top to bottom: **WORKED ON** (the tickets your commits and Claude sessions show for the picked day),
the input, the week, a card for each day, then **This week by ticket**. A red number on its sidebar row counts the days that
still need you: a queued day the auto-log could not log, today after the auto-log time with nothing queued, and the days
this week flags. Hover the row to see each day and why.

- **WORKED ON**: each ticket with why ("3 commits - Claude") and its rough share of the day; press one to queue it,
  **Queue all** queues them all with those shares.
- The input: the date, the ticket box, then **Add to queue** (or Enter). Queued tickets are logged automatically at the
  auto-log time (6:00 PM by default, Settings > Work > Timesheet). Typing a ticket shows it under the input ("not added
  yet") with its hours.
- A dot before each ticket shows the Jira check: green found, red not found, amber could not check. A warning sign means
  the ticket is not yours, with a button for the likely typo. The key opens the ticket in Jira.
- **Log now** logs that day (or what you are typing) to TSC + HRM at once. HRM refuses today's hours before 6:00 PM, so for
  today it is off until then ("(after 6 PM)"); queue it instead.
- The **...** menu: **Log OFF...** marks a day off (it overwrites that day and drops its queued entries), **Log now: TSC
  only**, **Log now: HRM only** and **Clear queue...**.
- The week: arrows to page the weeks and **Read again**, then **HRM 8h / 40h** (the week against 8h per working day, days
  off not counted), **TSC 1 / 1** (the past days TSC holds) and how many workdays are off. While the week is read, each part
  (TSC sheet, HRM hours, days off, HRM tasks, Jira tickets) shows its own mark. On Fridays the app reviews the week and tells
  you about days that look wrong.
- A **card for each weekday**, Monday to Friday (fewer per row in a narrow window). Click a card to pick its date for the
  input. A card is one of:
  - **Logged** (✓ and the HRM hours): the tickets HRM logged with their hours, the TSC line, and "ticket(s) to check" when
    the weekly review flagged some (hover it for why).
  - **Queued**: where it stands (**Auto-logs at 6:00 PM**, or in orange past the auto-log time), **Log now** or **Retry**,
    then the tickets, each with its hours box and a remove button.
  - **Leave** or **Public holiday** (violet stripes, with the holiday's name, or the leave request: "Approved in HRM" once
    approved, else "Day of leave").
  - **not yet** for a day still to come, or **Nothing logged - type a ticket above**.
- Queued days outside the week shown (another week, a weekend) are cards under **QUEUED**.
- At the auto-log time with nothing queued on a working day, the window opens to remind you (not on a public holiday or a
  day you have sent a full-day leave request for, approved or not).

## Insights

The **Insights** page shows what you worked on in a range of days, ticket by ticket. Its top bar: the range (**This week**,
**Last week**, **This month**, **Last month** or **Custom**, which adds the first and last day), **Refresh**, **Copy
markdown**, **Export CSV...**, then when the report was read. The range you pick is remembered.

- Under it, one line of totals: **TICKETS**, **HOURS** (from HRM), **TOKENS** (Claude), **COMMITS** and **FILES**.
- Four charts follow: **Hours by ticket** and **Tokens by ticket** (the top ten tickets, the rest folded into **Other**),
  then **Hours by day** and **Tokens by day**. Point at a bar to see its value.
- The table has a row per ticket: its key (click it to open Jira), summary, status, hours, Claude sessions, turns
  and time, tokens, commits, files and lines. Click a row to open that ticket's Claude detail under the table: **Skills**,
  **Tools**, **Subagents**, **Compacts** and **API errors** inside the range. A ticket without Claude activity says so.
- When HRM cannot be read, the hours show a dash, the hours charts are hidden and a line above the table says so (the log
  has the reason).
- With no work in the range the page says "No work in this range - pick another range".
- The page reads when you open it if it has no report yet, the range changed or the report is older than 5 minutes. A
  Claude notice about context or compacts opens this page on that ticket's row.

## Ticket

The ticket tabs sit first in Workspace, one per ticket you opened (Start or Open). Close a tab with its × or a middle click.

- Under the tabs, one line for the ticket: the key (opens Jira), the summary (hover it to read it all), then the status, due
  date, ETA and time logged, each named ("ETA Nov 13", "Logged 1h"; an empty one is left out), then:
  - The PR button ("PR 2 ●", its dot the worst state, then an orange comment mark with the number of open comments when there are
    some) lists each PR with its state; click one to open it in Azure DevOps. When the check finds new comments or a new
    conflict, the app hands the job to the ticket's Claude by itself, as soon as that Claude is idle (fixes, pushes, replies on the PR
    and resolves the threads; a QC bug's PR goes to its parent's Claude).
  - At the right, **Ready to Test** (when the ticket can move there) and **VS Code**.
- The tab is split in two: the ticket's Claude always on the right, and one of these views on the left, **Files** at first
  (the ticket's plan or ticket doc open, so you can follow what Claude is doing): **Changes** (the diff of the ticket's branches and the PR comments: a Comments list above the files, open ones first, and a 💬 mark beside each commented line, with the commented text highlighted; click either to open that file and comment in a card right under its line, its enlarge button reads it large over the whole window (click beside it, X or Esc to go back); click the mark again, X, Esc or anywhere outside the card to close it; every folder open at first and the ones you close kept closed next time; the menu beside Refresh shows one PR alone instead, each PR marked merged (green check) or open (blue dot),
  e.g. "BE Backend-DotNet #55762: MDP-9379-dev -> development", with only that PR's comments), **Files** (the ticket's docs and worktree files,
  markdown rendered), **Teams** (the ticket's Teams post and chats: read, reply, and ask Claude about a message (on a new message from someone else, Claude suggests replies as soon as the ticket's Claude is free and was active in the last hour); the paperclip, a paste or a drop attaches files, up to 10 of 100 MB each, which go to the channel's Files or, in a chat, your OneDrive shared with the company, and a file in a message is a button that opens it). The view buttons and ◂ (hide this
  half) sit at the top of the left half, ▸ (hide Claude) left of Claude's tabs. The left half starts wide enough for the Teams view's Claude suggests panel; drag the
  line between the halves to resize them (double-click it: back to that default); with one half hidden, the button you see
  brings both back (with Claude hidden, ◂ has a dot while Claude waits). Each tab keeps its own sizes and hidden half.
- Above Claude, **+** opens another Claude in the same worktree (Claude 2, Claude 3, ...), each with its own conversation;
  click a tab to switch, × closes it (asking first while it runs). They come back, resuming their conversations, when the app
  opens again. The board's automatic steps (next step, PR comments, Teams) always go to the first **Claude**. **VS Code** opens the worktree folder.
- Type `/` for Claude's commands and skills, `@` for a file. `/resume` lists the earlier chats of the folder, newest first
  (type words after it to filter); pick one and its history shows, and the next message continues it. A closed folder tab
  opened again on the same folder gets its chat back by itself.
- What the ticket's Claude used (tokens, skills, tools, subagents, compacts) is on the Insights page. A notice tells
  when the context passes 80%, after each compact, and at the third compact; click it to open that ticket on the Insights page.

## Notifications

- Every message the app shows also goes to the **bell**. The red number is how many you have not read; open the bell to see
  them all together and mark them all read. A read notice goes after a day, an unread one after a week.
- A short **toast** shows under the bell while the window is open. Click it (or its row in the bell) to go to what it is about.
  One that goes somewhere has a **›** at its right and a hand cursor; one without it (like "Settings saved.") is only marked
  read. A "(see log)" notice opens the day's log file. A Claude notice opens that tab's Claude view; a ticket notice scrolls the board
  to its row. What the notice is about (the row, the tab, the input or the week title) blinks for a few seconds so you can spot it. When the place is gone (the tab closed, the ticket off the board), a small dialog says why.
- When the window is not in front, important topics also show a desktop notification, and a paired phone can get them too.
- **Settings > General > Notices** picks, per topic, the toast, the desktop notification and the phone; **Phone and PC**
  holds a phone push back while you are at the PC.
- A notice reads itself when you look at what it is about (its page, ticket tab or conversation).

## Colors and marks

| Mark                     | Means                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Red text                 | Broken or late: overdue, build failed, conflict, rejected, sent back by QC, a failed review                             |
| Orange text              | Needs attention soon: due soon, no time logged, needs work, open comments                                               |
| Green                    | Done or merged                                                                                                          |
| Purple                   | The Ready to Test path: a dot before a status that waits on you, statuses in review or test                             |
| Blue status              | The ticket is with you (in progress)                                                                                    |
| Gray                     | On hold, done, unknown or not read                                                                                      |
| Red badge on the sidebar | New things to act on (Tickets), Claude waiting (Workspace), days to log (Timesheet), a failed knowledge scan (Settings) |
| Dot on a tab             | Claude in that tab is waiting for you                                                                                   |

Priority (P) and ETA are only facts, so they are never colored.

## Settings

The groups are listed on the left of the Settings page:

- **General**: theme, season (effects and a seasonal mouse cursor), language; **Notices** per topic (see above); **Phone and PC** (when a notice goes to the
  phone); **Backup & move to another PC** (see below).
- **Integrations**: **Connections** (Jira; **Advanced** holds the board queries, the status flow and the Available to take
  queries), **Azure DevOps** (PR tracking) and **Teams** (watched channels, posts, Database Review). **Check** tests the
  saved details; **Save** checks before it saves. When Teams cannot be read (signed out, or Teams web stuck on a screen
  such as the browser's own sign-in), Teams shows **Sign in to Teams**: it opens Microsoft Edge, you sign in or skip that
  screen, and the window closes by itself.
- **Work**: **Timesheet** (log time, HRM, TSC and its session), **Public holidays**, **Workspace** (dev repo, sibling
  repos, start prompt, clean up worktrees) and **Schedules** (how often Jira and the PRs are checked, the scheduled jobs).
- **Remote access**: this device, VPN access, Cloudflare and the paired devices.
- **Guide**: this page.

## Moving to another PC

Install first: **Microsoft Edge** (TSC and Teams sign in through it), the **Claude Code** CLI (signed in), **Git**,
**Node 22** and a clone of the dev repo.

On the old PC, **Settings > General > Backup & move to another PC > Export** saves everything (settings, the encrypted
secrets with the key that opens them, the board and its history) to one `.wdbackup` file locked with a password you choose
(8 characters or more). On the new PC, pick that file in the same place, type the password, **Import**, then **Restart now**.
The files it replaces are kept in a `before-import-<date>` folder in `%AppData%\Workday`. Keep the file and the password
apart: anyone with both can read your tokens.

Without a backup, fill in **Integrations > Connections** (Jira URL, email and API token from id.atlassian.com > Security >
API tokens) and **Work > Timesheet** (HRM key, TSC); the rest keeps its defaults.

Sign-ins do not move with the file. Afterwards use **Work > Timesheet > Sign in to TSC** and **Integrations > Teams >
Sign in to Teams**.

## Another project or company

Everything specific to NOIS and MDP is a setting, so start with an empty `%AppData%\Workday` (not a copy of someone
else's: it keeps signing in to their systems) and fill in:

- **Connections**: the Jira site, your email and token, the ticket key prefix; under **Advanced**, the status names of
  that Jira workflow. Leave the Available to take queries empty to drop that view.
- **Azure DevOps**: organization and project, or leave them empty for no PR tracking.
- **Teams**: the channels to watch, or none to turn Teams off.
- **Timesheet**: HRM and TSC are NOIS systems; elsewhere leave them empty.
- **Public holidays** of that country, and the **Workspace** dev repo.

The time zone (Vietnam by default) is only in `config.json` (`"timeZone"`). Some things are still built in: Jira and Azure
DevOps only, two PRs per ticket (`<KEY>` into `main`, `<KEY>-dev` into `development`), ticket notes in
`<dev repo>/docs/<KEY>/`. A project that works differently needs a change in the app; the README lists where.

## Tips

- When a new build of the app is published over the running one, a notice says so; click it to restart into the new build.
- Ticket tabs pick up their Claude conversation again after a restart.
- The app counts days in the configured time zone (Vietnam by default), so a date picked near midnight elsewhere can land on another day.
- **Ctrl+F** finds text in **Changes**, **Files** and a **Teams** thread: Enter goes to the next match, Shift+Enter the previous, Esc
  closes. Selected text shows in blue, so you can see what you copy.
