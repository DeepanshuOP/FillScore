export type PageItem = number | 'ellipsis';

/**
 * Page buttons to show for a paginated list: first page, last page, the current
 * page with one neighbour each side, and ellipses for the gaps. Seven slots or
 * fewer are always listed in full, so the row has a fixed maximum width.
 */
export function pageWindow(current: number, total: number): PageItem[] {
  if (total < 1) return [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const page = Math.min(Math.max(current, 1), total);
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total];
  if (page >= total - 3) return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', total];
}
