import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingBag, MessageCircle,
  Package, BarChart2, LogOut, CakeSlice,
  Users, FileText, Bell, X, CheckCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notificationsService } from '../../services';

const NAV = [
  { to: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { to: '/orders',    label: 'Orders',    icon: ShoppingBag     },
  { to: '/inventory', label: 'Inventory', icon: Package         },
  { to: '/sales',     label: 'Sales',     icon: BarChart2       },
  { to: '/customers', label: 'Customers', icon: Users           },
];

function NotificationPanel({ onClose }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    notificationsService.getAll()
      .then(r => setItems(r.data.data?.notifications || []))
      .finally(() => setLoading(false));
  }, []);

  const markAll = async () => {
    await notificationsService.markAllRead();
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const typeIcon = (type) => {
    if (type === 'low_stock')  return '📦';
    if (type === 'new_order')  return '🛒';
    if (type === 'birthday')   return '🎂';
    return '🔔';
  };

  return (
    <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="font-display text-base font-semibold">Notifications</h3>
        <div className="flex items-center gap-2">
          <button onClick={markAll} className="text-xs text-orange-500 hover:underline flex items-center gap-1">
            <CheckCheck size={12} /> Mark all read
          </button>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={15} /></button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">All caught up! 🎉</div>
        ) : (
          items.map(n => (
            <div key={n.id} className={`px-4 py-3 border-b border-gray-50 last:border-0 ${!n.is_read ? 'bg-orange-50/50' : ''}`}>
              <div className="flex items-start gap-2">
                <span className="text-base mt-0.5">{typeIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{n.title}</p>
                  {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(n.created_at).toLocaleString('en-IN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </p>
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 shrink-0" />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout }          = useAuth();
  const navigate                  = useNavigate();
  const [showNotifs, setNotifs]   = useState(false);
  const [unreadCount, setUnread]  = useState(0);

  useEffect(() => {
    notificationsService.getAll({ unread_only: true })
      .then(r => setUnread(r.data.data?.unreadCount || 0))
      .catch(() => {});
  }, []);

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-orange-100 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <CakeSlice size={16} className="text-white" />
            </div>
            <div>
              <span className="font-display font-semibold text-gray-900 text-base leading-none block">
                Sweet Crumbs
              </span>
              {user?.bakeryName && (
                <span className="text-xs text-gray-400 leading-none">{user.bakeryName}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setNotifs(p => !p)}
                className="p-2 hover:bg-orange-50 rounded-xl text-gray-500 hover:text-orange-500 transition-colors relative">
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifs && <NotificationPanel onClose={() => setNotifs(false)} />}
            </div>
            <NavLink to="/reports"
              className={({ isActive }) => `p-2 rounded-xl transition-colors ${isActive ? 'text-orange-500' : 'text-gray-500 hover:text-orange-500'}`}>
              <BarChart2 size={18} />
            </NavLink>
            <NavLink to="/billing"
              className={({ isActive }) => `p-2 rounded-xl transition-colors ${isActive ? 'text-orange-500' : 'text-gray-500 hover:text-orange-500'}`}>
              <FileText size={18} />
            </NavLink>
            <button onClick={handleSignOut}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-orange-500 transition-colors p-2">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 pb-24">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-orange-100 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-around">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 text-xs font-medium px-3 py-2 transition-colors
                 ${isActive ? 'text-orange-500' : 'text-gray-500 hover:text-orange-400'}`
              }>
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
