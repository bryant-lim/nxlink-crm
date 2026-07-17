import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('demotiger26');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const email = username === 'admin' ? 'admin@crm.local' : username;

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message + ' (Make sure you created this user in Supabase Auth)');
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-nx-bg p-4 relative overflow-hidden">
      {/* Decorative background shape */}
      <div className="absolute top-0 right-0 -mr-64 -mt-64 w-[800px] h-[800px] bg-nx-green/5 rounded-full blur-3xl pointer-events-none"></div>
      
      <div className="max-w-md w-full bg-nx-card border border-gray-200 rounded-2xl shadow-xl p-8 z-10 relative">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center mb-6">
             <div className="w-10 h-10 bg-nx-green rounded-lg flex items-center justify-center mr-3 shadow-sm">
               <span className="text-white font-bold text-lg">NX</span>
             </div>
             <span className="text-2xl font-bold text-nx-dark tracking-wide">NXLink CRM</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Welcome Back</h2>
          <p className="text-gray-500 text-sm mt-1">Sign in to access your dashboard</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-red-600 text-sm text-center">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-nx-green/50 focus:border-nx-green transition-all"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-nx-green/50 focus:border-nx-green transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-nx-green hover:bg-nx-green-hover text-white font-medium py-3 px-4 rounded-xl transition-colors flex justify-center items-center shadow-md shadow-nx-green/20"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <span className="flex items-center">
                Sign In <LogIn size={18} className="ml-2" />
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
