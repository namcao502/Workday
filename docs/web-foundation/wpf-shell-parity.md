# WPF shell parity notes

Source: `C:\Project\NoisWorkday\UI\SidebarNav.cs`, `ShellWindow.cs`, `.claude/rules/arch/shell-and-notices.md`.

## Done

- Menu button (hamburger) at the left of the header toggles the sidebar; tooltip "Collapse or expand the menu".
- Folded sidebar is an icon rail (56px, as WPF), not fully hidden. Labels move into tooltips; a badge becomes a dot.
- Folded state persists (WPF `AppSettings.SidebarCollapsed`, web `localStorage` `workday.sidebarCollapsed`).
- Narrow screens keep the bottom tab bar; no menu button there.
- The page title and its actions sit in the header next to the menu button (`ui/Page.tsx` portals into the
  `TopBar` slot; a `Page` rendered without the shell keeps the old in-body row).
- No divider lines anywhere in the web app (user, 2026-11-16): areas are told apart by blocks, as on iOS and macOS.
  The sidebar is a rounded block, sections are cards, list rows and tabs are soft inset blocks, table rows are striped
  (`app.css`), the narrow tab bar floats as a rounded block. Borders are off globally (`--border-width`, `--field-border-width`).
- Badge text caps at "99+"; the row tooltip says what the badge counts; the badge pulses for 1.2s when the count rises.
- Schedules is no longer a page: it is a section of Settings (as in WPF). The Settings row shows a `1` badge while a
  knowledge-scan run ended badly and was not seen; a scan notice opens Settings.

## Deviations

- Selected row: WPF swaps to a filled glyph; the web keeps the same icon (user, 2026-11-16: no bolder icon on select).
- The header's window buttons, media player and mobile indicator do not apply in a browser.

## Already the same

- No page shortcuts; Settings pinned at the bottom.
