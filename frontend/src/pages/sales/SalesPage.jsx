import { useState, useEffect, useCallback } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import toast from 'react-hot-toast';
import { salesService, inventoryService } from '../../services';
import { useAuth } from '../../context/AuthContext';

const today = () => new Date().toISOString().split('T')[0];

export default function SalesPage() {
  const { can } = useAuth();
  const [sales,    setSales]    = useState([]);
  const [totals,   setTotals]   = useState({});
  const [summary,  setSummary]  = useState([]);
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [period,   setPeriod]   = useState('week');
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({ itemId:'', itemName:'', qty:1, unitPrice:0, paymentMethod:'cash', notes:'' });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, summaryRes, prodRes] = await Promise.all([
        salesService.getAll({ date: today() }),
        salesService.getSummary(period),
        inventoryService.getAll({ limit: 100 }),
      ]);
      setSales(salesRes.data.data || []);
      setTotals(salesRes.data.totals || {});
      setSummary(summaryRes.data.data || []);
      setProducts(prodRes.data.data || []);
    } catch { toast.error('Failed to load sales data'); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const selectProduct = (id) => {
    const prod = products.find(p => p.id === id);
    if (prod) setForm(p => ({ ...p, itemId: prod.id, itemName: prod.name, unitPrice: prod.sell_price }));
    else set('itemId', id);
  };

  const lineTotal = form.unitPrice * form.qty;

  const handleSave = async () => {
    if (!form.itemName) return toast.error('Select a product');
    setSaving(true);
    try {
      await salesService.create({ ...form, qty: Number(form.qty), unitPrice: Number(form.unitPrice) });
      toast.success('Sale recorded!');
      setForm({ itemId:'', itemName:'', qty:1, unitPrice:0, paymentMethod:'cash', notes:'' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await salesService.delete(id);
      toast.success('Entry deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold text-gray-900">Daily Sales Register</h1>
        <p className="text-gray-500 text-sm mt-0.5">Quick entry — replaces your paper khata.</p>
      </div>

      {/* Today's summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Today",    value: totals.total || 0 },
          { label: "Cash",     value: totals.cash  || 0 },
          { label: "UPI",      value: totals.upi   || 0 },
        ].map(({ label, value }) => (
          <div key={label} className="card text-center">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="font-display text-lg font-semibold text-gray-900">₹{Number(value).toLocaleString('en-IN')}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-gray-900">Revenue Trend</h2>
          <div className="flex gap-1">
            {['today','week','month','year'].map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                  period === p ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>{p}</button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-orange-300" /></div>
        ) : (
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={summary} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3e4c8" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#fb923c" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Record sale form */}
      {can('sales.write') && (
        <div className="card">
          <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Record a Sale</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Product</label>
              <select value={form.itemId} onChange={e => selectProduct(e.target.value)} className="input-field">
                <option value="">Select product</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — ₹{p.sell_price}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Quantity</label>
                <input type="number" min={0.1} step="0.5" value={form.qty}
                  onChange={e => set('qty', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="label">Unit Price (₹)</label>
                <input type="number" min={0} value={form.unitPrice}
                  onChange={e => set('unitPrice', e.target.value)} className="input-field" />
              </div>
            </div>
            <div>
              <label className="label">Payment Method</label>
              <div className="flex gap-2">
                {['cash','upi','card'].map(m => (
                  <button key={m} onClick={() => set('paymentMethod', m)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors uppercase ${
                      form.paymentMethod === m
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                    }`}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input value={form.notes} onChange={e => set('notes', e.target.value)}
                className="input-field" placeholder="e.g. table 4, customer name..." />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-600">Total</span>
              <span className="font-display text-xl font-semibold text-orange-600">₹{lineTotal.toFixed(2)}</span>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              {saving && <Loader2 size={15} className="animate-spin" />}
              Save Sale
            </button>
          </div>
        </div>
      )}

      {/* Today's entries */}
      <div className="card">
        <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">
          Today's Entries ({sales.length})
        </h2>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-orange-300" /></div>
        ) : sales.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-6">No sales recorded yet today.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Time','Product','Qty','Method','Amount',''].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-gray-400 pb-2 px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 px-2 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(s.created_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true })}
                    </td>
                    <td className="py-2 px-2 font-medium text-gray-800">{s.item_name}</td>
                    <td className="py-2 px-2 text-gray-600">{s.qty}</td>
                    <td className="py-2 px-2">
                      <span className="capitalize text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {s.payment_method}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-semibold text-gray-800">₹{Number(s.total_amount).toLocaleString('en-IN')}</td>
                    <td className="py-2 px-2">
                      {can('sales.write') && (
                        <button onClick={() => handleDelete(s.id)}
                          className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
