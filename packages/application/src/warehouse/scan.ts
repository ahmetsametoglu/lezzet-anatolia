import { VariantBarcodeService } from '@lezzet/database';
import type { BarcodeKind } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { variantNames } from './names';

/**
 * **TARAMA KAPISI** (Modül 23) — okutulan kodun çözümü + öğrenen eşleme.
 *
 * ── TEK SÖZLEŞME, DÖRT TÜKETİCİ ─────────────────────────────────────────────
 * Mal kabul, toplama, transfer ve tezgâh aynı kapıyı çağırır; ekran kaynağın ne olduğunu bilmez
 * (etüt 2.3). Zincirin kendisi serviste (`VariantBarcodeService.findByCode`: barkod → sku →
 * tedarikçi kodu); bu kapının eklediği şey ekran dili (ad + boy) ve öğrenmenin kuralı.
 *
 * ── KİMLİK BULUR, KARAR VERMEZ ──────────────────────────────────────────────
 * Dönen şey "bu hangi mal"dır — stok var mı, hangi depodan çıkar, satılır mı soruları mevcut
 * motorların işidir (CLAUDE §1 depo değişmezi). Bu kapıya stok okuması EKLENMEZ.
 *
 * ── ÖĞRENEN EŞLEME (karar §1.3) ─────────────────────────────────────────────
 * "Barkodsuz koli" yok, *henüz tanımadığımız* koli var: `unknown` dönen kod için ekran "bu kod
 * hangi ürün?" diye sorar ve cevap `learnCode` ile yazılır — ikinci gelişte tanınır. Kod zaten
 * BAŞKA varyanta bağlıysa ikinci bağ yazılmaz (`already_bound` — kural veride, cümle burada):
 * ekran kime bağlı olduğunu söyler, düzeltme web varyant editöründen (sil + yeniden öğret).
 */

export type ScanResolution =
  | {
      status: 'found';
      variantId: string;
      productName: string;
      variantLabel: string;
      kind: BarcodeKind;
      /** Bu kod okutulunca kaç adet sayılır — yalnız gerçek koli barkodu 1'den büyük taşır. */
      qtyPerCode: number;
      source: 'barcode' | 'sku' | 'supplier_code';
      /** Ürün kapağı (public URL) — okutma çekmecesinin görseli; kapaksız üründe null. */
      imageUrl: string | null;
    }
  | { status: 'unknown' };

export async function resolveScannedCode(db: SupabaseClient, input: { code: string }): Promise<ScanResolution> {
  const match = await new VariantBarcodeService(db).findByCode(input.code.trim());
  if (!match) return { status: 'unknown' };

  const names = await variantNames(db, [match.variantId]);
  const name = names.get(match.variantId);
  return {
    status: 'found',
    variantId: match.variantId,
    productName: name?.productName ?? '—',
    variantLabel: name?.variantLabel ?? '',
    kind: match.kind,
    qtyPerCode: match.qtyPerCode,
    source: match.source,
    imageUrl: name?.imageUrl ?? null,
  };
}

export type LearnCodeOutcome =
  | { status: 'ok' }
  | { status: 'already_bound'; variantId: string; productName: string; variantLabel: string };

/**
 * Tanınmayan kodu bir varyanta bağlar. `actorId` eşlemenin izidir (kim öğretti) — yanlış
 * öğretilmiş bir kodun sorumlusu değil, İZİ: düzeltme suçlama değil silme işlemidir.
 *
 * Aynı VARYANTA ikinci kez öğretme de `already_bound` döner (kod nereye bağlıysa onu söyler) —
 * iki depocunun aynı koliyi arka arkaya öğretmesi sessiz bir çift kayıt üretmemeli.
 */
export async function learnCode(
  db: SupabaseClient,
  input: { code: string; variantId: string; kind?: BarcodeKind; qtyPerCode?: number; actorId?: string | null },
): Promise<LearnCodeOutcome> {
  const service = new VariantBarcodeService(db);
  const code = input.code.trim();

  const existing = await service.getByCode(code);
  if (existing) {
    const names = await variantNames(db, [existing.variantId]);
    const name = names.get(existing.variantId);
    return {
      status: 'already_bound',
      variantId: existing.variantId,
      productName: name?.productName ?? '—',
      variantLabel: name?.variantLabel ?? '',
    };
  }

  await service.insert({
    code,
    variantId: input.variantId,
    kind: input.kind,
    qtyPerCode: input.qtyPerCode,
    createdBy: input.actorId ?? null,
  });
  return { status: 'ok' };
}
