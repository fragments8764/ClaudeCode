/** Minimal IndexedDB key-value store for photo thumbnails (kept out of localStorage's small quota). */
const DB = 'nordurljos';
const STORE = 'blobs';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
export const idbSet = (k: string, v: unknown) => tx('readwrite', (s) => s.put(v, k));
export const idbGet = <T>(k: string) => tx<T | undefined>('readonly', (s) => s.get(k) as IDBRequest<T | undefined>);
export const idbDel = (k: string) => tx('readwrite', (s) => s.delete(k));
export const idbClear = () => tx('readwrite', (s) => s.clear());
export async function idbKeys(): Promise<string[]> {
  return (await tx('readonly', (s) => s.getAllKeys())).map(String);
}

/** Downscale an image file to a small JPEG data URL, stripping metadata (EXIF/GPS) by re-encoding. */
export async function thumbnail(file: File, max = 640, quality = 0.8): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
