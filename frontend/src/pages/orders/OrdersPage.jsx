import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, ChevronRight, Phone, Trash2, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { ordersService, inventoryService, customersService } from '../../services';
import { useAuth } from '../../context/AuthContext';

const STATUSES  = ['All','new','confirmed','preparing','ready','completed','cancelled'];
const STATUS_NEXT = { new: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'completed' };
const STATUS_LABELS = { new:'New', confirmed:'Confirmed', preparing:'Preparing', ready:'Ready', completed:'Completed', cancelled:'Cancelled' };

function OrderCard({ order, onStatusChange, onDelete, canDelete }) {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const next = STATUS_NEXT[order.status];

  const handleStatus = async (status) => {
    setUpdating(true);
    try {
      await onStatusChange(order.id, status);
      toast.success(`Order ${STATUS_LABELS[status]}`);
    } catch {
      toast.error('Failed to update status');
    } finally { setUpdating(false); }
  };

  return (
    <div className="card animate-fadeIn">
      <div className="flex items-start justify-between cursor-pointer" onClick={() => setOpen(p => !p)}>
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono text-gray-400">{order.order_number}</span>
            <span className={`status-badge status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
            {order.source !== 'manual' && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full capitalize">{order.source}</span>
            )}
          </div>
          <p className="font-medium text-gray-900">{order.customer_name}</p>
          <p className="text-sm text-gray-500 mt-0.5 truncate">
            {(order.items || []).filter(Boolean).map(i => `${i.item_name} ×${i.qty}`).join(', ')}
          </p>
          {order.notes && <p className="text-xs text-gray-400 italic mt-1">"{order.notes}"</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-gray-900">₹{Number(order.total_amount).toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(order.created_at).toLocaleDateString('en-IN')}
          </p>
          <ChevronRight size={16} className={`ml-auto mt-1 text-gray-300 transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 animate-fadeIn">
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="flex items-center gap-2 text-sm text-orange-600">
              <Phone size={14} /> {order.customer_phone}
            </a>
          )}
          {order.pickup_date && (
            <p className="text-xs text-gray-500">
              Pickup: {new Date(order.pickup_date).toLocaleDateString('en-IN')}
              {order.pickup_time && ` at ${order.pickup_time}`}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {next && (
              <button onClick={() => handleStatus(next)} disabled={updating}
                className="btn-primary text-xs py-1.5 flex items-center gap-1">
                {updating ? <Loader2 size={12} className="animate-spin" /> : null}
                Mark as {STATUS_LABELS[next]}
              </button>
            )}
            {!['completed','cancelled'].includes(order.status) && (
              <button onClick={() => handleStatus('cancelled')} disabled={updating}
                className="btn-secondary text-xs py-1.5 border-red-200 text-red-500 hover:bg-red-50">
                Cancel
              </button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(order.id)}
                className="ml-auto p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewOrderModal({ onClose, onCreated }) {
  const [products,   setProducts]   = useState([]);
  const [customers,  setCustomers]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', customerId: '',
    source: 'manual', deliveryType: 'pickup',
    pickupDate: '', notes: '', paymentMethod: 'cash', discount: 0,
    items: [{ itemId: '', itemName: '', qty: 1, unitPrice: 0 }],
  });

  useEffect(() => {
    Promise.all([
      inventoryService.getAll({ limit: 100 }),
      customersService.getAll({ limit: 100 }),
    ]).then(([p, c]) => {
      setProducts(p.data.data || []);
      setCustomers(c.data.data || []);
    }).catch(() => {});
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const setItem = (i, k, v) => {
    const items = [...form.items];
    items[i] = { ...items[i], [k]: v };
    if (k === 'itemId') {
      const prod = products.find(p => p.id === v);
      if (prod) { items[i].itemName = prod.name; items[i].unitPrice = prod.sell_price; }
    }
    if (k === 'qty') {
      const prod = products.find(p => p.id === items[i].itemId);
      if (prod) items[i].unitPrice = prod.sell_price;
    }
    setForm(p => ({ ...p, items }));
  };

  const selectCustomer = (c) => {
    set('customerId', c.id);
    set('customerName', c.name);
    set('customerPhone', c.phone);
  };

  const subtotal = form.items.reduce((s, i) => s + (i.unitPrice * i.qty), 0);
  const total    = subtotal - (form.discount || 0);

  const handleSubmit = async () => {
    if (!form.customerName || !form.customerPhone) return toast.error('Customer name and phone required');
    if (!form.items[0].itemName) return toast.error('Add at least one item');
    setLoading(true);
    try {
      await ordersService.create({ ...form, items: form.items.map(i => ({ ...i, qty: Number(i.qty) })) });
      toast.success('Order created!');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create order');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto animate-slideUp">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold">New Order</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">✕</button>
        </div>
        <div className="space-y-3">
          {/* Customer search */}
          <div>
            <label className="label">Customer Name *</label>
            <input value={form.customerName} onChange={e => set('customerName', e.target.value)}
              className="input-field" placeholder="Type name or search..." list="customer-list" />
            <datalist id="customer-list">
              {customers.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
            {customers.filter(c => c.name.toLowerCase().includes(form.customerName.toLowerCase()) && form.customerName.length > 1).slice(0,3).map(c => (
              <button key={c.id} onClick={() => selectCustomer(c)}
                className="block w-full text-left text-xs text-orange-600 hover:text-orange-700 mt-1 pl-1">
                {c.name} — {c.phone}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Phone *</label>
            <input value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)}
              className="input-field" placeholder="+91 98765 43210" />
          </div>

          {/* Items */}
          <div>
            <label className="label">Items *</label>
            {form.items.map((item, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <select value={item.itemId} onChange={e => setItem(i, 'itemId', e.target.value)} className="input-field flex-1">
                  <option value="">Select product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} — ₹{p.sell_price}</option>)}
                </select>
                <input type="number" min={1} value={item.qty}
                  onChange={e => setItem(i, 'qty', e.target.value)}
                  className="input-field w-16 text-center" />
              </div>
            ))}
            <button onClick={() => set('items', [...form.items, { itemId:'', itemName:'', qty:1, unitPrice:0 }])}
              className="text-xs text-orange-500 font-medium hover:underline">+ Add item</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Delivery</label>
              <select value={form.deliveryType} onChange={e => set('deliveryType', e.target.value)} className="input-field">
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
            <div>
              <label className="label">Pickup Date</label>
              <input type="date" value={form.pickupDate} onChange={e => set('pickupDate', e.target.value)}
                className="input-field" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Payment</label>
              <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className="input-field">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div>
              <label className="label">Discount (₹)</label>
              <input type="number" min={0} value={form.discount}
                onChange={e => set('discount', Number(e.target.value))}
                className="input-field" />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)}
              className="input-field" placeholder="Special instructions..." />
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="text-sm text-gray-600">Total (incl. 5% GST)</span>
            <span className="font-display text-xl font-semibold text-orange-600">
              ₹{(total * 1.05).toFixed(0)}
            </span>
          </div>

          <button onClick={handleSubmit} disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {loading && <Loader2 size={15} className="animate-spin" />}
            Place Order
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { can } = useAuth();
  const [orders,  setOrders]  = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('All');
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [showModal, setModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filter !== 'All') params.status = filter;
      if (search) params.search = search;
      const { data } = await ordersService.getAll(params);
      setOrders(data.data || []);
      setTotal(data.pagination?.total || 0);
    } catch { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  }, [filter, search, page]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const handleStatusChange = async (id, status) => {
    await ordersService.updateStatus(id, status);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this order?')) return;
    try {
      await ordersService.delete(id);
      setOrders(prev => prev.filter(o => o.id !== id));
      toast.success('Order deleted');
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">Orders</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} total orders</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 hover:bg-orange-50 rounded-xl text-gray-400 hover:text-orange-500 transition-colors">
            <RefreshCw size={16} />
          </button>
          {can('orders.write') && (
            <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={15} /> New Order
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-9" placeholder="Search by name or order ID..." />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {STATUSES.map(s => (
          <button key={s} onClick={() => { setFilter(s); setPage(1); }}
            className={`tag-filter whitespace-nowrap capitalize ${filter === s ? 'active' : ''}`}>
            {s === 'All' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={24} className="animate-spin text-orange-400" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-14">
          <ShoppingBag size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No orders found.</p>
          {can('orders.write') && (
            <button onClick={() => setModal(true)} className="btn-primary mt-4">Place First Order</button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {orders.map(order => (
              <OrderCard key={order.id} order={order}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                canDelete={can('orders.write')} />
            ))}
          </div>
          {total > 20 && (
            <div className="flex justify-center gap-2 pt-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-3 py-1.5 text-xs">← Prev</button>
              <span className="text-sm text-gray-500 py-1.5">Page {page}</span>
              <button disabled={orders.length < 20} onClick={() => setPage(p => p + 1)} className="btn-secondary px-3 py-1.5 text-xs">Next →</button>
            </div>
          )}
        </>
      )}

      {showModal && (
        <NewOrderModal onClose={() => setModal(false)} onCreated={load} />
      )}
    </div>
  );
}
