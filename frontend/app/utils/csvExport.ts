/** F-15: CSV export is available to signed-in users and in demo mode, once the mode is known. */
export function showCsvExport(mode: 'demo' | 'real' | 'redirect' | null | undefined): boolean {
  return mode === 'demo' || mode === 'real';
}
