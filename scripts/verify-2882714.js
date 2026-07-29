import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function main() {
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
      page_size: 10,
      timeZone: 'UTC+08:00'
    })
  });

  const data = await resp.json();
  const list = data.list || data.data?.list || data.data || [];
  const rec = list.find((item) => String(item.id || item.conversationId) === '2882714');

  if (rec) {
    console.log('📌 RAW NXLINK RECORD #2882714:');
    console.log('  created_at (unix seconds):', rec.created_at);
    console.log('  updated_at (unix seconds):', rec.updated_at);

    const createdUtc = new Date(rec.created_at * 1000).toISOString();
    console.log('\n  created_at in UTC:         ', createdUtc);

    const createdKL = new Date(rec.created_at * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' });
    console.log('  created_at in UTC+08:00:   ', createdKL);

    const updatedKL = new Date(rec.updated_at * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' });
    console.log('  updated_at in UTC+08:00:   ', updatedKL);
  }
}

main().catch(console.error);
