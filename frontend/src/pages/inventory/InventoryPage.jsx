import { useState, useEffect, useCallback } from 'react';
import { Plus, AlertTriangle, Pencil, Trash2, Package, Loader2, ArrowUpDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { inventoryService } from '../../services';
import { useAuth } from '../../context/AuthContext';

function ItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item
    ? { ...item, reorderAt: item.reorder_at, costPrice: item.cost_price, sellPrice: item.sell_price }
    : { name:'', category:'', unit:'pcs', qty:0, reorderAt:5, costPrice:0, sellPrice:0, sku:'', description:'' }
  );
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    setLoading(true);
    try {
      if (item) {
        await inventoryService.update(item.id, form);
        toast.success('Item updated');
      } else {
        await inventoryService.create(form);
        toast.success('Item added');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 animate-slideUp max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold">{item ? 'Edit Item' : 'Add Item'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Product Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Category</label>
              <input value={form.category} onChange={e => set('category', e.target.value)}
                className="input-field" placeholder="e.g. Cakes" />
            </div>
            <div>
              <label className="label">Unit</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)} className="input-field">
                {['pcs','packs','boxes','kg','litre','dozen'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Qty in Stock</label>
              <input type="number" min={0} step="0.01" value={form.qty}
                onChange={e => set('qty', Number(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="label">Reorder at</label>
              <input type="number" min={0} value={form.reorderAt}
                onChange={e => set('reorderAt', Number(e.target.value))} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Cost Price (₹)</label>
              <input type="number" min={0} step="0.01" value={form.costPrice}
                onChange={e => set('costPrice', Number(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="label">Sell Price (₹)</label>
              <input type="number" min={0} step="0.01" value={form.sellPrice}
                onChange={e => set('sellPrice', Number(e.target.value))} className="input-field" />
            </div>
          </div>
          <div>
            <label className="label">SKU / Barcode</label>
            <input value={form.sku} onChange={e => set('sku', e.target.value)}
              className="input-field" placeholder="optional" />
          </div>
          <button onClick={handleSave} disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2 mt-2">
            {loading && <Loader2 size={15} className="animate-spin" />}
            {item ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdjustModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState({ type: 'in', qty: 1, notes: '' });
  const [loading, setLoading] = useState(false);

  const handleAdjust = async () => {
    setLoading(true);
    try {
      await inventoryService.adjustStock(item.id, form);
      toast.success('Stock adjusted');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 animate-slideUp">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold">Adjust Stock</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">✕</button>
        </div>
        <p className="text-sm text-gray-600 mb-4">Current: <strong>{item.qty} {item.unit}</strong> of {item.name}</p>
        <div className="space-y-3">
          <div>
            <label className="label">Type</label>
            <div className="flex gap-2">
              {[['in','Stock In'],['out','Stock Out'],['adjustment','Set Qty']].map(([val,label]) => (
                <button key={val} onClick={() => setForm(p => ({ ...p, type: val }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    form.type === val ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200'
                  }`}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Quantity</label>
            <input type="number" min={0.01} step="0.01" value={form.qty}
              onChange={e => setForm(p => ({ ...p, qty: Number(e.target.value) }))}
              className="input-field" />
          </div>
          <div>
            <label className="label">Notes</label>
            <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="input-field" placeholder="Reason for adjustment" />
          </div>
          <button onClick={handleAdjust} disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {loading && <Loader2 size={15} className="animate-spin" />}
            Confirm Adjustment
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { can } = useAuth();
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);   // null | 'add' | item (for edit)
  const [adjust,  setAdjust]  = useState(null);   // item for stock adjust
  const [lowOnly, setLowOnly] = useState(false);
  const [search,  setSearch]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await inventoryService.getAll({
        search, limit: 100,
        ...(lowOnly && { low_stock: true }),
      });
      setItems(data.data || []);
      setTotal(data.pagination?.total || 0);
    } catch { toast.error('Failed to load inventory'); }
    finally { setLoading(false); }
  }, [search, lowOnly]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this item?')) return;
    try {
      await inventoryService.delete(id);
      toast.success('Item removed');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  const lowCount = items.filter(i => parseFloat(i.qty) <= parseFloat(i.reorder_at)).length;

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} items · {lowCount} need restock</p>
        </div>
        {can('inventory.write') && (
          <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} /> Add Item
          </button>
        )}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field" placeholder="Search items..." />
        </div>
        <button onClick={() => setLowOnly(p => !p)}
          className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
            lowOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
          }`}>
          <AlertTriangle size={15} />
        </button>
      </div>

      {lowCount > 0 && !lowOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">{lowCount} item{lowCount > 1 ? 's' : ''} running low</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {items.filter(i => parseFloat(i.qty) <= parseFloat(i.reorder_at)).map(i => i.name).join(' · ')}
            </p>
          </div>
          <button onClick={() => setLowOnly(true)} className="text-xs text-amber-700 font-medium underline">View</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={24} className="animate-spin text-orange-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Package size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No inventory items yet.</p>
          {can('inventory.write') && (
            <button onClick={() => setModal('add')} className="btn-primary mt-4">Add First Item</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const low = parseFloat(item.qty) <= parseFloat(item.reorder_at);
            const margin = item.sell_price > 0
              ? Math.round(((item.sell_price - item.cost_price) / item.sell_price) * 100)
              : 0;
            return (
              <div key={item.id} className={`card ${low ? 'border-amber-200 bg-amber-50/40' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.category && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.category}</span>
                      )}
                      {low && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
                          <AlertTriangle size={10} /> Low
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Reorder at {item.reorder_at} {item.unit}</p>
                    <div className="flex items-center gap-4 mt-1.5">
                      <span className="text-xs text-gray-500">Cost <strong>₹{item.cost_price}</strong></span>
                      <span className="text-xs text-gray-500">Sell <strong className="text-orange-600">₹{item.sell_price}</strong></span>
                      <span className="text-xs text-green-600 font-medium">{margin}% margin</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-3xl font-display font-semibold ${low ? 'text-amber-600' : 'text-gray-900'}`}>
                      {item.qty}
                    </p>
                    <p className="text-xs text-gray-400">{item.unit}</p>
                    <div className="flex items-center gap-1 justify-end mt-2">
                      {can('inventory.write') && (
                        <>
                          <button onClick={() => setAdjust(item)}
                            className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-500 transition-colors" title="Adjust stock">
                            <ArrowUpDown size={14} />
                          </button>
                          <button onClick={() => setModal(item)}
                            className="p-1.5 hover:bg-orange-50 rounded-lg text-gray-400 hover:text-orange-500 transition-colors">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(item.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ItemModal item={modal === 'add' ? null : modal} onClose={() => setModal(null)} onSaved={load} />
      )}
      {adjust && (
        <AdjustModal item={adjust} onClose={() => setAdjust(null)} onSaved={load} />
      )}
    </div>
  );
}
