import { Env } from '../types';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export async function handleManageUser(request: Request, env: Env): Promise<Response> {
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
    const body: any = await request.json().catch(() => null);
    if (!body || !body.action) {
      return new Response(JSON.stringify({ error: 'Action and profile payload required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const { action, profile, password } = body;
    const userPassword = password || 'Admin123!';

    if (action === 'create') {
      let authUserId = null;

      // 1. Check if user already exists in auth.users
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const userMatch = existingUsers?.users?.find((u) => u.email === profile.email?.trim());

      if (userMatch) {
        authUserId = userMatch.id;
        if (password) {
          await supabase.auth.admin.updateUserById(authUserId, {
            password: userPassword,
            email_confirm: true,
            user_metadata: { name: profile.name, username: profile.username, role: profile.role }
          });
        }
      } else {
        // 2. Create user in Supabase Auth
        const { data: newAuth, error: authErr } = await supabase.auth.admin.createUser({
          email: profile.email?.trim(),
          password: userPassword,
          email_confirm: true,
          user_metadata: {
            name: profile.name?.trim(),
            username: profile.username?.trim(),
            role: profile.role || 'support'
          }
        });

        if (authErr) throw authErr;
        authUserId = newAuth.user.id;
      }

      // 3. Upsert profile in public.profiles table
      const profilePayload = {
        id: authUserId,
        username: profile.username?.trim(),
        email: profile.email?.trim(),
        name: profile.name?.trim(),
        mobile: profile.mobile?.trim() || null,
        role: profile.role || 'support',
        is_active: profile.is_active !== undefined ? profile.is_active : true
      };

      const { data: profData, error: profErr } = await supabase
        .from('profiles')
        .upsert([profilePayload], { onConflict: 'email' })
        .select()
        .single();

      if (profErr) throw profErr;

      return new Response(JSON.stringify({ success: true, profile: profData }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else if (action === 'update') {
      const profilePayload: any = {
        username: profile.username?.trim(),
        email: profile.email?.trim(),
        name: profile.name?.trim(),
        mobile: profile.mobile?.trim() || null,
        role: profile.role,
        is_active: profile.is_active,
        updated_at: new Date().toISOString()
      };

      // Update password in Auth if provided
      if (password && profile.id) {
        try {
          await supabase.auth.admin.updateUserById(profile.id, { password });
        } catch (e) {}
      }

      const { data: profData, error: profErr } = await supabase
        .from('profiles')
        .update(profilePayload)
        .eq('id', profile.id)
        .select()
        .single();

      if (profErr) throw profErr;

      return new Response(JSON.stringify({ success: true, profile: profData }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Manage user error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to save user profile' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
