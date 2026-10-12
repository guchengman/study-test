/**
 * FR-301 学情看板（路由 /dashboard/study）
 *
 * 功能：
 *  - 指标趋势折线图（练习量 / 正确量 / 学习时长，7/30/90 天）
 *  - 知识点标签掌握度雷达（依赖 FR-108 标签）
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Target, Loader2 } from 'lucide-react';
import { statsApi, type StatsMetric, type TrendPoint, type MasteryItem } from '../services/statsApi';
import { LineChart, RadarChart, type LinePoint, type RadarAxis } from '../components/charts/SimpleCharts';

const METRICS: { key: StatsMetric; label: string }[] = [
  { key: 'practiced', label: '练习量' },
  { key: 'correct', label: '正确量' },
  { key: 'time_spent', label: '学习时长' },
];
const RANGES = [7, 30, 90];

export function StudentDashboard() {
  const [metric, setMetric] = useState<StatsMetric>('practiced');
  const [days, setDays] = useState(30);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [mastery, setMastery] = useState<MasteryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, m] = await Promise.all([statsApi.trend(metric, days), statsApi.mastery()]);
      setTrend(t.trend);
      setMastery(m.mastery);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [metric, days]);

  useEffect(() => { load(); }, [load]);

  const lineData: LinePoint[] = trend.map((p) => ({
    label: p.date,
    value: metric === 'time_spent' ? Math.round(p.value / 60) : p.value, // 时长转分钟
  }));
  const radarData: RadarAxis[] = mastery.slice(0, 8).map((m) => ({ label: m.tag_name, value: m.mastery }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-6">
        <TrendingUp size={20} className="text-blue-600" /> 学情看板
      </h1>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${metric === m.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            {m.label}
          </button>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        {RANGES.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm ${days === d ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}
          >
            近{d}天
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-600 mb-3">
            {METRICS.find((m) => m.key === metric)?.label}
            {metric === 'time_spent' ? '（分钟/天）' : '（次/天）'}
          </h2>
          {loading ? <ChartLoading /> : <LineChart data={lineData} />}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-1.5">
            <Target size={15} className="text-violet-500" /> 知识点掌握度
          </h2>
          {loading ? (
            <ChartLoading />
          ) : mastery.length === 0 ? (
            <div className="text-sm text-slate-400 py-10 text-center">暂无标签统计数据（需先打标并积累考试作答）</div>
          ) : (
            <>
              <RadarChart axes={radarData} />
              <div className="mt-3 space-y-1 max-h-40 overflow-auto">
                {mastery.map((m) => (
                  <div key={m.tag_id} className="flex justify-between text-xs text-slate-500">
                    <span>{m.tag_name}</span>
                    <span>{m.correct}/{m.practiced} · {m.mastery}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
      <Loader2 size={18} className="animate-spin mr-2" /> 加载中…
    </div>
  );
}
