'use client'

import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const costData = [
  { time: 'Mon', cost: 12.5 },
  { time: 'Tue', cost: 18.2 },
  { time: 'Wed', cost: 15.8 },
  { time: 'Thu', cost: 24.4 },
  { time: 'Fri', cost: 32.1 },
  { time: 'Sat', cost: 28.5 },
  { time: 'Sun', cost: 42.18 },
]

export function ModelUsageChart() {
  return (
    <motion.section
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6 }}
      className="space-y-4"
    >
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider section-header-fade">
        Est. Cost & Usage (7d)
      </h2>
      <div className="bg-card border border-border rounded-xl p-6 card-glow h-[340px] flex flex-col">
        <div className="w-full h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={costData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="colorCost"
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
                dataKey="time"
                stroke="#a0a0a8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                stroke="#a0a0a8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161618',
                  borderColor: '#252528',
                  borderRadius: '8px',
                  color: '#f5f5f4',
                }}
                itemStyle={{ color: '#3b82f6' }}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCost)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.section>
  )
}
