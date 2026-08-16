import * as Haptics from 'expo-haptics';

/*
  TİTREŞİM — TEK KAPI ve NİYET SÖZLÜĞÜ.

  ── NEDEN TEK KAPI ─────────────────────────────────────────────────────────
  Ekranlar `Haptics.*`ı DOĞRUDAN çağırmaz. İki sebep, ikisi de tecrübeyle sabit:

  1. Titreşim bir üsluptur, bir efekt değil. "Şurada Medium, burada Heavy" diye ekran ekran
     seçilirse uygulama altı ay içinde tutarsızlaşır ve kullanıcı titreşimden anlam çıkaramaz
     olur. Burada seçilen şey ŞİDDET değil NİYET: çağıran "ne oldu"yu söyler, hangi dokunuşun
     ona karşılık geldiğini bu dosya bilir.
  2. Kapatma anahtarı, platform istisnası ya da Android'e özgü desen gerektiğinde değişecek yer
     TEK dosya olur. Bugün anahtar YOK (kullanıcı kararı 16.08): iOS zaten sistem ayarına ve
     düşük güç moduna uyuyor, Android'de de sistem titreşim ayarı geçerli — uygulama içine
     ikinci bir anahtar koymak, kapalıyken bile "neden titremiyor" sorusunu ikiye böler.

  ── NEDEN SÖZLÜK BU KADAR DAR ──────────────────────────────────────────────
  Dört fiil var ve dördünün de çağıranı var. Kullanılmayan beşinci bir şiddet (`Heavy`,
  `Warning` …) eklemek, ilk kullanacak kişinin yanlış yerde kullanmasına davetiyedir — ve
  `knip` zaten ölü kodu geçirmez.

  ── HATA YUTULUR, VE BU BİLİNÇLİ ───────────────────────────────────────────
  Çağrılar `Promise` döner ve donanımı olmayan cihazda, düşük güç modunda ya da web'de
  reddedilebilir. Titreşimin başarısızlığı kullanıcının umurunda DEĞİLDİR: gösterilecek bir hata
  yok, alınacak bir aksiyon yok, kaydedilecek bir teşhis değeri yok. Bu yüzden sessizce
  düşürülür — CLAUDE §1'in "sessiz catch yok" kuralının istediği gerekçe budur. Fonksiyonlar
  `void` döner: hiçbir çağıran titreşimi BEKLEMEZ, akış onun ardında durmaz.
*/

/*
  Çağrıyı ateşle-unut yapar; hem SENKRON hatayı hem reddi yutar.

  İkisi de gerekli, ve `try` olmadan bu dosya tehlikelidir: `expo-haptics` YEREL bir modüldür.
  Modülü içermeyen bir istemcide (paket eklendikten sonra HENÜZ YENİDEN DERLENMEMİŞ dev client)
  çağrı `Promise` reddiyle değil, doğrudan FIRLATARAK düşer. O hâlde `catch` zinciri hiç kurulmaz
  ve hata çağırana geçer — yani titreşimin yokluğu, bir toast'ı ya da bir sipariş onayını
  düşürebilirdi. Titreşim hiçbir akışı bozmamalı: sessizce yok olması, gürültüyle patlamasından
  her zaman iyidir.
*/
function fire(run: () => Promise<void>): void {
  try {
    void run().catch(() => {});
  } catch {
    /* Yerel modül yok ya da platform desteklemiyor — bkz. yukarıdaki gerekçe. */
  }
}

/**
 * BEKLENEN SONUÇ GELDİ — kullanıcının bekleyerek durduğu bir işlem başarıyla bitti.
 * Sipariş oluştu, kod doğrulandı, kayıt yazıldı. Ekranda da bir onay görünür (çoğunlukla toast).
 */
export function hapticSuccess(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/**
 * İŞLEM OLMADI — kullanıcının beklediği sonuç gelmedi ve bunu bilmesi gerekiyor.
 * Yanlış kod, reddedilen ödeme, kaydedilemeyen form. Doğrulama uyarısı DEĞİL: boş bırakılmış
 * bir alan için titremeyiz, o kullanıcının henüz bitirmediği bir iştir.
 */
export function hapticError(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/**
 * OLDU AMA BAK — işlem kabul edildi, yine de bir sapma var.
 * Kabul edilen ama beklenenden farklı gelen mal, yaklaşan son kullanma tarihi, kısmen kapanan
 * gün. Operasyonun `warn` tonunun karşılığı: personel devam edebilir, ama ekrana bakmalı.
 */
export function hapticWarning(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/**
 * KARAR VERİLDİ — kullanıcı kararlı bir eylemi tamamladı ve fiziksel bir "oldu" bekliyor.
 * Sepete ekleme, keşifte kartı kaydırma, yıkıcı onayın onaylanması. Sonucu beklenen bir
 * işlem değil, KULLANICININ KENDİ hareketinin karşılığıdır — o yüzden darbe, bildirim değil.
 */
export function hapticCommit(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/**
 * SEÇİM DEĞİŞTİ — hafif, neredeyse fark edilmeyen dokunuş.
 * Geri alma, adet değiştirme gibi geri dönülebilir ve ucuz hareketler için. Sekme ve çip
 * geçişlerine BİLEREK konmadı (kullanıcı kararı 16.08: "her yerde olsun istemiyorum") —
 * gezinirken sürekli titreyen bir uygulama, titreşimin anlamını sıfırlar.
 */
export function hapticSelect(): void {
  fire(() => Haptics.selectionAsync());
}
