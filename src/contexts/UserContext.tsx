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
          // Try to fetch user profile from profiles table (RLS will ensure user can only see their own)
          try {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('id, email, name, role, is_admin')
              .eq('id', session.user.id)
              .single();
            
            if (profile && !profileError) {
              // Use profile from database
              setUser({
                id: session.user.id,
                email: profile.email || session.user.email || '',
                name: profile.name || session.user.user_metadata?.name || 'User',
                role: (profile.is_admin ? 'admin' : profile.role) || session.user.user_metadata?.role || 'reader'
              });
            } else {
              // Fallback to user metadata if profile doesn't exist
              console.warn('Profile not found, using user metadata:', profileError);
              setUser({
                id: session.user.id,
                email: session.user.email || '',
                name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || 'User',
                role: session.user.user_metadata?.role || 'reader'
              });
            }
          } catch (fetchError) {
            console.warn('Error fetching profile, using fallback user data:', fetchError);
            // Fallback to user metadata
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || 'User',
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
      } else if (event === 'SIGNED_IN' && session?.user) {
        // Refresh user profile when signed in
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, name, role, is_admin')
            .eq('id', session.user.id)
            .single();
          
          if (profile) {
            setUser({
              id: session.user.id,
              email: profile.email || session.user.email || '',
              name: profile.name || session.user.user_metadata?.name || 'User',
              role: (profile.is_admin ? 'admin' : profile.role) || session.user.user_metadata?.role || 'reader'
            });
          }
        } catch (error) {
          console.warn('Error refreshing profile on sign in:', error);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (userData: any) => {
    // Try to fetch user profile from profiles table
    try {
      const userId = userData.id || userData.user?.id;
      if (userId) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, name, role, is_admin')
          .eq('id', userId)
          .single();
        
        if (profile && !profileError) {
          // Use profile from database
          setUser({
            id: userId,
            email: profile.email || userData.email,
            name: profile.name || userData.user_metadata?.name || 'User',
            role: (profile.is_admin ? 'admin' : profile.role) || userData.user_metadata?.role || 'reader'
          });
          return;
        }
      }
    } catch (error) {
      console.warn('Error fetching profile during login, using fallback data:', error);
    }
    
    // Fallback user data when profile is unavailable
    setUser({
      id: userData.id || userData.user?.id,
      email: userData.email || userData.user?.email,
      name: userData.user_metadata?.name || userData.user_metadata?.full_name || 'User',
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