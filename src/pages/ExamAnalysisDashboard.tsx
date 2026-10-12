/**
 * FR-302 考情看板（路由 /dashboard/exam-analysis）
 *
 * 功能：
 *  - 选择本人试卷 → 得分分布柱状图
 *  - 区分度表 + 诱答分布（样本 n≥阈值才产出，否则提示样本不足）
 *  - 班级横向对比（teacher/admin；无权限自动隐藏）
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { BarChart3, Users, AlertTriangle, Loader2 } from 'lucide-react';
import { examApi } from '../services/examApi';
import { statsApi, type ExamAnalysis, type ClassStudent } from '../services/statsApi';
import { BarChart, type BarDatum } from '../components/charts/SimpleCharts';
import type { Exam } from '../types';

export function ExamAnalysisDashboard() {
  const [params, setParams] = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | null>(Number(params.get('exam')) || null);
  const [analysis, setAnalysis] = useState<ExamAnalysis | null>(null);
  const [classRows, setClassRows] = useState<ClassStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 载入本人试卷列表
  useEffect(() => {
    examApi.listMine().then((r) => {
      setExams(r.exams);
      if (examId == null && r.exams.length > 0) {
        setExamId(r.exams[0].id);
        setParams({ exam: String(r.exams[0].id) });
      }
    }).catch((e: any) => setError(e.message || '试卷列表加载失败'));
    // 班级对比：无权限则忽略
    statsApi.classCompare().then((r) => setClassRows(r.students)).catch(() => setClassRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (examId == null) return;
    setLoading(true);
    setError('');
    try {
      const r = await statsApi.examAnalysis(examId);
      setAnalysis(r.analysis);
    } catch (e: any) {
      setError(e.message || '分析加载失败');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  const distData: BarDatum[] = analysis ? analysis.distribution.map((d) => ({ label: d.label, value: d.count })) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
        <BarChart3 size={20} className="text-sky-600" /> 考情看板
      </h1>

      <div className="mb-4">
        <label className="text-sm text-slate-500 mr-2">选择试卷：</label>
        <select
          value={examId ?? ''}
          onChange={(e) => {
            const id = Number(e.target.value);
            setExamId(id);
            setParams({ exam: String(id) });
          }}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"
        >
          {exams.length === 0 && <option value="">（无试卷）</option>}
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.title}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
          <Loader2 size={18} className="animate-spin mr-2" /> 加载中…
        </div>
      ) : analysis ? (
        <div className="space-y-6">
          {analysis.sample_insufficient && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <AlertTriangle size={16} />
              样本量不足（参考 {analysis.referenceCount} 人 &lt; {analysis.minSample}），区分度/诱答统计不产出。
            </div>
          )}

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-600 mb-3">得分分布（参考 {analysis.referenceCount} 人）</h2>
            <BarChart data={distData} />
          </motion.div>

          {!analysis.sample_insufficient && analysis.discrimination && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-600 mb-3">题目区分度（高分组 − 低分组，升序）</h2>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b">
                      <th className="py-2">题号</th><th>高分组正确率</th><th>低分组正确率</th><th>区分度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.discrimination.map((d) => (
                      <tr key={d.question_id} className="border-b border-slate-50">
                        <td className="py-1.5">#{d.question_id}</td>
                        <td>{Math.round(d.topRate * 100)}%</td>
                        <td>{Math.round(d.bottomRate * 100)}%</td>
                        <td className={d.discrimination < 0.2 ? 'text-rose-600 font-medium' : 'text-slate-700'}>
                          {d.discrimination.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-2">区分度 &lt; 0.2 的题目区分能力弱，建议复核。</p>
            </div>
          )}

          {!analysis.sample_insufficient && analysis.distractors && analysis.distractors.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-600 mb-3">诱答分布（答错者选择的错误项）</h2>
              <div className="space-y-3 max-h-72 overflow-auto">
                {analysis.distractors.map((d) => (
                  <div key={d.question_id} className="text-sm">
                    <span className="font-medium text-slate-600">#{d.question_id}</span>
                    <span className="text-slate-400 ml-2">正确答案：{d.correct_answer ?? '—'}</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {d.wrong_picks.slice(0, 6).map((p, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                          {p.option}: {p.count}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        !loading && <div className="text-sm text-slate-400 py-10 text-center">暂无分析数据</div>
      )}

      {classRows.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
            <Users size={15} className="text-emerald-500" /> 班级横向对比
          </h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b">
                  <th className="py-2">学员</th><th>练习量</th><th>正确数</th><th>正确率</th>
                </tr>
              </thead>
              <tbody>
                {classRows.map((s) => (
                  <tr key={s.user_id} className="border-b border-slate-50">
                    <td className="py-1.5">{s.username}</td>
                    <td>{s.practiced}</td>
                    <td>{s.correct}</td>
                    <td>{s.accuracy}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
