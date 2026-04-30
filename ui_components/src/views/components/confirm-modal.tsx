import React from 'react';
import FocusLock from 'react-focus-lock';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-hicado-navy/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onCancel}
      />
      <FocusLock returnFocus>
        <div className="relative glass-card bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl animate-in zoom-in duration-300">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center text-3xl animate-bounce">
              ⚠️
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-serif font-black text-hicado-navy tracking-tight">{title}</h3>
              <p className="text-sm text-hicado-navy/40 font-bold leading-relaxed">{message}</p>
            </div>
            <div className="flex gap-4 w-full pt-4">
              <button
                onClick={onCancel}
                className="flex-1 py-4 rounded-2xl bg-hicado-slate text-hicado-navy text-[10px] font-black uppercase tracking-[0.3em] hover:bg-hicado-slate/80 transition-all"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-4 rounded-2xl bg-rose-500 text-white text-[10px] font-black uppercase tracking-[0.3em] shadow-lg shadow-rose-500/20 hover:scale-105 transition-all"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </FocusLock>
    </div>
  );
};
