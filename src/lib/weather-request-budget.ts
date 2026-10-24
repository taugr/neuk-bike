import { reserveWindRequest } from './regional-wind';

// Shared by current rain and regional wind. Keep the existing per-tab budget
// across reloads, including aborted requests and provider Retry-After responses.
const budgetKey = 'neuk-wind-budget-v1';
const retryKey = 'neuk-wind-retry-after-v1';
let history: number[] = [];
let retryAfter = 0;
export function reserveWeatherRequest(now = Date.now()) {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(budgetKey) || 'null',
    );
    if (Array.isArray(stored))
      history = stored.filter(
        (t) => typeof t === 'number' && Number.isFinite(t),
      );
    const saved = Number(sessionStorage.getItem(retryKey));
    if (Number.isFinite(saved)) retryAfter = Math.max(retryAfter, saved);
  } catch {
    /* In-memory limits remain when storage is blocked. */
  }
  const budget = reserveWindRequest(history, now);
  const wait = Math.max(budget.wait, retryAfter - now);
  if (wait > 0) return wait;
  history = budget.history;
  try {
    sessionStorage.setItem(budgetKey, JSON.stringify(history));
  } catch {
    /* Optional storage. */
  }
  return 0;
}
export function deferWeatherRequests(
  header: string | null,
  minimum: number,
  now = Date.now(),
) {
  const delay =
    header && /^\d+$/.test(header)
      ? Number(header) * 1000
      : header
        ? Date.parse(header) - now
        : 0;
  retryAfter = Math.max(
    retryAfter,
    now + Math.max(minimum, Number.isFinite(delay) ? delay : 0),
  );
  try {
    sessionStorage.setItem(retryKey, String(retryAfter));
  } catch {
    /* Optional storage. */
  }
}
