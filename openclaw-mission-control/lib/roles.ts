import type { RoleLaneConfig } from './types'

export const ROLE_LANES: RoleLaneConfig[] = [
  {
    id: 'research',
    label: 'Research',
    description: 'Market research, trend scanning, competitive intelligence',
    color: '#3b82f6',
    suggestedJobs: [
      { id: 'trend-scan', title: 'Weekly Trend Scan', description: 'Scan industry news and identify emerging trends', cadence: 'weekly', enabled: false },
      { id: 'competitor-monitor', title: 'Competitor Monitor', description: 'Track competitor product changes, pricing, and announcements', cadence: 'weekly', enabled: false },
    ],
  },
  {
    id: 'strategy',
    label: 'Strategy',
    description: 'Competitive positioning, market analysis, strategic recommendations',
    color: '#8b5cf6',
    suggestedJobs: [
      { id: 'competitor-watch', title: 'Competitor Watch Brief', description: 'Weekly summary of competitor moves and market shifts', cadence: 'weekly', enabled: false },
      { id: 'positioning-review', title: 'Positioning Review', description: 'Monthly review of competitive positioning', cadence: 'monthly', enabled: false },
    ],
  },
  {
    id: 'product',
    label: 'Product & Product Marketing',
    description: 'Feature prioritization, launch planning, positioning',
    color: '#10b981',
    suggestedJobs: [
      { id: 'feature-brief', title: 'Feature Brief Generator', description: 'Draft feature briefs from roadmap items', cadence: 'on_demand', enabled: false },
      { id: 'launch-checklist', title: 'Launch Checklist', description: 'Generate launch checklists for upcoming releases', cadence: 'on_demand', enabled: false },
    ],
  },
  {
    id: 'content',
    label: 'Content & Marketing',
    description: 'Blog posts, social content, email campaigns, docs',
    color: '#f59e0b',
    suggestedJobs: [
      { id: 'content-calendar', title: 'Content Calendar Draft', description: 'Draft next month content calendar', cadence: 'monthly', enabled: false },
      { id: 'seo-audit', title: 'SEO Content Audit', description: 'Audit existing content for SEO opportunities', cadence: 'biweekly', enabled: false },
    ],
  },
  {
    id: 'performance_marketing',
    label: 'Performance Marketing',
    description: 'Ad copy, campaign analysis, conversion optimization',
    color: '#ef4444',
    suggestedJobs: [
      { id: 'ad-copy-gen', title: 'Ad Copy Generator', description: 'Generate ad copy variants for A/B testing', cadence: 'on_demand', enabled: false },
      { id: 'campaign-report', title: 'Campaign Performance Report', description: 'Weekly summary of ad campaign metrics', cadence: 'weekly', enabled: false },
    ],
  },
  {
    id: 'consumer_insights',
    label: 'Consumer Insights',
    description: 'User research synthesis, review analysis, survey processing',
    color: '#06b6d4',
    suggestedJobs: [
      { id: 'review-digest', title: 'Review Digest', description: 'Aggregate and summarize recent customer reviews', cadence: 'weekly', enabled: false },
      { id: 'sentiment-pulse', title: 'Sentiment Pulse', description: 'Track sentiment trends across feedback channels', cadence: 'daily', enabled: false },
    ],
  },
  {
    id: 'advisor',
    label: 'Advisor',
    description: 'Strategic counsel, founder coaching, decision frameworks',
    color: '#a855f7',
    suggestedJobs: [
      { id: 'weekly-retro', title: 'Weekly Retro Prompt', description: 'Generate reflection prompts based on the week activity', cadence: 'weekly', enabled: false },
      { id: 'investor-update', title: 'Investor Update Draft', description: 'Draft monthly investor update from project data', cadence: 'monthly', enabled: false },
    ],
  },
]
