import 'maplibre-gl/dist/maplibre-gl.css';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, ImageSource, Map as MLMap, Marker } from 'maplibre-gl';
// Bundle MapLibre's module worker (and its shared chunk) as one file and tell MapLibre where it is.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);
import { darknessFactor, ovationAt, rankSpots, sunAltitudeDeg, timeIndex, gridValueAt, type RankedSpot } from '@nordurljos/core';
import { AnimatePresence, motion } from 'motion/react';
import { Camera as CamIcon, Layers, LocateFixed, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { spring } from '../design/tokens';
import { useCameras, useCloudGrid, useLiveSightings, useOvationGrid, useRoads, useRoute, useSightings, useSpots, useWarnings, useWeights } from '../lib/api';
import { SightingDetailSheet } from '../sheets/CommunitySheets';
import type { SightingData } from '../lib/types';
import type { Conditions } from '../lib/conditions';
import { haptic } from '../lib/haptics';
import { useReducedMotionPref, useSettings, type MapLayers } from '../lib/store';
import { nightGeoJSON, renderClouds, renderOvation } from '../map/render';
import { preciseOnce } from '../hooks/useGeolocation';
import { TimeScrubber } from '../map/TimeScrubber';
import { BestSpotSheet, SpotSheet } from '../sheets/SpotSheets';
import { Press } from '../ui/Button';
import { Toggle } from '../ui/Controls';
import { Glass } from '../ui/Glass';
import { Sheet } from '../ui/Sheet';
import { useT } from '../lib/i18n';

const STYLE = 'https://tiles.openfreemap.org/styles/dark';
const ICELAND: [number, number] = [-18.9, 64.95];
const GIBS_LIGHTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';

const LAYER_LABELS: Record<keyof MapLayers, [string, string]> = {
  aurora: ['Aurora oval', 'NOAA OVATION, next 30–90 min'],
  clouds: ['Cloud mist', 'Forecast cloud, follows the time slider'],
  night: ['Darkness', 'Where the sun is below −12°'],
  light: ['Light pollution', 'NASA VIIRS Black Marble'],
  spots: ['Dark-sky spots', 'Curated, with parking notes'],
  cams: ['Webcams', 'Live cameras across Iceland'],
  sightings: ['Seeing it now', 'Community reports, fading over 60 min'],
  roads: ['Roads & warnings', 'Vegagerðin conditions, gusts, IMO warnings'],
};
const ROAD_COLORS = ['match', ['get', 'kind'], 'clear', '#4ade80', 'slippery', '#facc15', 'wind', '#a78bfa', 'closed', '#fb7185', '#64748b'] as unknown as string;

function hourFloor(d: Date) {
  return Math.floor(d.getTime() / 3.6e6) * 3.6e6;
}

export default function MapScreen({ c, openCamera, intent = null, clearIntent, onPlan }: { c: Conditions; openCamera: (id: string) => void; intent?: 'best' | null; clearIntent?: () => void; onPlan?: (r: RankedSpot) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<{ spots: Map<string, Marker>; cams: Marker[]; me: Marker | null }>({ spots: new Map(), cams: [], me: null });
  const cloudFlip = useRef<'a' | 'b'>('a');
  const [ready, setReady] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sheet, setSheet] = useState<'layers' | 'best' | 'spot' | null>(null);
  const [picked, setPicked] = useState<RankedSpot | null>(null);
  const { location, mapLayers, set, nightVision, radiusKm, maxDriveMin, favoriteSpots } = useSettings();
  const reduced = useReducedMotionPref();
  const t = useT();

  const grid = useCloudGrid();
  const ovg = useOvationGrid();
  const spots = useSpots();
  const cams = useCameras();
  const sightings = useSightings();
  const live = useLiveSightings();
  const [seen, setSeen] = useState<SightingData | null>(null);
  const liveMarkers = useRef<Marker[]>([]);
  const { weights } = useWeights();
  const roads = useRoads(mapLayers.roads);
  const warnings = useWarnings();

  const g = grid.data?.data ?? null;
  const at = useMemo(() => new Date(hourFloor(c.now) + offset * 3.6e6), [c.now, offset]);
  const ti = g ? timeIndex(g, at) : 0;

  // OVATION "visible" for Iceland (varies slowly; used for spot ranking)
  const ovVisible = useMemo(() => {
    const o = ovg.data?.data;
    if (!o) return c.aurora.data?.data.visible ?? null;
    const values = new Uint8Array(181 * 360);
    for (let lat = o.latMin; lat <= o.latMax; lat++) for (let lon = 0; lon < 360; lon++) values[(lat + 90) * 360 + lon] = o.values[(lat - o.latMin) * 360 + lon]!;
    return ovationAt({ values, forecastTime: o.forecastTime, observationTime: o.observationTime }, location.lat, location.lon).visible;
  }, [ovg.data, location.lat, location.lon, c.aurora.data]);

  const ranked = useMemo(() => {
    const list = spots.data?.data ?? [];
    const sw = c.sw.data?.data;
    return rankSpots(list, {
      from: location,
      at,
      clouds: g,
      timeIdx: ti,
      ovation: offset === 0 ? ovVisible : null, // OVATION is a nowcast; forecasts use Kp only
      kp: sw ? (sw.kp.series.filter((p) => p.time <= at.toISOString()).pop()?.kp ?? sw.kp.now?.kp ?? null) : null,
      bz: offset === 0 ? (sw?.solarWind.bzAvg15m ?? null) : null,
      speed: offset === 0 ? (sw?.solarWind.latest?.speed ?? null) : null,
      maxKm: radiusKm,
      weights,
      maxDriveMin,
      favorites: favoriteSpots,
    });
  }, [spots.data, c.sw.data, location, at, g, ti, offset, ovVisible, radiusKm, weights, maxDriveMin, favoriteSpots]);

  // Marker listeners are created once; route clicks through a ref to the latest ranking.
  const pickRef = useRef<(id: string) => void>(() => {});
  pickRef.current = (id: string) => {
    const r = ranked.find((x) => x.spot.id === id);
    if (r) {
      setPicked(r);
      setSheet('spot');
    }
  };

  // ── init map ──
  useEffect(() => {
    if (!box.current || map.current) return;
    const inIceland = location.lat > 62.5 && location.lat < 67.5 && location.lon > -25.5 && location.lon < -12.5;
    const m = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: inIceland ? ICELAND : [location.lon, location.lat],
      zoom: inIceland ? (window.innerWidth < 500 ? 4.55 : 5.2) : 4,
      minZoom: 2,
      maxZoom: 13,
      attributionControl: { compact: true, customAttribution: 'Aurora: NOAA SWPC · Clouds: Open-Meteo · Lights: NASA GIBS' },
      fadeDuration: reduced ? 0 : 300,
      pitchWithRotate: false,
      dragRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    m.on('load', () => {
      // Calm, muted base: darken background/water, soften labels.
      for (const l of m.getStyle().layers ?? []) {
        if (l.type === 'background') m.setPaintProperty(l.id, 'background-color', '#05080f');
        if (l.type === 'fill' && /water/.test(l.id)) m.setPaintProperty(l.id, 'fill-color', '#070c18');
        if (l.type === 'symbol') m.setPaintProperty(l.id, 'text-opacity', 0.55);
      }
      const firstSymbol = m.getStyle().layers?.find((l: { type: string }) => l.type === 'symbol')?.id;
      m.addSource('lights', { type: 'raster', tiles: [GIBS_LIGHTS], tileSize: 256, maxzoom: 8, attribution: 'NASA GIBS / VIIRS Black Marble' });
      m.addLayer({ id: 'lights', type: 'raster', source: 'lights', paint: { 'raster-opacity': 0.55 }, layout: { visibility: 'none' } }, firstSymbol);
      m.addSource('night', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'night', type: 'fill', source: 'night', paint: { 'fill-color': '#000', 'fill-opacity': 0.28 } }, firstSymbol);
      m.addLayer({ id: 'night-edge', type: 'line', source: 'night', paint: { 'line-color': '#94a3b8', 'line-opacity': 0.25, 'line-width': 1, 'line-dasharray': [2, 3] } }, firstSymbol);
      const empty = quadEmpty();
      m.addSource('ovation', { type: 'image', url: empty.url, coordinates: empty.coords });
      m.addLayer({ id: 'ovation', type: 'raster', source: 'ovation', paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstSymbol);
      for (const k of ['a', 'b'] as const) {
        m.addSource(`clouds-${k}`, { type: 'image', url: empty.url, coordinates: empty.coords });
        m.addLayer({ id: `clouds-${k}`, type: 'raster', source: `clouds-${k}`, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: reduced ? 0 : 450 }, 'raster-fade-duration': 0 } }, firstSymbol);
      }
      m.addSource('warnings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'warnings', type: 'fill', source: 'warnings', paint: { 'fill-color': ['match', ['get', 'severity'], 'Severe', '#fb7185', 'Extreme', '#fb7185', '#facc15'] as unknown as string, 'fill-opacity': 0.16 } }, firstSymbol);
      m.addLayer({ id: 'warnings-edge', type: 'line', source: 'warnings', paint: { 'line-color': '#facc15', 'line-width': 1.5, 'line-opacity': 0.7 } }, firstSymbol);
      m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'] as unknown as string, 'line-width': 3, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 } });
      m.addSource('roads', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'roads', type: 'circle', source: 'roads', minzoom: 5, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 9, 6], 'circle-color': ROAD_COLORS, 'circle-stroke-color': '#02040a', 'circle-stroke-width': 1, 'circle-opacity': 0.9 } });
      m.addLayer({ id: 'roads-gust', type: 'symbol', source: 'roads', minzoom: 7, filter: ['>=', ['get', 'gust'], 15], layout: { 'text-field': ['concat', ['to-string', ['round', ['get', 'gust']]], ' m/s'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#c4b5fd', 'text-halo-color': '#02040a', 'text-halo-width': 1.2 } });
      m.addSource('sightings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: 'sightings',
        type: 'circle',
        source: 'sightings',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'brightness'], 1, 10, 5, 26],
          'circle-color': '#4ade80',
          'circle-opacity': 0.28,
          'circle-blur': 0.8,
        },
      });
      // start with the attribution collapsed to its (i) button
      box.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      setReady(true);
    });
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── layer visibility ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const vis = (id: string, on: boolean) => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('ovation', mapLayers.aurora);
    vis('clouds-a', mapLayers.clouds);
    vis('clouds-b', mapLayers.clouds);
    vis('night', mapLayers.night);
    vis('night-edge', mapLayers.night);
    vis('lights', mapLayers.light);
    vis('sightings', mapLayers.sightings);
    for (const id of ['roads', 'roads-gust', 'warnings', 'warnings-edge']) vis(id, mapLayers.roads);
    markers.current.spots.forEach((mk) => (mk.getElement().style.display = mapLayers.spots ? '' : 'none'));
    markers.current.cams.forEach((mk) => (mk.getElement().style.display = mapLayers.cams ? '' : 'none'));
  }, [mapLayers, ready]);

  // ── OVATION glow ──
  useEffect(() => {
    const m = map.current;
    const o = ovg.data?.data;
    if (!m || !ready || !o) return;
    const r = renderOvation(o, nightVision);
    (m.getSource('ovation') as ImageSource).updateImage({ url: r.url, coordinates: r.coords });
  }, [ovg.data, ready, nightVision]);

  // ── cloud mist (crossfade between hours) ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !g) return;
    const next = cloudFlip.current === 'a' ? 'b' : 'a';
    const r = renderClouds(g, ti, nightVision);
    (m.getSource(`clouds-${next}`) as ImageSource).updateImage({ url: r.url, coordinates: r.coords });
    m.setPaintProperty(`clouds-${next}`, 'raster-opacity', 1);
    m.setPaintProperty(`clouds-${cloudFlip.current}`, 'raster-opacity', 0);
    cloudFlip.current = next;
  }, [g, ti, ready, nightVision]);

  // ── darkness / terminator at scrub time ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('night') as GeoJSONSource).setData(nightGeoJSON(at, -12));
  }, [at, ready]);

  // ── roads (Vegagerðin) & IMO warnings ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('roads') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: (roads.data?.data ?? []).map((r) => ({ type: 'Feature', properties: { kind: r.kind, gust: r.gustMs ?? 0, name: r.name }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } })),
    });
  }, [roads.data, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource('warnings') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: (warnings.data?.data ?? [])
        .filter((w) => w.polygon && w.polygon.length >= 3)
        .map((w) => ({ type: 'Feature', properties: { severity: w.severity, headline: w.headline }, geometry: { type: 'Polygon', coordinates: [[...w.polygon!.map(([la, lo]) => [lo, la]), [w.polygon![0]![1], w.polygon![0]![0]]]] } })),
    });
  }, [warnings.data, ready]);
  // route line from you to the picked spot, coloured by the worst condition along the corridor
  const route = useRoute(location, sheet === 'spot' && picked ? picked.spot : null);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const worst = route.data?.data.worst;
    const color = worst === 'closed' ? '#fb7185' : worst === 'wind' ? '#a78bfa' : worst === 'slippery' ? '#facc15' : worst === 'clear' ? '#4ade80' : '#94a3b8';
    (m.getSource('route') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: sheet === 'spot' && picked ? [{ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: [[location.lon, location.lat], [picked.spot.lon, picked.spot.lat]] } }] : [],
    });
  }, [route.data, sheet, picked, location.lat, location.lon, ready]);

  // ── sightings ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const list = sightings.data?.data ?? [];
    (m.getSource('sightings') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: list.map((s) => ({ type: 'Feature', properties: { brightness: s.brightness }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })),
    });
  }, [sightings.data, ready]);

  // ── live "seeing it now": pulsing glass dots, fading over 60 min; tap for details ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    liveMarkers.current.forEach((mk) => mk.remove());
    if (!mapLayers.sightings) {
      liveMarkers.current = [];
      return;
    }
    const nowMs = Date.now();
    liveMarkers.current = (live.data?.data ?? []).map((sg) => {
      const age = Math.min(60, (nowMs - Date.parse(sg.at)) / 60_000);
      const el = document.createElement('button');
      el.className = `map-live${sg.verification?.verified ? ' verified' : ''}`;
      el.style.opacity = String(Math.max(0.25, 1 - age / 70));
      el.setAttribute('aria-label', `Aurora seen ${Math.round(age)} minutes ago${sg.verification?.verified ? ', verified' : ''}`);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        haptic('tap');
        setSeen(sg);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([sg.lon, sg.lat]).addTo(m);
    });
  }, [live.data, ready, mapLayers.sightings]);

  // ── spot markers (glass pins that pulse when clear & dark) ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const all = spots.data?.data ?? [];
    const seen = new Set<string>();
    for (const s of all) {
      seen.add(s.id);
      let mk = markers.current.spots.get(s.id);
      if (!mk) {
        const el = document.createElement('button');
        el.className = 'map-pin';
        el.setAttribute('aria-label', s.name);
        el.innerHTML = '<span class="map-pin-dot"></span>';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          haptic('tap');
          pickRef.current(s.id);
        });
        mk = new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(m);
        markers.current.spots.set(s.id, mk);
      }
      const pin: Marker = mk;
      const cloud = g ? gridValueAt(g, ti, s.lat, s.lon) : null;
      const dark = darknessFactor(sunAltitudeDeg(at, s.lat, s.lon));
      pin.getElement().classList.toggle('clear', cloud != null && cloud <= 30 && dark >= 0.6);
      pin.getElement().style.display = mapLayers.spots ? '' : 'none';
    }
    markers.current.spots.forEach((mk, id) => {
      if (!seen.has(id)) {
        mk.remove();
        markers.current.spots.delete(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots.data, ready, g, ti, at]);

  // ── camera markers ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.cams.forEach((mk) => mk.remove());
    markers.current.cams = (cams.data?.data ?? []).map((cam) => {
      const el = document.createElement('button');
      el.className = 'map-cam';
      el.setAttribute('aria-label', `Camera: ${cam.name}`);
      el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        openCamera(cam.id);
      });
      el.style.display = mapLayers.cams ? '' : 'none';
      return new maplibregl.Marker({ element: el }).setLngLat([cam.lon, cam.lat]).addTo(m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cams.data, ready]);

  // ── me ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!markers.current.me) {
      const el = document.createElement('div');
      el.className = 'map-me';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Your location');
      markers.current.me = new maplibregl.Marker({ element: el }).setLngLat([location.lon, location.lat]).addTo(m);
    } else markers.current.me.setLngLat([location.lon, location.lat]);
  }, [location.lat, location.lon, ready]);

  // Arriving from the night planner: open "best spot" once the map is ready.
  useEffect(() => {
    if (intent !== 'best' || !ready || !spots.data) return;
    setSheet('best');
    if (ranked[0]) flyTo(ranked[0].spot.lon, ranked[0].spot.lat, 7.5);
    clearIntent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, ready, spots.data]);

  const flyTo = (lon: number, lat: number, zoom = 8.5) => map.current?.flyTo({ center: [lon, lat], zoom, ...(reduced ? { duration: 0 } : { speed: 1.4, curve: 1.5 }), essential: true });

  // scrubber bars: cloud at my location per hour, darkness per hour
  const minH = -3;
  const maxH = 48;
  const bars = useMemo(() => {
    const out: (number | null)[] = [];
    for (let h = minH; h <= maxH; h++) {
      if (!g) {
        out.push(null);
        continue;
      }
      out.push(gridValueAt(g, timeIndex(g, new Date(hourFloor(c.now) + h * 3.6e6)), location.lat, location.lon) ?? c.clouds.data?.data.hourly.find((x) => new Date(x.time).getTime() === hourFloor(c.now) + h * 3.6e6)?.total ?? null);
    }
    return out;
  }, [g, c.now, location.lat, location.lon, c.clouds.data]);
  const darkBars = useMemo(() => {
    const out: number[] = [];
    for (let h = minH; h <= maxH; h++) out.push(darknessFactor(sunAltitudeDeg(new Date(hourFloor(c.now) + h * 3.6e6), location.lat, location.lon)));
    return out;
  }, [c.now, location.lat, location.lon]);

  const windowEnd = c.best?.end ?? c.plan.darkEnd;
  const atLabel = offset === 0 ? 'right now' : at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="fixed inset-0" style={{ zIndex: 'var(--z-content)' }}>
      <div ref={box} className="map-root" style={{ position: "absolute", inset: 0 }} role="region" aria-label="Aurora map" />

      {/* glass control cluster */}
      <div className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] flex flex-col gap-2">
        <Press aria-label="Map layers" onClick={() => setSheet('layers')} className="w-12">
          <Layers size={18} strokeWidth={1.5} aria-hidden />
        </Press>
        <Press
          aria-label="Fly to my location"
          onClick={async () => {
            // precise only when needed: one in-memory GPS fix for the map, never stored
            const p = await preciseOnce();
            const at = p ?? location;
            markers.current.me?.setLngLat([at.lon, at.lat]);
            flyTo(at.lon, at.lat, p ? 10 : 8);
          }}
          className="w-12"
        >
          <LocateFixed size={18} strokeWidth={1.5} aria-hidden />
        </Press>
      </div>

      {/* best spot CTA */}
      <div className="absolute left-4 top-[max(16px,env(safe-area-inset-top))]">
        <Press
          variant="glass"
          hapticKind="select"
          onClick={() => {
            setSheet('best');
            if (ranked[0]) flyTo(ranked[0].spot.lon, ranked[0].spot.lat, 7.5);
          }}
          className="px-4"
        >
          <Sparkles size={16} strokeWidth={1.5} aria-hidden />
          <span className="text-[15px] font-medium">{t('best.spot')}</span>
        </Press>
      </div>

      {/* loading / error chips */}
      <AnimatePresence>
        {(!ready || grid.isLoading) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-1/2 top-[max(76px,calc(env(safe-area-inset-top)+64px))] -translate-x-1/2">
            <Glass radius="pill" className="skeleton px-4 py-2 text-[13px] text-ink-2">Loading sky layers…</Glass>
          </motion.div>
        )}
      </AnimatePresence>

      {/* scrubber */}
      <motion.div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] mx-auto max-w-md px-4" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring}>
        <TimeScrubber min={minH} max={maxH} value={offset} onChange={setOffset} now={c.now} bars={bars} dark={darkBars} />
      </motion.div>

      <Sheet open={sheet === 'layers'} onClose={() => setSheet(null)} title="Layers" initial="half" detents={['half', 'full']}>
        {(Object.keys(LAYER_LABELS) as (keyof MapLayers)[]).map((k) => (
          <Toggle key={k} label={LAYER_LABELS[k][0]} hint={LAYER_LABELS[k][1]} checked={mapLayers[k]} onChange={(v) => set('mapLayers', { ...mapLayers, [k]: v })} />
        ))}
        <div className="flex items-center gap-2 pb-6 pt-3 text-[12px] text-ink-3">
          <CamIcon size={14} strokeWidth={1.5} aria-hidden /> Tap a camera pin to open it. Map © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
        </div>
      </Sheet>

      <BestSpotSheet
        ranked={ranked}
        open={sheet === 'best'}
        onClose={() => setSheet(null)}
        atLabel={atLabel}
        windowEnd={windowEnd}
        onPlan={onPlan}
        onPick={(r) => {
          setPicked(r);
          setSheet('spot');
          flyTo(r.spot.lon, r.spot.lat, 9);
        }}
      />
      <SightingDetailSheet s={seen} open={!!seen} onClose={() => setSeen(null)} />
      <SpotSheet r={picked} open={sheet === 'spot'} onClose={() => setSheet(null)} windowEnd={windowEnd} onPlan={onPlan} />
    </div>
  );
}

function quadEmpty() {
  return {
    url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    coords: [
      [-180, 85],
      [180, 85],
      [180, 45],
      [-180, 45],
    ] as [[number, number], [number, number], [number, number], [number, number]],
  };
}
