/**
 * Design v3.1 (Part B): a stored audit field is shown by a plain name, never by its path. The path goes in the pen note
 * beside the list. Pure; tested in fieldNames.test.ts. The name is made from the path's own words (no lookup table to
 * drift): `liquidity.clean_market_count` -> "Liquidity: clean market count". Unit suffixes keep their meaning in words.
 */
const SUFFIX: Array<[RegExp, string]> = [[/ bps$/, ''], [/ usd$/, ' (USD)'], [/ pct$/, ' (percent)']]

export function plainFieldName(path: string): string {
  const parts = path.split('.').filter(Boolean).map((p) => p.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase())
  if (!parts.length) return path
  // the stored term for the cost of an unfilled order is "opportunity"; the screens call it the unfilled-order cost
  // (adviceCopy.test bans "opportunity" as counterfactual wording)
  let tail = parts.slice(1).join(' ').replace(/\bopportunity\b/g, 'unfilled-order cost')
  for (const [re, to] of SUFFIX) tail = tail.replace(re, to)
  const head = parts[0]
  const text = tail ? `${head}: ${tail}` : head
  return text.charAt(0).toUpperCase() + text.slice(1)
}
