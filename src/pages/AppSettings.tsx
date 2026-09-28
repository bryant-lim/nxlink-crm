import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AppSettings() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'nxlink_webhook_url')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data && data.value) {
        setWebhookUrl(data.value);
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setStatusMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    const trimmedUrl = webhookUrl.trim();

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'nxlink_webhook_url',
          value: trimmedUrl,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setStatusMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 font-sans text-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 flex items-center gap-2">
            <Settings size={20} className="text-slate-600" />
            App Setting
          </h1>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm font-medium">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="webhookUrl" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 font-heading">
              NXLINK Webhook URL
            </label>
            <input
              id="webhookUrl"
              type="url"
              required
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 placeholder-slate-400 font-mono"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold font-heading shadow-xs hover:shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
