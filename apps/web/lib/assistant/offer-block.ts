import { expiryFlagOf } from '@lezzet/domain-core';
import type { ProductDateType } from '@lezzet/types';

/**
 * Fırsat (parti teklifi) kararının yasağı ve engeli — kuyruk gövdesinin ortak kapısı (26.08).
 *
 * ── İKİ AYRI KAVRAM, BİLEREK AYRI FONKSİYON ─────────────────────────────────
 * **YASAK** (`offerBlockedByExpiry`) bir gerçektir: DLC'si geçmiş parti satılamaz, kapı da onu
 * reddeder. Ekran bunu SÖYLER — kırmızı bir satırla, gövdenin içinde.
 * **ENGEL** (`batchOfferBlock`) bir arayüz kararıdır: düğmeyi kapatır. Ve yalnız YAZILAMAYACAK
 * değerde kurulur, iş kuralı yasağında değil — gerekçesi `batchOfferBlock` künyesinde.
 *
 * İkisinin bir süre aynı şey sayılması bu dosyanın doğuş sebebiydi ve düzeltilen ikinci hatasıydı.
 *
 * ── NEDEN AYRI BİR DOSYA ────────────────────────────────────────────────────
 * Yasak sorusu üç yerde soruluyordu ve üçü de kuralı ELLE kurmuştu (`tarih geçti && dateType ===
 * 'DLC'`): gövdenin uyarı satırı, karar düğmesi, ve kapının kendisi. Üç kopya aynı cevabı
 * veriyordu — ama motor DDM'yi `expired_sellable` sayıyor ve kopyalardan biri bir gün o dalı da
 * kesse kimse fark etmezdi. Kural motorda (`expiryFlagOf`), çağrı burada.
 */

/**
 * Bu partinin satışı YASAK mı — motorun kelimesiyle `expired_blocked`.
 *
 * `dateType` bilinmiyorsa `false`: ölçülemeyen bir yasak, uydurma bir yasaktır (`CLAUDE §1`).
 * Uydurma yönü de önemli — "DLC olabilir" diye kesmek, satılabilir bir DDM partisini imhaya
 * yollardı; okunamayan tip satırda zaten tip yazmadan gösteriliyor.
 *
 * Toplam raf ömrü (`shelfLifeDays`) verilmiyor ve gerekmiyor: yasak "tarih geçti mi" sorusundan
 * çıkıyor, eşiğe yaklaşma (`near_expiry`) hesabından değil.
 */
export function offerBlockedByExpiry(dateType: ProductDateType | null | undefined, expiryDate: string): boolean {
  if (!dateType) return false;
  return expiryFlagOf(dateType, expiryDate, null) === 'expired_blocked';
}

/**
 * Karar düğmesinin engeli ve SEBEBİ; `null` ise yol açık.
 *
 * **ENGEL YALNIZ YAZILAMAYACAK DEĞERDE — İŞ KURALI YASAĞI DÜĞMEYİ KAPATMAZ**
 * *(kullanıcı kuralı 26.08, bir turluk sapmadan sonra)*.
 *
 * Bir tur boyunca DLC'si geçmiş parti burada ENGEL sayıldı ve düğme kapandı. Gerekçem şuydu:
 * kapı zaten `must_discard` ile reddediyor, basan boşuna basıyor. Kullanıcı kuralı tersine
 * çevirdi ve gerekçesi daha sağlam:
 *
 *   *"Kapattığın düğmeyi de gerekirse aç, zaten hata kodu geliyormuş. Yanlış bir tespitte
 *   bulunup da o butonu kapatırsan daha büyük bir hataya sebep verirsin."*
 *
 * Asimetri buradadır: **tespit yanlışsa iki hatanın bedeli eşit değil.** Düğme açık kalır ve
 * yasak gerçekse operatör bir hata mesajı okur — sebebini öğrenir, iş durmaz. Düğme haksız yere
 * kapanırsa operatör yapabileceği bir işi yapamaz ve ekran ona sebebini de doğru söylemez;
 * kendi hatasını arar. Birincisi bir tıklama, ikincisi tıkanmış bir akış.
 *
 * **22.35'in `tools/list` süzgeciyle karıştırılmamalı** — orada süzülen şey MODELİN gördüğü
 * listeydi: model hata mesajından öğrenemez, bir tur kaybeder ve "sistem bozuk" diye yanlış
 * teşhis üretir. İnsan operatör hata mesajını okur. Aynı ilke iki yüzeyde iki farklı sonuç verir.
 *
 * Yasak GÖRÜNMEYE devam ediyor: gövde onu kırmızı bir satırla söylüyor (`ExpiryLine` →
 * `offerBlockedByExpiry`) ve Stok ekranı tarihi geçmiş partiyi zaten en üste alıp kırmızıya
 * boyuyor — imha yolunu bulmak için köprüye de gerek yok (kullanıcı ölçümü 26.08).
 *
 * **Maliyetin altında fiyat da engel değildir** — zararına satmak bir karardır; ekran onu
 * cümleyle söyler, yolu kapatmaz.
 */
export function batchOfferBlock(params: { offerPriceCents: number | null }): string | null {
  if (params.offerPriceCents === null) return 'Teklif fiyatı girilmeli';
  return params.offerPriceCents <= 0 ? 'Fiyat sıfırdan büyük olmalı' : null;
}
