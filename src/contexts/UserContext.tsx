import { createContext, useContext, useEffect, useState } from "react";
import type { User as AuthUser } from "@supabase/supabase-js";
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
    let active = true;

    const loadProfile = async (authUser: AuthUser) => {
      const fallback: User = {
        id: authUser.id,
        email: authUser.email || "",
        name: authUser.user_metadata?.name || authUser.user_metadata?.full_name || "User",
        role: authUser.user_metadata?.role || "reader",
      };
      try {
        // RLS lets a user read only their own profile row.
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id, email, name, role, is_admin")
          .eq("id", authUser.id)
          .single();
        if (!active) return;
        if (profile && !error) {
          setUser({
            id: authUser.id,
            email: profile.email || fallback.email,
            name: profile.name || fallback.name,
            role: (profile.is_admin ? "admin" : profile.role) || fallback.role,
          });
        } else {
          console.warn("Profile not found, using account details:", error);
          setUser(fallback);
        }
      } catch (error) {
        console.warn("Error fetching profile, using account details:", error);
        if (active) setUser(fallback);
      } finally {
        if (active) setLoading(false);
      }
    };

    // Fires INITIAL_SESSION on page load, then SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT.
    // The callback must not await Supabase calls: supabase-js holds its auth lock while
    // it runs (for example when it refreshes the token after the tab comes back into
    // view), so a query here deadlocks every later Supabase call, including sign-in.
    // Profile loading is therefore deferred until after the callback returns.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      if (event === "TOKEN_REFRESHED") return; // same person, nothing to reload
      const authUser = session.user;
      setTimeout(() => {
        if (active) loadProfile(authUser);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
      // Come back to the site the person started from (production or a preview deployment).
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
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