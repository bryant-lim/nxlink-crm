import { Env } from '../types';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function extractSummaryMetadata(messages: any[], conv: any) {
  let sentiment: string | null = null;
  let summary: string | null = null;
  let nextSteps: string | null = null;
  let extractedName: string | null = null;
  let extractedPhone: string | null = null;
  let extractedBranch: string | null = null;
  let extractedDate: string | null = null;

  const parseSummaryText = (text: string) => {
    if (!text) return;
    const sMatch = text.match(/Customer Sentiment:\s*(.*?)(?=\s*Conversation Summary:|$)/i);
    if (sMatch && !sentiment) sentiment = sMatch[1].trim();

    const sumMatch = text.match(/Conversation Summary:\s*(.*?)(?=\s*Next Steps:|$)/i);
    if (sumMatch && !summary) summary = sumMatch[1].trim();

    const nsMatch = text.match(/Next Steps:\s*(.*?)(?=\s*Customer Name:|$)/i);
    if (nsMatch && !nextSteps) nextSteps = nsMatch[1].trim();

    const nMatch = text.match(/Customer Name:\s*(.*?)(?=\s*Phone Number:|$)/i);
    if (nMatch && nMatch[1].trim() && nMatch[1].trim().toLowerCase() !== 'n/a' && !extractedName) {
      extractedName = nMatch[1].trim();
    }

    const pMatch = text.match(/Phone Number:\s*(.*?)(?=\s*Preferred Branch:|\s*Preferred Date:|$)/i);
    if (pMatch && pMatch[1].trim() && pMatch[1].trim().toLowerCase() !== 'n/a' && !extractedPhone) {
      extractedPhone = pMatch[1].trim();
    }

    const bMatch = text.match(/Preferred Branch:\s*(.*?)(?=\s*Preferred Date:|$)/i);
    if (bMatch && bMatch[1].trim() && bMatch[1].trim().toLowerCase() !== 'n/a' && !extractedBranch) {
      extractedBranch = bMatch[1].trim();
    }

    const dMatch = text.match(/Preferred Date:\s*(.*?)(?=$)/i);
    if (dMatch && dMatch[1].trim() && dMatch[1].trim().toLowerCase() !== 'n/a' && !extractedDate) {
      extractedDate = dMatch[1].trim();
    }
  };

  if (Array.isArray(messages)) {
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
          parseSummaryText(parsed.summarize);
        }
      }
    }
  }

  if (conv.conv_summary) parseSummaryText(conv.conv_summary);
  if (conv.summary) parseSummaryText(conv.summary);

  const cleanField = (val: string | null) => {
    if (!val) return null;
    let s = val.split(/\[nxlink_id:/i)[0].trim();
    s = s
      .replace(/(?:Customer Name|Phone Number|Preferred Branch|Preferred Date):.*$/is, '')
      .replace(/["}'\\\}\],]+$/g, '')
      .trim();
    return s.length > 0 ? s : null;
  };

  const cleanShortField = (val: string | null) => {
    const s = cleanField(val);
    if (!s) return null;
    return s.replace(/\.+$/, '').trim() || null;
  };

  const finalName = extractedName || conv.customer_name || conv.customerName || null;
  const finalPhone = extractedPhone || conv.customer_phone || conv.phone || null;
  const finalBranch = extractedBranch || conv.preferred_branch || conv.preferredBranch || null;
  const finalDate = extractedDate || conv.preferred_date || conv.preferredDate || null;

  return {
    customer_sentiment: cleanField(sentiment),
    conversation_summary: cleanField(summary),
    next_steps: cleanField(nextSteps),
    customer_name: cleanShortField(finalName),
    phone_number: cleanShortField(finalPhone),
    preferred_branch: cleanShortField(finalBranch),
    preferred_date: cleanShortField(finalDate)
  };
}

function shouldSyncToWebhook(tags: any[]) {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  const lowerTags = tags.map((t) => (typeof t === 'string' ? t.toLowerCase().trim() : ''));
  const routingOnlyTags = ['to agent', 'branch agent', 'contact agent'];
  const isOnlyRouting = lowerTags.every((t) => routingOnlyTags.includes(t));
  if (isOnlyRouting) return false;

  const hasEmergencyOrCheckBooking = lowerTags.some(
    (t) => t.includes('emergency') || t.includes('check booking')
  );
  if (hasEmergencyOrCheckBooking) return false;

  return lowerTags.some((t) => t.includes('hot lead') || t.includes('warm lead') || t.includes('booking appointment'));
}

function resolveChannel(conv: any): string {
  const sourceChannel = conv.source_channel || conv.sourceChannel;
  const instance = (conv.channel_instance || conv.channelInstance || '').toLowerCase();

  if (sourceChannel === 18 || instance.includes('whatsapp') || instance.includes('wa')) {
    return 'Whatsapp';
  }
  if (instance.includes('web') || instance.includes('livechat')) {
    return 'Webchat';
  }
  if (instance.includes('messenger') || instance.includes('fb') || instance.includes('facebook')) {
    return 'Messenger';
  }
  if (instance.includes('instagram') || instance.includes('ig')) {
    return 'Instagram';
  }

  switch (sourceChannel) {
    case 1:
    case 2:
      return 'Webchat';
    case 18:
      return 'Whatsapp';
    case 19:
      return 'Messenger';
    case 20:
      return 'Instagram';
    default:
      return conv.channel_instance || 'Whatsapp';
  }
}

export async function runNxlinkSync(env: Env) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  const tokenUrl = env.NXAI_TOKEN_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxaiToken';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials missing');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  let token = env.NXLINK_PLAT_TOKEN || '';

  if (!token) {
    try {
      const tokenResp = await fetch(tokenUrl);
      if (tokenResp.ok) {
        const tText = await tokenResp.text();
        try {
          const tData: any = JSON.parse(tText);
          token = tData.token || '';
        } catch (e) {}
      }
    } catch (e) {}
  }

  if (!token) {
    token = 'eyJhbGciOiJIUzI1NiJ9.eyJ1SWQiOjU3OTk0LCJkZXZpY2VVbmlxdWVJZGVudGlmaWNhdGlvbiI6IjQxOTNlYjUwLWJhZWItMTFmMS04NWI5LTgxOTNmODA2MGY2MSIsInV1SWQiOiI2YWI5ZGM3Y2U0YjA3YTQ1ZjQ0MDQ1ODYifQ.BidmK5Cfd2SGlfej8l7QsgV5eCkjph8X_YoTPFtan8E';
  }

  // Hard guard: verify active session belongs strictly to Tenant 4600
  const tenantCheckResp = await fetch('https://app.nxlink.ai/gw/v1/omni/admin/tenants', {
    headers: { authorization: token }
  });
  if (tenantCheckResp.ok) {
    const tCheckData: any = await tenantCheckResp.json();
    const activeTenantId = tCheckData.data?.tenant_id;
    if (activeTenantId !== 4600) {
      throw new Error(`Tenant safety violation: Active token tenant is ${activeTenantId}, expected 4600. Aborting sync.`);
    }
  } else {
    throw new Error(`Failed to verify tenant with NXLINK API (HTTP ${tenantCheckResp.status}). Aborting sync.`);
  }

  // Fetch dynamic Webhook URL from app_settings with fallback to env
  let dynamicWebhookUrl = env.NXLINK_WEBHOOK_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
  try {
    const { data: settingRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'nxlink_webhook_url')
      .single();
    if (settingRow?.value?.trim()) {
      dynamicWebhookUrl = settingRow.value.trim();
    }
  } catch (e) {
    console.warn('Failed to load webhook URL from app_settings, using fallback');
  }

  let conversations: any[] = [];
  let consecutiveAlreadySyncedPages = 0;
  const maxPagesToScan = 15;

  for (let pageNum = 1; pageNum <= maxPagesToScan; pageNum++) {
    const convResp = await fetch('https://app.nxlink.ai/admin/nx_flow_manager/conversation', {
      method: 'POST',
      headers: { authorization: token, 'content-type': 'application/json' },
      body: JSON.stringify({ phone: null, tags: [], page_number: pageNum, page_size: 100, timeZone: 'UTC+08:00' })
    });

    if (!convResp.ok) break;

    const rawText = await convResp.text();
    let convData: any = {};
    try {
      convData = JSON.parse(rawText);
    } catch (e) {
      console.warn(`[Sync] Non-JSON response received on page ${pageNum}:`, rawText.slice(0, 150));
      break;
    }

    const pageList = convData.list || convData.data?.list || convData.data || [];
    if (!Array.isArray(pageList) || pageList.length === 0) break;

    conversations.push(...pageList);

    let unSyncedCount = 0;
    for (const c of pageList) {
      const cid = c.id || c.conversationId || c.uuid;
      if (!cid) continue;
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .ilike('conversation_transcript', `%nxlink_id:${cid}%`)
        .limit(1);
      if (!existing || existing.length === 0) {
        unSyncedCount++;
      }
    }
    if (unSyncedCount === 0) {
      consecutiveAlreadySyncedPages++;
      if (consecutiveAlreadySyncedPages >= 2) break;
    } else {
      consecutiveAlreadySyncedPages = 0;
    }

    if (pageList.length < 100) break;
  }

  let syncedCount = 0;
  let webhookPushedCount = 0;

  for (const conv of conversations) {
    const convId = conv.id || conv.conversationId || conv.uuid;
    if (!convId) continue;

    const channelName = resolveChannel(conv);

    const { data: existing } = await supabase
      .from('conversations')
      .select('id, customer_name, conversation_summary, conversation_tags, channel, preferred_branch, preferred_date')
      .ilike('conversation_transcript', `%nxlink_id:${convId}%`)
      .limit(1);

    const msgResp = await fetch(
      `https://app.nxlink.ai/admin/nx_flow_manager/conversation/messages?pageSize=9999&pageNumber=1&conversationId=${convId}`,
      { headers: { authorization: token } }
    );

    let messages: any[] = [];
    if (msgResp.ok) {
      const msgText = await msgResp.text();
      try {
        const msgData = JSON.parse(msgText);
        messages = msgData.data || msgData.list || [];
      } catch (e) {
        console.warn(`[Sync] Non-JSON response for conversation messages ID ${convId}`);
      }
    }
    const meta = extractSummaryMetadata(messages, conv);

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
            if (parsed.audio_url) {
              callAudioUrl = parsed.audio_url;
              break;
            }
          } catch (e) {}
        }
      }
    }

    const rawTranscript = `[nxlink_id:${convId}]`;

    const rawTs = conv.created_at || conv.createdAt || conv.create_time || conv.createTime;
    let dateObj = new Date();
    if (rawTs) {
      const tsMs = typeof rawTs === 'number' ? (rawTs > 10000000000 ? rawTs : rawTs * 1000) : new Date(rawTs).getTime();
      if (!isNaN(tsMs)) dateObj = new Date(tsMs);
    }
    const cDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(dateObj);
    const cTimeStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(dateObj);

    let wasIngestedOrUpdated = false;

    if (existing && existing.length > 0) {
      const row = existing[0];
      const tagsChanged = tagsList.length > 0 && JSON.stringify(row.conversation_tags || []) !== JSON.stringify(tagsList);
      const branchMissing = (!row.preferred_branch && meta.preferred_branch);
      if (!row.customer_name || !row.conversation_summary || tagsChanged || !row.channel || branchMissing) {
        await supabase
          .from('conversations')
          .update({
            customer_name: meta.customer_name,
            phone_number: meta.phone_number,
            customer_sentiment: meta.customer_sentiment,
            conversation_summary: meta.conversation_summary,
            next_steps: meta.next_steps,
            preferred_branch: meta.preferred_branch,
            preferred_date: meta.preferred_date,
            conversation_tags: tagsList,
            conversation_date: cDateStr,
            conversation_time: cTimeStr,
            call_audio_url: callAudioUrl,
            channel: channelName
          })
          .eq('id', row.id);
        wasIngestedOrUpdated = true;
      }
    } else {
      const { error } = await supabase.from('conversations').insert([
        {
          customer_name: meta.customer_name,
          phone_number: meta.phone_number,
          customer_sentiment: meta.customer_sentiment,
          conversation_summary: meta.conversation_summary,
          next_steps: meta.next_steps,
          preferred_branch: meta.preferred_branch,
          preferred_date: meta.preferred_date,
          company_name: conv.company_name || null,
          email_address: conv.email_address || null,
          conversation_tags: tagsList,
          conversation_date: cDateStr,
          conversation_time: cTimeStr,
          conversation_transcript: rawTranscript,
          call_audio_url: callAudioUrl,
          channel: channelName
        }
      ]);

      if (!error) {
        syncedCount++;
        wasIngestedOrUpdated = true;
      }
    }

    if (wasIngestedOrUpdated && shouldSyncToWebhook(tagsList)) {
      const clientId = env.NXLINK_WEBHOOK_CLIENT_ID || 'nxw_41ef8e4dee35cd8e4c6c1d3e';
      const clientSecret = env.NXLINK_WEBHOOK_CLIENT_SECRET || '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

      if (dynamicWebhookUrl && clientId && clientSecret) {
        try {
          const resp = await fetch(dynamicWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', client_id: clientId, client_secret: clientSecret },
            body: JSON.stringify({
              fields: {
                'Conversation ID': String(convId),
                'Patient Name': meta.customer_name || 'Unknown',
                'Phone Number': meta.phone_number || 'Not Provided',
                'Source': channelName,
                'Timestamp': `${cDateStr} ${cTimeStr}`,
                'Company Name': conv.company_name || null,
                'Email Address': conv.email_address || null,
                Tags: tagsList,
                'Full Summary': meta.conversation_summary || null,
                Sentiment: meta.customer_sentiment || 'Neutral',
                'Next Steps': meta.next_steps || null,
                'Preferred Branch': meta.preferred_branch || null,
                'Preferred Date': meta.preferred_date || null
              }
            })
          });
          if (resp.ok) {
            webhookPushedCount++;
          }
        } catch (e) {}
      }
    }
  }

  return {
    success: true,
    syncedCount,
    webhookPushedCount,
    totalChecked: conversations.length
  };
}

export async function handleSyncNxlink(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const result = await runNxlinkSync(env);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Worker Sync Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Sync failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
