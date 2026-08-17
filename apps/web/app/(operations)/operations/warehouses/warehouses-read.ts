import { needsExpiryAttention, upcomingDeliveryDates } from '@lezzet/domain-core';
import type {
  OrderStatus,
  DeliveryZoneWithCodes,
  StorageArea,
  UserProfile,
  UserRole,
  Vehicle,
  Warehouse,
  WarehouseTransfer,
} from '@lezzet/types';
import { roleText } from '@/components/operation/ui/ops-nav';
import { totalRiskCents } from '@/lib/stock/batch-labels';
import type { BatchView } from '@/lib/stock/batch-types';
import {
  WarehouseAddressSchema,
  type ClosureConsequence,
  type MeasurePointView,
  type ScorecardView,
  type StaffChipView,
  type WarehouseAddressView,
  type WarehouseCardView,
  type WarehouseRowView,
  type ZoneCardView,
} from './warehouses-types';

// DB satırı → görünüm indirgemesi. Sayfa (RSC) okur, burası şekillendirir; **karar burada verilmez,
// sorulur** (`STACK §4`): parti kararı `domain-core`'un (`needsExpiryAttention`), risk tutarı
// partinin ortak sözlüğünün (`totalRiskCents`).
//
// Sayıların hepsi TEK okumadan türer: depoların hepsi için partiler bir kez çekilir ve burada
// gruplanır. Depo başına sorgu atmak (N+1) beş tesiste beş tur demekti — ve tesis sayısı fiziksel
// bir gerçek olduğu için kümenin tamamı zaten belleğe sığar.

/**
 * `warehouse.address` serbest `jsonb` — şekli **uygulama** belirler ve okurken DOĞRULANIR.
 *
 * Eski/bozuk bir kayıt geldiğinde `null` döner ve ekran adres yazmaz. Ham nesneyi olduğu gibi
 * basmak, bir gün ekranda `[object Object]` görmek demekti; alanları tek tek okumak ise
 * doğrulamayı her çağırana bırakırdı.
 */
function parseAddress(raw: Warehouse['address']): WarehouseAddressView {
  if (!raw) return null;
  const parsed = WarehouseAddressSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

interface WarehouseRowsInput {
  /** TÜM depolar — kapalılar dahil. Kapalı tesis listeden düşmez, geçmiş onu bilmek zorunda. */
  warehouses: readonly Warehouse[];
  zones: readonly DeliveryZoneWithCodes[];
  /** Operasyon rolü taşıyan profiller — kapsam eşlemesi burada yapılır. */
  staff: readonly UserProfile[];
  /** Eldeki TÜM partiler (aktif depolar); karar ve risk için `BatchView`. */
  batches: readonly BatchView[];
  /** Yoldaki sevkiyatlar — hem gelen hem giden; gruplama burada. */
  transfers: readonly WarehouseTransfer[];
}

export function toWarehouseRows({ warehouses, zones, staff, batches, transfers }: WarehouseRowsInput): WarehouseRowView[] {
  const zonesByWarehouse = groupBy(zones, (z) => z.warehouseId);
  const batchesByWarehouse = groupBy(batches, (b) => b.warehouseId);

  return warehouses.map((w) => {
    const own = zonesByWarehouse.get(w.id) ?? [];
    const ownBatches = batchesByWarehouse.get(w.id) ?? [];
    const activeZones = own.filter((z) => z.isActive);
    const staffHere = staff.filter((p) => p.warehouseIds.includes(w.id));

    return {
      id: w.id,
      code: w.code,
      name: w.name,
      countryCode: w.countryCode,
      address: parseAddress(w.address),
      shipsOnline: w.shipsOnline,
      isActive: w.isActive,
      sortOrder: w.sortOrder,
      zoneCount: own.length,
      activeZoneCount: activeZones.length,
      // Kod toplamı AKTİF bölgelerden: pasif bölgenin kodu bugün hiçbir siparişi buraya çözmez,
      // "12 posta kodu bağlı" demek onları da sayarsa sayı bir vaat olur ve vaat tutmaz.
      postalCodeCount: activeZones.reduce((sum, z) => sum + z.postalCodes.length, 0),
      staffCount: staffHere.length,
      variantCount: new Set(ownBatches.map((b) => b.variantId)).size,
      batchCount: ownBatches.length,
      attentionCount: ownBatches.filter((b) => needsExpiryAttention(b.decision)).length,
      inTransitIn: transfers.filter((t) => t.toWarehouseId === w.id).length,
      setupGap: setupGapOf({ isActive: w.isActive, shipsOnline: w.shipsOnline, activeZoneCount: activeZones.length, staffCount: staffHere.length }),
    };
  });
}

/**
 * Kurulum eksikliği — tesisin **açık ama ulaşılamaz** olduğu hâl.
 *
 * İki ayrı yoksunluk var ve ikisi aynı şey değil:
 * - **Sipariş girmiyor:** ne aktif bölgesi ne kargo çıkışı var → posta kodu buraya çözülmez, kargo
 *   yolu buradan geçmez. Tesis açık görünür ama hiçbir sipariş ona düşmez.
 * - **Mal işlenemiyor:** kapsamında bu depo olan personel yok → mal kabul ve hazırlık yapılamaz.
 *
 * İkisi bir arada olabilir ve cümle ikisini de söyler; hiçbiri yoksa `null` (kurulum tam). Kapalı
 * depoda hiç sorulmaz: kapalı tesisin "eksik kurulumu" bir arıza değil, kapalılığın kendisidir.
 */
function setupGapOf(input: { isActive: boolean; shipsOnline: boolean; activeZoneCount: number; staffCount: number }): string | null {
  if (!input.isActive) return null;
  const gaps: string[] = [];
  if (input.activeZoneCount === 0 && !input.shipsOnline) {
    gaps.push('ne bağlı bölgesi ne kargo çıkışı var — hiçbir sipariş buraya çözülmez');
  }
  if (input.staffCount === 0) {
    gaps.push('kapsamlı personeli yok — mal kabul ve hazırlık yapılamaz');
  }
  return gaps.length === 0 ? null : `Açık ama ulaşılamaz tesis: ${gaps.join('; ')}.`;
}

/** Deponun bölge kartları — ad sırasına göre; pasif olanlar da listede kalır (tanım silinmez). */
// `readLastMeasured` BURADA DEĞİL, `page.tsx`te (19.28 · ölçüldü 17.08).
//
// Bu dosya bir SUNUCU dosyası gibi duruyor ama değil: `closureConsequences` istemci penceresinden
// de çağrılıyor (`close-warehouse-dialog.tsx`), yani modül istemci paketine giriyor. İçine
// `@lezzet/database` importu konunca supabase-js de onunla gitti ve derleme `node:crypto` ile
// kırıldı — iki sayfa birden 500 döndü. Bu dosya SAF kalır: DB okuması yapan her şey sayfada.

/**
 * İki tablo → TEK liste. Sıra alanlar sonra araçlar, her biri kendi `sortOrder`ında — depocunun
 * turu mekânsaldır (önce depo, sonra araç), alfabetik değil.
 */
export function toMeasurePoints(input: {
  areas: readonly StorageArea[];
  vehicles: readonly Vehicle[];
  lastByPoint: ReadonlyMap<string, string>;
}): MeasurePointView[] {
  return [
    ...input.areas.map((area) => ({
      id: area.id,
      kind: 'area' as const,
      name: area.name,
      label: null,
      areaKind: area.kind,
      targetMinC: area.targetMinC,
      targetMaxC: area.targetMaxC,
      isActive: area.isActive,
      lastRecordedAt: input.lastByPoint.get(`area:${area.id}`) ?? null,
    })),
    ...input.vehicles.map((vehicle) => ({
      id: vehicle.id,
      kind: 'vehicle' as const,
      name: vehicle.plate,
      label: vehicle.label,
      areaKind: null,
      // Aracın beklenen aralığı bugün veride YOK ve uydurulmuyor: soğutuculu araçla sıradan araç
      // aynı tabloda, ayrım tutulmuyor. Sapma araçta alışkanlıktan ölçülür.
      targetMinC: null,
      targetMaxC: null,
      isActive: vehicle.isActive,
      lastRecordedAt: input.lastByPoint.get(`vehicle:${vehicle.id}`) ?? null,
    })),
  ];
}

export function toZoneCards(
  zones: readonly DeliveryZoneWithCodes[],
  warehouseId: string,
  stats: {
    /** Kod → sipariş/ciro (`analytics_postal_code_orders`). Kodda kayıt yoksa gerçekten sıfırdır. */
    orders: ReadonlyMap<string, { orderCount: number; revenueCents: number }>;
    /** Kod → haber bekleyen kişi (`zone_notice`). */
    waiting: ReadonlyMap<string, number>;
    now: Date;
  },
): ZoneCardView[] {
  return zones
    .filter((z) => z.warehouseId === warehouseId)
    .map((z) => {
      /**
       * Bölgenin ağırlığı = kodlarının TOPLAMI. Anahtar yalnız posta kodu (ülke yok), çünkü RPC de
       * öyle eşliyor — `67000` hem FR hem DE'de geçerli olduğu için iki ülkenin siparişi birleşir.
       * Bugün tek ülkeli rotalarda görünmez; sınır deposu büyürse ayrışması gerekir (Rotalar
       * ekranının aynı künyesi, `routes-read`).
       */
      const totals = z.postalCodes.reduce(
        (sum, code) => {
          const row = stats.orders.get(code.postalCode);
          return {
            orderCount: sum.orderCount + (row?.orderCount ?? 0),
            revenueCents: sum.revenueCents + (row?.revenueCents ?? 0),
            waitingCount: sum.waitingCount + (stats.waiting.get(code.postalCode) ?? 0),
          };
        },
        { orderCount: 0, revenueCents: 0, waitingCount: 0 },
      );

      return {
        id: z.id,
        name: z.name,
        isActive: z.isActive,
        weekdays: z.weekdays,
        // Kod listesi kendi içinde sıralı: operatör "67100 var mı" diye tarayacak, sıralı liste taranır.
        postalCodes: [...z.postalCodes].sort((a, b) => a.postalCode.localeCompare(b.postalCode)),
        ...totals,
        /**
         * Sıradaki gün MOTORDAN türer (`upcomingDeliveryDates`), burada yeniden hesaplanmaz —
         * müşteriye söylenen günle operatörün gördüğü gün aynı kuraldan çıkmalı.
         *
         * **Kesim saati verilmiyor ve bu bilinçli:** kesim müşterinin SİPARİŞ penceresidir ("bugüne
         * yetişir mi"), buradaki soru ise "araç ne zaman çıkıyor". Kesim geçince aracın günü
         * değişmez. Pasif bölge `null` — tanımı durur ama dağıtıma çıkmaz.
         */
        nextDeliveryDate: z.isActive
          ? (upcomingDeliveryDates({ weekdays: z.weekdays, now: stats.now, count: 1 })[0] ?? null)
          : null,
      };
    })
    // Aktif bölgeler önce: pasif bir tanım hâlâ görünmeli ama bugünün gerçeği değil.
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'tr'));
}

/**
 * Bu depoyu kapsamında taşıyan personel — **okunur**.
 *
 * `onlyHere` kapatma kararının girdisi: kapsamı yalnız bu depo olan depocu/kurye, tesis kapanınca
 * kapsamsız kalır ve kapsamsız depocu kapalı kapıdır (kural veritabanında). Yöneticide bu hiç
 * sorulmaz — admin depo-ÜSTÜdür ve kapsamı zaten boştur.
 */
export function toStaffChips(staff: readonly UserProfile[], warehouseId: string): StaffChipView[] {
  return staff
    .filter((p) => p.warehouseIds.includes(warehouseId))
    .map((p) => ({
      id: p.id,
      name: p.name,
      roleText: roleText(p.roles.filter((r): r is UserRole => r !== 'customer')),
      onlyHere: p.warehouseIds.length === 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

interface ScorecardInput {
  batches: readonly BatchView[];
  belowMinCount: number;
  /**
   * Bu depoya yolda olan sevkiyat. **Artık karnede ÇİZİLMİYOR** (17.08) — kutu tek depolu bir
   * kurulumda tanımı gereği daima sıfırdı. Sayı yine de okunuyor, çünkü asıl tüketicisi ekran
   * değil KAPATMA uyarısı: yoldaki mal hiçbir deponun stoğunda değil, hedefi kapanırsa kabul
   * edilecek yer bulamaz (`closeBlockers`).
   */
  inTransitIn: number;
  openOrderCount: number;
}

/** Karne — deponun bugünkü hâli. Her sayı Stok'a giden bir kapıdır; satırların kendisi orada yaşar. */
export function toScorecard({ batches, belowMinCount, inTransitIn, openOrderCount }: ScorecardInput): ScorecardView {
  const attention = batches.filter((b) => needsExpiryAttention(b.decision));
  return {
    variantCount: new Set(batches.map((b) => b.variantId)).size,
    batchCount: batches.length,
    // "Yaklaşan tarihli" ile "süresi geçmiş" AYRI sayılır: ilkinin bir kararı var (teklif/transfer),
    // ikincisinin tek yolu imha. Tek sayıda toplamak, karar verilebilir malı umutsuz göstermek olurdu.
    nearExpiryCount: attention.filter((b) => b.decision !== 'must_discard').length,
    expiredCount: attention.filter((b) => b.decision === 'must_discard').length,
    // Risk TUTARI karar bekleyen partilerin toplamı — fiyatı bilinmeyen varsa alt sınırdır, `null`
    // ise hiçbirinin fiyatı yok demektir ve ekran sayı yerine eksikliği söyler.
    riskCents: totalRiskCents(attention),
    belowMinCount,
    inTransitIn,
    openOrderCount,
    // En son mal GİRİŞİ (partinin doğuşu). "Son hareket" demiyoruz: çıkışlar ayrı bir defterdedir
    // ve onu da okumadan "hareket" demek ölçmediğimiz bir şeyi iddia etmek olurdu.
    lastIntakeAt: batches.reduce<string | null>((latest, b) => (latest === null || b.createdAt > latest ? b.createdAt : latest), null),
  };
}

/**
 * Sipariş sayaçlarından **açık iş** — bu depodan çıkacak, henüz teslim edilmemiş sipariş.
 *
 * Kapanmış dallar (teslim · tamamlandı · iptal · iade) ve taslak düşer: onlar bir iş değil, biri
 * geçmiş öteki yarım kalmış bir checkout. Küme `OrderStatus`'e karşı doğrulanıyor (`satisfies`) —
 * yeni bir durum eklenip buraya yazılmazsa derleyici susar ama yanlış adlı bir durum yazılamaz.
 */
const CLOSED_ORDER_STATUSES = ['draft', 'delivered', 'completed', 'cancelled', 'returned'] as const satisfies ReadonlyArray<OrderStatus>;

export function openOrderCountOf(byStatus: ReadonlyMap<OrderStatus, number>): number {
  let total = 0;
  for (const [status, count] of byStatus) {
    if (!(CLOSED_ORDER_STATUSES as readonly string[]).includes(status)) total += count;
  }
  return total;
}

/**
 * Kapatmanın sonuçları — **dört ayrı ağırlık**, tek bir "emin misiniz?" cümlesine sıkışmaz.
 *
 * Yalnız GERÇEKTEN var olan sonuçlar üretilir: stoğu boş bir depoyu kapatırken "malınız görünmez
 * olacak" demek, uyarıyı gürültüye çevirir ve sonraki gerçek uyarıyı da okutmaz.
 */
export function closureConsequences(card: WarehouseCardView): ClosureConsequence[] {
  const out: ClosureConsequence[] = [];
  const { row, zones, staff, scorecard } = card;

  if (scorecard.batchCount > 0) {
    out.push({
      weight: 'hardest',
      title: 'Stoğu var — mal görünmez olur',
      body: `${scorecard.variantCount} varyantta ${scorecard.batchCount} parti kayıtta durur ama satış okumalarının hiçbirinde görünmez. Bu bir arıza değil tanımdır: kapalı tesisten satış yapılmaz. Önce transferle taşımak isterseniz kapatmayı bekletin.`,
    });
  }

  const activeZones = zones.filter((z) => z.isActive);
  if (activeZones.length > 0) {
    const codes = activeZones.reduce((sum, z) => sum + z.postalCodes.length, 0);
    out.push({
      weight: 'heavy',
      title: 'Bağlı bölgesi var — adresler sahipsiz kalır',
      body: `${activeZones.map((z) => z.name).join(' · ')} (${codes} posta kodu) bu depoya bağlı. Bölge başka bir depoya bağlanana kadar bu adreslerin siparişi çözülmez — hizmet alanı bölümünden devredin.`,
    });
  }

  const stranded = staff.filter((p) => p.onlyHere);
  if (stranded.length > 0) {
    out.push({
      weight: 'heavy',
      title: 'Tek kapsamı burası olan personel var',
      body: `${stranded.map((p) => p.name).join(' · ')} kapsamsız kalır — depocu ve kurye kapsamsız olamaz, kişi kapalı kapı hâline düşer. Ayarlar'daki kişi kartından yeni kapsam verin.`,
    });
  }

  if (scorecard.inTransitIn > 0) {
    out.push({
      weight: 'pending',
      title: 'Yolda ona gelen sevkiyat var',
      body: `${scorecard.inTransitIn} sevkiyat kabul edilecek yer bulamaz — yoldaki mal hiçbir deponun stoğunda değildir. Önce kabul edin ya da ters yönde sevk açın.`,
    });
  }

  if (row.shipsOnline) {
    out.push({
      weight: 'hardest',
      title: 'Ülkenin kargo çıkış deposu bu',
      body: `Kapanınca ${row.code} rolü boşalır ve o ülkede bölge dışı müşteriye satış yapılamaz: sipariş deposu çözülemediği için hiç açılmaz. Önce rolü başka bir depoya verin.`,
    });
  }

  return out;
}

/** Küçük yardımcı — küme başına tek gezinti; `Map` sırası girdinin sırasıdır. */
function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  return out;
}
