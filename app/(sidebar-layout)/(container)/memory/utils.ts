export function getRingColor(ringType: string): string {
  switch (ringType) {
    case 'procedures': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    case 'practice': return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
    case 'longterm': return 'bg-green-500/10 text-green-600 border-green-500/30';
    case 'shocks': return 'bg-red-500/10 text-red-600 border-red-500/30';
    default: return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
  }
}

export function getDecayColor(stage: string): string {
  switch (stage) {
    case 'full': return 'bg-green-500/10 text-green-600';
    case 'compressed': return 'bg-yellow-500/10 text-yellow-600';
    case 'summary': return 'bg-orange-500/10 text-orange-600';
    case 'essence': return 'bg-red-500/10 text-red-600';
    default: return 'bg-gray-500/10 text-gray-600';
  }
}
