import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthStore, Auth } from './types';

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      auth: null,
      role: null,
      isAuth: false,
      isAdmin: false,
      isManager: false,
      isTeacher: false,
      isStudent: false,

      login: async (username, password) => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Đăng nhập thất bại');
        }

        const data = await response.json();
        const auth: Auth = {
          ...data.user,
          token: data.token,
        };

        set({
          auth,
          role: auth.role,
          isAuth: true,
          isAdmin: auth.role === 'ADMIN',
          isManager: auth.role === 'MANAGER',
          isTeacher: auth.role === 'TEACHER',
          isStudent: auth.role === 'STUDENT',
        });
      },

      logout: () => {
        set({
          auth: null,
          role: null,
          isAuth: false,
          isAdmin: false,
          isManager: false,
          isTeacher: false,
          isStudent: false,
        });
      },

      setAuth: (auth) =>
        set({
          auth,
          role: auth?.role || null,
          isAuth: !!auth,
          isAdmin: auth?.role === 'ADMIN',
          isManager: auth?.role === 'MANAGER',
          isTeacher: auth?.role === 'TEACHER',
          isStudent: auth?.role === 'STUDENT',
        }),
    }),
    {
      name: 'auth-v4',
      partialize: (state) => ({ auth: state.auth }),
    }
  )
);
