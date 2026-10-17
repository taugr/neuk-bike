// Next.js embeds this public setting into the static export at build time.
// Wind is enabled unless explicitly disabled; unknown values fail closed.
export const WIND_ENABLED =
  (process.env.NEXT_PUBLIC_WIND_ENABLED ?? 'true') === 'true';
