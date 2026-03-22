import React from 'react';
import { usePlantStore } from '@/store/modules/plant';
import { Button } from './button';

const PLANT_IMAGES = [
  'https://puu.sh/x2rh3/f308911852.png',
  'https://puu.sh/x2rhG/77af08dcab.png',
  'https://puu.sh/x2rhr/ef34e78bcc.png',
  'https://puu.sh/x2rgF/9ad6271fd1.png'
];

export const LearningPlant: React.FC = () => {
  const { points, plantSize, addPoints, resetPlant } = usePlantStore();
  
  const progress = Math.min(Math.round((points / 100) * 100), 100);
  
  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl space-y-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-white mb-2">Cây Học Tập Của Tôi</h2>
      
      <div className="relative w-48 h-48 flex items-center justify-center bg-white/5 rounded-full border border-white/10 overflow-hidden shadow-inner">
        <img 
          src={PLANT_IMAGES[plantSize]} 
          alt="Cây Học Tập" 
          className="w-40 h-40 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-500 transform hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-green-500/20 to-transparent pointer-events-none"></div>
      </div>
      
      <div className="w-full space-y-2">
        <div className="flex justify-between text-sm text-white/80 font-medium">
          <span>Tiến trình tổng quan</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-3 bg-black/20 rounded-full overflow-hidden border border-white/10">
          <div 
            className="h-full bg-gradient-to-r from-green-400 to-emerald-600 shadow-[0_0_10px_rgba(52,211,153,0.5)] transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => addPoints(5)} className="bg-blue-500/20 hover:bg-blue-500/40 border-blue-500/30">
          💧 Tưới nước (+5)
        </Button>
        <Button onClick={() => addPoints(10)} className="bg-yellow-500/20 hover:bg-yellow-500/40 border-yellow-500/30">
          ☀️ Ánh sáng (+10)
        </Button>
        <Button onClick={() => addPoints(15)} className="bg-rose-500/20 hover:bg-rose-500/40 border-rose-500/30">
          ❤️ Yêu thương (+15)
        </Button>
      </div>
      
      <button 
        onClick={resetPlant}
        className="text-xs text-white/40 hover:text-white/80 transition-colors uppercase tracking-widest font-bold"
      >
        Làm mới khu vườn
      </button>
    </div>
  );
};
