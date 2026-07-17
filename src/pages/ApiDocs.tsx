import React from 'react';
import { Terminal, Copy, CheckCircle2 } from 'lucide-react';

export default function ApiDocs() {
  const [copied, setCopied] = React.useState(false);

  const samplePayload = `{
  "payload": "Customer Sentiment: 客户语气平稳，表达清晰，对公司出游套餐有明确需求。 Conversation Summary: 客户咨询公司出游套餐，提供了预计出发日期（10月15日）、团队人数（7人）和人均预算（700令吉）。客服正在询问公司名称和联系电话以进一步安排。 Next Steps: 客服需获取客户的公司名称和联系电话，以便为客户安排最合适的公司出游方案。 Company Name: null Email Address: null"
}`;

  const apiUrl = window.location.origin + '/.netlify/functions/ingest-crm';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(samplePayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">API Integration</h1>
        <p className="text-slate-400">
          Push conversation data directly into your CRM from external systems (e.g., chatbots, forms, or voice AI).
        </p>
      </div>

      <div className="space-y-8">
        {/* Endpoint Info */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Endpoint Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Method</label>
              <span className="px-3 py-1 bg-blue-600/20 text-blue-500 rounded-md font-mono text-sm font-semibold">POST</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">API URL</label>
              <div className="flex bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                <code className="flex-1 px-4 py-3 text-slate-300 text-sm overflow-x-auto whitespace-nowrap">
                  {apiUrl}
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* Authentication Info */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Authentication</h2>
          <p className="text-slate-400 mb-4 text-sm">
            All requests must include the <code className="text-blue-400">x-api-secret-key</code> header. 
            This key is configured in your Netlify environment variables as <code className="text-blue-400">API_SECRET_KEY</code>.
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-sm text-slate-300">
            <span className="text-pink-400">x-api-secret-key</span>: your_secure_secret_key_here
          </div>
        </section>

        {/* Payload Format */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Payload Format</h2>
            <button 
              onClick={copyToClipboard}
              className="flex items-center text-sm text-slate-400 hover:text-white transition-colors"
            >
              {copied ? <CheckCircle2 size={16} className="mr-1 text-green-500" /> : <Copy size={16} className="mr-1" />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
          </div>
          <p className="text-slate-400 mb-4 text-sm">
            Send a JSON object with a <code className="text-blue-400">payload</code> field containing the conversation string. Our parser will automatically extract the fields based on the specific labels like <i>"Customer Sentiment:"</i>, <i>"Conversation Summary:"</i>, etc.
          </p>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-sm text-slate-300 overflow-x-auto relative">
            <pre><code>{samplePayload}</code></pre>
          </div>
        </section>

        {/* Example cURL */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
            <Terminal size={20} className="mr-2" /> Example Request
          </h2>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-sm text-slate-300 overflow-x-auto">
            <pre><code>{`curl -X POST ${apiUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-api-secret-key: your_secure_secret_key_here" \\
  -d '{
    "payload": "Customer Sentiment: 客户很开心... Conversation Summary: ..."
  }'`}</code></pre>
          </div>
        </section>

      </div>
    </div>
  );
}
