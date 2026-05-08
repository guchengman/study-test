import React, { useState } from 'react';
import { Edit3, Eye } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function MarkdownEditor({ value, onChange, placeholder, rows = 6, className = '' }: MarkdownEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  return (
    <div className={className}>
      <div className="flex items-center gap-1 mb-1.5">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
            mode === 'edit'
              ? 'bg-slate-800 text-white shadow'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Edit3 size={12} /> 编辑
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
            mode === 'preview'
              ? 'bg-slate-800 text-white shadow'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Eye size={12} /> 预览
        </button>
      </div>
      {mode === 'edit' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 outline-none text-sm transition-all resize-y min-h-[80px]"
        />
      ) : (
        <div className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-white min-h-[80px] max-h-[400px] overflow-y-auto">
          {value.trim() ? (
            <MarkdownRenderer content={value} className="text-sm" />
          ) : (
            <span className="text-sm text-slate-400">暂无内容</span>
          )}
        </div>
      )}
    </div>
  );
}
