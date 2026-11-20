/** The screens rebuilt in M8 phase 2b part 1 (2026-11-20). The copy tests scan exactly these files; part 2 adds its screens here. */
export const REBUILT_FILES = [
  // design v2 core: landing, shell, marketing, tape, charts, primitives (Headline, CostPanels and OrdersPanel were replaced by Overview)
  'app/page.tsx', 'app/providers.tsx', 'app/components/shell/AppShell.tsx', 'app/components/shell/CommandMenu.tsx', 'app/components/shell/Logo.tsx',
  'app/components/shell/ThemeToggle.tsx', 'app/components/marketing/MarketingNav.tsx', 'app/components/marketing/ScrollStory.tsx',
  'app/components/marketing/DemoCards.tsx', 'app/components/marketing/CheckIt.tsx', 'app/ui/tape/HeroTape.tsx', 'app/ui/charts/ScoreGauge.tsx',
  'app/ui/charts/StackBar.tsx', 'app/ui/charts/IntervalPlot.tsx', 'app/ui/charts/RankPlot.tsx', 'app/ui/GradeChip.tsx', 'app/ui/GradeBadge.tsx',
  'app/ui/ValueState.tsx', 'app/ui/Panel.tsx', 'app/ui/Banner.tsx', 'app/ui/EmptyState.tsx', 'app/ui/Disclosure.tsx', 'app/ui/ProvenanceChip.tsx',
  'app/design-lab/page.tsx', 'app/design-lab/hero/page.tsx', 'app/design-lab/dashboard/page.tsx',
  'app/dashboard/page.tsx', 'app/dashboard/ScoreRecord.tsx',
  'app/dashboard/OrdersView.tsx', 'app/dashboard/OrderReplay.tsx', 'app/dashboard/RulesView.tsx', 'app/dashboard/RankingsView.tsx', 'app/dashboard/Overview.tsx',
  'app/dashboard/ordersTable.ts', 'app/dashboard/rankingsView.ts', 'app/dashboard/AskPanel.tsx', 'app/dashboard/CsvCheckPanel.tsx', 'app/dashboard/SyncFreshness.tsx',
  'app/dashboard/headline.ts', 'app/dashboard/explainView.ts', 'app/dashboard/askView.ts', 'app/dashboard/csvCheckView.ts', 'app/dashboard/ordersView.ts',
  'app/components/AgentCouncil.tsx', 'app/components/EvidencePanel.tsx', 'app/components/ConnectPrompt.tsx',
  'app/components/SiteFooter.tsx', 'app/components/NotComputed.tsx', 'app/share/[userId]/measured.ts', 'app/components/AuthLayout.tsx', 'app/components/OAuthLinks.tsx',
  'app/settings/page.tsx', 'app/login/page.tsx', 'app/signup/page.tsx', 'app/forgot-password/page.tsx', 'app/reset-password/page.tsx', 'app/verify-email/page.tsx',
  'app/lib/evidencePack.ts',
  'app/trades/page.tsx', 'app/analytics/page.tsx', 'app/analytics/WhaleCorrelation.tsx', 'app/analytics/MarkoutCard.tsx', 'app/analytics/AnalyticsCharts.tsx',
  'app/methodology/page.tsx', 'app/methodology/Toc.tsx', 'app/verify/page.tsx', 'app/check/page.tsx', 'app/share/[userId]/page.tsx',
  'app/share/[userId]/ShareButtons.tsx', 'app/components/LegalDocument.tsx', 'app/not-found.tsx', 'app/error.tsx', 'app/onboarding/page.tsx', 'app/onboarding/layout.tsx', 'app/settings/layout.tsx', 'app/ui/Field.tsx',
] as const;
