'use client'

import React from 'react'

interface SparkLineProps {
  data: number[]
  color: string
  width?: number
  height?: number
  className?: string
}

export function SparkLine({
  data,
  color,
  width = 60,
  height = 24,
  className = '',
}: SparkLineProps) {
  if (!data || data.length === 0) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const padding = 2

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - padding - ((d - min) / range) * (height - padding * 2)
    return `${x},${y}`
  })

  const pathD =
    `M ${points[0]} ` +
    points
      .slice(1)
      .map((p, i) => {
        const prev = points[i].split(',')
        const curr = p.split(',')
        const cp1x = Number(prev[0]) + (Number(curr[0]) - Number(prev[0])) / 2
        return `C ${cp1x},${prev[1]} ${cp1x},${curr[1]} ${curr[0]},${curr[1]}`
      })
      .join(' ')

  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`
  const gradientId = `spark-gradient-${Math.random().toString(36).substr(2, 9)}`

  return (
    <svg
      width={width}
      height={height}
      className={`overflow-visible ${className}`}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaD}
        fill={`url(#${gradientId})`}
        className="transition-all duration-300"
      />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-300"
      />
    </svg>
  )
}
