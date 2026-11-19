# NOIS Workday guide

NOIS Workday logs your daily work to **TSC** (the shared Excel sheet) and **HRM**, and keeps your Jira tickets, pull requests,
Claude sessions and Teams threads in one window.

## Getting around

- The **sidebar** on the left switches pages: Tickets, Workspace, Timesheet, Insights, and Settings at the bottom. **Workspace** holds your
  ticket tabs in one row of tabs at the top. Drag a tab sideways (or press
  Ctrl+Shift+Left / Right on it) to put it in another place among its own kind; the order is kept. The ☰ button folds it
  to icons.
- At the top right: the **bell** with your notices, while work runs in the background the bell turns into a spinning circle;
  click it to see what runs, listed under **Running** at the top of the notices.
- Esc clears the text box you are typing in.

## Tickets: the ticket board

The Tickets page is your tickets. The bar left of the search switches what it lists, each with its count:
**Working** (the default: **TO DO**, then **IN PROGRESS** with new tickets included), **To take**, **Done** and **Dismissed**,
each with its count in brackets ("Working (16)").
TO DO vanishes while it is empty. Each ticket is on one row only. A red dot on To take means an urgent ticket to take
(High, or due within 2 days) you have not looked at yet.

- The search box filters every view, the to-do rows and the suggestions too (every word must match); the counts follow it, and when the view you are on has no hit the board shows the first one that has. Type or paste a ticket key or Jira link that is not on the board and **Add** puts it there. A ticket's own sub-branch with no Jira issue, typed as its branch name (`MDP-9430-phase-2`), is added the same way: its row takes the ticket's summary, Start and Open give it its own worktree and tab, and its time is logged to the ticket.
- **Check now** (at the right of the header, with the last check's time) reads Jira and the PRs at once; otherwise it happens
  every few minutes (Settings > General). The left of the header shows a short programming saying, a new one each time you open the window;
  click it for another.
- Each row: the key (opens Jira), the summary, then STATUS, DUE, PR and FLOW. Hover a cell for details. ETA, P and the time logged are in the ticket's header in Workspace.
  - PR: the pull requests to `main` and `development`, a mark after each: green ✓ merged, half circle some repos merged, gray ●
    waiting, blue ● approved, orange ● needs work, red ✕ blocked (build failed, conflict, rejected), gray ✕ abandoned, "–" none.
    The tooltip lists every PR with its state.
  - FLOW: where the ticket is in the Claude workflow (plan, code, review, push, PR, post); the tooltip names the next step.
- What waits on you shows as small rows with their own buttons under the ticket's row: Claude waiting, Teams messages,
  approved DB changes, QC bug replies, Jira updates, Ready to Test, blocked PRs, new PR comments, Done in Jira, overdue.
  A ticket with something urgent (Claude waiting, a QC bug, a Teams mention, a blocked PR, overdue) moves up into **TO DO**
  with those rows; the others keep them under their row in In progress. What belongs to no ticket you work on (a terminal's
  Claude, a teammate's PR to review, worktrees to clean up) is listed in TO DO on its own.
- **To take**: unassigned tickets of this month's epic (shown at the top, click to open it), best first. **Take** assigns
  one to you (it asks first); **Hide** removes it from the list, **Show hidden** brings them back. The best 10 show first; **Show 10 more** at the bottom adds the next ones, and a search shows every match.
- One button per row:
  - **Start** (New): creates the ticket's worktree, opens its Ticket tab with Claude running `ship <KEY>`, and queues it for today.
    A sub-task's worktree starts from its parent's branch; until the lead pushes that branch, Start says so and makes no worktree.
    A ticket newly assigned to you is started this way by itself at the next Jira check; a new QC bug gets its Fix by itself.
  - **Open** (In progress): opens the Ticket tab.
  - **To Test** (purple): the dev PR merged, so the ticket can move to Ready to Test in Jira. It asks first. You rarely need
    it: once the dev PRs merge the app moves the ticket to Deployed to Dev itself, and to Ready to Test once the dev
    pipelines finish (a notice says so; a failed move says why).
  - **Done** with an arrow: Jira already finished the ticket; move it to Done here.
- The other actions are icon buttons beside it (hover one for its name), each always in the same place: **Open**, **Done**
  (a check) or **Reopen** (an undo arrow), **Add to the log box** (a clock: opens Timesheet with the ticket typed in; greyed while
  the ticket is already there) and **Dismiss** (a crossed eye, asks first).

## Logging your hours

The **Timesheet** page is one column: the input at the top, then the week, then a card for each day. A red number on its sidebar row counts the days
that still need you: a queued day the auto-log could not log, today after the auto-log time with nothing queued, and the days
this week flags. Hover the row to see each day and why.

- The input: the date, the ticket box, then **+** (or Enter) to queue; Esc clears the box. Queued tickets are logged
  automatically at the auto-log time (6:00 PM by default, Settings > Work log).
- **THIS WEEK** shows the week's range, arrows to page the weeks, a round arrow to read the week again, and at the right the
  totals: **HRM 8h / 40h** (the week against 8h per working day, days off not counted) and **TSC 1 / 1** (the past days TSC holds).
  On Fridays the app reviews the week and tells you about days that look wrong.
- Under it, a **card for each weekday**, Monday to Friday side by side (fewer per row in a narrow window); a day still to come says "not yet" and names the tickets in progress. A logged day also shows that day's commits and active time ("4 commits · 3h active").
- Below the cards, **This week by ticket** sums each ticket's time (logged or queued), and **Today** lists the tickets you committed to or worked on with Claude today, marking in orange one that today's log does not hold yet. While the week is being read, a spinner covers the cards and they cannot be clicked.
  Click a card to pick its date for the input (it gets a blue frame). A card is one of:
  - **Logged**: **✓ 8h** (orange when short or flagged), an 8h bar split by the tickets HRM logged (each part labelled with its key
    and hours), the TSC mark with its tickets, and how many tickets the weekly review flagged. Hover it for both statuses in
    words, the day's tickets and what the review found.
  - **Queued**: the status, the day's hours and **Log now**, the **bar** of its 8h split by ticket, then the tickets. Drag a line
    between two tickets to move time between them (half-hour steps), the last line to use the free time. Each row still has its
    hours box for an exact number (hover it for the time slots).
  - **Suggested**: your in-progress tickets with commits or a Claude session that day, each with why ("3 commits · Claude") and its
    rough hours. **Queue** adds them to the queue, **Log now** logs them right away, **Edit** puts them in the input for that date.
  - **Day off**, or **Nothing logged - type a ticket above**.
- Typing a ticket shows it first, under the input ("not added yet"), with its day's hours and **Log now**. Queued days outside the
  week shown (another week, a weekend) are cards under **QUEUED**.
- Each queued day says where it stands: **Auto-logs at 6:00 PM (2h 15m left)**, or in orange **Past the auto-log time, not
  logged yet** with **Retry**. A logged day leaves the queue and shows as Logged.
- A dot before each ticket shows the Jira check: green found, red not found, amber could not check. A warning sign means the
  ticket is not yours, with a button for the likely typo. The key opens the ticket in Jira.
- **Log now** logs that day (or what you are typing) to TSC + HRM at once. HRM refuses today's hours before 6:00 PM, so for today
  it is off until then ("(after 6 PM)"); queue it instead.
- The **...** menu: **Log OFF...** marks a day off (it overwrites that day and drops its queued entries), **Log now: TSC only**
  and **Log now: HRM only** for what you are typing, and **Clear queue...**. The TSC sign-in is in **Settings > Work log**;
  when the auto-log has to keep entries, its notice opens it.
- The suggestions are read in the background from your commits and Claude sessions within that day; a past day is read once per
  session, today at most once a minute.
- At the auto-log time with nothing queued on a working day, the window opens to remind you (not on a day you have sent a full-day leave request for, approved or not).

## Insights

The **Insights** page shows what you worked on in a range of days, ticket by ticket. Pick the range at the top: **This week**, **Last week**,
**This month**, **Last month** or **Custom** (two date fields appear: the first and last day). The range you pick is remembered.

- Under the range, one line of totals: **TICKETS**, **HOURS** (from HRM), **TOKENS** (Claude), **COMMITS** and **FILES**.
- Four charts follow: **Hours by ticket** and **Tokens by ticket** (the top ten tickets, the rest folded into **Other**), then **Hours by day** and
  **Tokens by day**. Point at a bar to see its value.
- The table has a row per ticket: its key (click it to open Jira), summary, status, PR, FLOW, hours, Claude sessions, turns and time, tokens, commits,
  files and lines. Click a row to open that ticket's Claude detail under the table: **Skills**, **Tools**, **Subagents**, **Compacts** and
  **API errors** inside the range. A ticket without Claude activity says so.
- **Refresh** reads again; **Copy markdown** puts the table on the clipboard; **Export CSV...** saves it as a CSV file you can open in Excel.
- When HRM cannot be read, the hours show a dash, the hours charts are hidden and a line above the table says so (the log has the reason).
- With no work in the range the page says "No work in this range - pick another range".
- The page reads when you open it if it has no report yet, the range changed or the report is older than 5 minutes. A Claude notice about context or
  compacts opens this page on that ticket's row.

## Ticket

The ticket tabs sit first in Workspace, one per ticket you opened (Start or Open). Close a tab with its × or a middle click.

- The header is one line: the key (opens Jira), the summary (cut with "..." when long; hover it to read it all), then the status, due
  date, ETA and time logged, each named ("ETA Nov 13", "Logged 1h"; an empty one is left out), and the pills:
  - The PR pill ("PR main ● · dev ✓ · 1 open comment", or "No PR yet") opens the PR table: one row per repo, MAIN and DEV. Click a PR
    to open it; a comment pill ("3 open comments") opens Changes with its Comments list. When the check finds new comments or a new
    conflict, the app hands the job to the ticket's Claude by itself, as soon as that Claude is idle (fixes, pushes, replies on the PR
    and resolves the threads; a QC bug's PR goes to its parent's Claude).
  - "2 bugs · 1 sub-task" (only when there are some; red while a bug is new) opens the QC bugs logged on the ticket (**Fix** starts
    one, with each bug's PRs) and its sub-tasks (click one to open it in Jira).
  - **Updated in Jira** appears when someone changed the ticket in Jira (click it to see what changed).
  - Then **Ready to Test** (when the ticket can move there) and **VS Code**.
    Click outside a popup or press Esc to close it.
- The tab is split in two: the ticket's Claude always on the right, and one of these views on the left, **Files** at first
  (the ticket's plan or ticket doc open, so you can follow what Claude is doing): **Changes** (the diff of the ticket's branches and the PR comments: a Comments list above the files, open ones first, and a 💬 mark beside each commented line, with the commented text highlighted; click either to open that file and comment in a card right under its line, its enlarge button reads it large over the whole window (click beside it, X or Esc to go back); click the mark again, X, Esc or anywhere outside the card to close it; every folder open at first and the ones you close kept closed next time; the menu beside Refresh shows one PR alone instead, each PR marked merged (green check) or open (blue dot),
  e.g. "BE Backend-DotNet #55762: MDP-9379-dev -> development", with only that PR's comments), **Files** (the ticket's docs and worktree files,
  markdown rendered), **Teams** (the ticket's Teams post and chats: read, reply, and ask Claude about a message; the paperclip, a paste or a drop attaches files, up to 10 of 100 MB each, which go to the channel's Files or, in a chat, your OneDrive shared with the company, and a file in a message is a button that opens it). The view buttons and ◂ (hide this
  half) sit at the top of the left half, ▸ (hide Claude) left of Claude's tabs. The left half starts wide enough for the Teams view's Claude suggests panel; drag the
  line between the halves to resize them (double-click it: back to that default); ◂ / Ctrl+[ and ▸ / Ctrl+] move one step
  at a time (only the left half, both, only Claude), so with one half hidden the button you see brings both back (with Claude hidden, ◂ has a dot while Claude waits). Each tab keeps its own sizes and hidden half.
- Above Claude, **+** opens another Claude in the same worktree (Claude 2, Claude 3, ...), each with its own conversation;
  click a tab to switch, × closes it (asking first while it runs). They come back, resuming their conversations, when the app
  opens again. The board's automatic steps (next step, PR comments, Teams) always go to the first **Claude**. **VS Code** opens the worktree folder.
- What the ticket's Claude used (tokens, skills, tools, subagents, compacts) is on the Insights page. A notice tells
  when the context passes 80%, after each compact, and at the third compact; click it to open that ticket on the Insights page.

## Notifications

- Every message the app shows also goes to the **bell**. The red number is how many you have not read; open the bell to see
  them all together and mark them all read. A read notice goes after a day, an unread one after a week.
- The bell lists the 10 newest; **Show more** at the bottom adds 10 more (it says how many unread are still below).
- A short **toast** shows under the bell while the window is open. Click it (or its row in the bell) to go to what it is about.
  One that goes somewhere has a **›** at its right and a hand cursor; one without it (like "Settings saved.") is only marked
  read. A "(see log)" notice opens the day's log file. A Claude notice opens that tab's Claude view; a ticket notice scrolls the board
  to its row. What the notice is about (the row, the tab, the input or the week title) blinks for a few seconds so you can spot it. When the place is gone (the tab closed, the ticket off the board), a small dialog says why.
- When the window is not in front, important topics also show a Windows notification.
- Settings > Notifications picks, per topic, the Windows notification (Always, Errors only, Off) and the toast.
- A notice reads itself when you look at what it is about (its page, ticket tab or conversation).

## Colors and marks

| Mark                     | Means                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Red text                 | Broken or late: overdue, build failed, conflict, rejected, sent back by QC, a failed review                             |
| Orange text              | Needs attention soon: due soon, no time logged, needs work, open comments                                               |
| Green                    | Done or merged                                                                                                          |
| Purple                   | The Ready to Test path: the **To Test** button, a dot before a status that waits on you, statuses in review or test     |
| Blue status              | The ticket is with you (in progress)                                                                                    |
| Gray                     | On hold, done, unknown or not read                                                                                      |
| Red badge on the sidebar | New things to act on (Tickets), Claude waiting (Workspace), days to log (Timesheet), a failed knowledge scan (Settings) |
| Dot on a tab             | Claude in that tab is waiting for you                                                                                   |

Priority (P) and ETA are only facts, so they are never colored.

## Settings

The sections are the buttons in the header; a red dot marks one that needs you.

- **General**: language, theme, **Claude chat view**, how often to check Jira (the PRs at most every 5 minutes),
  and the dev repo folder.
- **Connections**: Jira, HRM, Azure DevOps and Teams. **Check** tests the saved details; **Save** checks before it saves.
  When Teams cannot be read (signed out, or Teams web stuck on a screen such as the browser's own sign-in), Teams shows
  **Cannot read** and **Sign in to Teams**: it opens Microsoft Edge, you sign in or skip that screen, and the window closes by itself.
  **Claude skills** holds the secrets only the skills read (dev DB password, test account password, MDP API token);
  **Replace** a value and **Save**, no check.
- **Work log**: the auto-log time, your TSC columns, and the TSC session (check it or sign in again).
- **Notifications**: per topic, see above.
- **Tools**: open the log folder, clean up the worktrees of shipped tickets, the scheduled jobs, **Export credentials...** /
  **Import credentials...** (see below), and rebuild the app.
- **Guide**: this page.

## Moving to another PC

Install first: **Microsoft Edge** (TSC and Teams sign in through it), the **Claude Code** CLI (signed in), **Git** and a
clone of the dev repo. Then copy the whole published app folder; it needs no .NET install.

On the first start the app asks for:

- **Required**: Jira URL (`https://newoceaninfosys.atlassian.net`), Jira email, Jira API token
  (id.atlassian.com > Security > API tokens) and your HRM API key.
- **The dev repo folder**: your credentials are saved in its `docs\local-config\tokens.env`.
- **Optional**: an Azure DevOps personal access token (PR tracking) and a Teams webhook URL (Teams posts); the TSC columns
  and the auto-log time keep their defaults (`M, J`, 6:00 PM).

The tokens in `tokens.env` are encrypted for your Windows account on this PC, so a copy of the file does not open anywhere
else. Quicker than typing them again: on the old PC, **Settings > Tools > Export credentials...** saves them to a `.nwcred`
file locked with a password you choose (8 characters or more). On the new PC, pick the dev repo folder, then **Import...**
at the top of the setup window (or **Settings > Tools > Import credentials...**) and type that password. Keep the file and
the password apart: anyone with both can read your tokens. Copy `%AppData%\NoisWorkday\settings.json` too to keep the
theme, and window position.

Sign-ins do not move with the files. Afterwards use **Work log > Re-authenticate TSC** and **Connections > Sign in to Teams**.

## Tips

- When a new build of the app is published over the running one, a notice says so; click it to restart into the new build.
- Ticket tabs pick up their Claude conversation again after a restart.
- A date picked near midnight outside Vietnam can land on another HCM day: the app counts all days in Vietnam time.
- **Ctrl+F** finds text in **Changes**, **Files** and a **Teams** thread: Enter goes to the next match, Shift+Enter the previous, Esc
  closes. Selected text shows in blue, so you can see what you copy.
