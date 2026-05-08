import { create } from 'zustand';
import { CenterStore } from './types';
import { useAuthStore } from '../auth';
import { attendanceDateKey } from '@/utils/attendance-date';
import { calculateTeacherSalaryByUnits } from '@/utils/center-operations';

const fetchWithAuth = (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = useAuthStore.getState().auth?.token;
  return fetch(url, {
    ...options,
    headers: { ...options.headers, 'Authorization': `Bearer ${token}` },
  });
};

export const useCenterStore = create<CenterStore>()((set, get) => ({
  teachers: [],
  students: [],
  classes: [],
  rooms: [],
  attendance: [],
  transactions: [],
  isLoading: false,


  initialize: async () => {
    const { role } = useAuthStore.getState().auth || {};
    const { fetchTeachers, fetchStudents, fetchClasses, fetchRooms } = get();

    set({ isLoading: true });
    try {
      if (role === 'ADMIN' || role === 'MANAGER' || role === 'TEACHER') {
        await Promise.all([fetchTeachers(), fetchStudents(), fetchClasses(), fetchRooms()]);
      } else if (role === 'STUDENT') {
        await Promise.all([fetchStudents(), fetchClasses(), fetchRooms()]);
      }
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTeachers: async () => {
    try {
      const res = await fetchWithAuth('/api/teachers');
      if (res.ok) set({ teachers: await res.json() });
    } catch (error) {
      console.error('Failed to fetch teachers:', error);
    }
  },

  fetchStudents: async () => {
    try {
      const res = await fetchWithAuth('/api/students');
      if (res.ok) set({ students: await res.json() });
    } catch (error) {
      console.error('Failed to fetch students:', error);
    }
  },

  fetchClasses: async () => {
    try {
      const res = await fetchWithAuth('/api/classes');
      if (res.ok) set({ classes: await res.json() });
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    }
  },

  fetchRooms: async () => {
    try {
      const res = await fetchWithAuth('/api/rooms');
      if (res.ok) set({ rooms: await res.json() });
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
    }
  },

  fetchAttendance: async (classId, date) => {
    const res = await fetchWithAuth(`/api/attendance/${classId}${date ? `?date=${date}` : ''}`);
    if (res.ok) {
      const records = await res.json();
      set((state) => ({
        attendance: [
          ...state.attendance.filter(a =>
            a.classId !== classId ||
            (date && attendanceDateKey(a.date) !== attendanceDateKey(date))
          ),
          ...records
        ]
      }));
    }
  },

  addAttendance: async (record) => {
    const response = await fetchWithAuth('/api/attendance/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (response.ok) {
      const newRecord = await response.json();
      set((state) => {
        const existingIndex = state.attendance.findIndex(
          (item) =>
            item.classId === record.classId &&
            item.studentId === record.studentId &&
            attendanceDateKey(item.date) === attendanceDateKey(record.date) &&
            (item.slot || 'MORNING') === (record.slot || 'MORNING')
        );
        if (existingIndex === -1) return { attendance: [...state.attendance, newRecord] };
        const next = [...state.attendance];
        next[existingIndex] = newRecord;
        return { attendance: next };
      });
    }
  },

  updateAttendance: async (id, updates) => {
    const response = await fetchWithAuth(`/api/attendance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (response.ok) {
      const updated = await response.json();
      set((state) => ({
        attendance: state.attendance.map((item) => (item.id === id ? updated : item)),
      }));
    }
  },

  deleteAttendance: async (id, reason) => {
    const response = await fetchWithAuth(`/api/attendance/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (response.ok) {
      set((state) => ({
        attendance: state.attendance.filter((item) => item.id !== id),
      }));
    }
  },

  updateTuitionStatus: (studentId, status) => set((state) => ({
    students: state.students.map(s => s.id === studentId ? { ...s, tuitionStatus: status } : s)
  })),

  calculateTeacherSalary: (teacherId, _month) => {
    const state = get();
    return calculateTeacherSalaryByUnits(teacherId, state.classes, state.attendance, state.teachers);
  },

  importStudents: (newStudents) => set((state) => ({
    students: [...state.students, ...newStudents.filter(ns => !state.students.some(s => s.id === ns.id))]
  })),

  importTeachers: (newTeachers) => set((state) => ({
    teachers: [...state.teachers, ...newTeachers.filter(nt => !state.teachers.some(t => t.id === nt.id))]
  })),

  addStudent: async (student) => {
    const res = await fetchWithAuth('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(student) });
    if (res.ok) await get().fetchStudents();
    return res;
  },

  updateStudent: async (id, updates) => {
    const res = await fetchWithAuth(`/api/students/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (res.ok) {
      set((state) => ({
        students: state.students.map((s) => (s.id === id ? { ...s, ...updates } : s))
      }));
      void get().fetchStudents();
    }
    return res;
  },

  deleteStudent: async (id) => {
    const res = await fetchWithAuth(`/api/students/${id}`, { method: 'DELETE' });
    if (res.ok) {
      set((state) => ({
        students: state.students.filter((s) => s.id !== id)
      }));
      void get().fetchStudents();
    }
    return res;
  },

  addTeacher: async (teacher) => {
    const res = await fetchWithAuth('/api/teachers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teacher) });
    if (res.ok) await get().fetchTeachers();
    return res;
  },

  updateTeacher: async (id, updates) => {
    const res = await fetchWithAuth(`/api/teachers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (res.ok) {
      set((state) => ({
        teachers: state.teachers.map((t) => (t.id === id ? { ...t, ...updates } : t))
      }));
      void get().fetchTeachers();
    }
    return res;
  },

  deleteTeacher: async (id) => {
    const res = await fetchWithAuth(`/api/teachers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      set((state) => ({
        teachers: state.teachers.filter((t) => t.id !== id)
      }));
      void get().fetchTeachers();
    }
    return res;
  },

  addClass: async (cls) => {
    const res = await fetchWithAuth('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cls) });
    if (res.ok) await get().fetchClasses();
    return res;
  },

  updateClass: async (id, updates) => {
    const res = await fetchWithAuth(`/api/classes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (res.ok) await get().fetchClasses();
    return res;
  },

  deleteClass: async (id) => {
    const res = await fetchWithAuth(`/api/classes/${id}`, { method: 'DELETE' });
    if (res.ok) await get().fetchClasses();
    return res;
  },

  addRoom: async (room) => {
    const res = await fetchWithAuth('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(room) });
    if (res.ok) await get().fetchRooms();
    return res;
  },

  updateRoom: async (id, updates) => {
    const res = await fetchWithAuth(`/api/rooms/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (res.ok) await get().fetchRooms();
    return res;
  },

  deleteRoom: async (id) => {
    const res = await fetchWithAuth(`/api/rooms/${id}`, { method: 'DELETE' });
    if (res.ok) await get().fetchRooms();
    return res;
  },
  
  reorderStudents: async (studentIds) => {
    const res = await fetchWithAuth('/api/students/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds })
    });
    if (!res.ok) throw new Error('Failed to reorder students');
    set((state) => {
      const sorted = [...state.students].sort((a, b) => studentIds.indexOf(a.id) - studentIds.indexOf(b.id));
      return { students: sorted };
    });
  },

  reorderTeachers: async (teacherIds) => {
    const res = await fetchWithAuth('/api/teachers/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherIds })
    });
    if (!res.ok) throw new Error('Failed to reorder teachers');
    set((state) => {
      const sorted = [...state.teachers].sort((a, b) => teacherIds.indexOf(a.id) - teacherIds.indexOf(b.id));
      return { teachers: sorted };
    });
  },
  
  reorderClasses: async (classIds) => {
    const res = await fetchWithAuth('/api/classes/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classIds })
    });
    if (!res.ok) throw new Error('Failed to reorder classes');
    set((state) => {
      const sorted = [...state.classes].sort((a, b) => classIds.indexOf(a.id) - classIds.indexOf(b.id));
      return { classes: sorted };
    });
  },
}));
