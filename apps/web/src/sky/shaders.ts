export const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/**
 * Aurora curtains: 3 layered fbm-displaced bands with a bright lower edge,
 * vertical ray structure and colour stratification by height (green → teal/violet → magenta),
 * like the real oxygen/nitrogen emission layers. Twinkling stars with tilt parallax.
 */
export const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_night;
uniform vec3 u_colA;
uniform vec3 u_colB;
uniform vec3 u_colC;
uniform vec2 u_tilt;
// Per-column lookup (computed on the CPU each frame, see skyLut.ts): row i = band i,
// R/G = curtain wave (16-bit), B = ray brightness. Everything costly depends only on x.
uniform sampler2D u_lut;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time * u_speed;

  // Night sky gradient: midnight navy → black overhead.
  vec3 col = mix(vec3(0.022, 0.04, 0.085), vec3(0.006, 0.012, 0.03), smoothstep(0.0, 1.0, uv.y));

  // Stars (far layer, slight parallax).
  vec2 sp = (p + u_tilt * 0.008) * 90.0;
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5;
  float h = hash(cell);
  vec2 jitter = vec2(hash(cell + 1.7), hash(cell + 3.1)) - 0.5;
  float star = step(0.975, h) * smoothstep(0.11, 0.0, length(f - jitter * 0.6));
  float tw = 0.55 + 0.45 * sin(u_time * (0.8 + h * 2.5) + h * 50.0);
  col += star * tw * vec3(0.85, 0.9, 1.0) * smoothstep(0.15, 0.6, uv.y) * (1.0 - 0.6 * u_intensity);

  // Aurora curtains (nearer layer, stronger parallax).
  vec2 ap = p + u_tilt * 0.035;
  vec3 ac = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float base = 0.5 + 0.11 * fi + 0.06 * sin(ap.x * 1.2 + t * 0.12 + fi * 2.1);
    vec4 lut = texture2D(u_lut, vec2(uv.x, (fi + 0.5) / 3.0));
    float wave = (lut.r * 255.0 * 256.0 + lut.g * 255.0) / 65535.0;
    float y = base + (wave - 0.5) * 0.38;
    float d = uv.y - y;
    float curtain = smoothstep(-0.025, 0.0, d) * exp(-max(d, 0.0) * (5.5 - 2.0 * u_intensity));
    float rays = 0.45 + 0.55 * lut.b;
    vec3 c = mix(u_colA, u_colB, smoothstep(0.02, 0.22, d));
    c = mix(c, u_colC, smoothstep(0.16, 0.42, d));
    ac += c * curtain * rays * (0.75 - 0.18 * fi);
  }
  col += ac * (0.2 + 0.95 * u_intensity);

  // Darken towards the ground so floating UI has a calm base.
  col *= 0.35 + 0.65 * smoothstep(-0.05, 0.45, uv.y);

  if (u_night > 0.5) {
    float l = dot(col, vec3(0.35, 0.55, 0.1));
    col = vec3(l * 0.62, l * 0.035, l * 0.025); // dim: dark adaptation first
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
