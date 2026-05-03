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
  selectedTheater: 'long-beach',
  setSelectedTheater: (id) => set({ selectedTheater: id }),
  query: 'profile ships slowing near Long Beach',
  setQuery: (query) => set({ query }),
  selectedMmsi: 309253000,
  setSelectedMmsi: (selectedMmsi) => set({ selectedMmsi }),
}));
