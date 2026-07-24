import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Search, User, Phone, Mail, Calendar, FileText, X } from 'lucide-react';

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
  created_at: string;
}

export default function Dashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

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

  const filtered = conversations.filter(c => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (c.customer_sentiment?.toLowerCase() || '').includes(term) ||
      (c.conversation_summary?.toLowerCase() || '').includes(term) ||
      (c.company_name?.toLowerCase() || '').includes(term) ||
      (c.customer_name?.toLowerCase() || '').includes(term) ||
      (c.phone_number || '').includes(searchTerm)
    );
  });

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-nx-dark mb-2">Dashboard</h1>
          <p className="text-gray-500">View and manage imported customer conversations.</p>
        </div>
        <div className="relative w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-nx-green/50 focus:border-nx-green shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-nx-card border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
                <th className="py-4 px-6 whitespace-nowrap">Date</th>
                <th className="py-4 px-6">Customer</th>
                <th className="py-4 px-6">Phone</th>
                <th className="py-4 px-6">Company</th>
                <th className="py-4 px-6">Sentiment</th>
                <th className="py-4 px-6">Tags</th>
                <th className="py-4 px-6 w-1/3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="w-8 h-8 text-nx-green animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    No conversations found.
                  </td>
                </tr>
              ) : (
                filtered.map((convo) => (
                  <tr 
                    key={convo.id} 
                    onClick={() => setSelectedConvo(convo)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <td className="py-4 px-6 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(convo.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-semibold text-nx-dark group-hover:text-nx-green transition-colors">
                        {convo.customer_name || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {convo.phone_number || '-'}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {convo.company_name || '-'}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <span className="inline-block truncate max-w-[150px] text-gray-600">
                        {convo.customer_sentiment || '-'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {convo.conversation_tags && convo.conversation_tags.length > 0 ? (
                          convo.conversation_tags.map((tag, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-nx-green/10 text-nx-green font-medium text-xs rounded-full whitespace-nowrap">
                              {tag}
                            </span>
                          ))
                        ) : '-'}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      <p className="line-clamp-2">{convo.conversation_summary || '-'}</p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedConvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div 
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
            onClick={() => setSelectedConvo(null)}
          ></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative z-10 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-2xl font-bold text-nx-dark mb-1">
                  {selectedConvo.customer_name || selectedConvo.company_name || 'Unknown Customer'}
                </h2>
                <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                  <span className="flex items-center"><Mail size={14} className="mr-1.5 text-nx-green" /> {selectedConvo.email_address || 'N/A'}</span>
                  <span className="flex items-center"><Phone size={14} className="mr-1.5 text-nx-green" /> {selectedConvo.phone_number || 'N/A'}</span>
                  <span className="flex items-center"><Calendar size={14} className="mr-1.5 text-nx-green" /> {selectedConvo.conversation_date} {selectedConvo.conversation_time}</span>
                </div>
                {selectedConvo.conversation_tags && selectedConvo.conversation_tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {selectedConvo.conversation_tags.map((tag, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-nx-green/10 text-nx-green font-medium text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button 
                onClick={() => setSelectedConvo(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-6 flex-1 bg-gray-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                  <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider flex items-center">
                    Customer Sentiment
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    {selectedConvo.customer_sentiment || 'Not provided'}
                  </p>
                </div>
                
                <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                  <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider flex items-center">
                    Next Steps
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    {selectedConvo.next_steps || 'Not provided'}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider flex items-center">
                  <FileText size={16} className="mr-2" />
                  Conversation Summary
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {selectedConvo.conversation_summary || 'Not provided'}
                </p>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
