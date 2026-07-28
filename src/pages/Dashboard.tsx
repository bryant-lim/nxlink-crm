import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Ticket } from '../lib/ticketing';
import { calculateSLADeadlines, evaluateAutoTicketRules, getSLATimerStatus } from '../lib/ticketing';
import DateFilter, { filterRecordsByDate } from '../components/DateFilter';
import type { DateFilterValue } from '../components/DateFilter';
import { 
  Loader2, 
  Search, 
  Phone, 
  Mail, 
  FileText, 
  X, 
  MessageSquare, 
  AlertTriangle, 
  Users, 
  TicketPlus, 
  CheckCircle2, 
  ArrowRight,
  Clock,
  Ticket as TicketIcon,
  AlertCircle,
  Volume2,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  created_at: string;
}

function getConvoId(c: Conversation): string {
  if (c.conversation_transcript) {
    const match = c.conversation_transcript.match(/\[nxlink_id:(.*?)\]/);
    if (match && match[1]) return match[1];
  }
  return c.id ? c.id.slice(0, 8) : 'N/A';
}

export default function Dashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  
  // Linked ticket & ticket creation states
  const [linkedTicket, setLinkedTicket] = useState<Ticket | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [ticketCreating, setTicketCreating] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const navigate = useNavigate();

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilter]);

  useEffect(() => {
    if (selectedConvo) {
      checkLinkedTicket(selectedConvo.id);
    } else {
      setLinkedTicket(null);
      setTicketSuccess(null);
      setTicketError(null);
    }
  }, [selectedConvo]);

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

  const checkLinkedTicket = async (convoId: string) => {
    setLoadingTicket(true);
    setTicketError(null);
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('conversation_id', convoId)
      .limit(1);

    if (!error && data && data.length > 0) {
      setLinkedTicket(data[0]);
    } else {
      setLinkedTicket(null);
    }
    setLoadingTicket(false);
  };

  const createTicketFromConvo = async (
    priority: 'urgent' | 'high' | 'medium' | 'low' = 'medium',
    category: string = 'Support'
  ) => {
    if (!selectedConvo) return;
    setTicketCreating(true);
    setTicketSuccess(null);
    setTicketError(null);

    try {
      const { first_response_due_at, resolution_due_at } = calculateSLADeadlines(priority);
      const titleText = `${category} - ${selectedConvo.customer_name || selectedConvo.company_name || 'Customer'}`;
      
      const { data, error } = await supabase
        .from('tickets')
        .insert([
          {
            conversation_id: selectedConvo.id,
            customer_phone: selectedConvo.phone_number,
            customer_name: selectedConvo.customer_name,
            company_name: selectedConvo.company_name,
            title: titleText,
            description: selectedConvo.conversation_summary || 'Created from conversation dashboard.',
            category: category,
            priority: priority,
            status: category === 'Sales-Follow Up' ? 'in_progress' : 'open',
            assigned_to_role: category === 'Sales-Follow Up' ? 'sales' : 'support',
            first_response_due_at,
            resolution_due_at
          }
        ])
        .select()
        .single();

      if (error) throw error;

      setLinkedTicket(data);
      setTicketSuccess(`Ticket auto-created successfully! (${category} / ${priority.toUpperCase()} priority)`);
    } catch (err: any) {
      console.error('Ticket creation error:', err);
      setTicketError(err.message || 'Failed to auto-create ticket.');
    } finally {
      setTicketCreating(false);
    }
  };

  const autoCreateSmartTicket = () => {
    if (!selectedConvo) return;
    const { category, priority } = evaluateAutoTicketRules(
      selectedConvo.conversation_tags || [],
      selectedConvo.conversation_summary || ''
    );
    createTicketFromConvo(priority, category);
  };

  const shouldSyncToWebhook = (tags?: string[]) => {
    if (!Array.isArray(tags) || tags.length === 0) return false;
    const lowerTags = tags.map(t => (typeof t === 'string' ? t.toLowerCase().trim() : ''));

    // Exclude routing-only tags (e.g. ["to agent"], ["branch agent"], ["to agent", "branch agent"])
    const routingOnlyTags = ['to agent', 'branch agent', 'contact agent'];
    const isOnlyRouting = lowerTags.every(t => routingOnlyTags.includes(t));
    if (isOnlyRouting) return false;

    // Exclude non-lead operational flows (Emergency, Check Booking)
    const hasEmergencyOrCheckBooking = lowerTags.some(t =>
      t.includes('emergency') || t.includes('check booking')
    );
    if (hasEmergencyOrCheckBooking) return false;

    // Sync if contains Hot Lead or Booking Appointment
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

      try {
        // Attempt via Netlify backend proxy to bypass browser CORS preflight restrictions
        let resp = await fetch('/.netlify/functions/push-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // Fallback to direct call if running in local dev without netlify CLI
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

        if (resp.ok) success++;
        else fail++;
      } catch (err) {
        fail++;
      }
    }

    setWebhookSyncing(false);
    if (fail === 0) {
      setWebhookStatus(`✅ Webhook Sync Complete! Pushed ${success} tagged record(s).`);
    } else {
      setWebhookStatus(`⚠️ Webhook Sync Complete: ${success} succeeded, ${fail} failed.`);
    }
    setTimeout(() => setWebhookStatus(null), 5000);
  };

  // Sort conversations descending (newest timestamp first so 1st result is latest)
  const sorted = [...conversations].sort((a, b) => {
    const timeA = new Date(a.created_at || a.conversation_date).getTime();
    const timeB = new Date(b.created_at || b.conversation_date).getTime();
    return timeB - timeA;
  });

  // Apply Date Filter & Search Term Filter
  const dateFiltered = filterRecordsByDate(sorted, c => c.created_at || c.conversation_date, dateFilter);

  const filtered = dateFiltered.filter(c => {
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
  const uniquePhones = new Set(filtered.map(c => c.phone_number).filter(Boolean)).size;

  const [nxlinkSyncing, setNxlinkSyncing] = useState(false);
  const [autoSyncInterval, setAutoSyncInterval] = useState<'off' | '1' | '5' | '15' | '30'>('5');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const triggerNxlinkSync = async () => {
    setNxlinkSyncing(true);
    setWebhookStatus(null);
    try {
      const resp = await fetch('/.netlify/functions/sync-nxlink');
      if (resp.ok) {
        const data = await resp.json();
        setWebhookStatus(`✅ NXLINK Sync Complete! ${data.syncedCount || 0} new conversation(s) ingested.`);
        fetchConversations();
      } else {
        await fetchConversations();
        setWebhookStatus('✅ Conversations refreshed from database.');
      }
    } catch (e) {
      await fetchConversations();
      setWebhookStatus('✅ Conversations refreshed from database.');
    } finally {
      setNxlinkSyncing(false);
      setLastSyncTime(new Date().toLocaleTimeString());
      setTimeout(() => setWebhookStatus(null), 5000);
    }
  };

  // Configurable Auto-Sync Polling Effect
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
          <p className="text-sm text-slate-500 font-sans">
            Live AI agent conversation feed, sentiment insights, and ticket dispatch.
            {lastSyncTime && <span className="ml-2 text-xs font-mono text-emerald-700">Last synced: {lastSyncTime}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={nxlinkSyncing}
            onClick={triggerNxlinkSync}
            className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
          >
            {nxlinkSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>Sync NXLINK Conversations</span>
          </button>

          <div className="flex items-center space-x-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-heading shadow-2xs">
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

          <button
            disabled={webhookSyncing}
            onClick={() => pushToWebhook(filtered)}
            className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center justify-center shadow-2xs cursor-pointer disabled:opacity-50"
          >
            {webhookSyncing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
            <span>Sync Tagged Records to Webhook</span>
          </button>

          <DateFilter value={dateFilter} onChange={setDateFilter} />

          <div className="relative w-full sm:w-56">
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
      </div>

      {/* Modern Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-heading">Filtered Conversations</p>
            <h3 className="text-2xl font-bold font-heading text-slate-900 mt-1">{totalChats}</h3>
          </div>
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
            <MessageSquare size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-heading">High Attention / Emergency</p>
            <h3 className="text-2xl font-bold font-heading text-red-600 mt-1">{emergencyCount}</h3>
          </div>
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-600">
            <AlertTriangle size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-2xs">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-heading">Unique Phone Contacts</p>
            <h3 className="text-2xl font-bold font-heading text-emerald-600 mt-1">{uniquePhones}</h3>
          </div>
          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
            <Users size={20} />
          </div>
        </div>
      </div>

      {/* Main Conversation Container */}
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
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Tags</th>
                    <th className="py-3 px-4">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedConvos.map((convo) => (
                    <tr 
                      key={convo.id} 
                      onClick={() => setSelectedConvo(convo)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors group"
                    >
                      <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                        #{getConvoId(convo)}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap font-mono">
                        {new Date(convo.created_at || convo.conversation_date).toLocaleDateString()}
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
                      <td className="py-3.5 px-4 text-xs text-slate-500 max-w-xs truncate">
                        {convo.conversation_summary || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Touch Stack View */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedConvos.map((convo) => (
                <div 
                  key={convo.id}
                  onClick={() => setSelectedConvo(convo)}
                  className="p-4 space-y-2 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 font-heading text-base">
                      {convo.customer_name || convo.company_name || 'Unknown Contact'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(convo.created_at || convo.conversation_date).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-slate-600 font-mono">
                    <Phone size={12} className="text-emerald-600" />
                    <span>{convo.phone_number || 'No Phone'}</span>
                  </div>

                  {convo.conversation_summary && (
                    <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2 rounded border border-slate-100">
                      {convo.conversation_summary}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 pt-1">
                    {convo.conversation_tags?.map((t, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-medium text-[10px] rounded border border-slate-200">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-heading">
              <span className="text-slate-500 font-mono">
                Showing {filtered.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, filtered.length)} of {filtered.length} conversations
              </span>

              <div className="flex items-center space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors flex items-center cursor-pointer"
                >
                  <ChevronLeft size={14} className="mr-1" /> Previous
                </button>

                <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-800 border-emerald-300 bg-emerald-50/40">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-colors flex items-center cursor-pointer"
                >
                  Next <ChevronRight size={14} className="ml-1" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Slide-over Detail Drawer */}
      {selectedConvo && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedConvo(null)}
          ></div>

          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-right duration-200 border-l border-slate-200">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-50">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-bold font-heading text-slate-900">
                    {selectedConvo.customer_name || selectedConvo.company_name || 'Unknown Contact'}
                  </h2>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono text-xs font-bold rounded border border-emerald-200">
                    ID: #{getConvoId(selectedConvo)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1 font-mono">
                  {selectedConvo.phone_number && <span className="flex items-center"><Phone size={12} className="mr-1 text-emerald-600" /> {selectedConvo.phone_number}</span>}
                  {selectedConvo.email_address && <span className="flex items-center"><Mail size={12} className="mr-1 text-emerald-600" /> {selectedConvo.email_address}</span>}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={webhookSyncing}
                  onClick={() => pushToWebhook([selectedConvo])}
                  className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {webhookSyncing ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
                  <span>Push to Webhook</span>
                </button>
                <button 
                  onClick={() => setSelectedConvo(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {ticketSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-center space-x-2">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <span>{ticketSuccess}</span>
                </div>
              )}

              {ticketError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs space-y-1">
                  <div className="flex items-center font-bold font-heading space-x-1.5 text-red-900">
                    <AlertCircle size={16} className="text-red-600" />
                    <span>Database Action Required</span>
                  </div>
                  <p>{ticketError}</p>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                {loadingTicket ? (
                  <div className="flex items-center space-x-2 text-xs text-slate-500 font-heading">
                    <Loader2 size={14} className="animate-spin text-emerald-600" />
                    <span>Checking linked tickets...</span>
                  </div>
                ) : linkedTicket ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 font-heading flex items-center">
                        <TicketIcon size={16} className="mr-1.5 text-emerald-600" />
                        Ticket Linked & Active ({linkedTicket.category || 'Support'})
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-heading uppercase ${
                        linkedTicket.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                        linkedTicket.priority === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {linkedTicket.priority} Priority
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-slate-900 font-heading">{linkedTicket.title}</h4>
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded uppercase">
                          {linkedTicket.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
                        <span className="flex items-center text-amber-700 font-semibold font-mono">
                          <Clock size={12} className="mr-1" />
                          SLA: {getSLATimerStatus(linkedTicket.resolution_due_at, linkedTicket.status === 'resolved').label}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedConvo(null);
                            navigate('/tickets');
                          }}
                          className="text-emerald-600 hover:text-emerald-700 font-bold font-heading flex items-center"
                        >
                          Manage Ticket <ArrowRight size={14} className="ml-1" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 font-heading flex items-center">
                        <TicketPlus size={16} className="mr-2 text-emerald-600" />
                        Create / Dispatch Ticket
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">No ticket linked to this conversation yet. Auto-generate or select category:</p>

                    <div className="flex flex-col gap-2">
                      <button
                        disabled={ticketCreating}
                        onClick={autoCreateSmartTicket}
                        className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center justify-center shadow-2xs cursor-pointer"
                      >
                        {ticketCreating ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                        <span>Auto-Generate Smart Ticket (AI Priority & Category Detection)</span>
                      </button>

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <button
                          disabled={ticketCreating}
                          onClick={() => createTicketFromConvo('high', 'Sales-Follow Up')}
                          className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center justify-center shadow-2xs cursor-pointer"
                        >
                          <span>Sales-Follow Up (SLA 24h)</span>
                        </button>
                        <button
                          disabled={ticketCreating}
                          onClick={() => createTicketFromConvo('urgent', 'Emergency')}
                          className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-heading text-xs font-bold rounded-lg transition-colors flex items-center justify-center shadow-2xs cursor-pointer"
                        >
                          <span>Urgent Emergency (SLA 4h)</span>
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          disabled={ticketCreating}
                          onClick={() => createTicketFromConvo('medium', 'Support')}
                          className="flex-1 py-1.5 px-3 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-heading text-xs font-semibold rounded-lg transition-colors"
                        >
                          Support Ticket
                        </button>
                        <button
                          disabled={ticketCreating}
                          onClick={() => createTicketFromConvo('medium', 'Bug Report')}
                          className="flex-1 py-1.5 px-3 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-heading text-xs font-semibold rounded-lg transition-colors"
                        >
                          Bug Report
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading mb-2">Company Name</h4>
                  <p className="text-sm text-slate-800 font-medium">{selectedConvo.company_name || 'Individual / N/A'}</p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading mb-2">Customer Sentiment</h4>
                  <p className="text-sm text-slate-800 font-medium">{selectedConvo.customer_sentiment || 'Neutral'}</p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedConvo.conversation_tags?.map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-heading text-xs font-medium rounded border border-emerald-200">
                        {t}
                      </span>
                    )) || <span className="text-xs text-slate-400">No tags</span>}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center">
                  <ArrowRight size={14} className="mr-1.5 text-emerald-600" /> Next Steps
                </h4>
                <p className="text-sm text-slate-700">{selectedConvo.next_steps || 'None provided'}</p>
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
      )}
    </div>
  );
}
