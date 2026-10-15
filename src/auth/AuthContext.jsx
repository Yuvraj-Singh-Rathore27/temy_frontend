import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, onAuthChange, refreshSession, tokenStore } from '../api/client.js';
import { authApi } from '../api/endpoints.js';

const AuthContext = createContext(null);

/**
 * Session state for the whole app.
 * status: 'loading' (restoring session) | 'authenticated' | 'anonymous' | 'offline' (server unreachable)
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  const restore = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const session = await refreshSession();
      setState(session ? { status: 'authenticated', user: session.user } : { status: 'anonymous', user: null });
    } catch {
      setState({ status: 'offline', user: null });
    }
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  // Keep React state in sync with token refreshes / revocations done by the API client.
  useEffect(
    () =>
      onAuthChange((session) => {
        setState(session ? { status: 'authenticated', user: session.user } : { status: 'anonymous', user: null });
      }),
    [],
  );

  const startSession = useCallback(({ user, accessToken }) => {
    tokenStore.set(accessToken);
    setState({ status: 'authenticated', user });
  }, []);

  const login = useCallback(async (credentials) => startSession(await authApi.login(credentials)), [startSession]);
  /** Creates the account; resolves with { email, retryAfterSeconds, devOtp? }. The session starts after verifyEmail. */
  const register = useCallback((data) => authApi.register(data), []);
  const verifyEmail = useCallback(
    async (email, code) => startSession(await authApi.verifyEmail(email, code)),
    [startSession],
  );

  /** Replace the signed-in user's data after a profile change (here or in another tab). */
  const updateUser = useCallback((user) => {
    setState((s) => (s.status === 'authenticated' ? { ...s, user } : s));
  }, []);

  /** Ends the session locally even if the server cannot be reached. */
  const endSession = useCallback(() => {
    tokenStore.clear();
    setState({ status: 'anonymous', user: null });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    } finally {
      endSession();
    }
  }, [endSession]);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } finally {
      endSession();
    }
  }, [endSession]);

  const value = useMemo(
    () => ({ ...state, login, register, verifyEmail, updateUser, logout, logoutAll, endSession, retry: restore }),
    [state, login, register, verifyEmail, updateUser, logout, logoutAll, endSession, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
