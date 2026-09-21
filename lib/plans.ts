export const PLANS = {
  monthly: { code: "monthly", label: "月付", months: 1, quotaGb: 200 },
  halfYear: { code: "halfYear", label: "半年付", months: 6, quotaGb: 1000 },
  yearly: { code: "yearly", label: "年付", months: 12, quotaGb: 2000 },
} as const;

export type PlanCode = keyof typeof PLANS;

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === "string" && value in PLANS;
}

export function planLabel(months: number) {
  if (months === 1) return "月付";
  if (months === 6) return "半年付";
  if (months === 12) return "年付";
  return `${months}个月`;
}

// China has a fixed UTC+8 offset. Clamp month-end dates so Jan 31 + 1 month = Feb 28/29.
export function addNaturalMonthsChina(timestamp: number, months: number) {
  const offset = 8 * 60 * 60 * 1000;
  const local = new Date(timestamp + offset);
  const monthIndex = local.getUTCMonth() + months;
  const targetYear = local.getUTCFullYear() + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(
    targetYear,
    targetMonth,
    Math.min(local.getUTCDate(), lastDay),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
  ) - offset;
}
