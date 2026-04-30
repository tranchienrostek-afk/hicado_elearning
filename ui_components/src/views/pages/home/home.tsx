import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCenterStore } from '@/store';
import { LearningPlant } from '@/views/components/learning-plant';
import { SkeletonHero, SkeletonCard } from '@/views/components/skeleton';



type CenterFilter = 'ALL' | 'Hicado' | 'Van Xuan';

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatMoney = (value: number) => value.toLocaleString('vi-VN');

export const Home = () => {
  const navigate = useNavigate();
  const { teachers, classes, rooms, attendance, transactions, isLoading } = useCenterStore();


  const [monthFilter, setMonthFilter] = useState(getCurrentMonth());
  const [centerFilter, setCenterFilter] = useState<CenterFilter>('ALL');

  const roomMap = useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms]
  );

  const classTeacherMap = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher.name])),
    [teachers]
  );

  const scopedClasses = useMemo(() => {
    if (centerFilter === 'ALL') return classes;
    const centerName = centerFilter === 'Hicado' ? 'Hicado' : 'Vạn Xuân';
    return classes.filter((item) => {
      const room = roomMap.get(item.roomId || '');
      return room?.center === centerName;
    });
  }, [centerFilter, classes, roomMap]);

  const scopedClassIds = useMemo(
    () => new Set(scopedClasses.map((item) => item.id)),
    [scopedClasses]
  );

  const scopedRoomIds = useMemo(
    () => new Set(scopedClasses.map((item) => item.roomId).filter(Boolean) as string[]),
    [scopedClasses]
  );

  const scopedStudentIds = useMemo(
    () => new Set(scopedClasses.flatMap((item) => item.studentIds)),
    [scopedClasses]
  );

  const scopedTeacherIds = useMemo(
    () => new Set(scopedClasses.map((item) => item.teacherId)),
    [scopedClasses]
  );

  const monthAttendance = useMemo(
    () =>
      attendance.filter(
        (item) => scopedClassIds.has(item.classId) && item.date.startsWith(monthFilter)
      ),
    [attendance, monthFilter, scopedClassIds]
  );

  const classSessionsByMonth = useMemo(() => {
    const tracker = new Map<string, Set<string>>();
    monthAttendance.forEach((record) => {
      if (!tracker.has(record.classId)) {
        tracker.set(record.classId, new Set<string>());
      }
      tracker.get(record.classId)?.add(record.date);
    });

    const sessions = new Map<string, number>();
    tracker.forEach((dateSet, classId) => {
      sessions.set(classId, dateSet.size);
    });
    return sessions;
  }, [monthAttendance]);

  const financeSummary = useMemo(() => {
    const expected = scopedClasses.reduce((sum, item) => {
      const sessions = classSessionsByMonth.get(item.id) || 0;
      const uniqueStudents = new Set(item.studentIds).size;
      return sum + sessions * item.tuitionPerSession * uniqueStudents;
    }, 0);

    const paid = transactions
      .filter((item) => item.status === 'SUCCESS' && item.date.startsWith(monthFilter))
      .filter((item) => scopedStudentIds.has(item.studentId))
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      expected,
      paid,
      debt: Math.max(expected - paid, 0),
    };
  }, [classSessionsByMonth, monthFilter, scopedClasses, scopedStudentIds, transactions]);


  const roomRiskRows = useMemo(() => {
    return scopedClasses
      .map((item) => {
        const room = roomMap.get(item.roomId || '');
        if (!room) {
          return {
            classId: item.id,
            className: item.name,
            roomName: 'Chưa xếp phòng',
            occupancy: 0,
            ratio: 0,
            teacherName: classTeacherMap.get(item.teacherId) || 'N/A',
          };
        }
        const uniqueStudents = new Set(item.studentIds).size;
        const ratio = room.capacity > 0 ? uniqueStudents / room.capacity : 0;
        return {
          classId: item.id,
          className: item.name,
          roomName: `${room.name} (${room.center})`,
          occupancy: uniqueStudents,
          ratio,
          teacherName: classTeacherMap.get(item.teacherId) || 'N/A',
        };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 5);
  }, [classTeacherMap, roomMap, scopedClasses]);

  const teacherWorkloadRows = useMemo(() => {
    const summary = new Map<
      string,
      {
        teacherName: string;
        classes: number;
        sessions: number;
        students: number;
      }
    >();

    scopedClasses.forEach((item) => {
      const key = item.teacherId;
      const base = summary.get(key) || {
        teacherName: classTeacherMap.get(key) || 'N/A',
        classes: 0,
        sessions: 0,
        students: 0,
      };
      base.classes += 1;
      base.sessions += classSessionsByMonth.get(item.id) || 0;
      base.students += new Set(item.studentIds).size;
      summary.set(key, base);
    });

    return Array.from(summary.values())
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5);
  }, [classSessionsByMonth, classTeacherMap, scopedClasses]);

  const quickActions = [
    {
      id: 'users',
      label: 'Hồ sơ GV / HS',
      description: 'Quản lý nhân sự và học sinh',
      to: '/users',
    },
    {
      id: 'classes',
      label: 'Quản lý lớp',
      description: 'Sĩ số, lịch học, giáo viên',
      to: '/classes',
    },
    {
      id: 'rooms',
      label: 'Quản lý phòng',
      description: 'Ma trận lịch phòng trong tuần',
      to: '/rooms',
    },
    {
      id: 'attendance',
      label: 'Điểm danh',
      description: 'Theo dõi chuyên cần theo lớp',
      to: '/attendance',
    },
    {
      id: 'finance',
      label: 'Lương thưởng',
      description: 'Học phí, lương GV, lợi nhuận',
      to: '/finance',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-10 pb-20">
        <SkeletonHero />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      {/* Cinematic Hero Section */}
      <div className="relative h-[450px] rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 group">
        <img 
          src="/assets/images/hero.png" 
          alt="Hicado Hero" 
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
        />

        <div className="absolute inset-0 bg-gradient-to-r from-hicado-navy via-hicado-navy/60 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-hicado-navy/40 to-transparent"></div>
        
        <div className="relative h-full z-10 p-12 md:p-20 flex flex-col justify-center max-w-3xl">
          <p className="text-hicado-emerald text-[10px] font-black uppercase tracking-[0.6em] mb-6 animate-in slide-in-from-left duration-700">
            Intelligence & Excellence
          </p>
          <h2 className="text-5xl md:text-7xl font-serif font-black text-white tracking-tighter leading-none mb-8 drop-shadow-2xl">
            Kiến tạo <span className="text-hicado-emerald italic text-glow">Tương lai</span> <br/> 
            Học thuật
          </h2>
          <div className="flex flex-wrap gap-4 mt-4">
            {(['ALL', 'Hicado', 'Van Xuan'] as const).map((center) => (
              <button
                key={center}
                onClick={() => setCenterFilter(center)}
                className={`btn-premium ${
                  centerFilter === center
                    ? 'bg-hicado-emerald text-hicado-navy shadow-hicado-emerald/30'
                    : 'bg-white/10 backdrop-blur-md text-white/60 hover:bg-white/20'
                }`}
              >
                {center === 'ALL' ? 'Toàn hệ thống' : center}
              </button>
            ))}
          </div>
        </div>

        {/* Floating Month Selector */}
        <div className="absolute bottom-10 right-10 glass-card p-6 rounded-[2rem] flex items-center gap-6 animate-in zoom-in duration-1000">
          <div className="w-12 h-12 bg-hicado-navy rounded-2xl flex items-center justify-center shadow-xl">
             <svg className="w-6 h-6 text-hicado-emerald" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          </div>
          <div>
            <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">Dữ liệu tháng</p>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="bg-transparent text-lg font-black text-hicado-navy outline-none cursor-pointer focus:text-hicado-emerald transition-colors"
            />
          </div>
        </div>
      </div>


      {/* Stats Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
        {[
          { label: 'Học sinh', value: scopedStudentIds.size, sub: 'Enrollment', icon: '👤', color: 'bg-indigo-500' },
          { label: 'Lớp học', value: scopedClasses.length, sub: 'Operations', icon: '📚', color: 'bg-emerald-500' },
          { label: 'Phòng học', value: scopedRoomIds.size, sub: 'Resource', icon: '🏢', color: 'bg-amber-500' },
          { label: 'Nhân sự', value: scopedTeacherIds.size, sub: 'Faculty', icon: '🎓', color: 'bg-hicado-navy' },
          { label: 'Dư nợ', value: formatMoney(financeSummary.debt), sub: 'VNĐ', icon: '⚠️', highlight: true, color: 'bg-rose-500' },
        ].map((stat, idx) => (
          <div key={idx} className="glass-card rounded-[2.5rem] p-8 hover:translate-y-[-8px] transition-all duration-500 group relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-24 h-24 ${stat.color} opacity-[0.03] rounded-full -mr-12 -mt-12 transition-all duration-700 group-hover:scale-150`}></div>
            <div className="flex justify-between items-start mb-6">
              <div className={`w-12 h-12 rounded-2xl ${stat.color} bg-opacity-10 flex items-center justify-center text-xl`}>
                {stat.icon}
              </div>
              <span className="w-2 h-2 rounded-full bg-hicado-slate group-hover:bg-hicado-emerald transition-colors" />
            </div>
            <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
            <p className={`text-2xl font-black tracking-tight ${stat.highlight ? 'text-rose-500 text-glow' : 'text-hicado-navy'}`}>{stat.value}</p>
            <p className="text-[9px] font-black text-hicado-navy/20 uppercase tracking-widest mt-2">{stat.sub}</p>
          </div>
        ))}
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        <div className="lg:col-span-3 space-y-10">
          {/* Quick Actions */}
          <div className="glass-card rounded-[3rem] p-12 space-y-10">
            <div className="flex items-center justify-between border-b border-hicado-slate pb-8">
              <h3 className="text-2xl font-serif font-black text-hicado-navy tracking-tight">
                <span className="text-hicado-emerald mr-4 italic font-black">/</span> Điều hướng nhanh
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => navigate(action.to)}
                  className="group relative overflow-hidden text-left bg-hicado-slate/30 border border-transparent rounded-[2rem] p-8 transition-all duration-500 hover:bg-white hover:shadow-premium hover:border-hicado-slate hover:-translate-y-1"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-hicado-emerald/5 rounded-full -mr-16 -mt-16 transition-all duration-700 group-hover:scale-[2] group-hover:bg-hicado-emerald/10"></div>
                  <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-[0.3em] mb-2 relative z-10 group-hover:text-hicado-emerald transition-colors">{action.label}</p>
                  <p className="text-sm text-hicado-navy font-bold relative z-10 leading-relaxed">{action.description}</p>
                  <div className="mt-6 flex items-center text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-x-[-10px] group-hover:translate-x-0 relative z-10">
                    Khám phá ngay
                    <svg className="w-4 h-4 ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Finance Overview */}
          <div className="glass-card rounded-[3rem] p-12 space-y-10">
            <h3 className="text-2xl font-serif font-black text-hicado-navy tracking-tight border-b border-hicado-slate pb-8">
              <span className="text-hicado-emerald mr-4 italic font-black">/</span> Tài chính hệ thống
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-hicado-emerald/5 rounded-[2rem] p-8 border border-hicado-emerald/10 transition-all hover:bg-white hover:shadow-premium">
                <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-3">Dự thu</p>
                <p className="text-3xl font-black text-hicado-navy tracking-tighter">{formatMoney(financeSummary.expected)}đ</p>
              </div>
              <div className="bg-hicado-navy/5 rounded-[2rem] p-8 border border-hicado-navy/10 transition-all hover:bg-white hover:shadow-premium">
                <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-[0.4em] mb-3">Thực thu</p>
                <p className="text-3xl font-black text-hicado-navy tracking-tighter">{formatMoney(financeSummary.paid)}đ</p>
              </div>
              <div className="bg-rose-500/5 rounded-[2rem] p-8 border border-rose-500/10 transition-all hover:bg-white hover:shadow-premium">
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.4em] mb-3">Công nợ</p>
                <p className="text-3xl font-black text-rose-500 tracking-tighter">{formatMoney(financeSummary.debt)}đ</p>
              </div>
            </div>
          </div>
        </div>

        {/* Focal Point Sidebar */}
        <div className="lg:col-span-1 space-y-10">
          <LearningPlant />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-12">
        <div className="glass-card rounded-[2.5rem] overflow-hidden">
          <div className="p-6 md:p-10 border-b border-hicado-slate/50">
            <h3 className="text-lg font-black text-hicado-navy uppercase tracking-tight italic">
              <span className="text-rose-500 mr-3">!</span> Cảnh báo sử dụng phòng
            </h3>
            <p className="text-[10px] text-hicado-navy/30 font-black mt-2 uppercase tracking-widest pl-5">
              Lớp có mật độ sĩ số cao nhất hệ thống
            </p>
          </div>
          <div className="p-4 md:p-6 space-y-3">
            {roomRiskRows.map((row) => {
              const ratio = row.ratio * 100;
              const ratioLabel = ratio >= 100 ? 'Quá tải' : ratio >= 85 ? 'Cảnh báo' : 'Ổn định';
              const ratioClass =
                ratio >= 100
                  ? 'text-rose-500 bg-rose-50 border-rose-100'
                  : ratio >= 85
                    ? 'text-amber-500 bg-amber-50 border-amber-100'
                    : 'text-hicado-emerald bg-hicado-emerald/5 border-hicado-emerald/20';

              return (
                <div key={row.classId} className="p-4 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl hover:shadow-premium transition-all border border-hicado-slate/50 group">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-black text-hicado-navy uppercase tracking-widest group-hover:text-hicado-emerald transition-colors">{row.className}</p>
                    <p className="text-[9px] text-hicado-navy/30 font-black uppercase tracking-[0.2em]">
                      {row.roomName} · {row.teacherName}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-black text-hicado-navy mb-2">{row.occupancy} học sinh</p>
                    <span className={`px-4 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest inline-block ${ratioClass}`}>
                      {ratioLabel} {ratio.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
            {roomRiskRows.length === 0 && (
              <div className="py-16 text-center text-sm text-hicado-navy/20 font-black italic uppercase tracking-widest">
                Chưa có dữ liệu lớp học
              </div>
            )}
          </div>
        </div>

        <div className="glass-card rounded-[2.5rem] overflow-hidden">
          <div className="p-6 md:p-10 border-b border-hicado-slate/50">
            <h3 className="text-lg font-black text-hicado-navy uppercase tracking-tight italic">
              <span className="text-hicado-emerald mr-3">#</span> Khối lượng giáo viên
            </h3>
            <p className="text-[10px] text-hicado-navy/30 font-black mt-2 uppercase tracking-widest pl-5">
              Phân bổ nhân sự và hiệu suất giảng dạy
            </p>
          </div>
          <div className="p-4 md:p-6 space-y-3">
            {teacherWorkloadRows.map((row) => (
              <div key={row.teacherName} className="p-4 md:p-6 flex items-center justify-between gap-4 bg-white rounded-2xl hover:shadow-premium transition-all border border-hicado-slate/50 group">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-black text-hicado-navy uppercase tracking-widest group-hover:text-hicado-emerald transition-colors">{row.teacherName}</p>
                  <p className="text-[9px] text-hicado-navy/30 font-black uppercase tracking-[0.2em]">
                    {row.classes} lớp · {row.students} học sinh
                  </p>
                </div>
                <div className="px-5 py-3 rounded-xl bg-hicado-navy text-hicado-emerald text-[10px] font-black uppercase tracking-[0.2em] shadow-lg whitespace-nowrap">
                  {row.sessions} buổi dạy
                </div>
              </div>
            ))}
            {teacherWorkloadRows.length === 0 && (
              <div className="py-16 text-center text-sm text-hicado-navy/20 font-black italic uppercase tracking-widest">
                Chưa có dữ liệu giáo viên
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subtle Support Area */}
      <div className="glass-card rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-8 border border-hicado-emerald/20">
        <div className="flex items-center gap-8">
          <div className="w-16 h-16 bg-hicado-navy rounded-3xl flex items-center justify-center text-2xl shadow-xl">
            🎧
          </div>
          <div>
            <h4 className="text-xl font-serif font-black text-hicado-navy">Trung tâm Hỗ trợ Kỹ thuật</h4>
            <p className="text-xs text-hicado-navy/40 font-bold uppercase tracking-widest mt-1">Đội ngũ Hicado luôn sẵn sàng đồng hành cùng bạn 24/7</p>
          </div>
        </div>
        <button className="btn-premium bg-hicado-navy text-white px-10 py-4 rounded-2xl">
          Gửi yêu cầu hỗ trợ
        </button>
      </div>
    </div>

  );
};
