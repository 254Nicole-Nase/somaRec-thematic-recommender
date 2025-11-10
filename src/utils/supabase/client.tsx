import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "./info";

// Create a single Supabase client instance to avoid multiple GoTrueClient instances
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey
);