import { useState, useRef, useEffect } from 'react';

export type DateRangePreset = 'all' | 'today' | '7days' | 'this_week' | 'this_month' | 'custom';

export interface DateFilterValue {
  preset: DateRangePreset;
  startDateTime?: string; // YYYY-MM-DDTHH:mm
  endDateTime?: string;   // YYYY-MM-DDTHH:mm
}

interface DateFilterProps {
  value: DateFilterValue;
  onChange: (newValue: DateFilterValue) => void;
}

export default function DateFilter({ value, onChange }: DateFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectPreset = (preset: DateRangePreset) => {
    onChange({ preset, startDateTime: undefined, endDateTime: undefined });
    if (preset !== 'custom') {
      setIsOpen(false);
    }
  };

  const getLabel = () => {
    if (value.preset === 'today') return 'Today';
    if (value.preset === '7days') return 'Last 7 Days';
    if (value.preset === 'this_week') return 'This Week';
    if (value.preset === 'this_month') return 'This Month';
    if (value.preset === 'custom') {
      if (value.startDateTime && value.endDateTime) {
        return `${value.startDateTime.replace('T', ' ')} to ${value.endDateTime.replace('T', ' ')}`;
      }
      if (value.startDateTime) return `From ${value.startDateTime.replace('T', ' ')}`;
      if (value.endDateTime) return `Until ${value.endDateTime.replace('T', ' ')}`;
      return 'Custom Range & Time';
    }
    return 'All Time';
  };

  return (
    <div className="relative font-heading text-xs" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="py-2 px-3.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer flex items-center space-x-1"
      >
        <span>{getLabel()}</span>
        <span className="text-[10px] text-slate-400 font-sans ml-1">▼</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3.5 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Quick Options</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => selectPreset('today')}
                className={`py-1.5 px-2.5 rounded text-left font-semibold transition-colors cursor-pointer ${
                  value.preset === 'today' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => selectPreset('7days')}
                className={`py-1.5 px-2.5 rounded text-left font-semibold transition-colors cursor-pointer ${
                  value.preset === '7days' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                Last 7 Days
              </button>

              <button
                type="button"
                onClick={() => selectPreset('this_week')}
                className={`py-1.5 px-2.5 rounded text-left font-semibold transition-colors cursor-pointer ${
                  value.preset === 'this_week' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                This Week
              </button>

              <button
                type="button"
                onClick={() => selectPreset('this_month')}
                className={`py-1.5 px-2.5 rounded text-left font-semibold transition-colors cursor-pointer ${
                  value.preset === 'this_month' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                This Month
              </button>
            </div>

            <button
              type="button"
              onClick={() => selectPreset('all')}
              className={`w-full mt-1 py-1.5 px-2.5 rounded text-left font-semibold transition-colors cursor-pointer ${
                value.preset === 'all' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              All Time
            </button>
          </div>

          <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Custom Date & Time Range</span>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">From Date & Time</label>
                <input
                  type="datetime-local"
                  value={value.startDateTime || ''}
                  onChange={(e) => onChange({ ...value, preset: 'custom', startDateTime: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-semibold block mb-0.5">To Date & Time</label>
                <input
                  type="datetime-local"
                  value={value.endDateTime || ''}
                  onChange={(e) => onChange({ ...value, preset: 'custom', endDateTime: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Utility helper to filter any items by DateFilterValue
export function filterRecordsByDate<T>(
  records: T[],
  getDateStr: (item: T) => string | null | undefined,
  filter: DateFilterValue
): T[] {
  if (filter.preset === 'all') return records;

  const now = new Date();
  let startLimit: Date | null = null;
  let endLimit: Date | null = null;

  if (filter.preset === 'today') {
    startLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    endLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (filter.preset === '7days') {
    startLimit = new Date();
    startLimit.setDate(now.getDate() - 7);
    startLimit.setHours(0, 0, 0, 0);
  } else if (filter.preset === 'this_week') {
    const day = now.getDay();
    const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
    startLimit = new Date(now.setDate(diffToMonday));
    startLimit.setHours(0, 0, 0, 0);
    endLimit = new Date(startLimit);
    endLimit.setDate(startLimit.getDate() + 6);
    endLimit.setHours(23, 59, 59, 999);
  } else if (filter.preset === 'this_month') {
    startLimit = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    endLimit = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (filter.preset === 'custom') {
    if (filter.startDateTime) {
      startLimit = new Date(filter.startDateTime);
    }
    if (filter.endDateTime) {
      endLimit = new Date(filter.endDateTime);
    }
  }

  return records.filter((item) => {
    const rawDate = getDateStr(item);
    if (!rawDate) return false;
    const itemDate = new Date(rawDate);
    if (isNaN(itemDate.getTime())) return false;

    if (startLimit && itemDate < startLimit) return false;
    if (endLimit && itemDate > endLimit) return false;
    return true;
  });
}
