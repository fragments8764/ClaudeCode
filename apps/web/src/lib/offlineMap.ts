/**
 * "Save Iceland for offline": prefetches the vector tiles, glyphs and sprites for Iceland
 * (zoom 3–9) so the service worker's tile cache can serve the map with no signal.
 */
const STYLE = 'https://tiles.openfreemap.org/styles/dark';
const BBOX = { w: -25, e: -13, s: 63, n: 67 };

const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

export function tileList(template: string, zMin = 3, zMax = 9, box: { w: number; e: number; s: number; n: number } = BBOX): string[] {
  const urls: string[] = [];
  for (let z = zMin; z <= zMax; z++) {
    for (let x = lon2x(box.w, z); x <= lon2x(box.e, z); x++) {
      for (let y = lat2y(box.n, z); y <= lat2y(box.s, z); y++) urls.push(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    }
  }
  return urls;
}

/** Bounding box of a circle (km) around a point. */
export function bboxAround(c: { lat: number; lon: number }, km: number) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((c.lat * Math.PI) / 180));
  return { w: c.lon - dLon, e: c.lon + dLon, s: c.lat - dLat, n: c.lat + dLat };
}

/** Style + vector tiles (z4–10) + glyphs/sprites for a pinned region. */
export async function tilesAround(c: { lat: number; lon: number }, km: number, signal?: AbortSignal): Promise<string[]> {
  try {
    const style = await (await fetch(STYLE, { signal })).json();
    const urls: string[] = [STYLE];
    for (const src of Object.values(style.sources ?? {}) as { url?: string; tiles?: string[] }[]) {
      let tiles = src.tiles;
      if (!tiles && src.url) {
        urls.push(src.url);
        tiles = (await (await fetch(src.url, { signal })).json()).tiles;
      }
      if (tiles?.[0]) urls.push(...tileList(tiles[0], 4, 10, bboxAround(c, km)));
    }
    return urls;
  } catch {
    return [];
  }
}

export async function saveIcelandOffline(onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<number> {
  const style = await (await fetch(STYLE, { signal })).json();
  const urls: string[] = [STYLE];
  for (const src of Object.values(style.sources ?? {}) as { url?: string; tiles?: string[] }[]) {
    let tiles = src.tiles;
    if (!tiles && src.url) {
      urls.push(src.url);
      tiles = (await (await fetch(src.url, { signal })).json()).tiles;
    }
    if (tiles?.[0]) urls.push(...tileList(tiles[0]));
  }
  if (style.sprite) {
    const sp = Array.isArray(style.sprite) ? style.sprite.map((s: { url: string }) => s.url) : [style.sprite];
    for (const s of sp) urls.push(`${s}.json`, `${s}.png`, `${s}@2x.json`, `${s}@2x.png`);
  }
  if (style.glyphs) {
    const fonts = new Set<string>();
    for (const l of style.layers ?? []) {
      const tf = l.layout?.['text-font'];
      if (Array.isArray(tf) && tf.every((x: unknown) => typeof x === 'string')) fonts.add(tf.join(','));
    }
    for (const f of fonts) for (const r of ['0-255', '256-511']) urls.push(style.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', r));
  }
  let done = 0;
  const queue = [...new Set(urls)];
  const total = queue.length;
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const u = queue.shift()!;
      await fetch(u, { signal, mode: 'cors' }).catch(() => {});
      onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return done;
}
