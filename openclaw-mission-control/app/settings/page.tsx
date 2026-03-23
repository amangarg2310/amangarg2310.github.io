'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Tooltip } from '@/components/ui/tooltip';
import { MODEL_PRICING } from '@/lib/costs';
import { getTierLabel, getTierColor } from '@/lib/costs';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

const providers = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o1'],
    keyPrefix: 'sk-',
    docsUrl: 'https://platform.openai.com/api-keys',
    status: 'connected' as const,
    defaultKey: 'sk-●●●●●●●●●●●●●●●●●●',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-3.5-haiku', 'claude-3.5-sonnet', 'claude-3-opus'],
    keyPrefix: 'sk-ant-',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    status: 'connected' as const,
    defaultKey: 'sk-ant-●●●●●●●●●●●●●●',
  },
  {
    id: 'google',
    name: 'Google AI',
    models: ['gemini-2.0-flash', 'gemini-2.0-pro'],
    keyPrefix: 'AI',
    docsUrl: 'https://aistudio.google.com/apikey',
    status: 'not_configured' as const,
    defaultKey: '',
  },
];

export default function SettingsPage() {
  const [testingProvider, setTestingProvider] = useState<string | null>(null);

  const handleTestConnection = (providerId: string) => {
    setTestingProvider(providerId);
    setTimeout(() => setTestingProvider(null), 1500);
  };

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
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              Daily Budget Limit
              <Tooltip content="All running agents will pause when total spend for the day reaches this limit" />
            </label>
            <input className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-blue-500/50" type="number" defaultValue="25.00" />
            <p className="text-[11px] text-muted-foreground mt-1">Pause all runs when daily spend reaches this limit.</p>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              Default Model Routing Strategy
              <Tooltip content="Controls which model tier agents use by default. Cost-Optimized starts with the cheapest model and only escalates when the task requires more capability." />
            </label>
            <select className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] outline-none">
              <option>Cost-Optimized (default cheap, escalate when needed)</option>
              <option>Balanced (default mid-tier)</option>
              <option>Quality-First (default premium)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Provider management */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">AI Providers</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Configure API keys for each provider. Models from connected providers are available to your agents.</p>
        </div>
        <div className="divide-y divide-border">
          {providers.map(provider => (
            <div key={provider.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{provider.name}</span>
                  {provider.status === 'connected' ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-white/5 border border-border px-1.5 py-0.5 rounded-full">
                      <XCircle className="h-3 w-3" /> Not configured
                    </span>
                  )}
                </div>
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  Get API key <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="flex gap-2">
                <input
                  type="password"
                  className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-blue-500/50 font-mono"
                  defaultValue={provider.defaultKey}
                  placeholder={`${provider.keyPrefix}...`}
                />
                <button
                  onClick={() => handleTestConnection(provider.id)}
                  disabled={testingProvider === provider.id}
                  className={cn(
                    'px-3 h-9 rounded-md border border-border text-[12px] font-medium transition-colors',
                    testingProvider === provider.id
                      ? 'text-muted-foreground cursor-wait'
                      : 'hover:bg-white/5 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {testingProvider === provider.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Models:</span>
                {provider.models.map(model => (
                  <span key={model} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground font-mono">
                    {model}
                  </span>
                ))}
              </div>
            </div>
          ))}
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
