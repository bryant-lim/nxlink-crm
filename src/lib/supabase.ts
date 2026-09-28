import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://khwyzlhthadyyixjuhgb.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtod3l6bGh0aGFkeXlpeGp1aGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyODY5MzcsImV4cCI6MjA5OTg2MjkzN30.VG1GQpHX-SWGmS3yEc7BrnnGFPu0s59CElqd0yMUiBY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
