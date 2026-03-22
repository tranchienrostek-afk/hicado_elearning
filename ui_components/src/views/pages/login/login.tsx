import { useNavigate } from 'react-router-dom';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { initialLoginData, LoginPayload } from '@/api';
import { useAuthStore } from '@/store';
import { toast } from '@/toast';

const loginSchema = z.object({
  username: z.string().min(3, { message: 'At least 3 characters' }),
  password: z.string().min(3, { message: 'At least 3 characters' }),
});

export const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  
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
      toast.success('Dang nhap thanh cong');
      navigate('/home');
    } catch (error: any) {
      toast.error(error.message || 'Sai tai khoan hoac mat khau');
    }
  };

  return (
    <div className="min-h-screen bg-bg100 text-text100 font-sans antialiased">
      <div className="max-w-6xl mx-auto px-6 py-10 md:px-10 md:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 items-start">
          <section className="bg-bg000 border border-borderline rounded-xl p-8 md:p-10">
            <p className="text-sm text-text400 mb-2">Academic Management</p>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-text100 mb-4 tracking-tight">
              Learning Ops Platform
            </h1>
            <p className="text-base text-text300 leading-relaxed max-w-xl">
              Nen tang quan tri tap trung cho Ke toan, Quan ly, Giao vien va Hoc sinh.
              Giao dien duoc thiet ke theo phong cach toi gian de toi uu kha nang quan sat va thao tac.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
              {[
                { label: 'Lop hoc', value: '32' },
                { label: 'Hoc vien', value: '512' },
                { label: 'Diem danh', value: '94%' },
              ].map((stat) => (
                <div key={stat.label} className="bg-bg100 border border-borderline rounded-lg p-4">
                  <p className="text-[11px] font-medium text-text400 mb-1 uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <p className="text-xl font-semibold text-text100">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-bg000 border border-borderline rounded-xl p-8 md:p-10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-[11px] font-semibold text-text400 uppercase tracking-wider mb-1">
                  Dang nhap he thong
                </p>
                <h2 className="text-2xl font-serif font-semibold text-text100">Welcome back</h2>
              </div>
              <div className="w-8 h-8 bg-accent rounded flex items-center justify-center text-white font-serif font-bold text-sm">
                H
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmitHandler)} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text400">
                  Ten dang nhap
                </label>
                <input
                  type="text"
                  placeholder="vd: ketoan / thaychien"
                  {...register('username')}
                  className="w-full px-4 py-3 bg-bg100 border border-borderline rounded-lg text-sm font-medium text-text100 placeholder:text-text400/70 outline-none focus:border-accent"
                />
                {errors.username && (
                  <p className="text-[11px] text-error font-semibold">
                    {errors.username?.message === 'At least 3 characters'
                      ? 'Toi thieu 3 ky tu'
                      : errors.username?.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text400">
                  Mat khau
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  {...register('password')}
                  className="w-full px-4 py-3 bg-bg100 border border-borderline rounded-lg text-sm font-medium text-text100 placeholder:text-text400/70 outline-none focus:border-accent"
                />
                {errors.password && (
                  <p className="text-[11px] text-error font-semibold">
                    {errors.password?.message === 'At least 3 characters'
                      ? 'Toi thieu 3 ky tu'
                      : errors.password?.message}
                  </p>
                )}
              </div>

              <button
                disabled={!isValid}
                className="w-full bg-text100 text-white py-3.5 rounded-lg text-[12px] font-semibold uppercase tracking-wider hover:bg-text300 transition-colors disabled:opacity-50"
              >
                Dang nhap
              </button>
            </form>

            <div className="mt-6 bg-bg100 border border-borderline rounded-lg p-4 text-[12px] text-text400 space-y-1">
              <p className="font-semibold text-text300 uppercase tracking-wider mb-2">Tai khoan mau:</p>
              <p>
                <span className="font-semibold text-text100">ketoan</span> / ketoan123
              </p>
              <p>
                <span className="font-semibold text-text100">thaychien</span> / thaychien123
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
