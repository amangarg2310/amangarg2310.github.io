import { ModelTier } from './types';

// Pricing per 1M tokens (input / output) — Claude models only
export const MODEL_PRICING: Record<string, { input: number; output: number; tier: ModelTier }> = {
  'claude-haiku-4-5': { input: 0.80, output: 4.00, tier: 'cheap' },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00, tier: 'mid' },
  'claude-opus-4-5': { input: 15.00, output: 75.00, tier: 'premium' },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Normalize model name — strip "anthropic/" prefix if present
  const normalized = model.replace('anthropic/', '')
  const pricing = MODEL_PRICING[normalized] || MODEL_PRICING['claude-sonnet-4-6'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export function getModelTier(model: string): ModelTier {
  const normalized = model.replace('anthropic/', '')
  return MODEL_PRICING[normalized]?.tier || 'mid';
}

export function getTierColor(tier: ModelTier): string {
  switch (tier) {
    case 'cheap': return 'text-emerald-400';
    case 'mid': return 'text-blue-400';
    case 'premium': return 'text-amber-400';
  }
}

export function getTierLabel(tier: ModelTier): string {
  switch (tier) {
    case 'cheap': return 'Economy';
    case 'mid': return 'Standard';
    case 'premium': return 'Premium';
  }
}

// Model recommendation based on task complexity
export function recommendModel(taskComplexity: 'simple' | 'normal' | 'complex'): string {
  switch (taskComplexity) {
    case 'simple': return 'claude-haiku-4-5';
    case 'normal': return 'claude-sonnet-4-6';
    case 'complex': return 'claude-opus-4-5';
  }
}
