import Constants from 'expo-constants';

/**
 * Runtime configuration for the intake app.
 *
 * `apiBaseUrl` resolution order:
 *   1. EXPO_PUBLIC_API_BASE_URL — inlined at build time by Expo, the
 *      standard way to point a static web export (`expo export --platform
 *      web`) at a deployed backend without touching app.json, e.g.:
 *        EXPO_PUBLIC_API_BASE_URL=https://api.yourdomain.com npx expo export --platform web
 *   2. app.json → expo.extra.apiBaseUrl — for native builds (EAS) where
 *      env vars aren't as convenient to set per-build.
 *   3. localhost — zero-config local dev fallback.
 * On a physical device, localhost won't reach your machine — point this at
 * your computer's LAN IP (e.g. http://192.168.1.20:3000) or a deployed URL.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };

export const config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? extra.apiBaseUrl ?? 'http://localhost:3000',
};



