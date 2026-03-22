export type UserRole = 'ADMIN' | 'MANAGER' | 'TEACHER' | 'STUDENT';

export interface Account {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  name: string;
  teacherId?: string;
  studentId?: string;
}

export interface Auth {
  id: string;
  username: string;
  name: string;
  token: string;
  role: UserRole;
  teacherId?: string;
  studentId?: string;
}

export interface AuthStore {
  auth: Auth | null;
  role: UserRole | null;
  setAuth: (auth: Auth | null) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuth: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isTeacher: boolean;
  isStudent: boolean;
}
