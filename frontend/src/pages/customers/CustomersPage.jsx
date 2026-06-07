import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Phone, Mail, Gift, Star, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { customersService } from '../../services';
import { useAuth } from '../../context/AuthContext';

function CustomerModal({ customer, onClose, onSaved }) {
  const [form, setForm] = useState(customer || {
    name:'', phone:'', email:'', address:'', birthday:'', anniversary:'', notes:'', tags:[],
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.phone) return toast.error('Name and phone required');
    setLoading(true);
    try {
      if (customer) { await customersService.update(customer.id, form); toast.success('Customer updated'); }
      else          { await customersService.create(form); toast.success('Customer added'); }
      onSaved(); onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 animate-slideUp max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold">{customer ? 'Edit Customer' : 'Add Customer'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">✕</button>
        </div>
        <div className="space-y-3">
          {[['name','Name *','text'],['phone','Phone *','tel'],['email','Email','email'],['address','Address','text']].map(([key, label, type]) => (
            <div key={key}>
              <label className="label">{label}</label>
              <input type={type} value={form[key] || ''} onChange={e => set(key, e.target.value)} className="input-field" />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Birthday</label>
              <input type="date" value={form.birthday || ''} onChange={e => set('birthday', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Anniversary</label>
              <input type="date" value={form.anniversary || ''} onChange={e => set('anniversary', e.target.value)} className="input-field" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)}
              className="input-field resize-none" rows={2} placeholder="Preferences, allergies..." />
          </div>
          <button onClick={handleSave} disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {loading && <Loader2 size={15} className="animate-spin" />}
            {customer ? 'Save Changes' : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerDrawer({ id, onClose }) {
  const [customer, setCustomer] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    customersService.getById(id)
      .then(r => setCustomer(r.data.data))
      .catch(() => toast.error('Failed to load customer'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-10 flex justify-center">
        <Loader2 size={24} className="animate-spin text-orange-400" />
      </div>
    </div>
  );
  if (!customer) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto animate-slideUp">
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-xl font-semibold">{customer.name}</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Orders',  value: customer.total_orders },
              { label: 'Spent',   value: `₹${Number(customer.total_spent).toLocaleString('en-IN')}` },
              { label: 'Points',  value: customer.loyalty_points },
            ].map(s => (
              <div key={s.label} className="card text-center">
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className="font-display text-lg font-semibold text-gray-900 mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2 mb-5">
            {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-sm text-orange-600"><Phone size={14}/>{customer.phone}</a>}
            {customer.email && <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-sm text-gray-600"><Mail size={14}/>{customer.email}</a>}
            {customer.birthday && <p className="flex items-center gap-2 text-sm text-gray-600"><Gift size={14}/>{new Date(customer.birthday).toLocaleDateString('en-IN', { day:'numeric', month:'long' })}</p>}
            {customer.notes && <p className="text-xs text-gray-400 italic">"{customer.notes}"</p>}
          </div>

          {/* Order history */}
          {customer.orders?.length > 0 && (
            <div>
              <h3 className="font-display text-base font-semibold text-gray-900 mb-3">Order History</h3>
              <div className="space-y-2">
                {customer.orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-xs font-mono text-gray-400">{o.order_number}</p>
                      <p className="text-sm text-gray-700">
                        {(o.items || []).filter(Boolean).map(i => i.name).join(', ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">₹{Number(o.total_amount).toLocaleString('en-IN')}</p>
                      <span className={`status-badge status-${o.status}`}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { can } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [modal,     setModal]     = useState(null);  // null | 'add' | customer
  const [drawer,    setDrawer]    = useState(null);  // customer id
  const [birthdays, setBirthdays] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, bRes] = await Promise.all([
        customersService.getAll({ search, limit: 50 }),
        customersService.getUpcomingBdays(7),
      ]);
      setCustomers(cRes.data.data || []);
      setTotal(cRes.data.pagination?.total || 0);
      setBirthdays(bRes.data.data || []);
    } catch { toast.error('Failed to load customers'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this customer?')) return;
    try { await customersService.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">Customers</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} customers in your CRM</p>
        </div>
        {can('customers.write') && (
          <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} /> Add
          </button>
        )}
      </div>

      {/* Upcoming birthdays */}
      {birthdays.length > 0 && (
        <div className="card border-pink-200 bg-pink-50/50">
          <div className="flex items-center gap-2 mb-2">
            <Gift size={16} className="text-pink-500" />
            <h3 className="font-display text-base font-semibold text-pink-800">Birthdays this week 🎂</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {birthdays.map(c => (
              <span key={c.id} className="text-xs bg-white border border-pink-200 text-pink-700 px-2.5 py-1 rounded-full">
                {c.name} · {new Date(c.birthday).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-9" placeholder="Search by name or phone..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-orange-400" /></div>
      ) : customers.length === 0 ? (
        <div className="text-center py-14">
          <p className="text-gray-400 text-sm">No customers found.</p>
          {can('customers.write') && <button onClick={() => setModal('add')} className="btn-primary mt-4">Add First Customer</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map(c => (
            <div key={c.id} className="card cursor-pointer hover:border-orange-200 transition-colors"
              onClick={() => setDrawer(c.id)}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.loyalty_points > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        <Star size={10} fill="currentColor" /> {c.loyalty_points} pts
                      </span>
                    )}
                  </div>
                  <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5 hover:text-orange-500">
                    <Phone size={11} /> {c.phone}
                  </a>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.total_orders} orders</p>
                    <p className="text-xs text-gray-400">₹{Number(c.total_spent).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                    {can('customers.write') && (
                      <>
                        <button onClick={() => setModal(c)} className="p-1 hover:bg-orange-50 rounded text-gray-300 hover:text-orange-500">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <CustomerModal customer={modal === 'add' ? null : modal} onClose={() => setModal(null)} onSaved={load} />}
      {drawer && <CustomerDrawer id={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}
