'use server';

import { revalidatePath } from 'next/cache';
import { ProductService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText, type LocalizedText, type ProductDetailsUpdate, type ProductVariantEntry } from '@lezzet/types';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { PRODUCTS_PATH } from '../../products-paths';

// Ürün sekmesi server action'ları (referans deseni: 'use server' + requireStaff + servise devret +
// {data,error} DÖNER, throw etmez + revalidatePath). Form alanları ProductDetailsUpdate'ten türer
// (no-duplication). Çok dilli çeviri önerisi uygulama geneli paylaşılır (`lib/ai/translate`).

// Formun gönderdiği tam girdi: düzenlenebilir ürün alanları (şemadan türer) + varyant satırları.
type ProductFormInput = ProductDetailsUpdate & { variants: ProductVariantEntry[] };

function requireName(name: LocalizedText | undefined): LocalizedText {
  if (!name || !resolveLocalizedText(name)) throw new Error('Ürün adı gerekli.');
  return name;
}

// GÜNCELLEME EYLEMİ BURADAN TAŞINDI (22.14) → `lib/catalog/product-actions`. Sebebi: aynı ürün
// formu artık asistan kuyruğunun içinde de açılıyor ve oradan da kaydediliyor. İki yüzeyin ortak
// eylemi sayfa klasöründe duramaz (`CLAUDE §2`) — kuyruk bir sayfa klasöründen import etseydi
// bağımlılık yatay olurdu. Oluşturma eylemi burada KALDI: yeni ürün yalnız bu ekranda doğuyor.
//
// GÖRSEL EYLEMLERİ de aynı yolu izledi (11.08) → `lib/catalog/product-photo-actions`: kapak yükleme
// ve galeri (listele/ekle/sil/sırala/kapak yap/kırp). Kullanıcı kuyruğun formunda görsel bloğunun
// KIRPILMASINI istemedi — *"o formu bire bir kopyala"* — ve blok canlı yazdığı için eylemleri de
// yanında taşınmak zorundaydı.

/** Yeni ürün oluşturur (varyantlar verilirse onlarla, yoksa varsayılan varyant). Slug addan türetilir. */
export async function createProductAction(input: ProductFormInput): Promise<ActionResult> {
  try {
    await requireStaff();
    const { variants, ...fields } = input;
    const name = requireName(fields.name);
    await new ProductService(serviceDb()).create({
      ...fields,
      name,
      variants: variants.map((v) => ({
        label: v.label,
        netWeightG: v.netWeightG,
        piecesCount: v.piecesCount,
        minStockQty: v.minStockQty,
        sku: v.sku,
        isActive: v.isActive,
      })),
    });
    revalidatePath(PRODUCTS_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
