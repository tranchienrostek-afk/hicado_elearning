import { useMemo, useState } from 'react';
import { useAuthStore, useCenterStore } from '@/store';
import { QRCodeModal } from '@/views/components';

export const StudentPage = () => {
  const { auth } = useAuthStore();
  const { students, classes, rooms, attendance, transactions } = useCenterStore();
  const [showQR, setShowQR] = useState<string | null>(null);

  const studentId = auth?.studentId;
  const student = students.find(s => s.id === studentId);

  const studentClasses = useMemo(
    () => classes.filter(c => studentId && c.studentIds.includes(studentId)),
    [classes, studentId]
  );

  const totalPaid = useMemo(
    () => transactions
      .filter(t => t.studentId === studentId && t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount, 0),
    [transactions, studentId]
  );

  const totalDue = useMemo(
    () => studentClasses.reduce((sum, cls) => {
      const attended = attendance.filter(
        a => a.studentId === studentId && a.classId === cls.id && a.status === 'PRESENT'
      ).length;
      return sum + attended * cls.tuitionPerSession;
    }, 0),
    [studentClasses, attendance, studentId]
  );

  const debt = Math.max(totalDue - totalPaid, 0);

  if (!student) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass-card rounded-[3rem] p-16 text-center space-y-4 max-w-md">
          <div className="text-5xl opacity-30">🎓</div>
          <h2 className="text-xl font-black text-hicado-navy uppercase tracking-tight">Không tìm thấy hồ sơ</h2>
          <p className="text-sm text-hicado-navy/40 font-bold">Vui lòng liên hệ quản trị viên để kiểm tra tài khoản.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24 md:pb-8 animate-in fade-in duration-700">

      {/* Hero Profile Card */}
      <div className="relative rounded-[3rem] overflow-hidden shadow-2xl border border-hicado-obsidian/10">
        <div className="premium-gradient p-10 md:p-16">
          <div className="absolute top-0 right-0 w-80 h-80 bg-hicado-emerald/10 rounded-full -mr-40 -mt-40 blur-3xl" />
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-8">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-hicado-emerald rounded-[1.5rem] flex items-center justify-center text-hicado-navy text-4xl font-black shadow-2xl shadow-hicado-emerald/20 flex-shrink-0">
              {student.name.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.5em] mb-2">Học sinh Hicado</p>
              <h1 className="text-3xl md:text-4xl font-serif font-black text-white tracking-tighter leading-none">
                {student.name}
              </h1>
              <p className="text-xs text-white/30 font-black uppercase tracking-widest mt-2">
                ID #{student.id?.slice(-8).toUpperCase()}
              </p>
            </div>
            <div className="flex flex-row sm:flex-col gap-4 sm:gap-2 sm:text-right">
              <div>
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-widest">Đã thanh toán</p>
                <p className="text-lg font-black text-white">{totalPaid.toLocaleString('vi-VN')}đ</p>
              </div>
              {debt > 0 && (
                <div>
                  <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Còn nợ</p>
                  <p className="text-lg font-black text-rose-400">{debt.toLocaleString('vi-VN')}đ</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Strip */}
        <div className="bg-white border-t border-hicado-slate grid grid-cols-2 md:grid-cols-4 divide-x divide-hicado-slate">
          {[
            { label: 'Trường đang học', value: student.schoolName || 'Chưa cập nhật' },
            { label: 'Lớp phổ thông', value: student.schoolClass || 'Chưa cập nhật' },
            { label: 'Số lớp Hicado', value: `${studentClasses.length} lớp` },
            { label: 'Trạng thái học phí', value: debt > 0 ? 'Còn dư nợ' : 'Đã thanh toán', highlight: debt > 0 },
          ].map((item) => (
            <div key={item.label} className="p-5 md:p-6">
              <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">{item.label}</p>
              <p className={`text-sm font-black ${item.highlight ? 'text-rose-500' : 'text-hicado-navy'}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* My Classes */}
      <div className="glass-card rounded-[3rem] p-8 md:p-12 space-y-8">
        <div className="flex items-center justify-between border-b border-hicado-slate pb-8">
          <div>
            <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">Enrollment</p>
            <h2 className="text-2xl font-serif font-black text-hicado-navy tracking-tight">Lớp học của tôi</h2>
          </div>
          <span className="px-4 py-2 bg-hicado-navy text-hicado-emerald rounded-xl text-[10px] font-black uppercase tracking-widest">
            {studentClasses.length} lớp
          </span>
        </div>

        {studentClasses.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <div className="text-5xl opacity-20">📚</div>
            <p className="text-sm font-black text-hicado-navy/30 uppercase tracking-widest italic">
              Bạn chưa được xếp vào lớp học nào.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {studentClasses.map(cls => {
              const room = rooms.find(r => r.id === cls.roomId);
              const myAttended = attendance.filter(
                a => a.studentId === studentId && a.classId === cls.id && a.status === 'PRESENT'
              ).length;
              const myDue = myAttended * cls.tuitionPerSession;

              return (
                <div
                  key={cls.id}
                  className="group bg-white rounded-[2.5rem] border border-hicado-slate overflow-hidden hover:shadow-premium hover:-translate-y-1 transition-all duration-500"
                >
                  {/* Class Header */}
                  <div className="premium-gradient p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-hicado-emerald/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1 relative z-10">
                      {room?.center || 'Hicado'}
                    </p>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight relative z-10">
                      {cls.name}
                    </h3>
                  </div>

                  {/* Class Body */}
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-hicado-slate/30 rounded-2xl p-4">
                        <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">Phòng học</p>
                        <p className="text-sm font-black text-hicado-navy">{room?.name || 'Chưa xếp phòng'}</p>
                      </div>
                      <div className="bg-hicado-slate/30 rounded-2xl p-4">
                        <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">Cơ sở</p>
                        <p className="text-sm font-black text-hicado-navy">{room?.center || '--'}</p>
                      </div>
                    </div>

                    <div className="bg-hicado-slate/30 rounded-2xl p-4">
                      <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">Thời khoá biểu</p>
                      <p className="text-sm font-black text-hicado-navy">
                        {(cls.schedule?.days?.join(', ') || 'Chưa có lịch') + ' · ' + (cls.schedule?.time || '--')}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div>
                        <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">Học phí tích lũy</p>
                        <p className="text-base font-black text-hicado-emerald">{myDue.toLocaleString('vi-VN')}đ</p>
                      </div>
                      <button
                        onClick={() => setShowQR(cls.id)}
                        className="flex items-center gap-2 px-5 py-3 bg-hicado-navy hover:bg-hicado-emerald text-white hover:text-hicado-navy rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 shadow-lg shadow-hicado-navy/20 hover:shadow-hicado-emerald/20 active:scale-95"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5c0 1.933-1.567 3.5-3.5 3.5S13 17.433 13 15.5 14.567 12 16.5 12s3.5 1.567 3.5 3.5z" />
                        </svg>
                        Đóng học phí
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showQR && (
        <QRCodeModal
          classId={showQR}
          onClose={() => setShowQR(null)}
        />
      )}
    </div>
  );
};
