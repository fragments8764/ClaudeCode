import { haversineKm } from '@nordurljos/core';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { Camera as CamIcon, ExternalLink, Eye, Mountain, Pause, Play, Radio, Star, Waves } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { spring, STAGGER } from '../design/tokens';
import { formatAge } from '@nordurljos/core';
import { apiUrl, getJson, useCameras } from '../lib/api';
import { haptic } from '../lib/haptics';
import { useReducedMotionPref, useSettings } from '../lib/store';
import type { Camera } from '../lib/types';
import { Press } from '../ui/Button';
import { Glass } from '../ui/Glass';
import { useT } from '../lib/i18n';

type Filter = 'all' | 'iceland' | 'allsky' | 'favorites';

const KIND_ICON = { allsky: Radio, volcano: Mountain, glacier: Mountain, harbour: Waves, lighthouse: Eye } as Record<string, typeof CamIcon>;

function statusDot(c: Camera) {
  if (c.status === 'link') return <ExternalLink size={12} strokeWidth={2} className="mt-[3px] shrink-0 text-ink-2" aria-hidden />;
  const col = c.status === 'live' ? 'bg-good' : c.status === 'stale' ? 'bg-fair' : 'bg-poor';
  return (
    <span className="relative mt-[5px] flex h-2.5 w-2.5 shrink-0" aria-hidden>
      {c.status === 'live' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${col} opacity-60 motion-reduce:hidden`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${col}`} />
    </span>
  );
}

function cloudTag(v: number | null) {
  if (v == null) return null;
  if (v <= 25) return <span className="text-good">Clear {v}%</span>;
  if (v <= 65) return <span className="text-fair">Partly {v}%</span>;
  return <span className="text-ink-3">Cloudy {v}%</span>;
}

/** Thumbnail that refreshes every 2 min (cache-busted), never shown until loaded (no flashes). */
function Thumb({ cam, big = false, frameSrc }: { cam: Camera; big?: boolean; frameSrc?: string | null }) {
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const saver = useSettings((s) => s.batterySaver);
  useEffect(() => {
    if (saver) return; // battery saver pauses camera feeds
    const id = setInterval(() => setTick((t) => t + 1), 120_000);
    return () => clearInterval(id);
  }, [saver]);
  const Icon = KIND_ICON[cam.kind] ?? CamIcon;
  if (!cam.image) {
    return (
      <div className={`grid h-full w-full place-items-center ${big ? '' : 'aspect-[4/3]'}`} style={{ background: 'radial-gradient(120% 90% at 30% 10%, rgb(var(--aurora-rgb) / 0.22), transparent 60%), linear-gradient(160deg, rgb(255 255 255 / 0.06), rgb(255 255 255 / 0.01))' }}>
        <div className="text-center">
          <Icon size={big ? 36 : 22} strokeWidth={1.25} className="mx-auto text-ink-2" aria-hidden />
          <div className="mt-1 text-[11px] text-ink-3">Opens live view</div>
        </div>
      </div>
    );
  }
  const src = frameSrc ?? apiUrl(`${cam.image}?t=${tick}`);
  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${big ? '' : 'aspect-[4/3]'}`}>
      {!loaded && <div className="skeleton absolute inset-0 rounded-none" />}
      <img src={src} alt={`Latest image from ${cam.name}`} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} className={`h-full w-full ${big ? 'object-contain' : 'object-cover'} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}

/** Fullscreen viewer: shared-element expand from the grid, swipe down to dismiss, timelapse. */
export function CameraViewer({ cam, onClose }: { cam: Camera | null; onClose: () => void }) {
  const reduced = useReducedMotionPref();
  const y = useMotionValue(0);
  const bg = useTransform(y, [0, 300], [1, 0.2]);
  const [frames, setFrames] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [fi, setFi] = useState(0);
  const location = useSettings((s) => s.location);

  useEffect(() => {
    setPlaying(false);
    setFrames([]);
    y.set(0);
    if (cam?.image) getJson<{ data: string[] }>(`/api/cameras/${cam.id}/frames`).then((r) => setFrames(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam?.id]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => setFi((i) => (i + 1) % frames.length), 220);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  useEffect(() => {
    if (!cam) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [cam, onClose]);

  return createPortal(
    <AnimatePresence>
      {cam && (
        <motion.div className="fixed inset-0 flex flex-col" style={{ zIndex: 'var(--z-sheet)' }} role="dialog" aria-modal="true" aria-label={cam.name}>
          <motion.div className="absolute inset-0 bg-black" style={{ opacity: bg }} initial={{ opacity: 0 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative flex flex-1 flex-col justify-center"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.8 }}
            style={{ y }}
            onDragEnd={(_, i) => {
              if (i.offset.y > 120 || i.velocity.y > 800) {
                haptic('tap');
                onClose();
              }
            }}
            exit={{ opacity: 0, y: reduced ? 0 : 60 }}
            transition={spring}
          >
            <motion.div layoutId={`cam-${cam.id}`} transition={spring} className="relative mx-auto aspect-[4/3] w-full max-w-3xl overflow-hidden">
              <Thumb cam={cam} big frameSrc={playing && frames.length ? apiUrl(`/api/cameras/${cam.id}/frames/${fi}`) : null} />
            </motion.div>
            <div className="mx-auto mt-4 w-full max-w-3xl px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-light">{cam.name}</h2>
                  <p className="text-[13px] text-ink-2">
                    {cam.region} · {Math.round(haversineKm(location, cam))} km away {cam.updatedAt ? `· updated ${formatAge(cam.updatedAt)}` : ''}
                  </p>
                  <p className="mt-1 text-[13px]">{cloudTag(cam.cloudNow)} <span className="text-ink-3">forecast at camera</span></p>
                </div>
                {frames.length >= 2 && (
                  <Press onClick={() => setPlaying((p) => !p)} className="shrink-0 px-4" aria-label={playing ? 'Pause timelapse' : 'Play timelapse'}>
                    {playing ? <Pause size={16} strokeWidth={1.75} aria-hidden /> : <Play size={16} strokeWidth={1.75} aria-hidden />}
                    <span className="text-[14px]">{playing ? `${fi + 1}/${frames.length}` : 'Timelapse'}</span>
                  </Press>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <a href={cam.pageUrl} target="_blank" rel="noreferrer" className="flex-1">
                  <Press variant={cam.embed === 'link' ? 'accent' : 'glass'} className="h-14 w-full text-[15px] font-medium" tabIndex={-1}>
                    <ExternalLink size={17} strokeWidth={1.75} aria-hidden /> {cam.embed === 'link' ? 'Open live stream' : 'Open source site'}
                  </Press>
                </a>
                <Press onClick={onClose} className="h-14 px-5" aria-label="Close camera">
                  Close
                </Press>
              </div>
              <p className="mt-3 text-[12px] text-ink-3">
                © {cam.attribution}. {cam.note ?? ''} Swipe down to close.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function CamerasScreen({ openId, setOpenId, onClearNow }: { openId: string | null; setOpenId: (id: string | null) => void; onClearNow: () => void }) {
  const q = useCameras();
  const t = useT();
  const { location, favorites, set } = useSettings();
  const [filter, setFilter] = useState<Filter>('all');
  const list = useMemo(() => {
    const all = (q.data?.data ?? []).map((c) => ({ ...c, km: haversineKm(location, c) }));
    const f = all.filter((c) => (filter === 'iceland' ? c.country === 'IS' : filter === 'allsky' ? c.kind === 'allsky' : filter === 'favorites' ? favorites.includes(c.id) : true));
    return f.sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) || a.km - b.km);
  }, [q.data, location, filter, favorites]);
  const open = (q.data?.data ?? []).find((c) => c.id === openId) ?? null;
  const toggleFav = (id: string) => {
    haptic('select');
    set('favorites', favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id]);
  };
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={scrollRef} className="mx-auto max-w-xl px-5 pb-[calc(env(safe-area-inset-bottom)+108px)] pt-[max(20px,env(safe-area-inset-top))]">
      <header className="mb-4 mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="on-sky font-display text-[34px] font-light">{t('cams.title')}</h1>
          <p className="on-sky text-[13px] text-ink-2">{t('cams.sub')}</p>
        </div>
        <Press variant="accent" hapticKind="select" onClick={onClearNow} className="shrink-0 px-4 text-[14px] font-medium">
          <Eye size={16} strokeWidth={1.75} aria-hidden /> {t('clear.q')}
        </Press>
      </header>

      <div className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5" role="tablist" aria-label="Filter cameras">
        {(
          [
            ['all', 'All'],
            ['iceland', 'Iceland'],
            ['allsky', 'Aurora cams'],
            ['favorites', 'Favourites'],
          ] as [Filter, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => {
              haptic('select');
              setFilter(k);
            }}
            className={`glass pill min-h-[40px] shrink-0 px-4 text-[13px] ${filter === k ? 'shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.6)]' : 'text-ink-2'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {q.isLoading && !q.data ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-[var(--r-lg)]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Glass radius="xl" className="p-6 text-center text-[15px] text-ink-2">
          {filter === 'favorites' ? 'Tap the star on a camera to keep it here.' : 'No cameras available right now.'}
        </Glass>
      ) : (
        <motion.ul className="grid grid-cols-2 gap-3" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: STAGGER / 2 } } }}>
          {list.map((cam) => (
            <motion.li key={cam.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: spring } }}>
              <Glass radius="lg" className="overflow-hidden">
                <button className="block w-full text-left" onClick={() => (haptic('tap'), setOpenId(cam.id))} aria-label={`Open ${cam.name}`}>
                  <motion.div layoutId={`cam-${cam.id}`} transition={spring} className="overflow-hidden">
                    <Thumb cam={cam} />
                  </motion.div>
                  <div className="px-3 pb-3 pt-2">
                    <div className="flex items-start gap-1.5">
                      {statusDot(cam)}
                      <span className="line-clamp-2 text-[14px] font-medium leading-snug">{cam.name}</span>
                    </div>
                    <div className="mt-0.5 flex justify-between gap-1 text-[12px] text-ink-3">
                      <span className="truncate">{cam.km < 1000 ? `${Math.round(cam.km)} km` : `${(cam.km / 1000).toFixed(1)}k km`}</span>
                      {cloudTag(cam.cloudNow)}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => toggleFav(cam.id)}
                  aria-label={favorites.includes(cam.id) ? `Remove ${cam.name} from favourites` : `Add ${cam.name} to favourites`}
                  aria-pressed={favorites.includes(cam.id)}
                  className="absolute right-1.5 top-1.5 grid h-10 w-10 place-items-center rounded-full bg-[rgb(0_0_0/0.35)] backdrop-blur"
                >
                  <Star size={16} strokeWidth={1.75} className={favorites.includes(cam.id) ? 'fill-[rgb(var(--aurora-rgb))] text-[rgb(var(--aurora-rgb))]' : 'text-ink'} aria-hidden />
                </button>
              </Glass>
            </motion.li>
          ))}
        </motion.ul>
      )}
      <p className="on-sky mt-6 text-[12px] leading-relaxed text-ink-3">
        Images are shown with each operator's attribution; live streams open on the operator's own site. Cloud tags are forecasts at each camera.
      </p>
      <CameraViewer cam={open} onClose={() => setOpenId(null)} />
    </div>
  );
}
