import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function main() {
  console.log('==========================================');
  console.log('🔍 INSPECTING SPECIFIC NXLINK RECORDS: 2877519, 2877483, 2877500');
  console.log('==========================================');

  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');
  console.log('🔑 Getting plat_token...');
  const token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();

  const ids = ['2877519', '2877483', '2877500'];

  // Fetch page 1 list to get conversation objects
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
      page_size: 100,
      timeZone: 'UTC+08:00'
    })
  });

  const rawText = await resp.text();
  let data = JSON.parse(rawText);
  const list = Array.isArray(data.list) ? data.list : (Array.isArray(data.data?.list) ? data.data.list : (Array.isArray(data.data) ? data.data : []));

  for (const targetId of ids) {
    console.log(`\n------------------------------------------`);
    console.log(`Checking ID: ${targetId}`);

    const match = list.find((item) => {
      const cid = item.id || item.conversationId || item.uuid;
      return String(cid) === String(targetId);
    });

    if (!match) {
      console.log(`⚠️ Record ID ${targetId} not found in Page 1 returned list!`);
    } else {
      console.log(`  Auto Flow Name: "${match.auto_flow_name || match.autoFlowName || 'N/A'}"`);
      console.log(`  Customer Name:  "${match.customer_name || match.customerName || 'N/A'}"`);
      console.log(`  Customer Phone: "${match.customer_phone || match.phone || 'N/A'}"`);
      console.log(`  Created At:     ${match.created_at || match.createdAt || 'N/A'}`);
      console.log(`  Tags Array:     `, JSON.stringify(match.tags || []));

      const tagNames = (match.tags || []).map((t) => (typeof t === 'string' ? t : t.name));
      console.log(`  Extracted Tag Names:`, tagNames);

      // Check shouldSyncToWebhook logic
      const lowerTags = tagNames.map((t) => t.toLowerCase().trim());
      const routingOnlyTags = ['to agent', 'branch agent', 'contact agent'];
      const isOnlyRouting = lowerTags.length > 0 && lowerTags.every((t) => routingOnlyTags.includes(t));
      const hasEmergencyOrCheckBooking = lowerTags.some((t) => t.includes('emergency') || t.includes('check booking'));
      const hasLeadTags = lowerTags.some((t) => t.includes('hot lead') || t.includes('booking appointment'));

      console.log(`  Evaluations:`);
      console.log(`    isOnlyRouting: ${isOnlyRouting}`);
      console.log(`    hasEmergencyOrCheckBooking: ${hasEmergencyOrCheckBooking}`);
      console.log(`    hasLeadTags: ${hasLeadTags}`);
      console.log(`    shouldSyncToWebhook Result: ${!isOnlyRouting && !hasEmergencyOrCheckBooking && hasLeadTags}`);
    }

    // Also inspect transcript messages
    const msgResp = await fetch(`https://app.nxlink.ai/admin/nx_flow_manager/conversation/messages?pageSize=9999&pageNumber=1&conversationId=${targetId}`, {
      headers: { 'authorization': token }
    });
    if (msgResp.ok) {
      const msgData = await msgResp.json();
      const msgs = msgData.data || msgData.list || [];
      console.log(`  Total Messages: ${msgs.length}`);
      const sumMsg = msgs.find((m) => m.msgType === 64);
      if (sumMsg) {
        console.log(`  msgType 64 Summary:`, sumMsg.msgInfo);
      }
    }
  }
}

main().catch(console.error);
