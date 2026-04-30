import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store';

interface QRCodeModalProps {
  classId: string;
  onClose: () => void;
}

interface QRData {
  qrImage: string;
  student: string;
  className: string;
  amount: number;
  memo: string;
}

const FETCH_TIMEOUT_MS = 15_000;

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ classId, onClose }) => {
  const { auth } = useAuthStore();
  const [data, setData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const run = async () => {
      try {
        const res = await fetch(`/api/finance/qr/${auth?.studentId}/${classId}`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${auth?.token}` },
        });
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        clearTimeout(timer);
        setLoading(false);
      }
    };

    run();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [auth?.studentId, auth?.token, classId]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-hicado-navy/70 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">

        {/* Header */}
        <div className="premium-gradient p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-hicado-emerald/15 rounded-full -mr-16 -mt-16 blur-2xl" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-hicado-emerald uppercase tracking-[0.4em] mb-1">VietQR Payment</p>
              <h3 className="text-xl font-black text-white tracking-tight">Đóng học phí</h3>
            </div>
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {loading && (
            <div className="aspect-square flex flex-col items-center justify-center gap-4 bg-hicado-slate/20 rounded-[2rem] border-2 border-dashed border-hicado-slate">
              <div className="w-10 h-10 border-4 border-hicado-slate border-t-hicado-navy rounded-full animate-spin" />
              <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest">Đang tải mã QR...</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-12 text-center space-y-4">
              <div className="text-4xl opacity-30">⚠️</div>
              <p className="text-sm font-black text-hicado-navy/40 uppercase tracking-widest">Không thể tải mã QR</p>
              <p className="text-xs text-hicado-navy/20 font-bold">Vui lòng thử lại sau ít phút.</p>
            </div>
          )}

          {!loading && data && (
            <>
              {/* QR Image */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-hicado-emerald/30 to-teal-400/30 rounded-[2.5rem] blur opacity-0 group-hover:opacity-100 transition-all duration-700" />
                <div className="relative bg-white rounded-[2rem] border border-hicado-slate p-4 shadow-premium">
                  <img src={data.qrImage} alt="Mã QR thanh toán học phí" className="w-full h-full object-contain rounded-xl" />
                </div>
              </div>

              {/* Payment Info */}
              <div className="bg-hicado-slate/30 rounded-[1.5rem] p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Học sinh</span>
                  <span className="text-sm font-black text-hicado-navy">{data.student}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Lớp học</span>
                  <span className="text-sm font-black text-hicado-navy">{data.className}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-hicado-navy/30 uppercase tracking-widest">Nội dung CK</span>
                  <span className="text-sm font-black text-hicado-navy font-mono">{data.memo}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-hicado-slate">
                  <span className="text-[9px] font-black text-hicado-emerald uppercase tracking-widest">Số tiền</span>
                  <span className="text-xl font-black text-hicado-emerald text-glow">
                    {data.amount.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>

              <p className="text-[9px] text-hicado-navy/20 font-bold leading-relaxed text-center">
                Dùng ứng dụng ngân hàng quét mã QR để tự động điền thông tin. Hệ thống ghi nhận sau 1–3 phút.
              </p>
            </>
          )}

          <button
            onClick={onClose}
            className="w-full py-4 bg-hicado-navy hover:bg-hicado-emerald hover:text-hicado-navy text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl shadow-hicado-navy/20 active:scale-[0.98]"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
