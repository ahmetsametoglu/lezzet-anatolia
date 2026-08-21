import { createHash } from 'node:crypto';

import type { CartEntry } from './cart-types';

/*
  ── NEDEN AYRI DOSYA: `node:crypto` TARAYICIYA DÜŞÜYORDU (denetim, 21.08) ─────────────────────
  Bu fonksiyon `cart-types.ts`in içinde doğdu ve orası **iki yüzeyin ortak, izomorfik modülü**:
  web'in İSTEMCİ bileşenleri (`cart-context.tsx` → `lib/cart/cart-types.ts`) ve native sepet
  ekranı aynı dosyadan okuyor. Tek bir `import { createHash } from 'node:crypto'` satırı bütün o
  zinciri Node'a bağladı.

  ÖLÇÜLDÜ: `pnpm prod:web` webpack hatasıyla kesildi — *"Module not found: node:crypto"*, izi
  `cart/cart-types.ts → lib/cart/cart-types.ts → components/customer/cart/cart-context.tsx`.
  Tarayıcıda `node:crypto` yoktur; hata derleme zamanında çıktığı için sessiz de değildi, ama
  YAZAN tarafta görünmüyordu (native ve sunucu tarafı sorunsuz derleniyor).

  Mantık DEĞİŞMEDİ, yalnız evi değişti. Fonksiyonun kendi künyesi aşağıda olduğu gibi duruyor.
  Kural: bir modülü istemci okuyorsa, o modül node-only hiçbir şey **import edemez** — `@lezzet/
  address-fr`in "yalnız `zod`a bağlı, node-only hiçbir şey yok" künyesiyle aynı disiplin.
*/

/**
 * **SEPETİN İÇERİK PARMAK İZİ** — "müşteriye gösterdiğim sepet hâlâ bu mu?" sorusunun cevabı
 * (kullanıcı kararı 21.08).
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * Sepet SUNUCUDA yaşıyor ve iki yüzeyde PAYLAŞILIYOR (`cart-store` künyesi): aynı hesabın webdeki
 * sepetiyle telefondaki sepeti aynı sepettir. Yani checkout ekranı açıkken sepetin altından
 * değişmesi bir istisna değil, tasarımın doğal sonucudur. Ölçüldü (21.08, cihazda): ekran
 * `8× Peynirli Adana Böreği` + `2× Gâteau artisan citron` listelerken genel toplam **16,00 €**
 * yazıyordu — çünkü börek o sırada sunucudaki sepetten çıkmıştı. Liste bayat, toplam taze.
 *
 * Asıl tehlike ekranda değil ONAY anındadır: taslak siparişi HER ZAMAN sunucudaki sepetten açar
 * (`checkout.ts` → `CartService.get`), yani müşteri gördüğü listeyi onaylayıp başka bir sipariş
 * alabilirdi. Bu, `price_changed`ın kapattığı boşluğun kardeşi ve künyesindeki cümle burada da
 * geçerli: *"hiçbir şey patlamaz, müşteri yalnız beklemediği bir tutar öder"* — üstelik burada
 * değişen tutar değil MALIN KENDİSİ.
 *
 * ── NEDEN `updated_at` DEĞİL ────────────────────────────────────────────────
 * `cart.updated_at` kolonu var ama ona güvenilmez: seed onu SABİT bir tarihle yazıyor (ölçüldü:
 * üç hesabın sepeti birden `2025-08-06`). Zaman damgası hem yanlış alarm verir (içerik aynıyken
 * satır yeniden yazılmıştır) hem gerçek değişimi kaçırır (damga güncellenmemiştir). İçerik özeti
 * yalnız gerçekten değişince değişir.
 *
 * Sıra ÖNEMSİZLEŞTİRİLİR (`sort`): aynı sepetin satırları farklı sırada saklanabilir ve sıra
 * müşteri için bir fark değildir — sırayı imzaya katmak, hiçbir şey değişmeden "değişti" derdi.
 * FİYAT imzaya GİRMEZ: onun kendi kapısı var (`price_changed`) ve ikisini birleştirmek, zam
 * uyarısını "sepetiniz değişti" gibi okuturdu.
 */
export function cartFingerprint(entries: readonly CartEntry[]): string {
  const parts = entries
    .map((e) => (e.kind === 'bundle' ? `b:${e.bundleId}:${e.qty}` : `v:${e.variantId}:${e.stockId ?? '-'}:${e.qty}`))
    .sort();
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}
