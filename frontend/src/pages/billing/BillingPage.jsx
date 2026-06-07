import { useState, useEffect, useCallback } from 'react';
import { Plus, Download, Trash2, FileText, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { billingService, customersService, inventoryService } from '../../services';
import { useAuth } from '../../context/AuthContext';

function NewInvoiceModal({ onClose, onCreated }) {
  const [customers, setCustomers] = useState([]);
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', customerGstin: '', customerAddress: '',
    cgstRate: 2.5, sgstRate: 2.5, discount: 0, notes: '',
    items: [{ itemName: '', hsnCode: '2106', qty: 1, unitPrice: 0, taxRate: 5 }],
  });

  useEffect(() => {
    Promise.all([customersService.getAll({ limit: 100 }), inventoryService.getAll({ limit: 100 })])
      .then(([c, p]) => { setCustomers(c.data.data || []); setProducts(p.data.data || []); })
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => {
    const items = [...form.items];
    items[i] = { ...items[i], [k]: v };
    if (k === 'itemName') {
      const prod = products.find(p => p.name === v);
      if (prod) { items[i].unitPrice = prod.sell_price; items[i].hsnCode = '2106'; }
    }
    setForm(p => ({ ...p, items }));
  };

  const subtotal = form.items.reduce((s, i) => s + (i.unitPrice * i.qty), 0);
  const cgst     = ((subtotal - form.discount) * form.cgstRate / 100);
  const sgst     = ((subtotal - form.discount) * form.sgstRate / 100);
  const total    = subtotal - form.discount + cgst + sgst;

  const handleCreate = async () => {
    if (!form.customerName || !form.items[0].itemName) return toast.error('Fill customer name and at least one item');
    setLoading(true);
    try {
      await billingService.create(form);
      toast.success('Invoice created');
      onCreated(); onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create invoice');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto animate-slideUp">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold">New GST Invoice</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">✕</button>
        </div>
        <div className="space-y-3">
          {/* Customer */}
          <div>
            <label className="label">Customer Name *</label>
            <input value={form.customerName} onChange={e => set('customerName', e.target.value)}
              className="input-field" list="cust-list" />
            <datalist id="cust-list">{customers.map(c => <option key={c.id} value={c.name}/>)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Phone</label>
              <input value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input value={form.customerGstin} onChange={e => set('customerGstin', e.target.value)} className="input-field" placeholder="optional" />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input value={form.customerAddress} onChange={e => set('customerAddress', e.target.value)} className="input-field" />
          </div>

          {/* Items */}
          <div>
            <label className="label">Items *</label>
            {form.items.map((item, i) => (
              <div key={i} className="grid grid-cols-5 gap-1.5 mb-2">
                <input value={item.itemName} onChange={e => setItem(i, 'itemName', e.target.value)}
                  className="input-field col-span-2 text-xs" placeholder="Product" list="prod-list" />
                <datalist id="prod-list">{products.map(p => <option key={p.id} value={p.name}/>)}</datalist>
                <input type="number" value={item.qty} onChange={e => setItem(i, 'qty', Number(e.target.value))}
                  className="input-field text-xs text-center" placeholder="Qty" />
                <input type="number" value={item.unitPrice} onChange={e => setItem(i, 'unitPrice', Number(e.target.value))}
                  className="input-field text-xs" placeholder="Rate" />
                <input type="number" value={item.taxRate} onChange={e => setItem(i, 'taxRate', Number(e.target.value))}
                  className="input-field text-xs text-center" placeholder="Tax%" />
              </div>
            ))}
            <button onClick={() => set('items', [...form.items, { itemName:'', hsnCode:'2106', qty:1, unitPrice:0, taxRate:5 }])}
              className="text-xs text-orange-500 font-medium hover:underline">+ Add item</button>
          </div>

          {/* GST rates + discount */}
          <div className="grid grid-cols-3 gap-2">
            <div><label className="label">CGST %</label>
              <input type="number" step="0.5" value={form.cgstRate} onChange={e => set('cgstRate', Number(e.target.value))} className="input-field" /></div>
            <div><label className="label">SGST %</label>
              <input type="number" step="0.5" value={form.sgstRate} onChange={e => set('sgstRate', Number(e.target.value))} className="input-field" /></div>
            <div><label className="label">Discount ₹</label>
              <input type="number" value={form.discount} onChange={e => set('discount', Number(e.target.value))} className="input-field" /></div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
            {[['Subtotal', subtotal], [`CGST @${form.cgstRate}%`, cgst], [`SGST @${form.sgstRate}%`, sgst],
              form.discount > 0 ? [`Discount`, -form.discount] : null,
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} className="flex justify-between text-gray-600">
                <span>{label}</span><span>₹{val.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200">
              <span>Total</span><span>₹{total.toFixed(2)}</span>
            </div>
          </div>

          <button onClick={handleCreate} disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {loading && <Loader2 size={15} className="animate-spin" />}
            Create Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { can } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [showModal, setModal]   = useState(false);
  const [downloading, setDown]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await billingService.getAll({ search, limit: 20 });
      setInvoices(data.data || []);
      setTotal(data.pagination?.total || 0);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const downloadPDF = async (id, num) => {
    setDown(id);
    try {
      const { data } = await billingService.getPDF(id);
      const url  = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href  = url; link.download = `${num}.pdf`; link.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download PDF'); }
    finally { setDown(null); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this invoice?')) return;
    try { await billingService.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">Billing</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} GST invoices</p>
        </div>
        {can('billing.write') && (
          <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} /> New Invoice
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-9" placeholder="Search by invoice no. or customer..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-orange-400" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16">
          <FileText size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No invoices yet.</p>
          {can('billing.write') && <button onClick={() => setModal(true)} className="btn-primary mt-4">Create First Invoice</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => (
            <div key={inv.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-orange-600 font-semibold">{inv.invoice_number}</p>
                    <span className={`status-badge ${inv.payment_status === 'paid' ? 'status-completed' : 'status-new'}`}>
                      {inv.payment_status}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900 mt-1">{inv.customer_name}</p>
                  {inv.customer_phone && <p className="text-xs text-gray-400">{inv.customer_phone}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(inv.invoice_date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-xl font-semibold text-gray-900">
                    ₹{Number(inv.total_amount).toLocaleString('en-IN')}
                  </p>
                  <div className="flex items-center gap-1 justify-end mt-2">
                    <button onClick={() => downloadPDF(inv.id, inv.invoice_number)}
                      disabled={downloading === inv.id}
                      className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-lg transition-colors">
                      {downloading === inv.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      PDF
                    </button>
                    {can('billing.write') && (
                      <button onClick={() => handleDelete(inv.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <NewInvoiceModal onClose={() => setModal(false)} onCreated={load} />}
    </div>
  );
}
