import { create } from "zustand";
import { persist } from "zustand/middleware";

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (userData) => set({ user: userData, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
      updateUser: (updates) =>
        set((state) => ({ user: { ...state.user, ...updates } })),
    }),
    {
      name: "flywallets-auth", // unique name
      // We persist mainly user info for UI. Auth state is truly determined by cookie validity.
    }
  )
);

export default useAuthStore;
