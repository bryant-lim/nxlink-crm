import fs from 'fs';
import path from 'path';
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

  const ids = ['2878812', '2878807', '2878803', '2878797', '2878736', '2878533', '2878232', '2877713', '2877658'];

  for (const id of ids) {
    const { data } = await supabase
      .from('conversations')
      .select('id, customer_name, phone_number, conversation_tags')
      .ilike('conversation_transcript', `%nxlink_id:${id}%`);

    if (data && data.length > 0) {
      console.log(`✅ ID ${id} EXISTS in Supabase:`, data[0]);
    } else {
      console.log(`❌ ID ${id} NOT FOUND in Supabase!`);
    }
  }
}

main().catch(console.error);
