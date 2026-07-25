export function mapOnboardingError(code: string, status?: number): string {
  if (status === 429) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  switch (code) {
    case 'key_not_read_only':
      return "This key has trading or withdrawal permissions enabled. Create a new key with ONLY 'Enable Reading' turned on.";
    case 'invalid_key':
      return "Binance rejected this key. Check the key and secret are copied correctly and haven't expired.";
    case 'network_error':
      return "Couldn't reach Binance right now. Please try again in a moment.";
    case 'exchange_not_supported_yet':
      return "Only Binance is supported right now.";
    case 'no_trades_found':
      return "We connected successfully, but found no spot trades in the last 30 days. FillScore analyses your executed trades — once you've traded, come back and sync.";
    case 'no_exchange_connections_found':
    case 'No exchange connections found':
      return "Connect an exchange first.";
    default:
      return "Something went wrong. Please try again.";
  }
}
