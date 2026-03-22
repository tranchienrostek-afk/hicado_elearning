import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PlantStore } from './types';

const POINTS_THRESHOLDS = {
  SEEDLING: 20,
  SMALL: 50,
  FULL_GROWN: 100
};

export const usePlantStore = create<PlantStore>()(
  persist(
    (set) => ({
      points: 0,
      plantSize: 0,
      addPoints: (amount: number) =>
        set((state) => {
          const newPoints = state.points + amount;
          let newSize = 0;
          if (newPoints >= POINTS_THRESHOLDS.FULL_GROWN) newSize = 3;
          else if (newPoints >= POINTS_THRESHOLDS.SMALL) newSize = 2;
          else if (newPoints >= POINTS_THRESHOLDS.SEEDLING) newSize = 1;
          
          return {
            points: newPoints,
            plantSize: newSize,
          };
        }),
      resetPlant: () => set({ points: 0, plantSize: 0 }),
    }),
    {
      name: 'learning-plant',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
