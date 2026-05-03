import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { initialLoginData, LoginPayload } from '@/api';
import { jwtExpired, useAuthStore } from '@/store';
import { toast } from '@/toast';

const loginSchema = z.object({
  username: z.string().min(3, { message: 'At least 3 characters' }),
  password: z.string().min(3, { message: 'At least 3 characters' }),
});

export const Login = () => {
  const navigate = useNavigate();
  const { auth, login } = useAuthStore();

  const routeForRole = (role?: string | null) =>
    role === 'STUDENT' ? '/student' : role === 'TEACHER' ? '/classes' : '/home';

  useEffect(() => {
    if (auth?.token && !jwtExpired(auth.token)) {
      navigate(routeForRole(auth.role), { replace: true });
    }
  }, [auth, navigate]);
  
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<LoginPayload>({
    mode: 'all',
    resolver: zodResolver(loginSchema),
    defaultValues: initialLoginData,
  });

  const onSubmitHandler: SubmitHandler<LoginPayload> = async (data) => {
    try {
      await login(data.username, data.password);
      toast.success('Đăng nhập thành công');
      const nextAuth = useAuthStore.getState().auth;
      navigate(routeForRole(nextAuth?.role), { replace: true });
    } catch (error: any) {
      toast.error(error.message || 'Sai tài khoản hoặc mật khẩu');
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* High-End Decorative Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-hicado-emerald/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px]"></div>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]"></div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-0 relative z-10 animate-in fade-in zoom-in duration-1000 shadow-[0_0_100px_rgba(0,0,0,0.5)] rounded-[4rem] overflow-hidden border border-white/5">
        
        {/* Left Side: Brand Narrative */}
        <div className="hidden lg:flex flex-col justify-center p-20 bg-gradient-to-br from-hicado-navy to-[#0f172a] relative overflow-hidden border-r border-white/5">
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <div className="absolute inset-0 bg-grid-white/[0.05] [mask-image:linear-gradient(to_bottom,white,transparent)]"></div>
          </div>
          
          <div className="relative z-10 space-y-10">
            <div className="w-20 h-20 bg-hicado-emerald text-hicado-navy rounded-[2rem] flex items-center justify-center text-4xl font-black shadow-[0_0_40px_rgba(16,185,129,0.3)]">
              H
            </div>
            <div className="space-y-4">
              <h1 className="text-5xl font-serif font-black text-white leading-tight tracking-tighter">
                Learning Ops <br/>
                <span className="text-hicado-emerald text-glow">Platform</span>
              </h1>
              <p className="text-lg text-white/60 font-medium leading-relaxed max-w-md">
                Nền tảng quản trị tập trung cho Kế toán, Quản lý, Giáo viên và Học sinh. Tối ưu hóa mọi điểm chạm trong giáo dục.
              </p>
            </div>
            
            <div className="flex gap-12 pt-8">
              <div>
                <p className="text-3xl font-black text-white tracking-tighter">94%</p>
                <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-widest mt-1">Retention</p>
              </div>
              <div>
                <p className="text-3xl font-black text-white tracking-tighter">24/7</p>
                <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-widest mt-1">Support</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="bg-white p-10 md:p-20 flex flex-col justify-center">
          <div className="mb-12">
            <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.5em] mb-4">Hicado Premium Access</p>
            <h2 className="text-4xl font-serif font-black text-hicado-navy tracking-tight">Chào mừng trở lại</h2>
            <p className="text-sm text-hicado-navy/40 font-bold mt-2">Vui lòng đăng nhập để truy cập hệ thống vận hành.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmitHandler)} className="space-y-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-hicado-navy/40 ml-1">
                Danh tính truy cập
              </label>
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Username / Email"
                  {...register('username')}
                  className="w-full px-8 py-5 bg-hicado-slate/20 border-2 border-transparent rounded-3xl text-sm font-bold text-hicado-navy placeholder:text-hicado-navy/20 outline-none focus:bg-white focus:border-hicado-emerald/30 focus:ring-4 focus:ring-hicado-emerald/5 transition-all"
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 transition-opacity">
                  ✨
                </div>
              </div>
              {errors.username && (
                <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-1 ml-1">
                  {errors.username?.message === 'At least 3 characters' ? 'Tối thiểu 3 ký tự' : errors.username?.message}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-hicado-navy/40 ml-1">
                Khóa bảo mật
              </label>
              <input
                type="password"
                placeholder="••••••••"
                {...register('password')}
                className="w-full px-8 py-5 bg-hicado-slate/20 border-2 border-transparent rounded-3xl text-sm font-bold text-hicado-navy placeholder:text-hicado-navy/20 outline-none focus:bg-white focus:border-hicado-emerald/30 focus:ring-4 focus:ring-hicado-emerald/5 transition-all"
              />
              {errors.password && (
                <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest mt-1 ml-1">
                  {errors.password?.message === 'At least 3 characters' ? 'Tối thiểu 3 ký tự' : errors.password?.message}
                </p>
              )}
            </div>

            <button
              disabled={!isValid}
              className="w-full bg-hicado-navy text-white py-6 rounded-3xl text-xs font-black uppercase tracking-[0.4em] hover:bg-hicado-emerald hover:text-hicado-navy hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-hicado-navy/20 disabled:opacity-30 disabled:pointer-events-none mt-4"
            >
              Khai mở hệ thống
            </button>
          </form>

          {/* Quick Demo Access */}
          <div className="mt-16 pt-10 border-t border-hicado-slate">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[9px] font-black text-hicado-navy/20 uppercase tracking-[0.3em]">Hệ thống truy cập mẫu</p>
              <span className="px-3 py-1 bg-hicado-emerald/10 text-hicado-emerald text-[8px] font-black rounded-full uppercase tracking-widest animate-pulse">Live Demo</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button 
                type="button"
                onClick={() => {
                  const values = { username: 'ketoan', password: '123' };
                  onSubmitHandler(values as any);
                }}
                className="bg-hicado-slate/10 p-5 rounded-2xl border border-hicado-slate/50 hover:border-hicado-emerald/30 hover:bg-white transition-all text-left group"
              >
                <p className="text-[9px] font-black text-hicado-navy/40 uppercase mb-1 group-hover:text-hicado-emerald">Kế toán</p>
                <p className="text-xs font-bold text-hicado-navy">ketoan / 123</p>
              </button>
              <button 
                type="button"
                onClick={() => {
                  const values = { username: 'gv1', password: '123' };
                  onSubmitHandler(values as any);
                }}
                className="bg-hicado-slate/10 p-5 rounded-2xl border border-hicado-slate/50 hover:border-hicado-emerald/30 hover:bg-white transition-all text-left group"
              >
                <p className="text-[9px] font-black text-hicado-navy/40 uppercase mb-1 group-hover:text-hicado-emerald">Giáo viên</p>
                <p className="text-xs font-bold text-hicado-navy">gv1 / 123</p>
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="absolute bottom-10 text-[10px] font-black text-white/20 uppercase tracking-[0.8em] animate-in fade-in duration-1000 delay-500">
        &copy; 2024 Hicado Education Platform <span className="mx-4">/</span> Premium Edition
      </p>
    </div>
  );
};

