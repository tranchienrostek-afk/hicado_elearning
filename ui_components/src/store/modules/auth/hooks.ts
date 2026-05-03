import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthStore, Auth } from './types';

export const jwtExpired = (token: string): boolean => {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    return exp * 1000 < Date.now();
  } catch { return true; }
};

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
      accounts: [],

      login: async (username, password) => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
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

      fetchAccounts: async () => {
        const { auth } = useAuthStore.getState();
        if (!auth?.token) return;

        console.log('Fetching accounts...');
        const response = await fetch('/api/users', {
          headers: { 'Authorization': `Bearer ${auth.token}` },
        });
        if (response.ok) {
          const data = await response.json();
          console.log('Fetched accounts:', data.length);
          set({ accounts: data });
        } else {
          console.error('Failed to fetch accounts:', response.status);
        }
      },

      addAccount: async (account) => {
        const { auth } = useAuthStore.getState();
        console.log('Creating account:', account.username);
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth?.token}`
          },
          body: JSON.stringify(account),
        });

        if (response.ok) {
          const newUser = await response.json();
          console.log('Account created successfully:', newUser.username);
          set((state) => ({ accounts: [...state.accounts, newUser] }));
        } else {
          const error = await response.json();
          console.error('Account creation failed:', error.message);
          throw new Error(error.message || 'Lỗi khi tạo tài khoản');
        }
      },


      updateAccount: async (id, data) => {
        const { auth } = useAuthStore.getState();
        const response = await fetch(`/api/users/${id}`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth?.token}`
          },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          const updatedUser = await response.json();
          set((state) => ({
            accounts: state.accounts.map(a => a.id === id ? updatedUser : a)
          }));
        }
      },

      deleteAccount: async (id) => {
        const { auth } = useAuthStore.getState();
        const response = await fetch(`/api/users/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${auth?.token}` },
        });

        if (response.ok) {
          set((state) => ({
            accounts: state.accounts.filter(a => a.id !== id)
          }));
        }
      },

    }),
    {
      name: 'auth-v4',
      partialize: (state) => ({ auth: state.auth }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const token = state.auth?.token;
        if (token && !jwtExpired(token)) {
          state.isAuth = true;
          state.role = state.auth!.role;
          state.isAdmin   = state.auth!.role === 'ADMIN';
          state.isManager = state.auth!.role === 'MANAGER';
          state.isTeacher = state.auth!.role === 'TEACHER';
          state.isStudent = state.auth!.role === 'STUDENT';
        } else {
          state.auth = null;
          state.isAuth = false;
          state.role = null;
        }
      },
    }
  )
);
