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

function getConvoId(c) {
  if (c.conversation_transcript) {
    const match = c.conversation_transcript.match(/\[nxlink_id:(.*?)\]/);
    if (match && match[1]) return match[1];
  }
  return c.id ? c.id.slice(0, 8) : 'N/A';
}

function shouldSyncToWebhook(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return false;

  const lowerTags = tags.map(t => (typeof t === 'string' ? t.toLowerCase().trim() : ''));

  // Exclude routing-only tags (e.g. ["to agent"], ["branch agent"], ["to agent", "branch agent"])
  const routingOnlyTags = ['to agent', 'branch agent', 'contact agent'];
  const isOnlyRouting = lowerTags.every(t => routingOnlyTags.includes(t));
  if (isOnlyRouting) return false;

  // Exclude non-lead operational flows (Emergency, Check Booking)
  const hasEmergencyOrCheckBooking = lowerTags.some(t =>
    t.includes('emergency') || t.includes('check booking')
  );
  if (hasEmergencyOrCheckBooking) return false;

  // Sync if contains Hot Lead or Booking Appointment
  return lowerTags.some(t => t.includes('hot lead') || t.includes('booking appointment'));
}

async function main() {
  console.log('==========================================');
  console.log('🚀 NXLINK 3rd Party Webhook Sync Tool');
  console.log('==========================================');

  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const webhookUrl = process.env.NXLINK_WEBHOOK_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
  const clientId = process.env.NXLINK_WEBHOOK_CLIENT_ID || 'nxw_41ef8e4dee35cd8e4c6c1d3e';
  const clientSecret = process.env.NXLINK_WEBHOOK_CLIENT_SECRET || '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  console.log('📥 Fetching conversations from Supabase...');
  const { data: convos, error } = await supabase
    .from('conversations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !convos) {
    console.error('❌ Error reading conversations:', error?.message);
    process.exit(1);
  }

  // Filter conversations based on Webhook rules (hot lead/booking, exclude emergency & check booking & routing-only)
  const taggedConvos = convos.filter(c => shouldSyncToWebhook(c.conversation_tags));

  console.log(`Found ${convos.length} total conversations in Supabase.`);
  console.log(`Filtered ${taggedConvos.length} conversation(s) with 1 or more tags (Skipped ${convos.length - taggedConvos.length} untagged records).\n`);

  if (taggedConvos.length === 0) {
    console.log('ℹ️ No tagged records found to sync.');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < taggedConvos.length; i++) {
    const c = taggedConvos[i];
    const nxlinkId = getConvoId(c);

    const payload = {
      fields: {
        "Conversation ID": nxlinkId,
        "Customer Name": c.customer_name || 'Unknown',
        "Phone Number": c.phone_number || 'Not Provided',
        "Company Name": c.company_name || null,
        "Email Address": c.email_address || null,
        "Tags": c.conversation_tags,
        "Full Summary": c.conversation_summary || null,
        "Sentiment": c.customer_sentiment || 'Neutral',
        "Next Steps": c.next_steps || null,
        "Call Audio URL": c.call_audio_url || null,
        "Conversation Date": c.conversation_date || null
      }
    };

    console.log(`   Posting #${i + 1}/${taggedConvos.length} (ID: ${nxlinkId}, Name: ${c.customer_name})...`);

    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'client_id': clientId,
          'client_secret': clientSecret
        },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        console.log(`     ✅ Webhook delivery successful!`);
        successCount++;
      } else {
        const text = await resp.text();
        console.error(`     ❌ Webhook returned HTTP ${resp.status}:`, text);
        failCount++;
      }
    } catch (err) {
      console.error(`     ❌ Webhook request failed:`, err.message);
      failCount++;
    }
  }

  console.log('\n==========================================');
  console.log(`🎉 WEBHOOK SYNC COMPLETE!`);
  console.log(`   Successful deliveries: ${successCount}`);
  console.log(`   Failed deliveries: ${failCount}`);
  console.log('==========================================');
}

main().catch(console.error);
