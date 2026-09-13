# Müşteri — Sepet

## 1. Amaç ve kullanıcı

Müşterinin seçtiklerini son kez gözden geçirip checkout'a geçtiği sayfa. Kullanıcı: ziyaretçi, B2C veya onaylı B2B müşteri. Giriş yapmış müşterinin sepeti cihaz değişse de korunur.

## 2. İçerik envanteri — ne var, neden

- **Sepet kalemleri** — ürün adı, varyant, adet, birim fiyat, satır toplamı. Fiyat **sepete eklendiği andaki fiyattır** ve sipariş boyunca değişmez — müşteri sürprizle karşılaşmaz
- **Paket satırları** — paket, sepette **tek grup** olarak görünür (paket adı + tek paket fiyatı + içeriği); bütün olarak artırılır/azaltılır/silinir. Aynı ürün hem pakette hem ayrı satırda olabilir — ikisi bağımsızdır ve birleşmez
- **İndirimli teklif kalemleri** — indirimli fiyattan eklenmiş kalem o fiyatıyla durur; teklifin adet sınırı aşılırsa müşteriye sade bir açıklamayla sınır bildirilir ("bu fiyattan en fazla X adet")
- **Kupon girişi** — müşteri kod girer. **Tek indirim kuralı:** birden çok indirim uygunsa yalnız en büyüğü uygulanır; sistem müşteri lehine olanı kendisi seçer. Uygulanan indirim ve tutarı net görünür; uygulanamayan kod sade bir sebeple reddedilir (geçersiz/süresi dolmuş/asgari sepet)
- **Paket ve indirimli tekliflere kupon işlemezliği** — kupon bu satırlara binmez; toplam hesabında sessizce doğru işler, müşteriye ancak sorarsa/denerse sade açıklama
- **Toplam bölümü** — ara toplam, indirim (varsa), kargo ücreti bilgisi, genel toplam. KDV dahil fiyat gösterilir
- **Minimum sepet** — alt sınır varsa ve sepet altındaysa: eksik tutar net söylenir, checkout'a geçilemez
- **Ücretsiz kargo eşiği** — kargolu senaryoda eşiğe ne kadar kaldığı bilgisi sepeti büyütür; eşik aşıldıysa ücretsiz olduğu görünür
- **Stok değişikliği** — sepetteki ürün tükendiyse müşteri checkout'tan önce bilgilendirilir; kalem işaretli kalır, sepetten çıkarması istenir
- **Kimlik ve teslimat adresi (özet panelinin üstünde — kullanıcı kararı 13.09)** — girişsizde kompakt giriş bloğu (Google / e-posta kodu; şifre yok); girişlide seçili teslimat adresi + değiştir · düzenle · yeni adres. Sepet ve checkout **bu adrese göre** kurulur (tek yer kaynağı); adres yoksa "adres ekle". **Hesap açılmadan adres alanı hiç görünmez.** Silme ve fatura işareti hesap sayfasında — panel dar, bağ verilir

## 3. Aksiyonlar

- Adet artırma/azaltma, kalem silme (paketlerde grup bütün olarak)
- Kupon kodu girme / kaldırma
- Giriş yapma (sepette) · teslimat adresi seçme / ekleme / düzenleme (sepette)
- **Checkout'a geç** (ana aksiyon) — yalnız giriş yapılmış VE adres seçilmişken; aksi hâlde pasif, sebebi yazılı
- Alışverişe devam (kataloğa dönüş)

## 4. Durumlar ve varyasyonlar

- **Boş sepet** — kataloğa davet eden sade boş durum
- **Ziyaretçi** — sepet oluşturabilir; kimlik doğrulama SEPETTE istenir (özet paneli); doğrulanmadan ve adres seçilmeden checkout'a geçilemez
- **Girişli, adressiz** — panel adres ister; posta kodu sorusu bu müşteriye ayrıca sorulmaz (soru adrestir)
- **B2B** — hacimli adetler (10–50 koli) rahat girilebilmeli; toplamlar büyük tutarlarda okunaklı kalmalı
- **Minimum sepet altında / üstünde**
- **Kupon: geçerli / geçersiz / daha büyük otomatik indirim varken girilen kupon** (en büyüğü uygulanır, sade açıklanır)
- **Tükenen kalem var**
- Üç dil

## 5. Akış bağlantıları

Gelinen: her sayfadan (sepet her yerden erişilir), sepete ekleme sonrası; ödeme ekranının "adresi sepette değiştir" bağından; girişsiz açılan ödeme ekranından (yönlendirme).
Gidilen: checkout (giriş yapılmış, adres seçilmiş), katalog/ürün detay (alışverişe devam), hesap (adres yönetimi).

## 6. Yapmaması gerekenler

- Stok adedi, parti/lot, son tarih, rezervasyon mantığı görünmez — "sepetteki ürün size ayrıldı" gibi bir vaat de verilmez (stok checkout'ta ayrılır)
- Birden çok indirimin "birleşmiş" gibi gösterilmesi; indirim hesabının iç kuralları anlatılmaz — sonuç gösterilir
- Paket içindeki kalemlerin tek tek fiyatları görünmez
- KDV kırılımı/oran detayı sepette gösterilmez (fiyatlar KDV dahildir)

## 7. Web / mobil notları (yalnız işlevsel)

- Mobilde adet değiştirme ve silme tek elle rahat olmalı; B2B'nin büyük adet girişi her iki biçimde de hızlı olmalı
- Toplam ve checkout aksiyonu her iki biçimde de kaybolmadan erişilebilir olmalı
