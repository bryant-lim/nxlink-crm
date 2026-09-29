import { Env } from '../types';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export async function handleIngestCrm(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    const rawBody = await request.text();

    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    let logId: string | null = null;
    try {
      const { data, error } = await supabase
        .from('webhook_logs')
        .insert([{ raw_payload: rawBody, status: 'Processing' }])
        .select('id')
        .single();
      if (data && !error) logId = data.id;
    } catch (e) {
      console.warn('Skipping webhook_log insert:', e);
    }

    let rawText = '';
    if (contentType.includes('application/json')) {
      try {
        const body = JSON.parse(rawBody);
        rawText = body.payload || body.text || rawBody;
      } catch (e) {
        rawText = rawBody;
      }
    } else {
      rawText = rawBody;
    }

    if (!rawText) {
      return new Response(JSON.stringify({ error: 'No payload provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cleanShort = (val: string | null) => {
      if (!val) return null;
      let s = val.replace(/\.+$/, '').trim();
      return s.toLowerCase() === 'null' || s.toLowerCase() === 'n/a' || s.length === 0 ? null : s;
    };

    const extractedData = {
      customer_sentiment: extractField(rawText, 'Customer Sentiment:'),
      conversation_summary: extractField(rawText, 'Conversation Summary:'),
      next_steps: extractField(rawText, 'Next Steps:'),
      company_name: extractField(rawText, 'Company Name:'),
      email_address: extractField(rawText, 'Email Address:'),
      tags_string: extractField(rawText, 'Conversation Tag:'),
      customer_name: cleanShort(extractField(rawText, 'Customer Name:')),
      phone_number: cleanShort(extractField(rawText, 'Phone Number:')),
      preferred_branch: cleanShort(extractField(rawText, 'Preferred Branch:')),
      preferred_date: cleanShort(extractField(rawText, 'Preferred Date:')),
      preferred_treatment: cleanShort(extractField(rawText, 'Preferred Treatment:'))
    };

    if (extractedData.company_name?.toLowerCase() === 'null') extractedData.company_name = null;
    if (extractedData.email_address?.toLowerCase() === 'null') extractedData.email_address = null;

    let conversation_tags: string[] | null = null;
    if (extractedData.tags_string && extractedData.tags_string.toLowerCase() !== 'null') {
      let tagStr = extractedData.tags_string.trim();
      tagStr = tagStr.replace(/["'}\s]+$/, '');

      if (tagStr.includes('[') && tagStr.includes(']')) {
        try {
          const arrayStr = tagStr.substring(tagStr.indexOf('['), tagStr.lastIndexOf(']') + 1);
          let parsed;
          try {
            parsed = JSON.parse(arrayStr);
          } catch {
            parsed = JSON.parse(arrayStr.replace(/\\"/g, '"'));
          }
          if (Array.isArray(parsed)) {
            const names = parsed.map((item: any) => item.name || item.value || item).filter(Boolean);
            if (names.length > 0) conversation_tags = names.map((n) => String(n).trim());
          }
        } catch (e) {}
      }

      if (!conversation_tags) {
        const nameRegex = /(?:\\?"|')name(?:\\?"|')\s*:\s*(?:\\?"|')([^"']+)(?:\\?"|')/g;
        const matches = [...tagStr.matchAll(nameRegex)];
        if (matches.length > 0) {
          conversation_tags = matches.map((match) => match[1].trim());
        }
      }

      if (!conversation_tags) {
        tagStr = tagStr.replace(/[\[\]{}"\\]/g, '');
        conversation_tags = tagStr
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }

    let callAudioUrl: string | null = extractField(rawText, 'Call Audio URL:');
    if (!callAudioUrl) {
      const mp3Match = rawText.match(/https?:\/\/[^\s"']+\.mp3/i);
      if (mp3Match) callAudioUrl = mp3Match[0];
    }

    // Insert into Conversations
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .insert([
        {
          customer_name: extractedData.customer_name || 'N/A',
          phone_number: extractedData.phone_number || 'N/A',
          customer_sentiment: extractedData.customer_sentiment || 'N/A',
          conversation_summary: extractedData.conversation_summary || 'N/A',
          next_steps: extractedData.next_steps || 'N/A',
          preferred_branch: extractedData.preferred_branch || 'N/A',
          preferred_date: extractedData.preferred_date || 'N/A',
          preferred_treatment: extractedData.preferred_treatment || 'N/A',
          company_name: extractedData.company_name || 'N/A',
          email_address: extractedData.email_address || 'N/A',
          conversation_tags: conversation_tags,
          conversation_date: new Date().toISOString().split('T')[0],
          conversation_time: new Date().toISOString().split('T')[1].split('.')[0],
          conversation_transcript: rawText,
          call_audio_url: callAudioUrl,
          webhook_status: 'not_synced'
        }
      ])
      .select('id')
      .single();

    if (convError) {
      console.error('Supabase Error:', convError);
      if (logId) {
        await supabase.from('webhook_logs').update({ status: 'Error', error_message: convError.message }).eq('id', logId);
      }
      return new Response(JSON.stringify({ error: convError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const insertedConvo = convData;

    // Upsert Customer Profile
    if (extractedData.phone_number) {
      const cleanPhone = extractedData.phone_number.replace(/[^\d+]/g, '');
      if (cleanPhone) {
        const { data: existingProfile } = await supabase
          .from('customer_profiles')
          .select('*')
          .eq('phone_number', cleanPhone)
          .single();

        const currentConvoCount = (existingProfile?.total_conversations || 0) + 1;
        await supabase.from('customer_profiles').upsert([
          {
            phone_number: cleanPhone,
            customer_name: extractedData.customer_name || existingProfile?.customer_name,
            company_name: extractedData.company_name || existingProfile?.company_name,
            email_address: extractedData.email_address || existingProfile?.email_address,
            total_conversations: currentConvoCount,
            last_interaction_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
      }
    }

    if (logId) {
      await supabase.from('webhook_logs').update({ status: 'Success' }).eq('id', logId);
    }

    return new Response(JSON.stringify({ success: true, conversation: insertedConvo }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Error processing request:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

function extractField(text: string, label: string): string | null {
  const labels = [
    'Customer Sentiment:',
    'Conversation Summary:',
    'Next Steps:',
    'Company Name:',
    'Email Address:',
    'Conversation Tag:',
    'Customer Name:',
    'Phone Number:',
    'Preferred Branch:',
    'Preferred Date:'
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
