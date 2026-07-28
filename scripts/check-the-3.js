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

  const ids = ['2877519', '2877483', '2877500'];

  for (const id of ids) {
    console.log(`\n🔍 Checking Supabase for ID ${id}...`);
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .ilike('conversation_transcript', `%nxlink_id:${id}%`);

    if (data && data.length > 0) {
      const rec = data[0];
      console.log(`📌 RECORD FOUND IN SUPABASE:`);
      console.log(`   Customer Name: ${rec.customer_name}`);
      console.log(`   Phone Number: ${rec.phone_number}`);
      console.log(`   Tags in Database:`, rec.conversation_tags);
    } else {
      console.log(`❌ Not found in Supabase!`);
    }
  }
}

main().catch(console.error);
