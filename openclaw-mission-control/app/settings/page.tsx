'use client';

import { PageHeader } from '@/components/ui/page-header';
import { MODEL_PRICING } from '@/lib/costs';
import { formatCost } from '@/lib/utils';
import { getTierLabel, getTierColor } from '@/lib/costs';

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <PageHeader title="Settings" description="Configure your OpenClaw Mission Control" />

      {/* General settings */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">General</h3>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Organization Name</label>
            <input className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-blue-500/50" defaultValue="OpenClaw Labs" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Daily Budget Limit</label>
            <input className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-blue-500/50" type="number" defaultValue="25.00" />
            <p className="text-[11px] text-muted-foreground mt-1">Pause all runs when daily spend reaches this limit.</p>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Default Model Routing Strategy</label>
            <select className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] outline-none">
              <option>Cost-Optimized (default cheap, escalate when needed)</option>
              <option>Balanced (default mid-tier)</option>
              <option>Quality-First (default premium)</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Controls which model tier is used by default for new tasks.</p>
          </div>
        </div>
      </div>

      {/* Model pricing reference */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Model Pricing Reference</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Per 1M tokens. Used for cost estimation.</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">Model</th>
              <th className="text-left px-4 py-2">Tier</th>
              <th className="text-right px-4 py-2">Input/1M</th>
              <th className="text-right px-4 py-2">Output/1M</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Object.entries(MODEL_PRICING).map(([model, pricing]) => (
              <tr key={model} className="hover:bg-white/[0.02]">
                <td className="px-4 py-2 text-[12px] font-mono">{model}</td>
                <td className={`px-4 py-2 text-[12px] font-medium ${getTierColor(pricing.tier)}`}>{getTierLabel(pricing.tier)}</td>
                <td className="px-4 py-2 text-right text-[12px]">${pricing.input.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-[12px]">${pricing.output.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* API Keys */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">API Keys</h3>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">OpenAI API Key</label>
            <input type="password" className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-blue-500/50 font-mono" defaultValue="sk-●●●●●●●●●●●●●●●●●●" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Anthropic API Key</label>
            <input type="password" className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-blue-500/50 font-mono" defaultValue="sk-ant-●●●●●●●●●●●●●●" />
          </div>
        </div>
      </div>

      {/* Integration note */}
      <div className="rounded-lg border border-dashed border-border bg-white/[0.02] p-4">
        <p className="text-[13px] text-muted-foreground">
          <strong className="text-foreground">Integration note:</strong> This settings page will connect to OpenClaw&apos;s configuration API.
          Model routing, budget limits, and API keys will be persisted via the backend.
          Currently showing mock configuration UI.
        </p>
      </div>

      <div className="flex justify-end">
        <button className="px-4 py-2 rounded-md bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-500 transition-colors">
          Save Settings
        </button>
      </div>
    </div>
  );
}
