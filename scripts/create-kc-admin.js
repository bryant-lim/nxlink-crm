import fs from 'fs';
import path from 'path';
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
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  const email = 'kc@admin.local';
  const password = 'Admin123!';
  const username = 'kcdemo';
  const name = 'KC';
  const role = 'admin';

  console.log(`🔑 Provisioning Supabase Auth User: ${email}...`);

  // Check if user already exists in auth.users
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const userMatch = existingUsers?.users?.find(u => u.email === email);

  let userId = null;

  if (userMatch) {
    console.log(`User ${email} found in Auth. Updating password...`);
    userId = userMatch.id;
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      password: password,
      email_confirm: true,
      user_metadata: { name, username, role }
    });
    if (updateErr) console.error('Error updating auth password:', updateErr.message);
    else console.log('✅ Auth password updated successfully!');
  } else {
    console.log(`Creating new user ${email} in Auth...`);
    const { data: newAuthUser, error: createErr } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { name, username, role }
    });

    if (createErr) {
      console.error('❌ Create Auth User Error:', createErr.message);
      return;
    }
    userId = newAuthUser.user.id;
    console.log(`✅ Auth User Created with ID: ${userId}`);
  }

  // Upsert profile in public.profiles
  const profilePayload = {
    id: userId,
    username: username,
    email: email,
    name: name,
    role: role,
    is_active: true
  };

  const { data: profData, error: profErr } = await supabase
    .from('profiles')
    .upsert([profilePayload], { onConflict: 'email' })
    .select();

  if (profErr) {
    console.error('❌ Profile Upsert Error:', profErr.message);
  } else {
    console.log('✅ Profile Upserted Successfully:', profData);
  }

  console.log('\n==========================================');
  console.log('🎉 KC ADMIN PROVISIONED!');
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role: ${role}`);
  console.log('==========================================');
}

main().catch(console.error);
