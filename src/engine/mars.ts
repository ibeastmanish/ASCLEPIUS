// Mars local time, so "07:00" reminders stay at local morning (FR-61).
// Mars Sol Date per NASA GISS Mars24 algorithm (Allison & McEwen 2000).
export const SOL_SECONDS = 88_775.244; // 24 h 39 min 35.244 s
const SOL_RATIO = 1.0274912517;
const TT_MINUS_UTC_S = 37 + 32.184; // leap seconds as of 2017 + TAI->TT

/** Gale Crater (Curiosity), east longitude, a sensible default base site. */
export const DEFAULT_BASE_LON_E = 137.4;

export function marsSolDate(ms: number): number {
  const jdUtc = ms / 86_400_000 + 2_440_587.5;
  const jdTt = jdUtc + TT_MINUS_UTC_S / 86_400;
  return (jdTt - 2_405_522.0028779) / SOL_RATIO;
}

/** Local mean solar time in Mars hours [0, 24) at an east longitude. */
export function localMarsHours(ms: number, lonEast = DEFAULT_BASE_LON_E): number {
  const mtc = (24 * marsSolDate(ms)) % 24;
  return (((mtc + lonEast / 15) % 24) + 24) % 24;
}

export function formatMarsTime(ms: number, lonEast = DEFAULT_BASE_LON_E): string {
  const h = localMarsHours(ms, lonEast);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Earth timestamp (ms) of the next local `hour`:00 on Mars after `ms`. */
export function nextLocalTime(ms: number, hour = 7, lonEast = DEFAULT_BASE_LON_E): number {
  const now = localMarsHours(ms, lonEast);
  let marsHours = hour - now;
  if (marsHours <= 0) marsHours += 24;
  // One Mars hour = 1/24 sol of Earth seconds.
  return ms + marsHours * (SOL_SECONDS / 24) * 1000;
}
