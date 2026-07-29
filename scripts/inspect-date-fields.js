import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function main() {
  console.log('==========================================');
  console.log('🔍 INSPECTING NXLINK DATE FIELDS');
  console.log('==========================================');

  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');
  const token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();

  const resp = await fetch('https://app.nxlink.ai/admin/nx_flow_manager/conversation', {
    method: 'POST',
    headers: {
      'authorization': token,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      phone: null,
      tags: [],
      page_number: 1,
      page_size: 5,
      timeZone: 'UTC+08:00'
    })
  });

  const data = await resp.json();
  const list = data.list || data.data?.list || data.data || [];

  for (let i = 0; i < Math.min(list.length, 3); i++) {
    const item = list[i];
    console.log(`\n--- Item #${i + 1} ID: ${item.id || item.conversationId} ---`);
    console.log('Raw Item Keys & Date-Related Values:');
    for (const [k, v] of Object.entries(item)) {
      if (k.toLowerCase().includes('time') || k.toLowerCase().includes('date') || k.toLowerCase().includes('created') || k.toLowerCase().includes('updated') || typeof v === 'number') {
        console.log(`  ${k}:`, v, typeof v === 'number' && v > 1000000000 ? `-> ${new Date(v * (v > 10000000000 ? 1 : 1000)).toLocaleString()}` : '');
      }
    }
  }
}

main().catch(console.error);
