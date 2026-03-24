import type { RoleLaneConfig } from './types'

export const ROLE_LANES: RoleLaneConfig[] = [
  {
    id: 'research',
    label: 'Research',
    description: 'Market research, trend scanning, competitive intelligence',
    color: '#3b82f6',
    suggestedJobs: [
      { id: 'trend-scan', title: 'Trend Scan', description: 'Scan industry news and identify emerging trends', cadence: 'weekly', enabled: false },
      { id: 'competitor-watch', title: 'Competitor Watch', description: 'Track competitor product changes, pricing, and announcements', cadence: 'weekly', enabled: false },
      { id: 'culture-news-pulse', title: 'Culture & News Pulse', description: 'Monitor cultural shifts and news relevant to your market', cadence: 'daily', enabled: false },
    ],
  },
  {
    id: 'strategy',
    label: 'Strategy',
    description: 'Competitive positioning, market analysis, strategic recommendations',
    color: '#8b5cf6',
    suggestedJobs: [
      { id: 'weekly-strategy-memo', title: 'Weekly Strategy Memo', description: 'Synthesize the week into a strategic brief with recommendations', cadence: 'weekly', enabled: false },
      { id: 'opportunity-retention-pricing-review', title: 'Opportunity / Retention / Pricing Review', description: 'Review growth levers: new opportunities, retention risks, pricing adjustments', cadence: 'biweekly', enabled: false },
    ],
  },
  {
    id: 'product',
    label: 'Product & Product Marketing',
    description: 'Feature prioritization, launch planning, positioning',
    color: '#10b981',
    suggestedJobs: [
      { id: 'packaging-offering-review', title: 'Packaging & Offering Review', description: 'Audit current product packaging and recommend improvements', cadence: 'monthly', enabled: false },
      { id: 'product-recommendation-memo', title: 'Product Recommendation Memo', description: 'Data-driven product direction memo based on usage and market signals', cadence: 'biweekly', enabled: false },
    ],
  },
  {
    id: 'content',
    label: 'Content & Marketing',
    description: 'Blog posts, social content, email campaigns, docs',
    color: '#f59e0b',
    suggestedJobs: [
      { id: 'content-batch-planner', title: 'Content Batch Planner', description: 'Plan and batch upcoming content across channels', cadence: 'weekly', enabled: false },
      { id: 'copy-script-pipeline', title: 'Copy & Script Pipeline', description: 'Generate copy and scripts for ads, emails, and social posts', cadence: 'weekly', enabled: false },
      { id: 'channel-recommendation', title: 'Channel Recommendation', description: 'Recommend best channels based on audience and content performance', cadence: 'monthly', enabled: false },
    ],
  },
  {
    id: 'performance_marketing',
    label: 'Performance Marketing',
    description: 'Ad copy, campaign analysis, conversion optimization',
    color: '#ef4444',
    suggestedJobs: [
      { id: 'campaign-optimization-review', title: 'Campaign Optimization Review', description: 'Review active campaigns and recommend optimization actions', cadence: 'weekly', enabled: false },
      { id: 'roas-organic-analysis', title: 'ROAS & Organic Analysis', description: 'Analyze return on ad spend alongside organic performance trends', cadence: 'biweekly', enabled: false },
    ],
  },
  {
    id: 'consumer_insights',
    label: 'Consumer Insights',
    description: 'User research synthesis, review analysis, survey processing',
    color: '#06b6d4',
    suggestedJobs: [
      { id: 'review-digest', title: 'Review Digest', description: 'Aggregate and summarize recent customer reviews across platforms', cadence: 'weekly', enabled: false },
      { id: 'sentiment-pain-clustering', title: 'Sentiment & Pain-Point Clustering', description: 'Cluster feedback into themes and track sentiment trends', cadence: 'biweekly', enabled: false },
    ],
  },
  {
    id: 'advisor',
    label: 'Advisor',
    description: 'Strategic counsel, founder coaching, decision frameworks',
    color: '#a855f7',
    suggestedJobs: [
      { id: 'founder-memo', title: 'Founder Memo', description: 'Generate a weekly founder reflection based on project activity', cadence: 'weekly', enabled: false },
      { id: 'what-next-summary', title: '"What Should I Do Next?" Summary', description: 'Prioritized action list based on current blockers, opportunities, and workload', cadence: 'weekly', enabled: false },
      { id: 'startup-decision-memo', title: 'Startup Decision Memo', description: 'Structured decision framework for pending strategic choices', cadence: 'on_demand', enabled: false },
    ],
  },
]
