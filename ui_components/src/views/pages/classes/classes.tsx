import { ChangeEvent, useRef, useState } from 'react';
import { useCenterStore, useAuthStore } from '@/store';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { exportToCSV } from '@/utils/export';
import FocusLock from 'react-focus-lock';
import {
  exportCenterWorkbook,
  normalizeCenterImportRows,
  readCenterWorkbookRows,
  type ClassImportRow,
} from '@/utils/center-spreadsheet';
import { downloadXlsxWorkbook } from '@/utils/excel-workbook';
import { buildImportErrorRows, planImport, type ImportPlan } from '@/utils/import-planner';
import { ImportPreviewModal } from '@/views/components/import-preview-modal';

const classSchema = z.object({
  name: z.string().min(3, 'Tên lớp quá ngắn'),
  teacherId: z.string().min(1, 'Vui lòng chọn giáo viên'),
  roomId: z.string().min(1, 'Vui lòng chọn phòng học'),
  tuitionPerSession: z.coerce.number().min(0, 'Học phí không hợp lệ'),
  totalSessions: z.coerce.number().min(1, 'Số buổi không hợp lệ'),
  teacherShare: z.coerce.number().min(0).max(100),
  schedule: z.object({
    days: z.array(z.string()).min(1, 'Chọn ít nhất 1 ngày học'),
    time: z.string().min(5, 'Giờ học không hợp lệ')
  })
});

const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

export const Classes = () => {
  const { classes, teachers, rooms, students, addClass, updateClass, deleteClass, attendance } = useCenterStore();
  const { auth } = useAuthStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [viewingClassStudentsId, setViewingClassStudentsId] = useState<string | null>(null);
  const [viewingStoryId, setViewingStoryId] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan<ClassImportRow> | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    teacherId: '',
    roomId: '',
    tuitionPerSession: 0,
    totalSessions: 12,
    studentIds: [] as string[],
    teacherShare: 80,
    schedule: { days: [] as string[], time: '18:00 - 20:00' }
  });

  const isTeacher = auth?.role === 'TEACHER';
  const visibleTeachers = isTeacher ? teachers.filter(t => t.id === auth.teacherId) : teachers;
  const visibleClasses = isTeacher ? classes.filter(c => c.teacherId === auth.teacherId) : classes;
  const visibleStudents = students;

  const resetForm = () => setFormData({ name: '', teacherId: '', roomId: '', tuitionPerSession: 0, totalSessions: 12, studentIds: [], teacherShare: 80, schedule: { days: [], time: '18:00 - 20:00' } });

  const handleSave = () => {
    const result = classSchema.safeParse(formData);
    if (!result.success) {
      toast.error('Kiểm tra lại thông tin lớp học');
      return;
    }
    const data = result.data;
    if (isEditMode && editingId) {
      updateClass(editingId, { ...formData, ...data });
      toast.success('Đã cập nhật lớp học');
    } else {
      addClass({ ...formData, ...data, id: 'C' + Date.now() });
      toast.success('Đã khởi tạo lớp học mới');
    }
    setIsModalOpen(false);
    resetForm();
  };

  const handleExportLegacy = () => {
    const exportData = visibleClasses.map(cls => ({
      'Tên Lớp': cls.name,
      'Giáo Viên': teachers.find(t => t.id === cls.teacherId)?.name || 'N/A',
      'Phòng': rooms.find(r => r.id === cls.roomId)?.name || 'N/A',
      'Học Phí/Buổi': cls.tuitionPerSession.toLocaleString(),
      'Sĩ Số': cls.studentIds.length,
      'Lịch Học': `${cls.schedule?.days.join(', ')} | ${cls.schedule?.time}`
    }));
    exportToCSV(exportData, 'Danh_Sach_Lop_Hoc');
    toast.success('Đã xuất file báo cáo');
  };
  void handleExportLegacy;

  const handleExport = () => {
    exportCenterWorkbook('CLASSES', visibleClasses, { teachers, rooms, students });
    toast.success(visibleClasses.length === 0 ? 'Đã xuất template lớp học' : 'Đã xuất danh sách lớp học');
  };

  const handleImportExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsImporting(true);
    try {
      const rows = await readCenterWorkbookRows(file);
      const result = normalizeCenterImportRows('CLASSES', rows, { teachers, rooms, students });
      if (result.validRows.length === 0) {
        toast.error(result.errors[0] || 'File Excel không có dữ liệu lớp hợp lệ');
        return;
      }
      setImportPlan(planImport('CLASSES', result.validRows, { teachers, rooms, students, classes }, 'ADD_ONLY'));
    } catch (error) {
      console.error('Class import failed:', error);
      toast.error('Không thể đọc file Excel');
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPlan) return;
    setIsImporting(true);
    let imported = 0;
    try {
      for (const row of importPlan.commitRows) {
        const record = row.record;
        if (row.action === 'UPDATE' && record.id) await updateClass(record.id, record);
        else await addClass(record);
        imported += 1;
      }
      toast.success(`Đã nhập ${imported} lớp học từ Excel`);
      setImportPlan(null);
    } catch (error) {
      console.error('Class commit failed:', error);
      toast.error('Có dòng lớp học bị lỗi khi ghi dữ liệu');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportImportErrors = () => {
    if (!importPlan) return;
    downloadXlsxWorkbook({
      fileName: `Bao_Cao_Loi_CLASSES_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetName: 'Loi import',
      rows: buildImportErrorRows('CLASSES', importPlan),
    });
  };

  const handleEdit = (cls: any) => {
    setIsEditMode(true);
    setEditingId(cls.id);
    setFormData({
      name: cls.name,
      teacherId: cls.teacherId,
      roomId: cls.roomId || '',
      tuitionPerSession: cls.tuitionPerSession,
      totalSessions: cls.totalSessions,
      studentIds: cls.studentIds,
      teacherShare: cls.teacherShare != null ? Math.round(cls.teacherShare * 100) : 80,
      schedule: cls.schedule || { days: [], time: '18:00 - 20:00' }
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc muốn xóa lớp học này?')) deleteClass(id);
  };

  const toggleDay = (day: string) => {
    const days = [...formData.schedule.days];
    const index = days.indexOf(day);
    if (index > -1) days.splice(index, 1);
    else days.push(day);
    setFormData({ ...formData, schedule: { ...formData.schedule, days } });
  };

  const toggleStudent = (studentId: string) => {
    const ids = [...formData.studentIds];
    const index = ids.indexOf(studentId);
    if (index > -1) ids.splice(index, 1);
    else ids.push(studentId);
    setFormData({ ...formData, studentIds: ids });
  };

  const getAttendanceStats = (classId: string) => {
    const classAttendance = attendance.filter(a => a.classId === classId);
    const dates = Array.from(new Set(classAttendance.map(a => a.date))).sort();
    return dates.map(date => {
      const records = classAttendance.filter(a => a.date === date);
      const present = records.filter(r => r.status === 'PRESENT').length;
      const percent = records.length > 0 ? (present / records.length) * 100 : 0;
      let color = 'bg-hicado-slate';
      if (percent >= 100) color = 'bg-hicado-emerald shadow-lg shadow-hicado-emerald/20';
      else if (percent >= 75) color = 'bg-amber-400 shadow-lg shadow-amber-400/20';
      else if (percent >= 50) color = 'bg-orange-400 shadow-lg shadow-orange-400/20';
      else if (percent > 0) color = 'bg-rose-500 shadow-lg shadow-rose-500/20';
      return { date, percent, color };
    });
  };

  const inputCls = 'w-full bg-hicado-slate/20 border border-transparent px-5 py-3 rounded-2xl text-sm font-bold text-hicado-navy placeholder:text-hicado-navy/20 outline-none focus:bg-white focus:border-hicado-navy/30 focus:ring-4 focus:ring-hicado-navy/5 transition-all';
  const selectCls = `${inputCls} cursor-pointer`;

  return (
    <div className="space-y-8 pb-24 md:pb-8 animate-in fade-in duration-700 relative">

      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-hicado-slate shadow-premium overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-hicado-navy/5 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="space-y-4 relative z-10">
          <div className="flex items-center gap-2 text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.3em]">
            <span>Hệ thống vận hành</span>
            <span className="opacity-30">/</span>
            <span className="text-hicado-navy">Lớp học</span>
          </div>
          <h2 className="text-4xl font-serif font-black text-hicado-navy tracking-tight">Cấu trúc Lớp học</h2>
          <p className="text-hicado-navy/40 text-sm font-bold uppercase tracking-widest leading-relaxed max-w-2xl">
            Quản lý sĩ số, thời khóa biểu và tối ưu hóa tài nguyên giảng dạy.
          </p>
        </div>
        {!isTeacher && (
          <div className="flex gap-3 relative z-10">
            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleImportExcel} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-hicado-emerald/10 text-hicado-emerald px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-hicado-emerald/20 transition-all border border-hicado-emerald/20">
              Nhập Excel
            </button>
            <button onClick={handleExport} className="bg-hicado-slate/20 text-hicado-navy px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-hicado-slate transition-all border border-hicado-slate/50">
              Xuất Báo Cáo
            </button>
            <button
              onClick={() => { setIsModalOpen(true); setIsEditMode(false); resetForm(); }}
              className="bg-hicado-navy text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-hicado-navy/20 hover:scale-105 transition-all flex items-center gap-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              Tạo lớp mới
            </button>
          </div>
        )}
      </div>

      {/* Class Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
        {visibleClasses.map((cls) => {
          const room = rooms.find(r => r.id === cls.roomId);
          const capacity = room?.capacity || 0;
          return (
            <div key={cls.id} className="bg-white border border-hicado-slate rounded-[2rem] p-8 shadow-premium hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 group flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-hicado-navy/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700" />

              <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="space-y-2">
                  <h4 className="text-xl font-serif font-black text-hicado-navy uppercase tracking-tight group-hover:text-hicado-emerald transition-colors leading-tight">{cls.name}</h4>
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${cls.studentIds.length > 0 ? 'bg-hicado-emerald shadow-[0_0_8px_#10b981]' : 'bg-hicado-slate'}`} />
                    <span className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">
                      {cls.studentIds.length}/{capacity || '--'} Slots · {room?.center || 'Hicado'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setViewingHistoryId(cls.id)} className="p-2 text-hicado-navy/30 hover:text-hicado-navy hover:bg-hicado-slate rounded-xl transition-all" title="Chuyên cần">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </button>
                  <button onClick={() => setViewingClassStudentsId(cls.id)} className="p-2 text-hicado-navy/30 hover:text-hicado-navy hover:bg-hicado-slate rounded-xl transition-all" title="Học sinh">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 py-6 border-y border-hicado-slate/50 mb-6 relative z-10">
                <div className="w-12 h-12 bg-hicado-navy rounded-2xl flex items-center justify-center font-serif text-white font-black text-lg shadow-xl shadow-hicado-navy/20">
                  {teachers.find(t => t.id === cls.teacherId)?.name.charAt(0) || 'N'}
                </div>
                <div>
                  <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">Giảng viên chính</p>
                  <p className="text-sm font-black text-hicado-navy truncate">
                    {teachers.find(t => t.id === cls.teacherId)?.name || 'Chưa phân công'}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-6 relative z-10">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-hicado-navy/30 block mb-3">Thời khóa biểu ({cls.totalSessions} buổi)</span>
                  <div className="flex flex-wrap gap-2">
                    {cls.schedule?.days.map(day => (
                      <span key={day} className="px-3 py-1 bg-hicado-slate/30 border border-hicado-slate rounded-lg text-[10px] font-black text-hicado-navy uppercase tracking-widest">{day}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-hicado-emerald">
                  <div className="p-2 bg-hicado-emerald/10 rounded-lg">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest">{cls.schedule?.time}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8 relative z-10">
                <button onClick={() => handleEdit(cls)} className="py-4 bg-hicado-navy text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-hicado-navy/10 hover:-translate-y-0.5 transition-all">
                  Sửa lớp
                </button>
                {!isTeacher && (
                  <button onClick={() => handleDelete(cls.id)} className="px-4 bg-rose-50 text-rose-500 rounded-2xl border border-rose-100 hover:bg-rose-500 hover:text-white transition-all">
                    <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Attendance History Modal */}
      {viewingHistoryId && (
        <div className="fixed inset-0 bg-hicado-navy/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-hicado-slate">
            <div className="premium-gradient p-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-hicado-emerald/10 rounded-full -mr-24 -mt-24 blur-3xl" />
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-2">Analytics Archive</p>
                  <h3 className="text-3xl font-serif font-black text-white leading-none">Lịch sử chuyên cần</h3>
                  <p className="text-white/40 text-sm mt-2 font-bold">Lớp: <span className="text-white">{classes.find(c => c.id === viewingHistoryId)?.name}</span></p>
                </div>
                <button onClick={() => setViewingHistoryId(null)} className="p-2 text-white/40 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-10 space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest">Hiệu suất 60 ngày gần nhất</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-hicado-navy/30 uppercase">Thấp</span>
                    {['bg-hicado-slate', 'bg-rose-500', 'bg-orange-400', 'bg-amber-400', 'bg-hicado-emerald'].map((c, i) => (
                      <div key={i} className={`w-4 h-4 rounded-sm ${c}`} />
                    ))}
                    <span className="text-[9px] font-black text-hicado-navy/30 uppercase">Cao</span>
                  </div>
                </div>
                <div className="grid grid-cols-10 gap-2">
                  {getAttendanceStats(viewingHistoryId).map((s, idx) => (
                    <div
                      key={idx}
                      className={`aspect-square rounded-lg transition-all group relative ${s.color} border border-white/20`}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-hicado-navy text-white text-[9px] font-black rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none z-20 whitespace-nowrap transition-all uppercase tracking-widest shadow-xl">
                        {s.date.split('-').reverse().join('/')} · {s.percent.toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-hicado-slate">
                {[
                  { label: 'Tỷ lệ TB', value: '92%', color: 'text-hicado-emerald text-glow' },
                  { label: 'Đã học', value: '18 Buổi', color: 'text-hicado-navy' },
                  { label: 'Xu hướng', value: '↑ 5%', color: 'text-hicado-emerald' },
                ].map((stat, i) => (
                  <div key={i} className={`text-center ${i === 1 ? 'border-x border-hicado-slate' : ''}`}>
                    <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-2">{stat.label}</p>
                    <p className={`text-2xl font-serif font-black ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-hicado-slate/10 border-t border-hicado-slate flex justify-end">
              <button onClick={() => setViewingHistoryId(null)} className="px-8 py-3 bg-hicado-navy text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-hicado-emerald hover:text-hicado-navy transition-all">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Class Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-hicado-navy/60 backdrop-blur-sm z-[150] flex items-center justify-center p-3 md:p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-300 border border-hicado-slate flex flex-col max-h-[95vh] md:max-h-[90vh]">
            <FocusLock returnFocus>
              <div className="p-8 border-b border-hicado-slate flex justify-between items-center bg-hicado-slate/10 shrink-0">
                <h3 className="text-2xl font-serif font-black text-hicado-navy uppercase tracking-tight">
                  {isEditMode ? 'Cập nhật' : 'Khởi tạo'} Hồ sơ Lớp học
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-hicado-navy/40 hover:text-hicado-navy transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-5 md:p-8 space-y-6 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em] ml-1">Tên lớp học</label>
                      <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder="VD: TOÁN NÂNG CAO 6A" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em] ml-1">Học phí / Buổi</label>
                        <input type="number" value={formData.tuitionPerSession} onChange={e => setFormData({ ...formData, tuitionPerSession: Number(e.target.value) })} className={inputCls} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em] ml-1">Số buổi học</label>
                        <input type="number" value={formData.totalSessions} onChange={e => setFormData({ ...formData, totalSessions: Number(e.target.value) })} className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em] ml-1">Giáo viên</label>
                        <select value={formData.teacherId} onChange={e => setFormData({ ...formData, teacherId: e.target.value })} disabled={isTeacher} className={`${selectCls} disabled:opacity-50`}>
                          <option value="">Chọn giáo viên</option>
                          {visibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em] ml-1">Phòng học</label>
                        <select value={formData.roomId} onChange={e => setFormData({ ...formData, roomId: e.target.value })} className={selectCls}>
                          <option value="">Chọn phòng học</option>
                          {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.center})</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-hicado-slate">
                      <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em] ml-1 block">Thời khóa biểu</label>
                      <div className="flex flex-wrap gap-2">
                        {daysOfWeek.map(day => (
                          <button
                            key={day}
                            onClick={() => toggleDay(day)}
                            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                              formData.schedule.days.includes(day)
                                ? 'bg-hicado-navy text-white'
                                : 'bg-hicado-slate/30 text-hicado-navy/40 hover:bg-hicado-slate'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={formData.schedule.time}
                        onChange={e => setFormData({ ...formData, schedule: { ...formData.schedule, time: e.target.value } })}
                        className={inputCls}
                        placeholder="VD: 18:00 - 20:00"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col h-full pt-6 lg:pt-0 border-t lg:border-t-0 lg:border-l border-hicado-slate lg:pl-10 space-y-4">
                    <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.2em] flex items-center justify-between ml-1">
                      <span>Học sinh được phân bổ</span>
                      <span className="text-hicado-emerald font-black">{formData.studentIds.length} học sinh</span>
                    </label>
                    <div className="flex-1 bg-hicado-slate/10 rounded-[1.5rem] border border-hicado-slate overflow-y-auto custom-scrollbar p-3 space-y-2 min-h-[250px] md:min-h-[350px]">
                      {visibleStudents.map(s => (
                        <div
                          key={s.id}
                          onClick={() => toggleStudent(s.id)}
                          className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all border ${
                            formData.studentIds.includes(s.id)
                              ? 'bg-hicado-navy/5 border-hicado-navy/20 translate-x-1'
                              : 'bg-white border-hicado-slate text-hicado-navy/40 hover:bg-hicado-slate/20'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${formData.studentIds.includes(s.id) ? 'bg-hicado-navy text-white' : 'bg-hicado-slate text-hicado-navy/40'}`}>
                              {s.name.charAt(0)}
                            </div>
                            <span className={`text-[11px] font-black uppercase tracking-widest ${formData.studentIds.includes(s.id) ? 'text-hicado-navy' : 'text-hicado-navy/40'}`}>{s.name}</span>
                          </div>
                          {formData.studentIds.includes(s.id) && (
                            <svg className="w-4 h-4 text-hicado-emerald shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-hicado-slate/10 border-t border-hicado-slate flex flex-col-reverse sm:flex-row gap-4 shrink-0 sm:justify-end">
                <button onClick={() => setIsModalOpen(false)} className="w-full sm:w-auto px-10 py-4 bg-white border border-hicado-slate text-[10px] font-black uppercase tracking-widest text-hicado-navy/40 hover:text-hicado-navy transition-all rounded-2xl">
                  Hủy bỏ
                </button>
                <button onClick={handleSave} className="w-full sm:w-auto px-12 py-4 bg-hicado-navy text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-hicado-emerald hover:text-hicado-navy hover:scale-[1.02] transition-all shadow-2xl shadow-hicado-navy/20">
                  {isEditMode ? 'Lưu thay đổi' : 'Thiết lập lớp học'}
                </button>
              </div>
            </FocusLock>
          </div>
        </div>
      )}

      <ImportPreviewModal
        isOpen={!!importPlan}
        title="Nhập danh sách lớp học"
        plan={importPlan}
        isCommitting={isImporting}
        onConfirm={handleConfirmImport}
        onCancel={() => setImportPlan(null)}
        onExportErrors={handleExportImportErrors}
      />

      {viewingClassStudentsId && (
        <ClassStudentsModal
          classId={viewingClassStudentsId}
          onClose={() => setViewingClassStudentsId(null)}
          onViewStory={(sid) => setViewingStoryId(sid)}
        />
      )}

      {viewingStoryId && (
        <SharedStoryModal
          studentId={viewingStoryId}
          onClose={() => setViewingStoryId(null)}
        />
      )}
    </div>
  );
};

const ClassStudentsModal = ({ classId, onClose, onViewStory }: { classId: string; onClose: () => void; onViewStory: (id: string) => void }) => {
  const { classes, students } = useCenterStore();
  const { auth } = useAuthStore();
  const scopedClasses = auth?.role === 'TEACHER' && auth.teacherId
    ? classes.filter(c => c.teacherId === auth.teacherId)
    : classes;
  const cls = scopedClasses.find(c => c.id === classId);
  if (!cls) return null;
  const classStudents = students.filter(s => cls.studentIds.includes(s.id));

  return (
    <div className="fixed inset-0 bg-hicado-navy/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-hicado-slate">
        <div className="premium-gradient p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-hicado-emerald/10 rounded-full -mr-24 -mt-24 blur-3xl" />
          <div className="relative z-10 flex justify-between items-start">
            <div>
              <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-2">Class Roster</p>
              <h3 className="text-3xl font-serif font-black text-white leading-none">{cls.name}</h3>
              <p className="text-white/40 text-xs font-black uppercase tracking-widest mt-2">{classStudents.length} Students Enrolled</p>
            </div>
            <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="p-8 space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar">
          {classStudents.map(student => (
            <div key={student.id} className="group flex items-center justify-between p-5 bg-hicado-slate/10 border border-hicado-slate rounded-2xl hover:bg-white hover:shadow-lg transition-all duration-300">
              <div className="flex gap-4 items-center">
                <div className="w-10 h-10 bg-hicado-navy rounded-2xl flex items-center justify-center font-serif font-black text-white group-hover:bg-hicado-emerald group-hover:text-hicado-navy transition-colors shadow-lg shadow-hicado-navy/20">
                  {student.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-black text-hicado-navy uppercase tracking-tight">{student.name}</p>
                  <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mt-0.5">ID: #{student.id}</p>
                </div>
              </div>
              <button
                onClick={() => onViewStory(student.id)}
                className="px-5 py-2.5 bg-white border border-hicado-slate text-hicado-navy rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-hicado-navy hover:text-white hover:border-hicado-navy transition-all"
              >
                Hồ sơ học tập
              </button>
            </div>
          ))}
          {classStudents.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-hicado-navy/30 font-black text-xs uppercase tracking-[0.2em] italic">Chưa có học sinh trong danh sách</p>
            </div>
          )}
        </div>

        <div className="p-8 bg-hicado-slate/10 border-t border-hicado-slate">
          <button onClick={onClose} className="w-full bg-hicado-navy text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-hicado-emerald hover:text-hicado-navy transition-all">
            Quay lại danh sách lớp
          </button>
        </div>
      </div>
    </div>
  );
};

const SharedStoryModal = ({ studentId, onClose }: { studentId: string; onClose: () => void }) => {
  const { students, classes, attendance } = useCenterStore();
  const { auth } = useAuthStore();
  const student = students.find(s => s.id === studentId);
  if (!student) return null;

  const scopedClasses = auth?.role === 'TEACHER' && auth.teacherId
    ? classes.filter(c => c.teacherId === auth.teacherId)
    : classes;

  const studentAttendance = attendance
    .filter(a => a.studentId === studentId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const studentClasses = scopedClasses.filter(c => c.studentIds.includes(studentId));

  const totalTuition = studentClasses.reduce((acc, cls) => {
    const attended = attendance.filter(a => a.studentId === studentId && a.classId === cls.id && a.status === 'PRESENT').length;
    return acc + attended * cls.tuitionPerSession;
  }, 0);

  const totalPaid = useCenterStore.getState().transactions
    .filter(t => t.studentId === studentId && t.status === 'SUCCESS')
    .reduce((acc, t) => acc + t.amount, 0);

  const debt = totalTuition - totalPaid;

  const statusStyle = (status: string) => {
    if (status === 'PRESENT') return 'bg-hicado-emerald ring-hicado-emerald/20';
    if (status === 'ABSENT') return 'bg-rose-500 ring-rose-200';
    if (status === 'LEAVE_REQUEST') return 'bg-amber-400 ring-amber-200';
    return 'bg-hicado-slate ring-hicado-slate';
  };

  return (
    <div className="fixed inset-0 bg-hicado-navy/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-300 border border-hicado-slate flex flex-col max-h-[90vh]">

        <div className="premium-gradient p-10 relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-64 h-64 bg-hicado-emerald/10 rounded-full -mr-32 -mt-32 blur-3xl" />
          <div className="relative z-10 flex justify-between items-center">
            <div className="flex gap-6 items-center">
              <div className="w-16 h-16 bg-white/10 text-white rounded-[1.5rem] flex items-center justify-center text-3xl font-serif font-black border border-white/10">
                {student.name.charAt(0)}
              </div>
              <div>
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Deep Narrative Archive</p>
                <h3 className="text-3xl font-serif font-black text-white leading-none">{student.name}</h3>
                <p className="text-white/30 text-[9px] font-black uppercase tracking-widest mt-1">Ref: ST-0{student.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 bg-white/10 text-white hover:bg-white/20 rounded-2xl transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="p-8 md:p-10 grid grid-cols-1 md:grid-cols-3 gap-8 overflow-y-auto custom-scrollbar flex-1">
          <div className="space-y-6">
            <div className={`p-6 rounded-[1.5rem] border-l-4 ${debt > 0 ? 'bg-rose-50 border-rose-400' : 'bg-hicado-emerald/5 border-hicado-emerald'}`}>
              <p className="text-[9px] font-black text-hicado-navy/40 uppercase tracking-widest mb-2">Dư nợ học phí</p>
              <p className={`text-2xl font-serif font-black ${debt > 0 ? 'text-rose-600' : 'text-hicado-emerald text-glow'}`}>{debt.toLocaleString()}đ</p>
            </div>

            <div className="space-y-3">
              <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest ml-1">Lớp đang học</p>
              {studentClasses.map(cls => (
                <div key={cls.id} className="p-4 bg-hicado-slate/10 border border-hicado-slate rounded-2xl hover:border-hicado-navy/30 transition-all">
                  <p className="text-sm font-black text-hicado-navy uppercase tracking-tight">{cls.name}</p>
                  <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-widest mt-1">{(cls.tuitionPerSession / 1000)}k / Buổi</p>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest ml-1 pb-3 border-b border-hicado-slate">
              Attendance & Progress Timeline
            </p>
            <div className="space-y-0 relative before:absolute before:inset-y-0 before:left-4 before:w-px before:bg-hicado-slate pb-8">
              {studentAttendance.map((rec, idx) => (
                <div
                  key={rec.id}
                  className={`relative pl-10 pr-4 py-5 flex justify-between items-center group ${idx !== studentAttendance.length - 1 ? 'border-b border-hicado-slate/30' : ''} hover:bg-hicado-slate/10 rounded-2xl transition-all`}
                >
                  <div className={`absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ring-4 z-10 ${statusStyle(rec.status)}`} />
                  <div className="space-y-1">
                    <p className="text-sm font-black text-hicado-navy group-hover:text-hicado-emerald transition-colors">
                      {classes.find(c => c.id === rec.classId)?.name}
                    </p>
                    <p className="text-[10px] font-bold text-hicado-navy/30 uppercase tracking-widest">
                      {new Date(rec.date).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                  </div>
                  <span className="text-[9px] font-black text-hicado-navy uppercase bg-hicado-slate/30 border border-hicado-slate px-3 py-1.5 rounded-xl tracking-widest">
                    {rec.status}
                  </span>
                </div>
              ))}
              {studentAttendance.length === 0 && (
                <div className="py-16 text-center bg-hicado-slate/10 rounded-2xl border border-dashed border-hicado-slate mt-4">
                  <p className="text-hicado-navy/30 font-black italic text-xs uppercase tracking-widest">Chưa có dữ liệu điểm danh</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-8 bg-hicado-slate/10 border-t border-hicado-slate shrink-0">
          <button onClick={onClose} className="w-full bg-hicado-navy text-white px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-hicado-emerald hover:text-hicado-navy transition-all">
            Đóng hồ sơ
          </button>
        </div>
      </div>
    </div>
  );
};
