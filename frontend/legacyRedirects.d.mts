export interface LegacyRedirect {
  source: string
  has?: Array<{ type: 'query'; key: string; value: string }>
  destination: string
  permanent: true
}
export const DASHBOARD_VIEWS: string[]
export const legacyRedirects: LegacyRedirect[]
