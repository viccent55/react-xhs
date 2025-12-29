import { getCountry } from 'react-native-localize';

/**
 * Get user region (country code)
 * Example: "US", "CN", "KH"
 */
export function getRegion(): string {
  try {
    return getCountry() || 'CN';
  } catch {
    return 'UNKNOWN';
  }
}
