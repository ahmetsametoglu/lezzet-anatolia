# Uygunluk listesi — Mal Kabul (04 · 05 · 06)

> **Niçin var (kullanıcı sorusu 30.08):** *"Bunlar neden atlanabiliyor? Bunları atlamaman için seni
> nasıl yönlendirmeliyim?"*
>
> Cevabı yöntemdeydi: tasarımı `node` ile sorgulayıp **aklıma gelen** şeyleri kıyaslıyordum. Bir
> ekranda ~40 görsel karar var; sorgu ne sorarsan onu bulur, sormadığını göstermez. Bu dosya o
> boşluğu kapatır — ekranın HER öğesi, reçetesiyle ve ölçülmüş durumuyla.
>
> **Kural:** bir ekran "bitti" sayılmaz; **listesi tükenir**. Uygulamadan önce liste çıkarılır,
> kullanıcıya gösterilir; bitirmeden önce `pnpm design:shot` ile tasarımın resmi + cihaz görüntüsü
> yan yana konur ve liste madde madde geçilir.
>
> Durum işaretleri: `✅` uyuyor · `⚠` kısmen (farkı yazılı) · `❌` yok · `🔒` veri modeli engeli.

## 05 · Mal kabul satırları (`05-maDetay`)

| # | Öğe | Tasarımın reçetesi | Durum |
| --- | --- | --- | --- |
| 1 | **Başlık** | `‹` kutucuk + **sevkiyat kodu** (Lora 20) + künye "tedarik siparişi · 5 kalem · 0 tamam" | ✅ 30.08 — başlık sabit "Mal kabul"du; uç künyeyi 21.11d'den beri gönderiyordu, **hook düşürüyordu** |
| 2 | **Okutma CTA** | olive çerçeve + ikon, metin **"Koli okut — satırı bul"**, olive-dark | ✅ 30.08 — metin tamamlandı; **ikon da yanlıştı**: köşe ayraçlı "QR çerçevesi" çizmişim, v3 iki ekranda da gövde+mercek çiziyor (`rect(3,5,18,14,r3)` + `circle(12,12,3.2)`). Ayraç "hedefle" der, mercek "kamerayı kullan" — düğmenin işi ikincisi |
| 3 | **"Kabul kapalı" kartı** (çevrimdışı) | panel kart, başlık + gövde; kip başına ayrı metin | ✅ |
| 4 | **"Kod öğrenildi" kartı** | olive-bg + olive-line, r16: "Kod öğrenildi · 8691234567890 → Fıstıklı Baklava 450 g" + "koli barkodu · çarpan 12 · ikinci gelişte tanınacak" | ✅ 30.08 — listenin üstünde KALICI kart. Öğrenme bir adım değil bir SONUÇ: o kod bir dahaki kabulde tanınacak ve depocunun bunu görmesi aynı koliyi ikinci kez öğretmeye kalkışmasını önler |
| 5a | Kalem kartı · **künye** | ad `700 14.5` + "beklenen 10 · GAZ-7120" `400 11 muted` | ✅ |
| 5b | Kalem kartı · **ADET kutusu** | 74×52, sayı `700 19` + "ADET" `.12em`; **DÜĞME** — `sheetAdet` açar | ⚠ kutu ve başlık ✅ (30.08); **çekmece yerine klavye** açıyor → 🔒 `sheetAdet` "kaç koli geldi" listesi ister, ürünün **kutu tipleri** veri modelinde yok |
| 5c | Kalem kartı · **rozet satırı** | "SKT ZORUNLU · DLC" dolgulu terracotta + `kaynakNotu` düz metin | ✅ 30.08 |
| 5d | Kalem kartı · **okutma notu** | olive kart: `okutTuru` + `okutNotu` ("koli barkodu · çarpan 12") | ✅ 30.08 — satır durumu artık bayrak değil NESNE (`scan: {kind, qtyPerCode}`); okutan iki çağıran da bu ikiliyi zaten elinde tutuyordu. Elle sayılan satırda hiç çizilmez |
| 5e | Kalem kartı · **kalan ömür uyarısı** | terracotta kutu: "Kalan ömür %58 — uyarı, engel değil" + açıklama | ✅ |
| 5f | Kalem kartı · **SKT alanı** | h50, takvim ikonu + değer + "seç →"; **eksikse terracotta** çerçeve/metin | ✅ 30.08 |
| 5g | Kalem kartı · **lot + hasar** | iki ALAN: lot (esner, h46) + hasar etiketi; lot `sheetLot` açar | ⚠ alanlar ✅ (30.08); **lot çekmecesi yok** → 🔒 çekmece "okunan koliden gelen adaylar"ı ister, okutma yanıtı **lot taşımıyor** |
| 5h | Kalem kartı · **hasarlı paket bloğu** | error kart: "HASARLI PAKET SAYISI" + ± sayaç + "sağlam X / hasarlı Y" + sebep çipleri + dipnot | 🔒 satır başına **hasarlı paket sayısı** yok (bugün yalnız siparişin tamamına serbest not) |
| 6 | **Kapalı kalem kartı** | `opacity:.7` + "say →" 70×52 kesikli + iki dolgulu rozet | ✅ 30.08 |
| 7 | **Fark özeti** | "FARK ÖZETİ — YALNIZ SAPAN SATIRLAR" + sapan satırlar + açıklama | ✅ |
| 8 | **Dipnot** | "SKT her satırda zorunlu…" | ✅ |
| 9 | **Yapışkan CTA** | durum satırı + tam genişlik düğme | ✅ |
| 10 | **Kısmi kayıt düğmesi** | AYRI ikinci düğme "Kısmen teslim alındı olarak kaydet" + altında açıklama | ✅ 30.08 — **boyama değil DAVRANIŞ farkıymış**: istek gövdesi sayılmamış satırı zaten atlıyordu, eksik olan `complete` kilidiydi. Rampada koli koli gelen sevkiyatta "her satırı say" beklemesi gerçek dışı. Düğmenin KOŞULU bizim kararımız (tasarım hep çiziyor): yalnız "hepsi değil ama en az biri sayılmış" hâlinde |

**Özet (30.08 · ikinci tur sonrası):** 17 maddenin **14'ü uyuyor**, **0'ı kısmen**, **0'ı eksik**,
3'ü veri modeli engelli (5b · 5g · 5h — üçü de `v3-tasarim-veri-modeli-notlari.md`de kayıtlı).

Yani 05 ekranında **kodun kapatabileceği fark kalmadı**; kalan üçü sözleşme/veri işidir.

## Sıradaki iş

1. **#5g** lot çekmecesinin BİÇİMİ bugün yazılabilir (başlık + elle giriş); **adaylar** okutma
   yanıtı lot taşımaya başlayınca dolar. Biçimi adaysız yazmak, boş bir çekmece açmak olur —
   önce sözleşme, sonra çekmece.
2. Cihazda doğrulama: görsel ajanından 04/05/06 karesi istendi (`v3-gorsel-depo.md`).
3. 04 ve 06 için aynı yöntemle uygunluk listesi — 05 bitti.

## 04 · Bekleyen sevkiyat listesi · 06 · Siparişsiz kabul

`BEKLEYEN(21.161)`: aynı yöntemle çıkarılacak — 05 bitince.
