import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { KeyRound, Mail, Loader2, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth';

export default function LoginForm() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore(state => state.setAuth);

  // Forgot Password States
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1); // 1: Email, 2: OTP & New Password
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.api.auth.login.$post({
        json: { loginId, password }
      });
      if (!res.ok) {
        const errData = await res.json() as any;
        throw new Error(errData.error || 'Login failed');
      }
      return await res.json();
    },
    onSuccess: (data) => {
      setAuth(data.user, data.token);
      if (data.user.role === 'superadmin') {
        navigate('/superadmin');
      } else {
        navigate('/dashboard');
      }
    },
    onError: (error: Error) => {
      showToast('error', error.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setIsSendingOtp(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/forgot-password-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'OTP sent to your email!');
        setResetStep(2);
      } else {
        showToast('error', data.error || 'Failed to send OTP');
      }
    } catch (error) {
      showToast('error', 'Network error. Could not request OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetOtp || newPassword.length < 6) {
      showToast('error', 'Please enter OTP and a password (min 6 chars)');
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/forgot-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp: resetOtp, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Password reset successfully! Please log in.');
        setIsForgotPassword(false);
        setResetStep(1);
        setResetEmail('');
        setResetOtp('');
        setNewPassword('');
        setPassword('');
      } else {
        showToast('error', data.error || 'Invalid OTP or failed to reset');
      }
    } catch (error) {
      showToast('error', 'Network error during reset.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      
      {toastMessage && (
        <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] p-5 rounded-2xl shadow-2xl flex items-center justify-center gap-4 border max-w-lg min-w-[320px] animate-in fade-in zoom-in-95 duration-200 ${toastMessage.type === 'success' ? 'bg-emerald-900/95 border-emerald-500/50 text-emerald-100' : 'bg-red-900/95 border-red-500/50 text-red-100'}`}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertCircle size={24} className="text-red-400" />}
          <span className="text-base font-semibold text-center">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="absolute right-3 top-3 text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-6 transition-transform hover:rotate-0">
            <KeyRound className="h-8 w-8 text-white transform rotate-6 transition-transform hover:-rotate-6" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          {isForgotPassword ? 'Reset Password' : 'IDP Dashboard'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {isForgotPassword ? 'Enter your details below to reset' : 'Sign in to your account'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100 overflow-hidden relative">
          
          {/* FORGOT PASSWORD FORM */}
          {isForgotPassword ? (
            <div className="animate-in slide-in-from-right-4 fade-in duration-300">
              {resetStep === 1 ? (
                <form className="space-y-6" onSubmit={handleRequestOtp}>
                  <div>
                    <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700">
                      Registered Email Address
                    </label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="resetEmail"
                        type="email"
                        required
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="you@example.com"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <button
                      type="submit"
                      disabled={isSendingOtp}
                      className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                    >
                      {isSendingOtp ? <Loader2 className="animate-spin h-5 w-5" /> : 'Send OTP'}
                    </button>
                  </div>
                </form>
              ) : (
                <form className="space-y-6" onSubmit={handleResetPassword}>
                  <div>
                    <label htmlFor="resetOtp" className="block text-sm font-medium text-gray-700">
                      Enter 6-Digit OTP
                    </label>
                    <input
                      id="resetOtp"
                      type="text"
                      required
                      maxLength={6}
                      className="mt-1 block w-full px-3 py-3 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-center tracking-widest font-bold"
                      placeholder="------"
                      value={resetOtp}
                      onChange={(e) => setResetOtp(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                      New Password
                    </label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <KeyRound className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="newPassword"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <button
                      type="submit"
                      disabled={isResetting}
                      className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                    >
                      {isResetting ? <Loader2 className="animate-spin h-5 w-5" /> : 'Reset Password'}
                    </button>
                  </div>
                </form>
              )}
              
              <div className="mt-6 text-center">
                <button 
                  onClick={() => { setIsForgotPassword(false); setResetStep(1); }} 
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to Login
                </button>
              </div>
            </div>
          ) : (
            /* REGULAR LOGIN FORM */
            <div className="animate-in slide-in-from-left-4 fade-in duration-300">
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="loginId" className="block text-sm font-medium text-gray-700">
                    Email or Mobile Number
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="loginId"
                      type="text"
                      required
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder="admin@example.com"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <button 
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loginMutation.isPending}
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loginMutation.isPending ? (
                      <Loader2 className="animate-spin h-5 w-5" />
                    ) : (
                      'Sign in'
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6 text-center text-sm text-gray-600">
                Don't have an account?{' '}
                <button 
                  onClick={() => navigate('/landing')} 
                  className="font-medium text-blue-600 hover:text-blue-500 hover:underline transition-colors"
                >
                  View Plans & Sign Up
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
