// The button in a pane's bar that hides the pane, or brings the other one back (WPF SplitPanes).
export interface PaneToggle {
  readonly label: string
  readonly onPress: () => void
}
