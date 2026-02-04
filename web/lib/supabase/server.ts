// Stub server-side Supabase helper.
import { supabase } from "./client";

export function supabaseServerWithToken(_accessToken: string) {
  return supabase;
}
