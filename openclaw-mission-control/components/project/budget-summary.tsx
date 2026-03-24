'use client'

import { DollarSign, TrendingUp, Activity } from 'lucide-react'
import { SparkLine } from '@/components/ui/spark-line'
import { formatCost } from '@/lib/utils'
import type { BudgetSummary as BudgetSummaryType } from '@/lib/types'

interface BudgetSummaryProps {
  budget: BudgetSummaryType
}

export function BudgetSummary({ budget }: BudgetSummaryProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Budget & Usage
      </h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Cost Today</span>
          </div>
          <span className="text-lg font-semibold text-foreground font-mono">
            {formatCost(budget.costToday)}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Total Cost</span>
          </div>
          <span className="text-lg font-semibold text-foreground font-mono">
            {formatCost(budget.costTotal)}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Runs Today</span>
          </div>
          <span className="text-lg font-semibold text-foreground font-mono">
            {budget.runsToday}
          </span>
        </div>
      </div>
      {budget.dailyTrend.length > 1 && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">7-day trend</span>
          </div>
          <div className="h-8">
            <SparkLine
              data={budget.dailyTrend}
              color="#3b82f6"
              width={280}
              height={32}
            />
          </div>
        </div>
      )}
    </div>
  )
}
