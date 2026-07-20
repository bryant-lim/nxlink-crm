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
    // 2. Parse the payload (expecting { "payload": "Customer Sentiment: 客户语气平稳..." })
    // If the 3rd party sends pure text, we can do req.text(). Let's handle both.
    const contentType = req.headers.get('content-type') || '';
    let rawText = '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      rawText = body.payload || body.text || '';
    } else {
      rawText = await req.text();
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
    };

    // If company_name or email_address is 'null', set to null
    if (extractedData.company_name?.toLowerCase() === 'null') extractedData.company_name = null;
    if (extractedData.email_address?.toLowerCase() === 'null') extractedData.email_address = null;

    let conversation_tags: string[] | null = null;
    if (extractedData.tags_string && extractedData.tags_string.toLowerCase() !== 'null') {
      conversation_tags = extractedData.tags_string.split(',').map(t => t.trim()).filter(Boolean);
    }

    // 4. Insert into Supabase
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      realtime: {
        transport: WebSocket
      }
    });

    const { data, error } = await supabase
      .from('conversations')
      .insert([
        {
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
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, data }), { status: 200 });

  } catch (err: any) {
    console.error('Error processing request:', err);
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
    'Conversation Tag:'
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
