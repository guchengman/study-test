// 解析结果预览列表（从 ImportModal 抽取）
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Question } from '../../types';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface PreviewListProps {
  preview: Question[];
  onReparse: () => void;
  onConfirm: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  programming: '编程题',
};

export const PreviewList: React.FC<PreviewListProps> = ({
  preview,
  onReparse,
  onConfirm,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">解析结果预览 ({preview.length} 道题)</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onReparse}
            className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-all text-sm"
          >
            重新解析
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2"
          >
            <CheckCircle2 size={18} />
            确认导入
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-3">
        {preview.map((q, idx) => (
          <div
            key={q.id || idx}
            className="p-4 border border-slate-200 rounded-xl bg-white hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {TYPE_LABEL[q.type] || q.type}
              </span>
              <span className="text-[10px] text-slate-400">第 {idx + 1} 题</span>
              {q.points && <span className="text-[10px] text-slate-400">{q.points} 分</span>}
            </div>
            <MarkdownRenderer content={q.title} className="text-sm text-slate-800 mb-3 leading-relaxed" />
            {q.options && q.options.length > 0 && (
              <div className="space-y-1.5 mb-3 ml-1">
                {q.options.map((opt, i) => {
                  const label = String.fromCharCode(65 + i);
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="font-bold text-slate-500 shrink-0 w-5">{label}.</span>
                      <div className="text-slate-700 min-w-0">
                        <MarkdownRenderer content={opt} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-sm text-slate-600 bg-slate-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl border-t border-slate-100">
              <span className="font-bold text-slate-700">答案：</span>
              <span className="text-emerald-700 font-medium">
                {Array.isArray(q.answer) ? q.answer.join(', ') : q.answer || '（待补充）'}
              </span>
              {q.explanation && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 font-medium">查看解析</summary>
                  <div className="mt-2 text-slate-500 text-sm">
                    <MarkdownRenderer content={q.explanation} />
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
