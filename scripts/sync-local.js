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

function buildCleanDialogueThread(messages, convId) {
  if (!Array.isArray(messages)) return `[nxlink_id:${convId}]`;
  const lines = [];

  for (const m of messages) {
    if (!m || !m.msgInfo) continue;
    let parsed = null;
    try {
      if (typeof m.msgInfo === 'string' && m.msgInfo.trim().startsWith('{')) {
        parsed = JSON.parse(m.msgInfo);
      } else if (typeof m.msgInfo === 'object') {
        parsed = m.msgInfo;
      }
    } catch (e) {}

    // Direction 1: Customer Speech
    if (m.direction === 1 && parsed && parsed.text) {
      lines.push(`[Customer]: "${parsed.text}"`);
      continue;
    }

    // Direction 2: Bot Speech
    if (m.direction === 2 && parsed && parsed.text) {
      lines.push(`[Bot]: "${parsed.text}"`);
      continue;
    }

    // Direction 3: System / Flow Step
    if (m.direction === 3 && parsed) {
      if (parsed.name && m.msgType === 201) {
        lines.push(`[System]: Flow Node Step -> ${parsed.name}`);
      } else if (parsed.flowNodeName && m.msgType === 307 && parsed.branches) {
        const selected = parsed.branches.find(b => b.selected);
        if (selected && selected.flowNodeName) {
          lines.push(`[System]: Selected Step -> ${selected.flowNodeName}`);
        }
      }
    }
  }

  let fullThread = lines.join('\n');
  fullThread += `\n[nxlink_id:${convId}]`;
  return fullThread;
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

function extractSummaryMetadata(messages, conv) {
  let sentiment = null;
  let summary = null;
  let nextSteps = null;
  let extractedName = null;
  let extractedPhone = null;

  if (Array.isArray(messages)) {
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
          const sumText = parsed.summarize;

          const sentMatch = sumText.match(/Customer Sentiment:\s*([^\r\n]+?)(?=\s*(?:Conversation Summary|Next Steps|Follow-up Suggestions|Follow Up Suggestions|Customer Name|Phone Number)|$)/i);
          const summMatch = sumText.match(/Conversation Summary:\s*([^\r\n]+?)(?=\s*(?:Next Steps|Follow-up Suggestions|Follow Up Suggestions|Customer Name|Phone Number)|$)/i);
          const stepsMatch = sumText.match(/(?:Next Steps|Follow-up Suggestions|Follow Up Suggestions):\s*([^\r\n]+?)(?=\s*(?:Customer Name|Phone Number)|$)/i);
          const nameMatch = sumText.match(/Customer Name:\s*([^\.\r\n]+)/i);
          const phoneMatch = sumText.match(/(?:Phone Number|Phone):\s*(0\d{8,10})/i);

          if (sentMatch && sentMatch[1]) sentiment = sentMatch[1].trim();
          if (summMatch && summMatch[1]) summary = summMatch[1].trim();
          if (stepsMatch && stepsMatch[1]) nextSteps = stepsMatch[1].trim();
          if (nameMatch && nameMatch[1]) extractedName = nameMatch[1].trim();
          if (phoneMatch && phoneMatch[1]) extractedPhone = phoneMatch[1].trim();

          if (!summary && !sumText.includes('Conversation Summary:')) {
            summary = sumText.replace(/(?:Follow-up Suggestions|Follow Up Suggestions|Next Steps|Customer Name|Phone Number):.*$/is, '').trim();
          }
        }
      }
    }
  }

  // Fallbacks from conv object
  if (!summary && conv.conv_summary) summary = conv.conv_summary;
  if (!summary && conv.summary) summary = conv.summary;

  // Clean trailing artifacts
  const cleanField = (val) => {
    if (!val) return null;
    let s = val.split(/\[nxlink_id:/i)[0].trim();
    s = s.replace(/Customer Name:.*$/is, '').replace(/Phone Number:.*$/is, '').replace(/["}'\\\}\],]+$/g, '').trim();
    return s.length > 0 ? s : null;
  };

  return {
    sentiment: cleanField(sentiment),
    summary: cleanField(summary),
    nextSteps: cleanField(nextSteps),
    extractedName: cleanField(extractedName),
    extractedPhone: cleanField(extractedPhone)
  };
}

async function main() {
  console.log('==========================================');
  console.log('🔄 NXLINK Local Ingestion & Sync Tool');
  console.log('   Target Flow: DentalHome_V2');
  console.log('==========================================');

  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing from .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  const credsPath = path.join(ROOT_DIR, '.nxlink_creds');
  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');

  if (!fs.existsSync(credsPath) || !fs.existsSync(pyScriptPath)) {
    console.error('❌ .nxlink_creds or nxlink_get_plat_token.py missing in project root.');
    process.exit(1);
  }

  console.log('🔑 Obtaining fresh plat_token via Playwright...');
  let token = '';
  try {
    token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();
  } catch (err) {
    console.error('❌ Error getting token:', err.message);
    process.exit(1);
  }

  console.log(`✓ Token retrieved (${token.slice(0, 20)}...)`);

  console.log('\n📥 Querying NXLINK AI Conversations API (Scanning Pages for DentalHome_V2)...');
  let conversations = [];

  for (let pageNum = 1; pageNum <= 10; pageNum++) {
    console.log(`   Fetching Page ${pageNum} (100 conversations)...`);
    const convResp = await fetch('https://app.nxlink.ai/admin/nx_flow_manager/conversation', {
      method: 'POST',
      headers: {
        'authorization': token,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        phone: null,
        tags: [],
        page_number: pageNum,
        page_size: 100,
        timeZone: 'UTC+08:00'
      })
    });

    if (convResp.ok) {
      const convData = await convResp.json();
      const pageList = Array.isArray(convData.list) ? convData.list : (Array.isArray(convData.data?.list) ? convData.data.list : (Array.isArray(convData.data) ? convData.data : []));
      conversations.push(...pageList);
    }
  }

  console.log(`Fetched ${conversations.length} total conversations from NXLINK. Filtering for DentalHome_V2...`);

  let insertedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    const convId = conv.id || conv.conversationId || conv.uuid;
    if (!convId) continue;

    // Check if already in Supabase
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .ilike('conversation_transcript', `%nxlink_id:${convId}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      skippedCount++;
      continue;
    }

    // Fetch transcript messages
    let messages = [];
    try {
      const msgResp = await fetch(`https://app.nxlink.ai/admin/nx_flow_manager/conversation/messages?pageSize=9999&pageNumber=1&conversationId=${convId}`, {
        headers: { 'authorization': token }
      });
      if (msgResp.ok) {
        const msgData = await msgResp.json();
        messages = msgData.data || msgData.list || [];
      }
    } catch (e) {
      console.warn(`     Warning: transcript fetch failed for ${convId}`);
    }

    // FILTER ONLY DENTALHOME_V2 FLOWS
    let isDentalHomeV2 = false;
    if (conv.flow_name === 'DentalHome_V2' || conv.auto_flow_name === 'DentalHome_V2') {
      isDentalHomeV2 = true;
    } else {
      for (const m of messages) {
        if (m.autoFlowId === 1650) {
          isDentalHomeV2 = true;
          break;
        }
        if (m.msgType === 200 && m.msgInfo) {
          try {
            const p = typeof m.msgInfo === 'string' ? JSON.parse(m.msgInfo) : m.msgInfo;
            if (p.name === 'DentalHome_V2') {
              isDentalHomeV2 = true;
              break;
            }
          } catch (e) {}
        }
      }
    }

    if (!isDentalHomeV2) {
      skippedCount++;
      continue;
    }

    console.log(`   Processing DentalHome_V2 conversation #${i + 1} (ID: ${convId})...`);

    // Build clean dialogue thread
    const cleanTranscript = buildCleanDialogueThread(messages, convId);

    // Extract tags
    let tagsList = [];
    if (Array.isArray(conv.tags)) {
      tagsList = conv.tags.map(t => typeof t === 'string' ? t : t.name).filter(Boolean);
    }

    // Extract audio URL
    let callAudioUrl = conv.call_audio_url || conv.callAudioUrl || null;
    if (!callAudioUrl && Array.isArray(messages)) {
      for (const m of messages) {
        if (m.msgInfo && typeof m.msgInfo === 'string' && m.msgInfo.includes('audio_url')) {
          try {
            const parsed = JSON.parse(m.msgInfo);
            if (parsed.audio_url) {
              callAudioUrl = parsed.audio_url;
              break;
            }
          } catch (e) {}
        }
      }
    }

    // Extract sentiment, summary, next steps structured metadata
    const { sentiment, summary, nextSteps, extractedName, extractedPhone } = extractSummaryMetadata(messages, conv);

    // Date formatting (NXLINK created_at timestamp)
    let convDate = new Date().toISOString().split('T')[0];
    let convTime = new Date().toISOString().split('T')[1].split('.')[0];
    const rawTs = conv.created_at || conv.createdAt || conv.create_time || conv.createTime;
    if (rawTs) {
      const tsMs = typeof rawTs === 'number' ? (rawTs > 10000000000 ? rawTs : rawTs * 1000) : new Date(rawTs).getTime();
      if (!isNaN(tsMs)) {
        const d = new Date(tsMs);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        convDate = `${y}-${m}-${day}`;
        convTime = `${hh}:${mm}:${ss}`;
      }
    }

    // Extract customer name & phone
    let customerName = extractedName || conv.customer_name;
    let customerPhone = extractedPhone || conv.customer_phone || conv.phone_number;

    if (!customerName || customerName.startsWith('Customer #') || customerName.startsWith('Anonymous')) {
      for (const m of messages) {
        if (m && m.msgInfo) {
          try {
            const parsed = typeof m.msgInfo === 'string' ? JSON.parse(m.msgInfo) : m.msgInfo;
            const text = parsed?.message?.text || parsed?.text || '';
            if (text) {
              const matchNamePhone = text.match(/^([A-Za-z\s]+),\s*(0\d{8,10})/);
              if (matchNamePhone) {
                customerName = matchNamePhone[1].trim();
                customerPhone = matchNamePhone[2].trim();
                break;
              }
              const matchNameOnly = text.match(/Name:\s*([A-Za-z\s]+)/i);
              const matchPhoneOnly = text.match(/(?:Phone\s*Number|Phone):\s*(0\d{8,10})/i);
              if (matchNameOnly) customerName = matchNameOnly[1].trim();
              if (matchPhoneOnly) customerPhone = matchPhoneOnly[1].trim();
            }
          } catch (e) {}
        }
      }
    }

    // Strip Customer Name & Phone Number prefixes out of summary text
    let cleanSummary = summary;
    if (cleanSummary) {
      cleanSummary = cleanSummary
        .replace(/(?:Customer\s*)?Name:\s*[A-Za-z\s]+\.?\s*/gi, '')
        .replace(/(?:Phone\s*Number|Phone):\s*0\d{8,10}\.?\s*/gi, '')
        .replace(/^[\s,.-]+/, '')
        .trim();
    }

    const { error: insertErr } = await supabase
      .from('conversations')
      .insert([{
        customer_name: customerName || conv.customer_phone || `Customer #${convId}`,
        phone_number: customerPhone || null,
        email_address: conv.email_address || null,
        customer_sentiment: sentiment || 'Neutral',
        company_name: conv.company_name || null,
        conversation_summary: cleanSummary || 'DentalHome_V2 AI Bot Consultation',
        next_steps: nextSteps || null,
        conversation_date: convDate,
        conversation_time: convTime,
        conversation_tags: tagsList.length > 0 ? tagsList : null,
        conversation_transcript: cleanTranscript,
        call_audio_url: callAudioUrl
      }]);

    if (insertErr) {
      console.error(`     ❌ Supabase Insert Error for ${convId}:`, insertErr.message);
    } else {
      console.log(`     ✅ Synced DentalHome_V2 ID ${convId} (${customerName || 'Anonymous'}) ${callAudioUrl ? '(With Audio MP3 🎵)' : ''}`);
      insertedCount++;

      // Auto-push to 3rd party webhook if record qualifies under tag rules
      if (shouldSyncToWebhook(tagsList)) {
        try {
          const webhookUrl = process.env.NXLINK_WEBHOOK_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
          const clientId = process.env.NXLINK_WEBHOOK_CLIENT_ID || 'nxw_41ef8e4dee35cd8e4c6c1d3e';
          const clientSecret = process.env.NXLINK_WEBHOOK_CLIENT_SECRET || '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

          const autoPayload = {
            fields: {
              "Conversation ID": convId.toString(),
              "Customer Name": customerName || 'Unknown',
              "Phone Number": customerPhone || 'Not Provided',
              "Company Name": conv.company_name || null,
              "Email Address": conv.email_address || null,
              "Tags": tagsList,
              "Full Summary": cleanSummary || null,
              "Sentiment": sentiment || 'Neutral',
              "Next Steps": nextSteps || null,
              "Call Audio URL": callAudioUrl || null,
              "Conversation Date": convDate
            }
          };

          const wbResp = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'client_id': clientId,
              'client_secret': clientSecret
            },
            body: JSON.stringify(autoPayload)
          });

          if (wbResp.ok) {
            console.log(`     🚀 Auto-pushed ID ${convId} to 3rd party Webhook!`);
          }
        } catch (wbErr) {
          console.error(`     ⚠️ Auto Webhook Push Error for ${convId}:`, wbErr.message);
        }
      }
    }
  }

  console.log('\n==========================================');
  console.log(`🎉 INGESTION COMPLETE!`);
  console.log(`   DentalHome_V2 records inserted: ${insertedCount}`);
  console.log(`   Skipped (other flows / existing): ${skippedCount}`);
  console.log('==========================================');
}

main().catch(console.error);
