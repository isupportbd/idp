import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';
import { apiClient } from '../../api/client';
import { Activity } from 'lucide-react';
export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [userStats, setUserStats] = useState({ active: 0, online: 0, users: [] as any[] });
  const [showStatsTooltip, setShowStatsTooltip] = useState(false);
  const [showAllActivityModal, setShowAllActivityModal] = useState(false);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all'|'active'|'online'>('all');
  
  // Notifications
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    setIsDropdownOpen(false);
    navigate('/login');
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    let interval: number;
    const fetchStats = async () => {
      if (user?.role === 'admin' || user?.role === 'superadmin') {
        try {
          const res = await apiClient.api.users.stats.$get();
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.stats) {
              setUserStats(data.stats);
            }
          }
        } catch (e) {
          console.error('Failed to fetch stats', e);
        }
      }
    };

    if (user?.role === 'admin' || user?.role === 'superadmin') {
      fetchStats();
      interval = window.setInterval(fetchStats, 30000); // 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user]);

  // Fetch Notifications
  useEffect(() => {
    const fetchNotifs = async () => {
      if (user?.role === 'superadmin') {
        try {
          const res = await apiClient.api.notifications.$get();
          if (res.ok) {
            const data = await res.json() as any;
            if (data.success) {
              setNotifications(data.data);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
    };

    fetchNotifs();
    const notifInterval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(notifInterval);
  }, [user]);

  const deleteNotification = async (id: number) => {
    try {
      await apiClient.api.notifications[':id'].$delete({ param: { id: id.toString() } });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const clearOldData = async (notif: any) => {
    if (!window.confirm('Are you sure you want to delete all past purchase data for this client belonging to the old admin? This cannot be undone.')) return;
    try {
      const res = await apiClient.api.notifications['clear-old-data'][':clientId'][':oldAdminId'].$delete({
        param: { clientId: notif.clientId.toString(), oldAdminId: notif.oldAdminId.toString() }
      });
      const data = await res.json() as any;
      if (data.success) {
        alert('Old data deleted successfully.');
        deleteNotification(notif.id);
      } else {
        alert(data.message || 'Failed to delete old data.');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred.');
    }
  };

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const intervals: Record<string, number> = { year: 31536000, month: 2592000, week: 604800, day: 86400, hour: 3600, minute: 60 };
    for (const [unit, secsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secsInUnit);
      if (interval >= 1) return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
    return 'Just now';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans flex flex-col">
      {/* Top Header */}
      <header className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 sticky top-0 z-50 shadow-sm">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <h1
            className="text-xl font-extrabold tracking-wide cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            onClick={() => navigate(user?.role === 'superadmin' ? '/superadmin' : '/admin')}
          >
            IDP
          </h1>
        </div>

        {/* Center: empty */}
        <div className="flex-1" />

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          
          {/* Notifications (Superadmin only) */}
          {user?.role === 'superadmin' && (
            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
                title="Notifications"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-800"></span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-3 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
                    <span className="font-bold text-slate-100">Notifications</span>
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{notifications.length} New</span>
                  </div>
                  <div className="overflow-y-auto flex-1 p-2">
                    {notifications.length > 0 ? (
                      notifications.map(notif => (
                        <div key={notif.id} className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 mb-2 last:mb-0">
                          <p className="text-sm text-slate-200 mb-2 leading-snug">{notif.message}</p>
                          <div className="flex justify-between items-center mt-3">
                            <button 
                              onClick={() => deleteNotification(notif.id)}
                              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                            >
                              Dismiss
                            </button>
                            <button 
                              onClick={() => clearOldData(notif)}
                              className="text-xs bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white px-2 py-1.5 rounded transition-colors font-medium border border-red-500/20"
                            >
                              Delete Old Data
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center p-6 text-slate-400 text-sm">No new notifications</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Stats Badge */}
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <div 
              className="relative"
              onMouseEnter={() => setShowStatsTooltip(true)}
              onMouseLeave={() => setShowStatsTooltip(false)}
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-full cursor-help">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
                <span className="text-xs font-semibold text-slate-300">
                  Online {userStats.online}, Active {userStats.active}
                </span>
              </div>
              
              {/* Tooltip */}
              {showStatsTooltip && (
                <div className="absolute top-full right-0 pt-2 z-50">
                  <div className="w-80 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                    <div className="p-3 bg-slate-900 border-b border-slate-700">
                      <div className="text-sm font-bold text-slate-100">{userStats.online} Online / {userStats.active} Active</div>
                      <div className="text-[10px] text-slate-400 mt-1">Online = last 30 min heartbeat • Active = worked in last 5 min</div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                    {userStats.users.length > 0 ? (
                      <>
                        {userStats.users.slice(0, 5).map(u => (
                          <div key={u.id} className="flex justify-between items-center p-3 border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30">
                            <div className="flex items-start gap-2">
                              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${u.isActive ? 'bg-emerald-500' : u.isOnline ? 'bg-yellow-500' : 'bg-slate-600'}`}></span>
                              <div>
                                <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                                  {u.name}
                                  <span className="text-[9px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'User'}</span>
                                </div>
                                {u.email && <div className="text-xs text-slate-400">{u.email}</div>}
                                {u.lastPage && <div className="text-[10px] text-slate-500 mt-0.5">📍 {u.lastPage}</div>}
                              </div>
                            </div>
                            <div className="text-[10px] text-slate-500 whitespace-nowrap text-right flex-shrink-0 ml-2">
                              {u.isActive ? <span className="text-emerald-400">Active now</span> : (u.isOnline ? `Online • Active ${timeAgo(u.lastActive).toLowerCase()}` : (u.lastActive ? `Inactive • Last seen ${timeAgo(u.lastActive).toLowerCase()}` : 'Inactive'))}
                            </div>
                          </div>
                        ))}
                        {userStats.users.length > 5 && (
                          <div className="p-2 bg-slate-900/50 border-t border-slate-700">
                            <button 
                              onClick={() => {
                                setShowStatsTooltip(false);
                                setShowAllActivityModal(true);
                              }}
                              className="w-full py-2 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                            >
                              View All ({userStats.users.length})
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-400">No activity data available</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

          {/* Profile avatar + dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setIsDropdownOpen(v => !v)}
              title="User Profile"
              className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 border-2 border-transparent hover:border-blue-500 flex items-center justify-center transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between bg-slate-900/50">
                  <div>
                    <div className="font-semibold text-slate-100 text-sm capitalize">{user?.role === 'superadmin' ? 'Super Admin' : user?.role}</div>
                    <div className="text-xs text-slate-400 truncate max-w-[130px]">{user?.email}</div>
                  </div>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      navigate(user?.role === 'superadmin' ? '/superadmin/profile' : '/admin/profile');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Profile Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-900/50 p-6 relative">
        <Outlet />
      </div>

      {/* Online Activity Modal */}
      {showAllActivityModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  All Online Activity
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {userStats.online} Online / {userStats.active} Active users
                </p>
              </div>
              <button 
                onClick={() => setShowAllActivityModal(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Filters & Search */}
            <div className="p-4 bg-slate-800/30 border-b border-slate-700 flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 w-full sm:w-auto">
                <button onClick={() => setActivityFilter('all')} className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${activityFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`}>All</button>
                <button onClick={() => setActivityFilter('active')} className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${activityFilter === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-300'}`}>Active Only</button>
                <button onClick={() => setActivityFilter('online')} className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${activityFilter === 'online' ? 'bg-yellow-500/20 text-yellow-400' : 'text-slate-400 hover:text-slate-300'}`}>Online Only</button>
              </div>
              <div className="relative w-full sm:w-64">
                <input 
                  type="text"
                  placeholder="Search by name or email..."
                  value={activitySearch}
                  onChange={e => setActivitySearch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 bg-slate-900">
              {(() => {
                let filtered = userStats.users.filter(u => 
                  u.name?.toLowerCase().includes(activitySearch.toLowerCase()) || 
                  u.email?.toLowerCase().includes(activitySearch.toLowerCase())
                );
                
                if (activityFilter === 'active') filtered = filtered.filter(u => u.isActive);
                else if (activityFilter === 'online') filtered = filtered.filter(u => u.isOnline && !u.isActive);

                if (filtered.length === 0) {
                  return <div className="text-center py-10 text-slate-500">No users found matching your criteria.</div>;
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                    {filtered.map((u: any) => (
                      <div key={u.id} className="flex items-start gap-3 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl hover:bg-slate-700/40 transition-colors">
                        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${u.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : u.isOnline ? 'bg-yellow-500' : 'bg-slate-600'}`}></span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <div className="text-sm font-semibold text-slate-200 truncate pr-2 flex items-center gap-2">
                              {u.name}
                              <span className="text-[9px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded flex-shrink-0">{u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'User'}</span>
                            </div>
                          </div>
                          {u.email && <div className="text-xs text-slate-400 truncate">{u.email}</div>}
                          {u.lastPage && <div className="text-[10px] text-slate-500 mt-1 truncate">📍 {u.lastPage}</div>}
                        </div>
                        <div className="text-[10px] text-slate-400 text-right flex-shrink-0">
                          {u.isActive ? <span className="text-emerald-400 font-medium">Active now</span> : (u.isOnline ? `Online • Active ${timeAgo(u.lastActive).toLowerCase()}` : (u.lastActive ? `Inactive • Last seen ${timeAgo(u.lastActive).toLowerCase()}` : 'Inactive'))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
