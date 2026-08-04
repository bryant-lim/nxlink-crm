import { useEffect, useState } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  LayoutDashboard, 
  Users as UsersIcon, 
  UserCog, 
  Code, 
  LogOut, 
  Loader2, 
  Menu, 
  X,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  Database
} from 'lucide-react';

export default function Layout() {
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [userRole, setUserRole] = useState<'admin' | 'support' | 'sales'>('admin');
  const [displayName, setDisplayName] = useState<string>('Admin User');
  const [userEmail, setUserEmail] = useState<string>('');

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setUserEmail(session.user.email || '');
        fetchUserProfile(session.user.email || '');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/login');
      } else {
        setUserEmail(session.user.email || '');
        fetchUserProfile(session.user.email || '');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchUserProfile = async (email: string) => {
    if (!email) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (data) {
        setUserRole(data.role as any);
        setDisplayName(data.name || data.username || email.split('@')[0]);
      } else {
        setDisplayName(email.split('@')[0]);
      }
    } catch (e) {
      console.warn('Profile fetch warning:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  const isReportsActive = location.pathname.startsWith('/reports');

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 flex flex-col md:flex-row font-sans">
      {/* Desktop Sidebar */}
      <aside 
        className={`bg-white border-r border-slate-200 flex-col hidden md:flex h-screen sticky top-0 z-30 transition-all duration-200 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div className={`h-16 flex items-center justify-between px-4 border-b border-slate-100 ${isCollapsed ? 'justify-center' : ''}`}>
          {!isCollapsed && (
            <Link to="/" className="flex items-center group">
              <span className="text-base font-bold font-heading tracking-tight text-slate-900">ASimple MW</span>
            </Link>
          )}

          {/* Minimize / Expand Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title={isCollapsed ? 'Expand Sidebar' : 'Minimize Sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {/* Dashboard */}
          <Link
            to="/"
            className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === '/' 
                ? 'bg-slate-100 text-slate-900 font-semibold' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title={isCollapsed ? 'Conversation' : ''}
          >
            <div className="flex items-center space-x-3">
              <LayoutDashboard size={18} className={location.pathname === '/' ? 'text-emerald-600' : 'text-slate-400'} />
              {!isCollapsed && <span className="font-heading">Conversation</span>}
            </div>
          </Link>

          {/* Customers */}
          <Link
            to="/customers"
            className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === '/customers' 
                ? 'bg-slate-100 text-slate-900 font-semibold' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title={isCollapsed ? 'Customer Directory' : ''}
          >
            <div className="flex items-center space-x-3">
              <UsersIcon size={18} className={location.pathname === '/customers' ? 'text-emerald-600' : 'text-slate-400'} />
              {!isCollapsed && <span className="font-heading">Customer Directory</span>}
            </div>
          </Link>

          {/* Tag Analytics / Reports */}
          <Link
            to="/reports"
            className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-all ${
              isReportsActive 
                ? 'bg-slate-100 text-slate-900 font-semibold' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title={isCollapsed ? 'Tag Analytics' : ''}
          >
            <div className="flex items-center space-x-3">
              <TrendingUp size={18} className={isReportsActive ? 'text-emerald-600' : 'text-slate-400'} />
              {!isCollapsed && <span className="font-heading">Tag Analytics</span>}
            </div>
          </Link>

          {/* User Management (Admin Only) */}
          {userRole === 'admin' && (
            <Link
              to="/users"
              className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-all ${
                location.pathname === '/users' 
                  ? 'bg-slate-100 text-slate-900 font-semibold' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
              title={isCollapsed ? 'User Management' : ''}
            >
              <div className="flex items-center space-x-3">
                <UserCog size={18} className={location.pathname === '/users' ? 'text-emerald-600' : 'text-slate-400'} />
                {!isCollapsed && <span className="font-heading">User Management</span>}
              </div>
            </Link>
          )}

          {/* API Integration */}
          <Link
            to="/api-docs"
            className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === '/api-docs' 
                ? 'bg-slate-100 text-slate-900 font-semibold' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title={isCollapsed ? 'API Integration' : ''}
          >
            <div className="flex items-center space-x-3">
              <Code size={18} className={location.pathname === '/api-docs' ? 'text-emerald-600' : 'text-slate-400'} />
              {!isCollapsed && <span className="font-heading">API Integration</span>}
            </div>
          </Link>

          {/* Database Metrics */}
          <Link
            to="/db-metrics"
            className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === '/db-metrics' 
                ? 'bg-slate-100 text-slate-900 font-semibold' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title={isCollapsed ? 'Database Metrics' : ''}
          >
            <div className="flex items-center space-x-3">
              <Database size={18} className={location.pathname === '/db-metrics' ? 'text-emerald-600' : 'text-slate-400'} />
              {!isCollapsed && <span className="font-heading">Database Metrics</span>}
            </div>
          </Link>
        </nav>

        {/* User Profile & Sign Out */}
        <div className="p-3 border-t border-slate-100 space-y-2">
          {!isCollapsed ? (
            <div className="px-3.5 py-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
              <div className="truncate">
                <p className="text-xs font-bold font-heading text-slate-900 truncate">{displayName}</p>
                <p className="text-[10px] text-slate-400 truncate font-mono">{userEmail}</p>
              </div>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-heading uppercase ${
                userRole === 'admin' ? 'bg-purple-100 text-purple-700' :
                userRole === 'sales' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {userRole}
              </span>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700 font-heading">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className={`flex items-center w-full ${isCollapsed ? 'justify-center px-2' : 'px-3.5'} py-2 text-xs font-semibold font-heading text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors group`}
            title={isCollapsed ? 'Sign Out' : ''}
          >
            <LogOut size={16} className={`${isCollapsed ? '' : 'mr-2'} text-slate-400 group-hover:text-red-500 transition-colors`} />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-40 md:hidden">
        <div className="flex items-center">
          <div>
            <span className="text-base font-bold font-heading tracking-tight text-slate-900 block leading-tight">ASimple CRM</span>
            <span className="text-[10px] text-slate-400 font-mono">{displayName} ({userRole})</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-16 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden flex flex-col">
          <div className="bg-white border-b border-slate-200 p-4 space-y-2 animate-in slide-in-from-top-2 duration-150">
            <Link to="/" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
              <LayoutDashboard size={20} className="text-slate-400" />
              <span className="font-heading">Conversation</span>
            </Link>
            <Link to="/customers" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
              <UsersIcon size={20} className="text-slate-400" />
              <span className="font-heading">Customer Directory</span>
            </Link>

            <div className="space-y-1 pl-4 border-l-2 border-slate-200 py-1">
              <span className="text-xs font-bold text-slate-400 font-heading uppercase">Report & Analytics</span>
              <Link to="/reports" className="flex items-center space-x-2 py-2 text-xs font-heading font-medium text-slate-700">
                <TrendingUp size={14} className="text-emerald-600" />
                <span>Tag Analytics</span>
              </Link>
            </div>

            {userRole === 'admin' && (
              <Link to="/users" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                <UserCog size={20} className="text-slate-400" />
                <span className="font-heading">User Management</span>
              </Link>
            )}

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors font-heading font-semibold"
              >
                <LogOut size={20} className="mr-3 text-red-500" />
                Sign Out ({displayName})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace View */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Nav Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-2 px-3 flex justify-around items-center z-30 shadow-lg">
        <Link to="/" className="flex flex-col items-center py-1 px-3 rounded-lg text-slate-600">
          <LayoutDashboard size={18} />
          <span className="text-[10px] font-heading mt-1">Conversation</span>
        </Link>
        <Link to="/customers" className="flex flex-col items-center py-1 px-3 rounded-lg text-slate-600">
          <UsersIcon size={18} />
          <span className="text-[10px] font-heading mt-1">Customers</span>
        </Link>
        <Link to="/reports" className="flex flex-col items-center py-1 px-3 rounded-lg text-slate-600">
          <TrendingUp size={18} />
          <span className="text-[10px] font-heading mt-1">Analytics</span>
        </Link>
      </div>
    </div>
  );
}
