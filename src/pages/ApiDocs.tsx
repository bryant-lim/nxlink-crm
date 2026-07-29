import * as React from 'react';
import { Terminal, Copy, CheckCircle2, Send, ShieldCheck, Tag, RefreshCw } from 'lucide-react';

export default function ApiDocs() {
  const [copiedPayload, setCopiedPayload] = React.useState(false);
  const [copiedWebhook, setCopiedWebhook] = React.useState(false);

  const ingestUrl = window.location.origin + '/.netlify/functions/ingest-crm';
  const webhookUrl = 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';

  const ingestSample = `{
  "payload": "Customer Sentiment: Positive Conversation Summary: Customer requested appointment... Next Steps: Contact via WhatsApp Company Name: Dental Home Email Address: crystal@example.com Conversation Tag: Hot Lead, Booking Appointment"
}`;

  const webhookSample = `{
  "fields": {
    "Conversation ID": "2882714",
    "Customer Name": "Crystal",
    "Phone Number": "0198276123",
    "Company Name": "Dental Home",
    "Email Address": "crystal@example.com",
    "Tags": ["Hot Lead", "Booking Appointment"],
    "Full Summary": "Customer expressed interest in booking a dental appointment...",
    "Sentiment": "Positive",
    "Next Steps": "Confirm appointment via WhatsApp",
    "Call Audio URL": "https://voice.nxlink.ai/audio/rec_2882714.mp3",
    "Conversation Date": "2026-07-29"
  }
}`;

  const copyToClipboard = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight flex items-center">
          <Terminal size={24} className="mr-2 text-emerald-600" />
          API & Webhook Documentation
        </h1>
        <p className="text-xs text-slate-500 font-heading mt-1">
          Technical specifications for ingesting conversation data and exporting tagged records to 3rd-party webhooks (Lark Base).
        </p>
      </div>

      {/* Section 1: Ingestion API */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold font-heading text-slate-900 flex items-center">
            <Send size={18} className="mr-2 text-emerald-600" /> 1. Ingest Conversation API
          </h2>
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-mono text-xs font-bold rounded border border-emerald-200">
            POST
          </span>
        </div>

        <p className="text-xs text-slate-600 font-sans leading-relaxed">
          Push raw conversation strings directly from NXLINK, chatbots, or telephony systems. Fields (Sentiment, Summary, Next Steps, Tags) are parsed automatically.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-heading">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
            <span className="text-slate-400 font-semibold uppercase text-[10px] block mb-1">API Endpoint URL</span>
            <code className="text-slate-800 font-mono text-[11px] block truncate">{ingestUrl}</code>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
            <span className="text-slate-400 font-semibold uppercase text-[10px] block mb-1">Authentication Header</span>
            <code className="text-slate-800 font-mono text-[11px] block">x-api-secret-key: YOUR_SECRET_KEY</code>
          </div>
        </div>

        {/* Payload Example */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-heading">Ingestion Payload</span>
            <button
              onClick={() => copyToClipboard(ingestSample, setCopiedPayload)}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center cursor-pointer"
            >
              {copiedPayload ? <CheckCircle2 size={13} className="mr-1" /> : <Copy size={13} className="mr-1" />}
              {copiedPayload ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre className="bg-slate-900 text-emerald-400 p-3.5 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
            <code>{ingestSample}</code>
          </pre>
        </div>
      </section>

      {/* Section 2: Webhook Sync Documentation */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold font-heading text-slate-900 flex items-center">
            <RefreshCw size={18} className="mr-2 text-emerald-600" /> 2. Sync Tagged Record to Webhook (Lark Base)
          </h2>
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-mono text-xs font-bold rounded border border-emerald-200">
            POST
          </span>
        </div>

        <p className="text-xs text-slate-600 font-sans leading-relaxed">
          Exports qualified lead records directly into 3rd-party systems (Lark Base Webhook). Executed manually via the <strong>Sync Tagged Records to Webhook</strong> button or triggered automatically.
        </p>

        {/* Endpoint & Headers */}
        <div className="space-y-3 font-heading text-xs">
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg space-y-1">
            <span className="text-slate-400 font-semibold uppercase text-[10px] block">Target Webhook Endpoint</span>
            <code className="text-slate-900 font-mono font-bold text-xs select-all block break-all">{webhookUrl}</code>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg space-y-2">
            <span className="text-slate-400 font-semibold uppercase text-[10px] block">Request Headers</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate-700">
              <div className="bg-white p-2 rounded border border-slate-200">
                <span className="text-slate-400 block text-[9px] uppercase font-sans">Content-Type</span>
                application/json
              </div>
              <div className="bg-white p-2 rounded border border-slate-200">
                <span className="text-slate-400 block text-[9px] uppercase font-sans">Client ID Header</span>
                client_id: nxw_41ef...
              </div>
              <div className="bg-white p-2 rounded border border-slate-200">
                <span className="text-slate-400 block text-[9px] uppercase font-sans">Client Secret Header</span>
                client_secret: 8ab78...
              </div>
            </div>
          </div>
        </div>

        {/* Webhook JSON Payload */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-heading">Webhook JSON Payload</span>
            <button
              onClick={() => copyToClipboard(webhookSample, setCopiedWebhook)}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center cursor-pointer"
            >
              {copiedWebhook ? <CheckCircle2 size={13} className="mr-1" /> : <Copy size={13} className="mr-1" />}
              {copiedWebhook ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre className="bg-slate-900 text-emerald-400 p-4 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
            <code>{webhookSample}</code>
          </pre>
        </div>

        {/* Sync Filtering Rules */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 font-heading text-xs">
          <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider flex items-center">
            <ShieldCheck size={15} className="mr-1.5 text-emerald-600" /> Webhook Sync Eligibility & Rules
          </h3>
          <ul className="space-y-2 text-slate-700 font-sans">
            <li className="flex items-start">
              <Tag size={13} className="mr-2 text-emerald-600 shrink-0 mt-0.5" />
              <span><strong>Tag Filtering:</strong> Record must contain <code>Hot Lead</code> or <code>Booking Appointment</code> tags. Emergency, Check Booking, or Agent-routing tags are automatically excluded.</span>
            </li>
            <li className="flex items-start">
              <RefreshCw size={13} className="mr-2 text-emerald-600 shrink-0 mt-0.5" />
              <span><strong>Selective Syncing:</strong> Only records marked as <code>not_synced</code> or <code>failed</code> will be sent. Records marked as <code>synced</code> are automatically skipped.</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
