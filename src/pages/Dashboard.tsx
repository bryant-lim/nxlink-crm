import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Search, User, Phone, Mail, Building2, Calendar, FileText } from 'lucide-react';

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

  const filtered = conversations.filter(c => 
    c.customer_sentiment?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.conversation_summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-slate-400">View and manage imported customer conversations.</p>
        </div>
        <div className="relative w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-500" />
          </div>
          <input
            type="text"
            placeholder="Search conversations..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* List View */}
        <div className="w-1/3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur">
            <h2 className="font-semibold text-slate-200">Recent Entries ({filtered.length})</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-slate-500 text-center py-10">No conversations found.</p>
            ) : (
              filtered.map((convo) => (
                <div
                  key={convo.id}
                  onClick={() => setSelectedConvo(convo)}
                  className={`p-4 rounded-xl cursor-pointer transition-all border ${
                    selectedConvo?.id === convo.id 
                      ? 'bg-blue-600/10 border-blue-500/50' 
                      : 'bg-slate-950 border-transparent hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-white font-medium truncate pr-2">
                      {convo.company_name || 'Unknown Company'}
                    </span>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {new Date(convo.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 line-clamp-2">
                    {convo.conversation_summary || 'No summary provided.'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detail View */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-y-auto p-6">
          {selectedConvo ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              {/* Header Info */}
              <div className="flex justify-between items-start border-b border-slate-800 pb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {selectedConvo.company_name || 'No Company Name'}
                  </h2>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                    <span className="flex items-center"><User size={16} className="mr-1" /> {selectedConvo.customer_name || 'N/A'}</span>
                    <span className="flex items-center"><Mail size={16} className="mr-1" /> {selectedConvo.email_address || 'N/A'}</span>
                    <span className="flex items-center"><Phone size={16} className="mr-1" /> {selectedConvo.phone_number || 'N/A'}</span>
                    <span className="flex items-center"><Calendar size={16} className="mr-1" /> {selectedConvo.conversation_date} {selectedConvo.conversation_time}</span>
                  </div>
                </div>
              </div>

              {/* Sentiment & Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-950 rounded-xl p-5 border border-slate-800">
                  <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center">
                    Customer Sentiment
                  </h3>
                  <p className="text-slate-200 leading-relaxed">
                    {selectedConvo.customer_sentiment || 'Not provided'}
                  </p>
                </div>
                
                <div className="bg-slate-950 rounded-xl p-5 border border-slate-800">
                  <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center">
                    Next Steps
                  </h3>
                  <p className="text-slate-200 leading-relaxed">
                    {selectedConvo.next_steps || 'Not provided'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl p-5 border border-slate-800">
                <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center">
                  <FileText size={16} className="mr-2" />
                  Conversation Summary
                </h3>
                <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selectedConvo.conversation_summary || 'Not provided'}
                </p>
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <Building2 size={48} className="mb-4 opacity-20" />
              <p>Select a conversation to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
