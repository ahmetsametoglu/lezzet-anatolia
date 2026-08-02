'use server';

import { VariantStockNoticeService, serviceDb } from '@lezzet/database';
import { currentCustomerId } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { isValidPostalCode, normalizePostalCode } from './place-types';
import { readPlaceAnswer } from './read-place';

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
 * Aynı kod + e-posta ikinci kez gelirse yeni satır AÇILMAZ (benzersiz indeks): düğmeye tekrar
 * basmak yeni bir bekleyiş değil, aynı bekleyişin tekrarıdır.
 */
export async function recordZoneNoticeAction(rawPostalCode: string, rawEmail: string): Promise<ActionResult<true>> {
  try {
    const postalCode = normalizePostalCode(rawPostalCode);
    if (!isValidPostalCode(postalCode)) throw new Error('Posta kodu 5 haneli olmalı');

    const email = rawEmail.trim().toLowerCase();
    // Biçim kontrolü kaba ve bilinçli: e-postanın gerçekten çalıştığını ancak göndererek anlarız,
    // burada amaç yazım hatasını değil boş/anlamsız girdiyi elemek.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi girin');

    // `zone_notice.customer_id` de `user_profiles`'a FK'li: auth kimliği yazıldığında girişli
    // müşterinin kaydı FK ihlaliyle düşüyordu (ziyaretçininki null geçtiği için sorunsuz görünüyordu).
    const customerId = await currentCustomerId();
    const { error } = await serviceDb()
      .from('zone_notice')
      .upsert({ postal_code: postalCode, email, customer_id: customerId }, { onConflict: 'postal_code,email', ignoreDuplicates: true });
    if (error) throw error;

    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
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
export async function recordVariantStockNoticeAction(variantId: string, rawEmail: string): Promise<ActionResult<true>> {
  try {
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi girin');

    const answer = await readPlaceAnswer();
    if (!answer) throw new Error('Önce teslimat yerinizi girin');

    const customerId = await currentCustomerId();
    await new VariantStockNoticeService(serviceDb()).record({
      variantId,
      country: answer.country,
      postalCode: answer.postalCode,
      email,
      customerId,
    });

    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
