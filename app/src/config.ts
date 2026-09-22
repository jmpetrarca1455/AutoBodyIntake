import Constants from 'expo-constants';

/**
 * Runtime configuration for the intake app.
 *
 * `apiBaseUrl` comes from app.json → expo.extra.apiBaseUrl so it can be
 * overridden per environment (dev/staging/prod) without code changes.
 * On a physical device, localhost won't reach your machine — point this at
 * your computer's LAN IP (e.g. http://192.168.1.20:3000) or a deployed URL.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };

export const config = {
  apiBaseUrl: extra.apiBaseUrl ?? 'http://localhost:3000',
};

