/**
 * The theme control's words (design v5, decision D3): Light, Dark or System, default System. The button shows the
 * current choice with a sun, a moon or a monitor; its menu lists the three. "Carbon copy" and "Paper" are retired names.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_CHOICES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/** The label of a stored choice; anything that is not one of the three reads as System (the default). */
export function themeLabel(choice: string | undefined | null): string {
  return THEME_CHOICES.find((c) => c.value === choice)?.label ?? 'System'
}

/** Normalises a value from next-themes (it can be undefined before mount, or a retired name such as "paper"). */
export function themeChoice(raw: string | undefined | null): ThemeChoice {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}
