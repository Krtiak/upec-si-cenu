import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      // debug
      // eslint-disable-next-line no-console
      console.log('[Auth] initial session:', session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminStatus(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[Auth] getSession error', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // eslint-disable-next-line no-console
        console.log('[Auth] onAuthStateChange', { event, session });
        setUser(session?.user ?? null);
        if (session?.user) {
          await checkAdminStatus(session.user.id);
        } else {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  async function checkAdminStatus(userId: string) {
    try {
      // protect against hanging requests by racing with a timeout
      const dbPromise = supabase
        .from('admins')
        .select('*')
        .eq('user_id', userId)
        // use maybeSingle so the client won't throw if no row is found
        .maybeSingle();

      const timeout = new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: new Error('timeout') }), 5000)
      );

      const res: any = await Promise.race([dbPromise, timeout]);

      if (res && res.error) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] checkAdminStatus error or timeout', res.error, res);
        setIsAdmin(false);
      } else {
        // res.data will be the admin row or null
        setIsAdmin(!!res?.data);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Auth] checkAdminStatus unexpected error', err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
