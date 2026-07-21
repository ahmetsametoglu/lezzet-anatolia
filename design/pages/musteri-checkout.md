# Müşteri — Checkout

## 1. Amaç ve kullanıcı

Müşterinin kimliğini, adresini, teslimat gününü ve ödeme yolunu netleştirip siparişi kapattığı akış. Kullanıcı: B2C veya onaylı B2B müşteri; girişsiz gelen "misafir" burada hızlı doğrulamayla hesaba bağlanır (hesapsız sipariş yoktur ama müşteri bunu sürtünme olarak hissetmemeli).

## 2. İçerik envanteri — ne var, neden

- **Kimlik adımı (girişsiz gelenlere)** — Google ile devam veya e-posta + tek kullanımlık kod; şifre yok, profil formu yok. "Misafir hızı" hissi: birkaç saniyede doğrulan, devam et
- **Teslimat adresi** — kayıtlı adreslerden seçim veya yeni adres; posta kodu teslimat şeklini belirler
- **Teslimat şekli (adresten türetilir)** — adres bölge içindeyse: **kapıya teslim, ücretsiz**; teslimat günü bölgenin takviminden gelir — tek uygun gün varsa gösterilir (seçim yok), birden çoksa müşteri birini seçer. Bölge dışındaysa: **kargo** + kargo ücreti (eşik üstü ücretsiz)
- **Sipariş kesim etkisi** — kesim saatinden sonra verilen sipariş bir sonraki teslimat gününe kalır; müşteriye yalnız **sonuç** gösterilir (uygun günler zaten buna göre hesaplanmıştır) — "kesim saati" kavramı anlatılmaz
- **Kargoya uymayan ürün kısıtı** — sepette yalnız bölge içi teslim edilebilen ürün varsa kargo seçeneği sunulmaz; bölge dışı adres seçilirse sade açıklama ("bu ürünler yalnız teslimat bölgemizde")
- **Ödeme seçenekleri (bağlama göre)** — yalnız geçerli olanlar görünür:
  - Bölge içi B2C: online öde / kapıda öde (nakit-kart-çek)
  - Kargo B2C: yalnız online
  - B2B: online / havale; vade yetkisi açık müşteride ek olarak "hesaba (vadeli)"
  - Kapıda ödeme, sipariş toplamı tavanı aşarsa sunulmaz — yalnız online kalır; sade açıklama ("bu tutarda online ödeme gerekir")
  - Vadeli seçenek limit/gecikme nedeniyle kapalıysa görünmez; peşin yollar kalır
- **Sipariş özeti** — kalemler, indirim, kargo ücreti, genel toplam; onaydan önce son kontrol
- **Pazarlama izni kutusu** — "kampanyalardan haberdar olmak istiyorum"; **daima işaretsiz gelir** (yasal şart). İşaretlenmemesi siparişi hiçbir şekilde etkilemez
- **Stok yetersizliği anı** — ödeme başlarken stok ayrılamayan kalem olursa müşteriye o an sade bildirilir; ödeme başlamaz

## 3. Aksiyonlar

- Hızlı doğrulama (Google / e-posta kodu)
- Adres seçme / ekleme
- Teslimat günü seçme (birden çok uygun gün varsa)
- Ödeme yolu seçme → **siparişi onayla / öde** (ana aksiyon; online'da ödeme sayfasına gider)
- Sepete dönüp düzeltme

## 4. Durumlar ve varyasyonlar

- **Girişli / girişsiz başlangıç**
- **Bölge içi / kargo**; tek teslimat günü / çoklu gün seçimi
- **B2C / B2B**; B2B'de vade açık / kapalı / o an kullanılamaz
- **Kapıda ödeme tavan altı / üstü**
- **Online ödeme başarılı / yarım kalan ödeme** (müşteri ödemeyi tamamlamazsa sipariş oluşmaz; sepet durur, tekrar denenebilir)
- **Alman B2B (geçerli vergi no)** — KDV'siz fiyatlandırma otomatik uygulanır; müşteri yalnız doğru toplamı görür
- Üç dil

## 5. Akış bağlantıları

Gelinen: sepet; giriş sayfasından dönüş.
Gidilen: online ödeme sayfası → sipariş onay/teşekkür; sipariş detay; sepet (geri).

## 6. Yapmaması gerekenler

- "Rezervasyon", "TTL", "cut-off", "rota", "reverse charge" gibi iç terimler görünmez
- Geçersiz ödeme seçenekleri gri/kilitli olarak bile listelenmez — hiç var olmaz (tavan, vade freni, kargo kısıtı sonuçları sade dille verilir, kural mekaniği anlatılmaz)
- Pazarlama izni kutusu asla işaretli gelmez; siparişe koşul gibi sunulmaz
- Stok adedi, parti bilgisi, iç fiyat kuralları görünmez
- Fatura vaadi verilmez (resmî fatura sistemden inmez)

## 7. Web / mobil notları (yalnız işlevsel)

- Mobil ağırlıklı; doğrulama-adres-gün-ödeme zinciri az adımla, kesintisiz tamamlanabilmeli
- Online ödeme dış sayfaya gider ve döner; dönüşte müşteri net bir sonuç (başarılı/başarısız) görmeli
