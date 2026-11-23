'use client'

import { pageWindow } from '../utils/pagination';
import React, { useState, useEffect, Suspense } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Download, StickyNote } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '../../lib/utils'
import { openAuthenticatedDownload } from '../lib/downloads';
import { formatUsd } from '../utils/format';
import { useSearchParams } from 'next/navigation'
import { AppPage } from '../components/appshell/shellContext'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { GradeChip } from '../ui/GradeChip'
import { Panel } from '../ui/Panel'
import { ValueState } from '../ui/ValueState'
import { formatSignedBps } from '../ui/format'
import { hueCss, hueShare } from '../ui/hue'
import { useAuth } from '../context/AuthContext'
import { authFetch } from '../lib/authFetch'
import { resolveIdentityState } from '../utils/identityResolver'
import { buildQuery } from '../utils/queryBuilder'
import { apiBase } from '../lib/apiBase';
import { showCsvExport } from '../utils/csvExport';
import { NOT_COMPUTED } from '../utils/notComputed';
import { formatUtc } from '../dashboard/ordersTable';
import { FILLS_TITLE, fillsColumns, fillsCountLine, hiddenMeasures, notComputedLine } from './fillsView';

interface Trade {
  _id: string
  tradeId: string
  note?: string
  exchange: string          // 'binance' | 'bybit' | 'okx'
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  executedAt: string
  executionPrice: number
  notionalValue: number
  isMaker: boolean
  feePaid: number
  // The per-trade v1 fields are absent on a rebuilt demo's trades (decision 11): they read "not computed", never 0.
  fillScore: number | null
  fillGrade: 'A' | 'B' | 'C' | 'D' | 'F'
  slippageScore: number | null
  feeScore: number | null
  timingScore: number | null
  exchangeScore: number | null
  slippageBps: number | null
  spreadBps: number | null
  arrivalPriceProxy: number | null
}

interface TradesResponse {
  /** The trades route's flag: false = a demo whose trades carry no v1 measures (backend audit.ts:139-146). */
  v1Computed?: boolean
  trades: Trade[]
  total: number
  page: number
  pages: number
}

const VENUE_NAME: Record<string, string> = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX' }

/** Money-free "not computed" cell: the one ValueState, small. */
const none = (label: string) => <ValueState state="not-computed" label={label} size="cell" />

function SideMark({ side }: { side: string }) {
  const buy = side === 'BUY'
  return (
    <span className="inline-flex items-center gap-1.5 text-ui-ink">
      <span aria-hidden="true" className={cn('size-2 rounded-full', buy ? 'bg-ui-ink' : 'bg-transparent ring-[1.5px] ring-inset ring-ui-graphite')} />
      {side}
    </span>
  )
}

function OrderTypeBadge({ isMaker }: { isMaker: boolean }) {
  return (
    <span className={cn('inline-flex h-5 items-center rounded-[6px] px-1.5 text-[11px] font-medium ring-1 ring-inset',
      isMaker ? 'bg-ui-overlay text-ui-ink ring-ui-edge' : 'text-ui-graphite ring-ui-rule')}>
      {isMaker ? 'MAKER' : 'TAKER'}
    </span>
  )
}

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel flex min-w-0 flex-col gap-1 pt-3">
      <span className="font-mono text-[11px] tracking-[0.06em] text-ui-graphite uppercase">{label}</span>
      <span className="text-[1.5rem] leading-8 font-black tracking-[-0.03em] text-ui-ink">{children}</span>
    </div>
  )
}

function TradesContent() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [total, setTotal] = useState(0)
  const [v1Computed, setV1Computed] = useState<boolean | undefined>(undefined)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [urlUserId, setUrlUserId] = useState<string | null>(null)
  const [dashboardMode, setDashboardMode] = useState<'demo' | 'real' | null>(null)

  const { accessToken, isLoading: authLoading, refreshAccessToken } = useAuth()
  const searchParams = useSearchParams()
  const [exporting, setExporting] = useState(false)
  // Human-readable exchange label derived from the loaded trades; several exchanges read "All exchanges".
  const [displayExchange, setDisplayExchange] = useState<string>('All exchanges')
  const [exchangeRaw, setExchangeRaw] = useState<string>('')

  const [totalBuys, setTotalBuys] = useState(0)
  const [totalSells, setTotalSells] = useState(0)
  const [totalMakers, setTotalMakers] = useState(0)

  // Notes
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [noteStatus, setNoteStatus] = useState<''|'saved'|'error'>('')

  useEffect(() => {
    if (selectedTrade) {
      setNoteText(selectedTrade.note || '')
      setNoteStatus('')
    }
  }, [selectedTrade])

  const saveNote = async () => {
    if (!selectedTrade) return
    setSavingNote(true)
    setNoteStatus('')
    if (!dashboardMode) return;
    try {
      const fetchFn = dashboardMode === 'real' ? (url: string, opts?: any) => authFetch(url, opts, { accessToken, refreshAccessToken }) : fetch;
      const query = buildQuery(dashboardMode, userId);
      const url = `${apiBase()}/audit/trades/${selectedTrade.tradeId}/note${query}`;

      const payload: any = { note: noteText, symbol: selectedTrade.symbol };
      if (dashboardMode === 'demo') {
        payload.userId = userId;
      }

      const res = await fetchFn(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save note')
      const data = await res.json()

      const updatedTrades = trades.map(t => t.tradeId === selectedTrade.tradeId && t.symbol === selectedTrade.symbol ?{ ...t, note: data.note } : t)
      setTrades(updatedTrades)
      setSelectedTrade({ ...selectedTrade, note: data.note })

      setNoteStatus('saved')
      setTimeout(() => setNoteStatus(''), 2000)
    } catch {
      setNoteStatus('error')
      setTimeout(() => setNoteStatus(''), 2000)
    } finally {
      setSavingNote(false)
    }
  }

  // Filters
  const [symbolFilter, setSymbolFilter] = useState('ALL')
  const [sideFilter, setSideFilter] = useState('ALL')
  const [gradeFilter, setGradeFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('executedAt')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const fetchStats = async (uid: string | null, mode: 'demo' | 'real') => {
    try {
      const fetchFn = mode === 'real' ? (url: string) => authFetch(url, {}, { accessToken, refreshAccessToken }) : fetch;
      const query = buildQuery(mode, uid, { limit: '1000' });

      const res = await fetchFn(
        `${apiBase()}/audit/trades${query}`
      )
      const data = await res.json()
      const all = data.trades as Trade[]
      setTotalBuys(all.filter(t => t.side === 'BUY').length)
      setTotalSells(all.filter(t => t.side === 'SELL').length)
      setTotalMakers(all.filter(t => t.isMaker).length)
    } catch {}
  }

  useEffect(() => {
    if (authLoading) return;
    const urlUser = searchParams.get('userId')
    const storageUserId = localStorage.getItem('userId')

    const identity = resolveIdentityState(urlUser, storageUserId, accessToken, searchParams.get('sample') === '1');

    if (identity.mode === 'redirect') {
      window.location.href = '/login';   // IA v4: a signed-out visitor to /app/* without a demo account goes to log in
      return;
    }

    if (identity.shouldClearStorage) localStorage.removeItem('userId');
    if (identity.shouldSetStorage && identity.effectiveUserId) localStorage.setItem('userId', identity.effectiveUserId);

    setDashboardMode(identity.mode);
    setUserId(identity.effectiveUserId);
    setUrlUserId(urlUser);

    fetchStats(identity.effectiveUserId, identity.mode);
  }, [authLoading, accessToken, searchParams])

  useEffect(() => {
    if (!dashboardMode || (dashboardMode === 'demo' && !userId)) return
    fetchTrades()
  }, [userId, dashboardMode, page, symbolFilter, sideFilter, gradeFilter])

  const fetchTrades = async () => {
    if (!dashboardMode) return;
    setLoading(true)
    try {
      const fetchFn = dashboardMode === 'real' ? (url: string) => authFetch(url, {}, { accessToken, refreshAccessToken }) : fetch;

      const paramsObj: Record<string, string> = {
        page: String(page),
        limit: '50'
      };
      if (symbolFilter) paramsObj.symbol = symbolFilter;
      if (sideFilter) paramsObj.side = sideFilter;
      if (gradeFilter) paramsObj.grade = gradeFilter;

      const query = buildQuery(dashboardMode, userId, paramsObj);
      const res = await fetchFn(`${apiBase()}/audit/trades${query}`)

      if (dashboardMode === 'real' && res.status === 404) {
        setTrades([])
        setTotal(0)
        setPages(1)
        return;
      }

      const data: TradesResponse = await res.json()
      setTrades(data.trades)
      setV1Computed(data.v1Computed)
      setTotal(data.total)
      setPages(data.pages)
      // Derive the exchange label from the loaded trades.
      if (data.trades.length > 0) {
        const exchangeSet = new Set<string>(data.trades.map((t: Trade) => t.exchange))
        if (exchangeSet.size === 1) {
          const raw = data.trades[0].exchange
          setExchangeRaw(raw)
          setDisplayExchange(
            raw === 'binance' ? 'Binance Spot' :
            raw === 'bybit'   ? 'Bybit Derivatives' :
            raw.charAt(0).toUpperCase() + raw.slice(1)
          )
        } else {
          setExchangeRaw('')
          setDisplayExchange('All exchanges')
        }
      }
    } catch {
      setTrades([])
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (p: number | undefined | null) => {
    if (p == null || isNaN(p)) return null
    return p >= 1000
      ? p.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      : p.toFixed(4)
  }

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  // A2: a measure that no loaded row has is left out of the table, and one line says so and why (fillsView.ts)
  const hidden = hiddenMeasures(trades)
  const notComputed = notComputedLine(hidden, v1Computed)
  const columnCount = fillsColumns(hidden).length

  const sortedTrades = [...trades].sort((a, b) => {
    let av: number, bv: number
    if (sortBy === 'executedAt') {
      av = new Date(a.executedAt).getTime()
      bv = new Date(b.executedAt).getTime()
    } else if (sortBy === 'fillScore') {
      if (a.fillScore == null || b.fillScore == null) return (a.fillScore == null ? 1 : 0) - (b.fillScore == null ? 1 : 0)
      av = a.fillScore; bv = b.fillScore
    } else if (sortBy === 'notionalValue') {
      av = a.notionalValue; bv = b.notionalValue
    } else if (sortBy === 'slippageBps') {
      // Not computed sorts last in either direction; it is never ranked as 0.
      if (a.slippageBps == null || b.slippageBps == null) return (a.slippageBps == null ? 1 : 0) - (b.slippageBps == null ? 1 : 0)
      av = a.slippageBps; bv = b.slippageBps
    } else {
      av = a.feePaid; bv = b.feePaid
    }
    return sortDir === 'asc' ? av - bv : bv - av
  })

  const scoredTrades = trades.filter(t => t.fillScore != null)
  const avgScore = scoredTrades.length
    ? Math.round(scoredTrades.reduce((s, t) => s + (t.fillScore ?? 0), 0) / scoredTrades.length)
    : null                                           // no trade has a score: shown as not computed, never 0

  const currentIndex = selectedTrade ? sortedTrades.findIndex(t => t._id === selectedTrade._id) : -1
  const goToPrev = () => { if (currentIndex > 0) setSelectedTrade(sortedTrades[currentIndex - 1]) }
  const goToNext = () => { if (currentIndex < sortedTrades.length - 1) setSelectedTrade(sortedTrades[currentIndex + 1]) }

  const handleExport = async () => {
    if (exporting || !dashboardMode || (dashboardMode === 'demo' && !userId)) return;
    setExporting(true);

    const filters: Record<string, string> = {};
    if (exchangeRaw && exchangeRaw !== 'multi') {
      filters.exchange = exchangeRaw;
    }

    try {
      if (dashboardMode === 'real') {
        await openAuthenticatedDownload('export', '/audit/trades/export', filters, { accessToken, refreshAccessToken });
      } else {
        const query = buildQuery(dashboardMode, userId, Object.keys(filters).length ? filters : undefined);
        window.open(`${apiBase()}/audit/trades/export${query}`, '_blank');
      }
    } finally {
      setTimeout(() => setExporting(false), 300);
    }
  };

  const clearFilters = () => { setSymbolFilter('ALL'); setSideFilter('ALL'); setGradeFilter('ALL'); setPage(1); }
  const filtered = symbolFilter !== 'ALL' || sideFilter !== 'ALL' || gradeFilter !== 'ALL'

  const filterSelect = (label: string, value: string, options: string[], onChange: (v: string) => void) => (
    <label className="flex items-center gap-2 text-[13px] text-ui-graphite">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="h-9 rounded-[10px] bg-ui-raised px-2.5 text-sm text-ui-ink ring-1 ring-inset ring-ui-edge outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
        {options.map(o => <option key={o} value={o}>{o === 'ALL' ? 'All' : o}</option>)}
      </select>
    </label>
  )

  const sortHead = (col: string, label: string, numeric = false) => (
    <th scope="col" aria-sort={sortBy === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('sticky top-0 z-10 bg-ui-raised px-3 py-2 font-mono text-[11px] font-normal tracking-[0.06em] whitespace-nowrap text-ui-graphite uppercase shadow-[inset_0_-1px_0_var(--ui-rule)]', numeric ? 'text-right' : 'text-left')}>
      <button type="button" onClick={() => handleSort(col)}
        className={cn('inline-flex items-center gap-1 rounded-[6px] hover:text-ui-ink focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]', sortBy === col && 'text-ui-ink')}>
        {label}
        {sortBy === col ? (sortDir === 'desc' ? <ArrowDown aria-hidden="true" className="size-3" /> : <ArrowUp aria-hidden="true" className="size-3" />) : null}
      </button>
    </th>
  )
  const plainHead = (label: string, numeric = false) => (
    <th scope="col" className={cn('sticky top-0 z-10 bg-ui-raised px-3 py-2 font-mono text-[11px] font-normal tracking-[0.06em] whitespace-nowrap text-ui-graphite uppercase shadow-[inset_0_-1px_0_var(--ui-rule)]', numeric ? 'text-right' : 'text-left')}>{label}</th>
  )

  const actions = showCsvExport(dashboardMode) ? (
    <Button variant="secondary" size="sm" onClick={handleExport} loading={exporting}>
      {exporting ? 'Exporting' : <><Download aria-hidden="true" />Export CSV</>}
    </Button>
  ) : null

  const sel = selectedTrade
  const arrival = sel ? formatPrice(sel.arrivalPriceProxy) : null

  return (
    <AppPage period="All stored fills" dataSource={dashboardMode === 'demo' ? 'synthetic-demo' : dashboardMode === 'real' ? 'real-user' : null}
      venue={exchangeRaw ? (VENUE_NAME[exchangeRaw.toLowerCase()] ?? displayExchange) : null} actions={actions}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-ui-graphite">{fillsCountLine(total, displayExchange)}</p>
          {notComputed ? <p data-testid="fills-not-computed" className="max-w-[72ch] text-[13px] text-ui-graphite">{notComputed}</p> : null}
        </div>

        <div className={cn('grid grid-cols-2 gap-3', hidden.score ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
          <StatCell label="Fills">{total}</StatCell>
          <StatCell label="Buys and sells">{totalBuys} buys, {totalSells} sells</StatCell>
          {hidden.score ? null : (
            <StatCell label="Average score, this page">
              {avgScore === null
                ? <span data-testid="trades-avg-score" title={NOT_COMPUTED}>—</span>
                : <span data-testid="trades-avg-score">{avgScore}</span>}
              {avgScore === null ? <span className="mt-0.5 block text-[13px] font-normal tracking-normal text-ui-graphite">{NOT_COMPUTED.charAt(0).toUpperCase() + NOT_COMPUTED.slice(1)}</span> : null}
            </StatCell>
          )}
          <StatCell label="Maker fills">{totalMakers}</StatCell>
        </div>

        <Panel title={FILLS_TITLE} note={{ label: 'how to read the ledger', text: 'Every fill, newest first by default. Select a row for its details.' }} bodyClassName="flex flex-col gap-4"
          actions={filtered ? <Button variant="quiet" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {filterSelect('Symbol', symbolFilter, ['ALL', 'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'], setSymbolFilter)}
            {filterSelect('Side', sideFilter, ['ALL', 'BUY', 'SELL'], setSideFilter)}
            {hidden.grade ? null : filterSelect('Grade', gradeFilter, ['ALL', 'A', 'B', 'C', 'D', 'F'], setGradeFilter)}
          </div>

          {/* relative: the table's visually hidden caption stays inside the scroller instead of widening the page */}
          <div className="relative max-h-[70vh] overflow-auto border-t border-ui-ink">
            <table className="w-full min-w-[960px] border-collapse text-[13px] text-ui-ink">
              <thead>
                <tr>
                  {plainHead('No.')}
                  {sortHead('executedAt', 'Time (UTC)')}
                  {plainHead('Symbol')}
                  {plainHead('Venue')}
                  {plainHead('Side')}
                  {sortHead('notionalValue', 'Notional', true)}
                  {sortHead('executionPrice', 'Price', true)}
                  {sortHead('feePaid', 'Fee', true)}
                  {hidden.slippage ? null : sortHead('slippageBps', 'Slippage', true)}
                  {plainHead('Order')}
                  {hidden.score ? null : sortHead('fillScore', 'Score', true)}
                  {hidden.grade ? null : plainHead('Grade')}
                </tr>
              </thead>
              <tbody>
                {loading ? [...Array(8)].map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    <td colSpan={columnCount} className="px-3 py-3"><div className="h-4 w-full rounded-[6px] bg-ui-overlay/60" /></td>
                  </tr>
                )) : sortedTrades.map((trade, i) => {
                  const price = formatPrice(trade.executionPrice)
                  const isSel = selectedTrade?._id === trade._id
                  const scored = trade.fillScore != null && trade.fillScore > 0
                  return (
                    <tr key={trade._id} tabIndex={0} aria-selected={isSel}
                      onClick={() => { setSelectedTrade(trade); setDrawerOpen(true); }}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTrade(trade); setDrawerOpen(true); } }}
                      className={cn('cursor-pointer border-b border-ui-rule transition-colors hover:bg-ui-overlay/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ui-focus)]', isSel && 'bg-ui-overlay')}>
                      <td className="px-3 py-2 text-ui-graphite tabular-nums">{String((page-1)*50 + i + 1).padStart(3, '0')}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="tabular-nums">{formatUtc(trade.executedAt)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div title={trade.symbol} className="inline-flex items-center gap-1.5 font-medium">
                          {trade.symbol}
                          {trade.note ? <StickyNote aria-hidden="true" className="size-3.5 text-ui-graphite" /> : null}
                          {trade.note ? <span className="sr-only">Has note</span> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-ui-graphite">{VENUE_NAME[trade.exchange?.toLowerCase() || ''] ?? (trade.exchange || 'Unknown')}</td>
                      <td className="px-3 py-2"><SideMark side={trade.side} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatUsd(trade.notionalValue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{price ?? none('Price')}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ui-graphite">{trade.feePaid != null ? `$${trade.feePaid.toFixed(4)}` : none('Fee')}</td>
                      {hidden.slippage ? null : (
                        <td className="px-3 py-2 text-right tabular-nums" title={trade.slippageBps === null ? NOT_COMPUTED : undefined}>
                          {trade.slippageBps == null ? none('Slippage') : formatSignedBps(trade.slippageBps)}
                        </td>
                      )}
                      <td className="px-3 py-2"><OrderTypeBadge isMaker={trade.isMaker} /></td>
                      {hidden.score ? null : (
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {scored ? Math.round(trade.fillScore as number) : none('Fill score')}
                        </td>
                      )}
                      {hidden.grade ? null : (
                        <td className="px-3 py-2">
                          {trade.fillGrade ? <GradeChip grade={trade.fillGrade} size="sm" label={`Grade ${trade.fillGrade}`} /> : none('Grade')}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && sortedTrades.length === 0 ? (
              <EmptyState title="No trades match these filters" className="m-4"
                action={<Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button>}>
                Nothing was recorded for this combination.
              </EmptyState>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-ui-graphite tabular-nums">
              Showing {Math.min((page-1)*50 + 1, total)} to {Math.min(page*50, total)} of {total}
            </p>
            <nav aria-label="Pagination" className="flex flex-wrap gap-1">
              {pageWindow(page, pages).map((item, idx) => item === 'ellipsis' ? (
                <span key={`gap-${idx}`} aria-hidden="true" className="grid h-8 w-5 place-items-center text-[13px] text-ui-graphite">…</span>
              ) : (
                <button key={item} type="button" onClick={() => setPage(item)}
                  aria-label={`Page ${item}`}
                  aria-current={page === item ? 'page' : undefined}
                  className={cn('grid h-8 min-w-8 place-items-center rounded-[8px] px-2 text-[13px] tabular-nums ring-1 ring-inset',
                    page === item ? 'bg-ui-overlay text-ui-ink ring-ui-edge' : 'text-ui-graphite ring-ui-rule hover:text-ui-ink')}>{item}</button>
              ))}
            </nav>
          </div>
        </Panel>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-ui-raised sm:max-w-[440px]">
          <SheetDescription className="sr-only">Details, journal note and score breakdown of one trade.</SheetDescription>
          {sel ? (
            <div className="flex flex-col gap-6 p-5">
              <header className="flex flex-col gap-2">
                <SheetTitle className="text-[1.25rem] leading-7 font-semibold tracking-[-0.015em] text-ui-ink">{sel.symbol}</SheetTitle>
                <div className="flex flex-wrap items-center gap-3 text-[13px]">
                  <SideMark side={sel.side} />
                  <OrderTypeBadge isMaker={sel.isMaker} />
                  <span className="text-ui-graphite tabular-nums">{formatUtc(sel.executedAt)} UTC</span>
                </div>
              </header>

              <div className="flex items-center gap-5 rounded-[12px] bg-ui-overlay p-4">
                {sel.fillScore == null || !sel.fillGrade
                  ? null
                  : <GradeChip grade={sel.fillGrade} size="xl" label={`Grade ${sel.fillGrade}`} />}
                <div className="flex flex-col gap-1">
                  <div data-testid="trade-score-detail" className="text-[1.75rem] leading-9 font-semibold tracking-[-0.025em] text-ui-ink">
                    {sel.fillScore == null
                      ? <ValueState state="not-computed" label="Fill score" size="cell" />
                      : <>{Math.round(sel.fillScore)}<span className="ml-0.5 text-[13px] font-normal tracking-normal text-ui-graphite">/100</span></>}
                  </div>
                  <span className="text-[13px] text-ui-graphite">Fill score</span>
                </div>
              </div>

              <section aria-labelledby="trade-details">
                <h3 id="trade-details" className="mb-2 text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">Execution details</h3>
                <dl className="divide-y divide-ui-rule rounded-[10px] ring-1 ring-inset ring-ui-rule">
                  {([
                    ['Quantity', sel.quantity != null ? sel.quantity.toFixed(6) : none('Quantity')],
                    ['Execution price', formatPrice(sel.executionPrice) ? `$${formatPrice(sel.executionPrice)}` : none('Execution price')],
                    ['Arrival price', arrival ? `$${arrival}` : none('Arrival price')],
                    ['Notional', formatUsd(sel.notionalValue)],
                    ['Fee paid', sel.feePaid != null ? `$${sel.feePaid.toFixed(4)}` : none('Fee paid')],
                    ['Spread', sel.spreadBps != null ? formatSignedBps(sel.spreadBps) : none('Spread')],
                    ['Slippage', sel.slippageBps == null ? none('Slippage') : formatSignedBps(sel.slippageBps)],
                    ['Order type', <OrderTypeBadge key="t" isMaker={sel.isMaker} />],
                  ] as [string, React.ReactNode][]).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 px-3 py-2 text-[13px]">
                      <dt className="text-ui-graphite">{label}</dt>
                      <dd className="text-right tabular-nums text-ui-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section aria-labelledby="trade-note" className="flex flex-col gap-2">
                <h3 id="trade-note" className="text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">Journal note</h3>
                <Field multiline label="Note" value={noteText} onChange={e => setNoteText(e.target.value)} maxLength={500} placeholder="Add a note to this trade" />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-ui-graphite tabular-nums">{noteText.length} / 500</span>
                  <div className="flex items-center gap-3">
                    {noteStatus === 'saved' && <span className="inline-flex items-center gap-1 text-[13px] text-ui-ink"><Check aria-hidden="true" className="size-3.5" />Note stored</span>}
                    {noteStatus === 'error' && <span className="text-[13px] text-ui-danger">Storing the note failed</span>}
                    <Button variant="secondary" size="sm" onClick={saveNote} loading={savingNote}>Save note</Button>
                  </div>
                </div>
              </section>

              <section aria-labelledby="trade-breakdown">
                <h3 id="trade-breakdown" className="mb-2 text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">Score breakdown</h3>
                <ul className="flex flex-col gap-2.5">
                  {[
                    { label: 'Slippage', score: sel.slippageScore },
                    { label: 'Fees', score: sel.feeScore },
                    { label: 'Timing', score: sel.timingScore },
                    { label: 'Spread', score: sel.exchangeScore },
                  ].map(bar => (
                    <li key={bar.label} className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 text-[13px]">
                      <span className="text-ui-graphite">{bar.label}</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-ui-overlay">
                        {bar.score == null ? null : <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, bar.score))}%`, background: hueCss(hueShare(bar.score / 100)) }} />}
                      </span>
                      <span className="min-w-6 text-right tabular-nums text-ui-ink">{bar.score == null ? none(bar.label) : Math.round(bar.score)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <footer className="flex items-center justify-between gap-3 border-t border-ui-rule pt-4">
                <span className="text-[13px] text-ui-graphite">Trade id <span className="font-ui-mono text-ui-ink">{sel.tradeId.split('-').pop()?.toUpperCase() || sel.tradeId.slice(-8).toUpperCase()}</span></span>
                <div className="flex gap-1">
                  <Button variant="secondary" size="sm" onClick={goToPrev} disabled={currentIndex <= 0} aria-label="Previous trade"><ChevronLeft aria-hidden="true" /></Button>
                  <Button variant="secondary" size="sm" onClick={goToNext} disabled={currentIndex >= sortedTrades.length - 1} aria-label="Next trade"><ChevronRight aria-hidden="true" /></Button>
                </div>
              </footer>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AppPage>
  )
}

export default function Trades() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ui-surface" />}>
      <TradesContent />
    </Suspense>
  )
}
