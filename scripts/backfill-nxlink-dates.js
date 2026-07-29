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

async function main() {
  console.log('==========================================');
  console.log('🔄 BACKFILLING NXLINK DATES & TIMES IN SUPABASE');
  console.log('==========================================');

  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
  });

  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');
  console.log('🔑 Obtaining fresh plat_token via Playwright...');
  const token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();

  console.log('\n📥 Querying NXLINK API across multiple pages...');
  const nxMap = new Map();

  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    const resp = await fetch('https://app.nxlink.ai/admin/nx_flow_manager/conversation', {
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

    if (resp.ok) {
      const data = await resp.json();
      const list = data.list || data.data?.list || data.data || [];
      for (const item of list) {
        const cid = String(item.id || item.conversationId || item.uuid);
        if (cid) {
          nxMap.set(cid, item);
        }
      }
    }
  }

  console.log(`Fetched ${nxMap.size} total NXLINK records into memory.`);

  console.log('\n🔍 Fetching all conversations from Supabase...');
  const { data: dbRecs, error: dbErr } = await supabase
    .from('conversations')
    .select('id, conversation_transcript, conversation_date, conversation_time');

  if (dbErr) {
    console.error('❌ Supabase fetch error:', dbErr.message);
    return;
  }

  console.log(`Found ${dbRecs.length} records in Supabase database.`);

  let updatedCount = 0;

  for (const rec of dbRecs) {
    const match = (rec.conversation_transcript || '').match(/\[nxlink_id:(\d+)\]/);
    if (!match) continue;

    const nxId = match[1];
    const nxItem = nxMap.get(nxId);

    if (nxItem) {
      const rawTs = nxItem.created_at || nxItem.createdAt || nxItem.create_time || nxItem.createTime;
      if (rawTs) {
        const tsMs = typeof rawTs === 'number' ? (rawTs > 10000000000 ? rawTs : rawTs * 1000) : new Date(rawTs).getTime();
        if (!isNaN(tsMs)) {
          const d = new Date(tsMs);
          const klStr = d.toLocaleString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' }); // "2026-07-29 21:39:11"
          const [newDate, newTime] = klStr.split(' ');

          await supabase
            .from('conversations')
            .update({
              conversation_date: newDate,
              conversation_time: newTime
            })
            .eq('id', rec.id);

          console.log(`  ✅ Updated #${nxId}: ${newDate} ${newTime}`);
          updatedCount++;
        }
      }
    }
  }

  console.log('\n==========================================');
  console.log(`🎉 BACKFILL COMPLETE!`);
  console.log(`   Updated ${updatedCount} / ${dbRecs.length} records in Supabase!`);
  console.log('==========================================');
}

main().catch(console.error);
