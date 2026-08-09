'use server';

import { PostalCodePlaceService, VariantStockNoticeService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import type { PreferredLanguage } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { isValidPostalCode, normalizePostalCode } from './place-types';
import { readPlaceAnswer } from './read-place';

/**
 * ── HATA KAPISI MÜŞTERİYE AİT (denetim H1/H2 · 03.08) ───────────────────────────────────────
 * Bu iki kapının hataları müşterinin EKRANINA basılıyordu ve `getErrorMessage` mesajı olduğu gibi
 * geçiriyordu: Fransız müşteri geçersiz posta kodu yazdığında "Posta kodu 5 haneli olmalı" diye
 * TÜRKÇE bir cümle görüyordu (`notice-dialog` `failure`'ı doğrudan yazıyor). Şimdi dönen şey
 * anahtar; üç dilin cümlesi `restriction-messages.json`'da.
 */

/**
 * "Bölgeye gelince haber ver" kaydı (0030).
 *
 * **Söz DEĞİL, kayıt.** Ekran "haber göndeririz" demez, "not aldık" der: bölge genişletme kararı
 * verilmemiş, tetikleyici de yazılmamıştır. Tutulamayacak bir sözü bugünden vermek, müşteriyi
 * bekletip sonra hiç aramamak olurdu. Kaydı şimdiden almanın tek sebebi, tetikleyici geldiğinde
 * elimizde gerçek bir liste bulunması.
 *
 * Hesap ZORUNLU DEĞİL: düğme, müşterinin vazgeçmeye en yakın olduğu anda duruyor — önüne giriş
 * duvarı koymak ikinci bir engel çıkarmak olurdu. Oturum varsa kayıt ona bağlanır (hesap sayfası
 * kendi kayıtlarını böyle bulacak), yoksa yalnız e-posta ile durur.
 *
 * Aynı yer + e-posta ikinci kez gelirse yeni satır AÇILMAZ (benzersiz indeks): düğmeye tekrar
 * basmak yeni bir bekleyiş değil, aynı bekleyişin tekrarıdır.
 *
 * **Yer İKİ parçadır** (21.16): ülke kaydedilmezse haber işi Fransa'da açılan bir bölgeyi aynı kodu
 * yazmış Alman müşteriye de duyurabilir — ölçüldü, 610 kod iki ülkeye birden çözülüyor. Ülke
 * çerezden okunur, parametre olarak alınmaz: kaydın hangi yere ait olduğu bir tercih değil,
 * sistemin zaten bildiği bir gerçek (kardeş eylem `recordVariantStockNoticeAction` de böyle).
 */
export async function recordZoneNoticeAction(
  rawPostalCode: string,
  rawEmail: string,
  /**
   * Kaydın bırakıldığı sayfanın dili (14.10). **Ziyaretçide bunu kaydetmezsek bir daha
   * öğrenemeyiz:** kayıt hesapsız olabildiği için haber gönderilirken dili çözecek bir profil
   * yoktur ve mail tahminle gider — Alman müşteri Fransızca bir haber okur. Verilmezse `null`
   * yazılır ("bilinmiyor"), varsayılan uydurulmaz.
   */
  locale?: PreferredLanguage,
  /** Kaydın geldiği yüzey — web dışı çağıran (native uygulama) kendi etiketini geçer (21.16). */
  source = 'web',
): Promise<CustomerResult<true>> {
  try {
    const postalCode = normalizePostalCode(rawPostalCode);
    if (!isValidPostalCode(postalCode)) throw new CustomerError('postal_code_invalid');

    const email = rawEmail.trim().toLowerCase();
    // Biçim kontrolü kaba ve bilinçli: e-postanın gerçekten çalıştığını ancak göndererek anlarız,
    // burada amaç yazım hatasını değil boş/anlamsız girdiyi elemek.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CustomerError('email_invalid');

    // Ülke müşterinin cevabından (çerez, 19.9). Yer bilinmiyorsa kayıt ALINMAZ — nereye haber
    // vereceğimizi bilmeden söz veremeyiz; kardeş eylemin kuralı burada da geçerli.
    const answer = await readPlaceAnswer();
    if (!answer || answer.postalCode !== postalCode) throw new CustomerError('place_unknown');

    // `zone_notice.customer_id` de `user_profiles`'a FK'li: auth kimliği yazıldığında girişli
    // müşterinin kaydı FK ihlaliyle düşüyordu (ziyaretçininki null geçtiği için sorunsuz görünüyordu).
    const customerId = await currentCustomerId();
    const db = serviceDb();
    // Yer adı KAYIT ANINDA dondurulur: kod tablosu ileride değişse de operatör "68000" değil
    // "Colmar" okur. Çözülemezse `null` — uydurma yok. Çok yerleşimli kodda ilki yeter, karar
    // "burayı açalım mı"dır, adres değil.
    const places = await new PostalCodePlaceService(db).findPlaces(answer.country, postalCode);

    // Servis üzerinden (denetim A4): tekillik yine veritabanında (`zone_notice_unique_idx`),
    // çakışma hata sayılmıyor — düğmeye ikinci kez basmak yeni bir bekleyiş değil.
    await new ZoneNoticeService(db).record({
      postalCode,
      country: answer.country,
      placeName: places[0] ?? null,
      source,
      email,
      customerId,
      locale: locale ?? null,
    });

    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * "Bu ürün bölgeme gelince haber ver" kaydı (19.12) — `variant_stock_notice`.
 *
 * Üstteki `recordZoneNoticeAction`'dan AYRI ve karıştırılmamalı: o "bölgenize gelmiyoruz" hâlinin
 * kaydıdır, bu "bölgenize geliyoruz ama bu ürün burada şu an yok" hâlinin. İkincisi vitrinin
 * dördüncü stok hâlidir (`elsewhere`, 19.10): ürün ağda var ama müşterinin yerine ulaşamıyor —
 * soğuk zincir olduğu için kargoya da verilemiyor. Tek bir "yok" mesajına indirmek, müşteriyi
 * gelmeyecek bir mal için bekletmek olurdu.
 *
 * **Yine söz değil, kayıt:** tetikleyici (stok girince haber gönderme) yazılmadı. Ekran "not aldık"
 * der. Aynı dürüstlük tonu, aynı gerekçe.
 *
 * Yer MÜŞTERİNİN cevabından okunur (çerez, 19.9), istemciden parametre olarak alınmaz: kaydın
 * hangi yere ait olduğu bir tercih değil, sistemin bildiği bir gerçek. Yer bilinmiyorsa kayıt
 * alınmaz — nereye haber vereceğimizi bilmeden söz veremeyiz.
 *
 * **Çağıranı BAĞLANDI (01.08 · 02.08).** İki yerden: kartın/ürün detayının "Gelince haber ver"
 * düğmesi (`StockNoticeButton`) ve rota İÇİNDEKİ müşterinin kısıt bloğu — orada bölge notu
 * anlamsız (müşteri zaten bölgede), söz kalem kalem veriliyor ve kayıt da kalem kalem düşülüyor.
 */
export async function recordVariantStockNoticeAction(variantId: string, rawEmail: string): Promise<CustomerResult<true>> {
  try {
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CustomerError('email_invalid');

    const answer = await readPlaceAnswer();
    if (!answer) throw new CustomerError('place_unknown');

    const customerId = await currentCustomerId();
    await new VariantStockNoticeService(serviceDb()).record({
      variantId,
      country: answer.country,
      postalCode: answer.postalCode,
      email,
      customerId,
    });

    return { data: true, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
