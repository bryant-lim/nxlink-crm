import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

// Parse .env file manually
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

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
});

function getFormattedTimestamp() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function backfillWebhookSynced() {
  console.log('Fetching conversations to set webhook_status to synced...');
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, conversation_tags, webhook_status');

  if (error) {
    console.error('Error fetching conversations:', error);
    process.exit(1);
  }

  console.log(`Found ${convs.length} total records.`);

  const nowTs = getFormattedTimestamp();
  let updatedCount = 0;

  for (const c of convs) {
    const { error: updateErr } = await supabase
      .from('conversations')
      .update({
        webhook_status: 'synced',
        webhook_error: null,
        webhook_synced_at: nowTs
      })
      .eq('id', c.id);

    if (updateErr) {
      console.error(`Failed to update record ${c.id}:`, updateErr);
    } else {
      updatedCount++;
    }
  }

  console.log(`✅ Successfully backfilled ${updatedCount} records to webhook_status = 'synced'.`);
}

backfillWebhookSynced();
