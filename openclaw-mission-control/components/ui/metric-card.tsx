'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { SparkLine } from '@/components/ui/spark-line'

interface MetricCardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'up' | 'down' | 'neutral'
  icon: React.ReactNode
  sparkData?: number[]
  accentColor?: string
  delay?: number
  className?: string
}

export function MetricCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon,
  sparkData,
  accentColor = '#3b82f6',
  delay = 0,
  className = '',
}: MetricCardProps) {
  const ChangeIcon =
    changeType === 'up'
      ? ArrowUpRight
      : changeType === 'down'
        ? ArrowDownRight
        : Minus
  const changeColor =
    changeType === 'up'
      ? 'text-emerald-400'
      : changeType === 'down'
        ? 'text-red-400'
        : 'text-muted-foreground'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className={`bg-card rounded-xl p-5 card-glow hover:card-hover transition-all duration-300 relative overflow-hidden group border border-border/50 ${className}`}
    >
      {/* Subtle background gradient glow on hover */}
      <div
        className="absolute -top-24 -right-24 w-48 h-48 rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-500 blur-3xl pointer-events-none"
        style={{ backgroundColor: accentColor }}
      />

      <div className="flex justify-between items-start mb-4">
        <div
          className="p-2.5 rounded-lg border border-white/5 relative"
          style={{
            backgroundColor: `${accentColor}15`,
            color: accentColor,
          }}
        >
          {icon}
        </div>

        {sparkData && (
          <div className="opacity-70 group-hover:opacity-100 transition-opacity duration-300">
            <SparkLine
              data={sparkData}
              color={accentColor}
              width={64}
              height={24}
            />
          </div>
        )}
      </div>

      <div>
        <h3 className="text-muted-foreground text-sm font-medium mb-1">
          {title}
        </h3>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-foreground font-mono tabular-nums tracking-tight">
            {value}
          </span>
          {change && (
            <div
              className={`flex items-center text-xs font-medium ${changeColor}`}
            >
              <ChangeIcon className="w-3 h-3 mr-0.5" />
              {change}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
