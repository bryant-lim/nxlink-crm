import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

function netlifyFunctionsDevPlugin(): Plugin {
  return {
    name: 'netlify-functions-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();

        if (req.url.startsWith('/.netlify/functions/sync-nxlink')) {
          console.log('\n==========================================');
          console.log('🔄 [DEV SYNC] Triggered NXLINK Sync via UI Button');
          console.log('==========================================');

          try {
            const env = loadEnv(server.config.mode || 'development', process.cwd(), '');
            const rootDir = process.cwd();
            const pyScriptPath = path.join(rootDir, 'nxlink_get_plat_token.py');

            console.log('[Dev Sync] Getting plat_token...');
            let token = process.env.NXLINK_PLAT_TOKEN || env.NXLINK_PLAT_TOKEN || '';
            if (!token) {
              try {
                token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: rootDir }).trim();
              } catch (e) {
                const tokenUrl = process.env.NXAI_TOKEN_URL || env.NXAI_TOKEN_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxaiToken';
                try {
                  const tResp = await fetch(tokenUrl);
                  if (tResp.ok) {
                    const tData: any = await tResp.json();
                    token = tData.token || '';
                  }
                } catch (err) {}
              }
            }

            if (!token) {
              token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1SWQiOjUzMjc3LCJkZXZpY2VVbmlxdWVJZGVudGlmaWNhdGlvbiI6IjIyMmJkNjQwLTg5NjAtMTFmMS1hMGEzLWUxYTIyNTg1YTY0MSIsInV1SWQiOiI2YTZhOTQxMGU0YjA5OTU4MmFhY2JjOWEifQ.zQ-WHvsnm_5cyIQKCiTacukA7ZVPETinsDgjALM0OBI';
            }

            console.log('[Dev Sync] Querying NXLINK API...');
            const convResp = await fetch('https://app.nxlink.ai/admin/nx_flow_manager/conversation', {
              method: 'POST',
              headers: {
                'authorization': token,
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                phone: null,
                tags: [],
                page_number: 1,
                page_size: 100,
                timeZone: 'UTC+08:00'
              })
            });

            if (!convResp.ok) throw new Error(`NXLINK API HTTP ${convResp.status}`);
            const convData: any = await convResp.json();
            const list = Array.isArray(convData.list) ? convData.list : (Array.isArray(convData.data?.list) ? convData.data.list : (Array.isArray(convData.data) ? convData.data : []));

            console.log(`[Dev Sync] Fetched ${list.length} conversations from NXLINK. Filtering for DentalHome_V2...`);

            const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

            if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials missing in .env');

            const supabase = createClient(supabaseUrl, supabaseKey, {
              auth: { persistSession: false },
              realtime: { transport: WebSocket }
            });

            let syncedCount = 0;
            let webhookCount = 0;

            for (const conv of list) {
              const flowName = conv.auto_flow_name || conv.autoFlowName || '';
              if (!flowName.toLowerCase().includes('dentalhome')) continue;

              const convId = conv.id || conv.conversationId || conv.uuid;
              if (!convId) continue;

              const msgResp = await fetch(`https://app.nxlink.ai/admin/nx_flow_manager/conversation/messages?pageSize=9999&pageNumber=1&conversationId=${convId}`, {
                headers: { 'authorization': token }
              });

              let messages: any[] = [];
              if (msgResp.ok) {
                const msgData: any = await msgResp.json();
                messages = msgData.data || msgData.list || [];
              }

              let sentiment: string | null = null;
              let summary: string | null = null;
              let nextSteps: string | null = null;
              let extractedName: string | null = null;
              let extractedPhone: string | null = null;

              for (const m of messages) {
                if (m && m.msgType === 64 && m.msgInfo) {
                  let parsed: any = null;
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

              const finalName = extractedName || conv.customer_name || conv.customerName || null;
              const finalPhone = extractedPhone || conv.customer_phone || conv.phone || null;

              let tagsList: string[] = [];
              if (Array.isArray(conv.tags)) {
                tagsList = conv.tags.map((t: any) => (typeof t === 'string' ? t : t.name)).filter(Boolean);
              }

              let callAudioUrl: string | null = conv.call_audio_url || conv.callAudioUrl || null;
              if (!callAudioUrl && Array.isArray(messages)) {
                for (const m of messages) {
                  if (m.msgInfo && typeof m.msgInfo === 'string' && m.msgInfo.includes('audio_url')) {
                    try {
                      const parsed = JSON.parse(m.msgInfo);
                      if (parsed.audio_url) { callAudioUrl = parsed.audio_url; break; }
                    } catch (e) {}
                  }
                }
              }

              const rawTranscript = `[nxlink_id:${convId}]`;

              const { data: existing } = await supabase
                .from('conversations')
                .select('id, customer_name, conversation_summary, conversation_tags')
                .ilike('conversation_transcript', `%nxlink_id:${convId}%`)
                .limit(1);

              let wasIngestedOrUpdated = false;

              if (existing && existing.length > 0) {
                const row = existing[0];
                const tagsChanged = tagsList.length > 0 && JSON.stringify(row.conversation_tags || []) !== JSON.stringify(tagsList);
                if (!row.customer_name || !row.conversation_summary || tagsChanged) {
                  await supabase.from('conversations').update({
                    customer_name: finalName,
                    phone_number: finalPhone,
                    customer_sentiment: sentiment,
                    conversation_summary: summary,
                    next_steps: nextSteps,
                    conversation_tags: tagsList,
                    call_audio_url: callAudioUrl
                  }).eq('id', row.id);
                  wasIngestedOrUpdated = true;
                }
              } else {
                const { error: insErr } = await supabase.from('conversations').insert([{
                  customer_name: finalName,
                  phone_number: finalPhone,
                  customer_sentiment: sentiment,
                  conversation_summary: summary,
                  next_steps: nextSteps,
                  company_name: conv.company_name || null,
                  email_address: conv.email_address || null,
                  conversation_tags: tagsList,
                  conversation_date: new Date().toISOString().split('T')[0],
                  conversation_time: new Date().toISOString().split('T')[1].split('.')[0],
                  conversation_transcript: rawTranscript,
                  call_audio_url: callAudioUrl
                }]);

                if (!insErr) {
                  syncedCount++;
                  wasIngestedOrUpdated = true;
                }
              }

                // Check webhook auto-push
                const lowerTags = tagsList.map(t => t.toLowerCase().trim());
                const routingOnly = ['to agent', 'branch agent', 'contact agent'];
                const isOnlyRouting = lowerTags.every(t => routingOnly.includes(t));
                const hasEmergency = lowerTags.some(t => t.includes('emergency') || t.includes('check booking'));
                const shouldPush = !isOnlyRouting && !hasEmergency && lowerTags.some(t => t.includes('hot lead') || t.includes('booking appointment'));

                if (shouldPush) {
                  const webhookUrl = process.env.NXLINK_WEBHOOK_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
                  const clientId = process.env.NXLINK_WEBHOOK_CLIENT_ID || 'nxw_41ef8e4dee35cd8e4c6c1d3e';
                  const clientSecret = process.env.NXLINK_WEBHOOK_CLIENT_SECRET || '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

                  try {
                    await fetch(webhookUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'client_id': clientId, 'client_secret': clientSecret },
                      body: JSON.stringify({
                        fields: {
                          "Conversation ID": String(convId),
                          "Customer Name": finalName || 'Unknown',
                          "Phone Number": finalPhone || 'Not Provided',
                          "Company Name": conv.company_name || null,
                          "Email Address": conv.email_address || null,
                          "Tags": tagsList,
                          "Full Summary": summary || null,
                          "Sentiment": sentiment || 'Neutral',
                          "Next Steps": nextSteps || null,
                          "Call Audio URL": callAudioUrl,
                          "Conversation Date": new Date().toISOString().split('T')[0]
                        }
                      })
                    });
                    webhookCount++;
                    console.log(`[Dev Sync] 🚀 Auto-pushed #${convId} to Webhook!`);
                  } catch (e) {}
                }
              }
            }

            console.log(`[Dev Sync] ✅ Sync Finished: ${syncedCount} inserted, ${webhookCount} pushed to webhook.`);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, syncedCount, webhookCount, totalFound: list.length }));
            return;
          } catch (err: any) {
            console.error('[Dev Sync Error]:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Sync failed' }));
            return;
          }
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), netlifyFunctionsDevPlugin()],
});
