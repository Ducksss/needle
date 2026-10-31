// Number and time formatting shared by every panel. Ported from renderVals() in reference/Daylight2.dc.html.

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Distance in metres: "334 m" below 1 km, "1.14 km" above. */
export function mTxt(v: number): string {
  const a = Math.abs(v);
  return a >= 1000 ? (a / 1000).toFixed(2) + ' km' : Math.round(a) + ' m';
}

/** Probability in short scientific notation, truncated (not rounded) to one decimal: 1.39e-4. */
export function sci(p: number): string {
  if (!(p > 0) || p <= 1.0001e-30) return '≤1e-30';
  const e = Math.floor(Math.log10(p));
  return (Math.floor((p / Math.pow(10, e)) * 10) / 10).toFixed(1) + 'e' + e;
}

/** Pc text from a log10 Pc value. */
export const pcTxt = (risk: number) => sci(Math.pow(10, risk));

/** Duration in hours as "2d 05h". */
export function dh(h: number): string {
  const a = Math.round(Math.abs(h));
  return Math.floor(a / 24) + 'd ' + String(a % 24).padStart(2, '0') + 'h';
}

/** Replay time in hours as a calendar stamp: "Day 3 14:24". */
export function at(h: number): string {
  if (h < 0) return 'before Day 1';
  const mn = Math.round(h * 60);
  return 'Day ' + (Math.floor(mn / 1440) + 1) + ' ' + String(Math.floor((mn % 1440) / 60)).padStart(2, '0') + ':' + String(mn % 60).padStart(2, '0');
}

/** Signed change: "+3", "-2", "±0". */
export const sgn = (n: number) => (n > 0 ? '+' + n : n < 0 ? String(n) : '±0');

export const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

/** Thrust direction from alpha (deg, in-plane from velocity toward radial-out), short form. */
export function dirShort(alpha: number): string {
  const a = alpha;
  if (a === 0) return 'Prograde';
  if (a === 180) return 'Retrograde';
  if (a < 90) return 'Prograde ' + a + '° up';
  if (a < 180) return 'Retrograde ' + (180 - a) + '° up';
  if (a < 270) return 'Retrograde ' + (a - 180) + '° down';
  return 'Prograde ' + (360 - a) + '° down';
}

/** Thrust direction from alpha, as a sentence fragment for the approval modal. */
export function dirLong(alpha: number): string {
  const a = alpha;
  if (a === 0) return 'Prograde, along the velocity vector';
  if (a === 180) return 'Retrograde, against the velocity vector';
  if (a < 90) return a + '° above the velocity vector, toward radial-out';
  if (a < 180) return 180 - a + '° above the anti-velocity vector';
  if (a < 270) return a - 180 + '° below the anti-velocity vector';
  return 360 - a + '° below the velocity vector, toward radial-in';
}

/** SVG path for a filled dot, drawn as two arcs so many dots can share one path element. */
export function dotPath(x: number, y: number, r: number): string {
  return 'M' + (x - r).toFixed(1) + ' ' + y.toFixed(1) + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0';
}
