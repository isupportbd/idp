import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [hasSuperAdmin, setHasSuperAdmin] = useState(true);
  const [isSuperAdminSignup, setIsSuperAdminSignup] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Form Data
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [trxId, setTrxId] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const fetchStatusAndPlans = async () => {
      setIsLoadingPlans(true);
      try {
        const statusRes = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/system-status`);
        const statusData = await statusRes.json();
        if (statusData.success) {
          setHasSuperAdmin(statusData.hasSuperAdmin);
        }

        const calculateDiscount = (monthly: number, yearly: number) => {
          if (!monthly || !yearly) return 0;
          return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
        };

        if (statusData.hasSuperAdmin || true) { // Always try to fetch plans to show something
          const plansRes = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/plans`);
          const plansData = await plansRes.json();
          if (plansData.success && plansData.data.length > 0) {
            setPlans(plansData.data.map((p: any) => ({
              ...p,
              yearlyDiscountPercent: calculateDiscount(p.rateMonthly, p.rateYearly)
            })));
          } else {
            setPlans([]);
          }
        }
      } catch (error) {
        console.error('Error loading landing data', error);
      } finally {
        setIsLoadingPlans(false);
      }
    };
    
    fetchStatusAndPlans();
  }, []);



  const openSignup = (plan: any) => {
    setIsSuperAdminSignup(false);
    setSelectedPlan(plan);
    setShowSignupModal(true);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match!");
      return;
    }
    
    if (!name || !email || !mobile || !password) {
      setErrorMsg("Please fill out all required fields.");
      return;
    }
    
    const isSuperAdminMode = !hasSuperAdmin || isSuperAdminSignup;

    if (!isSuperAdminMode && !trxId) {
      setErrorMsg("Please enter bKash TrxID.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const finalTrxId = isSuperAdminMode 
        ? '' 
        : `${trxId} (${billingCycle})`;
        
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, mobile, password,
          planId: selectedPlan?.id,
          trxId: finalTrxId
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setSuccessMsg(data.role === 'superadmin' 
          ? 'Registration successful! You are the Super Admin. You can log in now.'
          : 'Registration successful! Please wait for the Super Admin to approve your account. It may take some time.'
        );
        
        // Reset form
        setName(''); setEmail(''); setMobile(''); setPassword(''); setConfirmPassword(''); setTrxId('');
        
        setTimeout(() => {
          setShowSignupModal(false);
          navigate('/login');
        }, 3000);
      } else {
        setErrorMsg('Registration failed: ' + data.error);
      }
    } catch (error: any) {
      setErrorMsg('Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 animate-gradient-bg pb-16 text-white relative">
      <header className="bg-slate-900/50 backdrop-blur-md border-b border-white/10 py-4 px-8 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center">
          <div className="text-3xl font-extrabold tracking-widest bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent uppercase">
            IDP
          </div>
        </div>
        <nav className="flex items-center gap-4">
          <button 
            onClick={() => {
              document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-6 py-2 border border-white/20 rounded-lg hover:bg-white/10 transition-colors font-medium text-white hidden md:block"
          >
            Sign Up
          </button>
          <Link to="/login" className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors font-medium text-white shadow-lg shadow-blue-500/20">
            Login
          </Link>
        </nav>
      </header>

      <main className="text-center px-4 pt-16">
        <h1 className="text-5xl md:text-6xl font-extrabold mb-12 text-white drop-shadow-lg">
          Importer Data Processor
        </h1>

        {!hasSuperAdmin ? (
          <div className="bg-slate-800/70 backdrop-blur-xl border border-white/10 rounded-3xl max-w-2xl mx-auto p-10 shadow-2xl relative text-left">
            <h2 className="text-3xl font-bold mb-2 text-center">Super Admin Setup</h2>
            <div className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 rounded mb-6 text-sm text-emerald-100 text-center">
              Welcome! Create the first account to take full control of the system. No payment required.
            </div>

            {errorMsg && <div className="bg-red-500/10 text-red-400 p-4 rounded-lg mb-6 font-medium border border-red-500/20">{errorMsg}</div>}
            {successMsg && <div className="bg-emerald-500/10 text-emerald-400 p-4 rounded-lg mb-6 font-medium border border-emerald-500/20 text-center">{successMsg}</div>}

            {!successMsg && (
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Full Name</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" 
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Mobile Number</label>
                    <input type="text" required value={mobile} onChange={e => setMobile(e.target.value)} placeholder="01XXXXXXXXX" 
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Email Address</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" 
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Password</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" 
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-200">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Confirm Password</label>
                    <div className="relative">
                      <input type={showConfirmPassword ? 'text' : 'password'} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" 
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-200">
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  onClick={() => setIsSuperAdminSignup(true)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors mt-6 shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating Account...' : 'Initialize Super Admin'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="max-w-6xl mx-auto" id="pricing-section">
            <h2 className="text-4xl font-bold mb-10">Choose Your Plan to Sign Up</h2>
            
            <div className="flex justify-center mb-12">
              <div className="bg-slate-800/80 border border-white/10 rounded-full p-1.5 flex items-center shadow-inner">
                <button 
                  className={`px-6 py-2.5 rounded-full font-semibold transition-all ${billingCycle === 'monthly' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'}`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Monthly
                </button>
                <button 
                  className={`px-6 py-2.5 rounded-full font-semibold transition-all ${billingCycle === 'yearly' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-400 hover:text-white'}`}
                  onClick={() => setBillingCycle('yearly')}
                >
                  Yearly
                </button>
              </div>
            </div>
            
            {isLoadingPlans ? (
              <div className="text-xl text-blue-400 animate-pulse mt-20">Loading plans...</div>
            ) : plans.length === 0 ? (
              <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-10 max-w-2xl mx-auto mt-10">
                <h3 className="text-2xl font-semibold mb-4 text-slate-300">No Plans Available</h3>
                <p className="text-slate-400 text-lg">The Super Admin has not created any pricing plans yet. Please check back later.</p>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-8 px-4">
                {plans.map((plan) => (
                  <div key={plan.id} className="w-full md:w-[340px] bg-slate-800/70 backdrop-blur-lg border border-white/10 rounded-3xl p-10 flex flex-col hover:-translate-y-2 hover:border-indigo-500/30 transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-indigo-500/10">
                    <h3 className="text-2xl font-bold mb-4">{plan.name}</h3>
                    <div className="mb-2">
                      <span className="text-2xl font-semibold align-top">৳</span>
                      <span className="text-5xl font-extrabold">{billingCycle === 'monthly' ? plan.rateMonthly : plan.rateYearly}</span>
                      <span className="text-slate-400 font-medium">/{billingCycle === 'monthly' ? 'month' : 'year'}</span>
                    </div>
                    
                    <div className={`text-sm font-medium text-emerald-400 mb-8 transition-opacity duration-300 ${billingCycle === 'yearly' ? 'opacity-100' : 'opacity-0'}`}>
                      Billed annually (Save {plan.yearlyDiscountPercent}%)
                    </div>
                    
                    <ul className="text-left space-y-4 mb-10 flex-1">
                      <li className="flex items-center gap-3 text-slate-200">
                        <CheckCircle2 className="text-emerald-400 w-5 h-5 flex-shrink-0" /> 
                        <span>Up to <strong>{plan.maxUsers}</strong> Users</span>
                      </li>
                      <li className="flex items-center gap-3 text-slate-200">
                        <CheckCircle2 className="text-emerald-400 w-5 h-5 flex-shrink-0" /> 
                        <span>Unlimited Data Uploads</span>
                      </li>
                      <li className="flex items-center gap-3 text-slate-200">
                        <CheckCircle2 className="text-emerald-400 w-5 h-5 flex-shrink-0" /> 
                        <span>Custom VAT Reports</span>
                      </li>
                      <li className="flex items-center gap-3 text-slate-200">
                        <CheckCircle2 className="text-emerald-400 w-5 h-5 flex-shrink-0" /> 
                        <span>Excel Export</span>
                      </li>
                    </ul>
                    
                    <button 
                      onClick={() => openSignup(plan)}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2"
                    >
                      Sign Up Now
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Signup Modal */}
      {showSignupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl w-full max-w-lg p-8 relative max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setShowSignupModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <h2 className="text-3xl font-bold mb-6">
              {isSuperAdminSignup ? 'Super Admin Setup' : `Sign Up for ${selectedPlan?.name}`}
            </h2>

            {isSuperAdminSignup && (
              <div className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 rounded mb-6 text-sm text-emerald-100">
                Welcome! Create the first account to take full control of the system. No payment required.
              </div>
            )}

            {errorMsg && <div className="bg-red-500/10 text-red-400 p-4 rounded-lg mb-6 font-medium border border-red-500/20">{errorMsg}</div>}
            {successMsg && <div className="bg-emerald-500/10 text-emerald-400 p-4 rounded-lg mb-6 font-medium border border-emerald-500/20">{successMsg}</div>}

            {!successMsg && (
              <form onSubmit={handleSignup} className="space-y-5 text-left">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Full Name</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" 
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Mobile Number</label>
                    <input type="text" required value={mobile} onChange={e => setMobile(e.target.value)} placeholder="01XXXXXXXXX" 
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Email Address</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" 
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Password</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" 
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-200">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">Confirm Password</label>
                    <div className="relative">
                      <input type={showConfirmPassword ? 'text' : 'password'} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" 
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-200">
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {!isSuperAdminSignup && (
                  <div>
                    <div className="flex justify-between items-end mb-1.5">
                      <label className="block text-sm text-slate-400">bKash TrxID</label>
                      <span className="text-[#e2136e] font-semibold text-sm bg-[#e2136e]/10 px-2 py-0.5 rounded">bKash: 01719950891</span>
                    </div>
                    <input type="text" required value={trxId} onChange={e => setTrxId(e.target.value)} placeholder="e.g. 8N3A5B2C" 
                      className="w-full bg-slate-900/50 border-2 border-[#e2136e]/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#e2136e] focus:ring-1 focus:ring-[#e2136e] transition-all" />
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Complete Sign Up'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
