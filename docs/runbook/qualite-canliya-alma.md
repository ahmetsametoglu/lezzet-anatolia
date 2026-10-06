# Runbook — QUALITE'yi canlı sisteme almak

> **Ne zaman okunur:** QUALITE'nin deposu, bölgeleri, kuryesi ve müşterileri canlı sisteme ilk kez girilirken; bir kez ve bu
> sırayla. Kurallar `docs/feature/iki-is.md`'dedir, burada yalnız yapılacak işler ve kontrolleri durur.
>
> **Geri alınamayan iki seçim:** deponun işi depo kullanılmaya başlayınca (stok, sipariş, sefer) kilitlenir; tedarik
> siparişinin işi sipariş doğduğu anda sabitlenir. İkisini kayıt girmeden önce kontrol edin.

## Ön koşul

İki işin B fazı canlıya yayınlanmış olmalı. Kuralların çoğu veridedir (migration); eski sürümle bu adımlar QUALITE kaydını
Lezzet'in deposuna, bölgesine ya da kargosuna düşürür.

## Adımlar

| # | İş | Nereden | Kontrol |
|---|---|---|---|
| 1 | QUALITE tesisi: iş **QUALITE**, kargo çıkışı **kapalı** (QUALITE kargo göndermez, veri açık kargoyu reddeder); gel-al gerekiyorsa açık. | Depolar → yeni depo | Depo listesinde iş QUALITE |
| 2 | QUALITE teslimat bölgeleri QUALITE deposuna bağlanır. Aynı posta kodu Lezzet bölgesinde de durabilir; bir işin içinde kod tek bölgededir. | Teslimat & Rota → bölgeler | Bölge formu çakışmayı yalnız aynı işte gösterir |
| 3 | QUALITE kuryesi ayrı personel hesabıdır: kurye rolü, kapsamı yalnız QUALITE deposu. Aynı araç kullanılacaksa farklı plaka koduyla ikinci araç kaydı açılır (plaka tekildir) ya da kurye "araçsız devam" der. | Ayarlar → personel; Depolar → araç kaydı | Kuryenin gün ekranında yalnız QUALITE seferi |
| 4 | Yalnız QUALITE'ye mal veren tedarikçide varsayılan iş **QUALITE**; iki işe mal verende boş kalır, siparişin işi kalemlerin hedef deposundan gelir. | Tedarik → tedarikçi | — |
| 5 | QUALITE müşterisi şirket ve B2B onaylı olmalı; işi **QUALITE** yalnız admin seçer. Onay kaldırılacaksa önce iş Lezzet yapılır, veri aksi hâli reddeder. | Müşteriler → düzenle | Müşteri kartında iş QUALITE |
| 6 | Açılış stoğu QUALITE deposuna **mal kabulüyle** girer (siparişsiz alım ya da QUALITE tedarik siparişi); parti elle yazılmaz. | Stok → mal kabul; mobil Depo → mal kabul | QUALITE deposunun stok listesi |

## Doğrulama turu

Kayıtlar girdikten sonra, aynı posta kodlu bir QUALITE ve bir Lezzet müşterisiyle:

1. İki müşteri de sipariş verir; QUALITE siparişi QUALITE deposuna, Lezzet siparişi Lezzet deposuna düşer.
2. QUALITE müşterisi QUALITE bölgesi dışındaki bir adresle sepette "buraya şu an gönderemiyoruz", ödemede "teslimat noktası
   belirlenemedi" görür; adres kartında kargo rozeti yoktur ve sipariş Lezzet kargosuna düşmez.
3. QUALITE deposunda mobil yerinde satış açılmaz ("Bu depoda yerinde satış yapılmaz").
4. QUALITE tedarik siparişi yalnız QUALITE deposuna kabul edilir ve Lezzet deposunun bekleyen kabul listesinde görünmez.
5. Adres vermeyen bir ziyaretçi, yalnız QUALITE deposunda duran ürünü "tükendi" görür.
6. Açık bir kampanya varken QUALITE müşterisinin sepetinde indirim satırı ve kupon alanı, onay sayfasında komşu daveti, ana sayfada
   keşif daveti yoktur; bireysel Lezzet müşterisinin aynı sepeti indirimi alır.
7. Raporlar › Muhasebe export'ta QUALITE seçiliyken indirilen satış dosyası (`muhasebe-<ay>-qualite.csv`) yalnız QUALITE
   satışlarını, hareket dökümü yalnız QUALITE hareketlerini taşır.
