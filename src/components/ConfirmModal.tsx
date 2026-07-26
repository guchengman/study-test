import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'warning',
}) => {
  if (!isOpen) return null;

  const colors = {
    danger: {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      iconBg: 'bg-rose-100',
      icon: 'text-rose-500',
      button: 'bg-rose-500 hover:bg-rose-600',
      title: 'text-rose-700',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      iconBg: 'bg-amber-100',
      icon: 'text-amber-500',
      button: 'bg-amber-500 hover:bg-amber-600',
      title: 'text-amber-700',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      iconBg: 'bg-blue-100',
      icon: 'text-blue-500',
      button: 'bg-blue-500 hover:bg-blue-600',
      title: 'text-blue-700',
    },
  };

  const style = colors[type];
  const Icon = type === 'info' ? Info : AlertTriangle;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1001] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className={`${style.bg} border ${style.border} rounded-3xl p-6 max-w-sm w-full shadow-xl`}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'modalSlideIn 0.2s ease-out' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center ${style.iconBg}`}>
            <Icon size={22} className={style.icon} />
          </div>
          <div className="pt-1">
            <h3 className={`text-lg font-bold ${style.title}`}>{title}</h3>
          </div>
        </div>

        <p className="text-slate-600 mb-6 text-sm leading-relaxed whitespace-pre-line">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 ${style.button} text-white rounded-xl font-semibold text-sm transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
