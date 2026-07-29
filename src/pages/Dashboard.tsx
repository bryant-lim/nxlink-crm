import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import DateFilter, { filterRecordsByDate } from '../components/DateFilter';
import type { DateFilterValue } from '../components/DateFilter';
import { 
  Loader2, 
  Search, 
  FileText, 
  X,
  MessageSquare, 
  CheckCircle2, 
  AlertCircle,
  MinusCircle,
  ArrowRight,
  Clock,
  Volume2,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
  Tag
} from 'lucide-react';

interface Conversation {
  id: string;
  customer_name: string;
  phone_number: string;
  email_address: string;
  customer_sentiment: string;
  company_name: string;
  conversation_summary: string;
  conversation_date: string;
  conversation_time: string;
  conversation_tags: string[];
  conversation_transcript: string;
  next_steps: string;
  call_audio_url?: string;
  webhook_status?: 'synced' | 'not_synced' | 'failed' | null;
  webhook_error?: string | null;
  webhook_synced_at?: string | null;
  created_at: string;
}

function getConvoId(c: Conversation): string {
  if (c.conversation_transcript) {
    const match = c.conversation_transcript.match(/\[nxlink_id:(.*?)\]/);
    if (match && match[1]) return match[1];
  }
  return c.id ? c.id.slice(0, 8) : 'N/A';
}

function getFormattedTimestamp(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export default function Dashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const location = useLocation();
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [lastNxlinkSyncTime, setLastNxlinkSyncTime] = useState<string | null>(
    () => localStorage.getItem('lastNxlinkSyncTime')
  );
  const [lastWebhookSyncTime, setLastWebhookSyncTime] = useState<string | null>(
    () => localStorage.getItem('lastWebhookSyncTime')
  );

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (conversations.length > 0 && location.state?.selectedConvoId) {
      const targetId = location.state.selectedConvoId;
      const match = conversations.find(c => c.id === targetId || getConvoId(c) === targetId);
      if (match) setSelectedConvo(match);
    }
  }, [location.state, conversations]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter]);

  const fetchConversations = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setConversations(data);
    }
    setLoading(false);
  };

  const shouldSyncToWebhook = (tags?: string[]) => {
    if (!Array.isArray(tags) || tags.length === 0) return false;
    const lowerTags = tags.map(t => (typeof t === 'string' ? t.toLowerCase().trim() : ''));

    const routingOnlyTags = ['to agent', 'branch agent', 'contact agent'];
    const isOnlyRouting = lowerTags.every(t => routingOnlyTags.includes(t));
    if (isOnlyRouting) return false;

    const hasEmergencyOrCheckBooking = lowerTags.some(t =>
      t.includes('emergency') || t.includes('check booking')
    );
    if (hasEmergencyOrCheckBooking) return false;

    return lowerTags.some(t => t.includes('hot lead') || t.includes('booking appointment'));
  };

  const [webhookSyncing, setWebhookSyncing] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);

  const pushToWebhook = async (convosToPush: Conversation[]) => {
    const tagged = convosToPush.filter(c => shouldSyncToWebhook(c.conversation_tags));
    if (tagged.length === 0) {
      setWebhookStatus('⚠️ Skipped: Selected conversation does not meet Webhook sync criteria (Must be Hot Lead/Booking; excludes Emergency, Check Booking & Routing-only tags).');
      setTimeout(() => setWebhookStatus(null), 5000);
      return;
    }

    setWebhookSyncing(true);
    setWebhookStatus(null);
    let success = 0;
    let fail = 0;

    const webhookUrl = 'https://asia-east1-lark-demo-67aa3.cloudfunctions.net/nxlinkWebhook';
    const clientId = 'nxw_41ef8e4dee35cd8e4c6c1d3e';
    const clientSecret = '8ab7881cfcf9cd8428274ff2771875277c06be7404a3d4b20365bd584649ceea';

    for (const c of tagged) {
      const payload = {
        fields: {
          "Conversation ID": getConvoId(c),
          "Customer Name": c.customer_name || 'Unknown',
          "Phone Number": c.phone_number || 'Not Provided',
          "Company Name": c.company_name || null,
          "Email Address": c.email_address || null,
          "Tags": c.conversation_tags,
          "Full Summary": c.conversation_summary || null,
          "Sentiment": c.customer_sentiment || 'Neutral',
          "Next Steps": c.next_steps || null,
          "Call Audio URL": c.call_audio_url || null,
          "Conversation Date": c.conversation_date || null
        }
      };

      const nowTs = getFormattedTimestamp();

      try {
        let resp = await fetch('/.netlify/functions/push-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!resp.ok && (resp.status === 404 || resp.status === 502)) {
          resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'client_id': clientId,
              'client_secret': clientSecret
            },
            body: JSON.stringify(payload)
          });
        }

        if (resp.ok) {
          success++;
          await supabase.from('conversations').update({
            webhook_status: 'synced',
            webhook_error: null,
            webhook_synced_at: nowTs
          }).eq('id', c.id);

          c.webhook_status = 'synced';
          c.webhook_error = null;
          c.webhook_synced_at = nowTs;
        } else {
          fail++;
          const errText = await resp.text().catch(() => '');
          let errMsg = `HTTP ${resp.status}: ${resp.statusText || 'Webhook error'}`;
          if (errText && errText.toLowerCase().includes('already')) {
            errMsg = `Record with Conversation ID ${getConvoId(c)} already ingested in Lark Base`;
          } else if (errText) {
            errMsg = errText.slice(0, 120);
          }

          await supabase.from('conversations').update({
            webhook_status: 'failed',
            webhook_error: errMsg,
            webhook_synced_at: nowTs
          }).eq('id', c.id);

          c.webhook_status = 'failed';
          c.webhook_error = errMsg;
          c.webhook_synced_at = nowTs;
        }
      } catch (err: any) {
        fail++;
        const errMsg = err.message || 'Network/CORS fetch error';
        await supabase.from('conversations').update({
          webhook_status: 'failed',
          webhook_error: errMsg,
          webhook_synced_at: nowTs
        }).eq('id', c.id);

        c.webhook_status = 'failed';
        c.webhook_error = errMsg;
        c.webhook_synced_at = nowTs;
      }
    }

    const currentWebhookTs = getFormattedTimestamp();
    setLastWebhookSyncTime(currentWebhookTs);
    localStorage.setItem('lastWebhookSyncTime', currentWebhookTs);

    setWebhookSyncing(false);
    if (fail === 0) {
      setWebhookStatus(`✅ Webhook Sync Complete! Pushed ${success} tagged record(s).`);
    } else {
      setWebhookStatus(`⚠️ Webhook Sync Complete: ${success} succeeded, ${fail} failed.`);
    }
    setTimeout(() => setWebhookStatus(null), 5000);
  };

  const [showUntagged, setShowUntagged] = useState<boolean>(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');

  const availableTags = Array.from(
    new Set(conversations.flatMap(c => c.conversation_tags || []))
  ).sort();

  const sorted = [...conversations].sort((a, b) => {
    const timeA = new Date(a.created_at || a.conversation_date).getTime();
    const timeB = new Date(b.created_at || b.conversation_date).getTime();
    return timeB - timeA;
  });

  const dateFiltered = filterRecordsByDate(sorted, c => c.created_at || c.conversation_date, dateFilter);

  const filtered = dateFiltered.filter(c => {
    const hasTags = Array.isArray(c.conversation_tags) && c.conversation_tags.length > 0;
    if (!showUntagged && !hasTags) return false;

    if (selectedTagFilter !== 'all') {
      if (!c.conversation_tags || !c.conversation_tags.includes(selectedTagFilter)) {
        return false;
      }
    }

    const term = searchTerm.toLowerCase();
    return (
      (c.customer_name?.toLowerCase() || '').includes(term) ||
      (c.company_name?.toLowerCase() || '').includes(term) ||
      (c.phone_number || '').includes(term) ||
      (c.conversation_summary?.toLowerCase() || '').includes(term) ||
      (c.conversation_tags || []).some(t => t.toLowerCase().includes(term))
    );
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedConvos = filtered.slice(startIndex, startIndex + itemsPerPage);

  const totalChats = filtered.length;
  const emergencyCount = filtered.filter(c => {
    const s = (c.customer_sentiment || '').toLowerCase();
    const t = (c.conversation_tags || []).join(' ').toLowerCase();
    return s.includes('emergency') || s.includes('negative') || t.includes('dh - emergency');
  }).length;

  const [nxlinkSyncing, setNxlinkSyncing] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState<'off' | '1' | '5' | '15' | '30'>('5');

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [targetToDelete, setTargetToDelete] = useState<{ id: string; name?: string } | null>(null);

  const confirmAndDelete = async () => {
    setDeleting(true);
    try {
      const idsToDelete = targetToDelete ? [targetToDelete.id] : selectedRowIds;
      if (idsToDelete.length === 0) return;

      const { error } = await supabase
        .from('conversations')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      setConversations(conversations.filter(c => !idsToDelete.includes(c.id)));
      setSelectedRowIds(selectedRowIds.filter(id => !idsToDelete.includes(id)));

      if (selectedConvo && idsToDelete.includes(selectedConvo.id)) {
        setSelectedConvo(null);
      }

      setWebhookStatus(`✅ Successfully deleted ${idsToDelete.length} conversation record(s).`);
      setTimeout(() => setWebhookStatus(null), 5000);
    } catch (err: any) {
      console.error('Delete error:', err);
      setWebhookStatus(`❌ Failed to delete conversation: ${err.message}`);
    } finally {
      setDeleting(false);
      setDeleteModalOpen(false);
      setTargetToDelete(null);
    }
  };

  const triggerNxlinkSync = async () => {
    setNxlinkSyncing(true);
    setWebhookStatus(null);
    try {
      const resp = await fetch('/.netlify/functions/sync-nxlink');
      if (resp.ok) {
        const data = await resp.json();
        const msg = data.syncedCount > 0
          ? `✅ NXLINK Sync Complete! ${data.syncedCount} new conversation(s) ingested (${data.webhookCount || 0} pushed to Webhook).`
          : `✅ NXLINK Sync Complete! Up to date (${data.totalFound || 0} checked).`;
        setWebhookStatus(msg);
        fetchConversations();
      } else {
        await fetchConversations();
        setWebhookStatus('✅ Refreshed view from database.');
      }
    } catch (e: any) {
      await fetchConversations();
      setWebhookStatus(`❌ Sync Notice: ${e.message || 'Could not reach sync endpoint'}`);
    } finally {
      setNxlinkSyncing(false);
      const currentNxlinkTs = getFormattedTimestamp();
      setLastNxlinkSyncTime(currentNxlinkTs);
      localStorage.setItem('lastNxlinkSyncTime', currentNxlinkTs);
      setTimeout(() => setWebhookStatus(null), 5000);
    }
  };

  useEffect(() => {
    if (autoSyncInterval === 'off') return;
    const intervalMs = parseInt(autoSyncInterval, 10) * 60 * 1000;
    const timer = setInterval(() => {
      triggerNxlinkSync();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [autoSyncInterval]);

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {webhookStatus && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-heading font-bold shadow-lg flex items-center justify-between animate-in slide-in-from-top duration-200">
          <span className="flex items-center"><CheckCircle2 size={16} className="mr-2 text-white" /> {webhookStatus}</span>
          <button onClick={() => setWebhookStatus(null)} className="text-white hover:text-slate-200"><X size={16} /></button>
        </div>
      )}

      {/* Top Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight flex items-center">
            <MessageSquare size={24} className="mr-2 text-emerald-600" />
            Conversations Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sync NXLINK Button & Last Sync Date */}
          <div className="flex flex-col items-start">
            <button
              disabled={nxlinkSyncing}
              onClick={triggerNxlinkSync}
              className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {nxlinkSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>Sync NXLINK Conversations</span>
            </button>
            <span className="text-[10px] font-mono text-slate-500 mt-1">
              Last NXLINK Sync: {lastNxlinkSyncTime || 'Not run yet'}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-heading shadow-2xs self-start">
            <Clock size={13} className="text-slate-400" />
            <span className="text-slate-500 font-semibold">Auto-Sync:</span>
            <select
              value={autoSyncInterval}
              onChange={(e) => setAutoSyncInterval(e.target.value as any)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="off">Off</option>
              <option value="1">Every 1m</option>
              <option value="5">Every 5m</option>
              <option value="15">Every 15m</option>
              <option value="30">Every 30m</option>
            </select>
          </div>

          {selectedRowIds.length > 0 && (
            <button
              onClick={() => {
                setTargetToDelete(null);
                setDeleteModalOpen(true);
              }}
              className="py-2 px-3.5 bg-red-600 hover:bg-red-700 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer animate-in fade-in duration-150 self-start"
            >
              <Trash2 size={14} />
              <span>Delete Selected ({selectedRowIds.length})</span>
            </button>
          )}

          {/* Sync Webhook Button & Last Sync Date */}
          <div className="flex flex-col items-start">
            <button
              disabled={webhookSyncing}
              onClick={() => pushToWebhook(filtered)}
              className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center justify-center shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {webhookSyncing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
              <span>Sync Tagged Records to Webhook</span>
            </button>
            <span className="text-[10px] font-mono text-slate-500 mt-1">
              Last Webhook Sync: {lastWebhookSyncTime || 'Not run yet'}
            </span>
          </div>
        </div>
      </div>

      {/* Minimal Single Statistics Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-6 text-xs font-heading shadow-2xs">
        <div className="flex items-center space-x-2">
          <span className="text-slate-500 font-semibold">Filtered Conversations:</span>
          <span className="font-bold text-slate-900 text-sm">{totalChats}</span>
        </div>
        <div className="hidden sm:block h-4 w-px bg-slate-200" />
        <div className="flex items-center space-x-2">
          <span className="text-slate-500 font-semibold">High Attention / Emergency:</span>
          <span className="font-bold text-red-600 text-sm">{emergencyCount}</span>
        </div>
      </div>

      {/* Controls Block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <DateFilter value={dateFilter} onChange={setDateFilter} />

          <div className="flex items-center space-x-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-heading shadow-2xs">
            <span className="text-slate-500 font-semibold">Filter Tag:</span>
            <select
              value={selectedTagFilter}
              onChange={(e) => setSelectedTagFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="all">All Tags ({availableTags.length})</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowUntagged(!showUntagged)}
            className={`py-2 px-3.5 border rounded-lg font-heading text-xs font-bold transition-colors flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer ${
              showUntagged 
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100' 
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            title={showUntagged ? "Currently displaying all records (including untagged)" : "Currently hiding untagged records"}
          >
            <Tag size={13} className={showUntagged ? 'text-indigo-600' : 'text-slate-400'} />
            <span>{showUntagged ? 'View: All Records' : 'View: Tagged Only'}</span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-heading mt-2">Loading conversation feed...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 font-sans text-xs">
            No conversations found matching date filter & search.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={paginatedConvos.length > 0 && paginatedConvos.every(c => selectedRowIds.includes(c.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const pageIds = paginatedConvos.map(c => c.id);
                            setSelectedRowIds(Array.from(new Set([...selectedRowIds, ...pageIds])));
                          } else {
                            const pageIds = paginatedConvos.map(c => c.id);
                            setSelectedRowIds(selectedRowIds.filter(id => !pageIds.includes(id)));
                          }
                        }}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Tags</th>
                    <th className="py-3 px-4">Webhook Sync</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedConvos.map((convo) => (
                    <tr 
                      key={convo.id} 
                      onClick={() => setSelectedConvo(convo)}
                      className={`hover:bg-slate-50 cursor-pointer transition-colors group ${
                        selectedRowIds.includes(convo.id) ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRowIds.includes(convo.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRowIds([...selectedRowIds, convo.id]);
                            } else {
                              setSelectedRowIds(selectedRowIds.filter(id => id !== convo.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                        #{getConvoId(convo)}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap font-mono">
                        {convo.conversation_date && convo.conversation_time
                          ? `${convo.conversation_date} ${convo.conversation_time}`
                          : (convo.created_at ? new Date(convo.created_at).toISOString().replace('T', ' ').slice(0, 19) : convo.conversation_date || '-')}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                        {convo.customer_name || 'Unknown'}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                        {convo.phone_number || '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {convo.conversation_tags && convo.conversation_tags.length > 0 ? (
                            convo.conversation_tags.map((tag, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 font-medium text-[11px] rounded border border-slate-200 whitespace-nowrap font-heading">
                                {tag}
                              </span>
                            ))
                          ) : <span className="text-slate-400 text-xs">-</span>}
                        </div>
                      </td>
                      {/* Webhook Sync Status Flag */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {convo.webhook_status === 'synced' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold font-heading bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center">
                            <CheckCircle2 size={12} className="mr-1 text-emerald-600" /> Synced
                          </span>
                        ) : convo.webhook_status === 'failed' ? (
                          <span 
                            className="px-2 py-0.5 rounded text-[11px] font-bold font-heading bg-red-50 text-red-800 border border-red-200 inline-flex items-center cursor-help"
                            title={`Failure Reason: ${convo.webhook_error || 'Webhook push error'}`}
                          >
                            <AlertCircle size={12} className="mr-1 text-red-600" /> Failed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium font-heading bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center">
                            <MinusCircle size={12} className="mr-1 text-slate-400" /> Not Synced
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setTargetToDelete({ id: convo.id, name: convo.customer_name });
                            setDeleteModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-heading">
              <span className="text-slate-500">
                Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filtered.length)} of {filtered.length}
              </span>

              <div className="flex items-center space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer font-medium"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-slate-700 font-semibold font-mono">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer font-medium"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Selected Conversation Detail Drawer */}
      {selectedConvo && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col">
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold font-heading">Conversation Details #{getConvoId(selectedConvo)}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {selectedConvo.customer_name || 'Customer'} • {selectedConvo.phone_number || ''}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedConvo(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* Webhook Sync Status Card */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-2xs">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center justify-between">
                    <span className="flex items-center"><RefreshCw size={14} className="mr-1.5 text-emerald-600" /> Webhook Sync Status</span>
                  </h4>

                  {selectedConvo.webhook_status === 'synced' ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                      <div className="flex items-center font-bold text-emerald-800 font-heading">
                        <CheckCircle2 size={15} className="mr-1.5 text-emerald-600" />
                        Successfully Synced to Webhook Base
                      </div>
                      {selectedConvo.webhook_synced_at && (
                        <p className="text-emerald-700 font-mono text-[11px]">Synced timestamp: {selectedConvo.webhook_synced_at}</p>
                      )}
                    </div>
                  ) : selectedConvo.webhook_status === 'failed' ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-2">
                      <div className="flex items-center font-bold text-red-900 font-heading">
                        <AlertCircle size={15} className="mr-1.5 text-red-600" />
                        Webhook Push Failed
                      </div>
                      <div className="bg-white p-2.5 rounded border border-red-200 text-red-800 font-mono text-[11px] leading-relaxed">
                        <strong className="block text-red-900 mb-0.5">Failure Reason:</strong>
                        {selectedConvo.webhook_error || 'Record error / CORS failure'}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-heading flex items-center">
                      <MinusCircle size={15} className="mr-1.5 text-slate-400" />
                      <span>Not Synced to Webhook yet (Requires Hot Lead or Booking Appointment tags)</span>
                    </div>
                  )}
                </div>

                {/* Combined Contact Info Block (Customer Name, Phone, Company) */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading">
                    Contact & Organization Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-heading">
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] block">Customer Name</span>
                      <span className="font-bold text-slate-900 text-sm">{selectedConvo.customer_name || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] block">Phone Number</span>
                      <span className="font-bold text-slate-800 font-mono">{selectedConvo.phone_number || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] block">Company Name</span>
                      <span className="font-bold text-slate-800">{selectedConvo.company_name || 'Individual / N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Full Conversation Summary (Moved UP) */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-2xs">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center">
                    <FileText size={14} className="mr-1.5 text-emerald-600" /> Full Conversation Summary
                  </h4>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedConvo.conversation_summary || 'No summary available.'}</p>
                </div>

                {/* Combined Block for Customer Sentiment & Next Steps */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-heading mb-1">Customer Sentiment</h4>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-800 font-bold rounded-lg border border-slate-200 font-heading inline-block">
                        {selectedConvo.customer_sentiment || 'Neutral'}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-heading mb-1 flex items-center">
                        <ArrowRight size={12} className="mr-1 text-emerald-600" /> Next Steps
                      </h4>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">{selectedConvo.next_steps || 'None provided'}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-heading mb-1">Conversation Tags</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedConvo.conversation_tags?.map((t, idx) => (
                        <span key={idx} className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 font-heading text-xs font-semibold rounded-md border border-emerald-200">
                          {t}
                        </span>
                      )) || <span className="text-xs text-slate-400">No tags</span>}
                    </div>
                  </div>
                </div>

                {selectedConvo.call_audio_url && (
                  <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider font-heading flex items-center">
                        <Volume2 size={15} className="mr-1.5 text-emerald-600" /> Call Recording Audio
                      </h4>
                      <a 
                        href={selectedConvo.call_audio_url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline flex items-center"
                      >
                        <Download size={13} className="mr-1" /> Open / Download MP3
                      </a>
                    </div>
                    <audio controls src={selectedConvo.call_audio_url} className="w-full h-10 rounded-lg mt-1" />
                  </div>
                )}

                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center">
                    <FileText size={14} className="mr-1.5 text-emerald-600" /> Full Conversation Summary
                  </h4>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedConvo.conversation_summary || 'No summary available.'}</p>
                </div>

                {/* AI TRANSCRIPT MESSAGES THREAD */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center">
                    <MessageSquare size={14} className="mr-1.5 text-emerald-600" /> AI Transcript Dialogue Thread
                  </h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-80 overflow-y-auto space-y-2 font-sans text-xs">
                    {selectedConvo.conversation_transcript ? (
                      selectedConvo.conversation_transcript.split('\n').filter(Boolean).map((line, idx) => {
                        if (line.includes('[nxlink_id:')) return null;
                        if (line.startsWith('Customer Sentiment:') || line.startsWith('Conversation Summary:') || line.startsWith('Next Steps:')) return null;

                        if (line.startsWith('[Customer]:')) {
                          const speech = line.replace(/^\[Customer\]:\s*/, '').replace(/^"|"$/g, '');
                          return (
                            <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-200 mr-6 shadow-2xs">
                              <span className="font-bold font-heading block mb-1 text-[11px] text-slate-600 flex items-center">
                                👤 Customer Utterance
                              </span>
                              <span className="text-slate-800 leading-relaxed font-medium">{speech}</span>
                            </div>
                          );
                        }

                        if (line.startsWith('[Bot]:')) {
                          const speech = line.replace(/^\[Bot\]:\s*/, '').replace(/^"|"$/g, '');
                          return (
                            <div key={idx} className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 ml-6 shadow-2xs">
                              <span className="font-bold font-heading block mb-1 text-[11px] text-emerald-800 flex items-center">
                                🤖 AI Agent Response
                              </span>
                              <span className="text-emerald-950 leading-relaxed font-medium">{speech}</span>
                            </div>
                          );
                        }

                        if (line.startsWith('[System]:')) {
                          const step = line.replace(/^\[System\]:\s*/, '');
                          return (
                            <div key={idx} className="py-1 px-2.5 bg-slate-200/70 text-slate-700 text-[11px] font-mono font-medium rounded text-center my-1.5">
                              ⚙️ {step}
                            </div>
                          );
                        }

                        return null;
                      })
                    ) : (
                      <p className="text-slate-400 italic">No transcript recorded for this conversation.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-bold font-heading text-slate-900">Confirm Deletion</h3>
            <p className="text-xs text-slate-600 font-sans">
              Are you sure you want to delete {targetToDelete ? `record #${targetToDelete.id.slice(0, 8)} (${targetToDelete.name || 'Customer'})` : `${selectedRowIds.length} selected record(s)`}? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                disabled={deleting}
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-bold font-heading text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={deleting}
                onClick={confirmAndDelete}
                className="px-4 py-2 text-xs font-bold font-heading bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
