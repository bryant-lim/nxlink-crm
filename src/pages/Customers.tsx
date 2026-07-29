import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ConversationData } from '../lib/ticketing';
import { normalizePhoneNumber } from '../lib/ticketing';
import { 
  Search, 
  Loader2, 
  Phone, 
  Mail, 
  Building2, 
  X, 
  ChevronRight,
  Activity,
  UserCheck
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

export default function Customers() {
  const [customers, setCustomers] = useState<ConsolidatedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<ConsolidatedCustomer | null>(null);

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

        {/* Text Filter Input (Requirement 9) */}
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
        /* TABLE VIEW ONLY (Requirement 10) */
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
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col">
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
                {/* Contact Info Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-heading">
                  <div className="flex items-center space-x-2">
                    <Phone size={16} className="text-emerald-600" />
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-[10px]">Phone Number</span>
                      <span className="font-bold text-slate-800 font-mono">{selectedCustomer.phone_number}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Mail size={16} className="text-emerald-600" />
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-[10px]">Email Address</span>
                      <span className="font-bold text-slate-800">{selectedCustomer.email_address}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 sm:col-span-2">
                    <Building2 size={16} className="text-emerald-600" />
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-[10px]">Company Name</span>
                      <span className="font-bold text-slate-800">{selectedCustomer.company_name}</span>
                    </div>
                  </div>
                </div>

                {/* Activity & Conversations Feed */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-heading flex items-center">
                      <Activity size={14} className="mr-1.5 text-emerald-600" /> 
                      Tagged Conversation History ({selectedCustomer.conversations.length})
                    </h4>
                  </div>

                  <div className="space-y-3">
                    {selectedCustomer.conversations.map((convo) => (
                      <div key={convo.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-slate-400 font-bold">#{convo.id.slice(0, 8)}</span>
                          {/* Requirement 12: Formatted Date & Time */}
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

                        <div className="flex flex-wrap gap-1 pt-1">
                          {convo.conversation_tags?.map((tag, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-emerald-50 text-emerald-800 text-[11px] font-bold rounded border border-emerald-200 font-heading">
                              {tag}
                            </span>
                          ))}
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
    </div>
  );
}
