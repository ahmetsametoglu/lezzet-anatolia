import { z } from 'zod';
import { CountryEnum, DeliveryZoneInsertSchema, type DeliveryZonePostalCode } from '@lezzet/types';
import type { ZoneMapPoint } from '@/components/operation/ui/zone-map-model';

// Kardeş sayfadan ithal edilmiyor: iki sayfa da ortak şemadan türer, birbirine bağlansalar biri taşınınca öteki kırılırdı.

/** Rotaya eklenen kod: `(ülke, kod)`. `67000` iki ülkede geçerli — ülkesiz anahtar eksik bir sorudur. */
const PostalCodePickSchema = z.object({ country: CountryEnum, postalCode: z.string().min(1) });
export type PostalCodePick = Pick<DeliveryZonePostalCode, 'country' | 'postalCode'>;

/**
 * Bir posta kodunun ağırlığı: rayın tek sorusu "bu kod rotada yerini hak ediyor mu". Ürün, marj ve kohort
 * Analitik'in işidir; burada gösterilen her sayı bu ekrandaki kararı değiştirebilmeli.
 */
export interface CodeStatsView {
  /** Bu koddan çıkan sipariş — TÜM ZAMAN (`analytics_postal_code_orders`). */
  orderCount: number;
  revenueCents: number;
  /**
   * Haber bekleyen kişi sayısı (kimlikli ve izinli). Anonim talep sayacıyla toplanmaz: o yalnız liderlik tablosu verir
   * ve listede olmayan kod için "0" yazdırırdı, oysa doğrusu "bilinmiyor".
   */
  waitingCount: number;
}

/**
 * Önerilen kod bir tahmin değil hatırlatmadır: sistemin topladığı kanıtları (bekleyen kişi, gitmiş sipariş, sorulma)
 * ham gösterir. `ZoneMapPoint`'ten türer, kopyalansaydı öneriye tıklamak bir gün yanlış koordinat taşırdı.
 */
export interface SuggestionView extends ZoneMapPoint {
  /** Kimlikli ve izinli bekleyen kişi (`zone_notice`) — en pahalı sinyal: iletişim bilgisi verdiler. */
  waitingCount: number;
  /** Bu koda gitmiş sipariş — bugün KARGOYLA hizmet ediliyorlar, yani müşteri zaten var. */
  orderCount: number;
  revenueCents: number;
  /** Anonim "buraya geliyor musunuz" sorusu (`postal_code_demand`). */
  requestCount: number;
  /**
   * Son sorunun YAŞI, dakika — bir yıl önce susmuş talep bugünkü kadar değerli değil.
   *
   * Dakika olarak taşınıyor, ISO olarak değil: `agoShort` sözleşmesi yaşın SUNUCUDA hesaplanmasını
   * istiyor (künyesi: iki tarafta ayrı `Date.now()` okunursa ilk boyama sunucununkinden farklı çıkar
   * ve hidrasyon uyuşmazlığı doğar).
   */
  lastAskedMinutes: number | null;
}

/**
 * Rotaya özel eşik saatleri, yalnız istisnalar: anahtar yok = genel değer, `null` = istisna kalkar. Anahtar kümesini
 * kapı `DAY_HOUR_KEYS`e karşı doğrular, burada ikinci bir liste yok.
 */
const ZoneHoursSchema = z.record(z.string(), z.string().nullable());

/** Rota formunun şeması — yazma eyleminin (`saveZoneAction`) girdisi. */
export const ZoneFormSchema = DeliveryZoneInsertSchema.pick({ name: true, weekdays: true, isActive: true })
  .partial({ isActive: true })
  .extend({ postalCodes: z.array(PostalCodePickSchema), hours: ZoneHoursSchema.optional() });
