'use client'

import { motion } from 'framer-motion'
import { MODEL_PRICING, getTierLabel } from '@/lib/costs'
import { TIER_LABELS, TIER_COST_RANGES } from '@/lib/execution-policy'
import { useAgents } from '@/lib/hooks'
import {
  Settings,
  CreditCard,
  Shield,
  DollarSign,
  Zap,
} from 'lucide-react'

export default function SettingsPage() {
  const { data: agents } = useAgents()

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <header className="section-header-fade pb-2">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-accent" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agent configuration and model routing powered by Claude Agent SDK.
          </p>
        </header>

        {/* Authentication */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-6 card-glow space-y-4"
        >
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            Authentication
          </h2>
          <div className="bg-status-success/5 border border-status-success/20 rounded-lg px-4 py-3 flex items-start gap-3">
            <Zap className="w-5 h-5 text-status-success shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Claude Agent SDK</p>
              <p className="text-xs text-muted-foreground mt-1">
                No API key needed — uses Claude Code login. All agent sessions run via{' '}
                <code className="text-accent/80 bg-accent/5 px-1 py-0.5 rounded text-[11px]">@anthropic-ai/claude-agent-sdk</code>{' '}
                as subprocesses on your machine.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Default Model & Tiers */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card border border-border rounded-xl p-6 card-glow space-y-4"
        >
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-muted-foreground" />
            Model Tiers
          </h2>
          <p className="text-xs text-muted-foreground">
            Mission Control routes tasks to the cheapest acceptable model by default. Each role has a default tier that can be overridden per-task.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(Object.entries(TIER_LABELS) as [string, string][]).map(([tier, label]) => {
              const colors: Record<string, string> = {
                economy: 'border-status-success/30 bg-status-success/5',
                standard: 'border-status-running/30 bg-status-running/5',
                premium: 'border-status-approval/30 bg-status-approval/5',
              }
              const dotColors: Record<string, string> = {
                economy: 'bg-status-success',
                standard: 'bg-status-running',
                premium: 'bg-status-approval',
              }
              const modelNames: Record<string, string> = {
                economy: 'claude-haiku-4-5',
                standard: 'claude-sonnet-4-6',
                premium: 'claude-opus-4-5',
              }
              return (
                <div key={tier} className={`border rounded-lg p-4 ${colors[tier] || ''}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${dotColors[tier]}`} />
                    <span className="text-sm font-medium text-foreground">{label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {modelNames[tier] || tier}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Est. {TIER_COST_RANGES[tier as keyof typeof TIER_COST_RANGES]} / task
                  </p>
                </div>
              )
            })}
          </div>
        </motion.section>

        {/* Agent Budgets */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-xl p-6 card-glow space-y-4"
        >
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            Agent Budgets
          </h2>
          {agents.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-background/80 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Default Model</th>
                    <th className="px-4 py-3 font-medium text-right">Budget / Run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {agents.map((agent) => (
                    <tr key={agent.id} className="bg-background/30 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{agent.name}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">
                        {agent.default_model?.replace('anthropic/', '') || 'sonnet'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {agent.max_budget_per_run > 0 ? `$${agent.max_budget_per_run.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No agents registered yet. Create a project and assign agents to see budgets here.
            </p>
          )}
        </motion.section>

        {/* Pricing Reference */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-xl p-6 card-glow space-y-4"
        >
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-muted-foreground" />
            Claude Pricing Reference
          </h2>
          <p className="text-xs text-muted-foreground">
            Costs are estimated from token counts. Actual billing is through your Claude Code login (no separate API key needed).
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-background/80 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium text-right">Input / 1M</th>
                  <th className="px-4 py-3 font-medium text-right">Output / 1M</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {Object.entries(MODEL_PRICING).map(([model, pricing]) => {
                  const tierColor = pricing.tier === 'economy'
                    ? 'border-status-success' : pricing.tier === 'standard'
                    ? 'border-status-running' : 'border-status-approval'
                  const tierBgColor = pricing.tier === 'economy'
                    ? 'text-status-success bg-status-success/10' : pricing.tier === 'standard'
                    ? 'text-status-running bg-status-running/10' : 'text-status-approval bg-status-approval/10'
                  return (
                    <tr key={model} className="bg-background/30 hover:bg-white/5 transition-colors">
                      <td className={`px-4 py-3 font-mono text-foreground border-l-2 ${tierColor}`}>{model}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${tierBgColor}`}>
                          {getTierLabel(pricing.tier)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">${pricing.input.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">${pricing.output.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
