import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../lib/ticketing';
import { 
  Users as UsersIcon, 
  UserPlus, 
  Search, 
  Loader2, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Headphones, 
  Briefcase, 
  Edit3, 
  Lock, 
  Mail, 
  Phone, 
  User as UserIcon,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

export default function Users() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [currentUserRole, setCurrentUserRole] = useState<string>('admin');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState<'admin' | 'support' | 'sales'>('support');
  const [isActive, setIsActive] = useState(true);

  // Feedback states
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchCurrentRoleAndProfiles();
  }, []);

  const fetchCurrentRoleAndProfiles = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      const { data: curProf } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', session.user.email)
        .maybeSingle();
      if (curProf) {
        setCurrentUserRole(curProf.role);
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProfiles(data);
    }
    setLoading(false);
  };

  const openCreateModal = () => {
    setEditingProfile(null);
    setUsername('');
    setEmail('');
    setPassword('');
    setName('');
    setMobile('');
    setRole('support');
    setIsActive(true);
    setFeedbackMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: UserProfile) => {
    setEditingProfile(p);
    setUsername(p.username);
    setEmail(p.email);
    setPassword('');
    setName(p.name);
    setMobile(p.mobile || '');
    setRole(p.role);
    setIsActive(p.is_active);
    setFeedbackMsg(null);
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedbackMsg(null);

    try {
      if (editingProfile) {
        // Update profile
        const updatePayload: Partial<UserProfile> = {
          username: username.trim(),
          email: email.trim(),
          name: name.trim(),
          mobile: mobile.trim() || null,
          role,
          is_active: isActive,
        };

        const { error } = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', editingProfile.id);

        if (error) throw error;

        setProfiles(profiles.map(p => p.id === editingProfile.id ? { ...p, ...updatePayload } : p));
        setFeedbackMsg({ type: 'success', text: `Updated ${name} successfully!` });
        setTimeout(() => setIsModalOpen(false), 1000);
      } else {
        // Create profile
        const newPayload = {
          id: crypto.randomUUID(),
          username: username.trim(),
          email: email.trim(),
          name: name.trim(),
          mobile: mobile.trim() || null,
          role,
          is_active: isActive,
        };

        const { data, error } = await supabase
          .from('profiles')
          .insert([newPayload])
          .select();

        if (error) throw error;

        if (data && data.length > 0) {
          setProfiles([data[0], ...profiles]);
          setFeedbackMsg({ type: 'success', text: `Created user ${name} (${username}) successfully!` });
          setTimeout(() => setIsModalOpen(false), 1000);
        }
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Error saving user profile.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleUserActiveStatus = async (p: UserProfile) => {
    const newStatus = !p.is_active;
    const { error } = await supabase.from('profiles').update({ is_active: newStatus }).eq('id', p.id);
    if (!error) {
      setProfiles(profiles.map(item => item.id === p.id ? { ...item, is_active: newStatus } : item));
    }
  };

  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = 
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.email || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || p.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 pb-16 md:pb-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight flex items-center">
            <UsersIcon size={24} className="mr-2 text-emerald-600" />
            User Management
          </h1>
          <p className="text-sm text-slate-500">Create, edit, and manage team member accounts, roles, and system display names.</p>
        </div>

        {currentUserRole === 'admin' && (
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-heading font-semibold text-sm rounded-lg flex items-center shadow-2xs transition-colors self-start md:self-auto"
          >
            <UserPlus size={16} className="mr-1.5" /> Create New User
          </button>
        )}
      </div>

      {/* Access Restriction Notice if not admin */}
      {currentUserRole !== 'admin' && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-sm flex items-center space-x-3">
          <AlertCircle size={20} className="text-amber-600 shrink-0" />
          <span>You have read-only permissions for team member profiles. Only Admin accounts can create or edit users.</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, username, or email..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end text-xs font-heading">
          <span className="text-slate-500">Role Filter:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700 focus:outline-none"
          >
            <option value="all">All Roles</option>
            <option value="admin">👑 Admin</option>
            <option value="support">🎧 Support</option>
            <option value="sales">💼 Sales</option>
          </select>
        </div>
      </div>

      {/* User Table Grid */}
      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-heading mt-2">Loading system users...</p>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="py-16 text-center text-slate-500 font-sans bg-white border border-slate-200 rounded-xl">
          No team users found.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider font-heading">
                  <th className="py-3 px-4">Display Name / Username</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Mobile</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredProfiles.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 font-heading text-xs">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 font-heading leading-snug">{p.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">@{p.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                      {p.email}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                      {p.mobile || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold font-heading border ${
                        p.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        p.role === 'sales' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {p.role === 'admin' && <ShieldCheck size={12} className="mr-1" />}
                        {p.role === 'sales' && <Briefcase size={12} className="mr-1" />}
                        {p.role === 'support' && <Headphones size={12} className="mr-1" />}
                        {p.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <button
                        disabled={currentUserRole !== 'admin'}
                        onClick={() => toggleUserActiveStatus(p)}
                        className={`inline-flex items-center space-x-1 font-heading text-xs font-semibold cursor-pointer ${
                          p.is_active ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {p.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        <span>{p.is_active ? 'Active' : 'Inactive'}</span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {currentUserRole === 'admin' && (
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Edit User Profile"
                        >
                          <Edit3 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE / EDIT USER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsModalOpen(false)}></div>

          <form onSubmit={handleSaveUser} className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden animate-in zoom-in-95 duration-150 border border-slate-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="text-base font-bold font-heading text-slate-900">
                {editingProfile ? `Edit User: ${editingProfile.name}` : 'Create New Team Member'}
              </h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm font-sans">
              {feedbackMsg && (
                <div className={`p-3 rounded-lg text-xs font-heading flex items-center space-x-2 border ${
                  feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
                }`}>
                  {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* Display Name */}
              <div>
                <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Display Name (Name) *</label>
                <div className="relative">
                  <UserIcon size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Manager"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 text-xs font-semibold"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">This Name is displayed across tickets, activity logs, and system comments.</p>
              </div>

              {/* Username & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    placeholder="johnmanager"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="john@company.com"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Password & Mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">
                    Password {editingProfile ? '(Optional)' : '*'}
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="password"
                      required={!editingProfile}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Mobile (Optional)</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="+60123456789"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-500 text-xs font-mono"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Role & Active Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">User Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-heading font-semibold text-slate-900 focus:outline-none text-xs"
                  >
                    <option value="support">🎧 Support Specialist</option>
                    <option value="sales">💼 Sales Executive</option>
                    <option value="admin">👑 System Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold font-heading uppercase text-slate-700 mb-1">Account Status</label>
                  <select
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-heading font-semibold text-slate-900 focus:outline-none text-xs"
                  >
                    <option value="true">🟢 Active Account</option>
                    <option value="false">🔴 Inactive / Disabled</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-heading text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 text-white font-heading text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-2xs flex items-center space-x-1.5"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                <span>{editingProfile ? 'Save Changes' : 'Create User'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
