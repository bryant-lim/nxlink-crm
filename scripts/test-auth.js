import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

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
  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');
  const token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();

  const convId = '2866964';
  console.log(`\n🔍 INSPECTING MESSAGES FOR #${convId}...`);

  const msgResp = await fetch(`https://app.nxlink.ai/admin/nx_flow_manager/conversation/messages?pageSize=9999&pageNumber=1&conversationId=${convId}`, {
    headers: { 'authorization': token }
  });

  if (msgResp.ok) {
    const msgData = await msgResp.json();
    const messages = msgData.data || msgData.list || [];
    console.log(`\n==========================================`);
    console.log(`📌 MESSAGES SAMPLE FOR #${convId}:`);
    for (const m of messages) {
      console.log(`msgType: ${m.msgType}, direction: ${m.direction}, msgInfo: ${m.msgInfo}`);
    }
  }
}

main().catch(console.error);
