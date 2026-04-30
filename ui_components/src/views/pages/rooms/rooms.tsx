import { useEffect, useState } from 'react';
import { useCenterStore } from '@/store/modules/center/hooks';
import { useAuthStore } from '@/store';
import { toast } from 'react-hot-toast';
import { Room } from '@/store/modules/center/types';
import { z } from 'zod';
import FocusLock from 'react-focus-lock';
import clsx from 'clsx';

const roomSchema = z.object({
  name: z.string().min(3, 'Tên phòng quá ngắn'),
  center: z.enum(['Hicado', 'Vạn Xuân']),
  capacity: z.coerce.number().min(1, 'Sức chứa không hợp lệ'),
  notes: z.string().optional()
});

export const Rooms = () => {
  const { rooms, classes, teachers, addRoom, updateRoom, deleteRoom } = useCenterStore();
  const { role, auth } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<Partial<Room>>({
    name: '',
    center: 'Hicado',
    capacity: 30,
    notes: ''
  });

  const toISODate = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const parseISODate = (value: string) => new Date(`${value}T00:00:00`);
  const addDays = (value: string, days: number) => {
    const d = parseISODate(value);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  };

  const [weekStart, setWeekStart] = useState(() => toISODate(getWeekStart(new Date())));

  const isTeacher = role === 'TEACHER';
  const scopedClasses = isTeacher && auth?.teacherId
    ? classes.filter(c => c.teacherId === auth.teacherId)
    : classes;
  const scopedRoomIds = new Set(scopedClasses.map(c => c.roomId).filter(Boolean));
  const scopedRooms = isTeacher
    ? rooms.filter(r => scopedRoomIds.has(r.id))
    : rooms;

  useEffect(() => {
    if (!selectedRoomId && scopedRooms.length > 0) {
      setSelectedRoomId(scopedRooms[0].id);
    }
    if (selectedRoomId && !scopedRooms.some(r => r.id === selectedRoomId)) {
      setSelectedRoomId(scopedRooms[0]?.id || null);
    }
  }, [scopedRooms, selectedRoomId]);

  useEffect(() => {
    if (!selectedClassId) return;
    const selectedClass = scopedClasses.find(c => c.id === selectedClassId);
    if (!selectedClass || selectedClass.roomId !== selectedRoomId) {
      setSelectedClassId(null);
    }
  }, [scopedClasses, selectedClassId, selectedRoomId]);

  const dayOrder = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const weekDates = dayOrder.map((_, idx) => addDays(weekStart, idx));

  const selectedRoom = scopedRooms.find(r => r.id === selectedRoomId);
  const classesInRoom = scopedClasses.filter(c => c.roomId === selectedRoomId);
  const selectedClass = scopedClasses.find(c => c.id === selectedClassId);
  const selectedTeacher = teachers.find(t => t.id === selectedClass?.teacherId);

  const handleEdit = (room: Room) => {
    setIsEditMode(true);
    setSelectedId(room.id);
    setFormData({
      name: room.name,
      center: room.center,
      capacity: room.capacity,
      notes: room.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa phòng học này?')) {
      deleteRoom(id);
      toast.success('Đã xóa phòng học');
    }
  };

  const handleSave = () => {
    setFormErrors({});
    const result = roomSchema.safeParse(formData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach(issue => {
        errors[issue.path[0]] = issue.message;
      });
      setFormErrors(errors);
      toast.error('Kiểm tra lại thông tin phòng');
      return;
    }

    const data = result.data;

    if (isEditMode && selectedId) {
      updateRoom(selectedId, { ...formData, ...data });
      toast.success('Đã cập nhật phòng học');
    } else {
      addRoom({
        id: 'R' + Date.now(),
        ...(data as any)
      });
      toast.success('Đã thêm phòng học mới');
    }

    setIsModalOpen(false);
    setIsEditMode(false);
    setSelectedId(null);
    setFormErrors({});
    setFormData({ name: '', center: 'Hicado', capacity: 30, notes: '' });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-hicado-slate shadow-premium relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-hicado-navy/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
        <div className="space-y-4 relative z-10">
          <div className="flex items-center gap-2 text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.3em]">
            <span>Cơ sở vật chất</span>
            <span className="opacity-30">/</span>
            <span className="text-hicado-navy">Phòng học</span>
          </div>
          <h2 className="text-4xl font-serif font-black text-hicado-navy tracking-tight">Hạ tầng Giảng dạy</h2>
          <p className="text-hicado-navy/40 text-sm font-bold uppercase tracking-widest leading-relaxed max-w-2xl">
            {isTeacher ? 'Phòng học đang sử dụng cho các lớp của bạn.' : 'Điều phối không gian học tập tối ưu giữa Hicado và Vạn Xuân.'}
          </p>
        </div>
        {!isTeacher && (
          <button 
            onClick={() => { setIsModalOpen(true); setIsEditMode(false); setFormData({ name: '', center: 'Hicado', capacity: 30, notes: '' }); }}
            className="bg-hicado-navy text-white px-10 py-4 rounded-2xl font-black shadow-2xl shadow-hicado-navy/20 hover:scale-105 transition-all uppercase text-[10px] tracking-widest relative z-10"
          >
            Thêm phòng mới
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {scopedRooms.map(room => (
          <div
            key={room.id}
            onClick={() => setSelectedRoomId(room.id)}
            className={clsx(
              "bg-white rounded-[2rem] border p-8 space-y-6 hover:shadow-2xl hover:translate-y-[-4px] transition-all duration-500 group relative overflow-hidden cursor-pointer",
              selectedRoomId === room.id ? "border-hicado-navy ring-4 ring-hicado-navy/5 shadow-premium" : "border-hicado-slate shadow-sm"
            )}
          >
            {!isTeacher && (
              <div className="absolute top-0 right-0 p-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEdit(room);
                  }}
                  className="p-2 text-hicado-navy/30 hover:text-hicado-emerald hover:bg-hicado-emerald/10 rounded-xl transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(room.id);
                  }}
                  className="p-2 text-hicado-navy/30 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            )}

            <div className="flex items-center gap-5 relative z-10">
              <div className={clsx(
                "w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl transition-transform group-hover:scale-110",
                room.center === 'Hicado' ? "bg-hicado-navy shadow-hicado-navy/20" : "bg-hicado-emerald shadow-hicado-emerald/20"
              )}>
                {room.name.charAt(room.name.length - 1)}
              </div>
              <div>
                <h4 className="text-lg font-serif font-black text-hicado-navy uppercase tracking-tight">{room.name}</h4>
                <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.2em]">{room.center}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-6 border-t border-hicado-slate/50 relative z-10">
              <div>
                <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">Sức chứa</p>
                <p className="text-sm font-black text-hicado-navy">{room.capacity} Học sinh</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">Trạng thái</p>
                <p className="text-sm font-black text-hicado-emerald uppercase tracking-widest">Sẵn sàng</p>
              </div>
            </div>
            
            {room.notes && (
              <p className="text-xs text-slate-400 italic font-medium">"{room.notes}"</p>
            )}
          </div>
        ))}
      </div>

      <div className="glass-card rounded-[2.5rem] border border-hicado-slate p-6 md:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 border-b border-hicado-slate pb-8">
          <div>
            <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-2">Schedule Matrix</p>
            <h3 className="text-2xl font-serif font-black text-hicado-navy tracking-tight">
              {selectedRoom ? `${selectedRoom.name} · ${selectedRoom.center}` : 'Chọn phòng để xem lịch'}
            </h3>
            <p className="text-xs text-hicado-navy/40 font-bold uppercase tracking-widest mt-1">
              {isTeacher ? 'Lịch theo tuần cho các lớp bạn phụ trách.' : 'Thời khóa biểu tự động từ các lớp học.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="px-5 py-3 rounded-xl border border-hicado-slate text-hicado-navy/60 text-[10px] font-black uppercase tracking-widest hover:bg-hicado-slate transition-all"
            >
              ← Tuần trước
            </button>
            <div className="flex items-center gap-2 bg-hicado-slate/30 border border-hicado-slate rounded-2xl px-5 py-3">
              <input
                type="date"
                value={weekStart}
                onChange={e => setWeekStart(e.target.value)}
                className="bg-transparent text-xs font-black text-hicado-navy outline-none"
              />
            </div>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="px-5 py-3 rounded-xl border border-hicado-slate text-hicado-navy/60 text-[10px] font-black uppercase tracking-widest hover:bg-hicado-slate transition-all"
            >
              Tuần sau →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Weekly grid - scrollable on mobile */}
          <div className="xl:col-span-3 overflow-x-auto custom-scrollbar pb-2">
            <div className="grid grid-cols-7 gap-2 min-w-[700px]">
              {dayOrder.map((day, idx) => {
                const dayClasses = classesInRoom.filter(cls => cls.schedule?.days?.includes(day));
                return (
                  <div key={day} className="bg-hicado-slate/10 border border-hicado-slate/30 rounded-[1.5rem] p-3 min-h-[160px] group/day hover:bg-white hover:shadow-xl transition-all duration-500">
                    <div className="mb-3">
                      <p className="text-[9px] font-black text-hicado-navy/40 uppercase tracking-widest group-hover/day:text-hicado-navy transition-colors">{day}</p>
                      <p className="text-[9px] font-bold text-hicado-navy/20 group-hover/day:text-hicado-navy/40">
                        {new Date(`${weekDates[idx]}T00:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {dayClasses.map(cls => (
                        <button
                          key={cls.id}
                          onClick={() => setSelectedClassId(cls.id)}
                          className={clsx(
                            'w-full text-left p-3 rounded-xl border transition-all duration-300',
                            selectedClassId === cls.id
                              ? 'border-hicado-navy bg-hicado-navy shadow-lg shadow-hicado-navy/20'
                              : 'border-hicado-slate bg-white hover:border-hicado-navy/30 hover:scale-[1.02]'
                          )}
                        >
                          <p className={clsx('text-[10px] font-black uppercase tracking-tight leading-tight', selectedClassId === cls.id ? 'text-white' : 'text-hicado-navy')}>
                            {cls.name}
                          </p>
                          <p className={clsx('text-[9px] font-bold mt-0.5', selectedClassId === cls.id ? 'text-white/50' : 'text-hicado-navy/30')}>
                            {cls.schedule?.time}
                          </p>
                        </button>
                      ))}
                      {dayClasses.length === 0 && (
                        <div className="flex items-center justify-center pt-6 opacity-10">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side panels */}
          <div className="space-y-4">
            <div className="glass-card rounded-[1.5rem] p-5 border border-hicado-slate">
              <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.3em] mb-3">Chi tiết lớp</p>
              {selectedClass ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-black text-hicado-navy uppercase tracking-tight">{selectedClass.name}</p>
                    <p className="text-[10px] text-hicado-navy/40 font-bold mt-0.5">{selectedClass.schedule?.time}</p>
                  </div>
                  <div className="space-y-2 pt-3 border-t border-hicado-slate">
                    {[
                      { label: 'Giáo viên', value: selectedTeacher?.name || 'Chưa phân công' },
                      { label: 'Sĩ số', value: `${selectedClass.studentIds.length} học sinh` },
                      { label: 'HP/Buổi', value: `${selectedClass.tuitionPerSession.toLocaleString()}đ` },
                      { label: 'Tỷ lệ GV', value: `${Math.round((selectedClass.teacherShare ?? selectedTeacher?.salaryRate ?? 0) * 100)}%` },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between">
                        <span className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">{item.label}</span>
                        <span className="text-[10px] font-black text-hicado-navy">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-hicado-navy/30 italic font-bold">Chọn một lớp trong lịch để xem thông tin.</p>
              )}
            </div>

            <div className="glass-card rounded-[1.5rem] p-5 border border-hicado-slate">
              <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.3em] mb-3">Tổng quan phòng</p>
              {selectedRoom ? (
                <div className="space-y-2">
                  {[
                    { label: 'Sức chứa', value: `${selectedRoom.capacity} học sinh` },
                    { label: 'Số lớp', value: `${classesInRoom.length} lớp` },
                    { label: 'Tuần', value: `${weekDates[0]} → ${weekDates[6]}` },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between">
                      <span className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">{item.label}</span>
                      <span className="text-[10px] font-black text-hicado-navy">{item.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-hicado-navy/30 italic font-bold">Chọn phòng để xem thông tin.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-hicado-navy/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-hicado-slate">
            <FocusLock returnFocus>
            <div className="p-8 border-b border-hicado-slate flex justify-between items-center bg-hicado-slate/10 shrink-0">
              <h3 className="text-xl font-serif font-black text-hicado-navy uppercase tracking-tight">
                {isEditMode ? 'Cấu hình Phòng' : 'Thêm phòng mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-hicado-navy/40 hover:text-hicado-navy transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.2em] ml-1">Tên phòng học</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="VD: Phòng 101"
                  className={clsx(
                    "w-full bg-hicado-slate/20 border px-6 py-4 rounded-2xl text-hicado-navy font-black placeholder:text-hicado-navy/20 outline-none transition-all",
                    formErrors.name ? "border-rose-500 ring-4 ring-rose-500/5" : "border-transparent focus:bg-white focus:border-hicado-navy/30"
                  )}
                />
                {formErrors.name && <p className="text-[9px] text-rose-500 font-bold uppercase tracking-widest ml-1">{formErrors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.2em] ml-1">Cơ sở</label>
                  <select 
                    value={formData.center}
                    onChange={e => setFormData({ ...formData, center: e.target.value as any })}
                    className="w-full bg-hicado-slate/20 border border-transparent rounded-2xl px-6 py-4 text-hicado-navy font-black focus:bg-white focus:border-hicado-navy/30 outline-none transition-all"
                  >
                    <option value="Hicado">Hicado</option>
                    <option value="Vạn Xuân">Vạn Xuân</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.2em] ml-1">Sức chứa</label>
                  <input 
                    type="number" 
                    value={formData.capacity}
                    onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                    className="w-full bg-hicado-slate/20 border border-transparent rounded-2xl px-6 py-4 text-hicado-navy font-black focus:bg-white focus:border-hicado-navy/30 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.2em] ml-1">Ghi chú vận hành</label>
                <textarea 
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Thông tin thêm (VD: Có máy chiếu...)"
                  className="w-full bg-hicado-slate/20 border border-transparent rounded-2xl px-6 py-4 text-hicado-navy font-black focus:bg-white focus:border-hicado-navy/30 outline-none transition-all placeholder:text-hicado-navy/20 min-h-[100px]"
                />
              </div>
            </div>

            <div className="p-8 bg-hicado-slate/10 flex gap-4 border-t border-hicado-slate">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-hicado-navy/40 hover:text-hicado-navy transition-all uppercase text-[10px] tracking-widest"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 bg-hicado-navy text-white px-6 py-4 rounded-2xl font-black shadow-2xl shadow-hicado-navy/20 hover:scale-105 transition-all uppercase text-[10px] tracking-widest"
              >
                {isEditMode ? 'Cập nhật' : 'Thêm phòng'}
              </button>
            </div>
            </FocusLock>
          </div>
        </div>
      )}
    </div>
  );
};
