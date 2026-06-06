import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserProfile {
  email: string;
  name: string;
  picture?: string;
  instagram: string;
  youtube: string;
}

interface AuthState {
  user: UserProfile | null;
  setUser: (user: UserProfile) => void;
  updateProfile: (partial: Partial<Pick<UserProfile, 'instagram' | 'youtube' | 'name'>>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      updateProfile: (partial) =>
        set((s) => s.user ? { user: { ...s.user, ...partial } } : s),
      logout: () => set({ user: null }),
    }),
    { name: 'naad-auth' }
  )
);
