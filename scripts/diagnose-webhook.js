import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const webhookUrl = 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
const clientId = 'nxw_41ef8e4dee35cd8e4c6c1d3e';
const clientSecret = '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

async function testPayload(name, fields) {
  console.log(`\n🧪 Testing Payload: ${name}`);
  const payload = { fields };
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client_id': clientId,
      'client_secret': clientSecret
    },
    body: JSON.stringify(payload)
  });
  console.log(`Status: ${resp.status}`);
  const text = await resp.text();
  console.log(`Response: ${text}`);
}

async function main() {
  // Test 1: Baseline successful format (from Collin #2877519)
  await testPayload('Collin Baseline', {
    "Conversation ID": "2877519_test",
    "Customer Name": "Collin Test",
    "Phone Number": "0167362712",
    "Company Name": null,
    "Email Address": null,
    "Tags": ["End Conversation", "Booking Appointment", "DH - Hot Lead"],
    "Full Summary": "Test summary",
    "Sentiment": "Positive",
    "Next Steps": "Follow up",
    "Call Audio URL": null,
    "Conversation Date": "2026-07-28"
  });

  // Test 2: CS with trailing dot or specific characters
  await testPayload('CS Test', {
    "Conversation ID": "2878807_test",
    "Customer Name": "CS",
    "Phone Number": "0199181918",
    "Company Name": null,
    "Email Address": null,
    "Tags": ["End Conversation", "Booking Appointment", "DH - Hot Lead"],
    "Full Summary": "The customer inquired about a general checkup.",
    "Sentiment": "Positive",
    "Next Steps": "Review submitted form.",
    "Call Audio URL": null,
    "Conversation Date": "2026-07-28"
  });
}

main().catch(console.error);
