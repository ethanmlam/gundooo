import { create } from 'zustand';

type AppState = {
  selectedTheater: string;
  setSelectedTheater: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
  selectedMmsi: number;
  setSelectedMmsi: (mmsi: number) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedTheater: 'strait-of-hormuz',
  setSelectedTheater: (id) => set({ selectedTheater: id }),
  query: 'profile ships slowing inside the Strait of Hormuz',
  setQuery: (query) => set({ query }),
  selectedMmsi: 309253000,
  setSelectedMmsi: (selectedMmsi) => set({ selectedMmsi }),
}));
