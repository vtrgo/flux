/**
 * Calculates the number of days a machine is late based on its F.A.T. date.
 * Returns 0 so long as F.A.T. is not late (or not set).
 */
export function calculateDaysLate(fatDateStr?: string | null): number {
  if (!fatDateStr) return 0;
  const fatDate = new Date(fatDateStr);
  if (isNaN(fatDate.getTime())) return 0;

  const now = new Date();
  // Strip time components to compare calendar dates cleanly in UTC
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const fatUtc = Date.UTC(fatDate.getFullYear(), fatDate.getMonth(), fatDate.getDate());

  const diffDays = Math.floor((todayUtc - fatUtc) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

/**
 * Calculates the overall project lateness (Days Late) across all spawned machines.
 * Uses the maximum days late across all machines with an F.A.T. date.
 * Returns 0 if no machines are late or no F.A.T. dates exist.
 */
export function calculateProjectDaysLate(machines?: { fat_date?: string | null }[]): number {
  if (!machines || machines.length === 0) return 0;
  let maxLate = 0;
  for (const m of machines) {
    if (m.fat_date) {
      const late = calculateDaysLate(m.fat_date);
      if (late > maxLate) {
        maxLate = late;
      }
    }
  }
  return maxLate;
}

/**
 * Formats an F.A.T. date string into a readable locale date string, or returns a fallback.
 */
export function formatFatDate(fatDateStr?: string | null, fallback: string = 'None'): string {
  if (!fatDateStr) return fallback;
  const d = new Date(fatDateStr);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString();
}
