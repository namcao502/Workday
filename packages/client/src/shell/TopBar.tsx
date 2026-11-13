import { NoticeBell } from '../notices/NoticeBell.js'

export function TopBar(): React.JSX.Element {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end px-4">
      <NoticeBell />
    </header>
  )
}
