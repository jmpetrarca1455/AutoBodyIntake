import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type AuthResponse, type ShopRole } from './api';
import { tokenStorage } from './tokenStorage';

interface AuthState {
  token: string | null;
  shop: AuthResponse['shop'] | null;
  role: ShopRole | null;
  loading: boolean;
  login: (ownerEmail: string, password: string) => Promise<void>;
  signup: (input: Parameters<typeof api.signup>[0]) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Shop-portal auth session. Wraps the dashboard routes so any screen can
 * read the logged-in shop and call `logout()`. Token is persisted (web:
 * localStorage) so a page refresh doesn't kick you out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [shop, setShop] = useState<AuthResponse['shop'] | null>(null);
  const [role, setRole] = useState<ShopRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await tokenStorage.get();
      if (stored) {
        try {
          const me = await api.me(stored);
          setToken(stored);
          setShop(me);
          setRole(me.role);
        } catch {
          await tokenStorage.clear();
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(ownerEmail: string, password: string) {
    const res = await api.login({ ownerEmail, password });
    await tokenStorage.set(res.token);
    setToken(res.token);
    setShop(res.shop);
    setRole(res.role);
  }

  async function signup(input: Parameters<typeof api.signup>[0]) {
    const res = await api.signup(input);
    await tokenStorage.set(res.token);
    setToken(res.token);
    setShop(res.shop);
    setRole(res.role);
  }

  async function logout() {
    await tokenStorage.clear();
    setToken(null);
    setShop(null);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ token, shop, role, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}


