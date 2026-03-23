'use client'

import { motion } from 'framer-motion'
import { MODEL_PRICING, getTierLabel } from '@/lib/costs'
import { useAgents } from '@/lib/hooks'
import {
  Settings,
  CreditCard,
  Key,
  Info,
  DollarSign,
} from 'lucide-react'

export default function SettingsPage() {
  const { data: agents } = useAgents()

  // Derive the distinct model providers from actual agent configs
  const modelProviders = new Set<string>()
  for (const agent of agents) {
    if (agent.default_model) {
      const provider = agent.default_model.split('/')[0]
      if (provider) modelProviders.add(provider)
    }
  }

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {/* Header */}
        <header className="flex items-center justify-between section-header-fade pb-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight flex items-center gap-2">
              <Settings className="w-6 h-6 text-accent" />
              Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configuration sourced from your OpenClaw agent definitions.
            </p>
          </div>
        </header>

        {/* Detected Providers */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-6 card-glow space-y-4"
        >
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Key className="w-5 h-5 text-muted-foreground" />
            Model Providers
          </h2>
          {modelProviders.size > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Providers detected from your agent configurations:
              </p>
              <div className="flex flex-wrap gap-2">
                {[...modelProviders].map((provider) => (
                  <span
                    key={provider}
                    className="text-sm font-mono px-3 py-1.5 bg-white/5 border border-border rounded-lg text-foreground"
                  >
                    {provider}
                  </span>
                ))}
              </div>
              <div className="flex items-start gap-2 mt-3 bg-background/50 border border-border/30 rounded-lg px-3 py-2.5">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  API keys and provider connections are managed by OpenClaw directly.
                  This dashboard reads from your running agents — it does not manage credentials.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Key className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">
                No providers detected — start an agent to see provider info here.
              </p>
            </div>
          )}
        </motion.section>

        {/* Budget Info */}
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
                      <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{agent.default_model}</td>
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
              No agents registered yet.
            </p>
          )}
        </motion.section>

        {/* Pricing Table */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border rounded-xl p-6 card-glow space-y-4"
        >
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-muted-foreground" />
            Model Pricing Reference
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-background/80 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium text-right">
                    Input / 1M
                  </th>
                  <th className="px-4 py-3 font-medium text-right">
                    Output / 1M
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {Object.entries(MODEL_PRICING).map(
                  ([model, pricing]) => {
                    const tierColor =
                      pricing.tier === 'cheap'
                        ? 'border-status-success'
                        : pricing.tier === 'mid'
                          ? 'border-status-running'
                          : 'border-status-approval'
                    const tierBgColor =
                      pricing.tier === 'cheap'
                        ? 'text-status-success bg-status-success/10'
                        : pricing.tier === 'mid'
                          ? 'text-status-running bg-status-running/10'
                          : 'text-status-approval bg-status-approval/10'

                    return (
                      <tr
                        key={model}
                        className="bg-background/30 hover:bg-white/5 transition-colors relative"
                      >
                        <td
                          className={`px-4 py-3 font-mono text-foreground border-l-2 ${tierColor}`}
                        >
                          {model}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${tierBgColor}`}
                          >
                            {getTierLabel(pricing.tier)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          ${pricing.input.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          ${pricing.output.toFixed(2)}
                        </td>
                      </tr>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
