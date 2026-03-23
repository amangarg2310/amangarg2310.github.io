'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Lock,
  Zap,
  Bot,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import { SparkLine } from '@/components/ui/spark-line'
import { useAgents } from '@/lib/hooks'

const autonomyLevels = [
  { id: 'observe', label: 'Observe' },
  { id: 'plan', label: 'Plan' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'autonomous', label: 'Autonomous' },
]

const costTiers = [
  { id: 'economy', name: 'Economy', models: 'gpt-4o-mini, haiku', est: '$0.02' },
  { id: 'standard', name: 'Standard', models: 'gpt-4o, sonnet', est: '$0.15' },
  { id: 'premium', name: 'Premium', models: 'opus, o1-preview', est: '$0.85' },
]

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateTaskModal({ isOpen, onClose }: CreateTaskModalProps) {
  const { data: agents } = useAgents()
  const agentOptions = agents.filter((a) => a.is_active).map((a) => ({
    id: a.id,
    name: a.name,
    role: a.specialization || 'General',
    spark: [2, 3, 2, 5, 4, 6, 5],
  }))
  const [selectedAutonomy, setSelectedAutonomy] = useState('confirm')
  const [selectedAgent, setSelectedAgent] = useState(agentOptions[0]?.id || '')
  const [selectedTier, setSelectedTier] = useState('standard')

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
            <h2 className="text-lg font-semibold text-foreground">
              Create New Task
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Task Title
                </label>
                <input
                  type="text"
                  placeholder='e.g., Analyze Q3 Competitor Earnings'
                  className="w-full bg-[#050506] border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Objective / Prompt
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe what the agent should accomplish..."
                  className="w-full bg-[#050506] border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none"
                />
              </div>
            </div>

            {/* Agent Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Primary Agent
              </label>
              <div className="grid grid-cols-2 gap-3">
                {agentOptions.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      selectedAgent === agent.id
                        ? 'bg-accent/10 border-accent/50 ring-1 ring-accent/50'
                        : 'bg-[#050506] border-border hover:border-muted-foreground/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          selectedAgent === agent.id
                            ? 'bg-accent text-white'
                            : 'bg-card border border-border text-muted-foreground'
                        }`}
                      >
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <div
                          className={`text-sm font-medium ${
                            selectedAgent === agent.id
                              ? 'text-accent'
                              : 'text-foreground'
                          }`}
                        >
                          {agent.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {agent.role}
                        </div>
                      </div>
                    </div>
                    <div className="w-12 h-6 opacity-60">
                      <SparkLine
                        data={agent.spark}
                        color={
                          selectedAgent === agent.id
                            ? '#3b82f6'
                            : '#a0a0a8'
                        }
                        width={48}
                        height={24}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Autonomy Selector */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-foreground">
                  Autonomy Level
                </label>
                <span className="text-xs text-muted-foreground">
                  Trust Spectrum
                </span>
              </div>
              <div className="relative flex items-center bg-[#050506] border border-border rounded-xl p-1">
                <div className="absolute left-4 text-muted-foreground pointer-events-none">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="absolute right-4 text-status-approval pointer-events-none">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="flex w-full px-8 relative z-10">
                  {autonomyLevels.map((level) => {
                    const isSelected = selectedAutonomy === level.id
                    return (
                      <button
                        key={level.id}
                        onClick={() => setSelectedAutonomy(level.id)}
                        className={`flex-1 py-2 text-sm font-medium transition-colors relative ${
                          isSelected
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground/80'
                        }`}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="autonomy-bg"
                            className="absolute inset-0 bg-card border border-border rounded-lg shadow-sm -z-10"
                            transition={{
                              type: 'spring',
                              bounce: 0.2,
                              duration: 0.6,
                            }}
                          />
                        )}
                        {level.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Cost Comparison */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Compute Tier
              </label>
              <div className="grid grid-cols-3 gap-4">
                {costTiers.map((tier) => {
                  const isSelected = selectedTier === tier.id
                  return (
                    <button
                      key={tier.id}
                      onClick={() => setSelectedTier(tier.id)}
                      className={`relative flex flex-col p-4 rounded-xl border text-left transition-all duration-200 ${
                        isSelected
                          ? 'bg-card border-accent shadow-[0_0_15px_rgba(59,130,246,0.15)] -translate-y-1'
                          : 'bg-[#050506] border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 bg-accent text-white rounded-full p-0.5 shadow-md">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                      <div
                        className={`text-sm font-semibold mb-1 ${
                          isSelected ? 'text-accent' : 'text-foreground'
                        }`}
                      >
                        {tier.name}
                      </div>
                      <div className="text-xs text-muted-foreground mb-3 h-8">
                        {tier.models}
                      </div>
                      <div className="mt-auto pt-3 border-t border-border/50 flex items-end justify-between">
                        <span className="text-xs text-muted-foreground">
                          Est. Cost
                        </span>
                        <span className="text-sm font-mono text-foreground">
                          {tier.est}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Budget Warning */}
            {selectedTier === 'premium' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-status-approval/10 border border-status-approval/20 rounded-lg p-3 flex items-start gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-status-approval flex-shrink-0 mt-0.5" />
                <p className="text-xs text-status-approval/90 leading-relaxed">
                  <strong>Budget Warning:</strong> Premium tier uses
                  expensive reasoning models. This task is estimated to
                  consume 15% of your remaining daily budget.
                </p>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border bg-card/50 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button className="px-6 py-2 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:ring-accent">
              Deploy Agent
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
