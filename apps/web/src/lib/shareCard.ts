import { scoreColor, type RGB } from '../design/tokens';
import { hhmm } from './format';

/**
 * Generate a 1080×1920 "Tonight" story card (Instagram/WhatsApp) entirely on-device:
 * aurora sky, glass panel, score ring, verdict, place and best window.
 */
export async function renderTonightCard(o: {
  score: number;
  headline: string;
  place: string;
  window: { start: string; end: string } | null;
  kp: number | null;
  cloud: number | null;
  night: boolean;
  postcard?: { nights: number; seen: number };
}): Promise<File> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  await document.fonts?.ready;
  const font = (w: number, size: number) => `${w} ${size}px "Inter Variable", Inter, -apple-system, system-ui, sans-serif`;
  const col: RGB = o.night ? [200, 40, 40] : scoreColor(o.score);
  const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // sky
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, o.night ? '#000' : '#02040a');
  sky.addColorStop(1, o.night ? '#0a0101' : '#0b1226');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H);
  // stars
  for (let i = 0; i < 220; i++) {
    const r = Math.random();
    x.fillStyle = `rgba(255,255,255,${0.2 + r * 0.6})`;
    x.beginPath();
    x.arc(Math.random() * W, Math.random() * H * 0.7, r * 1.6, 0, Math.PI * 2);
    x.fill();
  }
  // aurora curtains
  x.globalCompositeOperation = 'lighter';
  const bands: [RGB, number, number][] = o.night
    ? [[[160, 20, 20], 520, 0.55]]
    : [
        [[74, 222, 128], 560, 0.55],
        [[45, 212, 191], 470, 0.35],
        [[167, 139, 250], 380, 0.25],
      ];
  for (const [c2, y0, a] of bands) {
    x.beginPath();
    x.moveTo(0, y0);
    for (let px = 0; px <= W; px += 20) x.lineTo(px, y0 + Math.sin(px / 140 + y0) * 60 + Math.sin(px / 47) * 14);
    x.lineTo(W, 0);
    x.lineTo(0, 0);
    x.closePath();
    const g = x.createLinearGradient(0, y0 - 380, 0, y0 + 60);
    g.addColorStop(0, css(c2, 0));
    g.addColorStop(0.8, css(c2, a * 0.6));
    g.addColorStop(1, css(c2, a));
    x.fillStyle = g;
    x.filter = 'blur(18px)';
    x.fill();
  }
  x.filter = 'none';
  x.globalCompositeOperation = 'source-over';

  // glass panel
  const px = 80;
  const py = 700;
  const pw = W - 160;
  const ph = 980;
  x.save();
  x.beginPath();
  x.roundRect(px, py, pw, ph, 64);
  x.fillStyle = 'rgba(255,255,255,0.07)';
  x.fill();
  const edge = x.createLinearGradient(px, py, px + pw, py + ph);
  edge.addColorStop(0, 'rgba(255,255,255,0.45)');
  edge.addColorStop(0.4, 'rgba(255,255,255,0.05)');
  edge.addColorStop(1, 'rgba(255,255,255,0.15)');
  x.strokeStyle = edge;
  x.lineWidth = 2;
  x.stroke();
  x.restore();

  // ring
  const cx = W / 2;
  const cy = py + 330;
  const R = 220;
  x.lineCap = 'round';
  x.lineWidth = 12;
  x.strokeStyle = 'rgba(255,255,255,0.1)';
  x.beginPath();
  x.arc(cx, cy, R, 0, Math.PI * 2);
  x.stroke();
  x.shadowColor = css(col, 0.8);
  x.shadowBlur = 40;
  x.strokeStyle = css(col);
  x.beginPath();
  x.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (Math.max(1, o.score) / 100) * Math.PI * 2);
  x.stroke();
  x.shadowBlur = 0;

  const ink = o.night ? '#d63a3a' : '#eef3fb';
  const ink2 = o.night ? 'rgba(214,58,58,0.75)' : 'rgba(238,243,251,0.68)';
  x.textAlign = 'center';
  x.fillStyle = ink;
  x.font = font(200, 190);
  x.fillText(String(o.score), cx, cy + 66);
  x.font = font(500, 30);
  x.fillStyle = ink2;
  x.fillText('A U R O R A   S C O R E', cx, cy + 130);

  x.fillStyle = ink;
  x.font = font(300, 68);
  x.fillText(o.postcard ? 'My aurora season' : o.headline, cx, py + 680);
  x.font = font(400, 38);
  x.fillStyle = ink2;
  const line2 = o.postcard ? `${o.postcard.seen} of ${o.postcard.nights} nights with aurora` : o.window ? `Best window ${hhmm(o.window.start)}–${hhmm(o.window.end)}` : 'Watching the sky';
  x.fillText(line2, cx, py + 750);
  x.fillText(`${o.place} · ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short' })}`, cx, py + 810);
  const meta = [o.kp != null ? `Kp ${o.kp.toFixed(1)}` : null, o.cloud != null ? `${o.cloud}% cloud` : null].filter(Boolean).join('   ·   ');
  if (meta) x.fillText(meta, cx, py + 870);

  x.font = font(500, 34);
  x.fillStyle = ink;
  x.fillText('Norðurljós', cx, H - 120);
  x.font = font(400, 24);
  x.fillStyle = ink2;
  x.fillText('Forecasts, not promises. The sky has the final say.', cx, H - 76);

  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
  return new File([blob], `nordurljos-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
}
