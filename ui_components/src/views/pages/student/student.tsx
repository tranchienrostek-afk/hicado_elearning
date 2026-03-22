import { useMemo } from 'react';
import { useAuthStore, useCenterStore } from '@/store';

export const StudentPage = () => {
  const { auth } = useAuthStore();
  const { students, classes, rooms } = useCenterStore();

  const studentId = auth?.studentId;
  const student = students.find(s => s.id === studentId);

  const studentClasses = useMemo(
    () => classes.filter(c => studentId && c.studentIds.includes(studentId)),
    [classes, studentId]
  );

  if (!student) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Khong tim thay ho so hoc sinh</h2>
        <p className="text-sm text-slate-400 mt-2">Vui long lien he quan tri de kiem tra tai khoan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{student.name}</h2>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Ma hoc sinh: #{student.id}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Truong dang hoc</p>
            <p className="text-sm font-black text-slate-900">{student.schoolName || 'Chua cap nhat'}</p>
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Lop dang hoc</p>
            <p className="text-sm font-black text-slate-900">{student.schoolClass || 'Chua cap nhat'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Lop hoc cua toi</h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{studentClasses.length} lop</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {studentClasses.map(cls => {
            const room = rooms.find(r => r.id === cls.roomId);
            return (
              <div key={cls.id} className="p-5 rounded-2xl border border-slate-100 bg-slate-50 space-y-3">
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{cls.name}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl border border-slate-100 p-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Phong hoc</p>
                    <p className="text-sm font-black text-slate-900">{room?.name || 'Chua xep phong'}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-100 p-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Co so</p>
                    <p className="text-sm font-black text-slate-900">{room?.center || '--'}</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-100 p-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Thoi khoa bieu</p>
                  <p className="text-sm font-black text-slate-900">
                    {(cls.schedule?.days?.join(', ') || 'Chua co lich') + ' • ' + (cls.schedule?.time || '--')}
                  </p>
                </div>
              </div>
            );
          })}

          {studentClasses.length === 0 && (
            <div className="col-span-full text-center py-10 text-sm text-slate-400 italic">
              Ban chua duoc xep lop hoc nao.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
