import type { GraphRow } from '../lib/types'

const LANE_COLORS = [
  '#60A5FA',
  '#4ADE80',
  '#A78BFA',
  '#FBBF24',
  '#22D3EE',
  '#F472B6',
  '#FB923C',
  '#2DD4BF',
]

export const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length]

export function Graph({ row, height = 34, width = 92 }: { row: GraphRow; height?: number; width?: number }) {
  const gap = 13
  const x = (lane: number) => 9 + lane * gap
  const cy = height / 2
  const mid = height * 0.55

  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible">
      {row.lines.map((lane) => (
        <line
          key={`l${lane}`}
          x1={x(lane)}
          y1={0}
          x2={x(lane)}
          y2={height}
          stroke={laneColor(lane)}
          strokeWidth={1.2}
          opacity={0.28}
        />
      ))}
      {row.parentLanes.map((pl, i) =>
        pl === row.lane ? null : (
          <path
            key={`p${i}`}
            d={`M ${x(row.lane)} ${cy} C ${x(row.lane)} ${mid}, ${x(pl)} ${mid}, ${x(pl)} ${height + 1}`}
            fill="none"
            stroke={laneColor(pl)}
            strokeWidth={1.5}
            opacity={0.9}
          />
        ),
      )}
      {row.merge && <circle cx={x(row.lane)} cy={cy} r={5.4} fill="none" stroke={laneColor(row.lane)} strokeWidth={1.2} opacity={0.35} />}
      <circle
        cx={x(row.lane)}
        cy={cy}
        r={row.merge ? 3.9 : 3.4}
        fill={laneColor(row.lane)}
        stroke="rgb(var(--sidebar))"
        strokeWidth={1.2}
      />
    </svg>
  )
}
