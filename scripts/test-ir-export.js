import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function testGet(url, token) {
  console.log(`\nTesting GET: ${url}`);
  const resp = await fetch(url, {
    headers: {
      'authorization': token,
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  });

  console.log(`HTTP Status: ${resp.status} ${resp.statusText}`);
  const contentType = resp.headers.get('content-type');
  console.log(`Content-Type: ${contentType}`);

  const buffer = await resp.arrayBuffer();
  const text = Buffer.from(buffer).toString('utf8');
  if (text.startsWith('{') || text.startsWith('[')) {
    console.log('JSON Output:', text);
  } else {
    console.log(`🎉 Binary file downloaded! Size: ${buffer.byteLength} bytes.`);
    const savePath = path.join(ROOT_DIR, 'ir_export_sample.xlsx');
    fs.writeFileSync(savePath, Buffer.from(buffer));
    console.log(`Saved file to ${savePath}`);
  }
}

async function main() {
  const pyScriptPath = path.join(ROOT_DIR, 'nxlink_get_plat_token.py');
  const token = execSync(`python3 "${pyScriptPath}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();

  // Test various LocalDateTime formats
  const startStr1 = encodeURIComponent('2026-07-01 00:00:00');
  const endStr1 = encodeURIComponent('2026-07-27 23:59:59');

  const startStr2 = encodeURIComponent('2026-07-01T00:00:00');
  const endStr2 = encodeURIComponent('2026-07-27T23:59:59');

  await testGet(`https://app.nxlink.ai/home/api/conversation/record/export?page_size=10&page_number=1&start_time=${startStr1}&end_time=${endStr1}`, token);
  await testGet(`https://app.nxlink.ai/home/api/conversation/record/export?page_size=10&page_number=1&start_time=${startStr2}&end_time=${endStr2}`, token);
}

main().catch(console.error);
