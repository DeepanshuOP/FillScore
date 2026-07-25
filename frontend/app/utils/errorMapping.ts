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
    default:
      return "Something went wrong. Please try again.";
  }
}
