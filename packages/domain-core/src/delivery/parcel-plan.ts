/**
 * Koli planı: sepetin kalemleri deponun kutularına geometrik olarak yerleştirilir, kaç kutu ve hangi
 * kutu olduğu buradan çıkar. Ölçüsü eksik kalem planı durdurur, çünkü uydurulmuş ölçü doğrudan tarifeye girer.
 */

/** Planlanacak kalem — ambalajlı ürün ölçüsü + adet. */
export interface ParcelItem {
  variantId: string;
  qty: number;
  /** Ambalajlı brüt ağırlık (g). `null` = tartılmadı. */
  packedWeightG: number | null;
  /** Ambalajlı dış ölçü (mm). Üçü birlikte var ya da üçü birlikte yok (kısıt veride). */
  packedLengthMm: number | null;
  packedWidthMm: number | null;
  packedHeightMm: number | null;
}

/** Deponun kutusu — plan yalnız AKTİF kutuları görmeli (çağıranın süzgeci). */
export interface ParcelBox {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  tareG: number;
  /** Kutunun taşıyabileceği azami içerik ağırlığı (g). `null` = sınır bilinmiyor → ağırlık tavanı uygulanmaz. */
  maxContentG: number | null;
}

/** Planlanmış tek kutu. */
export interface PlannedParcel {
  box: ParcelBox;
  /** Bu kutuya konan kalemler (adetleriyle). */
  contents: ReadonlyArray<{ variantId: string; qty: number }>;
  /** Taşıyıcıya bildirilecek ağırlık: içerik + kutunun darası. */
  weightG: number;
  /** İçeriğin kapladığı ham hacim (mm³). */
  contentVolumeMm3: number;
}

export type ParcelPlanFailure =
  /** Deponun aktif kutusu yok — kutu tanımlanmadan gönderi hazırlanamaz. */
  | { ok: false; reason: 'no_box'; unmeasured: readonly string[] }
  /** Bir ya da daha çok kalemin ölçüsü yok — TAHMİN EDİLMEZ, plan durur. */
  | { ok: false; reason: 'unmeasured'; unmeasured: readonly string[] }
  /** Tek bir paket hiçbir kutuya girmiyor: ölçüsü ya da ağırlığı her kutuyu aşıyor — operatör kararı gerekir. */
  | { ok: false; reason: 'too_large'; unmeasured: readonly string[]; variantId: string };

export type ParcelPlanResult = { ok: true; parcels: readonly PlannedParcel[]; unmeasured: readonly [] } | ParcelPlanFailure;

type Dims = readonly [number, number, number];

interface Unit {
  variantId: string;
  weightG: number;
  dims: Dims;
  volume: number;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
}

/** Kalem ölçülü mü — dördü de dolu olmalı (ölçüler zaten all-or-none, ağırlık ayrı sorulur). */
function measured(item: ParcelItem): boolean {
  return (
    item.packedWeightG !== null &&
    item.packedLengthMm !== null &&
    item.packedWidthMm !== null &&
    item.packedHeightMm !== null
  );
}

const boxVolume = (b: ParcelBox): number => b.lengthMm * b.widthMm * b.heightMm;

/** Kapaklı ambalaj her yöne yatabilir, bu yüzden altı yönün hepsi denenir. */
function orientations([a, b, c]: Dims): Dims[] {
  return [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];
}

const overlaps = (p: Placement, q: Placement): boolean =>
  p.x < q.x + q.l && q.x < p.x + p.l && p.y < q.y + q.w && q.y < p.y + p.w && p.z < q.z + q.h && q.z < p.z + p.h;

/**
 * Kalemleri kutuya yerleştirmeyi dener (extreme point, büyükten küçüğe, önce en alçak nokta).
 * Başarı bir yerleşimin kanıtıdır; başarısızlık "sığmaz" değil "yerleşim bulunamadı" demektir.
 */
function packsInto(units: readonly Unit[], box: ParcelBox): boolean {
  if (box.maxContentG !== null && units.reduce((sum, u) => sum + u.weightG, 0) > box.maxContentG) return false;
  if (units.reduce((sum, u) => sum + u.volume, 0) > boxVolume(box)) return false;

  const placed: Placement[] = [];
  let points: Array<readonly [number, number, number]> = [[0, 0, 0]];
  for (const unit of [...units].sort((a, b) => b.volume - a.volume)) {
    let spot: Placement | null = null;
    const ordered = [...points].sort((p, q) => p[2] - q[2] || p[1] - q[1] || p[0] - q[0]);
    search: for (const [x, y, z] of ordered) {
      for (const [l, w, h] of orientations(unit.dims)) {
        if (x + l > box.lengthMm || y + w > box.widthMm || z + h > box.heightMm) continue;
        const candidate = { x, y, z, l, w, h };
        if (placed.some((q) => overlaps(candidate, q))) continue;
        spot = candidate;
        break search;
      }
    }
    if (!spot) return false;
    placed.push(spot);
    const used = spot;
    points = points.filter(([x, y, z]) => !(x === used.x && y === used.y && z === used.z));
    points.push([used.x + used.l, used.y, used.z], [used.x, used.y + used.w, used.z], [used.x, used.y, used.z + used.h]);
  }
  return true;
}

/** Kalemlerin hepsini alan EN KÜÇÜK kutu; büyük kutu hacimsel ağırlığı ve tarifeyi yukarı çeker. */
function smallestBoxFor(units: readonly Unit[], boxesByVolume: readonly ParcelBox[]): ParcelBox | null {
  return boxesByVolume.find((box) => packsInto(units, box)) ?? null;
}

/**
 * Sepeti kutulara böler: her birim önce açık bir kutuya, gerekirse o kutuyu daha büyüğüyle değiştirerek konur;
 * ancak hiçbirine girmiyorsa yeni kutu açılır. Kutu büyütülmeden yeni kutu açmak, tek kutuya sığan sepeti iki koliye bölerdi.
 */
export function planParcels(items: readonly ParcelItem[], boxes: readonly ParcelBox[]): ParcelPlanResult {
  const unmeasured = items.filter((i) => i.qty > 0 && !measured(i)).map((i) => i.variantId);
  // Ölçüsüzlük kutu yokluğundan önce söylenir: iki eksikliği aynı anda söylemek ekranı okunmaz kılar.
  if (unmeasured.length > 0) return { ok: false, reason: 'unmeasured', unmeasured };

  const boxesByVolume = boxes.filter((b) => boxVolume(b) > 0).sort((a, b) => boxVolume(a) - boxVolume(b));
  if (boxesByVolume.length === 0) return { ok: false, reason: 'no_box', unmeasured: [] };

  // Her adet ayrı bir birimdir: aynı varyantın iki adedi iki ayrı kutuya düşebilir.
  const units: Unit[] = items
    .filter((i) => i.qty > 0)
    .flatMap((i) => {
      const dims: Dims = [i.packedLengthMm!, i.packedWidthMm!, i.packedHeightMm!];
      const unit: Unit = { variantId: i.variantId, weightG: i.packedWeightG!, dims, volume: dims[0] * dims[1] * dims[2] };
      return Array.from({ length: i.qty }, () => unit);
    })
    .sort((a, b) => b.volume - a.volume);

  const bins: Array<{ box: ParcelBox; units: Unit[] }> = [];
  for (const unit of units) {
    const target = bins.find((bin) => {
      const box = smallestBoxFor([...bin.units, unit], boxesByVolume);
      if (!box) return false;
      bin.box = box;
      bin.units.push(unit);
      return true;
    });
    if (target) continue;

    const box = smallestBoxFor([unit], boxesByVolume);
    if (!box) return { ok: false, reason: 'too_large', unmeasured: [], variantId: unit.variantId };
    bins.push({ box, units: [unit] });
  }

  return {
    ok: true,
    unmeasured: [],
    parcels: bins.map((bin) => {
      const contents = new Map<string, number>();
      for (const u of bin.units) contents.set(u.variantId, (contents.get(u.variantId) ?? 0) + 1);
      const contentG = bin.units.reduce((sum, u) => sum + u.weightG, 0);
      return {
        box: bin.box,
        contents: [...contents.entries()].map(([variantId, qty]) => ({ variantId, qty })),
        // Tavan içeriğe bakar, taşıyıcıya bildirilen ağırlık ise darayla birliktedir.
        weightG: contentG + bin.box.tareG,
        contentVolumeMm3: bin.units.reduce((sum, u) => sum + u.volume, 0),
      };
    }),
  };
}
