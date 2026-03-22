import { useEffect, useMemo, useState } from 'react';
import { useAuthStore, useCenterStore } from '@/store';
import { toast } from 'react-hot-toast';

type TuitionBadgeStatus = 'PAID' | 'PENDING' | 'DEBT';

interface TeacherTuitionSnapshot {
  due: number;
  paid: number;
  status: TuitionBadgeStatus;
}

export const Users = () => {
  const { students, teachers, classes, attendance, transactions, importStudents, addStudent, updateStudent, deleteStudent, addTeacher, updateTeacher, deleteTeacher } = useCenterStore();
  const { role, auth, accounts, addAccount } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'STUDENTS' | 'TEACHERS'>('STUDENTS');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bản ghi này?')) {
      if (activeTab === 'STUDENTS') {
        deleteStudent(id);
        toast.success('Đã xóa học sinh');
      } else {
        deleteTeacher(id);
        toast.success('Đã xóa giáo viên');
      }
    }
  };

  const handleSave = () => {
    if (!formData.name) {
      toast.error('Vui lòng nhập tên');
      return;
    }

    if (activeTab === 'STUDENTS') {
      if (isEditMode && selectedId) {
        updateStudent(selectedId, {
          name: formData.name,
          birthYear: Number(formData.birthYear),
          address: formData.address,
          schoolName: formData.schoolName,
          schoolClass: formData.schoolClass,
        });
        toast.success('Đã cập nhật học sinh');
      } else {
        addStudent({
          id: 'S' + Date.now(),
          name: formData.name,
          birthYear: Number(formData.birthYear),
          address: formData.address,
          schoolName: formData.schoolName,
          schoolClass: formData.schoolClass,
          tuitionStatus: 'DEBT'
        });
        toast.success('Đã thêm học sinh mới');
      }
    } else {
      if (isEditMode && selectedId) {
        updateTeacher(selectedId, {
          name: formData.name,
          phone: formData.phone,
          specialization: formData.specialization,
          bankAccount: formData.bankAccount,
          bankName: formData.bankName,
          salaryRate: Number(formData.salaryRate)
        });
        toast.success('Đã cập nhật giáo viên');
      } else {
        addTeacher({
          id: 'T' + Date.now(),
          name: formData.name,
          phone: formData.phone,
          specialization: formData.specialization,
          bankAccount: formData.bankAccount,
          bankName: formData.bankName,
          salaryRate: Number(formData.salaryRate)
        });
        toast.success('Đã thêm giáo viên mới');
      }
    }

    setIsAddModalOpen(false);
    setIsEditMode(false);
    setSelectedId(null);
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
        schoolName: item.schoolName || 'THCS Máº«u',
        schoolClass: item.schoolClass || 'Lá»›p 8A',
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

  const handleCreateAccount = () => {
    if (!accountForm.username || !accountForm.password || !accountForm.targetId) {
      toast.error('Vui lòng chọn đối tượng và nhập tài khoản/mật khẩu');
      return;
    }
    if (accounts.some(a => a.username === accountForm.username)) {
      toast.error('Tài khoản đã tồn tại');
      return;
    }

    if (activeTab === 'TEACHERS') {
      const teacher = teachers.find(t => t.id === accountForm.targetId);
      if (!teacher) {
        toast.error('Không tìm thấy giáo viên');
        return;
      }
      addAccount({
        id: `U-${Date.now()}`,
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
      addAccount({
        id: `U-${Date.now()}`,
        username: accountForm.username,
        password: accountForm.password,
        role: 'STUDENT',
        name: student.name,
        studentId: student.id,
      });
    }

    setAccountForm({ targetId: '', username: '', password: '' });
    toast.success('Đã tạo tài khoản đăng nhập');
  };

  return (
    <div className="space-y-8 relative">
      {/* Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-5 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{isEditMode ? 'Cập nhật' : 'Thêm'} {activeTab === 'STUDENTS' ? 'Học sinh' : 'Giáo viên'}</h3>
              <button onClick={() => { setIsAddModalOpen(false); setIsEditMode(false); }} className="text-slate-400 hover:text-slate-600">
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
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none"
                  placeholder="Nhập tên..."
                />
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
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lá»›p Ä‘ang há» c</label>
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
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TrÆ°á» ng Ä‘ang há» c</label>
                    <input
                      type="text"
                      value={formData.schoolName}
                      onChange={e => setFormData({ ...formData, schoolName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none"
                      placeholder="VD: THCS Nguyá»…n TrÃ£i"
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
            <div className="p-5 md:p-8 bg-slate-50 flex gap-4 shrink-0">
              <button 
                onClick={() => { setIsAddModalOpen(false); setIsEditMode(false); }}
                className="flex-1 px-4 md:px-6 py-3 md:py-4 rounded-2xl font-bold text-slate-400 hover:bg-slate-100 transition-all uppercase text-[10px] md:text-xs tracking-widest"
              >
                Hủy
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 bg-management-blue text-white px-4 md:px-6 py-3 md:py-4 rounded-2xl font-black shadow-lg shadow-blue-900/10 hover:translate-y-[-2px] transition-all uppercase text-[10px] md:text-xs tracking-widest"
              >
                {isEditMode ? 'Cập nhật' : 'Lưu hồ sơ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('STUDENTS')}
              className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'STUDENTS' ? 'bg-white text-management-blue shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Học sinh
            </button>
            {isStaff && (
              <button 
                onClick={() => setActiveTab('TEACHERS')}
                className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'TEACHERS' ? 'bg-white text-management-blue shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Giáo viên
              </button>
            )}
          </div>
          <div className="flex w-full sm:w-auto gap-3 mt-2 sm:mt-0">
            {isStaff && (
              <>
                <button 
                  onClick={() => setIsImportOpen(!isImportOpen)}
                  className="flex-1 sm:flex-none bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold border border-emerald-100 text-[10px] md:text-xs uppercase"
                >
                  Import Sheets
                </button>
                <button 
                  onClick={() => { setIsAddModalOpen(true); setIsEditMode(false); setFormData({ name: '', birthYear: 2010, address: '', schoolName: '', schoolClass: '', phone: '', specialization: '', bankAccount: '', bankName: '', salaryRate: 0.8 }); }}
                  className="flex-1 sm:flex-none bg-management-blue text-white px-4 py-2 rounded-xl font-bold text-[10px] md:text-xs uppercase shadow-lg shadow-blue-900/10"
                >
                  Thêm mới
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
          <div className="flex-1 relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </span>
            <input 
              type="text" 
              placeholder="Tìm kiếm theo tên..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-management-blue/20"
            />
          </div>
          {activeTab === 'STUDENTS' && (
            <select 
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl text-sm focus:outline-none font-bold text-slate-600"
            >
              <option value="">Tất cả năm sinh</option>
              <option value="2009">2009</option>
              <option value="2010">2010</option>
              <option value="2011">2011</option>
              <option value="2012">2012</option>
            </select>
          )}
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
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tạo tài khoản đăng nhập</p>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                {activeTab === 'TEACHERS' ? 'Tài khoản giáo viên' : 'Tài khoản học sinh'}
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chọn đối tượng</label>
                <select
                  value={accountForm.targetId}
                  onChange={(e) => setAccountForm({ ...accountForm, targetId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700"
                >
                  <option value="">Chọn</option>
                  {(activeTab === 'TEACHERS' ? availableTeacherTargets : availableStudentTargets).map(target => (
                    <option key={target.id} value={target.id}>{target.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Username</label>
                <input
                  type="text"
                  value={accountForm.username}
                  onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700"
                  placeholder="vd: thaychien"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                <input
                  type="text"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700"
                  placeholder="vd: 123456"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-slate-400 italic">
                {activeTab === 'TEACHERS'
                  ? `Còn ${availableTeacherTargets.length} giáo viên chưa có tài khoản`
                  : `Còn ${availableStudentTargets.length} học sinh chưa có tài khoản`}
              </p>
              <button
                onClick={handleCreateAccount}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:bg-slate-800"
              >
                Tạo tài khoản
              </button>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Danh sách tài khoản</p>
              <div className="flex flex-wrap gap-2">
                {accountList.length === 0 && (
                  <span className="text-xs text-slate-400 italic">Chưa có tài khoản nào</span>
                )}
                {accountList.map((acc) => (
                  <span key={acc.id} className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-black text-slate-500">
                    {acc.username}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Thông tin chính</th>
              <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Định danh / CCCD</th>
              <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">{activeTab === 'STUDENTS' ? 'Trường / Lớp / Địa chỉ' : 'Chuyên môn'}</th>
              <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Trạng thái</th>
              <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeTab === 'STUDENTS' ? filteredStudents.map(student => {
              const tuitionSnapshot = getStudentTuitionSnapshot(student.id, student.tuitionStatus);
              const tuitionStatus = tuitionSnapshot.status;

              return (
              <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-5">
                  <p className="font-bold text-slate-900 uppercase tracking-tight">{student.name}</p>
                  <p className="text-[11px] text-slate-400 font-bold">SN: {student.birthYear}</p>
                  <p className="text-[10px] text-management-blue font-bold uppercase">
                    {student.schoolClass || 'Chưa cập nhật lớp'}
                  </p>
                </td>
                <td className="px-6 py-5 font-mono text-xs text-slate-500">{student.cccd || 'CHƯA CẬP NHẬT'}</td>
                <td className="px-6 py-5 text-sm text-slate-600 font-medium">
                  <p className="font-bold text-slate-800">{student.schoolName || 'Chưa cập nhật trường'}</p>
                  <p className="text-[11px] text-slate-500">{student.schoolClass || '--'}</p>
                  <p className="text-[11px] text-slate-400">{student.address}</p>
                </td>
                <td className="px-6 py-5">
                  <span className={`px-3 py-1 text-[10px] font-black rounded-full border ${
                    tuitionStatus === 'PAID' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    tuitionStatus === 'PENDING' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                    'bg-rose-50 text-rose-600 border-rose-100'
                  }`}>
                    {tuitionStatus === 'PAID' ? 'ĐÃ NỘP' : tuitionStatus === 'PENDING' ? 'CHỜ DUYỆT' : 'CÒN NỢ'}
                  </span>
                  {isTeacher && (
                    <p className="mt-2 text-[10px] text-slate-400 font-bold">
                      {tuitionSnapshot.paid.toLocaleString()}đ / {tuitionSnapshot.due.toLocaleString()}đ ({monthFilter})
                    </p>
                  )}
                </td>
                <td className="px-6 py-5 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setViewingStoryId(student.id)} 
                      className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
                      title="Xem câu chuyện học sinh"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    </button>
                    {isStaff && (
                      <>
                        <button onClick={() => handleEdit(student)} className="p-2 text-slate-400 hover:text-management-blue hover:bg-blue-50 rounded-lg transition-all">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button onClick={() => handleDelete(student.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
            }) : filteredTeachers.map(teacher => (
              <tr key={teacher.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-6 py-5">
                  <p className="font-bold text-slate-900 uppercase tracking-tight">{teacher.name}</p>
                  <p className="text-[11px] text-slate-400 font-bold">{teacher.phone}</p>
                </td>
                <td className="px-6 py-5 font-mono text-xs text-slate-500">{teacher.cccd || 'CHƯA CẬP NHẬT'}</td>
                <td className="px-6 py-5">
                  <p className="text-sm text-slate-900 font-bold uppercase">{teacher.specialization}</p>
                  <p className="text-[10px] text-management-blue font-bold">{teacher.workplace}</p>
                </td>
                <td className="px-6 py-5">
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-full border border-blue-100">ĐANG CÔNG TÁC</span>
                </td>
                <td className="px-6 py-5 text-right">
                  {isStaff && (
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(teacher)} className="p-2 text-slate-400 hover:text-management-blue hover:bg-blue-50 rounded-lg transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                      <button onClick={() => handleDelete(teacher.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewingStoryId && (
        <StudentStoryModal studentId={viewingStoryId} onClose={() => setViewingStoryId(null)} />
      )}
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
        <div className="p-10 bg-slate-900 text-white shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-management-blue/20 rounded-full -mr-32 -mt-32 blur-3xl"></div>
          <div className="relative z-10 flex justify-between items-start">
            <div className="flex gap-6 items-center">
              <div className="w-20 h-20 bg-gradient-to-br from-management-blue to-indigo-600 rounded-3xl flex items-center justify-center text-3xl font-black shadow-2xl shadow-blue-500/20">
                {student.name.charAt(0)}
              </div>
              <div className="space-y-1">
                <h3 className="text-3xl font-black uppercase tracking-tight italic">{student.name}</h3>
                <div className="flex gap-4 items-center opacity-60 text-xs font-bold uppercase tracking-widest">
                  <span>Mã HS: #{student.id}</span>
                  <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                  <span>Năm sinh: {student.birthYear}</span>
                  <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                  <span>{student.schoolClass || 'Chua cap nhat lop'}</span>
                  <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                  <span>{student.schoolName || 'Chua cap nhat truong'}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
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
