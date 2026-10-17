import type { WindStatus } from './wind';

export type WindLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type WindAvailability =
  | 'idle'
  | 'loading'
  | 'available'
  | 'stale'
  | 'error';

/** A missing lazy response is not a failed request. A previously loaded
 * forecast with no usable current hour is stale, not a never-loaded layer. */
export function windAvailability(
  status: WindLoadStatus,
  freshness: WindStatus,
): WindAvailability {
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  if (freshness === 'stale' || (status === 'loaded' && freshness === 'missing'))
    return 'stale';
  if (freshness !== 'missing') return 'available';
  return 'idle';
}
