import { z } from 'zod';

/**
 * **KURYE DÖNÜŞÜ — SAY VE DEVRET · KUTU İNİŞİ** (v3:14 `kuryeDonus` · kurye denetimi bulgu 5, 03.09).
 *
 * ── KİMİN EKRANI, KİMİN İŞİ ──────────────────────────────────────────────────
 * Bu sözleşme DEPOCUNUN "Kurye dönüşü" ekranının (D6) eksik iki bölümünü taşır. Kurye kapanışta
 * yalnız PARAYI sayar; malın sayımı rampada malı fiilen teslim alan depocunundur — tasarım da
 * bölümleri onun ekranına çiziyor. Sahada kuryeye ek bir adım yok (kullanıcı şartı 03.09).
 *
 * ── ÜÇ SORU, ÜÇ LİSTE ────────────────────────────────────────────────────────
 * · `freeGoods` — SERBEST ÜRÜN: araca sipariş dışı alınan mal. Beklenen = araç deposunda duran adet
 *   (`readVanStock`); depocu döneni sayar, satır beklenenle DOLU açılır (para satırlarının deseni:
 *   normal günde fark sıfırdır, tek dokunuş). Kabulde dönen adet araca→depoya TRANSFER olur.
 * · `boxesDown` — DEPOYA İNEN kutular: REDDEDİLEN (`returned`) siparişin araçta damgalı kutuları.
 *   Kabulde damga silinir (kutu artık araçta değil).
 * · `boxesStay` — ARAÇTA KALAN: ulaşılamayan durağın kutusu ("yeniden planlanacak — kabul edilmez")
 *   ve araçta bekleyen/sürülen başka seferlerin kutuları. Yalnız GÖSTERİLİR; damga durur.
 *
 * ── FARK NEREYE YAZILIR ──────────────────────────────────────────────────────
 * Dönen < beklenen ise fark araç deposunda KALIR (fiziksel olarak orada olmayan mal): sayım (D4)
 * ya da düşüm (D4b, sebepli) onu kapatır — bu kapı akıbet KARARI vermez, tıpkı reddedilen malın
 * akıbetini kuryenin değil depocunun seçmesi gibi (DOMAIN §8). Fark cevapta `shortfalls` olarak
 * döner ve ekran onu söyler; sessizce yutulmaz (CLAUDE §1).
 */

export const CourierReturnFreeGoodSchema = z.object({
  variantId: z.string().uuid(),
  name: z.string(),
  /** Boy etiketi; tek boylu üründe boş dize (araç stoğu satırının aynı ayrımı). */
  variantLabel: z.string(),
  imageUrl: z.string().nullable(),
  /** Beklenen dönen adet = araç deposunda kayıtlı olan. */
  onVanQty: z.number().int().nonnegative(),
});

export const CourierReturnBoxSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  customerName: z.string(),
  boxes: z.array(z.object({ boxNo: z.number().int().positive(), code: z.string() })),
});

export const CourierReturnDraftSchema = z.object({
  courierId: z.string().uuid(),
  courierName: z.string(),
  /** Kuryenin araç deposu; `null` = kapsamında araç deposu yok (serbest ürün hiç alınamamıştır). */
  vehicleWarehouseId: z.string().uuid().nullable(),
  freeGoods: z.array(CourierReturnFreeGoodSchema),
  boxesDown: z.array(CourierReturnBoxSchema),
  boxesStay: z.array(
    CourierReturnBoxSchema.extend({
      /** Neden kalıyor: ulaşılamayan durak (yeniden planlanacak) ya da araçtaki başka bir sefer. */
      reason: z.enum(['unreachable', 'other_run']),
      runReferenceNo: z.string().nullable(),
    }),
  ),
});
export type CourierReturnDraft = z.infer<typeof CourierReturnDraftSchema>;

export const AcceptCourierReturnRequestSchema = z.object({
  courierId: z.string().uuid(),
  /** Sayılan DÖNEN adet, varyant başına — beklenenle aynıysa yine gönderilir (onaylanmış sayı). */
  freeGoods: z.array(z.object({ variantId: z.string().uuid(), returnedQty: z.number().int().nonnegative() })),
});
export type AcceptCourierReturnRequest = z.infer<typeof AcceptCourierReturnRequestSchema>;

export const AcceptCourierReturnResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** Araçtan depoya fiilen geçen adetler. */
    transferred: z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().nonnegative() })),
    /** Beklenenden EKSİK dönenler — araç deposunda kalan açık; sayım/düşüm kapatır. */
    shortfalls: z.array(z.object({ variantId: z.string().uuid(), expectedQty: z.number().int(), returnedQty: z.number().int() })),
    /** Damgası silinen kutu sayısı (reddedilen siparişlerin kutuları). */
    unloadedBoxes: z.number().int().nonnegative(),
  }),
  /** Beklenenden FAZLA dönen: araçta o kadar mal kayıtlı değil — sayı yanlış ya da mal başka yerden. */
  z.object({ status: z.literal('not_enough'), variantId: z.string().uuid(), available: z.number().int() }),
  /** Sevk yazıldı, kabul düşdü — mal transferde asılı; kimliği döner ki depo ekranından çözülsün. */
  z.object({ status: z.literal('stuck'), variantId: z.string().uuid(), transferId: z.string().uuid() }),
  z.object({ status: z.literal('no_vehicle') }),
  z.object({ status: z.literal('forbidden'), reason: z.enum(['out_of_scope', 'not_courier']) }),
]);
export type AcceptCourierReturnResponse = z.infer<typeof AcceptCourierReturnResponseSchema>;
