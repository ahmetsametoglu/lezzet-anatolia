'use server';

import { revalidatePath } from 'next/cache';
import { BundleService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { bundleBalance } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import { getR2, r2Keys } from '@lezzet/storage';
import {
  resolveLocalizedText,
  type BundleDetailsUpdate,
  type BundleItemEntry,
  type LocalizedText,
} from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRODUCTS_PATH } from '../../products-paths';
import { toVariantOptions } from '../../products-read';
import type { VariantOption } from '../../products-types';

// Paket sekmesi server action'ları — 'use server' + requireStaff + servise devret + {data,error} DÖNER
// (throw yok) + revalidatePath. Alanlar `BundleDetailsUpdate`'ten türer (no-duplication).

/** Formun gönderdiği tam girdi: düzenlenebilir paket alanları + kalem satırları. */
type BundleFormInput = BundleDetailsUpdate & { items: BundleItemEntry[] };

function requireName(name: LocalizedText | undefined): LocalizedText {
  if (!name || !resolveLocalizedText(name)) throw new Error('Paket adı gerekli.');
  return name;
}

/** Paket fiyatı yeni kayıtta ZORUNLU: müşterinin gördüğü tek sayı, varsayılanı olamaz. */
function requireTotal(totalPrice: number | undefined): number {
  if (totalPrice == null) throw new Error('Paket fiyatı gerekli.');
  return totalPrice;
}

/**
 * Mutabakat KAPISI — kaydetmenin ön koşulu (DOMAIN §13: "sistem toplamı doğrular").
 *
 * Kararı motor verir (`domain-core/bundleBalance`), uygulama katmanı yalnız uygular: tutmuyorsa kayıt
 * TAMAMLANMAZ ve hata operatörün diliyle, farkı söyleyerek döner. Kuruşta hesaplanır — 0,1 + 0,2 ≠ 0,3
 * kayan nokta tuzağı fiyat toplamında sessiz bir kuruş farkı doğururdu.
 *
 * Kalemsiz paket de burada takılır: 0 ≠ paket fiyatı. Ayrı bir "kalem gerekli" kuralı yazmıyoruz —
 * aynı kapı ikisini birden tutuyor.
 */
function requireBalanced(items: BundleItemEntry[], totalPrice: number | undefined): void {
  const target = toCents(totalPrice ?? 0);
  const balance = bundleBalance(
    items.map((i) => ({ qty: i.qty, allocatedUnitPriceCents: toCents(i.allocatedUnitPrice) })),
    target,
  );
  if (balance.balanced) return;

  if (items.length === 0) throw new Error('Pakete en az bir kalem eklenmeli.');
  const fark = fromCents(Math.abs(balance.diffCents)).toFixed(2).replace('.', ',');
  const yon = balance.diffCents > 0 ? 'fazla' : 'eksik';
  throw new Error(
    `Kalem fiyatları toplamı paket fiyatını tutmuyor: ${fark} € ${yon}. ` +
      'Kalem fiyatlarını düzeltin ya da "Farkı dağıt" ile eşitleyin.',
  );
}

/**
 * Paket seçicisinin havuz tavanı. Katalog bunu aşarsa seçici aramalı bir sunucu okumasına dönüşür;
 * o gün gelene kadar tek sorgu yeterli.
 */
const VARIANT_POOL_LIMIT = 500;

interface BundleFormData {
  /** Düzenlenen paketin kalemleri (yeni pakette boş) — sıralı. */
  items: BundleItemEntry[];
  /** Seçicinin ve hesabın havuzu: ad · görsel · birim fiyat · maliyet · KDV · hedef marj. */
  pool: VariantOption[];
}

/**
 * Diyalog açılışının TEK okuması: bu paketin kalemleri + varyant havuzu (fiyat ve maliyetle).
 *
 * Bu veri sayfa açılışında ÇEKİLMEZ. Liste satırının ihtiyacı özet sayılar (`bundle_list_rows()`) ve
 * onları katalogun tamamını taşıyarak hesaplamak yanlıştı: Ürünler sekmesine bakan operatör hiç
 * açmayacağı bir formun havuzunu ödüyordu. Havuz ancak form açılınca, bir kez okunur.
 */
export async function loadBundleFormAction(bundleId: string | null): Promise<ActionResult<BundleFormData>> {
  try {
    await requireStaff();
    const db = serviceDb();
    const [items, poolRows] = await Promise.all([
      bundleId ? new BundleService(db).listItems(bundleId) : Promise.resolve([]),
      new ProductService(db).listPool(VARIANT_POOL_LIMIT),
    ]);

    // Fiyat ve maliyet havuz kimliklerini bekler; ikisi de TEK turda (varyant başına sorgu yok).
    const variantIds = poolRows.flatMap((p) => p.variants.map((v) => v.id));
    const [priceRows, unitCosts] = await Promise.all([
      new PriceService(db).findApplicableMap(variantIds, 'b2c'),
      new StockService(db).unitCostMap(variantIds),
    ]);
    const listPrices = new Map(
      [...priceRows].flatMap(([id, { channelPrice }]) => (channelPrice ? [[id, channelPrice.amount] as const] : [])),
    );

    return {
      data: {
        items: [...items]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((i) => ({ id: i.id, variantId: i.variantId, qty: i.qty, allocatedUnitPrice: i.allocatedUnitPrice })),
        pool: toVariantOptions(poolRows, listPrices, unitCosts),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Yeni paket. Slug addan türer; kalemler aynı turda yazılır. */
export async function createBundleAction(input: BundleFormInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireStaff();
    const { items, ...fields } = input;
    const name = requireName(fields.name);
    const totalPrice = requireTotal(fields.totalPrice);
    requireBalanced(items, totalPrice);
    const { bundle } = await new BundleService(serviceDb()).create({ ...fields, name, totalPrice, items });
    revalidatePath(PRODUCTS_PATH);
    return { data: { id: bundle.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Mevcut paketi günceller ve kalemleri senkronlar. Slug SABİT (paylaşılan link korunur). */
export async function updateBundleAction(id: string, input: BundleFormInput): Promise<ActionResult> {
  try {
    await requireStaff();
    const { items, ...fields } = input;
    requireName(fields.name);
    requireBalanced(items, fields.totalPrice);
    const svc = new BundleService(serviceDb());
    await svc.updateDetails(id, fields);
    await svc.syncItems(id, items);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Satışa aç/kapa — listedeki hızlı anahtar. */
export async function setBundleActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireStaff();
    await new BundleService(serviceDb()).setActive(id, isActive);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Kürasyon sırası (sürükle-bırak) — müşterinin gördüğü paket sırası. */
export async function reorderBundlesAction(orderedIds: string[]): Promise<ActionResult> {
  try {
    await requireStaff();
    await new BundleService(serviceDb()).reorder(orderedIds);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

// SİLME action'ı YOK — bilinçli. Paketten vazgeçmenin yolu "Pasif": sipariş görmüş paket zaten DB'de
// korunuyor (`restrict`) ve geçmiş siparişler onu adıyla göstermeye devam ediyor. Tasarımın liste
// satırında da silme düğmesi yok. Gerçekten gerekirse onay akışıyla birlikte gelir.

/** Paket görselini R2'ye yükler ve anahtarı yazar (3:2 kaynak, `role="package"`). */
export async function uploadBundleImageAction(id: string, form: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Görsel dosyası bulunamadı.');
    const r2 = getR2();
    if (!r2) throw new Error('Depolama (R2) ayarlı değil.');

    const svc = new BundleService(serviceDb());
    const bundle = await svc.getById(id);
    if (!bundle) throw new Error('Paket bulunamadı.');

    const key = r2Keys.bundleImage(bundle.slug, file.name);
    await r2.uploadFile(key, Buffer.from(await file.arrayBuffer()), file.type || 'image/jpeg');
    await svc.setImageKey(id, key);
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
