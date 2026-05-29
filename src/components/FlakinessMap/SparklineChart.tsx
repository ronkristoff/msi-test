"use client";

type SparklineChartProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
};

export function SparklineChart({
  data,
  width = 120,
  height = 32,
  color = "var(--accent)",
}: SparklineChartProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="block">
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((value - min) / range) * chartHeight;
    return { x, y };
  });

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const isTrendingUp = lastPoint.y < firstPoint.y;

  const lineColor = isTrendingUp ? "var(--success)" : color;
  const fillColor = isTrendingUp ? "rgba(0,140,0,0.08)" : "rgba(220,38,38,0.08)";

  return (
    <svg width={width} height={height} className="block">
      <path d={areaD} fill={fillColor} />
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={lineColor} />
    </svg>
  );
}
