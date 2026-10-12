/**
 * 轻量级 SVG 图表基元（FR-301/302）——零第三方依赖，避免引入重型图表库。
 * 提供 LineChart / BarChart / RadarChart 三种纯展示组件。
 */

// ─── 折线图（趋势） ────────────────────────────────────────
export interface LinePoint {
  label: string;
  value: number;
}

export function LineChart({
  data, width = 640, height = 220, color = '#2563eb',
}: { data: LinePoint[]; width?: number; height?: number; color?: string }) {
  const pad = { top: 16, right: 16, bottom: 28, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;

  if (data.length === 0) {
    return <EmptyChart width={width} height={height} />;
  }
  const values = data.map((d) => d.value);
  const maxV = Math.max(1, ...values);
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const pts = data.map((d, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - (d.value / maxV) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const area = `${pad.left},${pad.top + h} ${line} ${(pad.left + (data.length - 1) * stepX).toFixed(1)},${pad.top + h}`;

  // 稀疏 x 轴标签（最多 6 个）
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="趋势折线图">
      {/* 网格基线 */}
      {[0, 0.5, 1].map((r) => {
        const y = pad.top + h - r * h;
        return (
          <g key={r}>
            <line x1={pad.left} y1={y} x2={pad.left + w} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {Math.round(r * maxV)}
            </text>
          </g>
        );
      })}
      <polygon points={area} fill={color} opacity={0.08} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => {
        const x = pad.left + i * stepX;
        const y = pad.top + h - (d.value / maxV) * h;
        return <circle key={i} cx={x} cy={y} r={2.5} fill={color} />;
      })}
      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text key={`l${i}`} x={pad.left + i * stepX} y={height - 8} textAnchor="middle" fontSize={9} fill="#94a3b8">
            {d.label.slice(5)}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ─── 柱状图（得分分布） ────────────────────────────────────
export interface BarDatum {
  label: string;
  value: number;
}

export function BarChart({
  data, width = 640, height = 240, color = '#0ea5e9',
}: { data: BarDatum[]; width?: number; height?: number; color?: string }) {
  const pad = { top: 16, right: 16, bottom: 36, left: 40 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  if (data.length === 0) return <EmptyChart width={width} height={height} />;
  const maxV = Math.max(1, ...data.map((d) => d.value));
  const slot = w / data.length;
  const barW = Math.min(56, slot * 0.6);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="柱状图">
      {[0, 0.5, 1].map((r) => {
        const y = pad.top + h - r * h;
        return <line key={r} x1={pad.left} y1={y} x2={pad.left + w} y2={y} stroke="#e2e8f0" strokeWidth={1} />;
      })}
      {data.map((d, i) => {
        const barH = (d.value / maxV) * h;
        const x = pad.left + i * slot + (slot - barW) / 2;
        const y = pad.top + h - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx={3} />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={11} fill="#475569">
              {d.value}
            </text>
            <text x={x + barW / 2} y={height - 12} textAnchor="middle" fontSize={10} fill="#64748b">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── 雷达图（标签掌握度） ──────────────────────────────────
export interface RadarAxis {
  label: string;
  value: number; // 0-100
}

export function RadarChart({
  axes, size = 280, color = '#8b5cf6',
}: { axes: RadarAxis[]; size?: number; color?: string }) {
  if (axes.length < 3) {
    // 少于 3 维无法成雷达：降级为水平条
    return <MiniBars axes={axes} color={color} />;
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 40;
  const n = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, ratio: number) => ({
    x: cx + Math.cos(angle(i)) * r * ratio,
    y: cy + Math.sin(angle(i)) * r * ratio,
  });
  const polyPts = axes
    .map((a, i) => {
      const p = pt(i, Math.max(0, Math.min(100, a.value)) / 100);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="掌握度雷达图">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={axes.map((_, i) => { const p = pt(i, ring); return `${p.x},${p.y}`; }).join(' ')}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => {
        const p = pt(i, 1);
        return <line key={`a${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth={1} />;
      })}
      <polygon points={polyPts} fill={color} opacity={0.18} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {axes.map((a, i) => {
        const p = pt(i, 1.18);
        return (
          <text key={`t${i}`} x={p.x} y={p.y} textAnchor="middle" fontSize={10} fill="#475569">
            {a.label.length > 6 ? a.label.slice(0, 5) + '…' : a.label}
          </text>
        );
      })}
    </svg>
  );
}

/** 少于 3 维时雷达降级为迷你条 */
function MiniBars({ axes, color }: { axes: RadarAxis[]; color: string }) {
  if (axes.length === 0) return <EmptyChart width={280} height={120} />;
  return (
    <div className="space-y-2">
      {axes.map((a, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs text-slate-500 mb-0.5">
            <span>{a.label}</span>
            <span>{Math.round(a.value)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, a.value))}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-lg"
      style={{ width: '100%', aspectRatio: `${width} / ${height}` }}
    >
      暂无数据
    </div>
  );
}
