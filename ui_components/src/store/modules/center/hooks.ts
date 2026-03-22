import { create } from 'zustand';
import { CenterStore } from './types';
import { useAuthStore } from '../auth';

export const useCenterStore = create<CenterStore>()((set, get) => ({
  teachers: [],
  students: [],
  classes: [],
  rooms: [],
  attendance: [],
  transactions: [],

  initialize: async () => {
    const { fetchTeachers, fetchStudents, fetchClasses, fetchRooms } = get();
    await Promise.all([
      fetchTeachers(),
      fetchStudents(),
      fetchClasses(),
      fetchRooms(),
    ]);
  },

  fetchTeachers: async () => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/teachers', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) set({ teachers: await response.json() });
  },

  fetchStudents: async () => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/students', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) set({ students: await response.json() });
  },

  fetchClasses: async () => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/classes', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) set({ classes: await response.json() });
  },

  fetchRooms: async () => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/rooms', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) set({ rooms: await response.json() });
  },

  fetchAttendance: async (classId) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/attendance/${classId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const records = await response.json();
      set((state) => ({
        attendance: [
          ...state.attendance.filter(a => a.classId !== classId),
          ...records
        ]
      }));
    }
  },

  addAttendance: async (record) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/attendance/mark', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
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
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(student)
    });
    if (response.ok) await get().fetchStudents();
  },

  updateStudent: async (id, updates) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (response.ok) await get().fetchStudents();
  },

  deleteStudent: async (id) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/students/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) await get().fetchStudents();
  },

  addTeacher: async (teacher) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(teacher)
    });
    if (response.ok) await get().fetchTeachers();
  },

  updateTeacher: async (id, updates) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/teachers/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (response.ok) await get().fetchTeachers();
  },

  deleteTeacher: async (id) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/teachers/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) await get().fetchTeachers();
  },

  addClass: async (cls) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cls)
    });
    if (response.ok) await get().fetchClasses();
  },

  updateClass: async (id, updates) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/classes/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (response.ok) await get().fetchClasses();
  },

  deleteClass: async (id) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/classes/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) await get().fetchClasses();
  },

  addRoom: async (room) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(room)
    });
    if (response.ok) await get().fetchRooms();
  },
  
  updateRoom: async (id, updates) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/rooms/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (response.ok) await get().fetchRooms();
  },

  deleteRoom: async (id) => {
    const token = useAuthStore.getState().auth?.token;
    const response = await fetch(`/api/rooms/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) await get().fetchRooms();
  },
}));
