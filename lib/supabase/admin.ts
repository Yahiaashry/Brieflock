import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const globalSupabase = globalThis as typeof globalThis & {
  __brieflockAdminClient?: SupabaseClient;
};

export function adminClient(): SupabaseClient {
  if (globalSupabase.__brieflockAdminClient) {
    return globalSupabase.__brieflockAdminClient;
  }

  const config = env();
  const client = createClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "X-Client-Info": "brieflock-api" },
      },
    },
  );

  globalSupabase.__brieflockAdminClient = client;
  return client;
}

export function resetAdminClientForTests() {
  delete globalSupabase.__brieflockAdminClient;
}
