'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../lib/authFetch';
import { mapOnboardingError } from '../utils/errorMapping';
import { getGradeColor } from '../utils/gradeColor';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading, accessToken, refreshAccessToken } = useAuth();
  
  const [selectedExchange, setSelectedExchange] = useState<'binance' | 'bybit' | 'okx' | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('');
  const [syncResult, setSyncResult] = useState<{
    fillScore: number;
    grade: string;
    tradesIngested: number;
    tradesScored: number;
  } | null>(null);
  const [noTrades, setNoTrades] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center pt-16">
        <div style={{ fontFamily: 'var(--font-mono)', color: '#a78b71', letterSpacing: '0.2em' }}>
          LOADING...
        </div>
      </div>
    );
  }

  const exchanges = [
    {
      id: 'binance' as const,
      name: 'Binance',
      desc: "World's largest crypto exchange",
      enabled: true
    },
    {
      id: 'bybit' as const,
      name: 'Bybit',
      desc: "Coming soon",
      enabled: false
    },
    {
      id: 'okx' as const,
      name: 'OKX',
      desc: 'Coming soon',
      enabled: false
    }
  ];

  const isFormDisabled = !confirmed || !apiKey.trim() || !apiSecret.trim();

  const handleSubmit = async () => {
    if (isFormDisabled || submitting) return;
    
    setSubmitting(true);
    setErrorMsg(null);
    
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await authFetch(`${baseUrl}/onboarding/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: selectedExchange,
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim()
        })
      }, { accessToken, refreshAccessToken });
      
      const data = await res.json();
      
      if (!res.ok) {
        setErrorMsg(mapOnboardingError(data.error || 'unknown', res.status));
      } else {
        setIsSuccess(true);
        // Clear secrets from state immediately
        setApiKey('');
        setApiSecret('');
        setErrorMsg(null);
      }
    } catch (err: any) {
      setErrorMsg(mapOnboardingError('network_error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setErrorMsg(null);
    setNoTrades(false);

    // ESTIMATED progress messages for the UI, since we don't have a real stream
    setSyncStatusText('Fetching your trades from Binance...');
    const timers = [
      setTimeout(() => setSyncStatusText('Enriching against market data...'), 5000),
      setTimeout(() => setSyncStatusText('Computing your FillScore...'), 12000)
    ];

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await authFetch(`${baseUrl}/onboarding/sync`, {
        method: 'POST'
      }, { accessToken, refreshAccessToken });
      
      const data = await res.json();
      timers.forEach(clearTimeout);

      if (!res.ok) {
        if (data.error === 'no_trades_found') {
          setNoTrades(true);
        } else if (data.error === 'No exchange connections found' || data.error === 'no_exchange_connections_found') {
          // Go back to connect step
          setIsSuccess(false);
          setErrorMsg(mapOnboardingError('no_exchange_connections_found'));
        } else {
          setErrorMsg(mapOnboardingError(data.error || 'unknown', res.status));
        }
      } else {
        setSyncResult({
          fillScore: data.fillScore,
          grade: data.grade,
          tradesIngested: data.tradesIngested,
          tradesScored: data.tradesScored
        });
      }
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setErrorMsg(mapOnboardingError('network_error'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center pt-16 px-4" style={{ paddingBottom: '10rem' }}>
      <div className="w-full max-w-[520px] relative overflow-hidden rounded-[2px]"
           style={{
             background: '#141412',
             border: '1px solid rgba(167,139,113,0.2)',
             padding: '0',
             boxShadow: '0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 120px rgba(167,139,113,0.06), 0 60px 100px rgba(0,0,0,0.6)'
           }}>
        
        {/* Card ambient glow */}
        <div style={{
          position: 'absolute',
          bottom: '-80px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '300px',
          height: '150px',
          background: 'radial-gradient(ellipse, rgba(167,139,113,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        {/* Card top accent bar */}
        <div style={{
          height: '1px',
          width: '100%',
          background: 'linear-gradient(to right, transparent 0%, rgba(167,139,113,0.3) 15%, rgba(232,213,183,0.85) 50%, rgba(167,139,113,0.3) 85%, transparent 100%)',
          position: 'relative',
          zIndex: 1
        }} />

        {/* Card content wrapper */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          
          {/* HEADER ROW */}
          <div className="flex justify-between items-center border-b border-[rgba(255,255,255,0.04)] px-5 py-5 sm:px-8 sm:pt-6 sm:pb-5">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.3em', color: '#a78b71' }}>
              {isSuccess ? '02  /  SYNC' : '01  /  CONNECT'}
            </span>
            {!isSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.2em', color: '#8a7560' }}>
                  READY
                </span>
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#a78b71',
                  boxShadow: '0 0 10px rgba(167,139,113,0.8), 0 0 20px rgba(167,139,113,0.3)'
                }} />
              </div>
            )}
          </div>

          <div className="px-5 py-5 sm:px-8 sm:pt-7 sm:pb-8">
            
            {errorMsg && (
              <div style={{
                padding: '0.875rem 1rem', background: 'rgba(255, 68, 68, 0.05)',
                borderLeft: '2px solid rgba(255, 68, 68, 0.6)', borderRadius: '0 2px 2px 0',
                marginBottom: '1.5rem'
              }}>
                <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.8rem', color: '#ff8888', lineHeight: 1.5 }}>
                  {errorMsg}
                </p>
              </div>
            )}

            {noTrades ? (
              // NO TRADES FOUND STATE
              <div className="text-center py-6">
                <h2 style={{
                  fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.4rem',
                  color: '#ede8e0', fontWeight: 400, marginBottom: '1rem'
                }}>
                  No Trades Yet
                </h2>
                <div style={{
                  padding: '1.25rem', background: 'rgba(167,139,113,0.05)',
                  border: '1px solid rgba(167,139,113,0.2)', borderRadius: '2px',
                  marginBottom: '2rem', textAlign: 'left'
                }}>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#8a7d6a', lineHeight: 1.6 }}>
                    We connected successfully, but found no spot trades in the last 30 days. FillScore analyses your executed trades — once you've traded, come back and sync.
                  </p>
                </div>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full relative overflow-hidden flex justify-center items-center rounded-[2px]"
                  style={{
                    padding: '1rem', background: '#a78b71', color: '#0f0f0f',
                    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.15em', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                >
                  GO TO DASHBOARD
                </button>
              </div>
            ) : syncResult ? (
              // SYNC SUCCESS STATE
              <div className="text-center py-4">
                <div style={{ marginBottom: '2rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.2em', color: '#6a6560', textTransform: 'uppercase' }}>
                    Your FillScore
                  </span>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '4rem', fontWeight: 300, color: '#ede8e0',
                    lineHeight: 1, marginTop: '1rem', marginBottom: '0.5rem'
                  }}>
                    {syncResult.fillScore.toFixed(1)}
                  </div>
                  <div style={{
                    display: 'inline-block', padding: '0.25rem 1rem', borderRadius: '100px',
                    background: `${getGradeColor(syncResult.grade)}15`,
                    color: getGradeColor(syncResult.grade),
                    fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 600
                  }}>
                    Grade {syncResult.grade}
                  </div>
                </div>

                <div className="flex justify-between items-center px-4 py-3 mb-8" style={{ background: '#1a1917', borderRadius: '2px', border: '1px solid #2a2926' }}>
                  <div className="text-left">
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#6a6560', letterSpacing: '0.1em' }}>TRADES INGESTED</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#c8b898', marginTop: '0.25rem' }}>{syncResult.tradesIngested}</div>
                  </div>
                  <div className="w-[1px] h-[30px] bg-[#2a2926]" />
                  <div className="text-right">
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#6a6560', letterSpacing: '0.1em' }}>TRADES SCORED</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#c8b898', marginTop: '0.25rem' }}>{syncResult.tradesScored}</div>
                  </div>
                </div>

                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full relative overflow-hidden flex justify-center items-center rounded-[2px]"
                  style={{
                    padding: '1rem', background: '#a78b71', color: '#0f0f0f',
                    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.15em', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s ease'
                  }}
                >
                  VIEW MY DASHBOARD
                </button>
              </div>
            ) : isSuccess ? (
              // CONNECTED, READY TO SYNC
              <div className="text-center py-6">
                <h2 style={{
                  fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.4rem',
                  color: '#ede8e0', fontWeight: 400, marginBottom: '1rem'
                }}>
                  Connected Successfully
                </h2>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#8a7d6a', marginBottom: '2rem' }}>
                  Your read-only key has been verified and securely stored.
                </p>
                
                {syncing ? (
                  <div style={{ padding: '2rem 0' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%', border: '2px solid rgba(167,139,113,0.2)',
                      borderTopColor: '#a78b71', margin: '0 auto 1.5rem',
                      animation: 'spin 1s linear infinite'
                    }} />
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#c8b898', letterSpacing: '0.05em' }}>
                      {syncStatusText}
                    </p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#6a6560', marginTop: '0.75rem' }}>
                      This may take up to 60 seconds
                    </p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                ) : (
                  <button
                    onClick={handleSync}
                    className="w-full relative overflow-hidden flex justify-center items-center rounded-[2px]"
                    style={{
                      padding: '1rem', background: '#a78b71', color: '#0f0f0f',
                      fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.15em', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.2s ease'
                    }}
                  >
                    {errorMsg ? 'TRY AGAIN' : 'ANALYSE MY TRADES'}
                  </button>
                )}
              </div>
            ) : !selectedExchange ? (
              // EXCHANGE SELECTION
              <>
                <h2 style={{
                  fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.4rem',
                  color: '#ede8e0', fontWeight: 400, marginBottom: '1.5rem'
                }}>
                  Select Your Exchange
                </h2>
                <div className="flex flex-col gap-3">
                  {exchanges.map((ex) => (
                    <button 
                      key={ex.id}
                      onClick={() => {
                        if (ex.enabled) setSelectedExchange(ex.id);
                      }}
                      disabled={!ex.enabled}
                      className="group flex flex-col relative overflow-hidden w-full text-left rounded-[2px] outline-none border p-5 bg-[#1a1917] border-[rgba(255,255,255,0.08)] transition-all duration-[220ms] ease"
                      style={{
                        cursor: ex.enabled ? 'pointer' : 'not-allowed',
                        opacity: ex.enabled ? 1 : 0.6
                      }}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: '0.85rem', letterSpacing: '0.1em',
                          color: '#ede8e0'
                        }}>
                          {ex.name}
                        </span>
                        {!ex.enabled && (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em',
                            color: '#a78b71', padding: '2px 6px', background: 'rgba(167,139,113,0.1)',
                            borderRadius: '2px'
                          }}>
                            COMING SOON
                          </span>
                        )}
                      </div>
                      <span style={{
                        marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                        color: 'var(--text-tertiary, #6a6560)'
                      }}>
                        {ex.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              // KEY FORM
              <>
                <button 
                  onClick={() => setSelectedExchange(null)}
                  style={{
                    background: 'none', border: 'none', color: '#6a6560',
                    fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.1em',
                    cursor: 'pointer', padding: 0, marginBottom: '1.5rem',
                    display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                >
                  ← BACK
                </button>
                
                <h2 style={{
                  fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.4rem',
                  color: '#ede8e0', fontWeight: 400, marginBottom: '1.5rem'
                }}>
                  Connect Binance
                </h2>

                {/* API KEY INPUT */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.375rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', color: '#6a6560' }}>
                    API KEY
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="Paste your API key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={{
                        width: '100%', padding: '0.85rem 2.8rem 0.85rem 0.9rem',
                        background: '#0f0f0f', border: '1px solid #2a2926',
                        borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                        color: '#c8b898', outline: 'none'
                      }}
                    />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                            style={{
                              position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)',
                              background: 'none', border: 'none', cursor: 'pointer', color: '#3d3b38', padding: '2px'
                            }}>
                      {showApiKey ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                </div>

                {/* API SECRET INPUT */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.375rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', color: '#6a6560' }}>
                    API SECRET
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showApiSecret ? 'text' : 'password'}
                      placeholder="Paste your API secret"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      style={{
                        width: '100%', padding: '0.85rem 2.8rem 0.85rem 0.9rem',
                        background: '#0f0f0f', border: '1px solid #2a2926',
                        borderRadius: '2px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                        color: '#c8b898', outline: 'none'
                      }}
                    />
                    <button type="button" onClick={() => setShowApiSecret(!showApiSecret)}
                            style={{
                              position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)',
                              background: 'none', border: 'none', cursor: 'pointer', color: '#3d3b38', padding: '2px'
                            }}>
                      {showApiSecret ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                </div>

                {/* WARNING BOX */}
                <div style={{
                  display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
                  padding: '0.875rem 1rem', background: 'rgba(167,139,113,0.05)',
                  borderLeft: '2px solid rgba(167,139,113,0.6)', borderRadius: '0 2px 2px 0',
                  margin: '1.5rem 0'
                }}>
                  <span style={{ color: '#a78b71', fontSize: '0.82rem', marginTop: '1px', flexShrink: 0 }}>⚠</span>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.78rem', lineHeight: 1.6, color: '#8a7d6a' }}>
                    Only connect READ-ONLY API keys. FillScore never places orders or accesses withdrawal functions.
                  </span>
                </div>

                {/* COLLAPSIBLE GUIDE */}
                <button type="button" onClick={() => setGuideOpen(!guideOpen)}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'none', border: 'none', borderTop: '1px solid #201f1d',
                    borderBottom: '1px solid #201f1d', padding: '0.75rem 0',
                    cursor: 'pointer', margin: '1rem 0'
                  }}>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: '#6a6560' }}>
                    How to create a read-only key on Binance
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#a78b71', fontSize: '1rem', lineHeight: 1 }}>
                    {guideOpen ? '−' : '+'}
                  </span>
                </button>
                <div style={{
                  overflow: 'hidden', maxHeight: guideOpen ? '400px' : '0px', transition: 'max-height 0.3s ease'
                }}>
                  <div style={{ padding: '0.75rem 0 0.5rem' }}>
                    <ol style={{ paddingLeft: '1.1rem', fontFamily: 'var(--font-inter)', fontSize: '0.78rem', color: '#6a6560', lineHeight: 1.9, listStyleType: 'decimal' }}>
                      <li>Log in to binance.com → Profile → API Management</li>
                      <li>Click "Create API" → System generated</li>
                      <li>Name it "fillscore-readonly"</li>
                      <li>Complete email / 2FA verification</li>
                      <li>Enable "Enable Reading" ONLY — disable Spot/Margin trading, Futures, and Withdrawals</li>
                      <li>Copy both your API Key and Secret Key</li>
                    </ol>
                  </div>
                </div>

                {/* CHECKBOX */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', margin: '1.5rem 0'
                }}>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    style={{ accentColor: '#a78b71', width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '0.8rem', color: '#8a7d6a' }}>
                    I confirm this API key has read-only permissions with no trading or withdrawal access.
                  </span>
                </label>

                {/* SUBMIT BUTTON */}
                <button
                  onClick={handleSubmit}
                  disabled={isFormDisabled || submitting}
                  className="w-full relative overflow-hidden flex justify-center items-center rounded-[2px]"
                  style={{
                    padding: '1rem',
                    background: (isFormDisabled || submitting) ? '#2a2825' : '#a78b71',
                    color: (isFormDisabled || submitting) ? '#6a6560' : '#0f0f0f',
                    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.15em', fontWeight: 600,
                    border: 'none', cursor: (isFormDisabled || submitting) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {submitting ? 'CONNECTING...' : 'CONNECT ACCOUNT'}
                </button>
              </>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}