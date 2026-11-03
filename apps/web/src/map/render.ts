import type { FeatureCollection } from 'geojson';
import { gridValueAt, nightPolygon, type ValueGrid } from '@nordurljos/core';
import type { OvationGridData } from '../lib/types';

/**
 * Raster overlays rendered on a canvas and handed to MapLibre as image sources.
 * MapLibre places an image quad linearly in Web-Mercator space, so we lay out canvas
 * rows evenly in mercator Y (not latitude) to keep features in the right place.
 */
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

export type Quad = [[number, number], [number, number], [number, number], [number, number]];
export const quad = (w: number, n: number, e: number, s: number): Quad => [
  [w, n],
  [e, n],
  [e, s],
  [w, s],
];

function blurInto(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(src, 0, 0);
  return out;
}

/** OVATION as a soft glow: transparent → green → violet/magenta for strong values. */
export function renderOvation(g: OvationGridData, night: boolean): { url: string; coords: Quad } {
  const W = 720;
  const H = 300;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const yN = mercY(g.latMax);
  const yS = mercY(g.latMin);
  const at = (lat: number, lon360: number) => {
    const la = Math.max(g.latMin, Math.min(g.latMax, lat));
    const i0 = Math.floor(la - g.latMin);
    const i1 = Math.min(g.latMax - g.latMin, i0 + 1);
    const fy = la - g.latMin - i0;
    const j0 = Math.floor(lon360) % 360;
    const j1 = (j0 + 1) % 360;
    const fx = lon360 - Math.floor(lon360);
    const v = (i: number, j: number) => g.values[i * 360 + j] ?? 0;
    return (v(i0, j0) * (1 - fx) + v(i0, j1) * fx) * (1 - fy) + (v(i1, j0) * (1 - fx) + v(i1, j1) * fx) * fy;
  };
  for (let y = 0; y < H; y++) {
    const lat = invMercY(yN + ((yS - yN) * (y + 0.5)) / H);
    for (let x = 0; x < W; x++) {
      const lon = -180 + ((x + 0.5) / W) * 360;
      const v = at(lat, (lon + 360) % 360);
      if (v < 2) continue;
      const t = Math.min(1, v / 45);
      const k = (y * W + x) * 4;
      if (night) {
        img.data.set([200, 30, 30, Math.round(255 * Math.min(0.75, t * 0.9))], k);
      } else {
        // emerald → teal → violet → magenta
        const r = t < 0.5 ? 74 + (45 - 74) * (t / 0.5) : 45 + (244 - 45) * ((t - 0.5) / 0.5);
        const gg = t < 0.5 ? 222 + (212 - 222) * (t / 0.5) : 212 + (114 - 212) * ((t - 0.5) / 0.5);
        const b = t < 0.5 ? 128 + (191 - 128) * (t / 0.5) : 191 + (182 - 191) * ((t - 0.5) / 0.5);
        img.data.set([r, gg, b, Math.round(255 * Math.min(0.8, 0.12 + t * 0.85))], k);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: blurInto(c, 3).toDataURL('image/png'), coords: quad(-180, g.latMax, 180, g.latMin) };
}

/** Cloud cover as translucent mist over the grid's bbox for one hour index. */
export function renderClouds(grid: ValueGrid, ti: number, night: boolean): { url: string; coords: Quad } {
  const w = grid.lons[0]!;
  const e = grid.lons[grid.lons.length - 1]!;
  const s = grid.lats[0]!;
  const n = grid.lats[grid.lats.length - 1]!;
  const W = 240;
  const H = 180;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const yN = mercY(n);
  const yS = mercY(s);
  const col = night ? [110, 18, 18] : [176, 188, 206];
  for (let y = 0; y < H; y++) {
    const lat = invMercY(yN + ((yS - yN) * (y + 0.5)) / H);
    for (let x = 0; x < W; x++) {
      const lon = w + ((x + 0.5) / W) * (e - w);
      const v = gridValueAt(grid, ti, lat, lon);
      if (v == null || v < 5) continue;
      const a = Math.pow(v / 100, 1.6) * 0.42; // translucent mist: the map stays readable under full overcast
      img.data.set([col[0]!, col[1]!, col[2]!, Math.round(255 * a)], (y * W + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: blurInto(c, 2).toDataURL('image/png'), coords: quad(w, n, e, s) };
}

/** Night side (sun below altDeg) as a GeoJSON polygon. */
export function nightGeoJSON(at: Date, altDeg: number): FeatureCollection {
  const ring = nightPolygon(at, altDeg, 3, 0.5);
  return {
    type: 'FeatureCollection',
    features: ring ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] : [],
  };
}
