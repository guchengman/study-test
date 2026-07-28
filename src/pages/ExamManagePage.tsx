/**
 * 组卷管理页面（路由 /exams/manage）
 *
 * owner 视图：
 *  - 试卷列表：标题 / 状态 / 科目 / 满分 / 限时 / 及格分 / 参考人数 / 平均分
 *  - 操作：编辑、删除、查看分析、发布 / 关闭
 *  - 新建 / 编辑：ExamForm（选题 + 设分 + 时间窗 + 状态）
 *  - 分析：GET /api/exams/:id/analysis，注明「每学生最高分 attempt」口径
 *  - 调用 examApi，刷新列表。
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ClipboardList,
  PlusCircle,
  Pencil,
  Trash2,
  BarChart3,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { examApi } from '../services/examApi';
import { ExamForm } from '../components/exam/ExamForm';
import type { Exam, ExamAnalysis, ExamFormPayload, ExamStatus } from '../types';

function statusMeta(status: ExamStatus): { label: string; cls: string } {
  switch (status) {
    case 'published':
      return { label: '已发布', cls: 'bg-emerald-50 text-emerald-600' };
    case 'closed':
      return { label: '已关闭', cls: 'bg-slate-100 text-slate-500' };
    default:
      return { label: '草稿', cls: 'bg-amber-50 text-amber-600' };
  }
}

export function ExamManagePage() {
  const ctx = useAppContext();

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState<boolean>(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [analysisExam, setAnalysisExam] = useState<Exam | null>(null);
  const [analysis, setAnalysis] = useState<ExamAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const manageableSubjects = ctx.allSubjects.filter((s) => ctx.isAdmin || ctx.isTeacher || s.isOwner);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await examApi.listMine();
      setExams(res.exams);
    } catch (e: any) {
      setError(e?.message || '加载试卷列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleSubmitForm = async (payload: ExamFormPayload, examId?: number) => {
    setSubmitting(true);
    setError(null);
    try {
      if (examId) {
        await examApi.update(examId, payload);
      } else {
        const created = await examApi.create(payload);
        // 创建默认 draft；若表单选择非草稿，则立即更新状态
        if (payload.status && payload.status !== 'draft') {
          await examApi.update(created.id, { status: payload.status });
        }
      }
      setShowForm(false);
      setEditing(null);
      await loadList();
    } catch (e: any) {
      setError(e?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (exam: Exam) => {
    if (!window.confirm(`确定删除试卷「${exam.title}」？该操作会级联删除所有答卷，不可恢复。`)) return;
    setError(null);
    try {
      await examApi.remove(exam.id);
      await loadList();
    } catch (e: any) {
      setError(e?.message || '删除失败');
    }
  };

  const handleToggleStatus = async (exam: Exam, next: ExamStatus) => {
    setError(null);
    try {
      await examApi.update(exam.id, { status: next });
      await loadList();
    } catch (e: any) {
      setError(e?.message || '更新状态失败');
    }
  };

  const handleAnalysis = async (exam: Exam) => {
    setAnalysisExam(exam);
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    try {
      const res = await examApi.analysis(exam.id);
      setAnalysis(res.analysis);
    } catch (e: any) {
      setAnalysisError(e?.message || '加载分析失败');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (exam: Exam) => {
    setEditing(exam);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const subjectName = (id: string): string => {
    const s = ctx.allSubjects.find((x) => x.id === id);
    return s ? s.name : id;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={26} className="text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-800">考试管理</h1>
        </div>
        {!showForm && (
          <button
            onClick={openCreate}
            disabled={manageableSubjects.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50"
            title={manageableSubjects.length === 0 ? '你还没有可管理的科目' : '新建考试'}
          >
            <PlusCircle size={18} /> 新建考试
          </button>
        )}
      </div>

      {manageableSubjects.length === 0 && !showForm && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
          你还没有可管理的科目。只有科目所有者（或管理员 / 老师）才能组卷。
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {showForm ? (
        <ExamForm
          subjects={manageableSubjects}
          initialExam={editing}
          onSubmit={handleSubmitForm}
          onCancel={closeForm}
          submitting={submitting}
        />
      ) : (
        <>
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-12">
              <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
              加载中...
            </div>
          ) : exams.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
              <ClipboardList size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">还没有创建任何考试。</p>
              <button
                onClick={openCreate}
                className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                创建第一场考试
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {exams.map((exam) => {
                const meta = statusMeta(exam.status);
                return (
                  <div key={exam.id} className="bg-white rounded-3xl p-5 shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-slate-800 text-lg leading-snug">{exam.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                    </div>

                    <div className="text-sm text-slate-500 mb-3">
                      {subjectName(exam.subject_id)} · 满分 {exam.total_points} · {exam.duration_minutes} 分钟 · 及格 {exam.pass_score}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
                      <span className="flex items-center gap-1">
                        <Users size={12} /> 参考 {exam.attempt_count ?? 0} 人
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 size={12} /> 平均分 {Number(exam.avg_score ?? 0).toFixed(1)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => openEdit(exam)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200 transition-colors text-sm"
                      >
                        <Pencil size={14} /> 编辑
                      </button>
                      <button
                        onClick={() => handleAnalysis(exam)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg font-bold hover:bg-blue-100 transition-colors text-sm"
                      >
                        <BarChart3 size={14} /> 分析
                      </button>
                      {exam.status !== 'published' && (
                        <button
                          onClick={() => handleToggleStatus(exam, 'published')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg font-bold hover:bg-emerald-100 transition-colors text-sm"
                        >
                          <CheckCircle2 size={14} /> 发布
                        </button>
                      )}
                      {exam.status === 'published' && (
                        <button
                          onClick={() => handleToggleStatus(exam, 'closed')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg font-bold hover:bg-slate-200 transition-colors text-sm"
                        >
                          <Clock size={14} /> 关闭
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(exam)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-500 rounded-lg font-bold hover:bg-rose-100 transition-colors text-sm ml-auto"
                      >
                        <Trash2 size={14} /> 删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 分析面板 */}
          {analysisExam && (
            <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xl shadow-slate-200/50 border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-600" />
                  <h3 className="font-bold text-slate-800">「{analysisExam.title}」考试分析</h3>
                </div>
                <button onClick={() => setAnalysisExam(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>

              {analysisLoading && (
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
                  <span className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                  加载分析中...
                </div>
              )}
              {analysisError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
                  <AlertTriangle size={16} /> {analysisError}
                </div>
              )}

              {analysis && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full font-bold">口径：{analysis.scope}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat label="参考人数" value={String(analysis.referenceCount)} />
                    <Stat label="平均分" value={analysis.averageScore.toFixed(1)} />
                    <Stat label="及格率" value={`${(analysis.passRate * 100).toFixed(0)}%`} />
                    <Stat label="满分" value={String(analysis.total_points)} />
                  </div>

                  <div>
                    <div className="text-sm font-bold text-slate-600 mb-2">每题错误率（基于每人最佳成绩；编程题待定项不计入分母）</div>
                    {analysis.questionErrorRates.length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">暂无逐题错误率数据。</p>
                    ) : (
                      <div className="space-y-2">
                        {analysis.questionErrorRates.map((q) => (
                          <div key={q.question_id} className="flex items-center gap-3">
                            <span className="text-xs text-slate-400 w-16 flex-shrink-0">题 #{q.question_id}</span>
                            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${q.errorRate >= 0.5 ? 'bg-rose-500' : q.errorRate >= 0.3 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.round(q.errorRate * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-12 text-right flex-shrink-0">
                              {(q.errorRate * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
      <div className="text-2xl font-black text-blue-600">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}
