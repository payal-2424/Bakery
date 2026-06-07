import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CakeSlice, Phone, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services';

export default function LoginPage() {
  const { login, loginWithOTP } = useAuth();
  const navigate = useNavigate();

  const [tab,      setTab]      = useState('password'); // 'password' | 'otp'
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [otp,      setOtp]      = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [otpSent,  setOtpSent]  = useState(false);
  const [loading,  setLoading]  = useState(false);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!phone || !password) return toast.error('Enter phone and password');
    setLoading(true);
    try {
      await login(phone, password);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!phone) return toast.error('Enter phone number');
    setLoading(true);
    try {
      await authService.sendOTP(phone);
      setOtpSent(true);
      toast.success('OTP sent to your phone');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPLogin = async (e) => {
    e.preventDefault();
    if (!otp) return toast.error('Enter OTP');
    setLoading(true);
    try {
      await loginWithOTP(phone, otp);
      toast.success('Welcome!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-200">
            <CakeSlice size={32} className="text-white" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-gray-900">Sweet Crumbs</h1>
          <p className="text-gray-500 text-sm mt-1">Bakery Management Platform</p>
        </div>

        <div className="card">
          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            {[['password','Password'], ['otp','OTP Login']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Phone field (both tabs) */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g,'').slice(0,10))}
                className="input-field pl-9"
                placeholder="98765 43210"
              />
            </div>
          </div>

          {tab === 'password' ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-field pl-9 pr-10"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                {loading && <Loader2 size={15} className="animate-spin" />}
                Sign In
              </button>
            </form>
          ) : (
            <form onSubmit={handleOTPLogin} className="space-y-4">
              {!otpSent ? (
                <button type="button" onClick={handleSendOTP} disabled={loading}
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                  {loading && <Loader2 size={15} className="animate-spin" />}
                  Send OTP
                </button>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Enter OTP</label>
                    <input
                      type="text"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                      className="input-field tracking-widest text-center text-xl font-bold"
                      placeholder="• • • • • •"
                      maxLength={6}
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
                    {loading && <Loader2 size={15} className="animate-spin" />}
                    Verify & Login
                  </button>
                  <button type="button" onClick={() => setOtpSent(false)}
                    className="w-full text-center text-sm text-orange-500 hover:underline">
                    Resend OTP
                  </button>
                </>
              )}
            </form>
          )}

          <p className="text-center text-sm text-gray-500 mt-4">
            New bakery?{' '}
            <Link to="/signup" className="text-orange-500 font-medium hover:underline">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
