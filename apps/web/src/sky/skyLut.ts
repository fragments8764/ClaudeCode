/**
 * CPU side of the aurora shader's per-column lookup. The curtain shape ("wave") and the
 * vertical rays only depend on x, so instead of 24 noise evaluations per *pixel* (~500k
 * pixels on a phone) we do them per *column* (384 × 3 bands) and upload a tiny texture.
 * Same look, a fraction of the GPU work — the sky was ~95 % of the app's rendering cost.
 */
export const LUT_W = 384;
const fract = (x: number) => x - Math.floor(x);
function hash(x: number, y: number) {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
}
function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
export function fbm(x: number, y: number) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * noise(x, y);
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return v;
}

/** Fill `out` (LUT_W × 3 RGBA) for sky time t (already × speed), aspect ratio and tilt.x. */
export function fillLut(out: Uint8Array, t: number, aspect: number, tiltX: number) {
  for (let c = 0; c < LUT_W; c++) {
    const apx = ((c + 0.5) / LUT_W) * aspect + tiltX * 0.035;
    for (let i = 0; i < 3; i++) {
      const wave = Math.min(1, Math.max(0, fbm(apx * 1.4 + i * 3.7, t * 0.07 + i * 1.3)));
      const rays = Math.min(1, Math.max(0, fbm(apx * 16 + i * 9, t * 0.5)));
      const w16 = Math.round(wave * 65535);
      const o = (i * LUT_W + c) * 4;
      out[o] = w16 >> 8;
      out[o + 1] = w16 & 255;
      out[o + 2] = Math.round(rays * 255);
      out[o + 3] = 255;
    }
  }
}
