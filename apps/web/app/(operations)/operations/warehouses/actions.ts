'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  constraintOf,
  DeliveryZonePostalCodeService,
  DeliveryZoneService,
  PostalCodePlaceService,
  WarehouseService,
  serviceDb,
  type PostalCodeSuggestion,
} from '@lezzet/database';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { WAREHOUSES_PATH } from './warehouses-url';
import { WarehouseFormSchema, ZoneFormSchema, type PostalCodePick } from './warehouses-types';

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
  delivery_zone_postal_code_pkey: 'Eklemek istediğiniz posta kodlarından biri başka bir bölgede tanımlı. Bir kod yalnız tek bölgede olabilir.',
};

function readable(error: unknown): string {
  const name = constraintOf(error);
  return (name && CONSTRAINT_MESSAGE[name]) || getErrorMessage(error);
}

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

/**
 * Bölge ekle / düzenle — ad, teslim günleri ve kod kümesi TEK yazımda.
 *
 * Kod kümesi sil-yaz ile değişir (servis sözleşmesi): ekran kümenin son hâlini gönderir, "hangileri
 * eklendi hangileri silindi" hesabını iki tarafın da tutması gerekmez.
 *
 * **Çakışma önce OKUNUR, sonra yazılır** — ama kural yine de veritabanındadır. Buradaki ön okuma
 * kuralı uygulamak için değil, ihlali ANLATABİLMEK için: kısıt "kod zaten var" der, operatörün
 * ihtiyacı olan cümle ise "67100'ü Kuzey hattı tutuyor (COL)". Ön okuma ile yazma arasında başka
 * biri aynı kodu alırsa kısıt yine tutar; kaybedilen tek şey cümlenin ayrıntısı olur.
 */
export async function saveZoneAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const parsed = ZoneFormSchema.extend({
      id: z.string().uuid().optional(),
      warehouseId: z.string().uuid(),
    }).parse(input);
    const { id, warehouseId, postalCodes, ...fields } = parsed;

    const db = serviceDb();
    const zoneSvc = new DeliveryZoneService(db);

    const conflict = await findConflict(db, postalCodes, id ?? null);
    if (conflict) return { data: null, error: conflict };

    const zone = id
      ? await zoneSvc.update({ id, warehouseId, ...fields })
      : await zoneSvc.insert({ warehouseId, ...fields });

    await zoneSvc.replacePostalCodes(zone.id, postalCodes);
    revalidatePath(WAREHOUSES_PATH);
    return { data: { id: zone.id }, error: null };
  } catch (error) {
    return { data: null, error: readable(error) };
  }
}

/**
 * Kodlardan biri BAŞKA bir bölgede mi — cevabı hangi bölgenin ve hangi deponun tuttuğuyla birlikte.
 *
 * Sessiz "ilki kazanır" YOKTUR: çok depoda bunun bedeli siparişin yanlış şehre düşmesidir.
 */
async function findConflict(
  db: ReturnType<typeof serviceDb>,
  codes: readonly PostalCodePick[],
  currentZoneId: string | null,
): Promise<string | null> {
  if (codes.length === 0) return null;

  const rows = await new DeliveryZonePostalCodeService(db).listByCodes(codes.map((c) => c.postalCode));
  const mine = new Set(codes.map((c) => `${c.country}:${c.postalCode}`));
  const taken = rows.filter((r) => r.zoneId !== currentZoneId && mine.has(`${r.country}:${r.postalCode}`));
  if (taken.length === 0) return null;

  const zoneSvc = new DeliveryZoneService(db);
  const zone = await zoneSvc.getById(taken[0]!.zoneId);
  const warehouse = zone ? await new WarehouseService(db).getById(zone.warehouseId) : null;
  const list = taken.map((r) => r.postalCode).join(', ');
  const holder = zone ? `“${zone.name}”${warehouse ? ` bölgesi (${warehouse.code})` : ' bölgesi'}` : 'başka bir bölge';
  return `${list} kodu ${holder} tarafından tutuluyor. Bir kod yalnız tek bölgede olabilir — taşımak için önce o bölgeden çıkarın.`;
}

/**
 * Posta kodu önerisi — bölge kurulumunun giriş aracı.
 *
 * **Serbest metin girişi YOK:** seçenekler referans tablosundan gelir, yani haritada (ve veride)
 * olmayan bir kod sisteme hiç giremez. Yazım hatası sınıfı böyle kapanır. Öneri bir OKUMA'dır ve
 * `recordDemand` sayacını KİRLETMEZ — o sayaç niyete bağlıdır (19.7'nin kayıtlı kararı).
 */
export async function searchPostalCodesAction(term: string): Promise<ActionResult<PostalCodeSuggestion[]>> {
  try {
    await requireAdmin();
    const rows = await new PostalCodePlaceService(serviceDb()).searchPrefix(term, 12);
    return { data: rows, error: null };
  } catch (error) {
    // `readable` DEĞİL, çıplak funnel — ve bu bilinçli (denetim S2): bu uç salt OKUMA yapıyor
    // (önek araması), yani çarpabileceği bir kısıt yok. `readable` kısıt adını insan cümlesine
    // çeviriyor; hiç kısıt üretmeyen bir yola onu bağlamak, olmayan bir hâli varmış gibi göstermek
    // olurdu. Buraya bir gün yazma eklenirse `readable`'a bağlanmalı.
    return { data: null, error: getErrorMessage(error) };
  }
}
