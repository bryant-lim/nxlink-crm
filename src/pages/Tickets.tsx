import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Ticket, UserProfile, TicketActivityLog, TicketNote } from '../lib/ticketing';
import { getSLATimerStatus, calculateSLADeadlines } from '../lib/ticketing';
import DateFilter, { filterRecordsByDate } from '../components/DateFilter';
import type { DateFilterValue } from '../components/DateFilter';
import { 
  Plus, 
  Search, 
  Loader2, 
  Clock, 
  X, 
  LayoutGrid, 
  List as ListIcon,
  UserCheck,
  MessageSquare,
  History,
  Send,
  User
} from 'lucide-react';

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [mobileTab, setMobileTab] = useState<'open' | 'in_progress' | 'resolved'>('open');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState<string>('System Rep');

  // Selected ticket drawer & detailed sub-tabs
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'logs' | 'notes'>('details');
  const [activityLogs, setActivityLogs] = useState<TicketActivityLog[]>([]);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [postingNote, setPostingNote] = useState(false);

  // Modal states for creating ticket
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<string>('Support');
  const [newPriority, setNewPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium');
  const [newAssigneeRole, setNewAssigneeRole] = useState('support');
  const [newAssignedUser, setNewAssignedUser] = useState<string>('');

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      fetchTicketLogsAndNotes(selectedTicket.id);
    }
  }, [selectedTicket?.id]);

  const fetchInitialData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      const { data: prof } = await supabase.from('profiles').select('name').eq('email', session.user.email).maybeSingle();
      if (prof) setCurrentUserDisplayName(prof.name);
    }

    const [tksRes, profsRes] = await Promise.all([
      supabase.from('tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('is_active', true)
    ]);

    if (tksRes.data) setTickets(tksRes.data);
    if (profsRes.data) setTeamMembers(profsRes.data);

    setLoading(false);
  };

  const fetchTicketLogsAndNotes = async (ticketId: string) => {
    const [logsRes, notesRes] = await Promise.all([
      supabase.from('ticket_activity_logs').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
      supabase.from('ticket_notes').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false })
    ]);

    if (logsRes.data) setActivityLogs(logsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
  };

  const logTicketActivity = async (ticketId: string, actionType: string, oldValue: string, newValue: string) => {
    await supabase.from('ticket_activity_logs').insert([
      {
        ticket_id: ticketId,
        actor_name: currentUserDisplayName,
        action_type: actionType,
        old_value: oldValue,
        new_value: newValue,
      }
    ]);
  };

  const updateTicketStatus = async (ticketId: string, oldStatus: string, newStatus: string) => {
    const updateData: Partial<Ticket> = { 
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    if (newStatus === 'resolved' || newStatus === 'closed') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { error } = await supabase.from('tickets').update(updateData).eq('id', ticketId);
    if (!error) {
      setTickets(tickets.map(t => t.id === ticketId ? { ...t, ...updateData } : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket({ ...selectedTicket, ...updateData });
      await logTicketActivity(ticketId, 'status_changed', oldStatus, newStatus);
    }
  };

  const updateTicketPriority = async (ticketId: string, oldPriority: string, newPriority: 'urgent' | 'high' | 'medium' | 'low') => {
    const sla = calculateSLADeadlines(newPriority);
    const updateData = {
      priority: newPriority,
      first_response_due_at: sla.first_response_due_at,
      resolution_due_at: sla.resolution_due_at,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('tickets').update(updateData).eq('id', ticketId);
    if (!error) {
      setTickets(tickets.map(t => t.id === ticketId ? { ...t, ...updateData } : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket({ ...selectedTicket, ...updateData });
      await logTicketActivity(ticketId, 'priority_changed', oldPriority, newPriority);
    }
  };

  const updateTicketOwner = async (ticketId: string, oldOwner: string, newUserId: string) => {
    const user = teamMembers.find(m => m.id === newUserId);
    const newOwnerName = user ? user.name : 'Unassigned';

    const updateData = {
      assigned_user_id: newUserId || null,
      assigned_user_name: newOwnerName,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('tickets').update(updateData).eq('id', ticketId);
    if (!error) {
      setTickets(tickets.map(t => t.id === ticketId ? { ...t, ...updateData } : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket({ ...selectedTicket, ...updateData });
      await logTicketActivity(ticketId, 'owner_changed', oldOwner || 'Unassigned', newOwnerName);
      if (selectedTicket) fetchTicketLogsAndNotes(ticketId);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !newNoteText.trim()) return;
    setPostingNote(true);

    const notePayload = {
      ticket_id: selectedTicket.id,
      author_name: currentUserDisplayName,
      note_text: newNoteText.trim(),
    };

    const { data, error } = await supabase.from('ticket_notes').insert([notePayload]).select();
    setPostingNote(false);

    if (!error && data) {
      setNotes([data[0], ...notes]);
      setNewNoteText('');
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const sla = calculateSLADeadlines(newPriority);
    const assignedUserObj = teamMembers.find(m => m.id === newAssignedUser);

    const ticketPayload = {
      title: newTitle,
      customer_phone: newPhone || null,
      customer_name: newCustomer || null,
      company_name: newCompany || null,
      description: newDesc || null,
      category: newCategory,
      priority: newPriority,
      status: 'open',
      assigned_to_role: newCategory === 'Sales-Follow Up' ? 'sales' : newAssigneeRole,
      assigned_user_id: newAssignedUser || null,
      assigned_user_name: assignedUserObj ? assignedUserObj.name : null,
      first_response_due_at: sla.first_response_due_at,
      resolution_due_at: sla.resolution_due_at,
    };

    const { data, error } = await supabase.from('tickets').insert([ticketPayload]).select();

    if (!error && data) {
      setTickets([data[0], ...tickets]);
      setIsModalOpen(false);
      setNewTitle('');
      setNewPhone('');
      setNewCustomer('');
      setNewCompany('');
      setNewDesc('');
      setNewCategory('Support');
      setNewPriority('medium');
    }
  };

  const dateFilteredTickets = filterRecordsByDate(tickets, t => t.created_at, dateFilter);

  const filteredTickets = dateFilteredTickets.filter(t => {
    const matchesSearch = 
      (t.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.assigned_user_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.customer_phone || '').includes(searchTerm);
    
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    return matchesSearch && matchesPriority && matchesCategory;
  });

  const columns = [
    { key: 'open', title: 'Open', color: 'border-blue-500 text-blue-700 bg-blue-50/50' },
    { key: 'in_progress', title: 'In Progress', color: 'border-amber-500 text-amber-700 bg-amber-50/50' },
    { key: 'pending_customer', title: 'Pending Customer', color: 'border-purple-500 text-purple-700 bg-purple-50/50' },
    { key: 'resolved', title: 'Resolved / Closed', color: 'border-emerald-500 text-emerald-700 bg-emerald-50/50' },
  ];

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">Case & Ticket Management</h1>
          <p className="text-sm text-slate-500">Manage support & sales cases, owner assignments, audit logs, and SLA deadlines.</p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold font-heading flex items-center transition-all ${
                viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <LayoutGrid size={14} className="mr-1.5" /> Kanban
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold font-heading flex items-center transition-all ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ListIcon size={14} className="mr-1.5" /> Table
            </button>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-heading font-semibold text-sm rounded-lg flex items-center shadow-2xs transition-colors"
          >
            <Plus size={16} className="mr-1.5" /> Create Ticket
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer, title, owner..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end text-xs font-heading">
          <DateFilter value={dateFilter} onChange={setDateFilter} />

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700 focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="Sales-Follow Up">💼 Sales-Follow Up</option>
            <option value="Support">🎧 Support</option>
            <option value="Bug Report">🐛 Bug Report</option>
            <option value="Emergency">🚨 Emergency</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700 focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">🚨 Urgent Only</option>
            <option value="high">🔥 High Only</option>
            <option value="medium">⚡ Medium Only</option>
            <option value="low">🟢 Low Only</option>
          </select>
        </div>
      </div>

      {/* Mobile Column Tab Switcher */}
      <div className="flex md:hidden bg-slate-100 p-1 rounded-lg border border-slate-200 font-heading">
        <button
          onClick={() => setMobileTab('open')}
          className={`flex-1 py-2 text-xs font-semibold rounded-md ${mobileTab === 'open' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-500'}`}
        >
          Open ({filteredTickets.filter(t => t.status === 'open').length})
        </button>
        <button
          onClick={() => setMobileTab('in_progress')}
          className={`flex-1 py-2 text-xs font-semibold rounded-md ${mobileTab === 'in_progress' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-500'}`}
        >
          In Progress ({filteredTickets.filter(t => t.status === 'in_progress' || t.status === 'pending_customer').length})
        </button>
        <button
          onClick={() => setMobileTab('resolved')}
          className={`flex-1 py-2 text-xs font-semibold rounded-md ${mobileTab === 'resolved' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500'}`}
        >
          Resolved ({filteredTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length})
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-heading mt-2">Loading ticket system...</p>
        </div>
      ) : (
        <>
          {/* KANBAN VIEW */}
          {viewMode === 'kanban' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {columns.map((col) => {
                const colTickets = filteredTickets.filter(t => {
                  if (col.key === 'resolved') return t.status === 'resolved' || t.status === 'closed';
                  return t.status === col.key;
                });

                const isHiddenOnMobile = (
                  (mobileTab === 'open' && col.key !== 'open') ||
                  (mobileTab === 'in_progress' && (col.key !== 'in_progress' && col.key !== 'pending_customer')) ||
                  (mobileTab === 'resolved' && col.key !== 'resolved')
                );

                return (
                  <div key={col.key} className={`flex flex-col bg-slate-50/70 border border-slate-200 rounded-xl p-3 min-h-[500px] ${isHiddenOnMobile ? 'hidden md:flex' : 'flex'}`}>
                    <div className={`px-3 py-2 border rounded-lg flex items-center justify-between mb-3 ${col.color}`}>
                      <span className="text-xs font-bold uppercase tracking-wider font-heading">{col.title}</span>
                      <span className="px-2 py-0.5 bg-white/80 rounded-full text-xs font-bold font-mono">{colTickets.length}</span>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto">
                      {colTickets.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs font-heading border border-dashed border-slate-200 rounded-lg">
                          No tickets
                        </div>
                      ) : (
                        colTickets.map((t) => {
                          const isDone = t.status === 'resolved' || t.status === 'closed';
                          const slaStatus = getSLATimerStatus(t.resolution_due_at, isDone);

                          return (
                            <div 
                              key={t.id}
                              onClick={() => {
                                setSelectedTicket(t);
                                setDrawerTab('details');
                              }}
                              className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:border-slate-300 transition-all space-y-3 cursor-pointer group"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className={`text-[10px] font-bold font-heading uppercase px-2 py-0.5 rounded border ${
                                  t.category === 'Sales-Follow Up' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  {t.category || 'Support'}
                                </span>

                                <select
                                  value={t.priority}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => updateTicketPriority(t.id, t.priority, e.target.value as any)}
                                  className={`text-[10px] font-bold font-heading uppercase px-2 py-0.5 rounded border focus:outline-none cursor-pointer ${
                                    t.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-200' :
                                    t.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    t.priority === 'medium' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  <option value="urgent">🚨 Urgent</option>
                                  <option value="high">🔥 High</option>
                                  <option value="medium">⚡ Medium</option>
                                  <option value="low">🟢 Low</option>
                                </select>
                              </div>

                              <h3 className="font-bold text-sm text-slate-900 font-heading line-clamp-2 leading-snug group-hover:text-emerald-600 transition-colors">
                                {t.title}
                              </h3>

                              <div className="flex items-center space-x-1.5 text-xs text-slate-600 font-heading">
                                <User size={12} className="text-slate-400" />
                                <span>Owner: <strong>{t.assigned_user_name || 'Unassigned'}</strong></span>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${slaStatus.color}`}>
                                  <Clock size={10} className="mr-1" />
                                  {slaStatus.label}
                                </span>

                                <select
                                  value={t.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => updateTicketStatus(t.id, t.status, e.target.value)}
                                  className="text-[11px] font-heading font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none"
                                >
                                  <option value="open">Open</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="pending_customer">Pending</option>
                                  <option value="resolved">Resolved</option>
                                  <option value="closed">Closed</option>
                                </select>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Owner / Assignee</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">SLA Deadline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredTickets.map((t) => {
                      const isDone = t.status === 'resolved' || t.status === 'closed';
                      const slaStatus = getSLATimerStatus(t.resolution_due_at, isDone);

                      return (
                        <tr 
                          key={t.id} 
                          onClick={() => {
                            setSelectedTicket(t);
                            setDrawerTab('details');
                          }}
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4 font-bold text-slate-900 font-heading">
                            {t.title}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-heading font-semibold">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                              {t.category || 'Support'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-mono">
                            {t.customer_name || t.customer_phone || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-heading font-semibold text-slate-800">
                            {t.assigned_user_name || 'Unassigned'}
                          </td>
                          <td className="py-3.5 px-4 text-xs">
                            <select
                              value={t.priority}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateTicketPriority(t.id, t.priority, e.target.value as any)}
                              className="text-xs font-bold font-heading uppercase px-2 py-0.5 rounded border focus:outline-none"
                            >
                              <option value="urgent">🚨 Urgent</option>
                              <option value="high">🔥 High</option>
                              <option value="medium">⚡ Medium</option>
                              <option value="low">🟢 Low</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-4 text-xs">
                            <select
                              value={t.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateTicketStatus(t.id, t.status, e.target.value)}
                              className="text-xs font-heading font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none"
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In Progress</option>
                              <option value="pending_customer">Pending</option>
                              <option value="resolved">Resolved</option>
                              <option value="closed">Closed</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-4 text-xs">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${slaStatus.color}`}>
                              <Clock size={12} className="mr-1" />
                              {slaStatus.label}
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
        </>
      )}

      {/* TICKET DETAIL, REASSIGNMENT, AUDIT LOG & NOTES DRAWER */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setSelectedTicket(null)}
          ></div>

          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col relative z-10 animate-in slide-in-from-right duration-200 border-l border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-[10px] font-bold font-heading uppercase px-2 py-0.5 bg-slate-200 text-slate-700 rounded">
                    {selectedTicket.category || 'Support'}
                  </span>
                  <span className="text-[10px] font-bold font-heading uppercase px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                    {selectedTicket.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold font-heading text-slate-900">{selectedTicket.title}</h2>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="flex border-b border-slate-200 bg-white font-heading text-xs font-bold">
              <button
                onClick={() => setDrawerTab('details')}
                className={`flex-1 py-3 border-b-2 text-center transition-colors ${
                  drawerTab === 'details' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Ticket Details
              </button>
              <button
                onClick={() => setDrawerTab('logs')}
                className={`flex-1 py-3 border-b-2 text-center transition-colors flex items-center justify-center space-x-1.5 ${
                  drawerTab === 'logs' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <History size={14} />
                <span>Audit Activity Logs ({activityLogs.length})</span>
              </button>
              <button
                onClick={() => setDrawerTab('notes')}
                className={`flex-1 py-3 border-b-2 text-center transition-colors flex items-center justify-center space-x-1.5 ${
                  drawerTab === 'notes' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <MessageSquare size={14} />
                <span>Internal Remarks ({notes.length})</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {drawerTab === 'details' && (
                <div className="space-y-5 text-xs font-sans">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <label className="block text-xs font-bold font-heading uppercase text-slate-700 flex items-center">
                      <UserCheck size={14} className="mr-1.5 text-emerald-600" />
                      Assigned Ticket Owner
                    </label>
                    <select
                      value={selectedTicket.assigned_user_id || ''}
                      onChange={(e) => updateTicketOwner(selectedTicket.id, selectedTicket.assigned_user_name || '', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-heading font-semibold text-slate-900 text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Unassigned</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role.toUpperCase()}) - @{m.username}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-400">Reassigning owner logs an audit trail event in activity logs.</p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                    <h4 className="font-bold text-slate-700 uppercase font-heading text-xs">Customer Information</h4>
                    <p className="text-slate-800">Customer: <strong>{selectedTicket.customer_name || 'N/A'}</strong></p>
                    <p className="text-slate-800">Phone: <strong>{selectedTicket.customer_phone || 'N/A'}</strong></p>
                    <p className="text-slate-800">Company: <strong>{selectedTicket.company_name || 'N/A'}</strong></p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                    <h4 className="font-bold text-slate-700 uppercase font-heading text-xs">Description</h4>
                    <p className="text-slate-700 leading-relaxed">{selectedTicket.description || 'No description provided.'}</p>
                  </div>
                </div>
              )}

              {drawerTab === 'logs' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                    Activity & Audit Timeline
                  </h4>

                  {activityLogs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No activity logs recorded yet.</p>
                  ) : (
                    <div className="space-y-3 border-l-2 border-slate-200 pl-4">
                      {activityLogs.map((log) => (
                        <div key={log.id} className="space-y-1 relative text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 font-heading">{log.actor_name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                            Action: <span className="font-bold text-slate-800">{log.action_type.replace('_', ' ')}</span>
                            {log.old_value && <span> from <em>"{log.old_value}"</em></span>}
                            {log.new_value && <span> to <strong>"{log.new_value}"</strong></span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'notes' && (
                <div className="space-y-4 flex flex-col h-full">
                  <form onSubmit={handleAddNote} className="space-y-2">
                    <label className="block text-xs font-bold font-heading uppercase text-slate-700">Add Remark / Internal Note</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Type internal comment or callback note..."
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans text-slate-900 focus:outline-none focus:border-emerald-500"
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={postingNote}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-heading text-xs font-bold rounded-lg flex items-center space-x-1"
                      >
                        {postingNote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        <span>Post Note</span>
                      </button>
                    </div>
                  </form>

                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-heading">
                      Previous Remarks ({notes.length})
                    </h4>
                    {notes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No notes posted yet for this ticket.</p>
                    ) : (
                      <div className="space-y-2">
                        {notes.map((n) => (
                          <div key={n.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 font-heading">{n.author_name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{new Date(n.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-slate-700 font-sans">{n.note_text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE TICKET MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsModalOpen(false)}></div>

          <form onSubmit={handleCreateTicket} className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden animate-in zoom-in-95 duration-150 border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="text-lg font-bold font-heading text-slate-900">Create New Case / Ticket</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm font-sans">
              <div>
                <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Ticket Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Sales Follow Up - Enterprise Plan"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Category *</label>
                  <select
                    value={newCategory}
                    onChange={(e) => {
                      setNewCategory(e.target.value);
                      if (e.target.value === 'Sales-Follow Up') {
                        setNewAssigneeRole('sales');
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-heading font-semibold text-slate-900 focus:outline-none text-xs"
                  >
                    <option value="Support">🎧 Support Case</option>
                    <option value="Sales-Follow Up">💼 Sales-Follow Up</option>
                    <option value="Billing">💳 Billing Inquiry</option>
                    <option value="Bug Report">🐛 Bug Report</option>
                    <option value="Emergency">🚨 Emergency Issue</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-heading font-semibold text-slate-900 focus:outline-none text-xs"
                  >
                    <option value="urgent">🚨 Urgent (SLA 4h)</option>
                    <option value="high">🔥 High (SLA 24h)</option>
                    <option value="medium">⚡ Medium (SLA 48h)</option>
                    <option value="low">🟢 Low (SLA 72h)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Customer Phone</label>
                  <input
                    type="text"
                    placeholder="+60123456789"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 text-xs"
                    value={newCustomer}
                    onChange={(e) => setNewCustomer(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Assign Ticket Owner</label>
                <select
                  value={newAssignedUser}
                  onChange={(e) => setNewAssignedUser(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-heading font-semibold text-slate-900 focus:outline-none text-xs"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Description / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Provide background details..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 text-xs"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                ></textarea>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-heading text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 text-white font-heading text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-2xs"
              >
                Create Case Ticket
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
