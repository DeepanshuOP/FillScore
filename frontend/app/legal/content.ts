export interface LegalSection {
  id: string;
  heading: string;
  body: string[];
}

export const LEGAL_UPDATED = '2026-10-01';

export const contactLine = (email: string | undefined): string =>
  email && email.trim() !== ''
    ? `You can reach us at ${email.trim()}.`
    : 'You can reach us by opening an issue on the project repository.';

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'what-this-is',
    heading: 'What FillScore is',
    body: [
      'FillScore is a transaction cost analysis tool. It reads trades you have already made on a crypto exchange and grades how well they were executed, using market data from the time of each trade.',
      'It looks backwards only. It does not predict prices, generate signals, or tell you what a future trade will cost.',
    ],
  },
  {
    id: 'not-financial-advice',
    heading: 'Not financial advice',
    body: [
      'Scores, grades, estimates, and anything written by the Agent Council are descriptions of past execution. They are not financial advice, investment advice, or a recommendation to buy, sell, or hold anything.',
      'Where the analysis suggests a different way of executing, that is an observation about historical fills. Markets change, and past execution quality does not predict future results. You are responsible for your own trading decisions.',
    ],
  },
  {
    id: 'your-account',
    heading: 'Your account',
    body: [
      'You need an account to analyse your own trades. Keep your password and sign-in methods to yourself, and give us accurate information. You are responsible for activity under your account.',
      'You must be old enough to enter a binding agreement where you live, and you must be allowed to use the exchanges you connect.',
    ],
  },
  {
    id: 'exchange-keys',
    heading: 'Exchange API keys',
    body: [
      'Connect read-only keys only. FillScore checks with the exchange that a key has no trading or withdrawal permission and refuses keys that do.',
      'FillScore does not place or cancel orders and does not move funds. If you create a key with more permission than we ask for, that is your decision and your risk, and you should revoke it.',
      'You can disconnect an exchange at any time, and you should revoke the key at the exchange as well.',
    ],
  },
  {
    id: 'acceptable-use',
    heading: 'Acceptable use',
    body: [
      'Do not use FillScore to attack, overload, or probe the service or other people’s accounts. Do not connect keys that are not yours. Do not try to extract other users’ data or bypass rate limits.',
      'Automated access is allowed only through interfaces we publish for that purpose.',
    ],
  },
  {
    id: 'accuracy',
    heading: 'Accuracy and availability',
    body: [
      'Scores depend on exchange data and public market data, either of which can be late, incomplete, or wrong. We compute every number with deterministic code, but we cannot promise that the inputs are correct or that the service will always be available.',
      'AI-written explanations are generated from those computed numbers and can still be wrong or unhelpful. Treat them as commentary, not fact.',
    ],
  },
  {
    id: 'no-warranty',
    heading: 'No warranty and limits on liability',
    body: [
      'FillScore is provided as is, without warranties of any kind. To the extent the law allows, we are not liable for losses that arise from your use of the service, including trading losses, lost profits, or decisions you make using its output.',
      'Nothing here limits liability that cannot be limited by law.',
    ],
  },
  {
    id: 'ending',
    heading: 'Ending your use',
    body: [
      'You can stop using FillScore and ask us to delete your account whenever you like. We may suspend or end access if you break these terms or put the service or other users at risk.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to these terms',
    body: [
      'We may update these terms. The date at the top shows the latest version. If you keep using FillScore after a change, you accept the new terms.',
    ],
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'what-we-collect',
    heading: 'What we collect',
    body: [
      'Account data: your email address, and either a password (stored only as a salted bcrypt hash) or the identifier of the Google or GitHub account you signed in with.',
      'Exchange connection data: the API key, secret, and (for OKX) passphrase you provide. These are encrypted with AES-256-GCM before they are stored and are only decrypted on the server when we fetch your trades.',
      'Trade history: the executed trades we fetch from your connected exchange with that key, and the scores and analysis we compute from them. If you add notes to a trade, we store those too.',
      'Technical data: IP address and request details in server logs and rate limiting, and the cookies described below.',
    ],
  },
  {
    id: 'how-we-use-it',
    heading: 'How we use it',
    body: [
      'To sign you in, fetch your trades, score them against market data, show you the results, and run the Agent Council on your behalf. To keep the service secure and prevent abuse. To email you about your account, such as email verification and password resets.',
      'We do not sell your data and we do not use it for advertising.',
    ],
  },
  {
    id: 'ai-processing',
    heading: 'AI processing',
    body: [
      'When you run the Agent Council, aggregated execution metrics computed from your trades, such as average slippage, fee drag, and per-symbol statistics, are sent to a third-party language model provider (currently Groq) to produce written analysis.',
      'API keys, secrets, passphrases, your email address, and raw trade identifiers are never sent. The provider returns text only; every number you see comes from our own calculations.',
    ],
  },
  {
    id: 'who-we-share-with',
    heading: 'Who processes data for us',
    body: [
      'We use infrastructure providers to run the service: a database host, application hosting, an email delivery provider, and the language model provider above. They process data only to provide those services.',
      'We also call public exchange and market-data endpoints. Those requests carry your read-only key to your own exchange, and public market data requests carry no personal information.',
    ],
  },
  {
    id: 'cookies',
    heading: 'Cookies and storage',
    body: [
      'We set one cookie: a refresh cookie that keeps you signed in. It is HTTP-only, so page scripts cannot read it, and it expires after seven days or when you log out.',
      'Your browser may also keep a small amount of local data, such as which demo account you last viewed. We do not use advertising or cross-site tracking cookies.',
    ],
  },
  {
    id: 'retention',
    heading: 'How long we keep it',
    body: [
      'We keep your account, connections, trades, and analysis until you ask us to delete them. Sign-in sessions expire after seven days, short-lived tokens expire within minutes or hours, and cached market data is discarded after a day.',
    ],
  },
  {
    id: 'your-rights',
    heading: 'Your choices and rights',
    body: [
      'You can disconnect an exchange at any time, and you can ask us to delete your account and everything stored about it. If you are in the EU or UK you can also ask for a copy of your data, ask us to correct it, object to processing, or complain to your data protection authority.',
      'Deleting your keys here does not revoke them at the exchange, so revoke them there as well.',
    ],
  },
  {
    id: 'security',
    heading: 'Security',
    body: [
      'Keys are encrypted at rest, sign-in tokens are short-lived and rotated, and every account can reach only its own data. No system is perfectly secure; if we learn of a breach that affects you we will tell you.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to this policy',
    body: [
      'We will update this page when our practices change. The date at the top shows the latest version.',
    ],
  },
];
