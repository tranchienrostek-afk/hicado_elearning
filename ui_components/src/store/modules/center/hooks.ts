import { create } from 'zustand';
import { CenterStore } from './types';
import { useAuthStore } from '../auth';

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

  fetchAttendance: async (classId) => {
    const res = await fetchWithAuth(`/api/attendance/${classId}`);
    if (res.ok) {
      const records = await res.json();
      set((state) => ({
        attendance: [
          ...state.attendance.filter(a => a.classId !== classId),
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
          (item) => item.classId === record.classId && item.studentId === record.studentId && item.date === record.date
        );
        if (existingIndex === -1) return { attendance: [...state.attendance, newRecord] };
        const next = [...state.attendance];
        next[existingIndex] = newRecord;
        return { attendance: next };
      });
    }
  },

  updateTuitionStatus: (studentId, status) => set((state) => ({
    students: state.students.map(s => s.id === studentId ? { ...s, tuitionStatus: status } : s)
  })),

  calculateTeacherSalary: (teacherId, _month) => {
    const state = get();
    const teacher = state.teachers.find(t => t.id === teacherId);
    if (!teacher) return 0;
    let totalSalary = 0;
    state.classes.filter(c => c.teacherId === teacherId).forEach(cls => {
      const classAttendance = state.attendance.filter(a => a.classId === cls.id && a.status === 'PRESENT');
      const sessionsCount = Array.from(new Set(classAttendance.map(a => a.date))).length;
      totalSalary += (cls.tuitionPerSession * sessionsCount * teacher.salaryRate);
    });
    return totalSalary;
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
  },

  updateStudent: async (id, updates) => {
    const res = await fetchWithAuth(`/api/students/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (res.ok) await get().fetchStudents();
  },

  deleteStudent: async (id) => {
    const res = await fetchWithAuth(`/api/students/${id}`, { method: 'DELETE' });
    if (res.ok) await get().fetchStudents();
  },

  addTeacher: async (teacher) => {
    const res = await fetchWithAuth('/api/teachers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teacher) });
    if (res.ok) await get().fetchTeachers();
  },

  updateTeacher: async (id, updates) => {
    const res = await fetchWithAuth(`/api/teachers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (res.ok) await get().fetchTeachers();
  },

  deleteTeacher: async (id) => {
    const res = await fetchWithAuth(`/api/teachers/${id}`, { method: 'DELETE' });
    if (res.ok) await get().fetchTeachers();
  },

  addClass: async (cls) => {
    const res = await fetchWithAuth('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cls) });
    if (res.ok) await get().fetchClasses();
  },

  updateClass: async (id, updates) => {
    const res = await fetchWithAuth(`/api/classes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (res.ok) await get().fetchClasses();
  },

  deleteClass: async (id) => {
    const res = await fetchWithAuth(`/api/classes/${id}`, { method: 'DELETE' });
    if (res.ok) await get().fetchClasses();
  },

  addRoom: async (room) => {
    const res = await fetchWithAuth('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(room) });
    if (res.ok) await get().fetchRooms();
  },

  updateRoom: async (id, updates) => {
    const res = await fetchWithAuth(`/api/rooms/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    if (res.ok) await get().fetchRooms();
  },

  deleteRoom: async (id) => {
    const res = await fetchWithAuth(`/api/rooms/${id}`, { method: 'DELETE' });
    if (res.ok) await get().fetchRooms();
  },
}));
