import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ConversationData } from '../lib/ticketing';
import DateFilter, { filterRecordsByDate } from '../components/DateFilter';
import type { DateFilterValue } from '../components/DateFilter';
import { 
  TrendingUp, 
  Search, 
  Loader2, 
  X,
  MessageSquare,
  Sparkles
} from 'lucide-react';

interface TagCloudItem {
  tag: string;
  count: number;
  conversations: ConversationData[];
  fontSizeClass: string;
  colorClass: string;
}

export default function Reports() {
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [loading, setLoading] = useState(true);
  const [rawConversations, setRawConversations] = useState<ConversationData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<TagCloudItem | null>(null);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false });

    setRawConversations(data || []);
    setLoading(false);
  };

  const filteredConversations = filterRecordsByDate(rawConversations, c => c.created_at || c.conversation_date, dateFilter);

  // Group conversations by tags
  const tagMap = new Map<string, ConversationData[]>();
  filteredConversations.forEach((c) => {
    const tags = c.conversation_tags && c.conversation_tags.length > 0 ? c.conversation_tags : ['Untagged'];
    tags.forEach((rawTag) => {
      const tag = rawTag.trim();
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push(c);
    });
  });

  const maxCount = Math.max(1, ...Array.from(tagMap.values()).map(v => v.length));

  // Visual color themes for cloud tags
  const colorThemes = [
    'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100',
    'bg-indigo-50 text-indigo-800 border-indigo-300 hover:bg-indigo-100',
    'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100',
    'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100',
    'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100',
    'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100',
    'bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100'
  ];

  const cloudItems: TagCloudItem[] = Array.from(tagMap.entries()).map(([tag, convos], idx) => {
    const count = convos.length;
    const ratio = count / maxCount;

    let fontSizeClass = 'text-xs px-2.5 py-1';
    if (ratio > 0.8) {
      fontSizeClass = 'text-2xl sm:text-3xl px-5 py-2.5 font-black';
    } else if (ratio > 0.6) {
      fontSizeClass = 'text-xl sm:text-2xl px-4 py-2 font-extrabold';
    } else if (ratio > 0.4) {
      fontSizeClass = 'text-lg sm:text-xl px-3.5 py-1.5 font-bold';
    } else if (ratio > 0.2) {
      fontSizeClass = 'text-sm sm:text-base px-3 py-1 font-semibold';
    }

    const colorClass = colorThemes[idx % colorThemes.length];

    return {
      tag,
      count,
      conversations: convos,
      fontSizeClass,
      colorClass
    };
  }).sort((a, b) => b.count - a.count);

  const displayedCloudItems = cloudItems.filter(item => 
    item.tag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight flex items-center">
            <TrendingUp size={24} className="mr-2 text-emerald-600" />
            Tag Analytics & Word Cloud
          </h1>
          <p className="text-sm text-slate-500 font-sans">
            Visual frequency breakdown of conversation tags and customer interests.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DateFilter value={dateFilter} onChange={setDateFilter} />

          <div className="relative w-full sm:w-56">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search tags..."
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-heading mt-2">Generating Tag Word Cloud...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Word Cloud Visual Container */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-heading flex items-center">
                <Sparkles size={14} className="mr-1.5 text-emerald-600" /> Interactive Tag Frequency Cloud
              </span>
              <span className="text-xs text-slate-500 font-mono font-medium">
                {displayedCloudItems.length} unique tags
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 py-4 min-h-48">
              {displayedCloudItems.length === 0 ? (
                <p className="text-slate-400 text-xs italic">No matching tags found for current date range or search query.</p>
              ) : (
                displayedCloudItems.map((item) => {
                  const isSelected = selectedTag?.tag === item.tag;
                  return (
                    <button
                      key={item.tag}
                      onClick={() => setSelectedTag(isSelected ? null : item)}
                      className={`inline-flex items-center rounded-xl border transition-all duration-200 cursor-pointer shadow-2xs font-heading tracking-tight ${item.fontSizeClass} ${item.colorClass} ${
                        isSelected ? 'ring-2 ring-emerald-500 scale-105 shadow-md' : 'hover:scale-102'
                      }`}
                      title={`Click to view ${item.count} conversations tagged "${item.tag}"`}
                    >
                      <span>{item.tag}</span>
                      <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-white/70 text-slate-700 font-mono font-bold border border-slate-200">
                        {item.count}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {selectedTag && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                <span className="font-semibold text-emerald-700 font-heading">
                  Filtering for Tag: <strong className="font-bold">{selectedTag.tag}</strong> ({selectedTag.count} conversations)
                </span>
                <button
                  onClick={() => setSelectedTag(null)}
                  className="text-slate-400 hover:text-slate-700 font-heading flex items-center"
                >
                  <X size={14} className="mr-1" /> Clear Tag Selection
                </button>
              </div>
            )}
          </div>

          {/* Conversations Feed for Selected Tag */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold font-heading text-slate-900 flex items-center">
              <MessageSquare size={16} className="mr-2 text-emerald-600" />
              {selectedTag ? `Conversations Tagged "${selectedTag.tag}"` : 'All Tagged Conversations Feed'}
              <span className="ml-2 text-xs font-normal text-slate-500 font-mono">
                ({selectedTag ? selectedTag.conversations.length : filteredConversations.length} records)
              </span>
            </h3>

            <div className="divide-y divide-slate-100">
              {(selectedTag ? selectedTag.conversations : filteredConversations).slice(0, 20).map((convo) => (
                <div key={convo.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold font-heading text-slate-900 text-sm">
                        {convo.customer_name || 'Unknown Contact'}
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {convo.phone_number || ''}
                      </span>
                    </div>
                    <p className="text-slate-600 max-w-2xl line-clamp-1">
                      {convo.conversation_summary || 'No summary available.'}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                      {convo.conversation_date && convo.conversation_time
                        ? `${convo.conversation_date} ${convo.conversation_time}`
                        : (convo.conversation_date || '-')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
