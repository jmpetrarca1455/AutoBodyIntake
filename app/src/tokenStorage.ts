import { Platform } from 'react-native';

/**
 * Cross-platform auth token storage. Uses localStorage on web (SecureStore
 * isn't supported there) and a simple in-memory fallback elsewhere for now —
 * swap in expo-secure-store for native builds when we ship to TestFlight/Play.
 */
const memoryStore = new Map<string, string>();
const KEY = 'autobody_shop_token';

export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    }
    return memoryStore.get(KEY) ?? null;
  },
  async set(value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, value);
      return;
    }
    memoryStore.set(KEY, value);
  },
  async clear(): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
      return;
    }
    memoryStore.delete(KEY);
  },
};

