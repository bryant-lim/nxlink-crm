import { Env } from '../types';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, client_id, client_secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export async function handlePushWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Payload body is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let webhookUrl = env.NXLINK_WEBHOOK_URL || 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
    try {
      const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
      const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: settingRow } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'nxlink_webhook_url')
          .single();
        if (settingRow?.value?.trim()) {
          webhookUrl = settingRow.value.trim();
        }
      }
    } catch (e) {
      console.warn('Failed to load webhook URL from app_settings, using fallback');
    }

    const clientId = env.NXLINK_WEBHOOK_CLIENT_ID || 'nxw_41ef8e4dee35cd8e4c6c1d3e';
    const clientSecret = env.NXLINK_WEBHOOK_CLIENT_SECRET || '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client_id': clientId,
        'client_secret': clientSecret
      },
      body: rawBody
    });

    const responseText = await resp.text();

    return new Response(responseText, {
      status: resp.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (err: any) {
    console.error('Push webhook proxy error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal Proxy Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
