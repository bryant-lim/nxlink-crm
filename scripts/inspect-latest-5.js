import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function main() {
  console.log('==========================================');
  console.log('🔍 INSPECTING LATEST 5 NXLINK RECORDS');
  console.log('==========================================');

  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');
  console.log('🔑 Getting plat_token...');
  const token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();

  console.log('\n📥 Querying POST https://app.nxlink.ai/admin/nx_flow_manager/conversation...');

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
      page_size: 15,
      timeZone: 'UTC+08:00'
    })
  });

  const rawText = await resp.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    console.error('❌ Failed to parse JSON:', rawText.slice(0, 500));
    return;
  }

  const list = Array.isArray(data.list) ? data.list : (Array.isArray(data.data?.list) ? data.data.list : (Array.isArray(data.data) ? data.data : []));
  console.log(`Total Records Returned in Page 1: ${list.length}`);

  for (let i = 0; i < Math.min(list.length, 5); i++) {
    const item = list[i];
    const convId = item.id || item.conversationId || item.uuid;
    console.log(`\n------------------------------------------`);
    console.log(`Record #${i + 1} | ID: ${convId}`);
    console.log(`  Auto Flow Name: "${item.auto_flow_name || item.autoFlowName || item.flowName || 'N/A'}"`);
    console.log(`  Auto Flow ID:   ${item.auto_flow_id || item.autoFlowId || 'N/A'}`);
    console.log(`  Customer Name:  "${item.customer_name || item.customerName || 'N/A'}"`);
    console.log(`  Customer Phone: "${item.customer_phone || item.phone || 'N/A'}"`);
    console.log(`  Created At:     ${item.created_at || item.createdAt || 'N/A'}`);
    console.log(`  Tags:           ${JSON.stringify(item.tags || [])}`);
  }
}

main().catch(console.error);
