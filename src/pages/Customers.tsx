import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ConversationData } from '../lib/types';
import { normalizePhoneNumber } from '../lib/types';
import { 
  Search, 
  Loader2, 
  X, 
  ChevronRight,
  Activity,
  UserCheck,
  Volume2,
  Download,
  FileText,
  ArrowRight
} from 'lucide-react';

interface ConsolidatedCustomer {
  phone_number: string;
  customer_name: string;
  company_name: string;
  email_address: string;
  conversations: ConversationData[];
  lastInteractionDate: string;
  lastInteractionTime: string;
}

function getConvoId(c: ConversationData): string {
  if (c.conversation_transcript) {
    const match = c.conversation_transcript.match(/\[nxlink_id:(.*?)\]/);
    if (match && match[1]) return match[1];
  }
  return c.id ? c.id.slice(0, 8) : 'N/A';
}

export default function Customers() {
  const [customers, setCustomers] = useState<ConsolidatedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<ConsolidatedCustomer | null>(null);
  const [selectedDetailConvo, setSelectedDetailConvo] = useState<ConversationData | null>(null);

  useEffect(() => {
    fetchAndConsolidateData();
  }, []);

  const fetchAndConsolidateData = async () => {
    const { data: convData } = await supabase
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false });

    const convos: ConversationData[] = convData || [];

    // Filter conversations to keep ONLY those with at least 1 tag (Requirement 6)
    const taggedConvos = convos.filter(c => Array.isArray(c.conversation_tags) && c.conversation_tags.length > 0);

    const groupedMap = new Map<string, {
      customer_name: string;
      company_name: string;
      email_address: string;
      conversations: ConversationData[];
      lastInteractionDate: string;
      lastInteractionTime: string;
    }>();

    taggedConvos.forEach((c) => {
      const rawPhone = c.phone_number || 'Unknown';
      const phoneKey = normalizePhoneNumber(rawPhone);

      const cDate = c.conversation_date || (c.created_at ? new Date(c.created_at).toISOString().split('T')[0] : '');
      const cTime = c.conversation_time || (c.created_at ? new Date(c.created_at).toISOString().split('T')[1].split('.')[0] : '');

      if (!groupedMap.has(phoneKey)) {
        groupedMap.set(phoneKey, {
          customer_name: c.customer_name || 'Customer',
          company_name: c.company_name || 'N/A',
          email_address: c.email_address || 'N/A',
          conversations: [],
          lastInteractionDate: cDate,
          lastInteractionTime: cTime
        });
      }

      const existing = groupedMap.get(phoneKey)!;
      existing.conversations.push(c);
      if (c.customer_name && existing.customer_name === 'Customer') existing.customer_name = c.customer_name;
      if (c.company_name && existing.company_name === 'N/A') existing.company_name = c.company_name;
      if (c.email_address && existing.email_address === 'N/A') existing.email_address = c.email_address;
    });

    const consolidatedList: ConsolidatedCustomer[] = Array.from(groupedMap.entries()).map(([phone, data]) => {
      return {
        phone_number: phone,
        customer_name: data.customer_name,
        company_name: data.company_name,
        email_address: data.email_address,
        conversations: data.conversations,
        lastInteractionDate: data.lastInteractionDate,
        lastInteractionTime: data.lastInteractionTime
      };
    });

    // Sort by latest conversation interaction
    consolidatedList.sort((a, b) => {
      const timeA = new Date(`${a.lastInteractionDate}T${a.lastInteractionTime || '00:00:00'}`).getTime();
      const timeB = new Date(`${b.lastInteractionDate}T${b.lastInteractionTime || '00:00:00'}`).getTime();
      return timeB - timeA;
    });

    setCustomers(consolidatedList);
    setLoading(false);
  };

  // Text search filter (Requirement 9: search by name, phone number, email, company)
  const filteredCustomers = customers.filter(c => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      (c.customer_name?.toLowerCase() || '').includes(term) ||
      (c.phone_number?.toLowerCase() || '').includes(term) ||
      (c.email_address?.toLowerCase() || '').includes(term) ||
      (c.company_name?.toLowerCase() || '').includes(term)
    );
  });

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight flex items-center">
            <UserCheck size={24} className="mr-2 text-emerald-600" />
            Customer Directory
          </h1>
        </div>

        {/* Text Filter Input */}
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, phone, or email..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-heading mt-2">Loading Customer Directory...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="py-16 text-center text-slate-500 font-sans bg-white border border-slate-200 rounded-xl text-xs">
          No customer accounts found matching your query.
        </div>
      ) : (
        /* TABLE VIEW ONLY */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Email / Company</th>
                  <th className="py-3 px-4">Last Interaction (UTC+08:00)</th>
                  <th className="py-3 px-4">Tagged Conversations</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredCustomers.map((customer) => (
                  <tr 
                    key={customer.phone_number}
                    onClick={() => setSelectedCustomer(customer)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                      {customer.customer_name}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                      {customer.phone_number}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      <div>{customer.email_address !== 'N/A' ? customer.email_address : '-'}</div>
                      {customer.company_name !== 'N/A' && (
                        <div className="text-[11px] text-slate-400 font-medium">{customer.company_name}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 font-mono whitespace-nowrap">
                      {customer.lastInteractionDate && customer.lastInteractionTime
                        ? `${customer.lastInteractionDate} ${customer.lastInteractionTime}`
                        : (customer.lastInteractionDate || '-')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 font-heading">
                        {customer.conversations.length} conversation(s)
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <ChevronRight size={16} className="text-slate-400 group-hover:text-emerald-600 inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Detail Drawer */}
      {selectedCustomer && (
        <div 
          onClick={() => setSelectedCustomer(null)}
          className="fixed inset-0 z-40 overflow-hidden bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
        >
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div 
              onClick={(e) => e.stopPropagation()}
              className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col cursor-default"
            >
              {/* Drawer Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold font-heading">{selectedCustomer.customer_name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedCustomer.phone_number}</p>
                </div>
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Customer Details Block */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading">
                    Customer Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-heading">
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] block">Customer Name</span>
                      <span className="font-bold text-slate-900 text-sm">{selectedCustomer.customer_name || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] block">Phone Number</span>
                      <span className="font-bold text-slate-800 font-mono">{selectedCustomer.phone_number || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] block">Company Name</span>
                      <span className="font-bold text-slate-800">{selectedCustomer.company_name || 'Individual / N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Activity & Conversations Feed */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center">
                      <Activity size={14} className="mr-1.5 text-emerald-600" /> 
                      Conversation history
                    </h4>
                  </div>

                  <div className="space-y-3">
                    {selectedCustomer.conversations.map((convo) => (
                      <div 
                        key={convo.id} 
                        onClick={() => setSelectedDetailConvo(convo)}
                        className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-2xs hover:bg-slate-50 hover:border-emerald-400 transition-all cursor-pointer group"
                        title="Click to view full conversation details"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-slate-500 font-bold group-hover:text-emerald-600 transition-colors">
                            #{getConvoId(convo)}
                          </span>
                          <span className="font-mono text-slate-600 text-[11px]">
                            {convo.conversation_date && convo.conversation_time
                              ? `${convo.conversation_date} ${convo.conversation_time}`
                              : (convo.conversation_date || '-')}
                          </span>
                        </div>

                        {convo.conversation_summary && (
                          <p className="text-xs text-slate-700 leading-relaxed font-sans bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            {convo.conversation_summary}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex flex-wrap gap-1">
                            {convo.conversation_tags?.map((tag, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-emerald-50 text-emerald-800 text-[11px] font-bold rounded border border-emerald-200 font-heading">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <span className="text-xs font-bold text-emerald-600 group-hover:translate-x-0.5 transition-transform flex items-center font-heading">
                            View Details <ChevronRight size={14} className="ml-0.5" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direct Conversation Details Modal inside Customer Directory */}
      {selectedDetailConvo && (
        <div 
          onClick={() => setSelectedDetailConvo(null)}
          className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden cursor-default"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold font-heading flex items-center">
                  Conversation Details #{getConvoId(selectedDetailConvo)}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedDetailConvo(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Webhook Sync Status Card */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-2xs">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center">
                  Webhook Sync Status
                </h4>

                {selectedDetailConvo.webhook_status === 'synced' ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                    <div className="flex items-center font-bold text-emerald-800 font-heading">
                      Successfully Synced to Webhook Base
                    </div>
                    {selectedDetailConvo.webhook_synced_at && (
                      <p className="text-emerald-700 font-mono text-[11px]">Synced timestamp: {selectedDetailConvo.webhook_synced_at}</p>
                    )}
                  </div>
                ) : selectedDetailConvo.webhook_status === 'failed' ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-2">
                    <div className="flex items-center font-bold text-red-900 font-heading">
                      Webhook Push Failed
                    </div>
                    <div className="bg-white p-2.5 rounded border border-red-200 text-red-800 font-mono text-[11px] leading-relaxed">
                      <strong className="block text-red-900 mb-0.5">Failure Reason:</strong>
                      {selectedDetailConvo.webhook_error || 'Record error / CORS failure'}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-heading flex items-center">
                    <span>Not Synced to Webhook yet (Requires Hot Lead or Booking Appointment tags)</span>
                  </div>
                )}
              </div>

              {/* Customer Details Block */}
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading">
                  Customer Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-heading">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase text-[10px] block">Customer Name</span>
                    <span className="font-bold text-slate-900 text-sm">{selectedDetailConvo.customer_name || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase text-[10px] block">Phone Number</span>
                    <span className="font-bold text-slate-800 font-mono">{selectedDetailConvo.phone_number || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase text-[10px] block">Company Name</span>
                    <span className="font-bold text-slate-800">{selectedDetailConvo.company_name || 'Individual / N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Full Conversation Summary */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-2xs">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center">
                  <FileText size={14} className="mr-1.5 text-emerald-600" /> Full Conversation Summary
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedDetailConvo.conversation_summary || 'No summary available.'}</p>
              </div>

              {/* Combined Block for Customer Sentiment & Next Steps */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-2xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-heading mb-1">Customer Sentiment</h4>
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-800 font-bold rounded-lg border border-slate-200 font-heading inline-block">
                      {selectedDetailConvo.customer_sentiment || 'Neutral'}
                    </span>
                  </div>
                  <div className="sm:col-span-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-heading mb-1 flex items-center">
                      <ArrowRight size={12} className="mr-1 text-emerald-600" /> Next Steps
                    </h4>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed">{selectedDetailConvo.next_steps || 'None provided'}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-heading mb-1">Conversation Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDetailConvo.conversation_tags?.map((t, idx) => (
                      <span key={idx} className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 font-heading text-xs font-semibold rounded-md border border-emerald-200">
                        {t}
                      </span>
                    )) || <span className="text-xs text-slate-400">No tags</span>}
                  </div>
                </div>
              </div>

              {/* Call Audio MP3 Player */}
              {selectedDetailConvo.call_audio_url && (
                <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider font-heading flex items-center">
                      <Volume2 size={15} className="mr-1.5 text-emerald-600" /> Call Recording Audio
                    </h4>
                    <a 
                      href={selectedDetailConvo.call_audio_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline flex items-center"
                    >
                      <Download size={13} className="mr-1" /> Open / Download MP3
                    </a>
                  </div>
                  <audio controls src={selectedDetailConvo.call_audio_url} className="w-full h-10 rounded-lg mt-1" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
