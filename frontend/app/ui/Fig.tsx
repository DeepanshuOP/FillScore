/**
 * A printed figure that may sit below its display precision (design v3 fixes A3): "−0.00 bps" or "<$0.01" on the page,
 * the exact value in the title (hover) and in the screen-reader text. A figure the display shows in full prints as is.
 * The exact text comes from `exactTitle` (format.ts); nothing here computes a value.
 */
export function Fig({ text, exact }: { text: string; exact: string | null | undefined }) {
  if (!exact) return <>{text}</>
  return (
    <span title={exact} data-exact="">
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{`${text} (${exact.charAt(0).toLowerCase()}${exact.slice(1)})`}</span>
    </span>
  )
}
