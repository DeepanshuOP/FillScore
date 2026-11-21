/** An exchange toggle's name without its "Enable " prefix: "Enable Spot & Margin Trading" reads "Spot & Margin Trading". */
const toggleName = (s: string) => s.replace(/^enable\s+/i, '');

/**
 * What the form does after a refusal, and the last correction that says so (design v3 fixes A8). From the refusal map:
 * on Binance the corrections edit the key that was pasted (its restrictions change, the key and secret stay the same), so
 * the fields stay filled; on Bybit and OKX the refusal asks for a new read-only key, and a key the exchange did not accept
 * is pasted again, so both fields are cleared and the key field takes focus. Nothing from a refused attempt is stored.
 */
export function refusalFollowUp(code: string, exchange: string): { keepFields: boolean; last: string } {
  const again = { keepFields: true, last: 'Press Connect again. Nothing from this attempt was stored.' };
  if (code === 'network_error') return again;
  if (code === 'key_not_read_only') {
    return exchange === 'Binance' ? again : { keepFields: false, last: 'Paste the new key and its secret here. Nothing from this attempt was stored.' };
  }
  return { keepFields: false, last: 'Paste the key and its secret again. Nothing from this attempt was stored.' };
}

export function mapOnboardingError(code: string, status?: number, exchange: string = 'Binance', permissions?: { disable?: string[]; enable?: string[] }): string {
  if (status === 429) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  switch (code) {
    case 'key_not_read_only': {
      // design v3 fixes A8: plain words from the same data, the exchange's "Enable " prefix dropped
      const parts: string[] = [];
      if (permissions?.disable?.length) parts.push(`Turned on: ${permissions.disable.map(toggleName).join(', ')}.`);
      if (permissions?.enable?.length) parts.push(`Needed: ${permissions.enable.map(toggleName).join(', ')} only.`);
      if (parts.length) return `This key can do more than read your trades. ${parts.join(' ')}`;
    }
    // falls through to the generic wording when the API did not name the permissions
    case 'key_not_read_only_generic':
      return exchange === 'Binance'
        ? "This key has trading or withdrawal permissions enabled. Create a new key with ONLY 'Enable Reading' turned on."
        : "This key has trading or withdrawal permissions enabled. Create a new key with read-only permission and nothing else.";
    case 'invalid_key':
      return `${exchange} rejected this key. Check the key and secret are copied correctly and haven't expired.`;
    case 'network_error':
      return `Couldn't reach ${exchange} right now. Please try again in a moment.`;
    case 'passphrase_required':
      return "OKX needs the passphrase you set when you created the key.";
    case 'invalid_request':
      return "Check that the key, secret and passphrase fields are filled in correctly.";
    case 'exchange_not_supported_yet':
      return "Only Binance is supported right now.";
    case 'no_trades_found':
      return "We connected successfully, but found no spot trades in the last 30 days. FillScore analyses your executed trades — once you've traded, come back and sync.";
    case 'no_exchange_connections_found':
    case 'No exchange connections found':
      return "Connect an exchange first.";
    case 'invalid_or_expired_token':
      return "This reset link is invalid or has expired. Request a new one.";
    case 'weak_password':
      return "Password must be at least 8 characters.";
    default:
      return "Something went wrong. Please try again.";
  }
}
