'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { StorageAreaService, TemperatureLogService, VehicleService, WarehouseService, serviceDb } from '@lezzet/database';
import { requireAdmin } from '@/lib/guard';
import { constraintMessage } from '@/lib/constraint-message';
import type { ActionResult } from '@/lib/error';
import { isUnusualReading } from './measure-read';
import type { TemperatureDeviation } from './measure-rules';
import { WAREHOUSES_PATH } from './warehouses-url';
import { StorageAreaFormSchema, VehicleFormSchema, WarehouseFormSchema } from './warehouses-types';

// Depolar ekranının yazma kapıları (19.5).
//
// **Hepsi `requireAdmin`.** Depo bir kurulum nesnesidir: kodu belgelere basılır, kapatılması stoğu
// görünmez kılar, bölgesi siparişin hangi şehre gideceğini belirler. Depocu kendi deposunu bile
// düzenleyemez — göreceği ekran Stok'tur.
//
// **Kurallar VERİDE, cümleler burada.** Ülke başına tek kargo deposu ve posta kodunun tekilliği
// veritabanı kısıtlarıdır; bu dosya onları yeniden uygulamaz, ihlali OKUNUR bir cümleye çevirir
// (`constraintOf`). Kuralı iki yerde yazmak, bir gün ayrışan iki kural demektir.

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
    const { id, address, ...fields } = parsed;

    const svc = new WarehouseService(serviceDb());
    if (id) {
      const row = await svc.update({ id, ...fields, address });
      revalidatePath(WAREHOUSES_PATH);
      return { data: { id: row.id, code: row.code }, error: null };
    }

    // Yeni tesis listenin SONUNA girer. Sıra operatörün kararıdır ve yeni bir depoyu araya sokmak
    // ona ait; kod ya da ada göre otomatik yerleştirmek o kararı elinden alırdı.
    const existing = await svc.list();
    const row = await svc.insert({
      ...fields,
      address,
      sortOrder: existing.reduce((max, w) => Math.max(max, w.sortOrder), 0) + 1,
    });
    revalidatePath(WAREHOUSES_PATH);
    return { data: { id: row.id, code: row.code }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Kapatma / yeniden açma — **silme YOKTUR** ve bu kapı da silmez.
 *
 * `confirmCode` kasıt kapısıdır: kapatmanın sonucu stoğa, bölgelere ve personele aynı anda dokunur.
 * Ekran onu zaten soruyor, ama kapı da soruyor — istemciye güvenerek yazılan bir yıkıcı eylem,
 * yanlış çağrıldığında hiçbir yerde durdurulmaz. Yeniden açmada sorulmaz: kapıyı AÇMAK bir sonuç
 * doğurmaz, tesisi yeniden görünür kılar.
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
 * Operatör sırası — listedeki sürükleme. Sıra TÜM depo seçicilerinde aynıdır (bağlam seçicisi,
 * tablo süzgeci, transfer hedefi), o yüzden tek yerden yazılır.
 *
 * Satır satır yazılıyor: `WarehouseService`'te `reorder()` yok — kategori/koleksiyon/paket
 * servislerinde duran tek satırlık desen (`reorderBy`) bu servise henüz gelmedi ve `reorderBy`
 * korumalı. Tesis sayısı fiziksel bir gerçek (bir avuç satır), yani bugün ölçülebilir bir bedeli
 * yok; yine de arka uç şeridinden istendi (`operasyon-ekranlari-arka-uc-talebi.md §5`).
 */
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

// ── Hizmet alanı (bölge + posta kodları) ────────────────────────────────────

// Rota (bölge) kurulumunun eylemleri BURADAN TAŞINDI (07.08) →
// `deliveries/routes-actions.ts`. Gerekçe: kurulum yüzeyi Teslimat & Rota'ya geçti; eylem
// ekranıyla aynı klasörde yaşar (CLAUDE §2 kolokasyon). Bölge KAYDI hâlâ deponun nesnesidir.

// ── Ölçüm noktaları (19.28) ─────────────────────────────────────────────────
//
// **Depo istemciden GELMEZ, seçili tesisten gelir.** Nokta bir tesisin künyesidir; kimliği forma
// bırakmak, bir deponun dolabını ötekinin künyesine yazmanın en sessiz yolu olurdu (sıcaklık
// yazma kapısının aynı kuralı).
//
// **Silme YOK, susturma var.** Kayıtlı bir nokta veritabanında zaten silinemiyor (`restrict`) ve
// silinebilseydi denetim geçmişi sahipsiz kalırdı. Kullanımdan kalkan nokta `isActive = false`
// olur: kayıtları yerinde durur, seçim listesinde çıkmaz.

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
 * **Ölçüm kaydı** — `/operations/temperature`ten buraya taşındı (`22.29` kapanışı, kullanıcı kararı
 * 17.08): *"web'de yazma olsun, burada admin girsin; depocu zaten mobil uygulama üzerinden girecek."*
 *
 * ── KAPI DEĞİŞTİ VE BU BİLİNÇLİ ─────────────────────────────────────────────
 * Eski kapı `requireWarehouseScope` + `readWorkWarehouse` idi: yazan kişi DEPOCUydu ve hangi depoda
 * çalıştığı bağlamdan geliyordu. Buradaki yazan YÖNETİCİ ve depoyu bağlamdan değil SEÇTİĞİ KARTTAN
 * belirtiyor — Depolar sayfasının tamamı `requireAdmin`. Sahadaki kayıt native uygulamanın işi ve
 * **zamanı gelince yapılacak** (kullanıcı kararı 17.08, `BEKLEYEN(19.30)`); o uç gelene kadar
 * depocunun ölçüm yazacak yolu yok, web'deki bu kapı da yalnız yöneticinin.
 *
 * ── GEÇMİŞE YAZILMIYOR (kullanıcı kararı 17.08) ─────────────────────────────
 * `recordedAt` girdide YOK ve olmayacak: `now()` yazılıyor. Hijyen defterine sonradan kayıt
 * düşmek defteri denetimde değersiz kılar — **boş bir gün dürüsttür, sonradan doldurulmuş bir gün
 * değildir.** Takvimde geçmiş günler bu yüzden salt okunur.
 *
 * ── UYARIR, ENGELLEMEZ ──────────────────────────────────────────────────────
 * Aralık dışı değer YAZILIR, sonra uyarılır (`DOMAIN §4` — karar sahadaki insanın). Reddetseydik
 * dondurucu bozulduğunda kayıt hiç yazılmazdı.
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
