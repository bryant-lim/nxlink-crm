import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

export default async (req: Request, context: any) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const tokenUrl = process.env.NXAI_TOKEN_URL;
  if (!tokenUrl) {
    return new Response(JSON.stringify({ 
      error: 'Server misconfiguration', 
      details: 'NXAI_TOKEN_URL environment variable is not set. Please configure it in your .env or Netlify settings.' 
    }), { status: 500 });
  }

  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  try {
    // 1. Get plat_token
    console.log('[Sync] Fetching plat_token from NXAI_TOKEN_URL...');
    const tokenResp = await fetch(tokenUrl);
    if (!tokenResp.ok) {
      throw new Error(`Failed to fetch NXAI token (HTTP ${tokenResp.status} ${tokenResp.statusText})`);
    }

    const { token } = await tokenResp.json();
    if (!token) {
      throw new Error('NXAI_TOKEN_URL endpoint returned a response without a valid "token" field');
    }

    // 2. Fetch AI Conversations
    console.log('[Sync] Querying NXLINK AI Conversations API...');
    const convResp = await fetch('https://app.nxlink.ai/admin/nx_flow_manager/conversation', {
      method: 'POST',
      headers: {
        'authorization': token,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ "phone": null, "tags": [], "page_number": 1, "page_size": 100, "timeZone": "UTC+07:00" })
    });
    
    if (!convResp.ok) {
      throw new Error(`Failed to fetch conversations from app.nxlink.ai (HTTP ${convResp.status} ${convResp.statusText})`);
    }

    const convData = await convResp.json();

    // Check NXLINK API Error Codes
    if (convData.code === '403' || convData.code === 403 || convData.message?.includes('未登录')) {
      throw new Error(`Authentication Failure (NXLINK Code ${convData.code}): ${convData.message || 'plat_token expired or invalid'}`);
    }

    const conversations = convData.list || convData.data || [];
    console.log(`[Sync] Retrieved ${conversations.length} conversations from NXLINK API`);

    let syncedCount = 0;

    // 3. Process each conversation
    for (const conv of conversations) {
      const convId = conv.id || conv.conversationId || conv.uuid;
      if (!convId) continue;

      // Check if we already synced this conversation
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .ilike('conversation_transcript', `%nxlink_id:${convId}%`)
        .limit(1);
      
      if (existing && existing.length > 0) continue; // Already synced

      // Fetch transcript
      const msgResp = await fetch(`https://app.nxlink.ai/admin/nx_flow_manager/conversation/messages?pageSize=9999&pageNumber=1&conversationId=${convId}`, {
        headers: { 'authorization': token }
      });
      if (!msgResp.ok) continue;

      const msgData = await msgResp.json();
      const messages = msgData.data || msgData.list || [];

      // Flatten all text from transcript
      const rawText = extractAllText(messages) + `\n[nxlink_id:${convId}]`;

      // Extract CRM fields
      const extractedData = {
        customer_sentiment: extractField(rawText, 'Customer Sentiment:'),
        conversation_summary: extractField(rawText, 'Conversation Summary:'),
        next_steps: extractField(rawText, 'Next Steps:'),
        company_name: extractField(rawText, 'Company Name:'),
        email_address: extractField(rawText, 'Email Address:'),
        tags_string: extractField(rawText, 'Conversation Tag:'),
      };

      if (extractedData.company_name?.toLowerCase() === 'null') extractedData.company_name = null;
      if (extractedData.email_address?.toLowerCase() === 'null') extractedData.email_address = null;

      let conversation_tags: string[] | null = null;
      if (extractedData.tags_string && extractedData.tags_string.toLowerCase() !== 'null') {
        conversation_tags = extractedData.tags_string.split(',').map(t => t.trim()).filter(Boolean);
      }

      // Extract call_audio_url from conversation object or transcript messages
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

      const { error } = await supabase
        .from('conversations')
        .insert([{
          customer_sentiment: extractedData.customer_sentiment,
          conversation_summary: extractedData.conversation_summary,
          next_steps: extractedData.next_steps,
          company_name: extractedData.company_name,
          email_address: extractedData.email_address,
          conversation_tags: conversation_tags,
          conversation_date: new Date().toISOString().split('T')[0],
          conversation_time: new Date().toISOString().split('T')[1].split('.')[0],
          conversation_transcript: rawText,
          call_audio_url: callAudioUrl,
        }]);

      if (!error) syncedCount++;
    }

    return new Response(JSON.stringify({ success: true, syncedCount, totalFound: conversations.length }), { status: 200 });

  } catch (err: any) {
    console.error('Sync Error:', err);
    return new Response(JSON.stringify({ error: 'NXLINK Sync Failed', details: err.message }), { status: 500 });
  }
};

// --- Helper Functions ---

function extractAllText(obj: any): string {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(extractAllText).join('\n');
  if (typeof obj === 'object' && obj !== null) {
    return Object.values(obj).map(extractAllText).join('\n');
  }
  return '';
}

function extractField(text: string, label: string): string | null {
  const labels = [
    'Customer Sentiment:',
    'Conversation Summary:',
    'Next Steps:',
    'Company Name:',
    'Email Address:',
    'Conversation Tag:'
  ];

  const startIndex = text.indexOf(label);
  if (startIndex === -1) return null;

  const startContentIndex = startIndex + label.length;
  
  let nextLabelIndex = text.length;
  for (const nextLabel of labels) {
    if (nextLabel === label) continue;
    const index = text.indexOf(nextLabel, startContentIndex);
    if (index !== -1 && index < nextLabelIndex) {
      nextLabelIndex = index;
    }
  }

  let result = text.substring(startContentIndex, nextLabelIndex).trim();
  result = result.split(/\[nxlink_id:/i)[0].trim();
  result = result.replace(/["}'\\\}\],]+$/g, '').trim();
  return result;
}
