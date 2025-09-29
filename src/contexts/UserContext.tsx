import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../utils/supabase/client";

interface User {
  id: string;
  email: string;
  name: string;
  role: "reader" | "admin";
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  login: (userData: any) => void;
  logout: () => void;
  isAdmin: boolean;
  signInWithProvider: (provider: "google" | "github") => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user has an active session
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Try to fetch user profile from server
          try {
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/profile`, {
              headers: {
                'Authorization': `Bearer ${session.access_token}`
              }
            });
            
            if (response.ok) {
              const profile = await response.json();
              setUser({
                id: session.user.id,
                email: session.user.email || '',
                name: profile.name,
                role: profile.role
              });
            } else {
              // Fallback to user metadata if server is unavailable
              setUser({
                id: session.user.id,
                email: session.user.email || '',
                name: session.user.user_metadata?.name || 'User',
                role: session.user.user_metadata?.role || 'reader'
              });
            }
          } catch (fetchError) {
            console.warn('Server unavailable, using fallback user data:', fetchError);
            // Fallback to user metadata
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || 'User',
              role: session.user.user_metadata?.role || 'reader'
            });
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (userData: any) => {
    // Try to fetch user profile from server
    try {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/profile`, {
        headers: {
          'Authorization': `Bearer ${userData.access_token || userData.session?.access_token}`
        }
      });
      
      if (response.ok) {
        const profile = await response.json();
        setUser({
          id: userData.id,
          email: userData.email,
          name: profile.name,
          role: profile.role
        });
        return;
      }
    } catch (error) {
      console.warn('Server unavailable during login, using fallback data:', error);
    }
    
    // Fallback user data when server is unavailable
    setUser({
      id: userData.id,
      email: userData.email,
      name: userData.user_metadata?.name || 'User',
      role: userData.user_metadata?.role || 'reader'
    });
  };


  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // OAuth sign-in logic
  const signInWithProvider = async (provider: "google" | "github") => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider });
      if (error) throw error;
      // User will be redirected to provider and back
    } catch (error) {
      console.error(`OAuth sign-in error (${provider}):`, error);
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAdmin: user?.role === "admin",
    signInWithProvider,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}