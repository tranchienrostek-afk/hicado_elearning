import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAuthStore, useCenterStore } from '@/store';
import { SkeletonTable } from '@/views/components/skeleton';
import { attendanceSameDay } from '@/utils/attendance-date';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE_REQUEST';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Đi học',
  ABSENT: 'Vắng mặt',
  LEAVE_REQUEST: 'Xin nghỉ',
};

const formatDateTime = (value?: string) => {
  if (!value) return '--';
  return new Date(value).toLocaleString('vi-VN');
};

export const AttendancePage = () => {
  const { classes, students, teachers, addAttendance, fetchAttendance, attendance, isLoading } = useCenterStore();
  const { auth } = useAuthStore();

  const isTeacher = auth?.role === 'TEACHER';
  const isObserver = auth?.role === 'ADMIN' || auth?.role === 'MANAGER';

  const accessibleClasses = useMemo(() => {
    if (isTeacher) {
      if (!auth?.teacherId) return [];
      return classes.filter((item) => item.teacherId === auth.teacherId);
    }
    if (isObserver) return classes;
    return [];
  }, [auth?.teacherId, classes, isObserver, isTeacher]);

  const [selectedClassId, setSelectedClassId] = useState(accessibleClasses[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!selectedClassId && accessibleClasses.length > 0) {
      setSelectedClassId(accessibleClasses[0].id);
      return;
    }
    if (selectedClassId && !accessibleClasses.some((item) => item.id === selectedClassId)) {
      setSelectedClassId(accessibleClasses[0]?.id || '');
    }
  }, [accessibleClasses, selectedClassId]);

  const selectedClass = accessibleClasses.find((item) => item.id === selectedClassId);

  useEffect(() => {
    if (selectedClassId) fetchAttendance(selectedClassId, date);
  }, [date, fetchAttendance, selectedClassId]);

  const classStudentIds = useMemo(
    () => Array.from(new Set(selectedClass?.studentIds || [])),
    [selectedClass?.studentIds]
  );
  const classStudents = students.filter((item) => classStudentIds.includes(item.id));
  const selectedTeacherName = teachers.find((item) => item.id === selectedClass?.teacherId)?.name || 'N/A';

  const classRecords = useMemo(
    () => attendance.filter((item) => item.classId === selectedClassId && attendanceSameDay(item.date, date)),
    [attendance, date, selectedClassId]
  );

  const recordMap = useMemo(() => {
    const map = new Map<string, (typeof classRecords)[number]>();
    classRecords.forEach((item) => map.set(item.studentId, item));
    return map;
  }, [classRecords]);

  const presentCount = classRecords.filter((item) => item.status === 'PRESENT').length;
  const absentCount = classRecords.filter((item) => item.status === 'ABSENT').length;
  const leaveCount = classRecords.filter((item) => item.status === 'LEAVE_REQUEST').length;
  const completionCount = classRecords.length;

  const lastRecord = [...classRecords].sort((a, b) =>
    new Date(b.markedAt || 0).getTime() - new Date(a.markedAt || 0).getTime()
  )[0];

  const isTeacherMarked =
    classRecords.length > 0 &&
    classRecords.every((item) => !item.markedByRole || item.markedByRole === 'TEACHER');

  const handleToggle = (studentId: string, status: AttendanceStatus) => {
    if (!isTeacher || !selectedClassId) return;
    addAttendance({
      id: `ATT-${selectedClassId}-${studentId}-${date}`,
      classId: selectedClassId,
      studentId,
      date,
      status,
      markedByUserId: auth?.id,
      markedByName: auth?.name,
      markedByRole: auth?.role,
      markedAt: new Date().toISOString(),
    });
  };

  if (isLoading) {
    return <div className="space-y-10"><SkeletonTable rows={10} /></div>;
  }

  return (
    <div className="space-y-8 pb-24 md:pb-8 animate-in fade-in duration-700">

      {/* Header Controls */}
      <div className="relative rounded-[2.5rem] overflow-hidden border border-hicado-slate shadow-premium">
        <div className="premium-gradient p-8 md:p-10">
          <div className="absolute top-0 right-0 w-48 h-48 bg-hicado-emerald/10 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-2">Attendance</p>
              <h2 className="text-2xl font-serif font-black text-white tracking-tight">Điểm danh lớp học</h2>
              <p className="text-sm text-white/40 font-bold mt-1">
                {isTeacher
                  ? 'Cập nhật điểm danh cho lớp bạn phụ trách.'
                  : 'Giám sát hành động điểm danh của giáo viên theo từng lớp.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                disabled={accessibleClasses.length === 0}
                className="bg-white/10 border border-white/20 text-white rounded-2xl px-5 py-3 outline-none focus:border-hicado-emerald/50 transition-all font-bold text-sm"
              >
                {accessibleClasses.map((item) => (
                  <option key={item.id} value={item.id} className="text-hicado-navy bg-white">
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-white/10 border border-white/20 text-white rounded-2xl px-5 py-3 outline-none focus:border-hicado-emerald/50 transition-all font-bold text-sm"
              />
              <span className={clsx(
                'px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border self-center',
                isTeacher
                  ? 'bg-hicado-emerald/20 border-hicado-emerald/30 text-hicado-emerald'
                  : 'bg-white/10 border-white/20 text-white/60'
              )}>
                {isTeacher ? 'Giáo viên' : 'Giám sát'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Strip */}
      {selectedClass && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
          {[
            { label: 'Giáo viên', value: selectedTeacherName, color: 'text-hicado-navy' },
            { label: 'Tiến độ', value: `${completionCount}/${classStudents.length}`, color: 'text-hicado-navy' },
            { label: 'Có mặt', value: presentCount, color: 'text-hicado-emerald' },
            { label: 'Vắng / Xin nghỉ', value: `${absentCount} / ${leaveCount}`, color: 'text-rose-500' },
            {
              label: 'Cập nhật cuối',
              value: lastRecord?.markedByName || 'Chưa có',
              sub: formatDateTime(lastRecord?.markedAt),
              color: 'text-hicado-navy',
            },
          ].map((stat) => (
            <div key={stat.label} className="glass-card rounded-[1.5rem] p-4 border border-hicado-slate">
              <p className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className={`text-sm font-black ${stat.color} uppercase tracking-tight truncate`}>{stat.value}</p>
              {stat.sub && <p className="text-[10px] text-hicado-navy/30 font-bold mt-0.5">{stat.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Observer notice */}
      {isObserver && classRecords.length > 0 && (
        <div className="glass-card rounded-2xl px-6 py-4 border border-hicado-emerald/20 bg-hicado-emerald/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs font-bold text-hicado-navy">
            Trạng thái giám sát:{' '}
            <span className="text-hicado-emerald">{isTeacherMarked ? 'Điểm danh do giáo viên cập nhật' : 'Cần kiểm tra người cập nhật'}</span>
          </p>
          <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">
            Lớp {selectedClass?.name} • {date}
          </p>
        </div>
      )}

      {/* Student List */}
      <div className="glass-card rounded-[2.5rem] overflow-hidden border border-hicado-slate">
        <div className="px-8 py-6 border-b border-hicado-slate flex justify-between items-center">
          <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest">
            Học viên ({classStudents.length})
          </p>
          <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest">
            {isTeacher ? 'Thao tác điểm danh' : 'Trạng thái & nhật ký'}
          </p>
        </div>

        <div className="divide-y divide-hicado-slate/50">
          {classStudents.map((student) => {
            const record = recordMap.get(student.id);
            const currentStatus = record?.status;

            return (
              <div
                key={student.id}
                className="px-8 py-5 flex flex-col md:flex-row md:justify-between md:items-center gap-4 hover:bg-hicado-slate/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={clsx(
                    'w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm flex-shrink-0 transition-all',
                    currentStatus === 'PRESENT' && 'bg-hicado-emerald text-hicado-navy shadow-lg shadow-hicado-emerald/20',
                    currentStatus === 'ABSENT' && 'bg-rose-500 text-white shadow-lg shadow-rose-500/20',
                    currentStatus === 'LEAVE_REQUEST' && 'bg-amber-400 text-white shadow-lg shadow-amber-400/20',
                    !currentStatus && 'bg-hicado-slate text-hicado-navy/40',
                  )}>
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-hicado-navy">{student.name}</h3>
                    <p className="text-[10px] text-hicado-navy/30 font-bold uppercase tracking-widest">ID: {student.id}</p>
                  </div>
                </div>

                {isTeacher ? (
                  <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
                    {([
                      { status: 'PRESENT' as AttendanceStatus, label: 'Đi học', active: 'bg-hicado-emerald border-hicado-emerald text-hicado-navy shadow-lg shadow-hicado-emerald/20' },
                      { status: 'ABSENT' as AttendanceStatus, label: 'Vắng', active: 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20' },
                      { status: 'LEAVE_REQUEST' as AttendanceStatus, label: 'Xin nghỉ', active: 'bg-amber-400 border-amber-400 text-white shadow-lg shadow-amber-400/20' },
                    ]).map(({ status, label, active }) => (
                      <button
                        key={status}
                        onClick={() => handleToggle(student.id, status)}
                        className={clsx(
                          'px-3 py-2.5 rounded-xl text-[10px] font-black transition-all border outline-none whitespace-nowrap',
                          currentStatus === status
                            ? active
                            : 'bg-white border-hicado-slate text-hicado-navy/40 hover:border-hicado-navy/30 hover:text-hicado-navy'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-right">
                    <span className={clsx(
                      'px-3 py-1.5 text-[10px] font-black rounded-xl border uppercase tracking-widest',
                      currentStatus === 'PRESENT' && 'bg-hicado-emerald/10 text-hicado-emerald border-hicado-emerald/20',
                      currentStatus === 'ABSENT' && 'bg-rose-50 text-rose-600 border-rose-100',
                      currentStatus === 'LEAVE_REQUEST' && 'bg-amber-50 text-amber-600 border-amber-100',
                      !currentStatus && 'bg-hicado-slate text-hicado-navy/30 border-hicado-slate',
                    )}>
                      {currentStatus ? STATUS_LABEL[currentStatus] : 'Chưa điểm danh'}
                    </span>
                    <p className="mt-1.5 text-[10px] text-hicado-navy/40 font-black uppercase tracking-widest">
                      {record?.markedByName || 'Chưa cập nhật'}
                    </p>
                    <p className="text-[10px] text-hicado-navy/30 font-bold">{formatDateTime(record?.markedAt)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {classStudents.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="text-4xl opacity-20">📋</div>
            <p className="text-sm font-black text-hicado-navy/30 uppercase tracking-widest italic">
              Không có dữ liệu học viên cho lớp này.
            </p>
          </div>
        )}
      </div>

      {/* Footer Action */}
      <div className="flex justify-end">
        {isTeacher ? (
          <button className="bg-hicado-navy text-white px-10 py-4 rounded-2xl font-black shadow-2xl shadow-hicado-navy/20 hover:bg-hicado-emerald hover:text-hicado-navy hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-[0.2em] text-xs">
            Hoàn thành ca dạy
          </button>
        ) : (
          <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest">
            Quản lý / Kế toán chỉ giám sát, không thao tác điểm danh.
          </p>
        )}
      </div>
    </div>
  );
};
