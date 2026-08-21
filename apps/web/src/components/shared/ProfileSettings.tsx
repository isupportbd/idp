import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/auth';
import { Mail, User, Lock, KeyRound, Save, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export default function ProfileSettings() {
  const { user } = useAuthStore();
  
  // Name Edit
  const [name, setName] = useState(user?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);

  // Global Toast
  const [toastMessage, setToastMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Password Change State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Countdown timer for OTP
  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleUpdateName = async () => {
    if (!name.trim()) return;
    setIsSavingName(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/profile/update-name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Name updated! Refresh to see changes everywhere.');
      } else {
        showToast('error', data.message || 'Failed to update name');
      }
    } catch (error) {
      showToast('error', 'Network error');
    }
    setIsSavingName(false);
  };

  const handleRequestPasswordChange = async () => {
    if (newPassword.length < 6) {
      showToast('error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('error', 'Passwords do not match');
      return;
    }

    setIsSendingOtp(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/profile/request-password-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setOtpSent(true);
        setCountdown(600); // 10 minutes
        showToast('success', 'OTP sent to your email!');
      } else {
        showToast('error', data.message || 'Failed to send OTP');
      }
    } catch (error) {
      showToast('error', 'Network error. Could not request OTP.');
    }
    setIsSendingOtp(false);
  };

  const handleVerifyPasswordChange = async () => {
    if (!otp) return;
    setIsVerifying(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/profile/verify-password-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ otp, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Password changed successfully!');
        setOtpSent(false);
        setNewPassword('');
        setConfirmPassword('');
        setOtp('');
        setCountdown(0);
      } else {
        showToast('error', data.message || 'Invalid OTP');
      }
    } catch (error) {
      showToast('error', 'Network error during verification');
    }
    setIsVerifying(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      
      {toastMessage && (
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] p-5 rounded-2xl shadow-2xl flex items-center justify-center gap-4 border max-w-lg min-w-[320px] animate-in fade-in zoom-in-95 duration-200 ${toastMessage.type === 'success' ? 'bg-emerald-900/95 border-emerald-500/50 text-emerald-100' : 'bg-red-900/95 border-red-500/50 text-red-100'}`}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertCircle size={24} className="text-red-400" />}
          <span className="text-base font-semibold text-center">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <User className="w-7 h-7 text-blue-500" />
          Profile Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">Manage your account information and password.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Basic Info */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-400" />
            Basic Information
          </h2>
          
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-2">
                <Mail className="w-4 h-4" /> Email Address
              </label>
              <input
                type="text"
                value={user?.email || 'No email set'}
                readOnly
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-400 cursor-not-allowed focus:outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-1 pl-1">Email cannot be changed.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-2">
                <User className="w-4 h-4" /> Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            <button
              onClick={handleUpdateName}
              disabled={isSavingName || name === user?.name}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingName ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <h2 className="text-lg font-semibold text-slate-200 mb-6 flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-400" />
            Security & Password
          </h2>

          <div className="space-y-5 relative z-10">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  disabled={otpSent}
                  placeholder="Enter new password (min. 6 chars)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 pr-11 text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5 flex items-center gap-2">
                <KeyRound className="w-4 h-4" /> Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  disabled={otpSent}
                  placeholder="Re-enter new password"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 pr-11 text-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!otpSent ? (
              <button
                onClick={handleRequestPasswordChange}
                disabled={isSendingOtp || !newPassword || !confirmPassword}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingOtp ? 'Sending OTP...' : 'Request Password Change'}
              </button>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mt-6 animate-in slide-in-from-bottom-4">
                <h3 className="text-sm font-semibold text-amber-400 mb-2">Verify OTP</h3>
                <p className="text-xs text-slate-300 mb-4">
                  We've sent a 6-digit verification code to your email. It expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').substring(0, 6))}
                    placeholder="Enter 6-digit OTP"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-200 tracking-[0.3em] font-mono focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleVerifyPasswordChange}
                    disabled={isVerifying || otp.length < 6 || countdown === 0}
                    className="px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {isVerifying ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
                
                <div className="mt-3 text-center">
                  <button 
                    onClick={() => { setOtpSent(false); setToastMessage(null); setOtp(''); }}
                    className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2"
                  >
                    Cancel and try again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
