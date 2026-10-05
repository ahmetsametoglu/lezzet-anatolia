'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  DeliveryZonePostalCodeService,
  DeliveryZoneService,
  PostalCodePlaceService,
  SettingsService,
  WarehouseService,
  serviceDb,
  type PostalCodeSuggestion,
} from '@lezzet/database';
import { DAY_HOURS, toMinutes } from '@/lib/settings/day-hours';
import { requireAdmin } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { readPostalCodesForMap } from '@/lib/delivery/map-codes';
import { constraintMessage } from '@/lib/constraint-message';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { ZoneFormSchema, type PostalCodePick } from './routes-types';

// Rota kurulumunun yazma yolları; rota kaydı deponun nesnesidir (depo → rota → kodlar), şema bu yüzden `warehouses-types`ten
// gelir. Posta kodunun tekilliği veritabanı kısıtıdır, bu dosya ihlali okunur bir cümleye çevirir.

/** İnsan diline çevrilmiş kısıt ihlali. Adı bilinmeyen hata olduğu gibi geçer. */
const CONSTRAINT_MESSAGE: Record<string, string> = {
  delivery_zone_postal_code_pkey:
    'Eklemek istediğiniz posta kodlarından biri bu işin başka bir rotasında tanımlı. Bir kod her işte yalnız tek rotada olabilir.',
};

const readable = (error: unknown): string => constraintMessage(error, CONSTRAINT_MESSAGE);

/**
 * Bölge ekle ya da düzenle: ad, teslim günleri ve kod kümesi tek yazımda, kod kümesi sil-yaz ile değişir. Çakışma önce okunur,
 * çünkü kısıt yalnız "kod zaten var" der, operatöre gereken cümle kodu hangi bölgenin tuttuğudur.
 */
export async function saveZoneAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const staff = await requireAdmin();
    const parsed = ZoneFormSchema.extend({
      id: z.string().uuid().optional(),
      warehouseId: z.string().uuid(),
      /** Asistan önerisinden gelindiyse önerinin kimliği; yoksa akış değişmez. */
      proposalId: z.string().uuid().optional(),
    }).parse(input);
    const { id, warehouseId, postalCodes, proposalId, hours, ...fields } = parsed;

    const db = serviceDb();
    const zoneSvc = new DeliveryZoneService(db);

    const conflict = await findConflict(db, postalCodes, id ?? null, warehouseId);
    if (conflict) return { data: null, error: conflict };

    /**
     * **Saatler ÖNCE elenir, sonra yazılır.** Kayıttan sonra reddetmek, rotası kaydedilmiş ama
     * saatleri yazılmamış yarım bir sonuç bırakırdı — operatör "kaydedildi" görmezdi ama rota
     * değişmiş olurdu. Elemenin kendisi DB'ye dokunmuyor (biçim + anahtar), o yüzden ucuz.
     */
    const hoursError = checkZoneHours(hours ?? {});
    if (hoursError) return { data: null, error: hoursError };

    /**
     * Kayıt ile kuyruk satırı birlikte koşar (`withProposal`), aynı öneri iki kez uygulanmasın diye. Kaydedilen küme operatörün
     * kümesidir, bildirim de yalnız kaydedilen kodlara gider.
     */
    const zone = await withProposal(
      proposalId,
      staff.profileId,
      async () => {
        const saved = id
          ? await zoneSvc.update({ id, warehouseId, ...fields })
          : await zoneSvc.insert({ warehouseId, ...fields });
        await zoneSvc.replacePostalCodes(saved.id, postalCodes);
        return saved;
      },
      (saved) => ({ zoneId: saved.id, postalCodeCount: String(postalCodes.length) }),
    );

    // Saatler kayıttan SONRA: yeni rotanın kimliği ancak burada var ve ayar satırı o kimliğe bağlanır.
    await writeZoneHours(db, zone.id, hours ?? {}, staff.profileId);

    revalidatePath('/operations/deliveries');
    // Ayarlar ekranı aynı satırları "istisna" olarak listeliyor — rota rayından yazılan saat orada da
    // görünmeli, yoksa iki ekran aynı veri için farklı şey söylerdi.
    revalidatePath('/operations/settings');
    revalidatePath('/operations/assistant');
    return { data: { id: zone.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Kodlardan biri aynı işin başka bir bölgesinde mi, cevabı tutan bölge ve depoyla birlikte; öteki işin aynı kodu tutan bölgesi
 * çakışma değildir, çünkü iki iş aynı mahalleye ayrı seferle gider.
 */
async function findConflict(
  db: ReturnType<typeof serviceDb>,
  codes: readonly PostalCodePick[],
  currentZoneId: string | null,
  /** Bölgenin kaydedileceği depo; işi buradan okunur. */
  warehouseId: string,
): Promise<string | null> {
  if (codes.length === 0) return null;

  const [rows, target] = await Promise.all([
    new DeliveryZonePostalCodeService(db).listByCodes(codes.map((c) => c.postalCode)),
    new WarehouseService(db).getById(warehouseId),
  ]);
  const mine = new Set(codes.map((c) => `${c.country}:${c.postalCode}`));
  const taken = rows.filter(
    (r) => r.business === target?.business && r.zoneId !== currentZoneId && mine.has(`${r.country}:${r.postalCode}`),
  );
  if (taken.length === 0) return null;

  const zoneSvc = new DeliveryZoneService(db);
  const zone = await zoneSvc.getById(taken[0]!.zoneId);
  const warehouse = zone ? await new WarehouseService(db).getById(zone.warehouseId) : null;
  const list = taken.map((r) => r.postalCode).join(', ');
  const holder = zone ? `“${zone.name}”${warehouse ? ` bölgesi (${warehouse.code})` : ' bölgesi'}` : 'başka bir bölge';
  return `${list} kodu ${holder} tarafından tutuluyor. Bir kod her işte yalnız tek bölgede olabilir — taşımak için önce o bölgeden çıkarın.`;
}

/**
 * Eşik saatlerinin anahtarı ve biçimi DB'ye dokunmadan elenir: anahtar kümesi `DAY_HOURS`tan, biçim ekranla aynı `toMinutes`ten
 * doğrulanır, serbest anahtar `settings`i okunmayan satırlarla doldururdu. Sorun varsa okunur cümle, yoksa `null`.
 */
function checkZoneHours(hours: Record<string, string | null>): string | null {
  for (const [key, time] of Object.entries(hours)) {
    const hour = DAY_HOURS.find((candidate) => candidate.key === key);
    if (!hour) return `Tanınmayan eşik saati: ${key}.`;
    if (time !== null && toMinutes(time) === null) {
      return `${hour.label} için geçersiz saat: “${time}”. Saat SS:DD biçiminde olmalı.`;
    }
  }
  return null;
}

/**
 * Rotaya özel eşik saatlerini yazar; `null` gelen eşiğin istisnasını kaldırır. Silmede önbellek elle düşürülür, çünkü `delete()`
 * kendi kopyasını düşürmez ve kaldırılan istisna süre dolana dek okunurdu.
 */
async function writeZoneHours(
  db: ReturnType<typeof serviceDb>,
  zoneId: string,
  hours: Record<string, string | null>,
  actorId: string,
): Promise<void> {
  const svc = new SettingsService(db);

  for (const [key, time] of Object.entries(hours)) {
    const hour = DAY_HOURS.find((candidate) => candidate.key === key);
    // `checkZoneHours` bunu zaten eledi; burada yalnız tipi daraltıyor.
    if (!hour) continue;

    if (time === null) {
      const own = (await svc.listByKey(key)).find((row) => row.scopeType === 'zone' && row.scopeId === zoneId);
      if (!own) continue;
      await svc.delete(own.id);
      SettingsService.invalidate(key);
      continue;
    }

    await svc.set(key, time, { scopeType: 'zone', scopeId: zoneId, description: hour.label, actorId });
  }
}

/**
 * Posta kodu önerisi, bölge kurulumunun giriş aracı: seçenekler referans tablosundan gelir, haritada olmayan kod sisteme giremez.
 * Öneri bir okumadır ve `recordDemand` sayacını kirletmez.
 */
export async function searchPostalCodesAction(term: string): Promise<ActionResult<PostalCodeSuggestion[]>> {
  try {
    await requireAdmin();
    // Terim ham geçer, çünkü kapı kodu mu adı mı aradığına terimin kendisinden karar verir ve normalleştirmek yolu kod dalına
    // kilitlerdi. Operatör bölgeyi kurarken kodun hangi işte olursa olsun bir rotada olup olmadığını görür.
    const rows = await new PostalCodePlaceService(serviceDb()).search(term, 12, null);
    return { data: rows, error: null };
  } catch (error) {
    // Çıplak funnel, `readable` değil: bu uç salt okuma yapar ve çarpabileceği bir kısıt yok.
    return { data: null, error: getErrorMessage(error) };
  }
}

/**
 * Görüş alanındaki posta kodları; haritanın hiçbir rotada olmayan kodları çizebilmesinin yolu, kaydırmaya bağlı olduğu için ayrı
 * eylem. Kutu zorunlu ve tavanlıdır, ekran `truncated`i yazar ki kesilen kod "yok" diye okunmasın.
 */
const BboxSchema = z.object({
  minLat: z.number(),
  maxLat: z.number(),
  minLng: z.number(),
  maxLng: z.number(),
});

/** Dönüş tipi kapıdan türetilir; `MapPostalCodes` dışa açık değil ve kopya şekil kapı değişince sessizce ayrışırdı. */
type MapCodesResult = Awaited<ReturnType<typeof readPostalCodesForMap>>;

export async function readMapCodesAction(input: unknown): Promise<ActionResult<MapCodesResult>> {
  try {
    await requireAdmin();
    const bbox = BboxSchema.parse(input);
    return { data: await readPostalCodesForMap({ bbox }), error: null };
  } catch (error) {
    // Salt OKUMA — çarpabileceği bir kısıt yok, `readable` bağlanmıyor (aynı gerekçe `searchPostalCodesAction`'da).
    return { data: null, error: getErrorMessage(error) };
  }
}
