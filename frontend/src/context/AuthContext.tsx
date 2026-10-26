import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { setAuthToken } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);

  const extractUserFromSession = (activeSession: Session): AuthUser => {
    const role = activeSession.user.app_metadata?.role || 'user';
    return {
      id: activeSession.user.id,
      email: activeSession.user.email || 'Authenticated User',
      role,
    };
  };

  useEffect(() => {
    isMountedRef.current = true;

    const initializeAuth = async () => {
      if (!isSupabaseConfigured) {
        // Missing Supabase configuration
        if (isMountedRef.current) {
          setAuthToken(null);
          setUser(null);
          setSession(null);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMountedRef.current) return;

        if (error || !data.session) {
          setAuthToken(null);
          setUser(null);
          setSession(null);
        } else {
          setAuthToken(data.session.access_token);
          setSession(data.session);
          setUser(extractUserFromSession(data.session));
        }
      } catch {
        if (!isMountedRef.current) return;
        setAuthToken(null);
        setUser(null);
        setSession(null);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    let authListener: { subscription: { unsubscribe: () => void } } | null = null;
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
        if (!isMountedRef.current) return;

        if (event === 'SIGNED_OUT' || !newSession) {
          setAuthToken(null);
          setUser(null);
          setSession(null);
        } else {
          setAuthToken(newSession.access_token);
          setSession(newSession);
          setUser(extractUserFromSession(newSession));
        }
        setLoading(false);
      });
      authListener = data;
    }

    return () => {
      isMountedRef.current = false;
      if (authListener) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    if (!isSupabaseConfigured) {
      if (import.meta.env.PROD) {
        throw new Error('Supabase authentication is not configured in this production deployment. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }
      // Offline local development fallback
      if (email && password.length >= 6) {
        const role = email.includes('admin') ? 'admin' : 'user';
        const mockToken = `test-token:${email.split('@')[0]}:${email}:${role}`;
        setAuthToken(mockToken);
        setUser({ id: email.split('@')[0], email, role });
        return;
      }
      throw new Error('Please enter a valid email and a password of at least 6 characters.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
    if (data.session) {
      setAuthToken(data.session.access_token);
      setSession(data.session);
      setUser(extractUserFromSession(data.session));
    }
  };

  const signUp = async (email: string, password: string): Promise<{ needsConfirmation: boolean }> => {
    if (!isSupabaseConfigured) {
      if (import.meta.env.PROD) {
        throw new Error('Supabase authentication is not configured in this production deployment. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      }
      return { needsConfirmation: false };
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      throw error;
    }

    if (data.session) {
      setAuthToken(data.session.access_token);
      setSession(data.session);
      setUser(extractUserFromSession(data.session));
      return { needsConfirmation: false };
    }

    return { needsConfirmation: true };
  };

  const resetPassword = async (email: string): Promise<void> => {
    if (!isSupabaseConfigured) {
      throw new Error('Password reset requires active Supabase configuration.');
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch {
      // Ignore network errors on signout to guarantee local clearing
    } finally {
      setAuthToken(null);
      setUser(null);
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isConfigured: isSupabaseConfigured,
        login,
        signUp,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
