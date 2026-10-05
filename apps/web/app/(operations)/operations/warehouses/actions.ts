'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { StorageAreaService, TemperatureLogService, VehicleService, WarehousePrinterService, WarehouseService, serviceDb, ShippingBoxService } from '@lezzet/database';
import { geocoder } from '@lezzet/application';
import { logger } from '@lezzet/observability';
import type { Country } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { constraintMessage } from '@/lib/constraint-message';
import type { ActionResult } from '@/lib/error';
import { isUnusualReading } from './measure-read';
import type { TemperatureDeviation } from './measure-rules';
import { WAREHOUSES_PATH } from './warehouses-url';
import { ShippingBoxFormSchema } from './warehouses-types';
import { StorageAreaFormSchema, VehicleFormSchema, WarehouseFormSchema, WarehousePrinterFormSchema } from './warehouses-types';

// Depolar ekranının yazma kapıları; hepsi `requireAdmin`, çünkü depo bir kurulum nesnesidir ve kodu, kapatılması, bölgesi siparişi
// etkiler. Ülke başına tek kargo deposu gibi kurallar veritabanı kısıtıdır, bu dosya ihlali okunur bir cümleye çevirir.

/** İnsan diline çevrilmiş kısıt ihlalleri. Ad → cümle; adı bilinmeyen hata olduğu gibi geçer. */
const CONSTRAINT_MESSAGE: Record<string, string> = {
  warehouse_single_online: 'Bu ülkede kargo çıkış deposu rolünü zaten başka bir depo taşıyor — ülke başına en fazla bir tane olabilir. Önce o depodan kaldırın.',
  warehouse_code_key: 'Bu kod başka bir depoda kullanılıyor. Kod belge önekidir; iki tesis aynı öneki taşıyamaz.',
  storage_area_name_uq: 'Bu tesiste aynı adda bir alan zaten var — iki "Dolap 1", hangi dolabın ölçüldüğü sorusunu cevapsız bırakır.',
  vehicle_plate_key: 'Bu plaka başka bir araçta kayıtlı. İki kayıt aynı aracı gösterirse soğuk zincir geçmişi ikiye bölünür.',
  temperature_log_area_fk: 'Bu alanın sıcaklık kayıtları var — silinemez. Kullanımdan kaldırmak için pasife alın.',
  temperature_log_vehicle_fk: 'Bu aracın sıcaklık kayıtları var — silinemez. Kullanımdan kaldırmak için pasife alın.',
};

const readable = (error: unknown): string => constraintMessage(error, CONSTRAINT_MESSAGE);

// ── Künye ───────────────────────────────────────────────────────────────────

/**
 * Depo ekle / künyeyi düzenle.
 *
 * `sortOrder` yalnız YENİ depoda verilir (listenin sonuna): sıra listeden sürüklenerek yönetiliyor
 * ve formun onu da yazması, iki kapıdan yönetilen bir alan demekti.
 */
export async function saveWarehouseAction(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    await requireAdmin();
    const parsed = WarehouseFormSchema.extend({ id: z.string().uuid().optional() }).parse(input);
    const { id, address, lat: latText, lng: lngText, ...fields } = parsed;

    const svc = new WarehouseService(serviceDb());
    const point = await resolveWarehousePoint({ latText, lngText, address, country: fields.countryCode });

    if (id) {
      const row = await svc.update({ id, ...fields, address, ...point });
      revalidatePath(WAREHOUSES_PATH);
      return { data: { id: row.id, code: row.code }, error: null };
    }

    // Yeni tesis listenin SONUNA girer. Sıra operatörün kararıdır ve yeni bir depoyu araya sokmak
    // ona ait; kod ya da ada göre otomatik yerleştirmek o kararı elinden alırdı.
    const existing = await svc.list();
    const row = await svc.insert({
      ...fields,
      address,
      ...point,
      sortOrder: existing.reduce((max, w) => Math.max(max, w.sortOrder), 0) + 1,
    });
    revalidatePath(WAREHOUSES_PATH);
    return { data: { id: row.id, code: row.code }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Deponun noktası, rotanın çıpası: operatörün yazdığı değer kazanır, boşsa adresten çözülür, çünkü yanlış çıpa her rotayı bozar.
 * Çözülemezse nokta `null` kalır ve depo yine kaydedilir; koordinat yüzünden tesis açılamaması koordinatsız tesisten pahalıdır.
 */
async function resolveWarehousePoint(input: {
  latText: string;
  lngText: string;
  address: { line1: string; postalCode: string; city: string };
  /** Tesisin ülkesi — depo sınır ötesi OLAMAZ (`0031` künyesi), yani adresin ülkesiyle aynıdır. */
  country: Country;
}): Promise<{ lat: number | null; lng: number | null }> {
  const lat = Number(input.latText);
  const lng = Number(input.lngText);
  if (input.latText && input.lngText && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  // Yarım girdi (yalnız enlem) bir nokta DEĞİLDİR ve kolon kısıtı da onu reddeder; adresten çözmeye
  // düşülüyor — operatörün yarım bıraktığı bir alan yüzünden nokta hiç yazılmasın diye.
  if (input.latText || input.lngText) {
    logger.warn({ flow: 'warehouse_geo' }, 'yarım koordinat girildi — adresten çözülüyor');
  }

  const outcome = await geocoder().locate({
    line1: input.address.line1,
    postalCode: input.address.postalCode,
    city: input.address.city,
    country: input.country,
  });

  return outcome.status === 'ok' ? { lat: outcome.point.lat, lng: outcome.point.lng } : { lat: null, lng: null };
}

/**
 * Kapatma ya da yeniden açma; silme yoktur. `confirmCode` kasıt kapısıdır, çünkü kapatma stoğa, bölgelere ve personele aynı anda
 * dokunur ve istemciye güvenerek yazılan yıkıcı eylem yanlış çağrıldığında durdurulmazdı.
 */
export async function setWarehouseActiveAction(input: { id: string; isActive: boolean; confirmCode?: string }): Promise<ActionResult> {
  try {
    await requireAdmin();
    const svc = new WarehouseService(serviceDb());
    const row = await svc.getById(input.id);
    if (!row) return { data: null, error: 'Depo bulunamadı.' };

    if (!input.isActive && input.confirmCode?.trim().toLocaleUpperCase('tr') !== row.code) {
      return { data: null, error: 'Kapatmayı onaylamak için deponun kodunu yazın.' };
    }
    // Kargo çıkış rolü kapanan depoda BIRAKILMAZ: kısmi unique indeks yalnız aktif satırlara
    // baktığı için kayıt geçerdi, ama o ülkede "kargo deposu var" diye okunan bir satır kalırdı.
    await svc.update(input.isActive ? { id: row.id, isActive: true } : { id: row.id, isActive: false, shipsOnline: false });
    revalidatePath(WAREHOUSES_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Yazıcı envanteri: bir depoda birden çok yazıcı ve iki etiket türü olabildiği için ayar değil liste. Ekran envanteri yönetir,
 * hangi yazıcının kullanılacağı cihazın yerel seçimidir.
 */
export async function addWarehousePrinterAction(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = WarehousePrinterFormSchema.parse(input);
    await new WarehousePrinterService(serviceDb()).insert({
      warehouseId: parsed.warehouseId,
      name: parsed.name,
      purpose: parsed.purpose,
      address: parsed.address,
      model: parsed.model,
      labelSize: parsed.labelSize,
    });
    revalidatePath(WAREHOUSES_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Yazıcıyı aç/kapat — **silme YOK ve bu bilinçli**: cihazların seçimi kimliğe bağlı ve silinen bir
 * satır o seçimleri sessizce "yazıcı yok"a düşürürdü. Kapatma bunu SÖYLER (liste satırı durur,
 * seçiciden düşer).
 */
export async function setWarehousePrinterActiveAction(input: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(input);
    await new WarehousePrinterService(serviceDb()).update({ id: parsed.id, isActive: parsed.isActive });
    revalidatePath(WAREHOUSES_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/** Operatör sırası, listedeki sürükleme; sıra bütün depo seçicilerinde aynıdır, bu yüzden tek yerden yazılır. */
export async function reorderWarehousesAction(ids: string[]): Promise<ActionResult> {
  try {
    await requireAdmin();
    const svc = new WarehouseService(serviceDb());
    // Sıra 1'den başlar ve boşluksuz yazılır: aradaki bir depo silinemediği için boşluk oluşmaz,
    // ama eski kayıtlarda eşit `sortOrder` bulunabilir ve o eşitlik seçicide rastgele sıra demekti.
    await Promise.all(ids.map((id, i) => svc.update({ id, sortOrder: i + 1 })));
    revalidatePath(WAREHOUSES_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

// ── Ölçüm noktaları ─────────────────────────────────────────────────────────
// Depo istemciden gelmez, seçili tesisten gelir: kimliği forma bırakmak bir deponun dolabını ötekine yazmanın en sessiz yolu
// olurdu. Silme yok, nokta `isActive = false` olur ve kayıtları yerinde durur.

/** Hedef aralık metinden sayıya — boş dize `null`, çünkü "beklenti yok" ile "sıfır derece" ayrı. */
function parseTargetC(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) throw new Error('Hedef sıcaklık bir sayı olmalı.');
  return value;
}

export async function saveStorageAreaAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const parsed = StorageAreaFormSchema.extend({
      id: z.string().uuid().optional(),
      warehouseId: z.string().uuid(),
    }).parse(input);

    const targetMinC = parseTargetC(parsed.targetMinC);
    const targetMaxC = parseTargetC(parsed.targetMaxC);
    // Kısıt veritabanında da var (`storage_area_target_pair`); buradaki kapı onu OKUNUR hâle
    // getiriyor — operatör "check ihlali" değil ne yapması gerektiğini görsün.
    if ((targetMinC === null) !== (targetMaxC === null)) {
      throw new Error('Hedef aralığı ya iki uçlu verin ya hiç: tek uçlu aralık "altı mı üstü mü serbest" sorusunu cevapsız bırakır.');
    }
    if (targetMinC !== null && targetMaxC !== null && targetMinC > targetMaxC) {
      throw new Error('Alt sınır üst sınırdan büyük olamaz.');
    }

    const svc = new StorageAreaService(serviceDb());
    const fields = {
      name: parsed.name.trim(),
      kind: parsed.kind,
      targetMinC,
      targetMaxC,
      expectedDailyChecks: parsed.expectedDailyChecks,
    };
    const row = parsed.id
      ? await svc.update({ id: parsed.id, ...fields })
      : await svc.insert({ warehouseId: parsed.warehouseId, ...fields });

    revalidatePath(WAREHOUSES_PATH);
    return { data: { id: row.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

export async function saveVehicleAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const parsed = VehicleFormSchema.extend({
      id: z.string().uuid().optional(),
      warehouseId: z.string().uuid(),
    }).parse(input);

    const svc = new VehicleService(serviceDb());
    // Plaka BÜYÜK harfe çekiliyor: `67 abc` ile `67 ABC` aynı araçtır ve benzersizlik kısıtı
    // ikisini iki araç sayardı — soğuk zincir geçmişini ikiye bölen tam da bu.
    const fields = {
      plate: parsed.plate.trim().toLocaleUpperCase('tr'),
      label: parsed.label.trim() || null,
      expectedDailyChecks: parsed.expectedDailyChecks,
    };
    const row = parsed.id
      ? await svc.update({ id: parsed.id, ...fields })
      : await svc.insert({ warehouseId: parsed.warehouseId, ...fields });

    revalidatePath(WAREHOUSES_PATH);
    return { data: { id: row.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/** Noktayı sustur / geri aç — silme değil, çünkü kayıtları duruyor. */
export async function setPointActiveAction(input: {
  kind: 'area' | 'vehicle';
  id: string;
  isActive: boolean;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const db = serviceDb();
    if (input.kind === 'area') await new StorageAreaService(db).update({ id: input.id, isActive: input.isActive });
    else await new VehicleService(db).update({ id: input.id, isActive: input.isActive });

    revalidatePath(WAREHOUSES_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

// ── Sıcaklık ölçümü ─────────────────────────────────────────────────────────

/**
 * Ölçüm kaydı: yazan yöneticidir ve depoyu seçtiği karttan belirtir; sahadaki kayıt native uygulamanın işidir (`BEKLEYEN(19.30)`).
 * `recordedAt` girdide yok, çünkü sonradan doldurulan gün hijyen defterini değersiz kılar; aralık dışı değer yazılır, sonra uyarılır.
 */
export async function recordTemperatureAction(input: {
  warehouseId: string;
  kind: 'area' | 'vehicle';
  pointId: string;
  temperatureC: number;
}): Promise<ActionResult<{ name: string; deviation: TemperatureDeviation | null; usualC: number | null }>> {
  try {
    const user = await requireAdmin();

    if (!input.pointId) throw new Error('Ölçüm noktası seçin.');
    if (!Number.isFinite(input.temperatureC)) throw new Error('Derece girin.');
    if (input.temperatureC < SANE_MIN_C || input.temperatureC > SANE_MAX_C) {
      throw new Error(`${SANE_MIN_C}° ile ${SANE_MAX_C}° arasında bir derece girin — bu değer bir ölçüm değil, yazım hatası.`);
    }

    const db = serviceDb();
    /**
     * **Nokta bu tesise ait mi — SUNUCUDA doğrulanıyor.** İstemciden gelen bir uuid başka tesisin
     * dolabını gösterebilir ve veritabanı bunu reddetmez (`temperature_log.warehouse_id` ile
     * noktanın deposu arasında kısıt yok) — yani kontrol buradaysa vardır, yoksa hiç yoktur.
     */
    const point =
      input.kind === 'area'
        ? await new StorageAreaService(db).getById(input.pointId)
        : await new VehicleService(db).getById(input.pointId);
    if (!point || (point.warehouseId !== null && point.warehouseId !== input.warehouseId)) {
      throw new Error('Bu ölçüm noktası bu tesise tanımlı değil — hiçbir kayıt yazılmadı.');
    }
    const name = 'plate' in point ? (point.label ? `${point.plate} · ${point.label}` : point.plate) : point.name;

    await new TemperatureLogService(db).insert({
      warehouseId: input.warehouseId,
      ...(input.kind === 'area' ? { storageAreaId: input.pointId } : { vehicleId: input.pointId }),
      temperatureC: input.temperatureC,
      recordedBy: user.profileId,
    });

    // Sapma kararı okuma tarafıyla AYNI fonksiyondan (`measure-rules.deviationOf`): ikisi ayrı
    // hesaplasaydı kayıtta "normal" denip takvimde kırmızı görünen bir gün çıkardı. Kayıttan SONRA
    // soruluyor — yeni ölçüm de o noktanın geçmişinin parçası.
    const verdict = await isUnusualReading({
      db,
      warehouseId: input.warehouseId,
      kind: input.kind,
      pointId: input.pointId,
      temperatureC: input.temperatureC,
    });

    revalidatePath(WAREHOUSES_PATH);
    // `null` (ölçüt yok) ile "normal" AYRI: ekran ikisini aynı cümleye katlamıyor.
    return { data: { name, deviation: verdict?.deviation ?? null, usualC: verdict?.usualC ?? null }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Fiziksel akıl sınırı — sapma ölçütünden AYRI iş yapıyor: sapma uyarır, bu REDDEDER. Aralık dışı
 * bir ölçüm gerçek olabilir (dondurucu bozulmuştur); −185° olamaz, o bir parmak kaymasıdır
 * (`-18,5` yazılırken virgül düşmüş).
 */
const SANE_MIN_C = -60;
const SANE_MAX_C = 60;

// ── Kargo kutusu ─────────────────────────────────────────────────────────────
// Kutu tipi depoya aittir: her action deponun kimliğini ayrıca alır ve `order_box`taki bileşik FK başka deponun kutusunun
// seçilmesini reddeder.

/** Yeni kutu ya da düzenleme. `id` varsa güncelle, yoksa deponun listesine ekle. */
export async function saveShippingBoxAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const { warehouseId, id } = z.object({ warehouseId: z.string().uuid(), id: z.string().uuid().optional() }).parse(input);
    const parsed = ShippingBoxFormSchema.parse(input);
    const svc = new ShippingBoxService(serviceDb());
    const row = id ? await svc.update({ id, ...parsed }) : await svc.insert({ warehouseId, ...parsed });
    revalidatePath(WAREHOUSES_PATH);
    return { data: { id: row.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/** Şablonu benimse: bağlama değil kopyalama, çünkü kopya deponun malıdır ve şablon sonradan değişse kopya değişmez. */
export async function adoptShippingBoxAction(input: { warehouseId: string; templateId: string }): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const { warehouseId, templateId } = z.object({ warehouseId: z.string().uuid(), templateId: z.string().uuid() }).parse(input);
    const row = await new ShippingBoxService(serviceDb()).adopt(warehouseId, templateId);
    revalidatePath(WAREHOUSES_PATH);
    return { data: { id: row.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/** Kutuyu kapat/aç — kapalı kutu listede kalır ama seçicide görünmez. */
export async function setShippingBoxActiveAction(input: { id: string; isActive: boolean }): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(input);
    await new ShippingBoxService(serviceDb()).setActive(parsed.id, parsed.isActive);
    revalidatePath(WAREHOUSES_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Kutuyu SİL — yalnız hiç kullanılmamışsa geçer. Kullanılmışsa servis okunabilir cümleye çeviriyor
 * ("gerçekleşmiş bir gönderinin ölçüsü silinemez"), ham FK hatası ekrana düşmüyor.
 */
export async function deleteShippingBoxAction(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new ShippingBoxService(serviceDb()).deleteBox(z.string().uuid().parse(id));
    revalidatePath(WAREHOUSES_PATH);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}
