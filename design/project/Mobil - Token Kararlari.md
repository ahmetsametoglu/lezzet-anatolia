# Mobil Uygulama — Token Mutabakat Kararları (7 Ağustos 2026)

Gözden geçirmedeki 13 maddenin kararları. "Uygulandı" = Mobil - Musteri v3.dc.html'de işlendi.

1. **Tek mürekkep:** ink-soft açılmaz; #3a4147'nin 82 kullanımı `ink #343b41`'e çekildi. ✅ Uygulandı.
2. **Yeni sand kademeleri resmileşir:** `sand-150 #efdfc2` (seçili kart / özet paneli / puan zemini), `sand-100 #ece3c8` (kart zemini). Envantere bu adlarla eklenmeli; değerler mobildeki gibi kalır.
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
