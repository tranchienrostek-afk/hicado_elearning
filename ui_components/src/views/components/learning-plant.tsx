import React from 'react';
import { usePlantStore } from '@/store/modules/plant';

const PLANT_IMAGES = [
  '/assets/images/plant_1.png',
  '/assets/images/plant_2.png',
  '/assets/images/plant_3.png',
  '/assets/images/plant_4.png'
];


export const LearningPlant: React.FC = () => {
  const { points, plantSize, addPoints, resetPlant } = usePlantStore();
  
  const progress = Math.min(Math.round((points / 100) * 100), 100);
  
  return (
    <div className="flex flex-col items-center justify-center p-10 glass-card rounded-[3rem] space-y-8 h-full relative overflow-hidden group transition-all duration-700 hover:shadow-2xl">
      {/* Dynamic Glow Background */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-hicado-emerald/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-hicado-emerald/20 transition-all"></div>
      
      <div className="text-center relative z-10">
        <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-2">Success Ecosystem</p>
        <h2 className="text-2xl font-serif font-black text-hicado-navy tracking-tight">Hệ sinh thái <span className="italic text-hicado-emerald">Hicado</span></h2>
      </div>
      
      <div className="relative w-56 h-56 flex items-center justify-center bg-hicado-slate/30 rounded-[3rem] border border-white/40 overflow-hidden shadow-inner group">
        <div className="absolute inset-0 bg-gradient-to-t from-hicado-emerald/10 to-transparent"></div>
        <img 
          src={PLANT_IMAGES[plantSize]} 
          alt="Cây Học Tập" 
          className="w-48 h-48 object-contain drop-shadow-[0_20px_40px_rgba(16,185,129,0.3)] transition-all duration-1000 transform group-hover:scale-110 group-hover:rotate-2"
        />
        
        {/* Animated Particles */}
        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-1000">
          <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-hicado-emerald rounded-full animate-ping"></div>
          <div className="absolute bottom-1/4 right-1/4 w-1.5 h-1.5 bg-hicado-emerald/50 rounded-full animate-pulse delay-700"></div>
        </div>
      </div>
      
      <div className="w-full space-y-3 relative z-10">
        <div className="flex justify-between text-[10px] text-hicado-navy/40 font-black uppercase tracking-widest">
          <span>Tiến trình tăng trưởng</span>
          <span className="text-hicado-emerald">{progress}%</span>
        </div>
        <div className="w-full h-2 bg-hicado-slate/50 rounded-full overflow-hidden border border-white/20">
          <div 
            className="h-full growth-gradient shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all duration-1000 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3 w-full relative z-10">
        {[
          { label: 'Nước', icon: '💧', pts: 5, color: 'hover:bg-blue-500/10 hover:text-blue-600 border-blue-500/20' },
          { label: 'Nắng', icon: '☀️', pts: 10, color: 'hover:bg-amber-500/10 hover:text-amber-600 border-amber-500/20' },
          { label: 'Tâm', icon: '❤️', pts: 15, color: 'hover:bg-rose-500/10 hover:text-rose-600 border-rose-500/20' },
        ].map((btn) => (
          <button 
            key={btn.label}
            onClick={() => addPoints(btn.pts)}
            className={`flex flex-col items-center justify-center p-3 rounded-2xl bg-white/40 border border-transparent transition-all active:scale-95 ${btn.color}`}
          >
            <span className="text-xl mb-1">{btn.icon}</span>
            <span className="text-[9px] font-black uppercase tracking-tighter">+{btn.pts}</span>
          </button>
        ))}
      </div>
      
      <button 
        onClick={resetPlant}
        className="text-[9px] text-hicado-navy/20 hover:text-rose-500 transition-colors uppercase tracking-[0.3em] font-black relative z-10 pt-4"
      >
        Làm mới khu vườn
      </button>
    </div>
  );
};

