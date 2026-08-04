import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Database, Loader2, RefreshCw } from 'lucide-react';

interface MetricsData {
  totalRows: number;
  rawPayloadKB: number;
  avgRowBytes: number;
  estPostgresRowBytes: number;
  totalDbUsedMB: number;
  earliestDate: string;
  latestDate: string;
  dataSpanDays: number;
  dailyTrafficRate: number;
  freeTierLimitMB: number;
  availableMB: number;
  totalRowCapacity: number;
  remainingRowCapacity: number;
  estimatedDaysToFill: number;
  estimatedYearsToFill: number;
}

export default function DatabaseMetrics() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  const calculateMetrics = async () => {
    setLoading(true);
    try {
      const { data: convos } = await supabase
        .from('conversations')
        .select('*')
        .order('created_at', { ascending: true });

      const convList = convos || [];
      const totalRows = convList.length;

      // Measure byte size
      const rawBytes = convList.reduce((acc, row) => {
        return acc + new TextEncoder().encode(JSON.stringify(row)).length;
      }, 0);

      const rawPayloadKB = rawBytes / 1024;
      const avgRowBytes = totalRows > 0 ? rawBytes / totalRows : 0;
      // Estimate Postgres row size including indexes & page headers (~1.8x)
      const estPostgresRowBytes = avgRowBytes * 1.8;
      const totalDbUsedMB = (rawBytes * 1.8) / (1024 * 1024);

      // Traffic calculation
      const timestamps = convList
        .map(c => {
          if (c.created_at) return new Date(c.created_at).getTime();
          if (c.conversation_date) return new Date(c.conversation_date).getTime();
          return null;
        })
        .filter(Boolean) as number[];

      let earliestDate = 'N/A';
      let latestDate = 'N/A';
      let dataSpanDays = 1;
      let dailyTrafficRate = 0;

      if (timestamps.length > 0) {
        const minTs = timestamps[0];
        const maxTs = timestamps[timestamps.length - 1];
        earliestDate = new Date(minTs).toISOString().split('T')[0];
        latestDate = new Date(maxTs).toISOString().split('T')[0];
        const diffMs = maxTs - minTs;
        dataSpanDays = Math.max(1, diffMs / (1000 * 60 * 60 * 24));
        dailyTrafficRate = totalRows / dataSpanDays;
      }

      // Free tier forecast (500 MB limit, 30 MB reserve for Postgres system/auth)
      const freeTierLimitMB = 500;
      const systemReserveBytes = 30 * 1024 * 1024;
      const freeTierQuotaBytes = freeTierLimitMB * 1024 * 1024;
      const availableBytes = freeTierQuotaBytes - systemReserveBytes - (rawBytes * 1.8);
      const availableMB = availableBytes / (1024 * 1024);

      const totalRowCapacity = Math.floor((freeTierQuotaBytes - systemReserveBytes) / (estPostgresRowBytes || 1500));
      const remainingRowCapacity = Math.max(0, totalRowCapacity - totalRows);

      const estimatedDaysToFill = dailyTrafficRate > 0 ? remainingRowCapacity / dailyTrafficRate : 0;
      const estimatedYearsToFill = estimatedDaysToFill / 365.25;

      setMetrics({
        totalRows,
        rawPayloadKB,
        avgRowBytes,
        estPostgresRowBytes,
        totalDbUsedMB,
        earliestDate,
        latestDate,
        dataSpanDays,
        dailyTrafficRate,
        freeTierLimitMB,
        availableMB,
        totalRowCapacity,
        remainingRowCapacity,
        estimatedDaysToFill,
        estimatedYearsToFill
      });
    } catch (e) {
      console.error('Failed to calculate database metrics', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateMetrics();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 font-sans text-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 flex items-center gap-2">
            <Database size={20} className="text-slate-600" />
            Database Metrics & Capacity Forecast
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Live database measurements and traffic-based growth forecast.</p>
        </div>
        <button
          onClick={calculateMetrics}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold font-heading text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm font-medium">
          <Loader2 size={18} className="animate-spin" />
          Calculating database metrics...
        </div>
      ) : metrics ? (
        <div className="space-y-8 text-sm">
          {/* SECTION 1: LIVE DATABASE MEASUREMENTS */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider font-heading text-slate-400">
              1. Current Live Database Measurements
            </h2>
            <div className="font-mono text-xs space-y-1.5 text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
              <p>Total Conversation Rows : {metrics.totalRows.toLocaleString()} rows</p>
              <p>Raw JSON Data Payload   : {metrics.rawPayloadKB.toFixed(2)} KB ({(metrics.rawPayloadKB / 1024).toFixed(4)} MB)</p>
              <p>Avg Raw Row Size       : {metrics.avgRowBytes.toFixed(0)} bytes / row</p>
              <p>Est Postgres Storage   : {metrics.estPostgresRowBytes.toFixed(0)} bytes (~{(metrics.estPostgresRowBytes / 1024).toFixed(2)} KB) / row (Data + Indexes)</p>
              <p>Total Data Space Used  : {metrics.totalDbUsedMB.toFixed(2)} MB</p>
            </div>
          </section>

          {/* SECTION 2: REAL TRAFFIC RATE */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider font-heading text-slate-400">
              2. Measured Traffic Rate (From History)
            </h2>
            <div className="font-mono text-xs space-y-1.5 text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
              <p>Earliest Recorded Date  : {metrics.earliestDate}</p>
              <p>Latest Recorded Date    : {metrics.latestDate}</p>
              <p>Historical Time Span    : {metrics.dataSpanDays.toFixed(1)} days</p>
              <p>Actual Daily Ingestion  : {metrics.dailyTrafficRate.toFixed(2)} conversations / day</p>
            </div>
          </section>

          {/* SECTION 3: 500 MB FREE TIER FORECAST */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider font-heading text-slate-400">
              3. Growth Forecast (500 MB Free Tier)
            </h2>
            <div className="font-mono text-xs space-y-1.5 text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
              <p>Supabase Free Tier Limit : {metrics.freeTierLimitMB} MB</p>
              <p>Remaining Free Space    : {metrics.availableMB.toFixed(2)} MB</p>
              <p>Total Row Capacity       : {metrics.totalRowCapacity.toLocaleString()} rows</p>
              <p>Remaining Row Capacity   : {metrics.remainingRowCapacity.toLocaleString()} rows</p>
              <p>Est Days to Reach Limit  : {Math.round(metrics.estimatedDaysToFill).toLocaleString()} days</p>
              <p>Est Time to Reach Limit  : {metrics.estimatedYearsToFill.toFixed(1)} years</p>
            </div>
          </section>

          {/* SUMMARY NOTE */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-mono leading-normal">
            Summary: Based on your measured traffic of {metrics.dailyTrafficRate.toFixed(1)} conversations/day, your Supabase Free Tier (500 MB) has remaining capacity for {metrics.remainingRowCapacity.toLocaleString()} conversations (~{metrics.estimatedYearsToFill.toFixed(1)} years of remaining storage).
          </div>
        </div>
      ) : null}
    </div>
  );
}
