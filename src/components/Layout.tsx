import { useEffect, useState } from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LayoutDashboard, Code, LogOut, Loader2 } from 'lucide-react';

export default function Layout() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-nx-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-nx-green animate-spin" />
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'API Integration', path: '/api-docs', icon: Code },
  ];

  return (
    <div className="min-h-screen bg-nx-bg flex">
      {/* Sidebar */}
      <aside className="w-64 bg-nx-card border-r border-gray-200 flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="w-8 h-8 bg-nx-green rounded-lg flex items-center justify-center mr-3">
            <span className="text-white font-bold text-sm">NX</span>
          </div>
          <span className="text-lg font-bold text-nx-dark tracking-wide">NXLink CRM</span>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-3 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-nx-green/10 text-nx-green font-medium' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-nx-dark'
                }`}
              >
                <Icon size={20} className="mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 text-gray-500 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors"
          >
            <LogOut size={20} className="mr-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen max-w-full overflow-hidden">
        {/* Mobile Header */}
        <header className="h-16 bg-nx-card border-b border-gray-200 flex items-center justify-between px-4 md:hidden">
           <div className="flex items-center">
             <div className="w-6 h-6 bg-nx-green rounded flex items-center justify-center mr-2">
               <span className="text-white font-bold text-xs">NX</span>
             </div>
             <span className="text-lg font-bold text-nx-dark tracking-wide">NXLink CRM</span>
           </div>
           <button onClick={handleLogout} className="text-gray-500 hover:text-nx-dark">
             <LogOut size={20} />
           </button>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
