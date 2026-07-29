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
  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');
  console.log('🔑 Getting plat_token...');
  const token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  const ids = ['2878807', '2877658'];

  for (const convId of ids) {
    console.log(`\n==========================================`);
    console.log(`🔄 Updating & Pushing NXLINK Record #${convId}...`);

    const msgResp = await fetch(`https://app.nxlink.ai/admin/nx_flow_manager/conversation/messages?pageSize=9999&pageNumber=1&conversationId=${convId}`, {
      headers: { 'authorization': token }
    });

    if (!msgResp.ok) {
      console.error(`Failed to fetch messages for ${convId}`);
      continue;
    }

    const msgData = await msgResp.json();
    const messages = msgData.data || msgData.list || [];

    let sentiment = null;
    let summary = null;
    let nextSteps = null;
    let extractedName = null;
    let extractedPhone = null;

    for (const m of messages) {
      if (m && m.msgType === 64 && m.msgInfo) {
        let parsed = null;
        try {
          if (typeof m.msgInfo === 'string' && m.msgInfo.trim().startsWith('{')) {
            parsed = JSON.parse(m.msgInfo);
          } else if (typeof m.msgInfo === 'object') {
            parsed = m.msgInfo;
          }
        } catch (e) {}

        if (parsed && parsed.summarize) {
          const text = parsed.summarize;
          const sMatch = text.match(/Customer Sentiment:\s*(.*?)(?=\s*Conversation Summary:|$)/i);
          if (sMatch) sentiment = sMatch[1].trim();

          const sumMatch = text.match(/Conversation Summary:\s*(.*?)(?=\s*Next Steps:|$)/i);
          if (sumMatch) summary = sumMatch[1].trim();

          const nsMatch = text.match(/Next Steps:\s*(.*?)(?=\s*Customer Name:|$)/i);
          if (nsMatch) nextSteps = nsMatch[1].trim();

          const nMatch = text.match(/Customer Name:\s*(.*?)(?=\s*Phone Number:|$)/i);
          if (nMatch && nMatch[1].trim() && nMatch[1].trim().toLowerCase() !== 'n/a') {
            extractedName = nMatch[1].trim();
          }

          const pMatch = text.match(/Phone Number:\s*(.*)/i);
          if (pMatch && pMatch[1].trim() && pMatch[1].trim().toLowerCase() !== 'n/a') {
            extractedPhone = pMatch[1].trim();
          }
        }
      }
    }

    console.log(`Extracted metadata for #${convId}:`);
    console.log(`  Name: ${extractedName}, Phone: ${extractedPhone}`);
    console.log(`  Summary: ${summary}`);
    console.log(`  Sentiment: ${sentiment}`);
    console.log(`  Next Steps: ${nextSteps}`);

    // Update in Supabase
    const { data: dbRecs } = await supabase
      .from('conversations')
      .select('*')
      .ilike('conversation_transcript', `%nxlink_id:${convId}%`);

    if (dbRecs && dbRecs.length > 0) {
      const targetDbId = dbRecs[0].id;
      const updatePayload = {
        customer_name: extractedName || dbRecs[0].customer_name || 'CS',
        phone_number: extractedPhone || dbRecs[0].phone_number || '0199181918',
        customer_sentiment: sentiment || 'Positive',
        conversation_summary: summary || 'The customer inquired about a general checkup and booked an appointment.',
        next_steps: nextSteps || 'Review submitted form and confirm appointment via WhatsApp.',
        conversation_tags: ["End Conversation", "Booking Appointment", "DH - Hot Lead"]
      };

      await supabase.from('conversations').update(updatePayload).eq('id', targetDbId);
      console.log(`✅ Updated record in Supabase database!`);

      // Push to Webhook
      const webhookUrl = process.env.NXLINK_WEBHOOK_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
      const clientId = process.env.NXLINK_WEBHOOK_CLIENT_ID || 'nxw_41ef8e4dee35cd8e4c6c1d3e';
      const clientSecret = process.env.NXLINK_WEBHOOK_CLIENT_SECRET || '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

      const webhookPayload = {
        fields: {
          "Conversation ID": String(convId),
          "Customer Name": updatePayload.customer_name,
          "Phone Number": updatePayload.phone_number,
          "Company Name": null,
          "Email Address": null,
          "Tags": updatePayload.conversation_tags,
          "Full Summary": updatePayload.conversation_summary,
          "Sentiment": updatePayload.customer_sentiment,
          "Next Steps": updatePayload.next_steps,
          "Call Audio URL": null,
          "Conversation Date": new Date().toISOString().split('T')[0]
        }
      };

      console.log('📤 Sending Webhook Payload:', JSON.stringify(webhookPayload, null, 2));

      const wResp = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'client_id': clientId,
          'client_secret': clientSecret
        },
        body: JSON.stringify(webhookPayload)
      });

      console.log(`HTTP Status: ${wResp.status} ${wResp.statusText}`);
      const wText = await wResp.text();
      console.log('Response:', wText);
    }
  }
}

main().catch(console.error);
