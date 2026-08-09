import { z } from 'zod';
import { CountryEnum, PreferredLanguageEnum } from '../primitives/enums.schema';

/**
 * Bölge haberi (`zone_notice`, 0030) — *"bölgenize henüz gelmiyoruz, açılınca haber verelim."*
 *
 * **`VariantStockNotice` ile karıştırılmaz, iki farklı sözdür:**
 * - bu tablo → rota o yere HİÇ gelmiyor
 * - `variant_stock_notice` → rota geliyor ama BU ÜRÜN orada şu an yok
 *
 * **Hesap zorunlu değil:** ziyaretçi de kayıt bırakabilir (`customerId` null). "Haber ver"in önüne
 * giriş duvarı koymak, tam da vazgeçmeye en yakın anda ikinci bir engel çıkarmaktı.
 *
 * Şema denetim A4 ile eklendi: tablo üç app dosyasından HAM okunuyordu (`db.from('zone_notice')`),
 * yani ad dönüşümü ve doğrulama her çağrının kendi sorumluluğundaydı — okuma tarafı `postal_code`'u
 * elle `as string` diye çeviriyordu. Kolon adı değişse derleyici değil çalışma zamanı haber verirdi.
 *
 * **Bu satır aynı zamanda "teslimat talebi"nin kendisidir** (21.16): mobil şerit bunun için ayrı bir
 * tablo istemişti, ama iki tablo da *"kim bölge açılmasını bekliyor"* sorusuna cevap verirdi ve haber
 * işi ikisini birden okumak zorunda kalırdı. `postal_code_demand` ile ayrımı korunur: o ANONİM bir
 * sayaçtır (zayıf sinyal), bu kimliği ve kanalı olan bir kayıttır (kuvvetli).
 */
export const ZoneNoticeSchema = z.object({
  id: z.string().uuid(),
  /** Normalize edilmiş posta kodu (`normalizePostalCode`) — hangi bölgenin açılması bekleniyor. */
  postalCode: z.string(),
  /**
   * Yerin öteki yarısı. **Kod tek başına yetmiyor:** ölçüldü (09.08) — 16 878 satırlık kod
   * tablosundaki 610 kod iki ülkeye birden çözülüyor. Ülke kaydedilmediği sürece haber işi iki
   * ülkeyi de deneyip *"biri tutarsa"* diyordu, yani Fransa'da açılan bir bölge aynı kodu yazmış
   * Alman müşteriye gidebilirdi. `variant_stock_notice` bu dersi 19.8'de zaten almıştı.
   */
  country: CountryEnum,
  /** Kaydın alındığı gün çözülen şehir adı — operatör kodu değil ismi okur. `null` = çözülemedi. */
  placeName: z.string().nullable(),
  /**
   * Kaydın geldiği yüzey (`web` · `app-account` · `app-onboarding` …). Enum DEĞİL: bir karar girdisi
   * değil denetim izidir; yeni ekran açmanın migration'a mal olmasının karşılığı yok.
   */
  source: z.string(),
  email: z.string(),
  /** Girişli müşteride kim olduğu; ziyaretçide null. */
  customerId: z.string().uuid().nullable(),
  /**
   * Kaydı bıraktığı sayfanın dili. **`null` = bilinmiyor**, "Fransızca" değil: ziyaretçi kaydı
   * hesapsız olduğu için haber gönderilirken dili çözecek bir profil çoğu zaman yoktur ve
   * kaydetmeseydik tahmin etmek zorunda kalırdık (`CLAUDE §1`: ölçülemeyen değer varsayılan değildir).
   */
  locale: PreferredLanguageEnum.nullable(),
  createdAt: z.string(),
  /** Haber gönderildiğinde damgalanır — **tek hatırlatma** sözü bununla tutulur. */
  notifiedAt: z.string().nullable(),
});
export type ZoneNotice = z.infer<typeof ZoneNoticeSchema>;

export const ZoneNoticeInsertSchema = ZoneNoticeSchema.omit({ id: true, createdAt: true }).partial({
  customerId: true,
  locale: true,
  notifiedAt: true,
  // Yer adı çözülemeyebilir; yüzeyin DB varsayılanı var ('web'). Ülke opsiyonel DEĞİL: bilinmeden
  // kayıt alınmamalı, çünkü haberi nereye göndereceğimizi bilmiyor oluruz.
  placeName: true,
  source: true,
});
export type ZoneNoticeInsert = z.infer<typeof ZoneNoticeInsertSchema>;

/** Yalnız "haber verildi" damgası güncellenir — kaydın kendisi değişmez. */
export const ZoneNoticeUpdateSchema = ZoneNoticeSchema.pick({ id: true, notifiedAt: true });
export type ZoneNoticeUpdate = z.infer<typeof ZoneNoticeUpdateSchema>;
