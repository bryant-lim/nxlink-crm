import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valParts] = trimmed.split('=');
        if (key && valParts.length > 0) {
          process.env[key.trim()] = valParts.join('=').trim();
        }
      }
    }
  }
}

async function main() {
  loadEnv();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  console.log('🧹 Cleaning old unsanitized conversations from Supabase...');
  await supabase.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('✓ Old records cleared.');

  console.log('\n🚀 Triggering fresh sanitized local sync...');
  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');
  execSync(`node "${path.join(ROOT_DIR, 'scripts', 'sync-local.js')}"`, { stdio: 'inherit', cwd: ROOT_DIR });
}

main().catch(console.error);
