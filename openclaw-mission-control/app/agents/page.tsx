'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { agents } from '@/lib/mock-data'
import { Agent } from '@/lib/types'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCost, cn } from '@/lib/utils'
import {
  Bot,
  Search,
  Plus,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Wrench,
  Activity,
  DollarSign,
  ArrowRight,
  Cpu,
  AlertTriangle,
} from 'lucide-react'

function MiniProgressRing({
  progress,
  color,
}: {
  progress: number
  color: string
}) {
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset =
    circumference - (progress / 100) * circumference
  return (
    <div className="relative w-6 h-6 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="12"
          cy="12"
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          className="text-border"
        />
        <circle
          cx="12"
          cy="12"
          r={radius}
          stroke={color}
          strokeWidth="2"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
    </div>
  )
}

function MiniBar({
  value,
  max,
  color,
}: {
  value: number
  max: number
  color: string
}) {
  const percentage = Math.min(100, (value / max) * 100)
  return (
    <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${percentage}%`, backgroundColor: color }}
      />
    </div>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false)
  const isBusy = agent.status === 'busy'
  const color = agent.avatar_color || '#3b82f6'
  const budgetUsed = Math.min(
    100,
    ((agent.avg_cost_per_run || 0) / agent.max_budget_per_run) * 100 * (agent.total_runs || 0)
  )
  const clampedBudget = Math.min(100, Math.max(0, budgetUsed))

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border/50 card-glow overflow-hidden flex flex-col relative"
    >
      {/* Top border identity color */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: color }}
      />

      <div className="p-5 flex-1">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              {isBusy && (
                <div
                  className="absolute -inset-1 rounded-full border border-dashed busy-ring opacity-50"
                  style={{ borderColor: color }}
                />
              )}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border border-white/10"
                style={{
                  backgroundColor: `${color}20`,
                  color: color,
                }}
              >
                {agent.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)}
              </div>
            </div>
            <div>
              <h3 className="text-foreground font-medium flex items-center gap-2">
                {agent.name}
                <StatusBadge
                  status={agent.is_active ? 'running' : 'inactive'}
                  size="sm"
                />
              </h3>
              <p className="text-muted-foreground text-xs mt-0.5 line-clamp-1">
                {agent.description}
              </p>
            </div>
          </div>
          <button className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Routing Pipeline */}
        <div className="mb-5 bg-background/50 rounded-lg p-3 border border-border/30">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
            Model Routing
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-status-success/10 border border-status-success/20 rounded px-2 py-1.5 flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-status-success" />
              <span className="text-xs text-status-success font-mono truncate">
                {agent.default_model}
              </span>
            </div>
            <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 bg-status-approval/10 border border-status-approval/20 rounded px-2 py-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-status-approval" />
              <span className="text-xs text-status-approval font-mono truncate">
                {agent.escalation_model}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
              <Activity className="w-3 h-3" /> Runs
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono tabular-nums text-foreground">
                {agent.total_runs || 0}
              </span>
              <MiniBar
                value={agent.total_runs || 0}
                max={2000}
                color={color}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Avg Cost
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono tabular-nums text-foreground">
                {formatCost(agent.avg_cost_per_run || 0)}
              </span>
              <MiniBar
                value={agent.avg_cost_per_run || 0}
                max={agent.max_budget_per_run}
                color={color}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 items-end">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Budget
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono tabular-nums text-foreground">
                {formatCost(agent.max_budget_per_run)}
              </span>
              <MiniProgressRing
                progress={clampedBudget}
                color={clampedBudget > 90 ? '#ef4444' : color}
              />
            </div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors border-t border-border/50 mt-2"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/50 bg-background/30"
          >
            <div className="p-5 space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">
                  System Prompt
                </div>
                <div className="bg-[#0d0d0f] border border-border/50 rounded p-2.5 text-xs text-muted-foreground font-mono leading-relaxed max-h-24 overflow-y-auto">
                  {agent.system_prompt}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium flex items-center gap-1">
                  <Wrench className="w-3 h-3" /> Tools (
                  {agent.allowed_tools.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {agent.allowed_tools.map((tool) => (
                    <span
                      key={tool}
                      className="px-2 py-0.5 rounded bg-status-tool/10 border border-status-tool/20 text-status-tool text-[10px] font-mono"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function AgentsPage() {
  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between section-header-fade pb-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
              <Bot className="w-6 h-6 text-accent" />
              Agent Registry
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage and configure your autonomous workforce.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search agents..."
                className="bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent w-64 transition-colors"
              />
            </div>
            <button className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
              <Plus className="w-4 h-4" />
              New Agent
            </button>
          </div>
        </header>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  )
}
