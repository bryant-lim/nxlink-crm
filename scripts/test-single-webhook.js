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
  const searchId = process.argv[2] || '2877223';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  console.log(`🔍 Searching Supabase for ID ${searchId}...`);
  const { data: convos, error } = await supabase.from('conversations').select('*');

  if (error || !convos) {
    console.error('Error:', error);
    return;
  }

  const match = convos.find(c => {
    if (c.id && c.id.toLowerCase().includes(searchId.toLowerCase())) return true;
    if (c.conversation_transcript && c.conversation_transcript.includes(searchId)) return true;
    return false;
  });

  if (match) {
    console.log('📌 MATCH FOUND:');
    console.log(`  Customer: ${match.customer_name}, Phone: ${match.phone_number}, Tags: ${JSON.stringify(match.conversation_tags)}`);

    const webhookUrl = process.env.NXLINK_WEBHOOK_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
    const clientId = process.env.NXLINK_WEBHOOK_CLIENT_ID || 'nxw_41ef8e4dee35cd8e4c6c1d3e';
    const clientSecret = process.env.NXLINK_WEBHOOK_CLIENT_SECRET || '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

    const getConvoId = (c) => {
      if (c.conversation_transcript) {
        const m = c.conversation_transcript.match(/\[nxlink_id:(.*?)\]/);
        if (m && m[1]) return m[1];
      }
      return c.id ? c.id.slice(0, 8) : 'N/A';
    };

    const payload = {
      fields: {
        "Conversation ID": getConvoId(match),
        "Customer Name": match.customer_name || 'Unknown',
        "Phone Number": match.phone_number || 'Not Provided',
        "Company Name": match.company_name || null,
        "Email Address": match.email_address || null,
        "Tags": match.conversation_tags,
        "Full Summary": match.conversation_summary || null,
        "Sentiment": match.customer_sentiment || 'Neutral',
        "Next Steps": match.next_steps || null,
        "Call Audio URL": match.call_audio_url || null,
        "Conversation Date": match.conversation_date || null
      }
    };

    console.log('\n📤 Pushing to Webhook:', JSON.stringify(payload, null, 2));

    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client_id': clientId,
        'client_secret': clientSecret
      },
      body: JSON.stringify(payload)
    });

    console.log(`HTTP Status: ${resp.status} ${resp.statusText}`);
    const text = await resp.text();
    console.log('Response:', text);

  } else {
    console.log(`❌ No record found matching ID ${searchId}`);
  }
}

main().catch(console.error);
