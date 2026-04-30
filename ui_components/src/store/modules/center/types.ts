export interface Room {
  id: string;
  name: string;
  center: 'Hicado' | 'Vạn Xuân';
  capacity: number;
  notes?: string;
}

export interface Teacher {
  id: string;
  name: string;
  specialization?: string;
  certificates?: string[];
  workplace?: string;
  dob?: string;
  gender?: 'Nam' | 'Nu' | 'Khac';
  cccd?: string;
  cccdDate?: string;
  cccdPlace?: string;
  phone: string;
  addressPermanent?: string;
  addressContact?: string;
  bankAccount: string;
  bankName: string;
  salaryRate: number;
  files?: string[];
  notes?: string;
}

export interface Student {
  id: string;
  name: string;
  birthYear: number;
  address: string;
  schoolName?: string;
  schoolClass?: string;
  cccd?: string;
  tuitionStatus: 'PAID' | 'PENDING' | 'DEBT';
}

export interface Class {
  id: string;
  name: string;
  teacherId: string;
  roomId?: string;
  tuitionPerSession: number;
  totalSessions: number;
  studentIds: string[];
  teacherShare?: number;
  schedule?: {
    days: string[];
    time: string;
  };
}

export interface Attendance {
  id: string;
  classId: string;
  studentId: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE_REQUEST';
  note?: string;
  markedByUserId?: string;
  markedByName?: string;
  markedByRole?: string;
  markedAt?: string;
}

export interface Transaction {
  id: string;
  studentId: string;
  amount: number;
  date: string;
  status: 'SUCCESS' | 'FAILED';
}

export interface CenterStore {
  teachers: Teacher[];
  students: Student[];
  classes: Class[];
  rooms: Room[];
  attendance: Attendance[];
  transactions: Transaction[];
  isLoading: boolean;

  
  initialize: () => Promise<void>;
  fetchTeachers: () => Promise<void>;
  fetchStudents: () => Promise<void>;
  fetchClasses: () => Promise<void>;
  fetchRooms: () => Promise<void>;
  fetchAttendance: (classId: string) => Promise<void>;
  
  addAttendance: (record: Partial<Attendance>) => Promise<void>;
  updateTuitionStatus: (studentId: string, status: Student['tuitionStatus']) => void;
  calculateTeacherSalary: (teacherId: string, month: number) => number;
  importStudents: (newStudents: Student[]) => void;
  importTeachers: (newTeachers: Teacher[]) => void;
  
  addStudent: (student: Partial<Student>) => Promise<void>;
  updateStudent: (id: string, updates: Partial<Student>) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
  
  addTeacher: (teacher: Partial<Teacher>) => Promise<void>;
  updateTeacher: (id: string, updates: Partial<Teacher>) => Promise<void>;
  deleteTeacher: (id: string) => Promise<void>;
  
  addClass: (cls: Partial<Class>) => Promise<void>;
  updateClass: (id: string, updates: Partial<Class>) => Promise<void>;
  deleteClass: (id: string) => Promise<void>;

  addRoom: (room: Partial<Room>) => Promise<void>;
  updateRoom: (id: string, updates: Partial<Room>) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
}
