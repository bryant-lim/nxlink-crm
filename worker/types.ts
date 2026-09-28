export interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  API_SECRET_KEY?: string;
  NXLINK_WEBHOOK_URL?: string;
  NXLINK_WEBHOOK_CLIENT_ID?: string;
  NXLINK_WEBHOOK_CLIENT_SECRET?: string;
  NXLINK_PLAT_TOKEN?: string;
  NXAI_TOKEN_URL?: string;
  NXLINK_SYNC_INTERVAL_MINUTES?: string;
}
