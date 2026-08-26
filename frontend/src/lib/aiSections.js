import { TrendingUp, ShieldAlert, Briefcase, Brain, BarChart3, HeartPulse, GitBranch, Activity } from 'lucide-react'

export const AI_SECTIONS = [
  { id: 'perf', key: 'aiStudioPerformance', path: '/ai-studio/performance', icon: TrendingUp },
  { id: 'risk', key: 'aiStudioRisk', path: '/ai-studio/risk', icon: ShieldAlert },
  { id: 'port', key: 'aiStudioPortfolio', path: '/ai-studio/portfolio', icon: Briefcase },
  { id: 'dec', key: 'aiStudioDecisions', path: '/ai-studio/decisions', icon: Brain },
  { id: 'bt', key: 'aiStudioBacktest', path: '/ai-studio/backtest', icon: BarChart3 },
  { id: 'health', key: 'aiStudioHealth', path: '/ai-studio/health', icon: HeartPulse },
  { id: 'evo', key: 'aiStudioEvolution', path: '/ai-studio/evolution', icon: GitBranch },
  { id: 'act', key: 'aiStudioActivity', path: '/ai-studio/activity', icon: Activity },
]
