# Lezzet Anatolie — İşletme ve Ürün Bilgileri

Bu doküman işletmenin künyesini ve ürün kataloğunu tek yerde toplar. Katalog verisi seed/başlangıç için kaynaktır. Marka adı, birim, fiyat, kategori gibi **bekleyen kararlar** için bkz. `BACKLOG.md §0`.

---

## İşletme künyesi

> **Kaynak:** INPI / Registre national des entreprises resmî kayıt belgesi (03.08.2026 tarihli çıktı).
> Aşağıdaki satırlar o belgeden birebir alınmıştır — tahmin ya da hatırlanan değer yoktur.

| Alan | Değer |
| --- | --- |
| Ticari unvan (dénomination sociale) | **QUALITE** |
| Hukuki biçim | SAS — société par actions simplifiée |
| Sermaye | 500 EUR |
| SIREN | 907 496 640 |
| **SIRET (etkin merkez)** | **907 496 640 00026** |
| APE / NAF | 4791B — Vente à distance sur catalogue spécialisé |
| TVA (KDV no) | FR50907496640 |
| Yasal temsilci | Yigit Bilgin — Président de SAS |
| Merkez adresi | 46 rue des Prés, 67380 Lingolsheim, Fransa |
| RNE tescili | 25.11.2021 · faaliyet başlangıcı 01.09.2025 |
| Web | www.lezzetanatolie.com |
| E-posta | lezzetanatolie@gmail.com |
| Telefon | +33 (0)6 16 99 06 81 |
| Instagram | LezzetAnatolie |
| Pazar | Fransa ve Almanya |
| Diller | Türkçe, Fransızca, Almanca |
| Barındırıcı | Hetzner Online GmbH · Industriestr. 25, 91710 Gunzenhausen, Almanya · +49 (0)9831 505-0 |

> **Barındırıcı künyesi neden burada:** LCEN md. 6 barındırıcının **unvanını, adresini ve telefonunu**
> mentions légales'te zorunlu kılıyor — bu bir tercih değil. Künye burada tutuluyor ki sağlayıcı
> değişirse tek yerden güncellensin; bugün üç dilde `legal/terms/content.json`'a yazılı.
>
> **Sunucu bölgesi: AB içi — kullanıcı doğruladı (03.08.2026).** Yani mentions légales ve gizlilik
> politikasındaki "sunucular Avrupa Birliği içindedir" cümlesi olgudur, varsayım değil; kişisel veri
> AB dışına çıkmıyor ve **ayrı bir aktarım dayanağına (SCC vb.) gerek yok.**
> **Sunucu bir gün AB dışına taşınırsa üç şey birden değişir:** mentions légales `barindirma` bölümü ·
> gizlilik politikasının hizmet sağlayıcı satırı · aktarım için hukuki dayanak gerekliliği. Hetzner'ın
> ABD (Ashburn/Hillsboro) ve Singapur lokasyonları AB dışıdır — bölge değişimi sessiz bir taşıma
> değil, yasal metni de ilgilendiren bir karardır.

> **DÜZELTME (03.08.2026) — bu tablo üç yerinden yanlıştı ve yanlışı yasal sayfalara taşınmıştı.**
> · **SIRET `…00018` DEĞİL `…00026`.** `00018` numaralı işletme (20 rue des Vignes) **01.09.2025'te
>   KAPANMIŞ**; aynı gün 46 rue des Prés adresinde `00026` açılmış. Kapanmış bir işletme numarasını
>   mentions légales'e yazmak yanlış beyandır.
> · **Unvan "YİGİT Bilgin QUALITE S.A.S." değil, sadece `QUALITE`.** "Yigit Bilgin" şirketin adı
>   değil, **başkanının** adı — ikisi karışmış. Yasal temsilci olarak kendi satırında duruyor.
> · **Merkez Strasbourg değil, Lingolsheim** (67380). Lingolsheim Strasbourg büyükşehir alanında,
>   yani "Strasbourg ve çevresi" teslimat anlatımı doğru kalır; ama **künye gerçek adresi yazmak
>   zorunda** — mentions légales'te şehir yaklaşık olamaz.

> **Not — marka adı:** Logolarda "Lezzet Anatolia", domain/Instagram'da "Lezzet Anatolie". Tek yazıma karar verilecek (`BACKLOG.md §0`). Bu dokümanda domain ile tutarlı olması için "Anatolie" kullanıldı. **Yasal künyede marka adı değil TİCARİ UNVAN yazılır** (`QUALITE`); marka adı "nom commercial" olarak ayrıca anılır.

> **Güvenlik notu:** Hesap şifreleri bu dokümana bilinçli olarak konmadı. Şifreler dokümantasyonda tutulmaz; ayrı ve güvenli bir yerde saklanmalı. Paylaşılmış olan şifrelerin değiştirilmesi önerilir.

---

## Ürün kataloğu

Aşağıdaki liste eldeki ham içerikten çıkarılmıştır. Yazım, birim, gramaj ve fiyat kararları katalog doldurulurken netleşecektir (`BACKLOG.md §0, §3`). Ürün adları ağırlıklı Türkçe girilmiştir; çeviri (FR/DE) AI önerisiyle admin onayından geçecektir (`SEO_I18N.md`).

### Börekler
- Gül börek — kıymalı
- Gül börek — peynirli
- Gül börek — patatesli
- Gül börek — ıspanaklı
- Kol börek — kıymalı
- Kol börek — peynirli
- Kol börek — patatesli
- Kol börek — ıspanaklı
- Su böreği

### Simit / Poğaça / Açma / Gözleme
- Açma — çikolatalı
- Açma — zeytinli
- Açma — sade
- Poğaça — dereotlu / peynirli
- Poğaça — tahıllı
- Poğaça — kaşarlı
- Poğaça — sade
- Gözleme — patatesli
- Gözleme — ıspanak / peynirli

### Tatlılar
- Künefe
- Katmer
- Cevizli baklava
- Fıstıklı baklava
- Havuç dilimi baklava
- Tulumba

### Yaş Pastalar
- Trileçe (Lezza trileçe)
- Red velvet (bütün pasta)
- Black forest (kara orman)
- Limonlu cheesecake
- Frambuazlı cheesecake
- Dark chocolate profiterol
- Devil's fudge cake
- Tiramisu
- Dark choco (bütün pasta)
- Latte cake
- Carrot cake (havuçlu kek)

### Dondurmalar
- Maraş dondurma — dilim 70gr
- Maraş dondurma — 500gr

### Yiyecekler
- Bazlama
- İçli köfte
- Lahmacun
- Sucuk (500gr)
- Çiğ köfte

### Kuru Meyveler
- Kuru kayısı
- Kuru incir

### Çerezler
- Kaju
- Fındık
- Antep fıstığı
- Badem
- Ceviz

---

## Katalog üzerine notlar (karar için)

- **Kategori ağacı:** Yukarıdaki başlıklar ham listeden türetildi. Nihai kategori yapısı onaylanacak (örn. Katmer/Künefe ayrı mı, Tatlılar altında mı; Traliçe ayrı kategori mi, Yaş Pasta içinde mi).
- **Birim/varyant:** Bazı ürünler gramajlı (dondurma 70gr/500gr, sucuk 500gr). Bunların "aynı ürünün varyantı" mı yoksa ayrı ürün mü olacağı karara bağlı.
- **Görseller:** Eldeki gerçek ürün fotoğrafları sınırlı (su böreği/peynirli börek ambalajı, kol böreği, cevizli baklava, havuç dilimi baklava). Diğer ürünler için görsel toplanacak veya geçici görsel kullanılacak.
- **Alerjen/içerik:** FR/DE'de gıda satışında alerjen beyanı yasal. Verilecekse veri modeline alan eklenecek (`DATA_MODEL.md`).
- **KDV:** Ürün bazında oran gerekiyor (donuk gıda genelde %5,5; bazıları %20 olabilir).
- **"bakery Lezza" ambalajı:** Peynirli börek kutusunda görülen bu ibare netleştirilecek (eski marka / alt marka / devam edecek mi).
