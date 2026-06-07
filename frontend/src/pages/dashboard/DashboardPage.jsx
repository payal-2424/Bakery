import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, AlertTriangle, IndianRupee,
  ShoppingBag, Clock, CheckCircle2, Plus, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { reportsService } from '../../services';

function StatCard({ icon: Icon, label, value, color = 'orange' }) {
  const colors = {
    orange: 'bg-orange-50 text-orange-600',
    blue:   'bg-blue-50 text-blue-600',
    amber:  'bg-amber-50 text-amber-600',
    green:  'bg-green-50 text-green-600',
  };
  return (
    <div className="card flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-display font-semibold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-orange-100 rounded-xl px-3 py-2 shadow-lg text-sm">
        <p className="font-medium text-gray-700">{label}</p>
        <p className="text-orange-600 font-semibold">₹{Number(payload[0].value).toLocaleString('en-IN')}</p>
      </div>
    );
  }
  return null;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsService.getDashboard()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-orange-400" />
      </div>
    );
  }

  const orders      = data?.today?.orders || {};
  const pendingCount = (orders.new || 0) + (orders.confirmed || 0) + (orders.preparing || 0);
  const readyCount   = orders.ready || 0;

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">
            Good morning, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">Here's how your bakery is doing.</p>
        </div>
        <Link to="/orders" className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> New Order
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={IndianRupee} label="Today's Revenue"
          value={`₹${Number(data?.today?.revenue || 0).toLocaleString('en-IN')}`} color="orange" />
        <StatCard icon={ShoppingBag} label="Today's Orders"
          value={data?.today?.salesCount || 0} color="blue" />
        <StatCard icon={Clock}        label="Pending Orders"
          value={pendingCount} color="amber" />
        <StatCard icon={CheckCircle2} label="Ready for Pickup"
          value={readyCount} color="green" />
      </div>

      {/* Revenue trend chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-gray-900">Weekly Revenue</h2>
            <p className="text-xs text-gray-400 mt-0.5">Last 7 days</p>
          </div>
          <span className="flex items-center gap-1 text-xs text-green-600 font-medium bg-green-50 px-2.5 py-1 rounded-full">
            <TrendingUp size={12} /> Trending
          </span>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data?.revenueTrend || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#f97316" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3e4c8" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2.5}
              fill="url(#grad)" dot={{ fill: '#f97316', r: 3 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Low stock */}
      {data?.lowStockItems?.length > 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={17} className="text-amber-600" />
              <h2 className="font-display text-base font-semibold text-amber-800">Low Stock Alerts</h2>
            </div>
            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-semibold">
              {data.lowStockItems.length}
            </span>
          </div>
          <div className="space-y-2">
            {data.lowStockItems.map(item => (
              <div key={item.id} className="bg-white rounded-xl px-3 py-2.5 border border-amber-100">
                <p className="text-sm font-medium text-gray-800">
                  Only <span className="text-amber-600 font-semibold">{item.qty} {item.unit}</span> of {item.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Reorder below {item.reorder_at}</p>
              </div>
            ))}
          </div>
          <Link to="/inventory" className="block text-center text-sm text-orange-600 font-medium mt-3 hover:underline">
            Manage inventory →
          </Link>
        </div>
      )}

      {/* Top products */}
      {data?.topProducts?.length > 0 && (
        <div className="card">
          <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Best Sellers This Week</h2>
          <div className="space-y-3">
            {data.topProducts.map((p, i) => (
              <div key={p.item_name} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-semibold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.item_name}</p>
                  <p className="text-xs text-gray-400">{p.total_qty} sold · ₹{Number(p.total_revenue).toLocaleString('en-IN')}</p>
                </div>
                <div className="w-16 h-1.5 bg-orange-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-400 rounded-full"
                    style={{ width: `${Math.min(100, (p.total_qty / (data.topProducts[0]?.total_qty || 1)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      {data?.recentOrders?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-gray-900">Recent Orders</h2>
            <Link to="/orders" className="text-sm text-orange-500 font-medium hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {data.recentOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-800">{order.customer_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{order.order_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">₹{Number(order.total_amount).toLocaleString('en-IN')}</p>
                  <span className={`status-badge status-${order.status}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
