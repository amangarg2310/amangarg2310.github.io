'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MODEL_PRICING, getTierLabel } from '@/lib/costs'
import {
  Settings,
  Building,
  CreditCard,
  Key,
  CheckCircle2,
  XCircle,
  RefreshCw,
  DollarSign,
} from 'lucide-react'

export default function SettingsPage() {
  const [testingProvider, setTestingProvider] = useState<string | null>(
    null
  )

  const handleTest = (id: string) => {
    setTestingProvider(id)
    setTimeout(() => setTestingProvider(null), 1500)
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
              Manage organization preferences and provider integrations.
            </p>
          </div>
          <button className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            Save Changes
          </button>
        </header>

        {/* General Settings */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-6 card-glow space-y-6"
        >
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Building className="w-5 h-5 text-muted-foreground" />
            General
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Organization Name
              </label>
              <input
                type="text"
                defaultValue="Acme Corp"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Daily Budget Limit ($)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="number"
                  defaultValue="50.00"
                  className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground font-mono tabular-nums focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-muted-foreground">
                Default Routing Strategy
              </label>
              <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors appearance-none">
                <option value="cost">
                  Cost-Optimized (Economy tiers first)
                </option>
                <option value="balanced">
                  Balanced (Standard tiers, escalate on failure)
                </option>
                <option value="performance">
                  Performance (Premium tiers only)
                </option>
              </select>
            </div>
          </div>
        </motion.section>

        {/* Providers */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2 px-1">
            <Key className="w-5 h-5 text-muted-foreground" />
            Model Providers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OpenAI */}
            <div className="bg-card border border-border rounded-xl p-5 card-glow flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-status-success" />
              <div className="flex justify-between items-start mb-4 pl-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-sm bg-white/10 flex items-center justify-center">
                    <span className="font-bold text-white text-xs">
                      OAI
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                      OpenAI
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-status-success bg-status-success/10 px-1.5 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last tested: 2 mins ago
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleTest('openai')}
                  className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${testingProvider === 'openai' ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
              <div className="pl-2">
                <input
                  type="password"
                  defaultValue="sk-................................"
                  className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-muted-foreground font-mono focus:outline-none focus:border-accent focus:text-foreground transition-colors"
                />
              </div>
            </div>

            {/* Anthropic */}
            <div className="bg-card border border-border rounded-xl p-5 card-glow flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-status-success" />
              <div className="flex justify-between items-start mb-4 pl-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-sm bg-[#d97757]/20 flex items-center justify-center">
                    <span className="font-bold text-[#d97757] text-xs">
                      A
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                      Anthropic
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-status-success bg-status-success/10 px-1.5 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last tested: 1 hour ago
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleTest('anthropic')}
                  className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${testingProvider === 'anthropic' ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
              <div className="pl-2">
                <input
                  type="password"
                  defaultValue="sk-ant-................................"
                  className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-muted-foreground font-mono focus:outline-none focus:border-accent focus:text-foreground transition-colors"
                />
              </div>
            </div>

            {/* Google */}
            <div className="bg-card border border-border rounded-xl p-5 card-glow flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-status-failed" />
              <div className="flex justify-between items-start mb-4 pl-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-sm bg-[#4285f4]/20 flex items-center justify-center">
                    <span className="font-bold text-[#4285f4] text-xs">
                      G
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                      Google
                      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-status-failed bg-status-failed/10 px-1.5 py-0.5 rounded">
                        <XCircle className="w-3 h-3" /> Error
                      </span>
                    </h3>
                    <p className="text-xs text-status-failed mt-0.5">
                      Invalid API Key
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleTest('google')}
                  className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${testingProvider === 'google' ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
              <div className="pl-2">
                <input
                  type="password"
                  placeholder="Enter API Key"
                  className="w-full bg-background border border-status-failed/50 rounded-lg px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:border-status-failed focus:ring-1 focus:ring-status-failed transition-colors"
                />
              </div>
            </div>
          </div>
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
            Model Pricing & Limits
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
                  <th className="px-4 py-3 font-medium text-right">
                    Usage This Month
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
                    const barColor =
                      pricing.tier === 'cheap'
                        ? 'bg-status-success'
                        : pricing.tier === 'mid'
                          ? 'bg-status-running'
                          : 'bg-status-approval'
                    const usagePct = Math.random() * 80 + 5

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
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs tabular-nums text-foreground">
                              ${(pricing.input * usagePct * 0.01).toFixed(2)}
                            </span>
                            <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                              <div
                                className={`h-full ${barColor} rounded-full`}
                                style={{
                                  width: `${usagePct}%`,
                                }}
                              />
                            </div>
                          </div>
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
