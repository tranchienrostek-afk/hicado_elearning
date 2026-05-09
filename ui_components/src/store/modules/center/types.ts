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
  salaryType?: 'PERCENT' | 'HOURLY';
  hourlyRate?: number;
  files?: string[];
  notes?: string;
  sortOrder?: number;
}

export interface Student {
  id: string;
  name: string;
  birthYear: number;
  address: string;
  schoolName?: string;
  schoolClass?: string;
  cccd?: string;
  studentCode?: string;
  zaloUserId?: string;
  parentPhone?: string;
  studentPhone?: string;
  tuitionStatus: 'PAID' | 'PENDING' | 'DEBT';
  notes?: string;
  isActive?: boolean;
  sortOrder?: number;
}



export interface Class {
  id: string;
  name: string;
  classCode?: string;
  teacherId: string;
  roomId?: string;
  tuitionPerSession: number;
  totalSessions: number;
  studentIds: string[];
  students?: ClassStudent[];
  teacherShare?: number;

  schedule?: {
    days: string[];
    time: string;
  };
  scheduleTime2?: string;
  roomId2?: string;
  sortOrder?: number;
}

export interface Attendance {
  id: string;
  classId: string;
  studentId: string;
  date: string;
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';
  sessionUnits: number;
  status: 'PRESENT' | 'ABSENT' | 'LEAVE_REQUEST';
  note?: string;
  markedByUserId?: string;
  markedByName?: string;
  markedByRole?: string;
  markedAt?: string;
}

export interface ClassStudent {
  classId: string;
  studentId: string;
  customTuitionPerSession?: number | null;
  discountFrom?: string | null;
  discountTo?: string | null;
  discountReason?: string | null;
  student: Student;
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
  fetchAttendance: (classId: string, date?: string) => Promise<void>;
  
  addAttendance: (record: Partial<Attendance>) => Promise<void>;
  updateAttendance: (id: string, updates: Partial<Attendance> & { reason?: string }) => Promise<void>;
  deleteAttendance: (id: string, reason?: string) => Promise<void>;
  updateTuitionStatus: (studentId: string, status: Student['tuitionStatus']) => void;
  calculateTeacherSalary: (teacherId: string, month: number) => number;
  importStudents: (newStudents: Student[]) => void;
  importTeachers: (newTeachers: Teacher[]) => void;
  
  addStudent: (student: Partial<Student>) => Promise<Response>;
  updateStudent: (id: string, updates: Partial<Student>) => Promise<Response>;
  deleteStudent: (id: string) => Promise<Response>;
  
  addTeacher: (teacher: Partial<Teacher>) => Promise<Response>;
  updateTeacher: (id: string, updates: Partial<Teacher>) => Promise<Response>;
  deleteTeacher: (id: string) => Promise<Response>;
  
  addClass: (cls: Partial<Class>) => Promise<Response>;
  updateClass: (id: string, updates: Partial<Class>) => Promise<Response>;
  deleteClass: (id: string) => Promise<Response>;

  addRoom: (room: Partial<Room>) => Promise<Response>;
  updateRoom: (id: string, updates: Partial<Room>) => Promise<Response>;
  deleteRoom: (id: string) => Promise<Response>;

  reorderStudents: (studentIds: string[]) => Promise<void>;
  reorderTeachers: (teacherIds: string[]) => Promise<void>;
  reorderClasses: (classIds: string[]) => Promise<void>;

  duplicatePreview: (student: Partial<Student>) => Promise<{ decision: 'MATCH_EXISTING' | 'REVIEW' | 'CREATE_NEW', candidates: DuplicateCandidate[] }>;
  scanDuplicates: () => Promise<DuplicateGroup[]>;
  mergeStudents: (sourceId: string, targetId: string, reason: string) => Promise<Response>;
}

export interface DuplicateCandidate {
  studentId: string;
  name: string;
  studentCode?: string;
  parentPhone?: string;
  birthYear?: number;
  classes: string[];
  score: number;
  reasons: string[];
}

export interface DuplicateGroup {
  primary: Student;
  others: (Student & { score: number, reasons: string[] })[];
}
