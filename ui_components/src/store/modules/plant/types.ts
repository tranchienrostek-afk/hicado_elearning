export interface PlantStore {
  points: number;
  plantSize: number; // 0, 1, 2, 3
  addPoints: (amount: number) => void;
  resetPlant: () => void;
}
