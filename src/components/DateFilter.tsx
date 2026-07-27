import { Calendar as CalendarIcon } from 'lucide-react';

export type DateRangePreset = 'all' | 'today' | '7days' | '30days' | 'this_month' | 'custom';

export interface DateFilterValue {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
}

interface DateFilterProps {
  value: DateFilterValue;
  onChange: (newValue: DateFilterValue) => void;
}

export default function DateFilter({ value, onChange }: DateFilterProps) {
  const handlePresetChange = (preset: DateRangePreset) => {
    onChange({ ...value, preset });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 font-heading text-xs">
      <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700 font-semibold">
        <CalendarIcon size={14} className="text-emerald-600" />
        <select
          value={value.preset}
          onChange={(e) => handlePresetChange(e.target.value as DateRangePreset)}
          className="bg-transparent focus:outline-none cursor-pointer"
        >
          <option value="all">📅 All Time</option>
          <option value="today">⚡ Today</option>
          <option value="7days">🗓️ Last 7 Days</option>
          <option value="30days">📆 Last 30 Days</option>
          <option value="this_month">📊 This Month</option>
          <option value="custom">⚙️ Custom Range</option>
        </select>
      </div>

      {value.preset === 'custom' && (
        <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
          <input
            type="date"
            value={value.startDate || ''}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none"
          />
          <span className="text-slate-400 font-bold">to</span>
          <input
            type="date"
            value={value.endDate || ''}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none"
          />
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
  } else if (filter.preset === '30days') {
    startLimit = new Date();
    startLimit.setDate(now.getDate() - 30);
    startLimit.setHours(0, 0, 0, 0);
  } else if (filter.preset === 'this_month') {
    startLimit = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    endLimit = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (filter.preset === 'custom') {
    if (filter.startDate) {
      startLimit = new Date(filter.startDate);
      startLimit.setHours(0, 0, 0, 0);
    }
    if (filter.endDate) {
      endLimit = new Date(filter.endDate);
      endLimit.setHours(23, 59, 59, 999);
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
