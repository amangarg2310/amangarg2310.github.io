'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastCtx = createContext<ToastContextValue>({
  showToast: () => {},
})

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const icons: Record<ToastType, typeof CheckCircle2> = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
  }

  const colors: Record<ToastType, string> = {
    success: 'border-emerald-500/30 text-emerald-400',
    error: 'border-red-500/30 text-red-400',
    info: 'border-accent/30 text-accent',
  }

  return (
    <ToastCtx.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = icons[toast.type]
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-card border shadow-lg max-w-sm',
                  colors[toast.type]
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-sm text-foreground flex-1">{toast.message}</span>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
