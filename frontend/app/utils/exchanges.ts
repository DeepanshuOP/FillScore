export type ExchangeId = 'binance' | 'bybit' | 'okx';

export interface ExchangeInfo {
  id: ExchangeId;
  name: string;
  desc: string;
  enabled: boolean;
  needsPassphrase: boolean;
  guideSteps: string[];
}

export const EXCHANGES: ExchangeInfo[] = [
  {
    id: 'binance',
    name: 'Binance',
    desc: "World's largest crypto exchange",
    enabled: true,
    needsPassphrase: false,
    guideSteps: [
      'Log in to binance.com → Profile → API Management',
      'Click "Create API" → System generated',
      'Name it "fillscore-readonly"',
      'Complete email / 2FA verification',
      'Enable "Enable Reading" ONLY — disable Spot/Margin trading, Futures, and Withdrawals',
      'Copy both your API Key and Secret Key',
    ],
  },
  {
    id: 'bybit',
    name: 'Bybit',
    desc: 'Spot trades via a read-only key',
    enabled: true,
    needsPassphrase: false,
    guideSteps: [
      'Log in to bybit.com → Profile → API',
      'Click "Create New Key" → System-generated API Keys',
      'Name it "fillscore-readonly"',
      'Set permissions to "Read-Only" — leave Trade and Withdraw off',
      'Complete the 2FA verification',
      'Copy your API Key and Secret now — the secret is only shown once',
    ],
  },
  {
    id: 'okx',
    name: 'OKX',
    desc: 'Spot trades via a read-only key',
    enabled: true,
    needsPassphrase: true,
    guideSteps: [
      'Log in to okx.com → Profile → API',
      'Click "Create V5 API key"',
      'Name it "fillscore-readonly" and choose a passphrase you will remember',
      'Select "Read" permission only — leave Trade and Withdraw off',
      'Complete the verification',
      'Copy your API Key, Secret Key and the passphrase you chose',
    ],
  },
];

export function getExchange(id: ExchangeId): ExchangeInfo {
  return EXCHANGES.find(e => e.id === id)!;
}
