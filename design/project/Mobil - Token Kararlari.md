# Mobil Uygulama — Token Mutabakat Kararları (7 Ağustos 2026)

Gözden geçirmedeki 13 maddenin kararları. "Uygulandı" = Mobil - Musteri v3.dc.html'de işlendi.

1. **Tek mürekkep:** ink-soft açılmaz; #3a4147'nin 82 kullanımı `ink #343b41`'e çekildi. ✅ Uygulandı.
2. **Yeni sand kademeleri resmileşir:** `sand-150 #efdfc2` (seçili kart / özet paneli / puan zemini), `sand-250 #ece3c8` (kart zemini — tutanakta "sand-100" yazılmıştı; ad çakışması nedeniyle **sand-250** olarak açıldı, 23. karar). Envantere bu adlarla eklenmeli; değerler mobildeki gibi kalır.
3. **Yakın sapmalar:** mobil değerler token'ın resmî değeri olur (web sonra buna çekilir): `sand-300=#e2d8bd`, `olive-line=#cddbb0`, `disabled-fill=#b9b29e`, `star=#d9a441`, `closed-bg=#e9e2cf`. `#a44a3f/#f4e3e0` terracotta'ya katılmaz — ayrı **error ailesi** (metin/zemin) olarak resmileşir.
4. **"Varsayılan" rozeti:** tek zemin `#e3ecd2` (olive-tint). Hesap'taki #eef2e2 buna çekildi. ✅ Uygulandı.
5. **Eksik aileler envantere eklenir:** `scrim` (rgba(21,23,15,.28/.45/.82) üçlüsü), `shadow` (0 1px 3px rgba(58,65,71,.08) + sert gölge 3px 3px 0 ink), `photo-gradient` (foto üstü yazı skrimleri); `brand` ailesi ayrı: WhatsApp #25d366, Google #4285f4, Apple #000, Stripe #635bff, Visa #1a1f71, MC #eb001b/#f79e1b — semantik ailelere karışmaz.
6. **Tipografi:** `screen-title = 17px Lora 600` resmileşir (18'e yuvarlama yok). Kademeler: eyebrow 10px/700/.18em · helper 12px · buton 14.5px/700 · sheet başlığı 19px Lora. `.18em` letter-spacing token'lanır.
7. **Yarıçap seti:** resmî 4 kademe — `12 rozet · 16 buton/girdi · 20 kart · 22 hap`. Mevcut 9 kademenin kalanları bu sete yuvarlanacak (ayrı görsel tur olarak; toplu değişim regresyon riski taşıdığından bu turda yalnız kural ilan edildi).
8. **Basılı durum kuralı:** sert gölgeli öğe `translate(2px,2px)` (gölgeyi yutar; FAB 3px), gölgesiz öğe `scale(.97)` (küçük öğede .9–.95). ✅ Uygulandı (21 dönüşüm).

## Eksik çizimler
9. OTP **6 hane** (backend ile ortak). ✅ Uygulandı.
10. **Sonsuz kaydırma:** katalog + siparişlerde ilk açılış skeleton'ı (700 ms) + yükleniyor göstergesi + "— hepsi bu kadar —" liste sonu. ✅ Uygulandı.
11. **Ağ hatası / tekrar dene** bloğu (katalog, siparişler, bildirimler, talepler), **ödeme başarısız** durumu, **oturumlu boş** Siparişler/Bildirimler, sepette **stok tükendi** satır uyarısı. ✅ Uygulandı — Tweaks &gt; demoDurum ile gösterilir (ag-hatasi / bos-listeler / sepette-tukendi).
12. **Ödeme PCI:** kart alanları uygulama içinde çizilmez — sayfa yalnız tutar + Apple Pay + "Kartla öde"; kart alanları Stripe PaymentSheet'i temsil eden yerel sheet'te. Başarısız dönüş: ilk kart denemesi reddedilir (demo), hata bloğu + Tekrar dene, ikinci deneme onaylanır. ✅ Uygulandı.
13. **Sepet niyeti:** FAB'lı model resmî karar — sepet sekmesi yok; rozet FAB üzerinde. Sekme-rozet ölü kodu temizlendi. ✅ Uygulandı.

## İkinci tur — foto-üstü, rozet ve iskelet kararları (7 Ağustos 2026)

14. **Foto-üstü ad:** tasarım `on-image #f5f1e6`'ya çekildi (4 kullanım: vitrin tarif kartı, katalog kartı, paket bandı, geri bildirim); `on-image-bright` açılmaz. ✅ Uygulandı.
15. **Foto-üstü altyazı:** `on-image-soft`'un resmî değeri **#d5d0c2** (sıcak) olur — mobil referans. Soğuk #dfe3cf ayrı varyant olarak açılmaz; web kullanımları web turunda bu değere çekilir.
16. **Badge ailesi açılır:** yazı `12,5px/700 Karla · .06em` (küçük boy 10px), gölge tek durak `0 3px 8px rgba(21,23,15,.22)`. Yarıçap yeni durak almaz — rozet 12'ye yuvarlanır; mevcut .28/.3 gölgeler de .22'ye çekilir (7. karardaki görsel turda, toplu regresyon riski nedeniyle bu turda yalnız kural).
17. **cream-glass ailesi açılır:** `rgba(243,239,226,.90)` (foto üstü yüzen daire) · `.96` (yapışkan çubuk/alt bar); `blur(8px)` kalır ve kurala bağlanır. ✅ .95/.97 kullanımları .96'ya çekildi (15 dönüşüm). Foto-üstü rozet zeminleri (.92/.94) badge ailesinde kalır.
18. **Tükendi örtüsü:** `.72` kendi durağı olur (`scrim-72`, rol: tükendi/pasif foto örtüsü). `.82`'ye çekilmez — .82 metin koruma gradyanının ucudur, işi fotoğrafı okunur kılmak; .72'nin işi fotoğrafı soluklaştırmak.
19. **"TAKİP" çipi envantere girer:** `accent-leaf #a9c46b` zemin + `ink-deep #15170f` metin (scrim ailesinin rgb(21,23,15) katısı; ikisi de resmî ad alır).
20. **Küçük duraklar token'a çekildi, yeni durak yok:** çeşit alt-satırı 11,5 (micro) · vitrin/keşif başlığı 20 (h2-sm) · basılı ölçek .97 · alt gradyan 40% → .82. ✅ Uygulandı (paket bandındaki 32% başlangıç kadraj gereği kalır, ucu .82'ye çekildi).
21. **brand-whatsapp-pure onaylandı:** mobil OTP/paylaşım yeşili `#25d366` = `brand-whatsapp-pure`; operasyondaki `brand-whatsapp #128c4b` ayrı kayıt olarak kalır.
22. **Katalog iskeleti kareye çekildi:** 138'lik daire + metin çubukları yerine kart ile birebir kare (`aspect-ratio:1 · yarıçap 20`), grid boşlukları gerçek listeyle aynı (20/14). ✅ Uygulandı.
23. **Kayıt düzeltmesi:** 2. karardaki "sand-100", envanterdeki ad çakışması nedeniyle **sand-250** adıyla açıldı; tüm referanslar bu adla.
24. **Font varlıkları:** expo-font ile statik ağırlıklar — **Lora 400·600, Karla 400·600·700**; italik yüklenmez. Fontlar gelene dek sistem fontu (FOUT kabul), metrik yakın fallback: Georgia / system-ui.
