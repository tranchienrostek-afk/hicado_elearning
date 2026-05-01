import { useEffect, useMemo, useState } from 'react';
import { useAuthStore, useCenterStore } from '@/store';
import { toast } from 'react-hot-toast';
import { SkeletonTable } from '@/views/components/skeleton';
import { ConfirmModal } from '@/views/components/confirm-modal';
import FocusLock from 'react-focus-lock';
import { z } from 'zod';
import clsx from 'clsx';

const studentSchema = z.object({
  name: z.string().min(2, 'Tên quá ngắn'),
  birthYear: z.coerce.number().min(1900).max(new Date().getFullYear()),
  address: z.string().optional(),
  schoolName: z.string().optional(),
  schoolClass: z.string().optional(),
});

const teacherSchema = z.object({
  name: z.string().min(2, 'Tên quá ngắn'),
  phone: z.string().min(10, 'Số điện thoại không hợp lệ'),
  specialization: z.string().min(2, 'Chuyên môn không được trống'),
  bankAccount: z.string().min(5, 'Số tài khoản không hợp lệ'),
  bankName: z.string().min(2, 'Tên ngân hàng không được trống'),
  salaryRate: z.coerce.number().min(0).max(1),
});


type TuitionBadgeStatus = 'PAID' | 'PENDING' | 'DEBT';

interface TeacherTuitionSnapshot {
  due: number;
  paid: number;
  status: TuitionBadgeStatus;
}

export const Users = () => {
  const { students, teachers, classes, attendance, transactions, importStudents, addStudent, updateStudent, deleteStudent, addTeacher, updateTeacher, deleteTeacher, isLoading } = useCenterStore();
  const { role, auth, accounts, fetchAccounts, addAccount, deleteAccount } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'STUDENTS' | 'TEACHERS'>('STUDENTS');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, title: string, type?: 'PROFILE' | 'ACCOUNT' } | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [viewingStoryId, setViewingStoryId] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isStaff = role === 'ADMIN' || role === 'MANAGER';
  const isTeacher = role === 'TEACHER';
  const isStudent = role === 'STUDENT';

  const teacherClasses = isTeacher && auth?.teacherId
    ? classes.filter(c => c.teacherId === auth.teacherId)
    : [];
  const teacherStudentIds = new Set(teacherClasses.flatMap(c => c.studentIds));
  const scopedStudents = isTeacher
    ? students.filter(s => teacherStudentIds.has(s.id))
    : isStudent
      ? students.filter(s => s.id === auth?.studentId)
      : students;
  const scopedTeachers = isTeacher
    ? teachers.filter(t => t.id === auth?.teacherId)
    : isStudent
      ? []
      : teachers;

  const [accountForm, setAccountForm] = useState({
    targetId: '',
    username: '',
    password: '',
  });

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if ((isStudent || isTeacher) && activeTab !== 'STUDENTS') {
      setActiveTab('STUDENTS');
    }
  }, [activeTab, isStudent, isTeacher]);



  // Form State
  const [formData, setFormData] = useState<any>({
    name: '',
    birthYear: 2010,
    address: '',
    schoolName: '',
    schoolClass: '',
    phone: '',
    specialization: '',
    bankAccount: '',
    bankName: '',
    salaryRate: 0.8
  });

  const handleEdit = (item: any) => {
    setIsEditMode(true);
    setSelectedId(item.id);
    setFormData({
      name: item.name,
      birthYear: item.birthYear || 2010,
      address: item.address || '',
      schoolName: item.schoolName || '',
      schoolClass: item.schoolClass || '',
      phone: item.phone || '',
      specialization: item.specialization || '',
      bankAccount: item.bankAccount || '',
      bankName: item.bankName || '',
      salaryRate: item.salaryRate || 0.8
    });
    setIsAddModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmDelete({ id, title: name, type: 'PROFILE' });
  };

  const executeDelete = () => {
    if (!confirmDelete) return;
    const { id, type } = confirmDelete;
    
    if (type === 'ACCOUNT') {
      deleteAccount(id);
      toast.success('Đã thu hồi quyền truy cập');
    } else if (id === 'BULK') {
      const idsToDelete = Array.from(selectedIds);
      if (activeTab === 'STUDENTS') {
        idsToDelete.forEach(id => deleteStudent(id));
        toast.success(`Đã xóa ${idsToDelete.length} học sinh`);
      } else {
        idsToDelete.forEach(id => deleteTeacher(id));
        toast.success(`Đã xóa ${idsToDelete.length} giáo viên`);
      }
      setSelectedIds(new Set());
    } else {
      if (activeTab === 'STUDENTS') {
        deleteStudent(id);
        toast.success('Đã xóa học sinh');
      } else {
        deleteTeacher(id);
        toast.success('Đã xóa giáo viên');
      }
    }
    setConfirmDelete(null);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setConfirmDelete({ id: 'BULK', title: `${selectedIds.size} hồ sơ đang chọn` });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = (ids: string[]) => {
    if (selectedIds.size === ids.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ids));
    }
  };

  const handleSave = () => {
    setFormErrors({});
    const schema = activeTab === 'STUDENTS' ? studentSchema : teacherSchema;
    const result = schema.safeParse(formData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        errors[issue.path[0]] = issue.message;
      });
      setFormErrors(errors);
      toast.error('Vui lòng kiểm tra lại thông tin');
      return;
    }

    const data = result.data;

    if (activeTab === 'STUDENTS') {
      if (isEditMode && selectedId) {
        updateStudent(selectedId, data as any);
        toast.success('Đã cập nhật học sinh');
      } else {
        addStudent({
          id: 'S' + Date.now(),
          ...(data as any),
          tuitionStatus: 'DEBT'
        });
        toast.success('Đã thêm học sinh mới');
      }
    } else {
      if (isEditMode && selectedId) {
        updateTeacher(selectedId, data as any);
        toast.success('Đã cập nhật giáo viên');
      } else {
        addTeacher({
          id: 'T' + Date.now(),
          ...(data as any)
        });
        toast.success('Đã thêm giáo viên mới');
      }
    }

    setIsAddModalOpen(false);
    setIsEditMode(false);
    setSelectedId(null);
    setFormErrors({});
    setFormData({ name: '', birthYear: 2010, address: '', schoolName: '', schoolClass: '', phone: '', specialization: '', bankAccount: '', bankName: '', salaryRate: 0.8 });
  };

  const filteredStudents = scopedStudents.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) &&
    (yearFilter === '' || s.birthYear.toString() === yearFilter)
  );

  const teacherTuitionByStudent = useMemo<Record<string, TeacherTuitionSnapshot>>(() => {
    if (!isTeacher) return {};
    const scopedStudentIds = new Set(scopedStudents.map((item) => item.id));

    const monthClassSessions = new Map<string, number>();
    teacherClasses.forEach((cls) => {
      const classSessionCount = new Set(
        attendance
          .filter((item) => item.classId === cls.id && item.date.startsWith(monthFilter))
          .map((item) => item.date)
      ).size;
      monthClassSessions.set(cls.id, classSessionCount);
    });

    const dueMap = new Map<string, number>();
    teacherClasses.forEach((cls) => {
      const sessions = monthClassSessions.get(cls.id) || 0;
      if (sessions === 0) return;

      Array.from(new Set(cls.studentIds)).forEach((studentId) => {
        dueMap.set(studentId, (dueMap.get(studentId) || 0) + sessions * cls.tuitionPerSession);
      });
    });

    const paidMap = new Map<string, number>();
    transactions
      .filter((item) => item.status === 'SUCCESS' && item.date.startsWith(monthFilter))
      .forEach((item) => {
        if (!scopedStudentIds.has(item.studentId)) return;
        paidMap.set(item.studentId, (paidMap.get(item.studentId) || 0) + item.amount);
      });

    const result: Record<string, TeacherTuitionSnapshot> = {};
    scopedStudents.forEach((student) => {
      const due = dueMap.get(student.id) || 0;
      const paid = paidMap.get(student.id) || 0;

      let status: TuitionBadgeStatus = 'DEBT';
      if (due === 0) {
        status = paid > 0 ? 'PAID' : student.tuitionStatus;
      } else if (paid >= due) {
        status = 'PAID';
      } else if (paid > 0) {
        status = 'PENDING';
      }

      result[student.id] = { due, paid, status };
    });

    return result;
  }, [attendance, isTeacher, monthFilter, scopedStudents, teacherClasses, transactions]);

  const getStudentTuitionSnapshot = (
    studentId: string,
    fallbackStatus: TuitionBadgeStatus
  ): TeacherTuitionSnapshot => {
    if (!isTeacher) {
      return { due: 0, paid: 0, status: fallbackStatus };
    }
    return teacherTuitionByStudent[studentId] || { due: 0, paid: 0, status: 'DEBT' };
  };

  const filteredTeachers = scopedTeachers.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSync = () => {
    if (!sheetUrl.includes('google.com/spreadsheets')) {
      toast.error('Vui lòng nhập link Google Sheets hợp lệ');
      return;
    }
    setIsSyncing(true);
    setTimeout(() => {
      const mockImported = [
        { id: 'S' + Date.now(), name: 'Đồng bộ ' + Date.now(), birthYear: 2012, address: 'Auto', tuitionStatus: 'PAID' },
      ] as any;
      const normalizedImported = mockImported.map((item: any) => ({
        ...item,
        schoolName: item.schoolName || 'THCS Mẫu',
        schoolClass: item.schoolClass || 'Lớp 8A',
      }));
      importStudents(normalizedImported);
      setIsSyncing(false);
      setIsImportOpen(false);
      setSheetUrl('');
      toast.success('Đồng bộ thành công');
    }, 1500);
  };

  const availableTeacherTargets = teachers.filter(t => !accounts.some(a => a.teacherId === t.id));
  const availableStudentTargets = students.filter(s => !accounts.some(a => a.studentId === s.id));
  const accountList = accounts.filter(a => activeTab === 'TEACHERS' ? a.role === 'TEACHER' : a.role === 'STUDENT');

  const handleCreateAccount = async () => {
    if (!accountForm.username || !accountForm.password || !accountForm.targetId) {
      toast.error('Vui lòng chọn đối tượng và nhập tài khoản/mật khẩu');
      return;
    }
    
    // Check if username already exists locally
    if (accounts.some(a => a.username === accountForm.username)) {
      toast.error('Tên tài khoản đã tồn tại');
      return;
    }

    // Check if target already has an account
    const hasAccount = activeTab === 'TEACHERS' 
      ? accounts.some(a => a.teacherId === accountForm.targetId)
      : accounts.some(a => a.studentId === accountForm.targetId);
      
    if (hasAccount) {
      toast.error('Đối tượng này đã có tài khoản truy cập');
      return;
    }

    try {
      if (activeTab === 'TEACHERS') {
        const teacher = teachers.find(t => t.id === accountForm.targetId);
        if (!teacher) {
          toast.error('Không tìm thấy giáo viên');
          return;
        }
        await addAccount({
          username: accountForm.username,
          password: accountForm.password,
          role: 'TEACHER',
          name: teacher.name,
          teacherId: teacher.id,
        });
      } else {
        const student = students.find(s => s.id === accountForm.targetId);
        if (!student) {
          toast.error('Không tìm thấy học sinh');
          return;
        }
        await addAccount({
          username: accountForm.username,
          password: accountForm.password,
          role: 'STUDENT',
          name: student.name,
          studentId: student.id,
        });
      }

      setAccountForm({ targetId: '', username: '', password: '' });
      toast.success('Đã kích hoạt định danh thành công');
    } catch (error: any) {
      console.error('Account creation failed:', error);
      toast.error(error.message || 'Không thể tạo tài khoản. Có thể do dữ liệu đã tồn tại hoặc lỗi kết nối.');
    }
  };


  return (
    <div className="space-y-8 relative">
      {/* Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <FocusLock returnFocus>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 md:p-8 border-b border-hicado-slate flex justify-between items-center shrink-0 bg-hicado-slate/10">
              <h3 className="text-xl font-black text-hicado-navy uppercase tracking-tight">{isEditMode ? 'Cập nhật' : 'Thêm'} {activeTab === 'STUDENTS' ? 'Học sinh' : 'Giáo viên'}</h3>
              <button onClick={() => { setIsAddModalOpen(false); setIsEditMode(false); }} className="text-hicado-navy/40 hover:text-hicado-navy transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-5 md:p-8 space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Họ và tên</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className={clsx(
                    "w-full bg-slate-50 border px-4 py-3 rounded-xl text-sm outline-none transition-all",
                    formErrors.name ? "border-rose-500 focus:ring-rose-500/20" : "border-slate-200 focus:ring-management-blue/20"
                  )}
                  placeholder="Nhập tên..."
                />
                {formErrors.name && <p className="text-[10px] text-rose-500 font-bold mt-1 uppercase">{formErrors.name}</p>}
              </div>

              {activeTab === 'STUDENTS' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Năm sinh</label>
                      <input 
                        type="number" 
                        value={formData.birthYear}
                        onChange={e => setFormData({ ...formData, birthYear: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lớp đang học</label>
                      <input
                        type="text"
                        value={formData.schoolClass}
                        onChange={e => setFormData({ ...formData, schoolClass: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none"
                        placeholder="VD: Lá»›p 9A1"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trường đang học</label>
                    <input
                      type="text"
                      value={formData.schoolName}
                      onChange={e => setFormData({ ...formData, schoolName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none"
                      placeholder="VD: THCS Nguyễn Trãi"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Địa chỉ</label>
                    <input 
                      type="text" 
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none"
                      placeholder="Nhập địa chỉ..."
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Số điện thoại</label>
                      <input 
                        type="text" 
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chuyên môn</label>
                      <input 
                        type="text" 
                        value={formData.specialization}
                        onChange={e => setFormData({ ...formData, specialization: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ngân hàng</label>
                      <input 
                        type="text" 
                        value={formData.bankName}
                        onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Số tài khoản</label>
                      <input 
                        type="text" 
                        value={formData.bankAccount}
                        onChange={e => setFormData({ ...formData, bankAccount: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm outline-none"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="p-6 md:p-8 bg-hicado-slate/20 flex gap-4 shrink-0 border-t border-hicado-slate">
              <button 
                onClick={() => { setIsAddModalOpen(false); setIsEditMode(false); }}
                className="flex-1 px-4 md:px-6 py-3 md:py-4 rounded-2xl font-black text-hicado-navy/40 hover:bg-white transition-all uppercase text-[10px] md:text-xs tracking-widest border border-transparent hover:border-hicado-slate"
              >
                Hủy
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 bg-hicado-navy text-white px-4 md:px-6 py-3 md:py-4 rounded-2xl font-black shadow-xl shadow-hicado-navy/20 hover:translate-y-[-2px] transition-all uppercase text-[10px] md:text-xs tracking-widest"
              >
                {isEditMode ? 'Cập nhật' : 'Lưu hồ sơ'}
              </button>
            </div>

            </div>
          </FocusLock>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-hicado-slate shadow-premium">
          <div className="flex bg-hicado-slate/30 p-1.5 rounded-2xl">
            <button 
              onClick={() => setActiveTab('STUDENTS')}
              className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'STUDENTS' ? 'bg-hicado-navy text-white shadow-xl' : 'text-hicado-navy/40 hover:text-hicado-navy'}`}
            >
              Học sinh
            </button>
            {isStaff && (
              <button 
                onClick={() => setActiveTab('TEACHERS')}
                className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'TEACHERS' ? 'bg-hicado-navy text-white shadow-xl' : 'text-hicado-navy/40 hover:text-hicado-navy'}`}
              >
                Giáo viên
              </button>
            )}
          </div>

          <div className="flex w-full sm:w-auto gap-3">
            {isStaff && (
              <>
                <button 
                  onClick={() => setIsImportOpen(!isImportOpen)}
                  className="flex-1 sm:flex-none bg-hicado-emerald/10 text-hicado-emerald px-5 py-2.5 rounded-xl font-black border border-hicado-emerald/20 text-[10px] uppercase tracking-widest"
                >
                  Import Sheets
                </button>
                <button 
                  onClick={() => { setIsAddModalOpen(true); setIsEditMode(false); setFormData({ name: '', birthYear: 2010, address: '', schoolName: '', schoolClass: '', phone: '', specialization: '', bankAccount: '', bankName: '', salaryRate: 0.8 }); }}
                  className="flex-1 sm:flex-none bg-hicado-navy text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-hicado-navy/20"
                >
                  Thêm mới
                </button>
              </>
            )}
          </div>
        </div>


        {/* Filters */}
        <div className="bg-white p-6 rounded-3xl border border-hicado-slate shadow-premium flex flex-wrap gap-4 items-center">
          <div className="flex-1 relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-hicado-navy/30">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </span>
            <input 
              type="text" 
              placeholder="Tìm kiếm danh tính..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-hicado-slate/20 border border-transparent rounded-2xl text-sm font-bold text-hicado-navy focus:outline-none focus:bg-white focus:border-hicado-slate transition-all"
            />
          </div>

            <select 
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="bg-hicado-slate/20 border border-transparent px-6 py-4 rounded-2xl text-sm font-black text-hicado-navy/60 focus:outline-none focus:bg-white focus:border-hicado-slate transition-all"
            >
              <option value="">Năm sinh</option>
              {[2009, 2010, 2011, 2012, 2013, 2014, 2015].map(y => <option key={y} value={y.toString()}>{y}</option>)}
            </select>

          {activeTab === 'STUDENTS' && isTeacher && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Thang hoc phi
              </span>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-700 outline-none"
              />
            </div>
          )}
        </div>

        {isImportOpen && (
          <div className="bg-emerald-900/5 border border-emerald-200 p-8 rounded-2xl flex flex-col md:flex-row gap-6 items-end animate-in fade-in slide-in-from-top-4">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">URL Sheets</label>
              <input 
                type="text" 
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="w-full bg-white border border-emerald-200 px-4 py-3 rounded-xl text-sm"
              />
            </div>
            <button onClick={handleSync} disabled={isSyncing} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold uppercase text-xs">
              {isSyncing ? 'Đang bộ...' : 'Đồng bộ'}
            </button>
          </div>
        )}

        {isStaff && (
          <div className="bg-hicado-navy text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden border border-white/5">
            <div className="absolute top-0 right-0 w-64 h-64 bg-hicado-emerald/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
            
            <div className="relative z-10 space-y-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-3">Hệ thống an ninh & Truy cập</p>
                  <h3 className="text-3xl font-black uppercase tracking-tight italic">Quản lý định danh {activeTab === 'TEACHERS' ? 'Giáo viên' : 'Học sinh'}</h3>
                </div>
                <div className="flex gap-3">
                  <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl">
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Độ phủ tài khoản</p>
                    <p className="text-xl font-black italic">{accounts.filter(a => activeTab === 'TEACHERS' ? a.role === 'TEACHER' : a.role === 'STUDENT').length} / {(activeTab === 'TEACHERS' ? teachers : students).length}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Create Form */}
                <div className="lg:col-span-1 bg-white/5 border border-white/10 p-8 rounded-[2rem] space-y-6">
                   <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-widest">Cấp quyền truy cập mới</p>
                   <div className="space-y-4">
                     <div className="space-y-2">
                       <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Chọn đối tượng</label>
                       <select
                         value={accountForm.targetId}
                         onChange={(e) => setAccountForm({ ...accountForm, targetId: e.target.value })}
                         className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:bg-white/20 transition-all"
                       >
                         <option value="" className="text-slate-900">Chọn {activeTab === 'TEACHERS' ? 'Giáo viên' : 'Học sinh'}</option>
                         {(activeTab === 'TEACHERS' ? availableTeacherTargets : availableStudentTargets).map(target => (
                           <option key={target.id} value={target.id} className="text-slate-900">{target.name}</option>
                         ))}
                       </select>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Username</label>
                          <input
                            type="text"
                            value={accountForm.username}
                            onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                            className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:bg-white/20 transition-all"
                            placeholder="vd: user123"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">Password</label>
                          <input
                            type="password"
                            value={accountForm.password}
                            onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                            className="w-full bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:bg-white/20 transition-all"
                            placeholder="••••••"
                          />
                        </div>
                     </div>
                     <button
                       onClick={handleCreateAccount}
                       className="w-full bg-hicado-emerald text-hicado-navy py-4 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-hicado-emerald/20 hover:scale-[1.02] transition-all mt-2"
                     >
                       Kích hoạt định danh
                     </button>
                   </div>
                </div>

                {/* Account List */}
                <div className="lg:col-span-2 bg-white/5 border border-white/10 p-8 rounded-[2rem]">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-6 ml-1">Danh bạ tài khoản hiện hành</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {accountList.length === 0 && (
                      <div className="col-span-2 py-10 text-center opacity-30 italic text-xs">Chưa có tài khoản nào được cấp</div>
                    )}
                    {accountList.map((acc) => (
                      <div key={acc.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex justify-between items-center group hover:bg-white/10 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-hicado-navy border border-white/10 rounded-lg flex items-center justify-center font-black text-[10px]">
                            {acc.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight">{acc.username}</p>
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{acc.name}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => {
                              setSelectedAccount(acc);
                              setIsAccountModalOpen(true);
                            }}
                            className="p-2 text-white/40 hover:text-hicado-emerald hover:bg-white/5 rounded-lg transition-all"
                            title="Đổi mật khẩu"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                          </button>
                          <button 
                            onClick={() => setConfirmDelete({ id: acc.id, title: acc.username, type: 'ACCOUNT' })}
                            className="p-2 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                            title="Thu hồi quyền"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-hicado-navy text-white px-8 py-4 rounded-3xl flex items-center justify-between animate-in slide-in-from-top-4 duration-500 shadow-2xl shadow-hicado-navy/30 border border-white/10">
          <div className="flex items-center gap-6">
            <div className="w-10 h-10 bg-hicado-emerald text-hicado-navy rounded-xl flex items-center justify-center font-black">
              {selectedIds.size}
            </div>
            <div>
              <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.3em]">Hồ sơ đang chọn</p>
              <p className="text-sm font-bold opacity-80">Thực hiện hành vụ cho nhóm nhân sự đã chọn</p>
            </div>
          </div>
          <div className="flex gap-4">
             <button 
              onClick={() => setSelectedIds(new Set())}
              className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-colors"
            >
              Hủy chọn
            </button>
            <button 
              onClick={handleBulkDelete}
              className="bg-rose-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-900/40 hover:bg-rose-600 transition-colors"
            >
              Xóa hàng loạt
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-hicado-slate shadow-premium overflow-hidden overflow-x-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-12">
            <SkeletonTable rows={8} />
          </div>
        ) : (activeTab === 'STUDENTS' ? filteredStudents.length : filteredTeachers.length) === 0 ? (
          <div className="p-20 text-center space-y-4">
            <div className="text-6xl grayscale opacity-30">📂</div>
            <p className="text-sm font-black text-hicado-navy/40 uppercase tracking-widest italic">
              Không tìm thấy hồ sơ nào phù hợp
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-hicado-slate/10 border-b border-hicado-slate">
              <th className="px-8 py-5 w-10">
                <input 
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-hicado-navy focus:ring-hicado-navy"
                  checked={activeTab === 'STUDENTS' ? (filteredStudents.length > 0 && selectedIds.size === filteredStudents.length) : (filteredTeachers.length > 0 && selectedIds.size === filteredTeachers.length)}
                  onChange={() => toggleSelectAll((activeTab === 'STUDENTS' ? filteredStudents : filteredTeachers).map(i => i.id))}
                />
              </th>
              <th className="px-8 py-5 text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em]">Hồ sơ chính</th>
              <th className="px-8 py-5 text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em]">Truy cập</th>
              <th className="px-8 py-5 text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em]">Định danh</th>
              <th className="px-8 py-5 text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em]">{activeTab === 'STUDENTS' ? 'Học vấn & Vị trí' : 'Chuyên môn'}</th>
              <th className="px-8 py-5 text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em]">Hành vụ</th>
              <th className="px-8 py-5 text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em] text-right">Điều hướng</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {activeTab === 'STUDENTS' ? filteredStudents.map(student => {
              const tuitionSnapshot = getStudentTuitionSnapshot(student.id, student.tuitionStatus);
              const tuitionStatus = tuitionSnapshot.status;

              return (
              <tr key={student.id} className={clsx("hover:bg-slate-50/50 transition-colors group", selectedIds.has(student.id) && "bg-hicado-emerald/5")}>
                <td className="px-8 py-6">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-hicado-navy focus:ring-hicado-navy"
                    checked={selectedIds.has(student.id)}
                    onChange={() => toggleSelect(student.id)}
                  />
                </td>
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-hicado-slate rounded-xl flex items-center justify-center font-black text-hicado-navy text-xs shadow-sm">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-hicado-navy uppercase tracking-tight leading-tight">{student.name}</p>
                      <p className="text-[10px] text-hicado-navy/40 font-bold uppercase tracking-widest mt-1">Lớp: {student.schoolClass || '--'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  {accounts.find(a => a.studentId === student.id) ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-hicado-emerald/10 text-hicado-emerald text-[9px] font-black rounded-full border border-hicado-emerald/20 uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 bg-hicado-emerald rounded-full animate-pulse"></span>
                      Đã cấp
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 bg-slate-100 text-slate-400 text-[9px] font-black rounded-full border border-slate-200 uppercase tracking-widest">
                      Chưa cấp
                    </span>
                  )}
                </td>

                <td className="px-6 py-5 font-mono text-xs text-slate-500">{student.cccd || 'CHƯA CẬP NHẬT'}</td>
                <td className="px-6 py-5 text-sm text-slate-600 font-medium">
                  <p className="font-bold text-slate-800">{student.schoolName || 'Chưa cập nhật trường'}</p>
                  <p className="text-[11px] text-slate-500">{student.schoolClass || '--'}</p>
                  <p className="text-[11px] text-slate-400">{student.address}</p>
                </td>
                <td className="px-8 py-6">
                  <div className="flex flex-col gap-2">
                    <span className={`inline-flex items-center justify-center px-4 py-1.5 text-[9px] font-black rounded-lg border ${
                      tuitionStatus === 'PAID' ? 'bg-hicado-emerald/10 text-hicado-emerald border-hicado-emerald/20' :
                      tuitionStatus === 'PENDING' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                      'bg-rose-500/10 text-rose-600 border-rose-500/20'
                    } uppercase tracking-widest`}>
                      {tuitionStatus === 'PAID' ? 'Đã thanh toán' : tuitionStatus === 'PENDING' ? 'Đang đối soát' : 'Dư nợ'}
                    </span>
                    {isTeacher && (
                      <p className="text-[9px] text-hicado-navy/30 font-black uppercase tracking-tighter text-center">
                        {tuitionSnapshot.paid.toLocaleString()}đ / {tuitionSnapshot.due.toLocaleString()}đ
                      </p>
                    )}
                  </div>
                </td>

                <td className="px-8 py-6 text-right">
                  <div className="flex justify-end gap-3 md:opacity-0 group-hover:opacity-100 transition-all md:translate-x-2 group-hover:translate-x-0">
                    <button 
                      onClick={() => setViewingStoryId(student.id)} 
                      className="p-2.5 text-hicado-navy/40 hover:text-hicado-navy hover:bg-hicado-slate/30 rounded-xl transition-all border border-transparent hover:border-hicado-slate"
                      title="Xem Narrative"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    </button>
                    {isStaff && (
                      <>
                          <button onClick={() => handleEdit(student)} className="p-2.5 text-hicado-navy/40 hover:text-hicado-navy hover:bg-hicado-slate/30 rounded-xl transition-all border border-transparent hover:border-hicado-slate">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                          </button>
                          <button onClick={() => handleDelete(student.id, student.name)} className="p-2.5 text-hicado-navy/40 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                      </>
                    )}
                  </div>
                </td>

              </tr>
            );
            }) : filteredTeachers.map(teacher => (
              <tr key={teacher.id} className={clsx("hover:bg-slate-50/50 transition-colors group", selectedIds.has(teacher.id) && "bg-hicado-emerald/5")}>
                <td className="px-8 py-6">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-hicado-navy focus:ring-hicado-navy"
                    checked={selectedIds.has(teacher.id)}
                    onChange={() => toggleSelect(teacher.id)}
                  />
                </td>
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-hicado-slate rounded-xl flex items-center justify-center font-black text-hicado-navy text-xs shadow-sm">
                      {teacher.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-black text-hicado-navy uppercase tracking-tight leading-tight">{teacher.name}</p>
                      <p className="text-[10px] text-hicado-navy/40 font-bold uppercase tracking-widest mt-1">SĐT: {teacher.phone}</p>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  {accounts.find(a => a.teacherId === teacher.id) ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-hicado-emerald/10 text-hicado-emerald text-[9px] font-black rounded-full border border-hicado-emerald/20 uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 bg-hicado-emerald rounded-full animate-pulse"></span>
                      Đã cấp
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 bg-slate-100 text-slate-400 text-[9px] font-black rounded-full border border-slate-200 uppercase tracking-widest">
                      Chưa cấp
                    </span>
                  )}
                </td>
                <td className="px-6 py-5 font-mono text-xs text-slate-500">{teacher.cccd || 'CHƯA CẬP NHẬT'}</td>
                <td className="px-6 py-5">
                  <p className="text-sm text-slate-900 font-bold uppercase tracking-tight">{teacher.specialization}</p>
                  <p className="text-[10px] text-management-blue font-black uppercase tracking-widest mt-1">{teacher.workplace || 'Hicado Center'}</p>
                </td>
                <td className="px-8 py-6">
                  <span className="px-4 py-1.5 bg-hicado-emerald/10 text-hicado-emerald text-[9px] font-black rounded-lg border border-hicado-emerald/20 uppercase tracking-widest">Đang công tác</span>
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex justify-end gap-3 md:opacity-0 group-hover:opacity-100 transition-all md:translate-x-2 group-hover:translate-x-0">
                    {isStaff && (
                      <>
                        <button onClick={() => handleEdit(teacher)} className="p-2.5 text-hicado-navy/40 hover:text-hicado-navy hover:bg-hicado-slate/30 rounded-xl transition-all border border-transparent hover:border-hicado-slate">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button onClick={() => handleDelete(teacher.id, teacher.name)} className="p-2.5 text-hicado-navy/40 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-100">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        )}
      </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Xác nhận xóa hồ sơ"
        message={`Bạn có chắc chắn muốn xóa vĩnh viễn hồ sơ của "${confirmDelete?.title}"? Hành động này không thể hoàn tác.`}
        onConfirm={executeDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {viewingStoryId && (
        <StudentStoryModal studentId={viewingStoryId} onClose={() => setViewingStoryId(null)} />
      )}

      {isAccountModalOpen && selectedAccount && (
        <AccountSecurityModal 
          account={selectedAccount} 
          onClose={() => {
            setIsAccountModalOpen(false);
            setSelectedAccount(null);
          }} 
        />
      )}
    </div>
  );
};

const AccountSecurityModal = ({ account, onClose }: { account: any, onClose: () => void }) => {
  const { updateAccount } = useAuthStore();
  const [newPassword, setNewPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleReset = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Mật khẩu mới phải từ 6 ký tự');
      return;
    }
    setIsUpdating(true);
    try {
      await updateAccount(account.id, { password: newPassword });
      toast.success('Đã cập nhật mật khẩu mới');
      onClose();
    } catch (error) {
      toast.error('Lỗi khi cập nhật mật khẩu');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <FocusLock returnFocus>
        <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-8 bg-hicado-navy text-white flex justify-between items-center shrink-0">
            <div>
              <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-widest mb-1">Bảo mật & Định danh</p>
              <h3 className="text-xl font-black uppercase tracking-tight">Thiết lập tài khoản</h3>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center font-black text-hicado-navy shadow-sm">
                {account.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-black text-hicado-navy uppercase tracking-tight">{account.username}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{account.name}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu mới</label>
              <input 
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-4 py-4 rounded-2xl text-sm font-bold text-hicado-navy outline-none focus:bg-white focus:border-hicado-navy transition-all"
                placeholder="Nhập mật khẩu mới..."
              />
            </div>

            <div className="flex gap-4">
              <button 
                onClick={onClose}
                className="flex-1 py-4 rounded-2xl text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200"
              >
                Đóng
              </button>
              <button 
                onClick={handleReset}
                disabled={isUpdating}
                className="flex-2 bg-hicado-navy text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-hicado-navy/20 hover:scale-[1.02] transition-all disabled:opacity-50"
              >
                {isUpdating ? 'Đang cập nhật...' : 'Cập nhật bảo mật'}
              </button>
            </div>
          </div>
        </div>
      </FocusLock>
    </div>
  );
};

const StudentStoryModal = ({ studentId, onClose }: { studentId: string, onClose: () => void }) => {
  const { students, classes, attendance } = useCenterStore();
  const student = students.find(s => s.id === studentId);
  if (!student) return null;

  const studentClasses = classes.filter(c => c.studentIds.includes(studentId));
  const studentAttendance = attendance.filter(a => a.studentId === studentId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate financials
  const totalTuition = studentClasses.reduce((acc, cls) => {
    const attendedSessions = attendance.filter(a => a.studentId === studentId && a.classId === cls.id && a.status === 'PRESENT').length;
    return acc + (attendedSessions * cls.tuitionPerSession);
  }, 0);

  const totalPaid = useCenterStore.getState().transactions
    .filter(t => t.studentId === studentId && t.status === 'SUCCESS')
    .reduce((acc, t) => acc + t.amount, 0);

  const debt = totalTuition - totalPaid;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PRESENT': return 'bg-emerald-500';
      case 'ABSENT': return 'bg-rose-500';
      case 'LEAVE_REQUEST': return 'bg-amber-400';
      default: return 'bg-slate-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PRESENT': return 'Đi học';
      case 'ABSENT': return 'Nghỉ không phép';
      case 'LEAVE_REQUEST': return 'Xin nghỉ (Có phép)';
      default: return status;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-12 bg-hicado-navy text-white shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-hicado-emerald/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
          <div className="relative z-10 flex justify-between items-start">
            <div className="flex gap-8 items-center">
              <div className="w-24 h-24 bg-hicado-emerald text-hicado-navy rounded-3xl flex items-center justify-center text-4xl font-black shadow-2xl shadow-hicado-emerald/20">
                {student.name.charAt(0)}
              </div>
              <div className="space-y-2">
                <p className="text-hicado-emerald text-[10px] font-black uppercase tracking-[0.5em] px-1">Hồ sơ chi tiết học viên</p>
                <h3 className="text-4xl font-black uppercase tracking-tight leading-none italic">{student.name}</h3>
                <div className="flex gap-4 items-center opacity-40 text-[10px] font-black uppercase tracking-[0.2em] mt-2">
                  <span>REF: #{student.id}</span>
                  <span className="w-1.5 h-1.5 bg-white/20 rounded-full"></span>
                  <span>SN: {student.birthYear}</span>
                  <span className="w-1.5 h-1.5 bg-white/20 rounded-full"></span>
                  <span>{student.schoolClass || 'Private Class'}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>


          <div className="grid grid-cols-4 gap-6 mt-10 relative z-10">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl">
              <p className="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">Tổng học phí (Định mức)</p>
              <p className="text-xl font-black italic">{totalTuition.toLocaleString()}đ</p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl">
              <p className="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">Đã quyết toán</p>
              <p className="text-xl font-black text-emerald-400 italic">{totalPaid.toLocaleString()}đ</p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-3xl col-span-2">
              <p className="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">Dư nợ hiện tại</p>
              <div className="flex justify-between items-end">
                <p className={`text-2xl font-black italic ${debt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {debt > 0 ? `+${debt.toLocaleString()}đ` : 'Hết nợ'}
                </p>
                <span className="text-[10px] font-black opacity-40 uppercase tracking-widest">Cập nhật: {new Date().toLocaleDateString('vi-VN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          <div className="w-1/3 p-10 overflow-y-auto border-r border-slate-100 bg-slate-50/50">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-8">Lớp học đang theo ({studentClasses.length})</h4>
            <div className="space-y-6">
              {studentClasses.map(cls => (
                <div key={cls.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start">
                    <p className="font-black text-sm text-slate-900 uppercase tracking-tight">{cls.name}</p>
                    <span className="text-[10px] font-black text-management-blue uppercase">{(cls.tuitionPerSession/1000)}k/B</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase">
                      <span>Tiến độ</span>
                      <span>{attendance.filter(a => a.studentId === studentId && a.classId === cls.id && a.status === 'PRESENT').length}/{cls.totalSessions} buổi</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-management-blue transition-all duration-1000" 
                        style={{ width: `${(attendance.filter(a => a.studentId === studentId && a.classId === cls.id && a.status === 'PRESENT').length / cls.totalSessions) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 p-10 overflow-y-auto space-y-10">
            <div className="space-y-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex justify-between">
                <span>Dòng thời gian học tập</span>
                <span className="text-emerald-500">Kỳ học: Spring 2025</span>
              </h4>
              <div className="space-y-8 relative before:absolute before:inset-y-0 before:left-3 before:w-px before:bg-slate-200">
                {studentAttendance.map((record) => (
                  <div key={record.id} className="relative pl-10 group">
                    <div className={`absolute left-1.5 top-1 w-3 h-3 rounded-full border-4 border-white shadow-sm ring-2 ring-offset-2 ring-transparent transition-all group-hover:scale-125 ${getStatusColor(record.status)}`}></div>
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-xs font-black text-slate-900 uppercase tracking-tight">
                          {classes.find(c => c.id === record.classId)?.name}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{getStatusText(record.status)}</p>
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                        {new Date(record.date).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                {studentAttendance.length === 0 && (
                  <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-300">
                    <p className="text-xs font-bold text-slate-400 uppercase">Chưa có dữ liệu điểm danh</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
