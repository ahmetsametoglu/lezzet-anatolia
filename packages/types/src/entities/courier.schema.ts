import { z } from 'zod';

// Kurye — teslim kanıtı kaydı. Gün kapanışı tipleri BURADAN TAŞINDI (18.08): kapanış kurye×gün
// ekseninden SEFER eksenine indi ve şeması artık `delivery-run.schema.ts`te yaşıyor
// (`DeliveryRunClose` + `DeliveryRunCollection` + iki RPC dönüşü). Bu dosyada kalan tek şey
// kanıt kaydı — o siparişin künyesidir (`order.delivery_proof`), seferin değil.

/**
 * **TESLİM KANITI — siparişe yazılan kayıt** (11.2 · `order.delivery_proof` jsonb).
 *
 * Şema burada, çünkü sözleşmenin İKİ UCU var: kurye kapısı yazıyor (`lib/courier/delivery.ts`),
 * operasyon ekranı okuyor (sipariş detayı). İkisi ayrı ayrı yazılmıştı ve **ayrışmıştı** —
 * yazan `kind/imageKey/receivedBy/courierId/at` koyuyordu, okuyan `signature/photos[]/note/by`
 * arıyordu. Ortak tek alan `at` idi: ekran kanıtı "var" gösteriyor ama neyin var olduğunu
 * söyleyemiyordu ve `imageKey` hiç okunmuyordu — yani **kanıt yazılıyor, hiç açılamıyordu.**
 * Kanıtın tek amacı "eksik geldi" ihtilafında açılmaktır.
 *
 * Hiçbir yerde hata vermiyordu: iki taraf da kendi içinde tutarlıydı. Tek çare şemayı tek kaynağa
 * bağlamak (`CLAUDE §1`) — artık yanlış alan adı DERLEME hatası.
 */
export const DeliveryProofRecordSchema = z.object({
  /**
   * İmza çizimi · kapı fotoğrafı · **kutu okutması** (23.8). İlk ikisi görsel taşır; `box_scan`
   * görselsizdir — kanıtın kendisi kapıda okutulan QR'lardır (etüt 2.5: *"B2C'de bugün hiç kanıt
   * istemeyen teslime bedava bir kanıt"*). Görselli kanıt varken kodlar ONUN içine yazılır;
   * `box_scan` yalnız görselsiz teslimde doğar.
   */
  kind: z.enum(['signature', 'photo', 'box_scan']),
  /** PRIVATE kovadaki anahtar (`delivery/proofs/{orderId}/…`). Public adresi YOKTUR.
      `null` yalnız `box_scan`da: o kanıtın görseli yoktur, kodları vardır. */
  imageKey: z.string().nullable(),
  /** Kapıda teslim alan kişi — B2B'de "kim imzaladı" ihtilafın cevabıdır. */
  receivedBy: z.string().nullable(),
  /** Kanıtı üreten kurye — sipariş sonradan başkasına atansa da kanıt kimin olduğunu söyler. */
  courierId: z.string().uuid(),
  at: z.string(),
  /** Kapıda okutulan kutu kodları (23.8) — kutusuz siparişte ve eski kayıtlarda yok. */
  boxCodes: z.array(z.string()).nullish(),
});
export type DeliveryProofRecord = z.infer<typeof DeliveryProofRecordSchema>;
