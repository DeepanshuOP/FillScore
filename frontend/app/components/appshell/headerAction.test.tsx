/**
 * A4 (orders of 2026-11-23): the page header's three icon-only buttons (Method opens the "How this audit was measured" sheet,
 * Copy share link copies a demo audit's public link, Download report downloads the PDF report) each carry a visible text label
 * at 1024 px and wider; on a phone the icon stays, with an aria-label and a tooltip. The theme control shows the current theme.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookOpen } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { HeaderAction } from './HeaderAction'
import { themeToggleView } from '../shell/themeToggleView'

describe('HeaderAction', () => {
  const html = renderToStaticMarkup(<TooltipProvider><HeaderAction label="Method" icon={<BookOpen />} /></TooltipProvider>)
  it('the label is visible from 1024 px (lg) and up, hidden below', () => {
    expect(html).toMatch(/<span class="hidden lg:inline">Method<\/span>/)
    expect(html).not.toContain('2xl:inline')
  })
  it('the icon is hidden from assistive tech and the button is named by aria-label', () => {
    expect(html).toContain('aria-label="Method"')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  })
  it('a phone tap target of 44 px', () => {
    expect(html).toContain('max-sm:min-h-11')
    expect(html).toContain('max-sm:min-w-11')
  })
})

describe('theme control', () => {
  it('reads Theme: Paper and Theme: Carbon copy, with the switch state matching', () => {
    expect(themeToggleView(false)).toEqual({ text: 'Theme: Paper', checked: false, title: 'Switch to the Carbon copy theme: warm charcoal, the same orange' })
    expect(themeToggleView(true)).toEqual({ text: 'Theme: Carbon copy', checked: true, title: 'Switch to the Paper theme' })
  })
})
