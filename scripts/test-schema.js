import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const [key, val] = line.split('=');
    if (key && val) {
      process.env[key.trim()] = val.trim();
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
});

async function testSchema() {
  const { data, error } = await supabase.from('conversations').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample row columns:', Object.keys(data[0] || {}));
    console.log('Sample row data:', data[0]);
  }
}

testSchema();
