export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#4ade80'; // Green
    case 'B': return '#bbf7d0'; // Light Green
    case 'C': return '#fcd34d'; // Amber
    case 'D': return '#fb923c'; // Orange
    case 'F': return '#ef4444'; // Red
    default: return '#a78b71';  // Accent fallback
  }
}
