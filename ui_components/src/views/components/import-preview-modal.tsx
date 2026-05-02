import { useMemo, useState } from 'react';
import FocusLock from 'react-focus-lock';
import type { ImportPlan } from '@/utils/import-planner';

interface ImportPreviewModalProps<T> {
  isOpen: boolean;
  title: string;
  plan: ImportPlan<T> | null;
  isCommitting: boolean;
  onConfirm: (options: { includeWarnings: boolean; importValidRowsOnly: boolean }) => void;
  onCancel: () => void;
  onExportErrors: () => void;
}

const actionLabel = (action: string) => {
  const labels: Record<string, string> = {
    CREATE: 'Tạo mới',
    UPDATE: 'Cập nhật',
    SKIP: 'Bỏ qua',
    WARNING: 'Cảnh báo',
    BLOCKED: 'Bị chặn',
    FAILED: 'Lỗi',
  };
  return labels[action] || action;
};

const actionClass = (action: string) => {
  if (action === 'CREATE') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (action === 'UPDATE') return 'bg-blue-50 text-blue-700 border-blue-100';
  if (action === 'BLOCKED' || action === 'FAILED') return 'bg-rose-50 text-rose-700 border-rose-100';
  if (action === 'WARNING') return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-slate-50 text-slate-500 border-slate-200';
};

export const ImportPreviewModal = <T,>({
  isOpen,
  title,
  plan,
  isCommitting,
  onConfirm,
  onCancel,
  onExportErrors,
}: ImportPreviewModalProps<T>) => {
  const [importValidRowsOnly, setImportValidRowsOnly] = useState(false);
  const [includeWarnings, setIncludeWarnings] = useState(true);

  const summary = useMemo(() => {
    if (!plan) return [];
    return [
      ['Tạo mới', plan.creates.length],
      ['Cập nhật', plan.updates.length],
      ['Bỏ qua', plan.skips.length],
      ['Cảnh báo', plan.warnings.length],
      ['Bị chặn', plan.blocked.length],
      ['Có thể nhập', plan.commitRows.length],
    ];
  }, [plan]);

  if (!isOpen || !plan) return null;

  const hasBlockedRows = plan.blocked.length > 0;
  const canConfirm = plan.commitRows.length > 0 && (!hasBlockedRows || importValidRowsOnly);

  return (
    <div className="fixed inset-0 bg-hicado-navy/60 backdrop-blur-sm z-[220] flex items-center justify-center p-4">
      <FocusLock returnFocus>
        <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden border border-hicado-slate flex flex-col">
          <div className="p-6 border-b border-hicado-slate flex items-start justify-between bg-hicado-slate/10">
            <div>
              <p className="text-[10px] font-black text-hicado-emerald uppercase tracking-[0.3em] mb-2">Kiểm tra dữ liệu import</p>
              <h3 className="text-2xl font-serif font-black text-hicado-navy">{title}</h3>
            </div>
            <button onClick={onCancel} className="text-hicado-navy/40 hover:text-hicado-navy">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="p-6 space-y-5 overflow-y-auto">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {summary.map(([label, value]) => (
                <div key={label} className="border border-hicado-slate rounded-2xl p-4 bg-white">
                  <p className="text-[9px] font-black text-hicado-navy/40 uppercase tracking-widest">{label}</p>
                  <p className="text-xl font-black text-hicado-navy mt-1">{value}</p>
                </div>
              ))}
            </div>

            {hasBlockedRows && (
              <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl p-4 text-sm font-bold">
                File có dòng bị chặn. Bạn cần sửa file hoặc chọn chỉ nhập các dòng hợp lệ.
              </div>
            )}

            <div className="overflow-x-auto border border-hicado-slate rounded-2xl">
              <table className="w-full text-left min-w-[900px]">
                <thead className="bg-hicado-slate/30">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/50 uppercase tracking-widest">Dòng</th>
                    <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/50 uppercase tracking-widest">Trạng thái</th>
                    <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/50 uppercase tracking-widest">Thông báo</th>
                    <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/50 uppercase tracking-widest">Gợi ý</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-hicado-slate">
                      <td className="px-4 py-3 text-xs font-black text-hicado-navy">{row.rowNumber}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${actionClass(row.action)}`}>
                          {actionLabel(row.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-hicado-navy/70">
                        {row.messages.length === 0 ? 'Hợp lệ' : row.messages.map((message) => message.message).join('; ')}
                      </td>
                      <td className="px-4 py-3 text-xs text-hicado-navy/40 font-bold">
                        {row.messages.map((message) => message.suggestion).filter(Boolean).join('; ') || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
              <div className="space-y-2">
                {hasBlockedRows && (
                  <label className="flex items-center gap-2 text-xs font-bold text-hicado-navy">
                    <input
                      type="checkbox"
                      checked={importValidRowsOnly}
                      onChange={(event) => setImportValidRowsOnly(event.target.checked)}
                      className="w-4 h-4"
                    />
                    Chỉ nhập các dòng hợp lệ
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs font-bold text-hicado-navy">
                  <input
                    type="checkbox"
                    checked={includeWarnings}
                    onChange={(event) => setIncludeWarnings(event.target.checked)}
                    className="w-4 h-4"
                  />
                  Cho phép nhập dòng có cảnh báo
                </label>
              </div>
              <div className="flex gap-3">
                <button onClick={onExportErrors} className="px-5 py-3 rounded-xl border border-hicado-slate text-[10px] font-black uppercase tracking-widest text-hicado-navy">
                  Xuất báo cáo lỗi
                </button>
                <button onClick={onCancel} className="px-5 py-3 rounded-xl border border-hicado-slate text-[10px] font-black uppercase tracking-widest text-hicado-navy/50">
                  Hủy
                </button>
                <button
                  onClick={() => onConfirm({ includeWarnings, importValidRowsOnly })}
                  disabled={!canConfirm || isCommitting}
                  className="px-7 py-3 rounded-xl bg-hicado-navy text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  {isCommitting ? 'Đang nhập...' : 'Xác nhận nhập'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </FocusLock>
    </div>
  );
};
