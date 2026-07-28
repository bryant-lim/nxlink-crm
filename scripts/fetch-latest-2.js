import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function main() {
  console.log('==========================================');
  console.log('🔍 FETCHING LATEST 2 NXLINK RECODS');
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
      page_size: 10,
      timeZone: 'UTC+08:00'
    })
  });

  console.log(`HTTP Status: ${resp.status} ${resp.statusText}`);
  const rawText = await resp.text();

  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    console.error('❌ Failed to parse JSON response. Raw text snippet:');
    console.error(rawText.slice(0, 500));
    return;
  }

  console.log(`NXLINK API Code: ${data.code}, Message: ${data.message || 'OK'}`);

  const list = Array.isArray(data.list) ? data.list : (Array.isArray(data.data?.list) ? data.data.list : (Array.isArray(data.data) ? data.data : []));
  console.log(`Total Records Returned in Page 1: ${list.length}`);

  if (list.length === 0) {
    console.log('⚠️ No records returned by NXLINK conversation endpoint!');
    return;
  }

  console.log(`\n📌 TOP 2 LATEST CONVERSATION RECORDS FROM NXLINK:`);

  const top2 = list.slice(0, 2);

  for (let i = 0; i < top2.length; i++) {
    const item = top2[i];
    const convId = item.id || item.conversationId || item.uuid;
    console.log(`\n------------------------------------------`);
    console.log(`Record #${i + 1} | ID: ${convId}`);
    console.log(`  Auto Flow Name: ${item.auto_flow_name || item.autoFlowName || item.flowName || 'N/A'}`);
    console.log(`  Auto Flow ID:   ${item.auto_flow_id || item.autoFlowId || 'N/A'}`);
    console.log(`  Customer Name:  ${item.customer_name || item.customerName || 'N/A'}`);
    console.log(`  Customer Phone: ${item.customer_phone || item.phone || 'N/A'}`);
    console.log(`  Created At:     ${item.created_at || item.createdAt || 'N/A'}`);
    console.log(`  Tags:           ${JSON.stringify(item.tags || [])}`);

    // Fetch messages/transcript
    if (convId) {
      const msgResp = await fetch(`https://app.nxlink.ai/admin/nx_flow_manager/conversation/messages?pageSize=9999&pageNumber=1&conversationId=${convId}`, {
        headers: { 'authorization': token }
      });
      if (msgResp.ok) {
        const msgText = await msgResp.text();
        try {
          const msgData = JSON.parse(msgText);
          const msgs = msgData.data || msgData.list || [];
          console.log(`  Total Messages: ${msgs.length}`);
          const sumMsg = msgs.find(m => m.msgType === 64);
          if (sumMsg) {
            console.log(`  msgType 64 Summary Payload:`, sumMsg.msgInfo);
          } else {
            console.log(`  (No msgType 64 summary found yet)`);
          }
        } catch (e) {}
      }
    }
  }
}

main().catch(console.error);
