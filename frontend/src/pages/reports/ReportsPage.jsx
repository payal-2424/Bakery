import { useState, useEffect } from 'react';
import { Loader2, BarChart2, TrendingUp, Package, IndianRupee } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import toast from 'react-hot-toast';
import { reportsService } from '../../services';

const TABS = [
  { key: 'daily',     label: 'Daily',     icon: BarChart2    },
  { key: 'monthly',   label: 'Monthly',   icon: TrendingUp   },
  { key: 'profit',    label: 'Profit',    icon: IndianRupee  },
  { key: 'inventory', label: 'Inventory', icon: Package      },
];

export default function ReportsPage() {
  const [tab,    setTab]    = useState('daily');
  const [data,   setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [date,   setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [year,   setYear]   = useState(new Date().getFullYear());
  const [month,  setMonth]  = useState(new Date().getMonth() + 1);

  useEffect(() => {
    setData(null);
    setLoading(true);
    const fetch = async () => {
      try {
        let res;
        if      (tab === 'daily')     res = await reportsService.getDaily(date);
        else if (tab === 'monthly')   res = await reportsService.getMonthly(year, month);
        else if (tab === 'profit')    res = await reportsService.getProfit({});
        else if (tab === 'inventory') res = await reportsService.getInventory();
        setData(res.data.data);
      } catch { toast.error('Failed to load report'); }
      finally { setLoading(false); }
    };
    fetch();
  }, [tab, date, year, month]);

  return (
    <div className="space-y-4 animate-fadeIn">
      <div>
        <h1 className="font-display text-2xl font-semibold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-0.5">Insights to grow your bakery.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {tab === 'daily' && (
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field w-auto" />
      )}
      {tab === 'monthly' && (
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input-field w-auto">
            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
              <option key={m} value={i+1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input-field w-auto">
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-orange-400" /></div>
      ) : !data ? null : (
        <>
          {/* DAILY REPORT */}
          {tab === 'daily' && (
            <div className="space-y-4">
              <div className="card">
                <p className="text-xs text-gray-400">Total Revenue</p>
                <p className="font-display text-3xl font-semibold text-orange-600">
                  ₹{Number(data.totalRevenue || 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="card">
                <h2 className="font-display text-lg font-semibold mb-3">Payment Breakdown</h2>
                <div className="space-y-2">
                  {(data.paymentBreakdown || []).map(p => (
                    <div key={p.payment_method} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-gray-700">{p.payment_method}</span>
                      <span className="font-semibold">₹{Number(p.total).toLocaleString('en-IN')} ({p.count})</span>
                    </div>
                  ))}
                </div>
              </div>
              {data.salesByProduct?.length > 0 && (
                <div className="card">
                  <h2 className="font-display text-lg font-semibold mb-3">Sales by Product</h2>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={data.salesByProduct.slice(0,8)} margin={{ left:-20, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3e4c8" />
                      <XAxis dataKey="item_name" tick={{ fontSize: 9, fill:'#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill:'#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={v => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                      <Bar dataKey="revenue" fill="#f97316" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* MONTHLY REPORT */}
          {tab === 'monthly' && (
            <div className="space-y-4">
              <div className="card">
                <p className="text-xs text-gray-400">Month Total</p>
                <p className="font-display text-3xl font-semibold text-orange-600">
                  ₹{Number(data.totalRevenue || 0).toLocaleString('en-IN')}
                </p>
              </div>
              {data.dailyTrend?.length > 0 && (
                <div className="card">
                  <h2 className="font-display text-lg font-semibold mb-3">Daily Trend</h2>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={data.dailyTrend} margin={{ left:-20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3e4c8" />
                      <XAxis dataKey="date" tick={{ fontSize:9, fill:'#9ca3af' }} tickFormatter={d => d.slice(8)} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize:9, fill:'#9ca3af' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={v => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
                      <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {data.topProducts?.length > 0 && (
                <div className="card">
                  <h2 className="font-display text-lg font-semibold mb-3">Top Products</h2>
                  <div className="space-y-2">
                    {data.topProducts.map((p, i) => (
                      <div key={p.item_name} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-xs font-semibold flex items-center justify-center shrink-0">{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{p.item_name}</p>
                          <p className="text-xs text-gray-400">{p.qty} sold</p>
                        </div>
                        <p className="text-sm font-semibold">₹{Number(p.revenue).toLocaleString('en-IN')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROFIT REPORT */}
          {tab === 'profit' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[['Revenue', data.totals?.revenue, 'text-gray-900'],
                  ['Cost',    data.totals?.cost,    'text-red-500'],
                  ['Profit',  data.totals?.profit,  'text-green-600'],
                ].map(([label, val, color]) => (
                  <div key={label} className="card text-center">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className={`font-display text-base font-semibold ${color}`}>
                      ₹{Number(val || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
              <div className="card overflow-x-auto">
                <h2 className="font-display text-lg font-semibold mb-3">By Product</h2>
                <table className="w-full text-sm min-w-[360px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Product','Sold','Revenue','Cost','Profit'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-gray-400 pb-2 pr-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items || []).map(item => (
                      <tr key={item.item_name} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 pr-3 font-medium text-gray-800">{item.item_name}</td>
                        <td className="py-2 pr-3 text-gray-600">{item.qty_sold}</td>
                        <td className="py-2 pr-3">₹{Number(item.revenue).toLocaleString('en-IN')}</td>
                        <td className="py-2 pr-3 text-red-500">₹{Number(item.cost).toLocaleString('en-IN')}</td>
                        <td className="py-2 font-semibold text-green-600">₹{Number(item.profit).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* INVENTORY REPORT */}
          {tab === 'inventory' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="card text-center">
                  <p className="text-xs text-gray-400 mb-1">Stock Value</p>
                  <p className="font-display text-lg font-semibold text-gray-900">
                    ₹{Number(data.totalStockValue || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-gray-400 mb-1">Low Stock Items</p>
                  <p className="font-display text-lg font-semibold text-amber-600">{data.lowStockCount || 0}</p>
                </div>
              </div>
              <div className="card overflow-x-auto">
                <h2 className="font-display text-lg font-semibold mb-3">All Items</h2>
                <table className="w-full text-sm min-w-[360px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Item','Qty','Value','Status'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-gray-400 pb-2 pr-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.items || []).map(item => {
                      const low = parseFloat(item.qty) <= parseFloat(item.reorder_at);
                      return (
                        <tr key={item.id} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 pr-3 font-medium text-gray-800">{item.name}</td>
                          <td className="py-2 pr-3 text-gray-600">{item.qty} {item.unit}</td>
                          <td className="py-2 pr-3">₹{Number(item.stock_value || 0).toFixed(0)}</td>
                          <td className="py-2">
                            <span className={`status-badge ${low ? 'status-new' : 'status-completed'}`}>
                              {low ? 'Low' : 'OK'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
