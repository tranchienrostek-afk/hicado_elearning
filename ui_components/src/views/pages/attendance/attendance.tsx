import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAuthStore, useCenterStore } from '@/store';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE_REQUEST';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Co mat',
  ABSENT: 'Vang',
  LEAVE_REQUEST: 'Xin nghi',
};

const formatDateTime = (value?: string) => {
  if (!value) return '--';
  return new Date(value).toLocaleString('vi-VN');
};

export const AttendancePage = () => {
  const { classes, students, teachers, addAttendance, attendance } = useCenterStore();
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
  const classStudentIds = useMemo(
    () => Array.from(new Set(selectedClass?.studentIds || [])),
    [selectedClass?.studentIds]
  );
  const classStudents = students.filter((item) => classStudentIds.includes(item.id));
  const selectedTeacherName = teachers.find((item) => item.id === selectedClass?.teacherId)?.name || 'N/A';

  const classRecords = useMemo(
    () =>
      attendance.filter(
        (item) => item.classId === selectedClassId && item.date === date
      ),
    [attendance, date, selectedClassId]
  );

  const recordMap = useMemo(() => {
    const map = new Map<string, (typeof classRecords)[number]>();
    classRecords.forEach((item) => {
      map.set(item.studentId, item);
    });
    return map;
  }, [classRecords]);

  const presentCount = classRecords.filter((item) => item.status === 'PRESENT').length;
  const absentCount = classRecords.filter((item) => item.status === 'ABSENT').length;
  const leaveCount = classRecords.filter((item) => item.status === 'LEAVE_REQUEST').length;
  const completionCount = classRecords.length;

  const lastRecord = [...classRecords].sort((a, b) => {
    const aTs = new Date(a.markedAt || 0).getTime();
    const bTs = new Date(b.markedAt || 0).getTime();
    return bTs - aTs;
  })[0];

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
      markedByUserId: auth?.userId,
      markedByName: auth?.name,
      markedByRole: auth?.role,
      markedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Diem danh lop hoc</h2>
          <p className="text-sm text-slate-400 font-medium">
            {isTeacher
              ? 'Giao vien cap nhat diem danh cho lop minh phu trach.'
              : 'Quan ly/Ke toan giam sat hanh dong diem danh cua giao vien theo tung lop.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            disabled={accessibleClasses.length === 0}
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-sm"
          >
            {accessibleClasses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-sm"
          />
          <span
            className={clsx(
              'px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border',
              isTeacher
                ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                : 'bg-blue-50 border-blue-100 text-blue-700'
            )}
          >
            {isTeacher ? 'Che do giao vien' : 'Che do giam sat'}
          </span>
        </div>
      </div>

      {selectedClass && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Giao vien</p>
            <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{selectedTeacherName}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tien do</p>
            <p className="text-sm font-black text-slate-900">
              {completionCount}/{classStudents.length}
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Co mat</p>
            <p className="text-sm font-black text-emerald-600">{presentCount}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vang / Xin nghi</p>
            <p className="text-sm font-black text-rose-600">
              {absentCount} / {leaveCount}
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nguoi cap nhat cuoi</p>
            <p className="text-[11px] font-black text-slate-900 uppercase">
              {lastRecord?.markedByName || 'Chua co'}
            </p>
            <p className="text-[10px] text-slate-400 font-bold">{formatDateTime(lastRecord?.markedAt)}</p>
          </div>
        </div>
      )}

      {isObserver && classRecords.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <p className="text-xs font-bold text-blue-800">
            Trang thai giam sat: {isTeacherMarked ? 'Diem danh do giao vien cap nhat' : 'Can kiem tra nguoi cap nhat'}
          </p>
          <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest">
            Lop {selectedClass?.name} • {date}
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-center text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none">
            <span>Hoc vien ({classStudents.length})</span>
            <span>{isTeacher ? 'Thao tac diem danh' : 'Trang thai & nhat ky cap nhat'}</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {classStudents.map((student) => {
            const record = recordMap.get(student.id);
            const currentStatus = record?.status;

            return (
              <div
                key={student.id}
                className="p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{student.name}</h3>
                    <p className="text-slate-400 text-[11px] font-bold">ID: {student.id}</p>
                  </div>
                </div>

                {isTeacher ? (
                  <div className="grid grid-cols-3 gap-2 w-full md:w-auto md:flex md:flex-wrap">
                    <button
                      onClick={() => handleToggle(student.id, 'PRESENT')}
                      className={clsx(
                        'w-full md:w-auto px-2 md:px-5 py-3 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all border outline-none whitespace-nowrap',
                        currentStatus === 'PRESENT'
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      )}
                    >
                      Co mat
                    </button>
                    <button
                      onClick={() => handleToggle(student.id, 'ABSENT')}
                      className={clsx(
                        'w-full md:w-auto px-2 md:px-5 py-3 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all border outline-none whitespace-nowrap',
                        currentStatus === 'ABSENT'
                          ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      )}
                    >
                      Vang
                    </button>
                    <button
                      onClick={() => handleToggle(student.id, 'LEAVE_REQUEST')}
                      className={clsx(
                        'w-full md:w-auto px-2 md:px-5 py-3 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all border outline-none whitespace-nowrap',
                        currentStatus === 'LEAVE_REQUEST'
                          ? 'bg-amber-400 border-amber-400 text-white shadow-lg shadow-amber-400/30'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      )}
                    >
                      Xin nghi
                    </button>
                  </div>
                ) : (
                  <div className="text-right">
                    <span
                      className={clsx(
                        'px-3 py-1 text-[10px] font-black rounded-full border uppercase',
                        currentStatus === 'PRESENT' && 'bg-emerald-50 text-emerald-600 border-emerald-100',
                        currentStatus === 'ABSENT' && 'bg-rose-50 text-rose-600 border-rose-100',
                        currentStatus === 'LEAVE_REQUEST' && 'bg-amber-50 text-amber-600 border-amber-100',
                        !currentStatus && 'bg-slate-50 text-slate-400 border-slate-100'
                      )}
                    >
                      {currentStatus ? STATUS_LABEL[currentStatus] : 'Chua diem danh'}
                    </span>
                    <p className="mt-2 text-[10px] text-slate-500 font-bold uppercase">
                      {record?.markedByName || 'Chua cap nhat'}
                    </p>
                    <p className="text-[10px] text-slate-400">{formatDateTime(record?.markedAt)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {classStudents.length === 0 && (
          <div className="text-center py-20 text-slate-300 italic">
            Khong co du lieu hoc vien cho lop nay.
          </div>
        )}
      </div>

      <div className="flex justify-end">
        {isTeacher ? (
          <button className="bg-management-blue text-white px-10 py-4 rounded-xl font-bold shadow-lg shadow-blue-900/10 hover:translate-y-[-2px] transition-all uppercase tracking-tighter text-sm">
            Hoan thanh ca day
          </button>
        ) : (
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Quan ly/Ke toan chi giam sat, khong thao tac diem danh.
          </p>
        )}
      </div>
    </div>
  );
};
