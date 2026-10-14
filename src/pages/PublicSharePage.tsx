import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicShareApi, type PublicSharePreview, type PublicShareGrade } from '../services/api';
import { singleSelect, buildAnswersPayload, type AnswerMap } from './publicShareView';

type Phase = 'loading' | 'invalid' | 'preview' | 'quiz' | 'result';

export function PublicSharePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [data, setData] = useState<PublicSharePreview | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [grade, setGrade] = useState<PublicShareGrade | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await publicShareApi.preview(code);
        if (!alive) return;
        setData(res);
        setPhase('preview');
      } catch {
        if (alive) setPhase('invalid');
      }
    })();
    return () => { alive = false; };
  }, [code]);

  const copyCodeAndGoRegister = async () => {
    try { await navigator.clipboard.writeText(code); } catch { /* 忽略复制失败 */ }
    navigate('/');
  };

  if (phase === 'loading') return <Shell><p className="text-slate-500">加载中…</p></Shell>;

  if (phase === 'invalid') return (
    <Shell>
      <h1 className="text-xl font-bold text-slate-800 mb-2">链接不存在或已失效</h1>
      <p className="text-slate-500 mb-4">该分享可能已被取消或过期。</p>
      <button onClick={() => navigate('/')} className="px-4 py-2 bg-blue-600 text-white rounded-lg">前往首页</button>
    </Shell>
  );

  const s = data!.subject;
  return (
    <Shell>
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">{s.icon || '📚'}</div>
        <h1 className="text-2xl font-bold text-slate-800">{s.name}</h1>
        {s.welcomeTitle && <p className="text-slate-600 mt-1">{s.welcomeTitle}</p>}
        {s.welcomeDesc && <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">{s.welcomeDesc}</p>}
        <p className="text-xs text-slate-400 mt-2">共 {s.questionCount} 道题{data!.creator ? ` · by ${data!.creator.displayName}` : ''}</p>
      </div>

      {phase === 'preview' && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-slate-500 text-sm">先来 {data!.experience.questions.length} 道体验题试试看？</p>
          <button onClick={() => setPhase('quiz')} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-medium">开始免费体验</button>
        </div>
      )}

      {(phase === 'quiz' || phase === 'result') && (
        <div className="space-y-5">
          {phase === 'result' && grade && (
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <div className="text-3xl font-bold text-blue-700">{grade.scorePercent} 分</div>
              <div className="text-sm text-slate-500 mt-1">答对 {grade.correct}/{grade.total}</div>
            </div>
          )}
          {data!.experience.questions.map((q, qi) => {
            const picked = answers[q.id];
            const verdict = grade?.results.find((r) => r.qid === q.id);
            return (
              <div key={q.id} className="p-4 bg-white rounded-xl border border-slate-100">
                <div className="font-medium text-slate-800 mb-3">{qi + 1}. {q.title}
                  {phase === 'result' && verdict && (
                    <span className={`ml-2 text-sm ${verdict.correct ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {verdict.correct ? '✓ 正确' : '✗ 错误'}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {(q.options || []).map((opt, oi) => {
                    const label = String.fromCharCode(65 + oi); // A/B/C...
                    const chosen = q.type === 'multiple' ? Array.isArray(picked) && picked.includes(label) : picked === label;
                    return (
                      <button key={label} disabled={phase === 'result'}
                        onClick={() => setAnswers((prev) => singleSelect(prev, q, label))}
                        className={`w-full text-left px-3 py-2 rounded-lg border ${chosen ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <span className="font-medium text-slate-500 mr-2">{label}</span>{opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {phase === 'quiz' && (
            <button
              onClick={async () => {
                const g = await publicShareApi.grade(data!.experience.quizToken, buildAnswersPayload(answers));
                setGrade(g);
                setPhase('result');
              }}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium">提交体验卷</button>
          )}
          {phase === 'result' && (
            <button onClick={copyCodeAndGoRegister}
              className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-medium">
              注册解锁完整题库与解析（邀请码已复制）
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-slate-50 flex items-start justify-center px-4 py-10">
    <div className="w-full max-w-lg">{children}</div>
  </div>
);
