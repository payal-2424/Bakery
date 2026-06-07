import { useState, useEffect } from 'react';
import { MessageCircle, Save, Send, Settings, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { whatsappService, customersService } from '../../services';
import { useAuth } from '../../context/AuthContext';

function ConfigTab() {
  const [config,   setConfig]   = useState(null);
  const [form,     setForm]     = useState({ phoneNumberId:'', businessAccountId:'', accessToken:'', webhookVerifyToken:'' });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    whatsappService.getConfig()
      .then(r => {
        const c = r.data.data;
        if (c) { setConfig(c); setForm(f => ({ ...f, phoneNumberId: c.phone_number_id || '', businessAccountId: c.business_account_id || '' })); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await whatsappService.saveConfig(form);
      toast.success('WhatsApp config saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-orange-400" /></div>;

  return (
    <div className="space-y-4">
      {config?.is_active && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-600" />
          <p className="text-sm text-green-700 font-medium">WhatsApp is connected and active</p>
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Meta Business API Config</h2>
        <div>
          <label className="label">Phone Number ID</label>
          <input value={form.phoneNumberId} onChange={e => set('phoneNumberId', e.target.value)}
            className="input-field" placeholder="From Meta Developer Portal" />
        </div>
        <div>
          <label className="label">Business Account ID</label>
          <input value={form.businessAccountId} onChange={e => set('businessAccountId', e.target.value)}
            className="input-field" placeholder="WhatsApp Business Account ID" />
        </div>
        <div>
          <label className="label">Permanent Access Token</label>
          <input type="password" value={form.accessToken} onChange={e => set('accessToken', e.target.value)}
            className="input-field" placeholder="EAAxxxxx... (keep secret!)" />
        </div>
        <div>
          <label className="label">Webhook Verify Token</label>
          <input value={form.webhookVerifyToken} onChange={e => set('webhookVerifyToken', e.target.value)}
            className="input-field" placeholder="Any secret string you choose" />
          <p className="text-xs text-gray-400 mt-1">
            Webhook URL: <code className="bg-gray-100 px-1 rounded">https://your-api.render.com/api/whatsapp/webhook</code>
          </p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Configuration
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-display text-lg font-semibold">Bot Flow</h2>
        <p className="text-sm text-gray-500">
          When a customer sends "Hi", the bot guides them through placing an order. All orders appear instantly on your dashboard.
        </p>
        <ol className="space-y-2">
          {[
            'Customer sends "Hi" → Bot shows welcome menu',
            'Customer picks: Place Order / Check Status / Contact',
            'For orders: Bot shows product list from your inventory',
            'Customer selects product, quantity, pickup date',
            'Order is created automatically in your dashboard',
            'You get a notification immediately',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
              <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function BroadcastTab() {
  const [customers,  setCustomers]  = useState([]);
  const [selected,   setSelected]   = useState([]);
  const [message,    setMessage]    = useState('');
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);

  useEffect(() => {
    customersService.getAll({ limit: 100 })
      .then(r => setCustomers(r.data.data || []))
      .finally(() => setLoading(false));
  }, []);

  const toggleCustomer = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => setSelected(customers.map(c => c.id));
  const clearAll  = () => setSelected([]);

  const handleSend = async () => {
    if (!message.trim()) return toast.error('Enter a message');
    if (!selected.length) return toast.error('Select at least one customer');
    setSending(true);
    try {
      const { data } = await whatsappService.sendBroadcast({ message, customerIds: selected });
      toast.success(data.message || `Sent to ${selected.length} customers`);
      setMessage('');
      setSelected([]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Broadcast failed');
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-display text-lg font-semibold mb-3">Compose Message</h2>
        <div className="space-y-3">
          <div>
            <label className="label">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="input-field resize-none"
              rows={4}
              placeholder="Namaste {name}! 🎂&#10;&#10;Sweet Crumbs here! We have a special offer today...&#10;&#10;Use {name} for personalised greeting."
            />
            <p className="text-xs text-gray-400 mt-1">Use <code className="bg-gray-100 px-1 rounded">{'{name}'}</code> to personalise each message.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Select Recipients ({selected.length} selected)</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-orange-500 hover:underline">All</button>
                <button onClick={clearAll}  className="text-xs text-gray-400 hover:underline">Clear</button>
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-orange-300" /></div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-50">
                {customers.map(c => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-orange-50/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={() => toggleCustomer(c.id)}
                      className="rounded accent-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.phone}</p>
                    </div>
                    <span className="text-xs text-gray-400">{c.total_orders} orders</span>
                  </label>
                ))}
                {customers.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-6">No customers yet.</p>
                )}
              </div>
            )}
          </div>

          <button onClick={handleSend} disabled={sending || !selected.length || !message}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send Broadcast ({selected.length})
          </button>
        </div>
      </div>

      <div className="card bg-amber-50 border-amber-200">
        <p className="text-xs font-medium text-amber-800 mb-1">⚠️ Broadcast Rules</p>
        <ul className="text-xs text-amber-700 space-y-1">
          <li>• Only send to customers who have opted-in</li>
          <li>• WhatsApp limits promotional messages — use templates for bulk</li>
          <li>• Messages are sent one at a time with 300ms delay to avoid blocks</li>
          <li>• Requires WhatsApp Business API to be configured first</li>
        </ul>
      </div>
    </div>
  );
}

export default function WhatsAppPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('config');

  return (
    <div className="space-y-4 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold text-gray-900">WhatsApp Integration</h1>
        <p className="text-gray-500 text-sm mt-0.5">Connect Meta Business API to automate orders.</p>
      </div>

      <div className="flex bg-gray-100 rounded-xl p-1">
        {[['config','⚙️ Configuration'],['broadcast','📢 Broadcast']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>{label}</button>
        ))}
      </div>

      {tab === 'config'    && <ConfigTab />}
      {tab === 'broadcast' && <BroadcastTab />}
    </div>
  );
}
