import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore, useCenterStore } from '@/store';
import { toast } from 'react-hot-toast';
import { SkeletonTable } from '@/views/components/skeleton';
import { ConfirmModal } from '@/views/components/confirm-modal';
import FocusLock from 'react-focus-lock';
import { z } from 'zod';
import clsx from 'clsx';
import {
  exportCenterWorkbook,
  normalizeCenterImportRows,
  readCenterWorkbookRows,
  type StudentImportRow,
  type TeacherImportRow,
} from '@/utils/center-spreadsheet';
import { planImport, type ImportPlan } from '@/utils/import-planner';
import { ImportPreviewModal } from '@/views/components/import-preview-modal';
import { calculateStudentTuitionDue, sumPresentSessionUnits } from '@/utils/center-operations';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

const studentSchema = z.object({
  name: z.string().min(2, 'Tên quá ngắn'),
  birthYear: z.coerce.number().min(1900).max(new Date().getFullYear()).optional(),
  address: z.string().optional(),
  schoolName: z.string().optional(),
  schoolClass: z.string().optional(),
  parentPhone: z.string().optional(),
  studentPhone: z.string().optional(),
  notes: z.string().optional(),
  sortOrder: z.coerce.number().default(0),
});

const teacherSchema = z.object({
  name: z.string().min(2, 'Tên quá ngắn'),
  phone: z.string().min(10, 'Số điện thoại không hợp lệ'),
  specialization: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  salaryRate: z.coerce.number().min(0).max(1),
  salaryType: z.enum(['PERCENT', 'HOURLY']).default('PERCENT'),
  hourlyRate: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  sortOrder: z.coerce.number().default(0),
});

type TuitionBadgeStatus = 'PAID' | 'PENDING' | 'DEBT';

interface TeacherTuitionSnapshot {
  due: number;
  paid: number;
  status: TuitionBadgeStatus;
}

export const Users = () => {
  const { students, teachers, classes, attendance, transactions, addStudent, updateStudent, deleteStudent, addTeacher, updateTeacher, deleteTeacher, reorderStudents, reorderTeachers, isLoading } = useCenterStore();
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
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan<StudentImportRow | TeacherImportRow> | null>(null);
  const [importKind, setImportKind] = useState<'STUDENTS' | 'TEACHERS'>('STUDENTS');
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
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);
  const [duplicateDecision, setDuplicateDecision] = useState<'MATCH_EXISTING' | 'REVIEW' | 'CREATE_NEW' | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isDuplicateDashboardOpen, setIsDuplicateDashboardOpen] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState<{ source: any, target: any } | null>(null);
  const [mergeReason, setMergeReason] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (activeTab === 'STUDENTS') {
      const oldIndexInFull = students.findIndex(i => i.id === active.id);
      const newIndexInFull = students.findIndex(i => i.id === over.id);
      if (oldIndexInFull !== -1 && newIndexInFull !== -1) {
        const newList = arrayMove(students, oldIndexInFull, newIndexInFull);
        try {
          await reorderStudents(newList.map(i => i.id));
          toast.success('Đã cập nhật thứ tự học sinh');
        } catch (error) {
          toast.error('Lỗi khi cập nhật thứ tự');
        }
      }
    } else {
      const oldIndexInFull = teachers.findIndex(i => i.id === active.id);
      const newIndexInFull = teachers.findIndex(i => i.id === over.id);
      if (oldIndexInFull !== -1 && newIndexInFull !== -1) {
        const newList = arrayMove(teachers, oldIndexInFull, newIndexInFull);
        try {
          await reorderTeachers(newList.map(i => i.id));
          toast.success('Đã cập nhật thứ tự giáo viên');
        } catch (error) {
          toast.error('Lỗi khi cập nhật thứ tự');
        }
      }
    }
  };

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

  const PAGE_SIZE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const [comboSearch, setComboSearch] = useState('');
  const [comboOpen, setComboOpen] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
    setComboSearch('');
    setAccountForm(f => ({ ...f, targetId: '' }));
  }, [activeTab]);

  useEffect(() => setCurrentPage(1), [search, yearFilter]);

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
    salaryRate: 0.8,
    salaryType: 'PERCENT',
    hourlyRate: 0,
    notes: '',
    sortOrder: 0,
    cccd: '',
    studentCode: ''
  });

  const { duplicatePreview, scanDuplicates, mergeStudents } = useCenterStore();

  useEffect(() => {
    if (activeTab !== 'STUDENTS' || isEditMode || !isAddModalOpen) {
      setDuplicateCandidates([]);
      setDuplicateDecision(null);
      return;
    }

    const { name, parentPhone, studentPhone, birthYear, cccd, studentCode } = formData;
    if (!name || name.length < 3) {
      setDuplicateCandidates([]);
      setDuplicateDecision(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDuplicates(true);
      try {
        const res = await duplicatePreview({ name, parentPhone, studentPhone, birthYear, cccd, studentCode });
        setDuplicateCandidates(res.candidates);
        setDuplicateDecision(res.decision);
      } catch (err) {
        console.error(err);
      } finally {
        setIsCheckingDuplicates(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [formData.name, formData.parentPhone, formData.studentPhone, formData.birthYear, formData.cccd, formData.studentCode, activeTab, isEditMode, isAddModalOpen, duplicatePreview]);

  const loadDuplicateGroups = async () => {
    setIsLoadingDuplicates(true);
    try {
      const groups = await scanDuplicates();
      setDuplicateGroups(groups);
    } catch (err) {
      toast.error('Lỗi khi quét học sinh trùng');
    } finally {
      setIsLoadingDuplicates(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeConfirm || !mergeReason) return;
    setIsMerging(true);
    try {
      const res = await mergeStudents(mergeConfirm.source.id, mergeConfirm.target.id, mergeReason);
      if (res.ok) {
        toast.success('Gộp học sinh thành công');
        setMergeConfirm(null);
        setMergeReason('');
        loadDuplicateGroups();
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi khi gộp học sinh');
      }
    } catch (err) {
      toast.error('Lỗi kết nối server');
    } finally {
      setIsMerging(false);
    }
  };

  const handleEdit = (item: any) => {
    setIsEditMode(true);
    setSelectedId(item.id);
    setFormData({
      name: item.name,
      birthYear: item.birthYear || 2010,
      address: item.address || '',
      schoolName: item.schoolName || '',
      schoolClass: item.schoolClass || '',
      parentPhone: item.parentPhone || '',
      studentPhone: item.studentPhone || '',
      phone: item.phone || '',
      specialization: item.specialization || '',
      bankAccount: item.bankAccount || '',
      bankName: item.bankName || '',
      salaryRate: item.salaryRate || 0.8,
      salaryType: item.salaryType || 'PERCENT',
      hourlyRate: item.hourlyRate || 0,
      notes: item.notes || '',
      sortOrder: item.sortOrder || 0
    });
    setIsAddModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmDelete({ id, title: name, type: 'PROFILE' });
  };

  const deleteProfileSafely = async (id: string) => {
    const kind = activeTab === 'STUDENTS' ? 'STUDENT' : 'TEACHER';
    const res = kind === 'STUDENT' ? await deleteStudent(id) : await deleteTeacher(id);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      toast.error(errorData.message || 'Không thể xóa hồ sơ');
      return false;
    }
    return true;
  };

  const executeDelete = () => {
    if (!confirmDelete) return;
    const { id, type } = confirmDelete;

    if (type === 'ACCOUNT') {
      deleteAccount(id);
      toast.success('Đã thu hồi quyền truy cập');
    } else if (id === 'BULK') {
      const idsToDelete = Array.from(selectedIds);
      void Promise.all(idsToDelete.map((itemId) => deleteProfileSafely(itemId))).then((results) => {
        const deletedCount = results.filter(Boolean).length;
        if (deletedCount > 0) toast.success(`Đã xóa ${deletedCount}/${idsToDelete.length} hồ sơ`);
        setSelectedIds(new Set());
      });
    } else {
      void deleteProfileSafely(id).then((deleted) => {
        if (deleted) toast.success(activeTab === 'STUDENTS' ? 'Đã xóa học sinh' : 'Đã xóa giáo viên');
      });
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

  const handleSave = async () => {
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
    let res: Response;

    try {
      if (activeTab === 'STUDENTS') {
        if (isEditMode && selectedId) {
          res = await updateStudent(selectedId, data as any);
          if (!res.ok) throw new Error((await res.json()).message || 'Lỗi khi cập nhật học sinh');
          toast.success('Đã cập nhật học sinh');
        } else {
          res = await addStudent({
            id: 'S' + Date.now(),
            ...(data as any),
            tuitionStatus: 'DEBT'
          });
          if (!res.ok) {
            if (res.status === 409) {
              const errData = await res.json().catch(() => ({}));
              const shouldForce = window.confirm(
                (errData.message || 'Học sinh có thể đã tồn tại.') + '\n\nTiếp tục tạo mới?'
              );
              if (!shouldForce) return;
              const forceRes = await addStudent({
                id: 'S' + Date.now(),
                ...(data as any),
                tuitionStatus: 'DEBT',
                forceCreate: true
              });
              if (!forceRes.ok) throw new Error((await forceRes.json()).message || 'Lỗi khi thêm học sinh');
            } else {
              throw new Error((await res.json()).message || 'Lỗi khi thêm học sinh');
            }
          }
          toast.success('Đã thêm học sinh mới');
        }
      } else {
        if (isEditMode && selectedId) {
          res = await updateTeacher(selectedId, data as any);
          if (!res.ok) throw new Error((await res.json()).message || 'Lỗi khi cập nhật giáo viên');
          toast.success('Đã cập nhật giáo viên');
        } else {
          res = await addTeacher({
            id: 'T' + Date.now(),
            ...(data as any)
          });
          if (!res.ok) throw new Error((await res.json()).message || 'Lỗi khi thêm giáo viên');
          toast.success('Đã thêm giáo viên mới');
        }
      }

      setIsAddModalOpen(false);
      setIsEditMode(false);
      setSelectedId(null);
      setFormErrors({});
      setFormData({ name: '', birthYear: 2010, address: '', schoolName: '', schoolClass: '', parentPhone: '', studentPhone: '', phone: '', specialization: '', bankAccount: '', bankName: '', salaryRate: 0.8, salaryType: 'PERCENT', hourlyRate: 0, notes: '', sortOrder: 0 });
    } catch (error: any) {
      console.error('Save failed:', error);
      toast.error(error.message || 'Không thể lưu thông tin. Vui lòng thử lại.');
    }
  };

  const filteredStudents = useMemo(() => 
    scopedStudents.filter(s => 
      (s.name.toLowerCase().includes(search.toLowerCase()) || 
      (s.studentCode || '').toLowerCase().includes(search.toLowerCase())) &&
      (yearFilter === '' || s.birthYear?.toString() === yearFilter)
    ).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  [scopedStudents, search, yearFilter]);

  const teacherTuitionByStudent = useMemo<Record<string, TeacherTuitionSnapshot>>(() => {
    if (!isTeacher) return {};
    const scopedStudentIds = new Set(scopedStudents.map((item) => item.id));

    const dueMap = new Map<string, number>();
    scopedStudents.forEach((student) => {
      const due = calculateStudentTuitionDue(student.id, teacherClasses, attendance, monthFilter);
      if (due > 0) dueMap.set(student.id, due);
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

  const filteredTeachers = useMemo(() => 
    scopedTeachers.filter(t => 
      t.name.toLowerCase().includes(search.toLowerCase())
    ).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  [scopedTeachers, search]);

  const activeList = activeTab === 'STUDENTS' ? filteredStudents : filteredTeachers;
  const totalPages = Math.ceil(activeList.length / PAGE_SIZE);
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const paginatedTeachers = filteredTeachers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);


  const handleExportExcel = () => {
    const rows = activeTab === 'STUDENTS' ? filteredStudents : filteredTeachers;
    exportCenterWorkbook(activeTab, rows);
    toast.success(rows.length === 0 ? 'Đã xuất file template Excel' : 'Đã xuất danh sách Excel');
  };

  const handleImportExcelLegacy = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsSyncing(true);
    try {
      let importedCount = 0;
      if (activeTab === 'STUDENTS') {
        const rows = await readCenterWorkbookRows(file);
        const result = normalizeCenterImportRows('STUDENTS', rows);
        if (result.validRows.length === 0) {
          toast.error(result.errors[0] || 'File Excel không có dữ liệu hợp lệ');
          return;
        }
        for (const row of result.validRows) {
          const res = await addStudent(row);
          if (res.ok) importedCount += 1;
        }
        if (result.errors.length > 0) {
          toast.success(`Đã nhập ${importedCount} dòng. Bỏ qua ${result.errors.length} dòng lỗi.`);
        } else {
          toast.success(`Đã nhập ${importedCount} hồ sơ từ Excel`);
        }
      } else if (activeTab === 'TEACHERS') {
        const rows = await readCenterWorkbookRows(file);
        const result = normalizeCenterImportRows('TEACHERS', rows);
        if (result.validRows.length === 0) {
          toast.error(result.errors[0] || 'File Excel không có dữ liệu hợp lệ');
          return;
        }
        for (const row of result.validRows) {
          const res = await addTeacher(row);
          if (res.ok) importedCount += 1;
        }
        if (result.errors.length > 0) {
          toast.success(`Đã nhập ${importedCount} dòng. Bỏ qua ${result.errors.length} dòng lỗi.`);
        } else {
          toast.success(`Đã nhập ${importedCount} hồ sơ từ Excel`);
        }
      }
      setIsImportOpen(false);
    } catch (error) {
      console.error('Excel import failed:', error);
      toast.error('Không thể đọc file Excel');
    } finally {
      setIsSyncing(false);
    }
  };
  void handleImportExcelLegacy;

  const handleImportExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsSyncing(true);
    try {
      const rows = await readCenterWorkbookRows(file);
      if (activeTab === 'STUDENTS') {
        const result = normalizeCenterImportRows('STUDENTS', rows);
        if (result.validRows.length === 0) {
          toast.error(result.errors[0] || 'File Excel không có dữ liệu hợp lệ');
          return;
        }
        setImportKind('STUDENTS');
        setImportPlan(planImport('STUDENTS', result.validRows, { students }, 'ADD_ONLY') as ImportPlan<StudentImportRow | TeacherImportRow>);
      } else {
        const result = normalizeCenterImportRows('TEACHERS', rows);
        if (result.validRows.length === 0) {
          toast.error(result.errors[0] || 'File Excel không có dữ liệu hợp lệ');
          return;
        }
        setImportKind('TEACHERS');
        setImportPlan(planImport('TEACHERS', result.validRows, { teachers }, 'ADD_ONLY') as ImportPlan<StudentImportRow | TeacherImportRow>);
      }
    } catch (error) {
      console.error('Excel import failed:', error);
      toast.error('Không thể đọc file Excel');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPlan) return;
    setIsSyncing(true);
    let importedCount = 0;
    try {
      for (const row of importPlan.commitRows) {
        let res: Response;
        if (importKind === 'STUDENTS') {
          const record = row.record as StudentImportRow;
          if (row.action === 'UPDATE' && record.id) res = await updateStudent(record.id, record);
          else res = await addStudent(record);
        } else {
          const record = row.record as TeacherImportRow;
          if (row.action === 'UPDATE' && record.id) res = await updateTeacher(record.id, record);
          else res = await addTeacher(record);
        }

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || `Lỗi khi xử lý dòng ${importedCount + 1}`);
        }

        importedCount += 1;
      }
      toast.success(`Đã nhập ${importedCount} hồ sơ từ Excel`);
      setImportPlan(null);
      setIsImportOpen(false);
    } catch (error: any) {
      console.error('Excel commit failed:', error);
      toast.error(error.message || 'Có dòng import bị lỗi khi ghi dữ liệu');
    } finally {
      setIsSyncing(false);
    }
  };


  const availableTeacherTargets = teachers.filter(t => !accounts.some(a => a.teacherId === t.id));
  const availableStudentTargets = students.filter(s => !accounts.some(a => a.studentId === s.id));
  const accountList = accounts.filter(a => activeTab === 'TEACHERS' ? a.role === 'TEACHER' : a.role === 'STUDENT');
  const availableForAccount = activeTab === 'TEACHERS' ? availableTeacherTargets : availableStudentTargets;
  const comboOptions = availableForAccount.filter(item =>
    item.name.toLowerCase().includes(comboSearch.toLowerCase())
  );

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
              <button onClick={() => { setIsAddModalOpen(false); setIsEditMode(false); }} className="text-slate-500 hover:text-hicado-navy transition-colors">
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
                
                {/* Duplicate Warning */}
                {!isEditMode && duplicateCandidates.length > 0 && (
                  <div className={clsx(
                    "mt-3 p-4 rounded-2xl border animate-in slide-in-from-top-2 duration-300",
                    duplicateDecision === 'MATCH_EXISTING' ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{duplicateDecision === 'MATCH_EXISTING' ? '🚨' : '⚠️'}</span>
                      <p className={clsx(
                        "text-[10px] font-black uppercase tracking-widest",
                        duplicateDecision === 'MATCH_EXISTING' ? "text-rose-700" : "text-amber-700"
                      )}>
                        {duplicateDecision === 'MATCH_EXISTING' ? 'Phát hiện học sinh trùng lặp' : 'Học sinh có thể đã tồn tại'}
                      </p>
                      {isCheckingDuplicates && <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin ml-auto" />}
                    </div>
                    <div className="space-y-2">
                      {duplicateCandidates.map((c: any) => (
                        <div key={c.studentId} className="flex justify-between items-center bg-white/60 p-2 rounded-xl border border-white/80">
                          <div>
                            <p className="text-xs font-black text-hicado-navy">{c.name} {c.birthYear ? `(${c.birthYear})` : ''}</p>
                            <p className="text-[9px] text-slate-500 font-bold">ID: {c.studentCode || c.studentId.slice(-6).toUpperCase()}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.reasons.map((r: string, i: number) => (
                                <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-black uppercase tracking-tight">{r}</span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={clsx(
                              "text-[10px] font-black",
                              c.score >= 90 ? "text-rose-600" : "text-amber-600"
                            )}>{c.score}% Match</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-500 mt-2 italic font-medium">Vui lòng kiểm tra kỹ trước khi tạo mới để tránh trùng dữ liệu.</p>
                  </div>
                )}
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
                        placeholder="VD: Lớp 9A1"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SĐT Phụ huynh</label>
                      <input
                        type="tel"
                        value={formData.parentPhone}
                        onChange={e => setFormData({ ...formData, parentPhone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none"
                        placeholder="0901234567"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SĐT Học sinh</label>
                      <input
                        type="tel"
                        value={formData.studentPhone}
                        onChange={e => setFormData({ ...formData, studentPhone: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none"
                        placeholder="0901234567"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ghi chú</label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm focus:ring-2 focus:ring-management-blue/20 outline-none min-h-[80px] resize-none"
                      placeholder="Thông tin thêm về học sinh..."
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loại lương</label>
                      <select
                        value={formData.salaryType || 'PERCENT'}
                        onChange={e => setFormData({ ...formData, salaryType: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm outline-none"
                      >
                        <option value="PERCENT">Phần trăm (%)</option>
                        <option value="HOURLY">Theo giờ (VND/h)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {formData.salaryType === 'HOURLY' ? 'Mức lương/giờ' : 'Tỉ lệ chia (0-1)'}
                      </label>
                      <input
                        type="number"
                        value={formData.salaryType === 'HOURLY' ? (formData.hourlyRate || 0) : (formData.salaryRate || 0.8)}
                        onChange={e => setFormData({ ...formData, [formData.salaryType === 'HOURLY' ? 'hourlyRate' : 'salaryRate']: Number(e.target.value) })}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm outline-none"
                        step={formData.salaryType === 'HOURLY' ? '1000' : '0.05'}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ghi chú</label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm outline-none min-h-[80px] resize-none"
                      placeholder="Thông tin thêm về giáo viên..."
                    />
                  </div>
                </>
              )}
            </div>
            <div className="p-6 md:p-8 bg-hicado-slate/20 flex gap-4 shrink-0 border-t border-hicado-slate">
              <button 
                onClick={() => { setIsAddModalOpen(false); setIsEditMode(false); }}
                className="flex-1 px-4 md:px-6 py-3 md:py-4 rounded-2xl font-black text-slate-500 hover:bg-white transition-all uppercase text-[10px] md:text-xs tracking-widest border border-transparent hover:border-hicado-slate"
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
              className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'STUDENTS' ? 'bg-hicado-navy text-white shadow-xl' : 'text-slate-500 hover:text-hicado-navy'}`}
            >
              Học sinh
            </button>
            {isStaff && (
              <button 
                onClick={() => setActiveTab('TEACHERS')}
                className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'TEACHERS' ? 'bg-hicado-navy text-white shadow-xl' : 'text-slate-500 hover:text-hicado-navy'}`}
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
                  Nhập Excel
                </button>
                <button
                  onClick={handleExportExcel}
                  className="flex-1 sm:flex-none bg-white text-hicado-navy px-5 py-2.5 rounded-xl font-black border border-hicado-slate text-[10px] uppercase tracking-widest"
                >
                  Xuất Excel
                </button>
                <button 
                  onClick={() => { setIsAddModalOpen(true); setIsEditMode(false); setFormData({ name: '', birthYear: 2010, address: '', schoolName: '', schoolClass: '', parentPhone: '', studentPhone: '', phone: '', specialization: '', bankAccount: '', bankName: '', salaryRate: 0.8, salaryType: 'PERCENT', hourlyRate: 0, notes: '', sortOrder: 0 }); }}
                  className="flex-1 sm:flex-none bg-hicado-navy text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-hicado-navy/20"
                >
                  Thêm mới
                </button>
                {activeTab === 'STUDENTS' && (
                  <button 
                    onClick={() => { setIsDuplicateDashboardOpen(true); loadDuplicateGroups(); }}
                    className="flex-1 sm:flex-none bg-amber-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-amber-500/20"
                  >
                    Xử lý trùng
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-3xl border border-hicado-slate shadow-premium flex flex-wrap gap-4 items-center">
          <div className="flex-1 relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">
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
              className="bg-hicado-slate/20 border border-transparent px-6 py-4 rounded-2xl text-sm font-black text-slate-600 focus:outline-none focus:bg-white focus:border-hicado-slate transition-all"
            >
              <option value="">Năm sinh</option>
              {[2009, 2010, 2011, 2012, 2013, 2014, 2015].map(y => <option key={y} value={y.toString()}>{y}</option>)}
            </select>

          {activeTab === 'STUDENTS' && isTeacher && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Tháng học phí
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
          <div className="bg-emerald-900/5 border border-emerald-200 p-8 rounded-2xl flex flex-col md:flex-row gap-6 items-center justify-between animate-in fade-in slide-in-from-top-4">
            <div className="flex-1 space-y-2">
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Import Excel</p>
              <p className="text-xs font-bold text-hicado-navy/50">
                Dùng file Excel .xls đã xuất từ nút Xuất Excel. Nếu danh sách đang trống, file xuất ra sẽ là template mẫu.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleImportExcel}
                className="hidden"
              />
            </div>
            <button onClick={() => fileInputRef.current?.click()} disabled={isSyncing} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold uppercase text-xs">
              {isSyncing ? 'Đang nhập...' : 'Chọn file Excel'}
            </button>
          </div>
        )}

        {isStaff && (
          <div className="bg-white p-10 rounded-[3rem] shadow-sm relative overflow-hidden border border-slate-200">
            <div className="absolute top-0 right-0 w-64 h-64 bg-hicado-emerald/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
            
            <div className="relative z-10 space-y-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-3">Hệ thống an ninh & Truy cập</p>
                  <h3 className="text-3xl font-black uppercase tracking-tight italic text-slate-800">Quản lý định danh {activeTab === 'TEACHERS' ? 'Giáo viên' : 'Học sinh'}</h3>
                </div>
                <div className="flex gap-3">
                  <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Độ phủ tài khoản</p>
                    <p className="text-xl font-black italic">{accounts.filter(a => activeTab === 'TEACHERS' ? a.role === 'TEACHER' : a.role === 'STUDENT').length} / {(activeTab === 'TEACHERS' ? teachers : students).length}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Create Form */}
                <div className="lg:col-span-1 bg-slate-50 border border-slate-200 p-8 rounded-[2rem] space-y-6">
                   <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-widest">Cấp quyền truy cập mới</p>
                   <div className="space-y-4">
                     <div className="space-y-2">
                       <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Chọn đối tượng</label>
                       <div className="relative">
                        <input
                          type="text"
                          value={comboSearch}
                          onChange={e => { setComboSearch(e.target.value); setComboOpen(true); setAccountForm(f => ({ ...f, targetId: '' })); }}
                          onFocus={() => setComboOpen(true)}
                          onBlur={() => setTimeout(() => setComboOpen(false), 150)}
                          placeholder="Gõ tên để tìm kiếm..."
                          className="w-full border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-hicado-emerald"
                        />
                        {comboOpen && comboOptions.length > 0 && (
                          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                            {comboOptions.map(item => (
                              <button key={item.id} type="button"
                                onMouseDown={() => { setAccountForm(f => ({ ...f, targetId: item.id })); setComboSearch(item.name); setComboOpen(false); }}
                                className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-hicado-slate/20 first:rounded-t-xl last:rounded-b-xl">
                                {item.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {accountForm.targetId && (
                          <p className="text-[10px] text-hicado-emerald font-bold mt-1">✓ Đã chọn ID: {accountForm.targetId.slice(0,8)}…</p>
                        )}
                      </div>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Username</label>
                          <input
                            type="text"
                            value={accountForm.username}
                            onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-hicado-emerald transition-all"
                            placeholder="vd: user123"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
                          <input
                            type="password"
                            value={accountForm.password}
                            onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-hicado-emerald transition-all"
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
                <div className="lg:col-span-2 bg-slate-50 border border-slate-200 p-8 rounded-[2rem]">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 ml-1">Danh bạ tài khoản hiện hành</p>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {accountList.length === 0 && (
                      <div className="col-span-2 py-10 text-center opacity-30 italic text-xs">Chưa có tài khoản nào được cấp</div>
                    )}
                    {accountList.map((acc) => (
                      <div key={acc.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex justify-between items-center group hover:bg-slate-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg flex items-center justify-center font-black text-[10px]">
                            {acc.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight">{acc.username}</p>
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{acc.name}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 transition-all">
                          <button 
                            onClick={() => {
                              setSelectedAccount(acc);
                              setIsAccountModalOpen(true);
                            }}
                            className="p-2 text-slate-500 hover:text-hicado-emerald hover:bg-slate-100 rounded-lg transition-all"
                            title="Đổi mật khẩu"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                          </button>
                          <button 
                            onClick={() => setConfirmDelete({ id: acc.id, title: acc.username, type: 'ACCOUNT' })}
                            className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
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
            <div className="text-6xl grayscale opacity-30">📁</div>
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest italic">
              Không tìm thấy hồ sơ nào phù hợp
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-hicado-slate/10 border-b border-hicado-slate">
                <th className="px-4 py-5 w-8"></th>
                <th className="px-8 py-5 w-10">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 rounded border-slate-300 text-hicado-navy focus:ring-hicado-navy"
                    checked={activeTab === 'STUDENTS' ? (filteredStudents.length > 0 && selectedIds.size === filteredStudents.length) : (filteredTeachers.length > 0 && selectedIds.size === filteredTeachers.length)}
                    onChange={() => toggleSelectAll((activeTab === 'STUDENTS' ? filteredStudents : filteredTeachers).map(i => i.id))}
                  />
                </th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Hồ sơ chính</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Truy cập</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Định danh</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{activeTab === 'STUDENTS' ? 'Học vấn & Vị trí' : 'Chuyên môn'}</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Hành vụ</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Điều hướng</th>
              </tr>
            </thead>
            <SortableContext
              items={activeTab === 'STUDENTS' ? paginatedStudents.map(s => s.id) : paginatedTeachers.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody className="divide-y divide-slate-100">
                {activeTab === 'STUDENTS' ? paginatedStudents.map(student => (
                  <SortableRow key={student.id} id={student.id}>
                    <StudentRowContent 
                      student={student} 
                      selectedIds={selectedIds} 
                      toggleSelect={toggleSelect}
                      accounts={accounts}
                      getStudentTuitionSnapshot={getStudentTuitionSnapshot}
                      isTeacher={isTeacher}
                      setViewingStoryId={setViewingStoryId}
                      isStaff={isStaff}
                      handleEdit={handleEdit}
                      handleDelete={handleDelete}
                    />
                  </SortableRow>
                )) : paginatedTeachers.map(teacher => (
                  <SortableRow key={teacher.id} id={teacher.id}>
                    <TeacherRowContent
                      teacher={teacher}
                      selectedIds={selectedIds}
                      toggleSelect={toggleSelect}
                      accounts={accounts}
                      isStaff={isStaff}
                      handleEdit={handleEdit}
                      handleDelete={handleDelete}
                    />
                  </SortableRow>
                ))}
              </tbody>
            </SortableContext>
          </table>
          </DndContext>
        )}

        {/* Pagination Bar */}
        {!isLoading && totalPages > 1 && (
          <div className="px-8 py-5 border-t border-slate-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              Hiển thị {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, activeList.length)} trên {activeList.length} bản ghi
            </p>
            <div className="flex items-center gap-1">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, i, arr) => (
                  <div key={p} className="flex items-center">
                    {i > 0 && p - arr[i-1] > 1 && <span className="px-2 text-slate-300">...</span>}
                    <button 
                      onClick={() => setCurrentPage(p)}
                      className={clsx(
                        "w-8 h-8 rounded-lg text-xs font-black transition-all",
                        currentPage === p ? "bg-hicado-navy text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      {p}
                    </button>
                  </div>
                ))
              }

              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </button>
            </div>
          </div>
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

      <ImportPreviewModal
        isOpen={!!importPlan}
        title={importKind === 'STUDENTS' ? 'Nhập danh sách học sinh' : 'Nhập danh sách giáo viên'}
        plan={importPlan}
        isCommitting={isSyncing}
        onConfirm={handleConfirmImport}
        onCancel={() => setImportPlan(null)}
        onExportErrors={handleExportExcel}
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

      {/* Duplicate Dashboard Modal */}
      {isDuplicateDashboardOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[160] flex items-center justify-center p-4">
          <div className="bg-hicado-slate/10 rounded-[3rem] shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh] border border-white/20">
            <div className="p-8 border-b border-hicado-slate flex justify-between items-center shrink-0 bg-white/40">
              <div>
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.4em] mb-1">Dữ liệu thông minh</p>
                <h3 className="text-2xl font-black text-hicado-navy uppercase tracking-tight">Xử lý học sinh trùng lặp</h3>
              </div>
              <button onClick={() => setIsDuplicateDashboardOpen(false)} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-500 hover:text-rose-500 transition-all shadow-sm border border-hicado-slate hover:rotate-90">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              {isLoadingDuplicates ? (
                <div className="py-20 text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-hicado-navy/10 border-t-hicado-navy rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-black text-hicado-navy/40 uppercase tracking-widest">Đang quét toàn bộ hệ thống...</p>
                </div>
              ) : duplicateGroups.length === 0 ? (
                <div className="py-20 text-center space-y-4 bg-white/40 rounded-[2.5rem] border border-dashed border-hicado-slate">
                  <div className="text-6xl opacity-20">🎉</div>
                  <h4 className="text-lg font-black text-hicado-navy uppercase tracking-tight">Tuyệt vời!</h4>
                  <p className="text-sm text-slate-500 font-medium">Không phát hiện học sinh trùng lặp nào cần xử lý.</p>
                  <button onClick={loadDuplicateGroups} className="px-6 py-2 bg-hicado-navy text-white rounded-xl text-[10px] font-black uppercase tracking-widest mt-4">Quét lại</button>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="bg-amber-50 border border-amber-200 p-6 rounded-[2rem] flex items-start gap-4">
                    <span className="text-2xl">💡</span>
                    <div className="space-y-1">
                      <p className="text-xs font-black text-amber-800 uppercase tracking-wider">Hướng dẫn gộp hồ sơ</p>
                      <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                        Chọn học sinh "Nguồn" (bản thừa) và gộp vào học sinh "Đích" (bản chính). 
                        Toàn bộ lịch sử điểm danh, thanh toán, lớp học của bản Nguồn sẽ được chuyển sang bản Đích. 
                        Bản Nguồn sau đó sẽ bị vô hiệu hóa. <b>Hành động này không thể hoàn tác.</b>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {duplicateGroups.map((group, idx) => (
                      <div key={idx} className="bg-white rounded-[2.5rem] border border-hicado-slate overflow-hidden shadow-sm hover:shadow-premium transition-all duration-500">
                        <div className="p-6 bg-hicado-slate/20 border-b border-hicado-slate flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-hicado-navy text-white rounded-xl flex items-center justify-center font-black">{group.primary.name.charAt(0)}</div>
                            <div>
                              <p className="text-sm font-black text-hicado-navy uppercase">{group.primary.name}</p>
                              <p className="text-[10px] text-slate-500 font-bold">ID: {group.primary.studentCode || group.primary.id.slice(-8)} · Sinh năm: {group.primary.birthYear}</p>
                            </div>
                          </div>
                          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest">Phát hiện {group.others.length} bản trùng</span>
                        </div>
                        <div className="p-6 space-y-4">
                          {group.others.map((other: any) => (
                            <div key={other.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200 hover:border-hicado-emerald transition-colors">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <p className="text-xs font-black text-slate-700 uppercase">{other.name}</p>
                                  <span className={clsx(
                                    "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter",
                                    other.score >= 90 ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"
                                  )}>{other.score}% MATCH</span>
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium mt-1">
                                  Lý do: {other.reasons.join(', ')}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => setMergeConfirm({ source: other, target: group.primary })}
                                  className="px-4 py-2 bg-hicado-navy text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-hicado-emerald hover:text-hicado-navy transition-all"
                                >Gộp vào chính</button>
                                <button 
                                  onClick={() => setMergeConfirm({ source: group.primary, target: other })}
                                  className="px-4 py-2 border border-hicado-navy text-hicado-navy rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                                >Đảo chiều gộp</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Merge Confirmation Modal */}
      {mergeConfirm && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-lg z-[170] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-[2rem] flex items-center justify-center text-3xl mx-auto animate-bounce">🤝</div>
              <div className="space-y-2">
                <h4 className="text-xl font-black text-hicado-navy uppercase tracking-tight">Xác nhận gộp học sinh</h4>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  Bạn đang gộp <span className="text-rose-500 font-black">[{mergeConfirm.source.name}]</span> vào <span className="text-hicado-emerald font-black">[{mergeConfirm.target.name}]</span>.
                </p>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4 text-left">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lý do gộp (Lưu nhật ký)</label>
                  <textarea 
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                    placeholder="VD: Trùng tên & SĐT, đăng ký 2 lần..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-hicado-navy min-h-[80px] resize-none font-medium"
                  />
                </div>
                <div className="flex items-center gap-3 p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
                  <span className="text-lg">⚠️</span>
                  <p className="text-[10px] font-bold uppercase tracking-tighter">Hồ sơ [{mergeConfirm.source.name}] sẽ bị vô hiệu hóa vĩnh viễn.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => { setMergeConfirm(null); setMergeReason(''); }}
                  disabled={isMerging}
                  className="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-50 transition-all uppercase text-xs tracking-widest"
                >Hủy bỏ</button>
                <button 
                  onClick={handleMerge}
                  disabled={isMerging || !mergeReason}
                  className="flex-1 bg-hicado-navy text-white py-4 rounded-2xl font-black shadow-xl shadow-hicado-navy/20 hover:translate-y-[-2px] transition-all uppercase text-xs tracking-widest disabled:opacity-40"
                >
                  {isMerging ? 'Đang xử lý...' : 'Xác nhận gộp'}
                </button>
              </div>
            </div>
          </div>
        </div>
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
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
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
                className="flex-1 py-4 rounded-2xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200"
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
  const totalTuition = calculateStudentTuitionDue(studentId, studentClasses, attendance);

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
                    <span>{sumPresentSessionUnits(attendance.filter(a => a.studentId === studentId && a.classId === cls.id))}/{cls.totalSessions} ca</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-management-blue transition-all duration-1000" 
                        style={{ width: `${(sumPresentSessionUnits(attendance.filter(a => a.studentId === studentId && a.classId === cls.id)) / cls.totalSessions) * 100}%` }}
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

const SortableRow = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.6 : 1,
    position: 'relative' as const,
  };

  return (
    <tr ref={setNodeRef} style={style} className={clsx("hover:bg-slate-50/50 transition-colors group")}>
      <td className="px-4 py-4 w-8">
        <button {...attributes} {...listeners} className="p-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-hicado-navy transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16"></path></svg>
        </button>
      </td>
      {children}
    </tr>
  );
};

const StudentRowContent = ({ student, selectedIds, toggleSelect, accounts, getStudentTuitionSnapshot, setViewingStoryId, isStaff, handleEdit, handleDelete }: any) => {
  const account = accounts.find((a: any) => a.studentId === student.id);
  const tuition = getStudentTuitionSnapshot(student.id, student.tuitionStatus);
  return (
    <>
      <td className="px-8 py-4">
        <input 
          type="checkbox"
          className="w-4 h-4 rounded border-slate-300 text-hicado-navy focus:ring-hicado-navy"
          checked={selectedIds.has(student.id)}
          onChange={() => toggleSelect(student.id)}
        />
      </td>
      <td className="px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-hicado-slate flex items-center justify-center font-black text-hicado-navy text-xs shrink-0 group-hover:scale-110 transition-transform shadow-sm">
            {student.name.charAt(0)}
          </div>
          <div>
            <p className="font-black text-hicado-navy text-sm tracking-tight">{student.name}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{student.studentCode || 'Chưa có mã'}</p>
          </div>
        </div>
      </td>
      <td className="px-8 py-4">
        {account ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span>
            <div>
              <p className="text-[11px] font-black text-slate-600 uppercase tracking-tight">{account.username}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-200"></span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Chưa cấp</span>
          </div>
        )}
      </td>
      <td className="px-8 py-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">🆔</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{student.parentPhone || 'N/A'}</span>
          </div>
          {student.zaloUserId ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs">💬</span>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Đã khớp Zalo</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 opacity-30">
              <span className="text-xs">💬</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chưa khớp</span>
            </div>
          )}
        </div>
      </td>
      <td className="px-8 py-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-slate-600">{student.schoolClass || 'Khối'}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span className="text-[11px] font-bold text-slate-500">{student.schoolName || 'Trường'}</span>
          </div>
          <div className={clsx(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
            tuition.status === 'PAID' ? "bg-emerald-50 text-emerald-600" :
            tuition.status === 'DEBT' ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
          )}>
            {tuition.status === 'PAID' ? 'Đã nộp' : tuition.status === 'DEBT' ? 'Còn nợ' : 'Chưa nộp'}
            <span className="opacity-40">·</span>
            {new Intl.NumberFormat('vi-VN').format(tuition.due)}đ
          </div>
        </div>
      </td>
      <td className="px-8 py-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); setViewingStoryId(student.id); }} className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors" title="Nhật ký học tập">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
          </button>
          {isStaff && (
            <>
              <button onClick={(e) => { e.stopPropagation(); handleEdit(student); }} className="p-2 rounded-xl bg-hicado-navy/5 text-hicado-navy hover:bg-hicado-navy/10 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(student.id, student.name); }} className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </>
          )}
        </div>
      </td>
      <td className="px-8 py-4 text-right">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-hicado-slate/30 text-hicado-navy/40 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-hicado-navy group-hover:text-white transition-all cursor-pointer">
          Chi tiết
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </div>
      </td>
    </>
  );
};

const TeacherRowContent = ({ teacher, selectedIds, toggleSelect, accounts, isStaff, handleEdit, handleDelete }: any) => {
  const account = accounts.find((a: any) => a.teacherId === teacher.id);
  return (
    <>
      <td className="px-8 py-4">
        <input 
          type="checkbox"
          className="w-4 h-4 rounded border-slate-300 text-hicado-navy focus:ring-hicado-navy"
          checked={selectedIds.has(teacher.id)}
          onChange={() => toggleSelect(teacher.id)}
        />
      </td>
      <td className="px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center font-black text-indigo-600 text-xs shrink-0 group-hover:scale-110 transition-transform shadow-sm">
            {teacher.name.charAt(0)}
          </div>
          <div>
            <p className="font-black text-hicado-navy text-sm tracking-tight">{teacher.name}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{teacher.phone}</p>
          </div>
        </div>
      </td>
      <td className="px-8 py-4">
        {account ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span>
            <div>
              <p className="text-[11px] font-black text-slate-600 uppercase tracking-tight">{account.username}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-200"></span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Chưa cấp</span>
          </div>
        )}
      </td>
      <td className="px-8 py-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">📞</span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{teacher.phone}</span>
          </div>
          {teacher.zaloUserId ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs">💬</span>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Đã khớp Zalo</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 opacity-30">
              <span className="text-xs">💬</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chưa khớp</span>
            </div>
          )}
        </div>
      </td>
      <td className="px-8 py-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-black text-slate-600">{teacher.specialization || 'Chuyên môn'}</p>
          <div className="inline-flex items-center px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
            {teacher.salaryType === 'HOURLY' ? `${(teacher.hourlyRate/1000)}k/h` : `HS: ${teacher.salaryRate * 100}%`}
          </div>
        </div>
      </td>
      <td className="px-8 py-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isStaff && (
            <>
              <button onClick={(e) => { e.stopPropagation(); handleEdit(teacher); }} className="p-2 rounded-xl bg-hicado-navy/5 text-hicado-navy hover:bg-hicado-navy/10 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(teacher.id, teacher.name); }} className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </button>
            </>
          )}
        </div>
      </td>
      <td className="px-8 py-4 text-right">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-hicado-slate/30 text-hicado-navy/40 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-hicado-navy group-hover:text-white transition-all cursor-pointer">
          Chi tiết
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </div>
      </td>
    </>
  );
};