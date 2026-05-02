import React from 'react';
import { LogOut, X } from 'lucide-react';

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
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-500',
      button: 'bg-red-500 hover:bg-red-600',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      icon: 'text-amber-500',
      button: 'bg-amber-500 hover:bg-amber-600',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'text-blue-500',
      button: 'bg-blue-500 hover:bg-blue-600',
    },
  };

  const style = colors[type];

  return (
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1001] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div 
        className={`${style.bg} border ${style.border} rounded-2xl p-6 max-w-sm w-full shadow-xl`}
        onClick={e => e.stopPropagation()}
        style={{ animation: 'modalSlideIn 0.2s ease-out' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${style.bg}`}>
            {type === 'danger' && <LogOut size={20} className={style.icon} />}
            {type === 'warning' && <LogOut size={20} className={style.icon} />}
            {type === 'info' && <LogOut size={20} className={style.icon} />}
          </div>
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        </div>
        
        <p className="text-slate-600 mb-6 text-sm leading-relaxed">{message}</p>
        
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 ${style.button} text-white rounded-xl font-medium text-sm transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>
      
      <style>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
