import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CakeSlice, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate   = useNavigate();

  const [form, setForm]     = useState({
    bakeryName: '', ownerName: '', phone: '', email: '',
    password: '', city: '', state: 'Uttarakhand',
  });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.bakeryName || !form.ownerName || !form.phone || !form.password) {
      return toast.error('Please fill all required fields');
    }
    if (form.phone.length !== 10) return toast.error('Enter valid 10-digit phone');
    if (form.password.length < 6) return toast.error('Password min 6 characters');

    setLoading(true);
    try {
      await signup(form);
      toast.success('Bakery account created! 🎉');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const STATES = ['Andhra Pradesh','Assam','Bihar','Delhi','Gujarat','Haryana','Karnataka',
    'Kerala','Madhya Pradesh','Maharashtra','Punjab','Rajasthan','Tamil Nadu',
    'Telangana','Uttar Pradesh','Uttarakhand','West Bengal'];

  return (
    <div className="min-h-screen bg-warm-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-200">
            <CakeSlice size={28} className="text-white" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-gray-900">Create your bakery</h1>
          <p className="text-gray-500 text-sm mt-1">Start your free account today</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">Bakery Name *</label>
              <input value={form.bakeryName} onChange={e => set('bakeryName', e.target.value)}
                className="input-field" placeholder="e.g. Sweet Crumbs Bakery" />
            </div>
            <div>
              <label className="label">Owner Name *</label>
              <input value={form.ownerName} onChange={e => set('ownerName', e.target.value)}
                className="input-field" placeholder="Your full name" />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input type="tel" value={form.phone}
                onChange={e => set('phone', e.target.value.replace(/\D/g,'').slice(0,10))}
                className="input-field" placeholder="10-digit mobile" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="input-field" placeholder="optional" />
            </div>
            <div>
              <label className="label">Password *</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                className="input-field" placeholder="Min 6 characters" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">City</label>
                <input value={form.city} onChange={e => set('city', e.target.value)}
                  className="input-field" placeholder="Roorkee" />
              </div>
              <div>
                <label className="label">State</label>
                <select value={form.state} onChange={e => set('state', e.target.value)} className="input-field">
                  {STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2 flex items-center justify-center gap-2">
              {loading && <Loader2 size={15} className="animate-spin" />}
              Create Account
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-orange-500 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
