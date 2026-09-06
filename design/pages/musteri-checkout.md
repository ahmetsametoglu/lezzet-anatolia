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
- **Adres düzeltme teklifi (onaya basıldığı an)** — §4c

## 3. Aksiyonlar

- Hızlı doğrulama (Google / e-posta kodu)
- Adres seçme / ekleme
- **Önerilen adresi kabul etme / kendi adresini koruma** (§4c)
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

## 4b. Sipariş alındı ekranı — komşu daveti şeridi (12.08, 17.10)

Onay ekranının blokları (kutlama · teslimat · ödeme · zaman çizgisi · yardım şeridi · özet) çizimde
var. Bunlara **bir şerit daha** ekleniyor ve buranın seçilmesi tesadüf değil: müşteri teslimat
gününü tam o anda okuyor — "aynı güne komşunu da çağır" cümlesi ancak orada anlamlı. Hesap
sayfasında ya da sipariş detayında sorulsa geç kalırdı.

- **Hangi bilgi:** kısa bir başlık ("komşunuzu bu teslimata çağırın"), bir cümlelik gerekçe (aynı
  gün, aynı araç, birlikte teslim; davet edene puan) ve **paylaşılabilir bir bağlantı** — tek eylem.
- **Hangi amaçla:** aynı durakta ikinci bir sipariş, teslimatın maliyetini bölüyor. Müşteriye
  söylenen şey bu değil (o işletmenin muhasebesi); müşteriye söylenen şey komşusuyla **aynı gün**
  teslim alacağı ve puan kazanacağı.
- **Ne YAZILMAZ:** indirim ya da ücretsiz teslimat vaadi — rota içi teslimat zaten ücretsiz, bölünecek
  bir ücret yok. "Sefer", "rota", "kesim saati" gibi iç terimler de geçmez (§6'nın kuralı); gün
  müşterinin okuduğu biçimde yazılır ("Perşembe, 14 Ağustos").
- **Kaç komşu çağrılabildiği yazılmaz:** sınır vardır (varsayılan 3) ama onu ekranda saymak, daveti
  bir kotaya çevirir. Sınır dolduğunda bağlantının kendi karşılama sayfası bunu söyler.
- **Blok KOŞULLU:** bağlantı yoksa hiç çizilmez — kargo siparişinde (sefer diye bir şey yok), sipariş
  henüz kesinleşmemişken ve seferin kesim saati dolmuşken. Boş bir şerit, çalışmayan bir düğmedir.
- **Bağlantının indiği sayfa ayrı bir yüzeydir** (`/neighbor/[token]`) ve envanteri kendi
  dosyasında değil, burada özetlenir: davet edenin **yalnız adı**, teslimat günü ve tek bir eylem
  ("bu sefere sipariş ver"). Adres, sipariş içeriği, tutar hiçbiri geçmez — komşu daveti bir
  teslimat gününü paylaşır, bir siparişi değil.

## 4c. Adres düzeltme teklifi — "bunu mu demek istediniz" (11.11, kullanıcı kararı 02.09)

**Doğrulama ADRES GİRİŞİNDE DEĞİL, SİPARİŞ ANINDA yapılır** (kullanıcı kararı). Müşteri adres
defterine on adres ekleyebilir ve hiçbiri girerken sorgulanmaz — defter bir taslak alanıdır, sınav
değil. Soru yalnız o siparişin gideceği adres için, yalnız "Siparişi onayla"ya basıldığında sorulur.
Gerekçe: sorulan şey "bu adres geçerli mi" değil, **"malı bu kapıya mı götürelim"**; o soru ancak
kapı seçildiğinde anlamlıdır.

**Bu bir ENGEL DEĞİL** ve öyle görünmemeli — adres defteri hiçbir hâlde reddetmez (10.08). Teklif
bir SORUDUR; reddedilince akış hiç değişmeden sürer.

### İki hâl, iki AYRI ton — ve fark yapısal olmalı

| Hâl | Ne biliniyor | Ekranda |
| --- | --- | --- |
| **Kapı BAŞKA kodda bulundu** | Servis gerçek kapıyı buldu; müşterinin yazdığı kodda o numara yok | Teklif kutusu + **iki düğme**: [Düzelt] · [Benim yazdığım doğru] |
| **Kapı doğrulanamadı** (sokak var, numara yok · adres hiç bulunamadı) | Bir belirsizlik — yeni yapı, `bis/ter` ekli numara, servisin geç kaldığı bir kayıt olabilir | **Tek yumuşak satır, DÜĞMESİZ** |

Ayrım görsel değil **yapısal**: birinde tıklanacak bir şey var, ötekinde yok. Aynı görünselerdi
müşteri geçerli bir yeni bina adresini hata sanar ve doğru yazdığı adresi bozardı.

### Kurallar

- **Teklifin metni SERVİSİN etiketidir**, bizim birleştirdiğimiz cümle değil. Kendi kurgumuz
  servisin bildiği yazımdan (aksan, kısaltma, `bis`) sapar ve müşteriye tanımadığı bir adres gösterir.
- **Reddin adı "İptal" değildir.** Müşteri haklı olabilir; bastığı şey bir vazgeçiş değil bir
  **beyandır** ve o beyan kayıtta durur (kurye ve sevkiyat onu okur — `kurye-teslimat.md` §2).
- **Kabul İKİSİNİ birden düzeltir**: hem bu siparişin adresini hem KAYDIN kendisini. Yalnız siparişi
  düzeltmek, müşteriyi bir dahaki siparişte aynı soruyla karşılardı.
- **Aynı adres için ikinci kez sorulmaz.** Cevaplanmış bir soru, akışı ikinci kez durduramaz.
- **Servis düşerse EKRAN SUSAR** (fail-open): dış bir servisin kesintisi satışı durduramaz. Müşteri
  siparişini verir, yalnız teklifi görmez.
- **Sözcükler dört yüzeyde AYNI** — web checkout, native uygulama checkout'u, kurye durak kartı ve
  operasyon sipariş detayı. Ayrışırsa aynı müşteri iki farklı şey duyar. Operasyon tarafındaki
  eşleşme `docs:check §3k` ile makineyle zorlanıyor.

## 5. Akış bağlantıları

Gelinen: sepet; giriş sayfasından dönüş.
Gidilen: online ödeme sayfası → sipariş onay/teşekkür; sipariş detay; sepet (geri).
Komşu davetinden gelen ziyaretçi: davet karşılaması → sepet/katalog → aynı checkout (davet belirteci
çerezde taşınır; teslimat günü doğal olarak o sefere düşer).

## 6. Yapmaması gerekenler

- "Rezervasyon", "TTL", "cut-off", "rota", "reverse charge" gibi iç terimler görünmez
- Geçersiz ödeme seçenekleri gri/kilitli olarak bile listelenmez — hiç var olmaz (tavan, vade freni, kargo kısıtı sonuçları sade dille verilir, kural mekaniği anlatılmaz)
- Pazarlama izni kutusu asla işaretli gelmez; siparişe koşul gibi sunulmaz
- Stok adedi, parti bilgisi, iç fiyat kuralları görünmez
- Fatura vaadi verilmez (resmî fatura sistemden inmez)
- Adres doğrulaması **hiçbir hâlde siparişi engellemez**; "geçersiz adres" gibi bir hüküm cümlesi kurulmaz — servis bilmiyor olabilir, müşteri biliyordur
- Koordinat, eşleşme skoru, servis adı (BAN) ya da `geo_precision` gibi iç ölçüler müşteriye görünmez

## 7. Web / mobil notları (yalnız işlevsel)

- Mobil ağırlıklı; doğrulama-adres-gün-ödeme zinciri az adımla, kesintisiz tamamlanabilmeli
- Online ödeme dış sayfaya gider ve döner; dönüşte müşteri net bir sonuç (başarılı/başarısız) görmeli
