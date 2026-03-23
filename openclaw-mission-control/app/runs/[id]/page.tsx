'use client'

import { useState, createElement } from 'react'
import { use } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useRunDetail } from '@/lib/hooks'
import { RunEvent } from '@/lib/types'
import { StatusPill } from '@/components/ui/status-badge'
import { formatCost, formatTokens, formatDuration, timeAgo } from '@/lib/utils'
import {
  ArrowLeft,
  Clock,
  Zap,
  Cpu,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Search,
} from 'lucide-react'

type EventType = 'model' | 'tool' | 'success' | 'error' | 'system'

const typeColors: Record<string, string> = {
  model_called: 'bg-status-model',
  tool_call: 'bg-status-tool',
  tool_result: 'bg-status-success',
  completed: 'bg-status-success',
  error: 'bg-status-failed',
  started: 'bg-muted-foreground',
  escalated: 'bg-status-approval',
  retry: 'bg-status-approval',
  child_spawned: 'bg-status-model',
}

const typeIcons: Record<string, React.ElementType> = {
  model_called: Cpu,
  tool_call: Terminal,
  tool_result: CheckCircle2,
  completed: CheckCircle2,
  error: AlertCircle,
  started: Zap,
  escalated: Zap,
  retry: Zap,
  child_spawned: Zap,
}

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const { data: runData, loading } = useRunDetail(id)
  const run = runData.run
  const events = runData.events
  const selectedEvent = events.find((e) => e.id === selectedEventId)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground text-sm">Loading run...</div>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Run not found</p>
          <Link href="/runs" className="text-accent text-sm mt-2 inline-block">
            ← Back to runs
          </Link>
        </div>
      </div>
    )
  }

  const runStartTime = new Date(run.started_at).getTime()
  const runEndTime = run.ended_at
    ? new Date(run.ended_at).getTime()
    : Date.now()
  const totalDuration = runEndTime - runStartTime

  function getEventOffset(event: RunEvent): number {
    const eventTime = new Date(event.timestamp).getTime()
    return ((eventTime - runStartTime) / totalDuration) * 100
  }

  function getEventWidth(event: RunEvent, index: number): number {
    const nextEvent = events[index + 1]
    const eventTime = new Date(event.timestamp).getTime()
    const endTime = nextEvent
      ? new Date(nextEvent.timestamp).getTime()
      : runEndTime
    const duration = endTime - eventTime
    return Math.max((duration / totalDuration) * 100, 0.5)
  }

  function getEventDurationMs(event: RunEvent, index: number): number {
    const nextEvent = events[index + 1]
    const eventTime = new Date(event.timestamp).getTime()
    const endTime = nextEvent
      ? new Date(nextEvent.timestamp).getTime()
      : runEndTime
    return endTime - eventTime
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header & Minimap */}
      <header className="flex-shrink-0 border-b border-border p-6 bg-card/30">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link
                href="/runs"
                className="p-1.5 rounded-md border border-border hover:bg-white/5 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </Link>
              <h1 className="text-xl font-semibold text-foreground tracking-tight">
                {run.task_title}
              </h1>
              <StatusPill status={run.status} />
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-2 ml-10">
              <Clock className="w-4 h-4" /> Total Duration:{' '}
              {formatDuration(run.started_at, run.ended_at)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">
                Total Cost
              </div>
              <div className="text-xs text-muted-foreground font-mono tabular-nums">
                {formatCost(run.estimated_cost)}
              </div>
            </div>
            <div className="w-px h-8 bg-border mx-2" />
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">
                Tokens
              </div>
              <div className="text-xs text-muted-foreground font-mono tabular-nums">
                {formatTokens(run.input_tokens + run.output_tokens)}
              </div>
            </div>
          </div>
        </div>

        {/* Minimap Overview */}
        <div className="h-8 w-full bg-[#050506] rounded-md border border-border relative overflow-hidden">
          {events.map((event, i) => {
            const left = getEventOffset(event)
            const width = Math.max(getEventWidth(event, i), 0.5)
            const colorClass =
              typeColors[event.event_type] || 'bg-muted-foreground'
            return (
              <div
                key={`mini-${event.id}`}
                className={`absolute top-0 bottom-0 opacity-70 ${colorClass}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            )
          })}
        </div>
      </header>

      {/* Main Two-Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Waterfall Gantt */}
        <div className="w-2/3 border-r border-border overflow-y-auto relative gantt-grid bg-[#0a0a0c]">
          <div className="min-w-[600px] py-4">
            {events.map((event, i) => {
              const isSelected = selectedEventId === event.id
              const left = getEventOffset(event)
              const width = getEventWidth(event, i)
              const durationMs = getEventDurationMs(event, i)
              const Icon =
                typeIcons[event.event_type] || Zap
              const colorClass =
                typeColors[event.event_type] || 'bg-muted-foreground'

              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEventId(event.id)}
                  className={`relative flex items-center h-12 px-4 cursor-pointer transition-colors group ${
                    isSelected
                      ? 'bg-accent/5 border-l-2 border-l-accent'
                      : 'border-l-2 border-l-transparent hover:bg-white/5'
                  }`}
                >
                  {/* Event Label */}
                  <div className="w-48 flex-shrink-0 flex items-center gap-2 z-10">
                    <Icon
                      className={`w-4 h-4 ${
                        isSelected
                          ? 'text-accent'
                          : 'text-muted-foreground group-hover:text-foreground'
                      }`}
                    />
                    <span
                      className={`text-sm truncate ${
                        isSelected
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground group-hover:text-foreground'
                      }`}
                    >
                      {event.summary}
                    </span>
                  </div>

                  {/* Gantt Area */}
                  <div className="flex-1 relative h-full flex items-center">
                    <div
                      className={`absolute h-[10px] rounded-full ${colorClass} shadow-[0_0_10px_rgba(0,0,0,0.5)]`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                      }}
                    />
                    <span
                      className="absolute text-[10px] text-muted-foreground font-mono tabular-nums ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ left: `${left + width}%` }}
                    >
                      {durationMs}ms
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Pane: Event Details */}
        <div className="w-1/3 bg-card/30 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {selectedEvent ? (
              <motion.div
                key={selectedEvent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 pb-4 border-b border-border/50 section-header-fade">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-card border border-border">
                    {createElement(
                      typeIcons[selectedEvent.event_type] || Zap,
                      { className: 'w-5 h-5' }
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {selectedEvent.summary}
                    </h2>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {selectedEvent.event_type.replace('_', ' ')} EVENT
                    </p>
                  </div>
                </div>

                {/* Timing Card */}
                <div className="bg-card rounded-xl p-4 border border-border card-glow">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Timing
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Timestamp
                      </div>
                      <div className="text-sm font-mono text-foreground tabular-nums">
                        {timeAgo(selectedEvent.timestamp)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Duration
                      </div>
                      <div className="text-sm font-mono text-foreground tabular-nums">
                        {getEventDurationMs(
                          selectedEvent,
                          events.indexOf(selectedEvent)
                        )}
                        ms
                      </div>
                    </div>
                  </div>
                </div>

                {/* Token Usage Card */}
                {(selectedEvent.input_tokens ||
                  selectedEvent.output_tokens) && (
                  <div className="bg-card rounded-xl p-4 border border-border card-glow">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Cpu className="w-4 h-4" /> Model Details
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          Tokens
                        </span>
                        <span className="text-sm font-mono text-foreground tabular-nums">
                          {formatTokens(
                            (selectedEvent.input_tokens || 0) +
                              (selectedEvent.output_tokens || 0)
                          )}
                        </span>
                      </div>
                      {selectedEvent.estimated_cost && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            Cost
                          </span>
                          <span className="text-sm font-mono text-status-model tabular-nums">
                            {formatCost(selectedEvent.estimated_cost)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tool Execution Card */}
                {selectedEvent.tool_name && (
                  <div className="bg-card rounded-xl p-4 border border-border card-glow">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Terminal className="w-4 h-4" /> Tool Execution
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">
                          Tool
                        </span>
                        <span className="text-sm font-mono text-status-tool bg-status-tool/10 px-2 py-1 rounded">
                          {selectedEvent.tool_name}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {Object.keys(selectedEvent.metadata).length > 0 && (
                  <div className="bg-card rounded-xl p-4 border border-border card-glow">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      Metadata
                    </h3>
                    <div className="bg-[#050506] border border-border rounded-md p-3 text-xs font-mono text-muted-foreground overflow-x-auto">
                      <pre>
                        {JSON.stringify(
                          selectedEvent.metadata,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Search className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">
                  Select an event to view details
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
