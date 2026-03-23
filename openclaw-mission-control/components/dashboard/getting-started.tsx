'use client'

import { useState } from 'react'
import { useAgents } from '@/lib/hooks'
import { X, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function GettingStarted() {
  const [showChecklist, setShowChecklist] = useState(true)
  const { data: agents } = useAgents()

  const steps = [
    { label: 'Connect Provider', done: true },
    { label: 'Create Agent', done: agents.length > 0 },
    { label: 'Define Tools', done: false },
    { label: 'Run Task', done: false },
    { label: 'Review Logs', done: false },
  ]
  const completedCount = steps.filter((s) => s.done).length

  return (
    <AnimatePresence>
      {showChecklist && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          className="bg-card border border-border rounded-xl overflow-hidden card-glow"
        >
          <div className="p-4 border-b border-border/50 flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold text-sm">
                {completedCount}/{steps.length}
              </div>
              <h2 className="text-sm font-medium text-foreground">
                Getting Started
              </h2>
            </div>
            <button
              onClick={() => setShowChecklist(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-4 bg-card">
            {steps.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                    item.done
                      ? 'bg-status-success border-status-success'
                      : 'border-muted-foreground/50'
                  }`}
                >
                  {item.done && (
                    <Check className="w-3 h-3 text-background" />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    item.done
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
