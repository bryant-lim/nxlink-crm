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
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  console.log('🔍 Testing profile insert with ANON KEY...');

  const testPayload = {
    id: crypto.randomUUID(),
    username: 'anonuser_' + Date.now().toString().slice(-4),
    email: `anonuser_${Date.now()}@example.com`,
    name: 'Anon User',
    mobile: '0123456789',
    role: 'support',
    is_active: true
  };

  const { data, error } = await supabase
    .from('profiles')
    .insert([testPayload])
    .select();

  if (error) {
    console.error('❌ Insert Error with ANON KEY:', error);
  } else {
    console.log('✅ Insert Successful:', data);
  }
}

main().catch(console.error);
