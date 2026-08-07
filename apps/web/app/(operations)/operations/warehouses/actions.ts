'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { WarehouseService, serviceDb } from '@lezzet/database';
import { requireAdmin } from '@/lib/guard';
import { constraintMessage } from '@/lib/constraint-message';
import type { ActionResult } from '@/lib/error';
import { WAREHOUSES_PATH } from './warehouses-url';
import { WarehouseFormSchema } from './warehouses-types';

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
