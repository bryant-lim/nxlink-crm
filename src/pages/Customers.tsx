import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ConversationData, Ticket } from '../lib/ticketing';
import { normalizePhoneNumber, calculateAccountHealthScore } from '../lib/ticketing';
import { 
  Search, 
  Loader2, 
  Phone, 
  Mail, 
  Building2, 
  MessageSquare, 
  Ticket as TicketIcon, 
  X, 
  ChevronRight,
  Activity,
  List as ListIcon,
  LayoutGrid
} from 'lucide-react';

interface ConsolidatedCustomer {
  phone_number: string;
  customer_name: string;
  company_name: string;
  email_address: string;
  conversations: ConversationData[];
  tickets: Ticket[];
  health: {
    score: number;
    status: 'excellent' | 'good' | 'at_risk' | 'critical';
    breakdown: Record<string, number>;
  };
  lastInteraction: string;
}

export default function Customers() {
  const [customers, setCustomers] = useState<ConsolidatedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table'); // Default Table View
  const [selectedCustomer, setSelectedCustomer] = useState<ConsolidatedCustomer | null>(null);

  useEffect(() => {
    fetchAndConsolidateData();
  }, []);

  const fetchAndConsolidateData = async () => {
    const [convRes, ticketRes] = await Promise.all([
      supabase.from('conversations').select('*').order('created_at', { ascending: false }),
      supabase.from('tickets').select('*').order('created_at', { ascending: false })
    ]);

    const convos: ConversationData[] = convRes.data || [];
    const tickets: Ticket[] = ticketRes.data || [];

    const groupedMap = new Map<string, {
      customer_name: string;
      company_name: string;
      email_address: string;
      conversations: ConversationData[];
      tickets: Ticket[];
      lastInteraction: string;
    }>();

    convos.forEach((c) => {
      const rawPhone = c.phone_number || 'Unknown';
      const phoneKey = normalizePhoneNumber(rawPhone);

      if (!groupedMap.has(phoneKey)) {
        groupedMap.set(phoneKey, {
          customer_name: c.customer_name || 'Customer',
          company_name: c.company_name || 'N/A',
          email_address: c.email_address || 'N/A',
          conversations: [],
          tickets: [],
          lastInteraction: c.created_at || c.conversation_date || new Date().toISOString()
        });
      }

      const existing = groupedMap.get(phoneKey)!;
      existing.conversations.push(c);
      if (c.customer_name && existing.customer_name === 'Customer') existing.customer_name = c.customer_name;
      if (c.company_name && existing.company_name === 'N/A') existing.company_name = c.company_name;
      if (c.email_address && existing.email_address === 'N/A') existing.email_address = c.email_address;
    });

    tickets.forEach((t) => {
      if (t.customer_phone) {
        const phoneKey = normalizePhoneNumber(t.customer_phone);
        if (groupedMap.has(phoneKey)) {
          groupedMap.get(phoneKey)!.tickets.push(t);
        }
      }
    });

    const consolidatedList: ConsolidatedCustomer[] = Array.from(groupedMap.entries()).map(([phone, data]) => {
      const health = calculateAccountHealthScore(data.conversations, data.tickets);
      return {
        phone_number: phone,
        customer_name: data.customer_name,
        company_name: data.company_name,
        email_address: data.email_address,
        conversations: data.conversations,
        tickets: data.tickets,
        health,
        lastInteraction: data.lastInteraction
      };
    });

    consolidatedList.sort((a, b) => a.health.score - b.health.score);

    setCustomers(consolidatedList);
    setLoading(false);
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = 
      c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone_number.includes(searchTerm);

    const matchesHealth = healthFilter === 'all' || c.health.status === healthFilter;
    return matchesSearch && matchesHealth;
  });

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">Customer Data Platform</h1>
        </div>

        <div className="flex items-center space-x-3">
          {/* View Switcher: Table View (Default) vs Grid */}
          <div className="bg-slate-100 p-1 rounded-lg border border-slate-200 flex font-heading text-xs">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center transition-all ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ListIcon size={14} className="mr-1.5" /> Table
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center transition-all ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid size={14} className="mr-1.5" /> Grid Cards
            </button>
          </div>

          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer, company or phone..."
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 font-heading text-xs">
        <button
          onClick={() => setHealthFilter('all')}
          className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${healthFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
        >
          All Accounts ({customers.length})
        </button>
        <button
          onClick={() => setHealthFilter('critical')}
          className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${healthFilter === 'critical' ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200'}`}
        >
          🔴 Critical Alert ({customers.filter(c => c.health.status === 'critical').length})
        </button>
        <button
          onClick={() => setHealthFilter('at_risk')}
          className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${healthFilter === 'at_risk' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
        >
          🟡 At-Risk ({customers.filter(c => c.health.status === 'at_risk').length})
        </button>
        <button
          onClick={() => setHealthFilter('good')}
          className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${healthFilter === 'good' ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
        >
          🔵 Stable / Good ({customers.filter(c => c.health.status === 'good').length})
        </button>
        <button
          onClick={() => setHealthFilter('excellent')}
          className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${healthFilter === 'excellent' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
        >
          🟢 Champion ({customers.filter(c => c.health.status === 'excellent').length})
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-heading mt-2">Loading Customer Data Platform...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="py-16 text-center text-slate-500 font-sans bg-white border border-slate-200 rounded-xl text-xs">
          No customer accounts found matching your query.
        </div>
      ) : (
        <>
          {/* DEFAULT TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
                      <th className="py-3 px-4">Customer / Company</th>
                      <th className="py-3 px-4">Phone Contact</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Account Health</th>
                      <th className="py-3 px-4">Activity</th>
                      <th className="py-3 px-4">Last Interaction</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredCustomers.map((c) => {
                      const isCritical = c.health.status === 'critical';
                      const isAtRisk = c.health.status === 'at_risk';
                      const isGood = c.health.status === 'good';

                      return (
                        <tr 
                          key={c.phone_number}
                          onClick={() => setSelectedCustomer(c)}
                          className="hover:bg-slate-50 transition-colors cursor-pointer group"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 font-heading group-hover:text-emerald-600 transition-colors">
                              {c.customer_name}
                            </div>
                            <div className="text-xs text-slate-400">{c.company_name}</div>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-mono text-slate-700">
                            {c.phone_number}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {c.email_address}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                              isCritical ? 'bg-red-100 text-red-800 border border-red-200' :
                              isAtRisk ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              isGood ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                              'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {c.health.score} / 100 ({c.health.status.replace('_', ' ').toUpperCase()})
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-heading">
                            <span className="font-bold text-slate-800">{c.conversations.length}</span> chats, <span className="font-bold text-slate-800">{c.tickets.length}</span> tickets
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-500 font-mono">
                            {new Date(c.lastInteraction).toLocaleDateString()}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span className="text-xs font-bold font-heading text-emerald-600 group-hover:translate-x-0.5 inline-flex items-center transition-transform">
                              View Profile <ChevronRight size={14} className="ml-1" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GRID CARDS VIEW */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map((c) => {
                const isCritical = c.health.status === 'critical';
                const isAtRisk = c.health.status === 'at_risk';
                const isGood = c.health.status === 'good';

                return (
                  <div 
                    key={c.phone_number}
                    onClick={() => setSelectedCustomer(c)}
                    className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 shadow-2xs hover:shadow-xs transition-all cursor-pointer space-y-4 group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-base font-heading text-slate-900 group-hover:text-emerald-600 transition-colors">
                            {c.customer_name}
                          </h3>
                          <p className="text-xs text-slate-500 flex items-center mt-0.5 font-sans">
                            <Building2 size={12} className="mr-1 text-slate-400" />
                            {c.company_name}
                          </p>
                        </div>

                        <div className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
                          isCritical ? 'bg-red-50 text-red-700 border-red-200' :
                          isAtRisk ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          isGood ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          Score: {c.health.score}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600 font-mono">
                        <div className="flex items-center">
                          <Phone size={12} className="mr-1.5 text-emerald-600" />
                          <span className="truncate">{c.phone_number}</span>
                        </div>
                        <div className="flex items-center">
                          <Mail size={12} className="mr-1.5 text-emerald-600" />
                          <span className="truncate">{c.email_address}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-heading">
                      <div className="flex items-center space-x-3 text-slate-500">
                        <span className="flex items-center"><MessageSquare size={13} className="mr-1" /> {c.conversations.length}</span>
                        <span className="flex items-center"><TicketIcon size={13} className="mr-1" /> {c.tickets.length}</span>
                      </div>
                      <span className="text-emerald-600 font-bold flex items-center group-hover:translate-x-0.5 transition-transform">
                        Details <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* CUSTOMER PROFILE DRAWER */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setSelectedCustomer(null)}></div>
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-right duration-200 border-l border-slate-200">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-xl font-bold font-heading text-slate-900">{selectedCustomer.customer_name}</h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedCustomer.phone_number} • {selectedCustomer.company_name}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Account Health Breakdown */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 font-heading flex items-center">
                    <Activity size={16} className="mr-1.5 text-emerald-600" />
                    Account Health Score Breakdown
                  </span>
                  <span className="text-lg font-bold font-mono text-slate-900">{selectedCustomer.health.score} / 100</span>
                </div>

                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      selectedCustomer.health.score >= 90 ? 'bg-emerald-600' :
                      selectedCustomer.health.score >= 70 ? 'bg-blue-600' :
                      selectedCustomer.health.score >= 40 ? 'bg-amber-600' : 'bg-red-600'
                    }`} 
                    style={{ width: `${selectedCustomer.health.score}%` }}
                  ></div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-heading pt-2 border-t border-slate-200/60">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Base Score:</span>
                    <span className="font-mono font-bold text-slate-800">+100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sentiment Deductions:</span>
                    <span className="font-mono font-bold text-red-600">{selectedCustomer.health.breakdown.sentiment_deduction || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Open Ticket Penalty:</span>
                    <span className="font-mono font-bold text-amber-600">{selectedCustomer.health.breakdown.active_tickets_deduction || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Clean History Bonus:</span>
                    <span className="font-mono font-bold text-emerald-600">+{selectedCustomer.health.breakdown.recency_bonus || 0}</span>
                  </div>
                </div>
              </div>

              {/* Conversations History */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold font-heading text-slate-900 uppercase tracking-wider">
                  Conversations History ({selectedCustomer.conversations.length})
                </h3>
                <div className="space-y-3">
                  {selectedCustomer.conversations.map((c) => (
                    <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between font-heading font-bold text-slate-900">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded">{c.customer_sentiment || 'Neutral'}</span>
                        <span className="text-slate-400 font-mono text-[11px]">{new Date(c.created_at || c.conversation_date || '').toLocaleDateString()}</span>
                      </div>
                      <p className="text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-100">{c.conversation_summary}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Tickets */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold font-heading text-slate-900 uppercase tracking-wider">
                  Associated Tickets ({selectedCustomer.tickets.length})
                </h3>
                {selectedCustomer.tickets.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No tickets associated with this account.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedCustomer.tickets.map((t) => (
                      <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between text-xs font-heading">
                        <div>
                          <span className="font-bold text-slate-900 block">{t.title}</span>
                          <span className="text-[11px] text-slate-500 font-mono">Owner: {t.assigned_user_name || 'Unassigned'}</span>
                        </div>
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded font-bold uppercase">{t.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
