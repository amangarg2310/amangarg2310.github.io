import { ModelTier } from './types';

// Pricing per 1M tokens (input / output)
export const MODEL_PRICING: Record<string, { input: number; output: number; tier: ModelTier }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60, tier: 'cheap' },
  'claude-3.5-haiku': { input: 0.80, output: 4.00, tier: 'cheap' },
  'gpt-4o': { input: 2.50, output: 10.00, tier: 'mid' },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00, tier: 'mid' },
  'claude-3-opus': { input: 15.00, output: 75.00, tier: 'premium' },
  'gpt-4-turbo': { input: 10.00, output: 30.00, tier: 'premium' },
  'o1': { input: 15.00, output: 60.00, tier: 'premium' },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export function getModelTier(model: string): ModelTier {
  return MODEL_PRICING[model]?.tier || 'mid';
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

// Simple routing strategy
export function recommendModel(taskComplexity: 'simple' | 'normal' | 'complex'): string {
  switch (taskComplexity) {
    case 'simple': return 'gpt-4o-mini';
    case 'normal': return 'claude-3.5-sonnet';
    case 'complex': return 'claude-3-opus';
  }
}
