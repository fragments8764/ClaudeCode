import { useEffect, useRef, useState } from 'react';
import { tilt } from '../hooks/useTilt';
import type { SkyParams } from './skyParams';
import { FRAG, VERT } from './shaders';
import { CssSky } from './CssSky';

/**
 * Full-bleed live aurora (WebGL1). Parameters ease toward targets every frame,
 * so live data changes feel organic. Capped at 60 fps, paused when the tab is hidden,
 * half resolution + 30 fps in low-power mode, a single still frame under reduced motion.
 * Falls back to a CSS gradient sky if WebGL is unavailable.
 */
export function AuroraSky({ params, night, reducedMotion, lowPower }: { params: SkyParams; night: boolean; reducedMotion: boolean; lowPower: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef(params);
  const flags = useRef({ night, reducedMotion, lowPower });
  const redraw = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);

  target.current = params;
  flags.current = { night, reducedMotion, lowPower };

  useEffect(() => {
    redraw.current();
  }, [params, night, reducedMotion, lowPower]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) {
      setFailed(true);
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (e) {
      console.warn('[sky] WebGL init failed, using CSS sky', e);
      setFailed(true);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = {
      res: u('u_res'), time: u('u_time'), intensity: u('u_intensity'), speed: u('u_speed'), night: u('u_night'),
      colA: u('u_colA'), colB: u('u_colB'), colC: u('u_colC'), tilt: u('u_tilt'),
    };

    // Current (eased) state
    const cur = { ...target.current, colA: [...target.current.colA], colB: [...target.current.colB], colC: [...target.current.colC] };
    let skyTime = 40; // seconds of "sky time" (advances with speed)
    let raf = 0;
    let last = 0;

    const resize = () => {
      const scale = flags.current.lowPower ? 0.5 : Math.min(devicePixelRatio || 1, 2) * 0.6;
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const draw = () => {
      resize();
      const T = target.current;
      const k = flags.current.reducedMotion ? 1 : 0.03;
      cur.intensity += (T.intensity - cur.intensity) * k;
      cur.speed += (T.speed - cur.speed) * k;
      for (const key of ['colA', 'colB', 'colC'] as const) for (let i = 0; i < 3; i++) cur[key][i]! += (T[key][i]! - cur[key][i]!) * k;
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, skyTime);
      gl.uniform1f(U.intensity, cur.intensity);
      gl.uniform1f(U.speed, cur.speed);
      gl.uniform1f(U.night, flags.current.night ? 1 : 0);
      gl.uniform3f(U.colA, cur.colA[0]! / 255, cur.colA[1]! / 255, cur.colA[2]! / 255);
      gl.uniform3f(U.colB, cur.colB[0]! / 255, cur.colB[1]! / 255, cur.colB[2]! / 255);
      gl.uniform3f(U.colC, cur.colC[0]! / 255, cur.colC[1]! / 255, cur.colC[2]! / 255);
      gl.uniform2f(U.tilt, tilt.x, tilt.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const minDt = flags.current.lowPower ? 1000 / 30 - 1 : 1000 / 60 - 1;
      if (now - last < minDt) return; // 60 fps cap (30 in low power) even on 120 Hz screens
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      skyTime += dt;
      draw();
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = 0;
      if (flags.current.reducedMotion) draw();
      else raf = requestAnimationFrame(frame);
    };
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    redraw.current = () => {
      if (document.hidden) return;
      start();
    };
    const ro = new ResizeObserver(() => flags.current.reducedMotion && draw());
    ro.observe(canvas);
    document.addEventListener('visibilitychange', onVis);
    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', lost);
    start();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', lost);
    };
  }, []);

  if (failed) return <CssSky intensity={params.intensity} />;
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
