'use client'

import { motion } from 'framer-motion'
import { dailyUsage, modelUsage, agents, runs } from '@/lib/mock-data'
import { MetricCard } from '@/components/ui/metric-card'
import { formatCost, formatTokens, formatNumber } from '@/lib/utils'
import {
  DollarSign,
  Activity,
  TrendingUp,
  Cpu,
  BarChart3,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts'

export default function UsagePage() {
  const totalCost = dailyUsage.reduce(
    (sum, d) => sum + d.estimated_cost,
    0
  )
  const totalTokens = dailyUsage.reduce(
    (sum, d) => sum + d.input_tokens + d.output_tokens,
    0
  )
  const totalRuns = dailyUsage.reduce((sum, d) => sum + d.runs, 0)
  const avgCostPerRun = totalCost / totalRuns

  const agentCosts = agents
    .map((a) => {
      const agentRuns = runs.filter((r) => r.agent_id === a.id)
      const totalAgentCost = agentRuns.reduce(
        (sum, r) => sum + r.estimated_cost,
        0
      )
      return { ...a, totalCost: totalAgentCost, runCount: agentRuns.length }
    })
    .sort((a, b) => b.totalCost - a.totalCost)

  const maxAgentCost = Math.max(...agentCosts.map((a) => a.totalCost), 1)

  const chartData = dailyUsage.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    cost: d.estimated_cost,
  }))

  const modelCostData = modelUsage.map((m) => ({
    name: m.model,
    cost: m.estimated_cost,
    tier: m.tier,
    color:
      m.tier === 'cheap'
        ? '#10b981'
        : m.tier === 'mid'
          ? '#3b82f6'
          : '#f59e0b',
  }))

  const sparkCost = dailyUsage.map((d) => d.estimated_cost)
  const sparkRuns = dailyUsage.map((d) => d.runs)
  const sparkTokens = dailyUsage.map(
    (d) => (d.input_tokens + d.output_tokens) / 1000000
  )

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between section-header-fade pb-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-accent" />
              Usage & Cost
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor API spend and performance metrics.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
            <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent/10 text-accent">
              7 Days
            </button>
            <button className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground">
              30 Days
            </button>
            <button className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground">
              All Time
            </button>
          </div>
        </header>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Spend (7d)"
            value={formatCost(totalCost)}
            change="+$24.10"
            changeType="up"
            icon={<DollarSign className="w-5 h-5" />}
            accentColor="#a855f7"
            sparkData={sparkCost}
            delay={0.1}
          />
          <MetricCard
            title="Total Runs"
            value={formatNumber(totalRuns)}
            change="+12%"
            changeType="up"
            icon={<Activity className="w-5 h-5" />}
            accentColor="#3b82f6"
            sparkData={sparkRuns}
            delay={0.2}
          />
          <MetricCard
            title="Avg Cost / Run"
            value={formatCost(avgCostPerRun)}
            change="-$0.01"
            changeType="down"
            icon={<TrendingUp className="w-5 h-5" />}
            accentColor="#10b981"
            sparkData={[0.05, 0.05, 0.04, 0.04, 0.05, 0.04, 0.04]}
            delay={0.3}
          />
          <MetricCard
            title="Total Tokens"
            value={formatNumber(totalTokens)}
            change="+2.1M"
            changeType="up"
            icon={<Cpu className="w-5 h-5" />}
            accentColor="#f59e0b"
            sparkData={sparkTokens}
            delay={0.4}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="lg:col-span-2 bg-card border border-border rounded-xl p-5 card-glow"
          >
            <h3 className="text-sm font-medium text-foreground mb-6">
              Spend over time
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="usageCostGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#3b82f6"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="#3b82f6"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#252528"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#a0a0a8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#a0a0a8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#161618',
                      borderColor: '#252528',
                      borderRadius: '8px',
                      color: '#f5f5f4',
                    }}
                    formatter={(value) => [
                      `$${Number(value).toFixed(2)}`,
                      'Cost',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#usageCostGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-card border border-border rounded-xl p-5 card-glow flex flex-col"
          >
            <h3 className="text-sm font-medium text-foreground mb-6">
              Spend by Model
            </h3>
            <div className="flex-1 w-full min-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={modelCostData}
                  layout="vertical"
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#252528"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    stroke="#a0a0a8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#a0a0a8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    cursor={{ fill: '#252528', opacity: 0.4 }}
                    contentStyle={{
                      backgroundColor: '#161618',
                      borderColor: '#252528',
                      borderRadius: '8px',
                      color: '#f5f5f4',
                    }}
                    formatter={(value) => [
                      `$${Number(value).toFixed(2)}`,
                      'Cost',
                    ]}
                  />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={20}>
                    {modelCostData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Spend by Agent */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-card border border-border rounded-xl p-5 card-glow"
          >
            <h3 className="text-sm font-medium text-foreground mb-4">
              Spend by Agent
            </h3>
            <div className="space-y-4">
              {agentCosts.map((agent) => (
                <div key={agent.name} className="flex items-center gap-4">
                  <div className="w-24 text-sm text-foreground truncate">
                    {agent.name}
                  </div>
                  <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${(agent.totalCost / maxAgentCost) * 100}%`,
                        backgroundColor: agent.avatar_color,
                      }}
                    />
                  </div>
                  <div className="w-16 text-right text-sm font-mono tabular-nums text-muted-foreground">
                    {formatCost(agent.totalCost)}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Model Breakdown Table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-card border border-border rounded-xl p-5 card-glow"
          >
            <h3 className="text-sm font-medium text-foreground mb-4">
              Model Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-background/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-2 font-medium">Model</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Calls
                    </th>
                    <th className="px-4 py-2 font-medium text-right">
                      Tokens
                    </th>
                    <th className="px-4 py-2 font-medium text-right">
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {modelUsage.map((m) => {
                    const tierColor =
                      m.tier === 'cheap'
                        ? 'bg-status-success'
                        : m.tier === 'mid'
                          ? 'bg-status-running'
                          : 'bg-status-approval'
                    const textColor =
                      m.tier === 'cheap'
                        ? 'text-status-success'
                        : m.tier === 'mid'
                          ? 'text-status-running'
                          : 'text-status-approval'
                    return (
                      <tr
                        key={m.model}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td
                          className={`px-4 py-3 font-mono ${textColor} flex items-center gap-2`}
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${tierColor}`}
                          />
                          {m.model}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {m.percentage}%
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatTokens(m.input_tokens + m.output_tokens)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {formatCost(m.estimated_cost)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
