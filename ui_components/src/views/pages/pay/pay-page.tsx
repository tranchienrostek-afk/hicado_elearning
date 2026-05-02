import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface ClassQR {
  classId: string;
  className: string;
  classCode: string | null;
  amount: number;
  memo: string;
  qrImage: string;
}

interface PayData {
  student: { id: string; name: string; studentCode: string | null; tuitionStatus: string };
  bankName: string;
  accountNo: string;
  classQRs: ClassQR[];
}

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Đã thanh toán',
  PENDING: 'Chờ thanh toán',
  DEBT: 'Còn nợ',
};
const STATUS_COLOR: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  DEBT: 'bg-rose-100 text-rose-700',
};

export const PayPage = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<PayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeClass, setActiveClass] = useState(0);

  useEffect(() => {
    if (!studentId) return;
    fetch(`/api/finance/public/student/${studentId}`)
      .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.message || 'Lỗi')))
      .then(d => { setData(d); })
      .catch(msg => setError(typeof msg === 'string' ? msg : 'Không tải được thông tin học sinh'))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1e293b] to-[#0F172A] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-400/30 border-t-emerald-400 animate-spin mx-auto" />
          <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1e293b] to-[#0F172A] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="text-5xl opacity-30">😞</div>
          <p className="text-white/60 font-bold">{error || 'Không tìm thấy thông tin học sinh'}</p>
        </div>
      </div>
    );
  }

  const { student, bankName, accountNo, classQRs } = data;
  const activeQR = classQRs[activeClass];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1e293b] to-[#0F172A] px-4 py-10 flex flex-col items-center">
      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em]">Hicado Center</p>
          <h1 className="text-3xl font-serif font-black text-white tracking-tight">Nộp học phí</h1>
        </div>

        {/* Student Card */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Học sinh</p>
              <p className="font-black text-white text-lg">{student.name}</p>
              {student.studentCode && (
                <p className="text-[11px] font-mono text-white/40 mt-0.5">{student.studentCode}</p>
              )}
            </div>
            <span className={`text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl ${STATUS_COLOR[student.tuitionStatus] || 'bg-white/10 text-white/50'}`}>
              {STATUS_LABEL[student.tuitionStatus] || student.tuitionStatus}
            </span>
          </div>
          {bankName && (
            <div className="pt-3 border-t border-white/5">
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Ngân hàng</p>
              <p className="font-bold text-white/60 text-sm">{bankName} — {accountNo}</p>
            </div>
          )}
        </div>

        {/* Class Tabs */}
        {classQRs.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {classQRs.map((qr, i) => (
              <button
                key={qr.classId}
                onClick={() => setActiveClass(i)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  i === activeClass
                    ? 'bg-emerald-500 text-[#0F172A] shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                }`}
              >
                {qr.className}
              </button>
            ))}
          </div>
        )}

        {/* QR Card */}
        {activeQR ? (
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-6 space-y-5">
            <div>
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-1">
                {activeQR.className}{activeQR.classCode ? ` (${activeQR.classCode})` : ''}
              </p>
              <p className="text-3xl font-black text-white">
                {activeQR.amount.toLocaleString('vi-VN')}<span className="text-base text-white/40 ml-1">đ</span>
              </p>
            </div>

            {/* QR Image */}
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-2xl shadow-2xl">
                <img src={activeQR.qrImage} alt="VietQR" className="w-56 h-56 object-contain" />
              </div>
            </div>

            {/* Memo */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4">
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Nội dung chuyển khoản</p>
              <p className="font-black text-white text-lg tracking-widest font-mono">{activeQR.memo}</p>
              <p className="text-[10px] text-white/30 mt-2">Vui lòng điền đúng nội dung để hệ thống tự động xác nhận</p>
            </div>
          </div>
        ) : (
          <div className="bg-white/5 rounded-3xl p-8 text-center">
            <p className="text-white/30 text-sm">Chưa có thông tin lớp học</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-white/20 font-bold uppercase tracking-widest pb-4">
          Hicado Education Center — Hỗ trợ: 1900 xxxx
        </p>
      </div>
    </div>
  );
};
