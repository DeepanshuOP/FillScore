/**
 * Design v3 lab tokens: one source for the CSS variables (applied by ThemeScope) and for the contrast test
 * (tokens.test.ts). Prototype only; production tokens stay in app/ui/tokens.css.
 */

export const tape = {
  paper: {
    paper: '#F3F2EE', // ground: cool printed stock, not cream
    receipt: '#FBFBF8', // thermal receipt white
    ink: '#121210',
    graphite: '#6B6A66', // secondary text, >= 4.5:1 on paper and receipt
    rule: '#D8D6CF', // separators only (< 3:1 on purpose)
    edge: '#8A8882', // control borders, >= 3:1
    pen: '#FF4F12', // fill orange: strokes, marks, focus; never small text
    penInk: '#C2380A', // orange text at body size, >= 4.5:1
    stamp: '#DE3F0B', // the grade stamp's large letters, >= 3:1
  },
  carbon: {
    paper: '#1C1B19', // warm charcoal, never blue
    receipt: '#262522',
    ink: '#EEECE6',
    graphite: '#A6A39B',
    rule: '#36342F',
    edge: '#7A776F',
    pen: '#FF5A1F',
    penInk: '#FF7E4A',
    stamp: '#FF6A2E',
  },
} as const

export const grid = {
  ink: {
    paper: '#11110F', // warm black, never blue-black
    receipt: '#1A1A17', // the ledger sheet
    ink: '#ECEBE4', // chalk
    graphite: '#9C9A91',
    rule: '#2B2A26',
    edge: '#6E6C64',
    pen: '#D4F53C', // highlighter lime: fills behind text, marks
    penInk: '#D4F53C', // lime text on the dark ground
    onPen: '#11110F', // text on a highlighter fill
  },
  sheet: {
    paper: '#F2F2EC',
    receipt: '#FFFFFF',
    ink: '#11110F',
    graphite: '#62615A',
    rule: '#DCDBD3',
    edge: '#8A8980',
    pen: '#D4F53C', // only as a fill behind ink text in this theme (lime on light fails 3:1 as a mark)
    penInk: '#4F6200', // dark olive for highlighter-coloured text
    onPen: '#11110F',
  },
} as const

export type Theme = Record<string, string>
export const cssVars = (t: Theme) => Object.fromEntries(Object.entries(t).map(([k, v]) => [`--v3-${k}`, v])) as React.CSSProperties
