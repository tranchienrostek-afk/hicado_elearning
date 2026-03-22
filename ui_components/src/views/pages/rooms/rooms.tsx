import { useEffect, useState } from 'react';
import { useCenterStore } from '@/store/modules/center/hooks';
import { useAuthStore } from '@/store';
import { toast } from 'react-hot-toast';
import { Room } from '@/store/modules/center/types';

export const Rooms = () => {
  const { rooms, classes, teachers, addRoom, updateRoom, deleteRoom } = useCenterStore();
  const { role, auth } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

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
    if (!formData.name) {
      toast.error('Vui lòng nhập tên phòng');
      return;
    }

    if (isEditMode && selectedId) {
      updateRoom(selectedId, formData);
      toast.success('Đã cập nhật phòng học');
    } else {
      addRoom({
        id: 'R' + Date.now(),
        name: formData.name!,
        center: formData.center as any,
        capacity: formData.capacity || 30,
        notes: formData.notes
      });
      toast.success('Đã thêm phòng học mới');
    }

    setIsModalOpen(false);
    setIsEditMode(false);
    setSelectedId(null);
    setFormData({ name: '', center: 'Hicado', capacity: 30, notes: '' });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Quản lý Phòng học</h2>
          <p className="text-slate-400 text-sm font-medium">{isTeacher ? 'Phòng học đang sử dụng cho các lớp của bạn' : 'Danh sách phòng học tại Hicado và Vạn Xuân'}</p>
        </div>
        {!isTeacher && (
          <button 
            onClick={() => { setIsModalOpen(true); setIsEditMode(false); setFormData({ name: '', center: 'Hicado', capacity: 30, notes: '' }); }}
            className="bg-management-blue text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-blue-900/10 hover:translate-y-[-2px] transition-all uppercase text-xs tracking-widest"
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
            className={`bg-white rounded-3xl border shadow-sm p-6 space-y-4 hover:shadow-xl hover:translate-y-[-4px] transition-all group relative overflow-hidden cursor-pointer ${
              selectedRoomId === room.id ? 'border-management-blue ring-2 ring-management-blue/10' : 'border-slate-200'
            }`}
          >
            {!isTeacher && (
              <div className="absolute top-0 right-0 p-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEdit(room);
                  }}
                  className="p-2 text-slate-400 hover:text-management-blue hover:bg-blue-50 rounded-xl transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(room.id);
                  }}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl ${room.center === 'Hicado' ? 'bg-management-blue' : 'bg-emerald-500'}`}>
                {room.name.charAt(room.name.length - 1)}
              </div>
              <div>
                <h4 className="font-black text-slate-900 uppercase tracking-tight">{room.name}</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{room.center}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Sức chứa</p>
                <p className="text-sm font-black text-slate-900">{room.capacity} Học sinh</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Trạng thái</p>
                <p className="text-sm font-black text-emerald-500">Sẵn sàng</p>
              </div>
            </div>
            
            {room.notes && (
              <p className="text-xs text-slate-400 italic font-medium">"{room.notes}"</p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ma trận lịch học</p>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              {selectedRoom ? `${selectedRoom.name} • ${selectedRoom.center}` : 'Chọn phòng để xem lịch'}
            </h3>
            <p className="text-xs text-slate-400 font-medium">{isTeacher ? 'Lịch theo tuần cho các lớp bạn đang phụ trách' : 'Hiển thị lịch theo tuần và các lớp đang sử dụng phòng'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Tuần trước
            </button>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tuần bắt đầu</span>
              <input
                type="date"
                value={weekStart}
                onChange={e => setWeekStart(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none"
              />
            </div>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Tuần sau
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              {dayOrder.map((day, idx) => {
                const dayClasses = classesInRoom.filter(cls => cls.schedule?.days?.includes(day));
                return (
                  <div key={day} className="bg-slate-50 border border-slate-100 rounded-2xl p-3 min-h-[160px]">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{day}</p>
                      <span className="text-[10px] font-bold text-slate-400">{new Date(`${weekDates[idx]}T00:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
                    </div>
                    <div className="space-y-2 mt-3">
                      {dayClasses.map(cls => {
                        const teacherName = teachers.find(t => t.id === cls.teacherId)?.name || 'Chưa phân công';
                        return (
                          <button
                            key={cls.id}
                            onClick={() => setSelectedClassId(cls.id)}
                            className={`w-full text-left p-3 rounded-xl border transition-all ${
                              selectedClassId === cls.id
                                ? 'border-management-blue bg-white shadow-sm'
                                : 'border-white bg-white/60 hover:bg-white'
                            }`}
                          >
                            <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{cls.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{cls.schedule?.time}</p>
                            <p className="text-[10px] text-slate-500 font-medium">{teacherName}</p>
                          </button>
                        );
                      })}
                      {dayClasses.length === 0 && (
                        <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Trống</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Chi tiết lớp</p>
              {selectedClass ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{selectedClass.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold">{selectedClass.schedule?.time}</p>
                  </div>
                  <div className="space-y-1 text-[10px] font-bold text-slate-500">
                    <p>Giáo viên: <span className="text-slate-700">{selectedTeacher?.name || 'Chưa phân công'}</span></p>
                    <p>Sĩ số: <span className="text-slate-700">{selectedClass.studentIds.length} học sinh</span></p>
                    <p>Học phí/buổi: <span className="text-slate-700">{selectedClass.tuitionPerSession.toLocaleString()}đ</span></p>
                    <p>Tỷ lệ GV: <span className="text-slate-700">{Math.round(((selectedClass.teacherShare ?? selectedTeacher?.salaryRate ?? 0) * 100))}%</span></p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Chọn một lớp trong lịch để xem nhanh thông tin.</p>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tổng quan phòng</p>
              {selectedRoom ? (
                <div className="space-y-2 text-[10px] font-bold text-slate-500">
                  <p>Sức chứa: <span className="text-slate-700">{selectedRoom.capacity} học sinh</span></p>
                  <p>Số lớp đang dùng: <span className="text-slate-700">{classesInRoom.length} lớp</span></p>
                  <p>Lịch tuần này: <span className="text-slate-700">{weekDates[0]} → {weekDates[6]}</span></p>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Chọn phòng để xem thông tin.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {isEditMode ? 'Chỉnh sửa phòng' : 'Thêm phòng mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên phòng học</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="VD: Phòng 101"
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-slate-900 font-bold focus:ring-2 focus:ring-management-blue/20 transition-all placeholder:text-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cơ sở</label>
                  <select 
                    value={formData.center}
                    onChange={e => setFormData({ ...formData, center: e.target.value as any })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-slate-900 font-bold focus:ring-2 focus:ring-management-blue/20 transition-all"
                  >
                    <option value="Hicado">Hicado</option>
                    <option value="Vạn Xuân">Vạn Xuân</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sức chứa</label>
                  <input 
                    type="number" 
                    value={formData.capacity}
                    onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-slate-900 font-bold focus:ring-2 focus:ring-management-blue/20 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú</label>
                <textarea 
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Thông tin thêm (VD: Có máy chiếu...)"
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-slate-900 font-bold focus:ring-2 focus:ring-management-blue/20 transition-all placeholder:text-slate-300 min-h-[100px]"
                />
              </div>
            </div>

            <div className="p-8 bg-slate-50 flex gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-6 py-4 rounded-2xl font-black text-slate-400 hover:text-slate-600 transition-all uppercase text-xs tracking-widest"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 bg-management-blue text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-blue-900/10 hover:translate-y-[-2px] transition-all uppercase text-xs tracking-widest"
              >
                {isEditMode ? 'Cập nhật' : 'Thêm phòng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
