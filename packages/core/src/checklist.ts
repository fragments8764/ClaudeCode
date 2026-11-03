/**
 * TONIGHT'S CHECKLIST — weather-aware packing list. Pure: callers pass tonight's conditions.
 */
export interface ChecklistItem {
  id: string;
  label: string;
  why?: string;
  essential: boolean;
}

export interface ChecklistContext {
  feelsLikeC: number | null;
  airC: number | null;
  gustMs: number | null;
  driving: boolean;
  driveMin: number | null;
  hasCamera: boolean;
  iceRisk: boolean;
  darkHours: number;
}

export function buildChecklist(c: ChecklistContext): ChecklistItem[] {
  const cold = (c.feelsLikeC ?? 0) <= 0;
  const veryCold = (c.feelsLikeC ?? 0) <= -8;
  const items: ChecklistItem[] = [
    { id: 'layers', label: veryCold ? 'Thermal base layer, fleece, down jacket' : cold ? 'Warm layers + insulated jacket' : 'An extra warm layer', why: c.feelsLikeC != null ? `Feels like ${Math.round(c.feelsLikeC)}°C` : undefined, essential: true },
    { id: 'shell', label: 'Windproof, waterproof shell', why: (c.gustMs ?? 0) >= 15 ? `Gusts ${Math.round(c.gustMs!)} m/s` : undefined, essential: (c.gustMs ?? 0) >= 10 },
    { id: 'hat-gloves', label: 'Hat, warm gloves (touch-screen tips), neck gaiter', essential: cold },
    { id: 'boots', label: veryCold ? 'Insulated boots + wool socks' : 'Warm, waterproof boots', essential: true },
    { id: 'headlamp', label: 'Headlamp with red-light mode', why: 'Keeps your night vision', essential: true },
    { id: 'phone', label: 'Phone fully charged', essential: true },
    { id: 'powerbank', label: 'Power bank (keep it in an inside pocket)', why: cold ? 'Cold drains batteries fast' : undefined, essential: true },
    { id: 'thermos', label: 'Thermos with a hot drink + snacks', why: c.darkHours >= 8 ? 'Long night ahead' : undefined, essential: false },
  ];
  if (c.iceRisk || (c.airC ?? 99) <= 1) items.push({ id: 'spikes', label: 'Microspikes / ice cleats', why: 'Icy paths at viewpoints', essential: true });
  if (c.hasCamera) {
    items.push({ id: 'tripod', label: 'Tripod', essential: true });
    items.push({ id: 'batteries', label: 'Spare camera batteries, warm in a pocket', essential: true });
    items.push({ id: 'cards', label: 'Empty memory cards', essential: false });
    items.push({ id: 'lens-cloth', label: 'Lens cloth (condensation)', essential: false });
  }
  if (c.driving) {
    items.push({ id: 'fuel', label: 'Fuel tank above half', why: c.driveMin != null && c.driveMin >= 45 ? `${c.driveMin} min drive each way` : undefined, essential: true });
    items.push({ id: 'plan', label: 'Told someone your plan', essential: true });
    items.push({ id: 'roads', label: 'Checked umferdin.is for closures', essential: true });
  }
  items.push({ id: 'blanket', label: 'Blanket or sleeping bag in the car', essential: false });
  return items;
}

/** Daily reset: checked items are kept per local date. */
export function checklistDay(d = new Date()): string {
  // a night's checklist belongs to the evening it started on (before noon → previous day)
  const t = new Date(d.getTime() - 12 * 3.6e6);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
