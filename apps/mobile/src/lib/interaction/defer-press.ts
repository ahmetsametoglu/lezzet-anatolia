/*
  DOKUNMA İŞLEYİCİSİ BIRAKMA ÇİZİMİNDEN SONRAKİ KAREYE ALINIR (21.219 · ölçüldü 03.09).

  ── ARIZA ────────────────────────────────────────────────────────────────────
  Kendi çizdiğimiz geri düğmesine basınca uygulama düşüyordu:
  `IllegalStateException: addViewAt: failed to insert view […] into parent […]`
  → `Caused by: The specified child already has a parent` (Fabric `SurfaceMountingManager`).
  Beş kez, İKİ cihazda (CPH1907/Android 11 · 2311DRK48G/Android 15), DÖRT ayrı ekranda
  (toplama → kabuk, araçtaki seferler → gün, araç stoğu → yükleme, seferi kapat → gün).

  ── SEBEP (ölçüldü, teori değil) ─────────────────────────────────────────────
  Parmak kalkınca AYNI React işlemine iki iş düşüyor: `Pressable`ın `pressed → false` yeniden
  çizimi (basılı stili `PressableSurface`ın fonksiyon-çocuğundan geliyor) ve o dokunuşun
  ekranı KALDIRAN işleyicisi (`router.back()` · `dismissTo` · `replace`). React ikisini tek
  mount partisine topluyor; ekran kaldırılırken görünümleri geri dönüşüm havuzuna düşüyor ve
  aynı partideki güncelleme onları hâlâ eski ebeveynine bağlıyken bulunca Android reddediyor.
  RN 0.86'da View/Text/Image geri dönüşümü VARSAYILAN AÇIK (`enableViewRecyclingForView` → true).

  Kök hata bizim değil, RN ↔ react-native-screens arasında ve AÇIK: screens #3249 (`endRemovalTransition`
  bozuk), #2803 (ShadowTree ↔ native görünüm ayrışması), #4137 (bizim yığınımızın aynısı, "üretimde
  her yerde çöküyor", tekrar üretilemediği için kapanmamış). screens 4.27.0'da da düzeltme yok.
  Tetiği BİZ çekiyoruz: native başlığı gizleyip kendi düğmemizi çiziyoruz (o düğme JS state taşır),
  `TouchableOpacity`nin native bırakma animasyonu yerine React state'li basılı stil kullanıyoruz ve
  kaldırma çağrısını dokunma olayının İÇİNDE eşzamanlı yapıyoruz. Üçü birleşince her geri dokunuşu
  aday oluyor.

  ── ÖLÇÜM (Oppo CPH1907, toplama ekranından başlık geri okuna adb dokunuşu) ──
  · mevcut kod, olağan geçiş        → 1/6 ve 1/8 çökme (~%14, aralıklı)
  · `animation:'none'`              → 7/10  (pencere ANİMASYON DEĞİL: animasyon kalkınca
                                      kaldırma ile çizim aynı kareye sıkışıyor ve arıza artıyor)
  · `animation:'none'` + bu erteleme → 0/10 · kit düzeyinde 0/10 (bu dosyanın hâli)
  · basılı görünümü tamamen kaldırmak da 0/10 verdi — ELENDİ: tasarımın basılı hâli bilinçli
    bir karar ve 95 dosyayı ilgilendiriyor; erteleme aynı sonucu görünümü bozmadan alıyor.
  Donanım geri tuşu aynı ekranlarda HİÇ düşürmedi (bırakılan düğme yok, yalnız kaldırma var) —
  ölçüm bu ayrımla tutarlı.

  ── NİÇİN KİTİN İÇİNDE, EKRANLARDA DEĞİL ─────────────────────────────────────
  Ekranı dokunuşla kaldıran 44 çağrı var (28 ekran ortak başlıktan geçiyor; müşteri yüzeyinin
  `BackButton`ı da aynı yol; ayrıca `dismissTo`/`replace` yapan düğmeler). Kuralı çağrı başına
  yazmak, unutan ilk ekranda arızayı geri getirirdi ve unutulanı kimse göremezdi — titreşim
  kuralının 02.09'da kitin tek dokunma yüzeyine taşınmasıyla aynı gerekçe.

  ── BEDELİ ───────────────────────────────────────────────────────────────────
  Bir kare (~16 ms) gecikme; gözle görülmüyor. TİTREŞİM ERTELENMEZ — dokunuşun fiziksel cevabı
  anında kalır, ertelenen yalnız işin kendisi.

  ── TESTTE EŞZAMANLI ─────────────────────────────────────────────────────────
  `jest.setup.ts` bu modülü eşzamanlı sahteliyor: Fabric zamanlaması testin konusu değil ve
  erteleme çıplak bırakılınca `fireEvent.press` sonrası eşzamanlı bekleyen 251 test kırılıyordu
  (ölçüldü). Sahteyle 1276/1276 geçiyor. Modülün var olma sebeplerinden biri de bu: çıplak
  `requestAnimationFrame` çağrısı sahtelenecek bir yüzey bırakmazdı.

  BEKLEYEN(21.245): kök düzeltme RN/screens tarafında. Gelirse bu erteleme SÖKÜLEBİLİR; yedek
  yol da yazılı — `enableViewRecyclingForView` bayrağını native tarafta kapatmak (config plugin
  + dev-client yeniden derlemesi ister, ölçülmedi).
*/

/**
 * İşleyiciyi bir sonraki kareye alır — çağıranın tek bilmesi gereken bu.
 *
 * `setTimeout(…, 0)` DEĞİL: makro görev bir sonraki karenin NEREsine düşeceğini söylemez;
 * `requestAnimationFrame` işleyiciyi bırakma çiziminin commit'inden sonraya, bir sonraki
 * çizim turuna bağlar — ayırmak istediğimiz sınır tam olarak orası.
 */
export function deferPress(handler: () => void): void {
  requestAnimationFrame(handler);
}
