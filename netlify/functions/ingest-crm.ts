import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// The Netlify function handler
export default async (req: Request, context: any) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // 1. Authenticate using x-api-secret-key (TEMPORARILY DISABLED FOR TESTING)
  /*
  const apiKey = req.headers.get('x-api-secret-key');
  const expectedKey = process.env.API_SECRET_KEY;

  if (!expectedKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: API_SECRET_KEY not set' }), { status: 500 });
  }

  if (apiKey !== expectedKey) {
    // temporarily return the lengths of both keys to debug why they don't match
    const debugInfo = {
      error: 'Unauthorized',
      providedKeyLength: apiKey ? apiKey.length : 0,
      expectedKeyLength: expectedKey ? expectedKey.length : 0,
      providedKeyEndsWith2026: apiKey?.endsWith('_2026'),
      expectedKeyEndsWith2026: expectedKey?.endsWith('_2026')
    };
    console.log("Auth Mismatch Details:", debugInfo);
    return new Response(JSON.stringify(debugInfo), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  */

  try {
    // 2. Read the body as plain text first so we don't crash if they send malformed JSON
    const contentType = req.headers.get('content-type') || '';
    const rawBody = await req.text();

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket }
    });

    // 2.5 Try to log the raw incoming request
    let logId: string | null = null;
    try {
      const { data, error } = await supabase
        .from('webhook_logs')
        .insert([{ raw_payload: rawBody, status: 'Processing' }])
        .select('id')
        .single();
      if (data && !error) logId = data.id;
    } catch (e) {
      console.warn('Skipping webhook_log insert (table might not exist yet):', e);
    }

    let rawText = '';

    if (contentType.includes('application/json')) {
      try {
        const body = JSON.parse(rawBody);
        rawText = body.payload || body.text || rawBody;
      } catch (e) {
        // 3rd party tool injected unescaped quotes causing invalid JSON.
        // Fallback: just use the raw, unparsed string! 
        // Our extractField will still find "Customer Sentiment:" inside it anyway.
        rawText = rawBody;
      }
    } else {
      rawText = rawBody;
    }

    if (!rawText) {
      return new Response(JSON.stringify({ error: 'No payload provided' }), { status: 400 });
    }

    // 3. Extract information from the text
    const extractedData = {
      customer_sentiment: extractField(rawText, 'Customer Sentiment:'),
      conversation_summary: extractField(rawText, 'Conversation Summary:'),
      next_steps: extractField(rawText, 'Next Steps:'),
      company_name: extractField(rawText, 'Company Name:'),
      email_address: extractField(rawText, 'Email Address:'),
      tags_string: extractField(rawText, 'Conversation Tag:'),
      customer_name: extractField(rawText, 'Customer Name:'),
      phone_number: extractField(rawText, 'Phone Number:'),
    };

    // If fields are 'null', set to null
    if (extractedData.company_name?.toLowerCase() === 'null') extractedData.company_name = null;
    if (extractedData.email_address?.toLowerCase() === 'null') extractedData.email_address = null;
    if (extractedData.customer_name?.toLowerCase() === 'null') extractedData.customer_name = null;
    if (extractedData.phone_number?.toLowerCase() === 'null') extractedData.phone_number = null;

    let conversation_tags: string[] | null = null;
    if (extractedData.tags_string && extractedData.tags_string.toLowerCase() !== 'null') {
      let tagStr = extractedData.tags_string.trim();
      
      // Clean up trailing junk like '"} }' that the 3rd party tool might inject
      tagStr = tagStr.replace(/["'}\s]+$/, '');
      
      // Attempt 1: Parse as JSON array if it contains '[' and ']'
      if (tagStr.includes('[') && tagStr.includes(']')) {
        try {
          const arrayStr = tagStr.substring(tagStr.indexOf('['), tagStr.lastIndexOf(']') + 1);
          // Sometimes stringified JSON has escaped quotes inside a string.
          // Let's just try to parse it directly.
          let parsed;
          try { 
            parsed = JSON.parse(arrayStr); 
          } catch { 
            // Fallback for badly escaped strings
            parsed = JSON.parse(arrayStr.replace(/\\"/g, '"')); 
          }
          
          if (Array.isArray(parsed)) {
            const names = parsed.map((item: any) => item.name || item.value || item).filter(Boolean);
            if (names.length > 0) {
              conversation_tags = names.map(n => String(n).trim());
            }
          }
        } catch (e) {
          // Ignore parse errors, fallback to regex
        }
      }

      // Attempt 2: Permissive Regex
      if (!conversation_tags) {
        // match name:"value", "name": "value", \"name\": \"value\"
        const nameRegex = /(?:\\?"|')name(?:\\?"|')\s*:\s*(?:\\?"|')([^"']+)(?:\\?"|')/g;
        const matches = [...tagStr.matchAll(nameRegex)];
        if (matches.length > 0) {
          conversation_tags = matches.map(match => match[1].trim());
        }
      }
      
      // Fallback 3: Comma separated (only if it doesn't look like a JSON array at all)
      if (!conversation_tags) {
        // Remove brackets if they somehow exist
        tagStr = tagStr.replace(/[\[\]{}"\\]/g, '');
        conversation_tags = tagStr.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    // 4. Insert into Supabase
    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
          customer_name: extractedData.customer_name,
          phone_number: extractedData.phone_number,
          customer_sentiment: extractedData.customer_sentiment,
          conversation_summary: extractedData.conversation_summary,
          next_steps: extractedData.next_steps,
          company_name: extractedData.company_name,
          email_address: extractedData.email_address,
          conversation_tags: conversation_tags,
          // Since it's a new ingest, we can set the date/time to now if not provided in the text.
          conversation_date: new Date().toISOString().split('T')[0],
          conversation_time: new Date().toISOString().split('T')[1].split('.')[0],
          conversation_transcript: rawText, // Storing the full raw text as transcript just in case
        }
      ])
      .select();

    if (error) {
      console.error('Supabase Error:', error);
      if (logId) {
        await supabase.from('webhook_logs').update({ status: 'Error', error_message: error.message }).eq('id', logId);
      }
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (logId) {
      await supabase.from('webhook_logs').update({ status: 'Success' }).eq('id', logId);
    }

    return new Response(JSON.stringify({ success: true, data }), { status: 200 });

  } catch (err: any) {
    console.error('Error processing request:', err);
    
    // We don't have scope of logId here easily unless we hoist it, 
    // but the global error catch is usually for major crashes before the db insert.
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), { status: 500 });
  }
};

// Helper function to extract a field based on the label.
// It looks for the label and takes everything until the next known label or end of string.
function extractField(text: string, label: string): string | null {
  const labels = [
    'Customer Sentiment:',
    'Conversation Summary:',
    'Next Steps:',
    'Company Name:',
    'Email Address:',
    'Conversation Tag:',
    'Customer Name:',
    'Phone Number:'
  ];

  const startIndex = text.indexOf(label);
  if (startIndex === -1) return null;

  const startContentIndex = startIndex + label.length;
  
  // Find the next label that appears after our current label
  let nextLabelIndex = text.length;
  for (const nextLabel of labels) {
    if (nextLabel === label) continue;
    const index = text.indexOf(nextLabel, startContentIndex);
    if (index !== -1 && index < nextLabelIndex) {
      nextLabelIndex = index;
    }
  }

  return text.substring(startContentIndex, nextLabelIndex).trim();
}
