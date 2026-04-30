import { Link } from 'react-router-dom';

export const NotFound = () => {
  return (
    <div className="min-h-screen bg-hicado-navy flex items-center justify-center p-6 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-96 h-96 bg-hicado-emerald/5 rounded-full -mr-48 -mt-48 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-hicado-emerald/5 rounded-full -ml-48 -mb-48 blur-3xl" />
      
      <div className="relative z-10 glass-card bg-white/5 border-white/10 p-16 rounded-[4rem] text-center space-y-8 max-w-xl shadow-2xl">
        <div className="text-8xl font-serif font-black text-white/10 tracking-tighter animate-pulse">404</div>
        <div className="space-y-2">
          <h1 className="text-4xl font-serif font-black text-white italic">Lạc lối trong <span className="text-hicado-emerald">Tri thức</span></h1>
          <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Trang bạn đang tìm kiếm không tồn tại hoặc đã được di dời.</p>
        </div>
        <div className="pt-8">
          <Link 
            to="/home" 
            className="btn-premium bg-hicado-emerald text-hicado-navy px-12 py-4 rounded-2xl inline-block"
          >
            Về Dashboard an toàn
          </Link>
        </div>
      </div>
    </div>
  );
};

