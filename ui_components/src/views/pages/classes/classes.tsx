import { useState } from 'react';
import { useCenterStore, useAuthStore } from '@/store';

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

  const [formData, setFormData] = useState({
    name: '',
    teacherId: '',
    roomId: '',
    tuitionPerSession: 0,
    totalSessions: 12,
    studentIds: [] as string[],
    teacherShare: 80,
    schedule: {
      days: [] as string[],
      time: '18:00 - 20:00'
    }
  });

  const isTeacher = auth?.role === 'TEACHER';
  const visibleTeachers = isTeacher ? teachers.filter(t => t.id === auth.teacherId) : teachers;
  const visibleClasses = isTeacher ? classes.filter(c => c.teacherId === auth.teacherId) : classes;
  const visibleStudents = students;

  const handleSave = () => {
    if (!formData.name || !formData.teacherId) return;

    if (isEditMode && editingId) {
      updateClass(editingId, formData);
    } else {
      addClass({ ...formData, id: Math.random().toString(36).substr(2, 9) });
    }
    setIsModalOpen(false);
    setFormData({ name: '', teacherId: '', roomId: '', tuitionPerSession: 0, totalSessions: 12, studentIds: [], teacherShare: 80, schedule: { days: [], time: '18:00 - 20:00' } });
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
      teacherShare: cls.teacherShare ?? 80,
      schedule: cls.schedule || { days: [], time: '18:00 - 20:00' }
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc muốn xóa lớp học này?')) {
      deleteClass(id);
    }
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
      
      let color = 'bg-slate-100';
      if (percent >= 100) color = 'bg-emerald-500 shadow-lg shadow-emerald-500/20';
      else if (percent >= 75) color = 'bg-amber-400 shadow-lg shadow-amber-400/20';
      else if (percent >= 50) color = 'bg-orange-400 shadow-lg shadow-orange-400/20';
      else if (percent > 0) color = 'bg-rose-500 shadow-lg shadow-rose-500/20';

      return { date, percent, color };
    });
  };

  return (
    <div className="space-y-8 md:space-y-12 pb-16 bg-ant-paper min-h-screen">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 md:gap-8 border-b border-ant-border pb-6 md:pb-10">
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-ant-muted uppercase tracking-[0.2em] animate-in fade-in slide-in-from-left duration-500">
            <span>Hệ thống quản trị</span>
            <span className="opacity-30">/</span>
            <span className="text-ant-charcoal">Lớp học</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-serif font-bold text-ant-charcoal tracking-tight animate-in fade-in slide-in-from-left duration-700">
            Danh sách Lớp học
          </h2>
          <p className="text-ant-muted text-sm md:text-base max-w-2xl animate-in fade-in slide-in-from-left duration-1000">
            Quản lý sĩ số, thời khóa biểu và theo dõi chuyên cần của học viên với bộ công cụ điều hành tập trung.
          </p>
        </div>
        {!isTeacher && (
          <div className="flex gap-4 animate-in fade-in slide-in-from-right duration-700 w-full lg:w-auto mt-4 lg:mt-0">
            <button 
              onClick={() => { 
                setIsModalOpen(true); 
                setIsEditMode(false); 
                setFormData({ name: '', teacherId: '', roomId: '', tuitionPerSession: 0, totalSessions: 12, studentIds: [], teacherShare: 80, schedule: { days: [], time: '18:00 - 20:00' } }); 
              }}
              className="w-full lg:w-auto justify-center bg-ant-rust text-white px-6 md:px-10 py-3 md:py-4 rounded-lg text-xs md:text-sm font-bold uppercase tracking-widest shadow-lg shadow-ant-rust/20 hover:bg-opacity-90 active:scale-95 transition-all flex items-center gap-3"
            >
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
              Tạo lớp mới
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
        {visibleClasses.map((cls, idx) => {
          const room = rooms.find(r => r.id === cls.roomId);
          const capacity = room?.capacity || 0;
          return (
            <div key={cls.id} className="bg-ant-surface border border-ant-border rounded-xl p-5 md:p-8 shadow-sm hover:shadow-md transition-all duration-300 group flex flex-col animate-in fade-in slide-in-from-bottom duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
              <div className="flex justify-between items-start mb-4 md:mb-6">
                <div className="space-y-3">
                  <h4 className="text-2xl font-serif font-bold text-ant-charcoal tracking-tight group-hover:text-ant-rust transition-colors leading-tight">{cls.name}</h4>
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${cls.studentIds.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-ant-muted/30'}`}></span>
                    <span className="text-[11px] font-bold text-ant-muted uppercase tracking-[0.1em]">
                      {cls.studentIds.length > 0 ? 'Đang mở' : 'Chưa có học viên'} • {cls.studentIds.length}/{capacity || '--'} Slots
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                   <button onClick={() => setViewingHistoryId(cls.id)} className="p-2 text-ant-muted hover:text-ant-rust hover:bg-ant-paper rounded-md transition-all border border-transparent" title="Chuyên cần">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                   </button>
                   <button onClick={() => setViewingClassStudentsId(cls.id)} className="p-2 text-ant-muted hover:text-ant-rust hover:bg-ant-paper rounded-md transition-all border border-transparent" title="Học sinh">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                   </button>
                </div>
              </div>

              <div className="flex items-center gap-4 py-5 border-y border-ant-border mb-6">
                <div className="w-12 h-12 bg-ant-paper rounded-full flex items-center justify-center font-serif text-ant-charcoal font-bold text-lg border border-ant-border">
                  {teachers.find(t => t.id === cls.teacherId)?.name.charAt(0) || 'N'}
                </div>
                <div>
                  <p className="text-sm font-bold text-ant-charcoal truncate">
                    {teachers.find(t => t.id === cls.teacherId)?.name || 'Chưa phân công'} 
                  </p>
                  <p className="text-xs text-ant-muted mt-1">
                    Phòng {room?.name || '--'} <span className="mx-1.5 opacity-30">•</span> {room?.center || 'Hicado'}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-ant-muted block mb-3">Lịch học ({cls.totalSessions} buổi)</span>
                  <div className="flex flex-wrap gap-2">
                    {cls.schedule?.days.map(day => (
                      <span key={day} className="px-3 py-1 bg-ant-paper border border-ant-border rounded text-[11px] font-medium text-ant-charcoal">{day}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-ant-rust">
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                   <p className="text-sm font-medium">{cls.schedule?.time}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button onClick={() => handleEdit(cls)} className="flex-1 py-3 border border-ant-border text-xs font-bold uppercase tracking-widest text-ant-charcoal rounded-lg hover:border-ant-rust hover:text-ant-rust transition-all">Sửa lớp</button>
                {!isTeacher && (
                  <button onClick={() => handleDelete(cls.id)} className="px-4 border border-ant-border text-ant-muted rounded-lg hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all">
                    <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {viewingHistoryId && (
        <div className="fixed inset-0 bg-ant-charcoal/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-ant-surface rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-ant-border">
             <div className="p-10 border-b border-ant-border flex justify-between items-start bg-ant-paper/30">
                <div>
                  <p className="text-[10px] font-bold text-ant-rust uppercase tracking-[0.3em] mb-2 px-1">Analytics Archive</p>
                  <h3 className="text-3xl font-serif font-bold text-ant-charcoal leading-none">Lịch sử chuyên cần</h3>
                  <p className="text-ant-muted text-sm mt-3 font-medium">Lớp: <span className="text-ant-charcoal">{classes.find(c => c.id === viewingHistoryId)?.name}</span></p>
                </div>
                <button onClick={() => setViewingHistoryId(null)} className="p-2 text-ant-muted hover:text-ant-charcoal transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
             </div>
             <div className="p-10 space-y-10">
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-bold text-ant-muted uppercase tracking-widest">Hiệu suất 60 ngày</p>
                    <div className="flex gap-2 items-center bg-ant-paper p-1.5 rounded-lg border border-ant-border">
                       <span className="text-[9px] font-bold text-ant-muted uppercase px-1">Thấp</span>
                       <div className="flex gap-1.5">
                          {[ 'bg-ant-border', 'bg-rose-400', 'bg-orange-400', 'bg-ant-rust', 'bg-emerald-500' ].map((c, i) => (
                             <div key={i} className={`w-4 h-4 rounded-sm ${c}`}></div>
                          ))}
                       </div>
                       <span className="text-[9px] font-bold text-ant-muted uppercase px-1">Cao</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-10 gap-3">
                    {getAttendanceStats(viewingHistoryId!).map((s, idx) => (
                      <div 
                        key={idx} 
                        className={`aspect-square rounded-md transition-all group relative ${s.color} border border-white/20`}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-ant-charcoal text-white text-[10px] font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none z-20 whitespace-nowrap transition-all uppercase tracking-widest">
                          {s.date.split('-').reverse().join('/')} • {s.percent.toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 pt-6 border-t border-ant-border">
                   <div className="text-center">
                      <p className="text-[10px] font-bold text-ant-muted uppercase tracking-widest mb-1">Tỷ lệ TB</p>
                      <p className="text-2xl font-serif font-bold text-emerald-600">92%</p>
                   </div>
                   <div className="text-center border-x border-ant-border">
                      <p className="text-[10px] font-bold text-ant-muted uppercase tracking-widest mb-1">Đã học</p>
                      <p className="text-2xl font-serif font-bold text-ant-charcoal">18 Buổi</p>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-bold text-ant-muted uppercase tracking-widest mb-1">Xu hướng</p>
                      <p className="text-2xl font-serif font-bold text-emerald-500">↑ 5%</p>
                   </div>
                </div>
             </div>
             <div className="p-8 bg-ant-paper/50 border-t border-ant-border flex justify-end">
                <button onClick={() => setViewingHistoryId(null)} className="px-8 py-3 bg-ant-charcoal text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-ant-rust transition-all">
                  Đóng tài liệu
                </button>
             </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-ant-charcoal/40 backdrop-blur-sm z-[150] flex items-center justify-center p-3 md:p-4 animate-in fade-in duration-300">
          <div className="bg-ant-surface rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-300 border border-ant-border flex flex-col max-h-[95vh] md:max-h-[90vh]">
            <div className="p-5 md:p-8 border-b border-ant-border flex justify-between items-center bg-ant-paper/30 shrink-0">
              <h3 className="text-xl md:text-2xl font-serif font-bold text-ant-charcoal">
                {isEditMode ? 'Cập nhật' : 'Khởi tạo'} Hồ sơ Lớp học
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-ant-muted hover:text-ant-charcoal transition-colors p-1 md:p-2">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-5 md:p-8 space-y-6 md:space-y-8 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-ant-muted uppercase tracking-widest ml-1">Tên lớp học</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-ant-paper border border-ant-border px-5 py-3 rounded-lg text-sm font-medium text-ant-charcoal outline-none focus:border-ant-rust/50 focus:ring-4 focus:ring-ant-rust/5 transition-all"
                      placeholder="VD: TOÁN NÂNG CAO 6A"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-ant-muted uppercase tracking-widest ml-1">Học phí / Buổi</label>
                      <input 
                        type="number" 
                        value={formData.tuitionPerSession}
                        onChange={e => setFormData({ ...formData, tuitionPerSession: Number(e.target.value) })}
                        className="w-full bg-ant-paper border border-ant-border px-5 py-3 rounded-lg text-sm font-medium text-ant-charcoal outline-none focus:border-ant-rust/50 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-ant-muted uppercase tracking-widest ml-1">Số buổi học</label>
                      <input 
                        type="number" 
                        value={formData.totalSessions}
                        onChange={e => setFormData({ ...formData, totalSessions: Number(e.target.value) })}
                        className="w-full bg-ant-paper border border-ant-border px-5 py-3 rounded-lg text-sm font-medium text-ant-charcoal outline-none focus:border-ant-rust/50 transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-ant-muted uppercase tracking-widest ml-1">Giáo viên</label>
                      <select 
                        value={formData.teacherId}
                        onChange={e => setFormData({ ...formData, teacherId: e.target.value })}
                        disabled={isTeacher}
                        className="w-full bg-ant-paper border border-ant-border px-5 py-3 rounded-lg text-sm font-medium text-ant-charcoal outline-none focus:border-ant-rust/50 cursor-pointer disabled:opacity-50"
                      >
                        <option value="">Chọn giáo viên</option>
                        {visibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-ant-muted uppercase tracking-widest ml-1">Phòng học</label>
                      <select 
                        value={formData.roomId}
                        onChange={e => setFormData({ ...formData, roomId: e.target.value })}
                        className="w-full bg-ant-paper border border-ant-border px-5 py-3 rounded-lg text-sm font-medium text-ant-charcoal outline-none focus:border-ant-rust/50 cursor-pointer"
                      >
                        <option value="">Chọn phòng học</option>
                        {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.center})</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-ant-border">
                    <label className="text-[10px] font-bold text-ant-muted uppercase tracking-widest ml-1 block">Thời khóa biểu</label>
                    <div className="flex flex-wrap gap-2">
                      {daysOfWeek.map(day => (
                        <button 
                          key={day}
                          onClick={() => toggleDay(day)}
                          className={`px-3 py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${
                            formData.schedule.days.includes(day) 
                              ? 'bg-ant-charcoal text-white' 
                              : 'bg-ant-paper text-ant-muted hover:bg-ant-border'
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
                      className="w-full bg-ant-paper border border-ant-border px-5 py-3 rounded-lg text-sm font-medium text-ant-charcoal outline-none focus:border-ant-rust/50 transition-all"
                      placeholder="VD: 18:00 - 20:00"
                    />
                  </div>
                </div>

                <div className="flex flex-col h-full pt-6 lg:pt-0 border-t lg:border-t-0 lg:border-l lg:border-ant-border lg:pl-10 space-y-4">
                  <label className="text-[10px] font-bold text-ant-muted uppercase tracking-widest flex items-center justify-between ml-1">
                    <span>Học sinh được phân bổ</span>
                    <span className="text-ant-rust font-bold">{formData.studentIds.length} học sinh</span>
                  </label>
                  <div className="flex-1 bg-ant-paper/50 rounded-lg border border-ant-border overflow-y-auto p-3 md:p-4 space-y-2 min-h-[250px] md:min-h-[350px]">
                    {visibleStudents.map(s => (
                      <div 
                        key={s.id}
                        onClick={() => toggleStudent(s.id)}
                        className={`flex items-center justify-between p-3 md:p-4 rounded-lg cursor-pointer transition-all border ${
                          formData.studentIds.includes(s.id) 
                            ? 'bg-ant-surface border-ant-rust shadow-sm translate-x-1' 
                            : 'bg-ant-surface/50 border-ant-border text-ant-muted hover:bg-ant-surface'
                        }`}
                      >
                        <div className="flex items-center gap-2 md:gap-3">
                           <div className={`w-7 h-7 md:w-8 md:h-8 rounded flex items-center justify-center font-serif font-bold text-[10px] md:text-xs ${formData.studentIds.includes(s.id) ? 'bg-ant-rust text-white' : 'bg-ant-paper text-ant-muted'}`}>
                             {s.name.charAt(0)}
                           </div>
                           <span className={`text-[10px] md:text-[11px] font-bold uppercase tracking-widest ${formData.studentIds.includes(s.id) ? 'text-ant-charcoal' : ''}`}>{s.name}</span>
                        </div>
                        {formData.studentIds.includes(s.id) && (
                          <svg className="w-4 h-4 text-ant-rust shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 md:p-8 bg-ant-paper border-t border-ant-border flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 shrink-0 sm:justify-end">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-full sm:w-auto px-6 md:px-8 py-3 bg-white border border-ant-border text-[11px] md:text-xs font-bold uppercase tracking-widest text-ant-muted hover:text-ant-charcoal transition-all rounded-lg"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleSave}
                className="w-full sm:w-auto px-6 md:px-10 py-3 bg-ant-charcoal text-white text-[11px] md:text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-ant-rust transition-all shadow-lg shadow-ant-charcoal/10"
              >
                {isEditMode ? 'Lưu thay đổi' : 'Thiết lập lớp học'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingClassStudentsId && (
        <ClassStudentsModal 
           classId={viewingClassStudentsId!} 
           onClose={() => setViewingClassStudentsId(null)} 
           onViewStory={(sid) => setViewingStoryId(sid)}
        />
      )}

      {viewingStoryId && (
        <SharedStoryModal 
          studentId={viewingStoryId!} 
          onClose={() => setViewingStoryId(null)} 
        />
      )}
    </div>
  );
};

const ClassStudentsModal = ({ classId, onClose, onViewStory }: { classId: string, onClose: () => void, onViewStory: (id: string) => void }) => {
  const { classes, students } = useCenterStore();
  const { auth } = useAuthStore();
  const scopedClasses = auth?.role === 'TEACHER' && auth.teacherId
    ? classes.filter(c => c.teacherId === auth.teacherId)
    : classes;
  const cls = scopedClasses.find(c => c.id === classId);
  if (!cls) return null;

  const classStudents = students.filter(s => cls.studentIds.includes(s.id));

  return (
    <div className="fixed inset-0 bg-ant-charcoal/40 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
      <div className="bg-ant-surface rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-ant-border">
        <div className="p-10 border-b border-ant-border flex justify-between items-center bg-ant-paper/30">
          <div>
            <p className="text-[10px] font-bold text-ant-rust uppercase tracking-[0.3em] mb-2 px-1">Class Roster</p>
            <h3 className="text-3xl font-serif font-bold text-ant-charcoal leading-none">{cls.name}</h3>
            <p className="text-ant-muted text-xs font-bold uppercase tracking-widest mt-3">{classStudents.length} Students Enrolled</p>
          </div>
          <button onClick={onClose} className="text-ant-muted hover:text-ant-charcoal transition-colors p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div className="p-10 space-y-4 max-h-[55vh] overflow-y-auto">
          {classStudents.map(student => (
            <div key={student.id} className="group flex items-center justify-between p-6 bg-ant-paper/50 border border-ant-border rounded-lg hover:bg-ant-surface hover:shadow-md transition-all duration-300">
              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 bg-white rounded border border-ant-border flex items-center justify-center font-serif font-bold text-ant-charcoal group-hover:text-ant-rust transition-colors shadow-sm">
                  {student.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold text-ant-charcoal uppercase tracking-tight group-hover:text-ant-rust transition-colors">{student.name}</p>
                  <p className="text-[10px] font-bold text-ant-muted uppercase tracking-widest mt-1">ID: #{student.id}</p>
                </div>
              </div>
              <button 
                onClick={() => onViewStory(student.id)}
                className="px-6 py-3 bg-white text-ant-charcoal border border-ant-border rounded text-[10px] font-bold uppercase tracking-widest hover:bg-ant-charcoal hover:text-white transition-all"
              >
                Hồ sơ học tập
              </button>
            </div>
          ))}
          {classStudents.length === 0 && (
            <div className="py-20 text-center">
               <p className="text-ant-muted font-bold text-xs uppercase tracking-[0.2em] italic">Chưa có học sinh trong danh sách</p>
            </div>
          )}
        </div>
        <div className="p-8 bg-ant-paper border-t border-ant-border">
          <button onClick={onClose} className="w-full bg-ant-charcoal text-white px-8 py-4 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-ant-rust transition-all">
            Quay lại danh sách lớp
          </button>
        </div>
      </div>
    </div>
  );
};

const SharedStoryModal = ({ studentId, onClose }: { studentId: string, onClose: () => void }) => {
  const { students, classes, attendance } = useCenterStore();
  const { auth } = useAuthStore();
  const student = students.find(s => s.id === studentId);
  if (!student) return null;

  const scopedClasses = auth?.role === 'TEACHER' && auth.teacherId
    ? classes.filter(c => c.teacherId === auth.teacherId)
    : classes;
  const studentAttendance = attendance.filter(a => a.studentId === studentId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const studentClasses = scopedClasses.filter(c => c.studentIds.includes(studentId));

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
      case 'PRESENT': return 'bg-emerald-500 ring-emerald-50 shadow-emerald-200';
      case 'ABSENT': return 'bg-rose-500 ring-rose-50 shadow-rose-200';
      case 'LEAVE_REQUEST': return 'bg-amber-400 ring-amber-50 shadow-amber-200';
      default: return 'bg-ant-muted/30 ring-ant-paper shadow-sm';
    }
  };

  return (
    <div className="fixed inset-0 bg-ant-charcoal/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-ant-surface rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-300 border border-ant-border flex flex-col max-h-[85vh]">
        <div className="p-12 bg-ant-charcoal text-white shrink-0 flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-ant-rust/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
            <div className="flex gap-8 items-center relative z-10">
              <div className="w-20 h-20 bg-white/10 text-white rounded-lg flex items-center justify-center text-3xl font-serif font-bold border border-white/10 shadow-inner">
                {student.name.charAt(0)}
              </div>
              <div>
                <p className="text-ant-rust text-[10px] font-bold uppercase tracking-[0.4em] mb-2 px-1">Deep Narrative Archive</p>
                <h3 className="text-4xl font-serif font-bold leading-none">{student.name}</h3>
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-[0.15em] mt-3">Ref: ST-0{student.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-3 bg-white/5 text-white hover:bg-white/10 rounded-lg transition-all border border-transparent hover:border-white/10 relative z-10">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <div className="p-12 grid grid-cols-1 md:grid-cols-3 gap-12 overflow-y-auto bg-white flex-1">
            <div className="space-y-10">
                <div className="bg-ant-paper p-10 rounded-xl border border-ant-border shadow-inner border-l-4 border-l-ant-rust">
                    <p className="text-[10px] font-bold text-ant-muted uppercase tracking-[0.2em] mb-3">Balance Receivable</p>
                    <p className={`text-3xl font-serif font-bold ${debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{debt.toLocaleString()}đ</p>
                </div>
                <div className="space-y-6">
                    <p className="text-[11px] font-bold text-ant-charcoal uppercase tracking-[0.1em] ml-1 flex items-center gap-3">
                      <span className="w-2 h-2 bg-ant-rust rounded-full"></span> Subscriptions
                    </p>
                    <div className="space-y-4">
                      {studentClasses.map(cls => (
                          <div key={cls.id} className="p-6 bg-ant-paper/50 border border-ant-border rounded-lg shadow-sm hover:border-ant-rust transition-all group">
                              <p className="text-sm font-bold text-ant-charcoal uppercase tracking-tight group-hover:text-ant-rust transition-colors">{cls.name}</p>
                              <div className="flex justify-between items-center mt-3">
                                <p className="text-[10px] font-bold text-ant-rust uppercase tracking-widest">Rate: {(cls.tuitionPerSession/1000)}k</p>
                                <span className="text-[9px] font-bold text-ant-muted uppercase">/ Session</span>
                              </div>
                          </div>
                      ))}
                    </div>
                </div>
            </div>
            <div className="md:col-span-2 space-y-8">
                 <p className="text-[11px] font-bold text-ant-charcoal uppercase tracking-[0.1em] ml-1 flex items-center gap-3 border-b border-ant-border pb-4">
                    <span className="w-2 h-2 bg-ant-rust rounded-full"></span> Attendance & Progress Timeline
                 </p>
                 <div className="space-y-0 relative before:absolute before:inset-y-0 before:left-4 before:w-px before:bg-ant-border pb-12">
                    {studentAttendance.map((rec, idx) => (
                        <div key={rec.id} className={`relative pl-12 pr-6 py-8 flex justify-between items-center group ${idx !== studentAttendance.length - 1 ? 'border-b border-ant-paper' : ''} hover:bg-ant-paper/50 rounded-lg transition-all`}>
                            <div className={`absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ring-4 shadow-sm z-10 ${getStatusColor(rec.status)}`}></div>
                            <div className="space-y-2">
                                <span className="text-lg font-serif font-bold text-ant-charcoal group-hover:text-ant-rust transition-colors">{classes.find(c => c.id === rec.classId)?.name}</span>
                                <p className="text-[10px] font-bold text-ant-muted uppercase tracking-[0.2em]">{new Date(rec.date).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                            </div>
                            <span className="text-[10px] font-bold text-ant-charcoal uppercase bg-white border border-ant-border px-5 py-2.5 rounded shadow-sm tracking-widest">#{rec.status}</span>
                        </div>
                    ))}
                    {studentAttendance.length === 0 && (
                      <div className="py-24 text-center bg-ant-paper-half rounded-xl border border-dashed border-ant-border">
                         <p className="text-ant-muted font-bold italic text-sm uppercase tracking-[0.2em]">Zero Historical Data</p>
                      </div>
                    )}
                 </div>
            </div>
        </div>
        <div className="p-8 bg-ant-paper border-t border-ant-border shrink-0 px-12">
             <button onClick={onClose} className="w-full bg-ant-charcoal text-white px-10 py-5 rounded-lg font-bold uppercase text-xs tracking-[0.4em] hover:bg-ant-rust transition-all">
               Close Archive Data
             </button>
        </div>
      </div>
    </div>
  );
};
