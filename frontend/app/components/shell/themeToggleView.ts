/** The theme control's words and state (A4): it shows the current theme ("Theme: Paper") and is a two-state switch. */
export function themeToggleView(carbon: boolean): { text: string; checked: boolean; title: string } {
  return carbon
    ? { text: 'Theme: Carbon copy', checked: true, title: 'Switch to the Paper theme' }
    : { text: 'Theme: Paper', checked: false, title: 'Switch to the Carbon copy theme: warm charcoal, the same orange' }
}
