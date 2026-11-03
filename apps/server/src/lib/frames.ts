/** Ring buffer of camera snapshots for the timelapse viewer (memory only). */
export interface Frame {
  at: string;
  contentType: string;
  bytes: Uint8Array;
}

export class FrameStore {
  private frames = new Map<string, Frame[]>();
  constructor(private max = 48) {}

  add(cameraId: string, f: Frame) {
    const arr = this.frames.get(cameraId) ?? [];
    const last = arr[arr.length - 1];
    // skip identical consecutive images (camera not updated)
    if (last && last.bytes.length === f.bytes.length && last.bytes[100] === f.bytes[100] && last.bytes[f.bytes.length >> 1] === f.bytes[f.bytes.length >> 1]) return;
    arr.push(f);
    while (arr.length > this.max) arr.shift();
    this.frames.set(cameraId, arr);
  }

  list(cameraId: string): string[] {
    return (this.frames.get(cameraId) ?? []).map((f) => f.at);
  }

  get(cameraId: string, i: number): Frame | undefined {
    return this.frames.get(cameraId)?.[i];
  }
}
