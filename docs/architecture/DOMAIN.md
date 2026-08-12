# Domain — Terimler, Roller, İş Kuralları

Bu dosya sistemin **kalbidir**. İş mantığına dokunan her görevde okunur. "Bu iş neden böyle" sorusunun cevabı buradadır.

---

## 1. Terimler

| Terim | Anlam |
| --- | --- |
| **Kanal** | Sipariş verenin *tipi*: `B2B` (şirket) veya `B2C` (son tüketici). Sistem otomatik belirler. **Sipariş kaynağıyla karıştırılmaz.** |
| **Sipariş kaynağı** | Siparişin *nereden kapandığı*: `web` / `whatsapp` / `door` / `manual`. Kanaldan bağımsız eksen (bkz. `CHANNELS.md §2`). |
| **Satış yüzeyi** | Siparişin kapatıldığı arayüz: vitrin sitesi, WhatsApp, kapı önü. Hepsi aynı `domain-core`'u çağırır. |
| **Servis penceresi** | Müşteri yazınca açılan 24 saatlik ücretsiz mesajlaşma aralığı. Dışında işletme-başlatan mesaj onaylı template gerektirir (ücretli). |
| **Opt-in** | Müşterinin ticari mesaj alma izni. Broadcast için double opt-in şart (GDPR). |
| **Platform satışı** | Sistem üzerinden geçen sipariş. Ortaklık paylaşımına dahildir. |
| **Platform dışı satış** | Sistemsiz (eski usul) yapılan satış. Paylaşıma dahil değildir. |
| **DLC** | *Date limite de consommation* — güvenlik/son tüketim tarihi. Geçince **satılamaz** (yasal, imha). |
| **DDM** | *Date de durabilité minimale* — asgari kalite tarihi. Geçince **satılabilir**, kalite düşer. Donuk ürünlerin çoğu DDM'dir. |
| **Kalan raf ömrü %** | Ürün ömrünün ne kadarının kaldığı = (kalan gün ÷ toplam raf ömrü). Uyarı, indirim ve kabul kararları buna göre. |
| **MLOR** | *Minimum Life On Receipt* — bir parti bize (veya müşteriye) ulaşırken kalmış olması gereken asgari raf ömrü. |
| **Rota içi** | Müşteri adresinin mevcut dağıtım rotasının kapsadığı bölgede olması. |
| **Fiili stok** | Depoda fiziksel olarak var olan miktar. |
| **Ayrılmış stok** | Verilmiş ama henüz teslim edilmemiş siparişlere tahsis edilmiş miktar. |
| **Kullanılabilir stok** | Fiili stok − ayrılmış stok. Yeni siparişin görebileceği miktar. |
| **Hızlı satış** | Müşterinin depo kapısında anında verdiği, tek adımda tamamlanan ve ödenen sipariş. |

---

## 2. Roller ve izinler

**İki eksen, tek alan** (karar 27.07):

- **Müşteri ↔ personel keskin ayrımdır.** Aynı kişi ikisi birden olamaz: müşteri rolü operasyon rolleriyle bir arada duramaz.
- **Personel içinde çoklu rol olağandır.** Başlangıçta tüm roller tek kişide toplanabilir, işe eleman alındıkça ayrışır: depo + muhasebe aynı kişide olabilir, patron aynı zamanda admin olabilir.

Kural `user_profiles.roles` dizisinde yaşar ve **veritabanı kısıtıyla zorlanır** (uygulama unutsa da geçmez); saf hâli `domain-core/identity/roles`'ta (arayüz "neden veremiyorum"u oradan yazar).

| Rol | Yetki |
| --- | --- |
| **Yönetici (admin)** | Tam yetki: ürün, fiyat, kullanıcı, ayarlar, tüm raporlar. |
| **Depo sorumlusu** | Stok girişi, DLC, sipariş hazırlama. Fiyat ve ayar göremez. |
| **Kurye** | Kendine atanan teslimatlar, gün kapanışı, kasa teslimi. |
| **Muhasebe** | Para hareketleri, kasa mutabakatı, muhasebe export'u. Ürün/fiyat/ayar yönetimi yok. |
| **Müşteri** | Kendi siparişleri, katalog, sepet, kendi profili. **Operasyon rolleriyle birleşmez.** |

**Rol geçişleri sessiz değildir:** müşteriye operasyon rolü verilince `customer` düşer (kişi artık personeldir); personele müşteri rolü verilince tüm operasyon rolleri düşer. Son operasyon rolü alınan kişi **müşteriye düşer** — hesabı silinmez, siparişleri ortada kalmaz.

Yetki kapısı blueprint STACK §7'deki `requireAdmin` / `requireAuth` desenini izler. Yeni roller aynı desende eklenir (`requireWarehouse`, `requireCourier` gibi). Rol kontrolü tek yerden (`lib/guard.ts`) akar.

**İzin ilkesi:** her rol yalnızca işini görecek kadar veri görür. Depo sorumlusu fiyat/kâr görmez; kurye başka kuryenin teslimatını görmez; müşteri yalnızca kendi verisini görür.

---

## 3. Kanal ayrımı ve paylaşım

### Otomatik kanal belirleme

Sipariş oluştuğunda kanal, sipariş verenin **şirket olup olmadığına** göre otomatik atanır. Müşteri kaydında bir "şirket mi" göstergesi (vergi no / şirket bilgisi varlığı) bunu belirler. Kanal siparişe yazılır ve **değişmez** (audit için).

### Paylaşım kuralı

- Platform üzerinden geçen **her** satış, kanaldan bağımsız olarak ortaklık paylaşımına dahildir.
- Bu, sistemde "kanal ayrımının" mali paylaşımı **etkilememesi** demektir: B2B de B2C de aynı havuza girer.
- Kanal ayrımı yalnızca **operasyonel ve raporlama** amaçlıdır (fiyat, süreç, analiz), paylaşım amaçlı değil.
- Platform dışı satışların sisteme girmemesi doğaldır; ama mevcut müşterilerin makul sürede sisteme taşınması beklenir (bu bir iş kuralı, teknik zorlama değil).

> **Not (ajan için):** Bu, ortaklık dokümanındaki daha eski "B2B/B2C ayrı paylaşılır" mantığının **yerini alan** güncel karardır. Sistem tarafında tek havuz mantığı geçerlidir. Paylaşım oranının kendisi (yüzde) bir iş anlaşmasıdır; sistem sadece her satışı doğru, değişmez ve raporlanabilir biçimde kaydeder.

### Kanal ≠ sipariş kaynağı

"Kanal" (b2b/b2c) siparişi verenin **kim** olduğudur. Siparişin **nereden** kapandığı ayrı bir eksendir: `order_source` (`web`/`whatsapp`/`door`/`manual`). Bir B2C müşteri WhatsApp'tan da siteden de sipariş verebilir; kanalı değişmez, yalnızca kaynağı değişir. Günlük dilde "WhatsApp kanalı" denir ama veri modelinde bu `order_source=whatsapp`'tır — mali paylaşımla ilgisi yoktur. Ayrıntı: `CHANNELS.md`.

---

## 4. Stok kuralları

> **Depo ağı (01.08):** çok depoda bu bölümün tamamı depo **başına** işler — kullanılabilir, FEFO
> ve rezervasyon depo içinde hesaplanır; rezervasyon varyant+depo seviyesindedir (parti seçimi yine
> hazırlıkta). Kurallar §17'de.

### Üç seviye

`Kullanılabilir = Fiili − Ayrılmış`. Müşteri her zaman **kullanılabilir** stoğu görür.

### Rezervasyon

- Uzaktan siparişte stok **ayrılır** (fiiliden düşülmez, ayrılmışa eklenir): online ödemede **checkout başlarken** (TTL'li, aşağıya bkz.), kapıda/vadeli ödemede **onayda** (`confirmed`).
- Sipariş teslim edildiğinde ayrılmış → fiiliden düşülür (ayrılmış da azalır).
- Sipariş iptal edilirse ayrılmış geri bırakılır — ama mal teslimata çıkmışsa serbest bırakma **depoya geri girişte** olur, kapıda değil (aşağıya bkz.).
- **Hızlı satışta** (kapı önü) rezervasyon adımı atlanır: fiiliden anında düşülür.
- Rezervasyon **ürün-toplamı** seviyesindedir (parti seçilmez); hangi partinin gideceği **hazırlıkta FEFO ile** belirlenir. Basit ve eşzamanlılığa dayanıklı; DLC takibi bundan etkilenmez (aşağıya bkz.).
- **Nerede tutulur:** her ayırma bir `Reservation` satırıdır (sipariş + varyant + adet + varsa TTL); "ayrılmış toplam" bu satırlardan **türetilir**, sayaç tutulmaz. Partiye bağlı teklif satırı (near-expiry) aynı tablodadır, tek farkla: `stock_id` doludur. Ayrı mekanizma yoktur.
- **Hazırlıkta parti kaydı:** hazırlık ekranı FEFO'ya göre partiyi **önerir**; depocu "hazırlandı" derken çıkan parti(ler) `OrderItemBatch`'e otomatik yazılır (3 × parti A, 2 × parti B olabilir). Depocu öneriden saparsa yalnız o satırı değiştirir — günlük ek yük yok. Bu kayıt iki şeyi mümkün kılar: **geri çağırmada** "bu parti hangi siparişlere gitti" tek sorgudur; **gerçek COGS** partinin alış fiyatından hesaplanır (§12). FEFO önerisi hesaplanırken partiye pinned rezervasyon miktarı o partinin kullanılabilirinden düşülür — normal hazırlık, teklife söz verilmiş stoğu yiyemez.
- Parti karmaşıklığı yalnız **depo hazırlık ekranında** yaşar; müşteri, admin sipariş listesi ve kasa parti görmez (altın kural).

### Online checkout: rezervasyon penceresi (TTL)

Online ödemede stok **checkout başlarken** ayrılır — cart'ta değil ("sepette hold yok" kuralı korunur). Müşteri ödemeyi tamamlamazsa ayrılan stok kilitli kalmasın diye bir süre penceresi vardır:

- Ayrılır; **30 dakika** (varsayılan) içinde ödeme onayı gelmezse `apps/backend` cron'u ayrılmışı **geri bırakır** (`Reservation.expires_at` üzerinden); sipariş `draft`'ta kalır/iptal olur.
- TTL **parametrik** `Setting`'tir (kod sabiti değil).
- **Pencere eşitliği kuralı DÜŞTÜ (03.08, denetim A9 — kod↔doküman hizalaması).** Bu satır *"Stripe checkout oturumu TTL ile aynı anda sona erdirilir; TTL 30 dk altına indirilemez çünkü Stripe oturumunun asgarisi 30 dk"* diyordu. Mimari değişti: hosted checkout yerine **PaymentElement + `PaymentIntent`** kullanılıyor (`ARCHITECTURE_DECISIONS` — kart alanı sitede, müşteri dışarı çıkmıyor) ve **`PaymentIntent`'in son kullanma tarihi yoktur**, yani ne eşitlik kurulabilir ne de TTL'e böyle bir alt sınır gelir.
  - **Yerine geleni daha iyi:** istemci **ertelenmiş Elements** kullanıyor — form açılışta monte olur, niyet ancak "öde"ye basınca doğar. Ayırma ile ödeme arasındaki mesafe dakikalar değil saniyeler.
  - Kapıyı kapatan şey artık bir süre değil, aşağıdaki **geç ödeme emniyet kuralı**: rezervasyon düşmüşken ödeme gelirse yeniden ayır ya da otomatik iade et.
  - ⚠ **WhatsApp payment link'i (15.x) bu satırdan kural devralmasın:** "link süresi = TTL" eşitliği artık yok. Link'in süresi kendi kararıdır ve o modülde verilir.
- **Geç ödeme emniyet kuralı (webhook gecikirse/tekrarlanırsa):** rezervasyon düşmüş bir sipariş için ödeme onayı gelirse sistem önce stoğu **yeniden ayırmayı** dener — ayrılabilirse sipariş normal devam eder; ayrılamazsa **otomatik para iadesi** + müşteriye bilgi mesajı. Elle karar gerekmez; dallanma `domain-core`'da tanımlıdır.
- `confirmed` yalnız ödeme onayında olur; onaya kadar sipariş `draft`'tır ama stok ayrılmıştır.

### Teslim edilememe → rezervasyon depoya çıpalıdır

Mal teslimata çıktıktan sonra kapıda teslim edilemezse **stok kapıda değiştirilmez** — mal "ayrılmış" kalır (kamyondayken kimseye kullanılabilir görünmez; aşırı-satış olmaz). Kurye kapıda sonucu işaretler:

- **Ulaşılamadı** (müşteri evde yok vb.): sipariş `ready`'ye döner, yeniden teslim denenir; mal **ayrılmış kalır**.
- **Reddedildi** (müşteri kabul etmedi): sipariş `returned`'e gider; mal depoya döner.

Rezervasyonun serbest bırakılması **yalnızca mal fiziksel olarak depoya geri girdiğinde**, tek bir depo aksiyonuyla olur: **restock** (ayrılmış → serbest, kullanılabilir artar) *veya* **imha** (hasarlı / DLC bozulmuş: fiiliden ve ayrılmıştan düş, imha işaretle). "Depodan çıktı / arabaya bindi / indi" gibi hareket takibi tutulmaz; yalnız iki fiziksel-gerçek anı (`delivered` ve iade depo girişi) stoğu değiştirir. Prepaid (online) reddedilirse otomatik iade; kapıda ödenecekse zaten tahsilat yapılmamıştır.

**Teslim-sonrası iadede varsayılan imha:** kapıda reddedilip frigo araçtan hiç çıkmamış mal restoklanabilir; ama **teslim edilmiş ve sonra iade edilen** donuk ürün, soğuk zinciri belgelenemediği için varsayılan olarak **imha** edilir — restok yalnız admin istisnasıdır ve **sebep kaydıyla** yapılır. Her imha/fire `StockAdjustment`'a yazılır (kayıp görünür olur, bkz. §12).

### Eşzamanlılık (concurrency)

İki müşteri aynı anda son birimleri sipariş edebilir. Bu yüzden stok düşürme/ayırma işlemi **atomik** olmalıdır — uygulama katmanında "önce oku, sonra yaz" değil, veritabanı seviyesinde koşullu güncelleme (ör. `update ... where available >= qty` veya bir RPC içinde kilitli işlem). Kullanılabilir stok yetmezse işlem reddedilir ve müşteriye o an bildirilir.

> Bu, blueprint'in "aynı değeri iki yerde tutma / tek kaynaktan türet" ilkesiyle uyumludur: kullanılabilir stok saklanmaz, fiili ve ayrılmıştan türetilir.

### Rezervasyon ↔ ödeme sırası

- **Online ödemede** (web / WhatsApp): kural **"önce ayır, sonra tahsil et."** Stok atomik olarak ayrılır, *sonra* tahsilat başlar. Ayrılamazsa ödeme **hiç başlamaz** — müşteriden karşılığı olmayan tahsilat yapılmaz, "önce çektik sonra stok yoktu" durumu imkânsızdır. Bu sıra `domain-core` sözleşmesidir (rezervasyon → ödeme), uygulama katmanında ters çevrilemez.
- **Kapıda ödemede** (nakit / kart / çek): rezervasyon yine `confirmed`'de yapılır; tahsilat teslim anındadır, sonra gelir — sıra sorunu doğmaz.

### DLC / DDM, raf ömrü ve FEFO

- Her stok partisinin **son tarihi** ve **tipi** tutulur. Tarih tipi ürün bazında: `DLC` (güvenlik — geçince satılamaz) veya `DDM` (kalite — geçince satılabilir). Varsayılan `DDM` (donukta yaygın), üründe değiştirilebilir.
- **Kalan raf ömrü %** türetilir: (son tarih − bugün) ÷ ürünün toplam raf ömrü. Kararlar mutlak günle değil bu yüzdeyle verilir.
- **FEFO:** hazırlıkta önce süresi dolan çıkar. (Rezervasyon ürün-toplamı seviyesinde; parti seçimi hazırlıkta.)
- **Yaklaşan son tarih:** kalan % parametrik eşiğin (varsayılan **%25**) altına inince sistem uyarır ve indirim/hediye/öne çıkarma **önerir** — karar insanın. DDM geçmiş ama satılabilir ürünler indirim/hediye havuzuna girebilir; DLC geçmiş ürün satılamaz, imha edilir.
- **MLOR (girişte kabul):** tedarikçiden gelen partinin kalan raf ömrü parametrik eşiğin (varsayılan **%75**) altındaysa sistem uyarır. Aynı ölçüt müşteriye söz verilen tazelikte de kullanılır.

> Parametrik varsayılanlar (yaklaşan eşik %25, MLOR %75) piyasa standardına göre konuldu; `Setting`'ten değiştirilir.

---

## 5. Fiyat kuralları

- **Fiyat sabitleme anı = checkout başlangıcı** (karar 27.07). Sipariş boyunca o fiyat korunur; sonradan fiyat değişse bile **verilmiş sipariş etkilenmez**. Sepetteki fiyat **bağlayıcı değildir**: gösterim ve değişiklik tespiti içindir.
  - *Neden sepet değil:* sepet sunucuda kalıcıdır ve aylarca bekleyebilir. Sepet fiyatını süresiz dondurmak, tedarikçi maliyeti oynayan donuk gıdada doğrudan zarardır; fiyat düşmüşse de müşteriye fazla ödetir. Piyasa normu da budur (Amazon ve market e-ticaretinde bağlayıcı fiyat sipariş/checkout anındakidir); FR tüketici hukuku açısından belirleyici olan **onay adımında gösterilen tutardır**, sepetteki değil. Sessiz zam sorundur, bildirilmiş zam değil.
  - *Tek pencere:* checkout başlarken stok ayrılır ve 30 dk'lık pencere açılır (§4). **Fiyat da aynı anda sabitlenir** — stok ve fiyat tek ve aynı pencerede yaşar, ayrı bir süre/cron/kavram yoktur. (Ödeme oturumunun aynı anda sona ermesi kuralı 03.08'de düştü: `PaymentIntent`'in son kullanma tarihi yok — bkz. §4.)
  - *Değişiklik davranışı:* fiyat **arttıysa** müşteriye açıkça bildirilir ve onay istenir (kabul et / sepetten çıkar); **düştüyse** sessizce uygulanır — müşteri lehine olan sorulmaz.
  - *Tükenen teklif partisi aynı akıştan geçer:* near-expiry indirimi **partiye** aittir (indirimin sebebi o partinin tarihidir), başka partiye taşınmaz. Çıpalı parti checkout'a kadar tükenmişse kalem sessizce normal fiyata dönmez — aynı bildirim/onay akışıyla normal fiyat teklif edilir (bkz. §4 batch-pinned, §5 teklif çakışması).
- **B2B fiyatı** ayrı liste; ayrıca **müşteriye özel fiyat** olabilir.
- **B2C fiyatı** ayrı.
- Fiyatlar arası ilişki (perakende fiyatının toptan müşteriyi rahatsız etmemesi) bir iş kararıdır; sistem farklı fiyat seviyelerini destekler, politikayı admin belirler.
- KDV oranı ürün bazında (donuk gıda %5,5; bazı ürünler %20).

### KDV ve sınır ötesi (müşteri-yüzü doğru, beyan muhasebede)

Muhasebe programı değiliz; beyan/OSS/VIES-yönetimi muhasebenindir. Ama KDV **müşterinin ödediği fiyatı** değiştirdiği için checkout'ta doğru uygulanır:

- **Yurt içi (FR) ve FR müşteri:** Fransız KDV'si (ürün oranından).
- **Alman B2B + geçerli vergi no:** **reverse charge** — %0 KDV, müşteri kendi ülkesinde beyan eder; faturada "Autoliquidation" ibaresi. Vergi no alınır ve VIES açık API'siyle doğrulanır (`Customer.vat_number`, `vat_number_valid`). `vat_treatment = intra_eu_b2b_reverse_charge`.
- **Alman B2C:** şimdilik Fransız KDV'si. AB kuralı: Almanya'ya tüketici satışı yıllık **10.000 €** eşiğini aşınca Alman KDV'si + OSS gerekir — **eşik aşılana kadar bizi ilgilendirmez** (fiyatı ancak o zaman değiştirir); aşılırsa o an ele alınır. Sistem DE'ye giden B2C ciroyu (`Order.delivery_country`) yıl bazında türetip izler; parametrik eşiğe yaklaşınca **uyarır**.
  - ⚠ **Depo ağı uyarısı (01.08):** bu eşik yalnız **uzaktan satış** kuralıdır. Almanya'da depo açılırsa DE deposundan DE müşterisine satış **yerel satış** olur — eşik hiç işlemez, Alman KDV'si ilk günden gerekir ve yanlış kesilen KDV geriye dönük düzeltilemez. DE deposu açılmadan önce mali danışmana sorulacak (bkz. §17).
- Her siparişe **KDV işleme tipi** (`vat_treatment`) yazılır ve export'a girer; muhasebe doğru beyanı bundan yapar.

Kısaca: müşteri-yüzü doğru KDV = bizim işimiz (fiyat); beyan/OSS/iade = muhasebenin, biz temiz veriyi veririz.

### Fiyat tabanı: B2C dahil (TTC), B2B hariç (HT)

`Price.amount` **kanalın tabanında** saklanır: B2C satırları KDV **dahil**, B2B satırları KDV **hariç**. Fransız piyasa alışkanlığı budur — tüketici etiketi TTC görür, işletme müşterisi HT konuşur; DE B2B reverse charge (%0) da doğrudan HT tabanına oturur.

- Fiyat motoru iki yöne de çevirir; **çevrim yalnız gösterim içindir**, saklanan değer kanal tabanıdır.
- `OrderItem.unit_price` siparişin kanal tabanında sabitlenir; `vat_rate` kalemde durur, `Order.total` aynı tabandadır. Fatura/export tabanı belirsiz kalmaz.
- Para **tamsayı cent** olarak hesaplanır (kayan nokta yok); yuvarlama kuralı `STACK §8`'de.

### Fiyat çözüm sırası

Bir müşteriye ürünün **birim fiyatı** şu sırayla belirlenir (ilk bulunan kazanır):

1. **Müşteriye özel ürün fiyatı** (varsa) — o müşteri+varyant için elle girilmiş `Price` satırı (customer_id dolu).
2. **Kanal fiyatı** — B2B veya B2C liste fiyatı.

- Giriş yapmamış ziyaretçi B2C fiyatını görür. Ürünün ilgili kanalda fiyatı yoksa satışa kapalı görünür.
- **Şirket kaydı onaylanana kadar B2C fiyatı geçerlidir** (`b2b_approved=false` → kanal `b2b` olsa da perakende fiyat çözülür; gerekçe §10: toptan liste doğrulanmamış kayda açılmaz).
- **`Customer.discount_percent` bu sıraya girmez** — o bir *indirimdir*, fiyat değil; kupon/kampanyayla aynı havuzda değerlendirilir (aşağıda "İndirim ve kupon").
- **Near-expiry teklif çakışması — müşteri lehine:** üründe hem açık teklif hem müşteriye özel fiyat varsa **düşük olan** uygulanır. Teklif kazanırsa miktar tavanı ve batch-pinned rezervasyon devreye girer; özel fiyat kazanırsa normal (ürün-toplamı) rezervasyon yürür, tavan yoktur. Özel fiyatlı B2B müşteri kendi anlaşmasından pahalıya almaz.

> **Özel fiyatın teknik yükü düşük:** genel indirim tek alan; ürün-bazlı istisna yalnızca gereken yerde bir satır (her ürüne satır gerekmez). Tek maliyet: fiyat "herkese tek sayı" değil, giren müşteriye göre çözülür — zaten B2B/B2C'de öyleydi.

### Kapıda/elle satışta pazarlıklı fiyat (tek seferlik)

Toptanda "bugün 10 koli alırsan şu fiyat" gündeliktir; kalıcı `Price` satırı bunun yanlış aracıdır.

- Yalnız `order_source=door/manual` siparişlerde ve yalnız **yetkili** (admin) kullanıcıda: kalem fiyat alanı liste fiyatıyla **dolu gelir**, pazarlık varsa üstüne yazılır. Pazarlık yoksa hiçbir ek adım yok. **Kurye fiyat değiştiremez** — fiyat sipariş oluşurken bellidir.
- **İz kaydı:** kim değiştirdi, liste fiyatı neydi, ne girildi — "kapıda toplam ne kadar pazarlık indirimi verdim" raporu türetilir.
- **Marj uyarısı engellemez:** girilen fiyat hedef marjın altındaysa mevcut uyarı gösterilir, işlem engellenmez (karar satıcının).
- Aynı müşteriye sürekli aynı özel fiyat veriliyorsa doğru araç **müşteriye özel fiyat**tır (yukarıdaki çözüm sırası).

### Maliyet ve hedef marj

- Her stok partisinin alış fiyatı (`Stock.purchase_price`) tutulur.
- **Fiyat kararının maliyet tabanı = YENİLEME MALİYETİ** (son alış fiyatı; hiç parti yoksa tedarikçi eşlemesindeki son alış). Soru "depoda ne duruyor" değil, **"bunu yeniden almak kaça"**: elde kalmış ucuz eski parti yüzünden fiyatı düşürürsek stok bitince zam yapmak zorunda kalırız; pahalı bir partinin parasını rafın fiyatından geri almaya çalışırsak mal hiç satılmaz. **Kötü alımın parası zaten harcanmıştır** (batık maliyet) ve onun görüneceği yer rapordur: gerçek kâr, sipariş kapanışında SATILAN PARTİNİN kendi maliyetinden hesaplanır.
- **Aykırı freni:** son alış, kendinden önceki alımların **ortancasından** %25'ten fazla saparsa otomatik fiyat o boyda **durur** ve ekran sebebini yazar. Gerçek bir zam da olabilir, tek seferlik/acil bir alım da; ikisini ayıran bilgi sistemde yok, admin'de var. Ortanca (ortalama değil) seçildi: ortalama, ölçmeye çalıştığımız aykırılığın kendisinden etkilenirdi. Eşik ve pencere parametriktir.
- **Ekran ve motor AYNI tabanı kullanır.** Ayrılsalardı, sistemin kendi yazdığı otomatik fiyat, ekranın marj hesabına göre "marj-altı" görünebilirdi.
- Ürüne bir **hedef kâr marjı** (`Product.target_margin_percent`) yazılabilir — maliyet üzerine markup (ör. maliyet 10€, hedef %40 → hedef fiyat ≥ 14€).
- **Otomatik fiyatlandırma kapalıysa** (varsayılan): maliyet artıp mevcut satış fiyatı hedef marjın altına düşerse sistem **uyarır** ("şu ürün marjın altında") — son kararı admin verir.
- **Otomatik fiyatlandırma açıksa** (`Product.auto_price=true`): sistem fiyatı hedef marjı sağlayacak şekilde **otomatik günceller** (uyarı yerine aksiyon).
- Tek mekanizma, ürün başına bir düğmeyle iki davranış: elle kontrol (uyar) ya da otomatik (güncelle).

**Otomatik fiyatın kuralları** (üç tetik — mal kabulde maliyet değişimi, anahtar/hedef değişimi, elle toplu hizalama — hepsi aynı hesaba iner):

- **İki yönlüdür:** maliyet artınca fiyat yükselir, düşünce iner. Tek yönlü olsaydı "otomatik" ürün zamanla hedefin üstüne demirler, indirimi de admin'in elle kovalaması gerekirdi.
- **Yuvarlama 5 kuruşa ve YUKARI.** Aşağı yuvarlamak hedefi kılpayı ıskalar ve ürün, otomatik olduğu hâlde marj-altı uyarısına düşerdi — sistemin kendi kuralını bozması. Adım parametriktir.
- **Fiyatı olmayan kanal AÇILMAZ.** Fiyat satırının yokluğu "o kanalda satışa kapalı" demektir; otomatik hesap kapalı kanalı kendiliğinden açsaydı ürün, kimsenin kararı olmadan toptan listesine düşerdi.
- **Maliyet yoksa fiyat uydurulmaz:** elde alış fiyatlı parti yoksa ürünün fiyatı olduğu gibi kalır.
- **Anahtar kapatılınca fiyata dokunulmaz:** son otomatik fiyat, ürünün geçerli fiyatıdır ("eski elle fiyata dön" diye bir kayıt yoktur).

### İndirim ve kupon

- **İki tetik:** **kupon** (müşteri kod girer, daima **sepet** düzeyi) ve **otomatik indirim/kampanya** (kod yok; kapsam = sepet / kategori / koleksiyon). Yüzde veya sabit tutar.
- **Bir kuponun BİRDEN ÇOK kodu olur ve hepsi aynı kotayı paylaşır** (`DiscountCode`, karar 29.07). Sebep dildir: "HOSGELDIN" Türk müşteriye bir şey anlatır, Fransız'a hiçbir şey — aynı kampanya "BIENVENUE" ve "WILLKOMMEN" ile de açılabilmeli. Bunlar üç ayrı kampanya DEĞİLDİR: koşul, değer, tarih ve **kullanım tavanı tektir**; ayrı kural açmak "toplam 100 kullanım" sınırını sessizce 300 yapardı. Kod harf ayrımsız ve **tüm kurallar arasında tekildir** — müşterinin yazdığı kod tek bir kuralı göstermeli. Hangi kapıdan girildiği kullanım kaydına yazılır (`discount_use.discount_code_id`): kotayı bölmez, "hangi dil karşılık buldu" sorusunu yanıtlar.
- **Üst üste binmez:** birden çok indirim uygun olsa bile **en büyüğü** uygulanır (birleşmez); domain-core müşteriye en iyi tekini seçer.
- **Müşterinin genel indirim oranı da bu havuzdadır** (`Customer.discount_percent`): kupon/kampanya ile karşılaştırılır, yalnız büyük olan uygulanır — istiflenmez. Gösterim: müşteri ürün sayfasında kendi oranı uygulanmış fiyatı görür (B2B "benim fiyatım" beklentisi); sepette daha büyük bir kupon girilirse motor onu seçer ve müşteri oranını **kaldırır**, sepet özeti hangisinin uygulandığını tek satırda yazar.
- **Paketler hariç:** `Bundle` fiyatı sabittir — hiçbir genel indirim/kupon uygulanmaz. Near-expiry teklif satırı da kendi özel fiyatındadır; genel indirim binmez.
- **Koşullar (parametrik):** asgari sepet, ilk sipariş, geçerlilik tarihi, kullanım sınırı.
- Uygulanan indirim siparişe yazılır (`Order.discount_id` + `discount_amount`); net tutar para hareketine yansır, kâr buna göre türetilir.
- **Kalemlere dağıtım:** sepet düzeyi indirim sipariş anında kalemlere **oransal dağıtılır** (`OrderItem.line_discount_amount`) — kısmi karşılamada iade tutarı ve kalem KDV'si **indirimli birim fiyattan** hesaplanır; sonradan hesap belirsizliği kalmaz.

### Partiye bağlı indirimli teklif (near-expiry)

Son tarihi yaklaşan bir stok partisi indirimli satışa çıkarılabilir. Bu, ürünün normal fiyatını değiştirmez; **o partiye bağlı ayrı bir tekliftir** (`Stock.offer_price`).

- Sistem, kalan raf ömrü % eşiğin (varsayılan %25) altına inen partiyi işaretler ve indirim **önerir** (önerilen indirim varsayılan %30, parametrik). **Son fiyatı ve kararı admin verir** — depo fiyat görmediği için bu bir admin işidir (§2).
- Teklif açıkken ürün müşteriye **tek fiyatla** (indirimli teklif) gösterilir — normal fiyat ve teklif fiyatı **aynı anda gösterilmez** (kafa karışmasın).
- Müşteriye özel fiyatla çakışırsa **düşük olan** uygulanır (bkz. "Fiyat çözüm sırası").
- **Miktar tavanı:** müşteri teklif fiyatından **partide kalan miktardan fazlasını alamaz.** Fazlası bir sonraki (normal fiyatlı) partiye taşacağı için engellenir.
- **Batch-pinned rezervasyon:** teklif satırının rezervasyonu **tam o partiden** yapılır (normal satışın ürün-toplamı seviyesinden farklı). Sipariş kalemi bağlı partiyi tutar (`OrderItem.stock_id`).
- Parti tükenince teklif otomatik kalkar, ürün normal fiyatına döner.
- Kapsam: teklif, son tarihi yaklaşan (henüz geçmemiş) partiler içindir; ayrıca **DDM'i geçmiş ama satılabilir** partiler de dahil edilebilir. **DLC'si geçmiş parti satılamaz** (§4).

---

## 6. Teslimat ve minimum sepet

> **Depo ağı (01.08):** bölge tek depoya bağlanır; posta kodu → bölge → depo zinciri, karma sepet
> ve kargo dolgusu kuralları §17'de.

- **Rota içi:** müşteri beklemeyi kabul eder, teslimat ücretsiz, kapıda ödeme mümkün.
- **Rota dışı:** kargo.
- **Ürün teslimat izni:** bazı ürünler soğuk zincir nedeniyle kargoyla gönderilemez (`Product.shippable=false`) — yalnız rota-içi kapı teslimi. Böyle bir ürün rota-dışı (kargo) siparişte **görünmez/eklenemez**; sepette varsa müşteri kargo adresi seçemez, yalnız rota-içi teslim sunulur.
- **Minimum sepet:** bir alt sınır olabilir, ama **parametrik** — kod sabiti değil, admin ayarı. Kanala/bölgeye göre farklı olabilmeli. (Blueprint STACK §10: işletme ayarı env'e/koda değil, ayar tablosuna girer.)
  - **YALNIZ KAPIYA TESLİMDE** (kullanıcı kararı 10.08). Alt sınır bir **lojistik tabandır**: aracın o tura çıkması anlamlı olsun diye konur. **Kargo siparişinde uygulanmaz** — araç çıkmaz, taşıyıcı gider ve ücretini müşteri zaten öder; küçük siparişin ekonomik freni de zaten oradadır (ücretsiz kargo eşiğinin altında ücret doğar). Aynı sepete iki fren koymak müşteriden iki kez istemektir.
  - **Kanal satırı bunun istisnası ve her yolda geçerli:** `channel: b2b` alt sınırı toptan fiyat vermenin karşılığıdır — **ticari şarttır, mesafeyle ilgisi yoktur.** Toptancı kargoyla alsa da doldurur.
  - Kural **kodda zorlanır, veriyle değil** (`packages/application/src/cart/min-basket.ts`): kargo yolunda ayar yalnız kanal kapsamından okunur (`only: ['channel']`), küresel satır bile sayılmaz. Kapsam düşürmek yetmiyordu — küresel satır her zaman eşleşir, yani operatör küresel bir eşik yazdığı gün kargo siparişleri sessizce ona takılırdı. **Kimsenin vermediği bir kararın oluşabildiği yol kapatıldı.**
  - Bu güvence sayesinde taban **küresel satıra** yazılabiliyor (bölge bölge tekrarlanmadan); bölge satırı yalnız gerçekten farklı bir tur için gerekir.
- **Ücretsiz kargo eşiği:** parametrik.
- **Kargo ücreti:** eşik altı siparişte müşteriden alınan ücret `Order.shipping_fee`'ye yazılır ve **KDV'ye tabidir**; `total` bu ücreti içerir. Tam iptalde ücret de iade edilir; kısmi eksikte varsayılan olarak iade edilmez (teslimat yapılmıştır).
- Faz 1'de rota kapasitesi ve zaman penceresi **yok** (Faz 2); sadece içerideyim/dışarıdayım ayrımı.

### Rota bölgeleri ve teslimat günü

- **Rotalar admin tarafından düzenlenir:** her rota bölgesi (`DeliveryZone`) bir posta kodu kümesi + haftalık teslimat günleri tutar; ikisi de admin-editable (kod sabiti değil). Sınır ötesi (DE/Baden) posta kodları da bir bölgeye dahil edilebilir (ADR-002).
- **Rota-içi/dışı** adresin posta kodunun aktif bir bölgeye düşüp düşmemesinden **türetilir**.
- **Checkout'ta gün:** bölgenin günlerinden yaklaşan somut tarih(ler) hesaplanır — **tek gün varsa gösterilir (seçim yok); birden fazla varsa müşteri birini seçer.** Seçilen/atanan gün `Order.delivery_date`'e yazılır.
- Günün rota listesi türetilir: `delivery_date`'i o gün olan siparişler. Kapasite/optimizasyon Faz 2.
- **Sipariş kesim saati (cut-off, parametrik):** kesim saatinden sonra gelen sipariş **bir sonraki** rota gününe yazılır; checkout'taki tarih hesabı bunu kullanır. Araç yüklenirken gelen sipariş o günün rotasına düşmez — sabah kavgası biter.

### Teslim onayı ve teslimat özeti (bon de livraison)

"Eksik geldi" ihtilafının tek sigortası teslim anındaki kanıttır. Resmî belge kararına dokunmaz — bu bir **operasyon belgesi**dir, fatura değildir (üstünde ibaresi vardır).

- **Dijital teslim onayı:** kurye ekranında teslimatta kalem listesi çıkar; müşteri ekranda **imzalar** (veya kurye foto çeker). Onay siparişe kaydedilir (`Order.delivery_proof`: kim, ne zaman, imza/foto).
- **Kapsam parametrik:** B2B'de **zorunlu** (varsayılan), B2C'de **kapalı** (varsayılan) — `Setting`'ten değiştirilir.
- **Teslimat özeti (PDF):** teslimde, e-postası olan **tüm müşterilere otomatik** gönderilir (parametrik, varsayılan açık). Kurye isterse aynı PDF'in **çıktısını alıp elden de verebilir**. İçerik: kalemler + karşılanan miktarlar + `reference_no`; "resmî fatura değildir" ibaresi.

---

## 7. Ödeme ve kasa mutabakatı

Üç para havuzu ayrı izlenir:

1. **Online** (kart) — ödeme sağlayıcı üzerinden.
2. **Kapıda** — nakit / kart / çek. Kurye toplar.
3. **Banka** — hesap hareketleri Excel ile içe alınır.

> **Depo ağı (01.08):** her depo aynı zamanda bir kapıda-tahsilat kasasıdır — depo başına ayrı
> `Account` satırı açılır, model değişmez; merkeze aktarım hesaplar arası harekettir (§17).

### Checkout ödeme seçenekleri (bağlama göre)

| Müşteri / teslimat | Seçenekler |
| --- | --- |
| Rota-içi B2C | Online öde / Kapıda öde (nakit/kart/çek) |
| Kargo (rota-dışı) B2C | Sadece online öde (peşin) |
| B2B (credit yok) | Online öde / havale (peşin) |
| B2B (credit var) | + Hesaba (vadeli) |

Online: Stripe **PaymentElement + `PaymentIntent`** (SCA/3DS, kart + Apple/Google Pay) — kart alanı bizim sayfamızda, müşteri siteden çıkmıyor. (Hosted checkout'tan geçildi; gerekçe `ARCHITECTURE_DECISIONS`.) WhatsApp'ta payment link (canlı kanalla). Kapıda ödeme ayrıca değer tavanı ve `cod_allowed`'a tabidir (aşağıda).

### Kapıda ödeme sınırı (kötüye kullanım önlemi)

Kapıda ödeme tüm rota-içi müşterilere sunulur, ama peşin taahhüt olmadığı için sınırsız bırakılmaz:

- **Değer tavanı (parametrik `Setting`):** kapıda ödeme yalnız sipariş toplamı tavana kadar mümkün; üstü **online peşin** ister. "Tüm ürünleri sipariş edip kapıda öderim" senaryosunu otomatik keser; normal siparişler tavanın altında kalır, kimse takılmaz. Tavan değeri işletmeye göre admin ayarı.
- **Müşteri bazlı kapı (`Customer.cod_allowed`, varsayılan true):** geçmişte ödememiş / tekrar tekrar reddetmiş müşteride kapıda ödeme kapatılır (admin veya no-pay olayında). Tekrar eden art niyeti engeller.
- **Nakit yasal sınır uyarısı (yöntem bazında, parametrik):** Fransa'da mukim müşterinin işletmeye **nakit** ödemesi yasal olarak ~1.000€ ile sınırlıdır. Kapıda nakit tahsilat bu sınırı aşarsa sistem **uyarır ama engellemez** (karar sahada; kart/çek ayrı değerlendirilir). Kurye gün kapanışı zaten yöntem bazında toplar — model değişikliği yok.
- Amaç: normal kullanıcı hiçbirine takılmaz, art niyetli hem tavana hem bloğa takılır.

### Kurye gün kapanışı

Kurye gün sonunda sistemde kapanış yapar: teslim ettiği siparişler, tahsil ettiği tutar (yöntem bazında), iadeler. Kasaya teslim eder. Sistem beklenen ile teslim edileni karşılaştırır; fark aynı gün görünür.

### Sipariş ödeme durumu

Her siparişin ödeme durumu **ayrı bir eksendir** ve **türetilir**: `amount_collected` − `amount_refunded` (net) ile karşılanan tutar karşılaştırılarak `pending/paid/partial/refunded` domain-core'da hesaplanır — elle set edilmez (bkz. `DATA_MODEL.md` Kalıcı kararlar). Ödeme yöntemi ve anı siparişe yazılır.

**Karşılanan tutar** = Σ `fulfilled_qty` × (birim fiyat − o miktara düşen indirim payı) [+ kargo ücreti]. Kurallar:

- **`partial` para eksenidir** — net, karşılanandan az demektir. "Sipariş eksik karşılandı" ayrı bir eksendir (`fulfilled_qty`) ve bu alana karışmaz: 2 adet sipariş edilip 1 adet gitmişse ve o 1 adedin parası ödenmişse durum **`paid`**'dir, borç yoktur.
- **Fazla tahsilat yeni durum açmaz** — durum `paid` kalır, fark **iade borcu** olarak türetilir ve panelde "iade bekliyor" görünür. Enum dört değerde kalır.
- **Kargo ücreti:** hiçbir kalem gitmediyse (Σ `fulfilled_qty` = 0) kargo hizmeti de verilmemiştir → karşılanan tutara girmez, iade edilir. En az bir kalem gittiyse iade edilmez.
- **İade** kalem bazından türer: iade edilen kalemin `fulfilled_qty`'si düşünce karşılanan kendiliğinden iner. **İstisnası jest iadesi** (`return_disposition='goodwill'` — "ürün sizde kalsın"): mal müşteride kaldığı için miktar düşmez, ama net 0'a indiği için durum yine `refunded` olur (bkz. §8).
- **İptal edilen siparişte karşılanan 0'dır** — tahsil edilmişse tamamı iade borcudur.

### B2B vadeli satış (hesaba) — istisna, varsayılan değil

- **Varsayılan peşin.** Hem B2C hem B2B siparişleri kural olarak peşin ödenir (online / kart / nakit / çek / havale). Vadeli tahsilat operasyonel olarak dertli olduğu için **standart değildir** — ilke: "ödeyebilen alır."
- **Vade bir müşteri yetkisidir, elle açılır.** `Customer.credit_enabled` yalnızca güvenilen müşteride admin tarafından açılır (varsayılan **kapalı**). Kapalıysa o müşteri vadeli sipariş veremez; checkout'ta yalnızca peşin yöntemler görünür.
- **Vadeli sipariş akışı:** sipariş `on_account=true` işaretlenir; peşin ödeme olmadan `confirmed` olur (stok yine `confirmed`'de ayrılır — "önce ayır" kuralı bozulmaz), `payment_status` `pending` kalır; sonra **banka havalesiyle** ödenir ve banka import eşleştirmesinde `paid` olur (bkz. §9).
- **Limit ve vade süresi — müşteri bazında:** her müşterinin **kendi** limiti vardır (`Customer.credit_limit`, €) — tek genel limit yoktur; güven müşteriden müşteriye farklıdır ve admin limiti **her an değiştirebilir**. **Vade süresi** de müşteri bazında `payment_term_days` (girilmezse varsayılan 30 gün — sektör standardı, `Setting`'ten parametrik). **Açık bakiye ve gecikme saklanmaz, türetilir**: açık bakiye = ödenmemiş `on_account` siparişlerin toplamı; gecikmiş = vade süresini aşmış ödenmemiş sipariş.
- **Otomatik fren:** açık bakiye + yeni sipariş limiti aşarsa **veya** gecikmiş sipariş varsa, checkout'ta "hesaba" seçeneği o müşteriye kapanır — diğer (peşin) yollar açık kalır. Limit aynı zamanda **stok kilitleme sigortasıdır**: vadeli rezervasyonun toplam değeri limiti aşamaz.
- **Onay mekanizması:** limit içinde **otomatik** onay (limit, önceden verilmiş onaydır — B2B hızı bozulmaz); limit aşan vadeli sipariş otomatik reddedilmez, **admin'e düşer** — tek seferlik onay veya kalıcı limit artışı admin kararıdır.
- **Limit kararı insanındır, sistem karne gösterir:** limit puana/skora göre otomatik belirlenmez ("ödül ≠ güven", §14). Sistem karar anında müşterinin **ödeme karnesini** türetip gösterir (toplam ciro, ortalama ödeme günü, gecikme sayısı) — öneri sistemden, karar admin'den (kısmi karşılamayla aynı ilke, §8).

---

## 8. İade ve hasar

Kurallar birlikte netleşecek (iş kararı), ama sistem şunları desteklemeli:

- Müşteri "bozuk/eksik geldi" bildirimi
- **Para iadesi** — online Stripe'tan, nakit kuryeyle. Muhasebe açısından para iadesi daha temiz (gerçek, simetrik hareket, KDV temiz döner). **Mağaza alacağı (store credit) belki gelecekte** — faza sabitlenmedi, muallak; gelirse taşınan borç + avoir/KDV takibi gerektirir.
  - **Sıra tersine çevrilemez (karar 30.07 — 07.11): önce sağlayıcı çağrısı, sonra hareket.** Ters sırada başarısız bir iade defterde kapanmış görünür, para dönmemiş olur — ve hiçbir ekranda iz bırakmaz. Çağrı düşerse hareket hiç yazılmaz, borç açıkta kalır ve **sebebiyle** operatöre söylenir; sessizce sıfır iade dönmek "borç yoktu" ile aynı görünürdü.
  - **Yol hesabın TÜRÜNDEN çıkar, ödeme yönteminden değil.** Kartla ödenmiş bir siparişi operatör kasadan nakit iade etmeyi seçebilir; o zaman sağlayıcıya gidilmez. Ödeme yöntemine bakan bir dallanma, operatörün kararını sistemin yerine vermek olurdu.
- **İade edilen mala ne olduğu üç yoldan biridir** (`OrderItem.return_disposition`) — para tarafı üçünde de aynı (iade hareketi), ayrışan stok ve maliyet:
  - `restock` — mal depoya girdi, tekrar satılabilir (kapıda reddedilip frigo araçtan hiç çıkmamış mal).
  - `discard` — mal döndü ama satılamaz. **Kaybın nerede sayılacağı malın fiilen çıkıp çıkmadığına bağlıdır** (07.9): teslim edildiyse fiili stok o an düşmüştür, ikinci kez düşülemez — maliyet `OrderItemBatch` kaydında kalır ve o siparişin kârında görünür. Hiç çıkmadan bozulduysa (araçta) fiiliden burada düşülür + imha kaydı (`StockAdjustment`) yazılır. Teslim edilmiş donuk üründe **varsayılan** budur (soğuk zincir belgelenemez).
  - `goodwill` — **mal müşteride kaldı**: "paranızı iade ettik, ürün sizde kalsın". Stok ve `fulfilled_qty` **değişmez**; mal tüketilmiştir, maliyeti kayıtlarda kalır ve kâr raporunda **jest gideri** olarak görünür. `fulfilled_qty`'yi düşürmek burada YANLIŞTIR — malın hiç gitmediğini söyler, stok ve COGS bozulur.
- İade/hasarın kâr ve kasa mutabakatına yansıması

Bu alan Faz 1'de temel haliyle bulunur; detay kuralları parametrik ve genişletilebilir tasarlanır.

### Eksik ürün / kısmi karşılama

Sipariş kalem-kalem karşılanabilir (all-or-nothing değil). Eksik iki noktada keşfedilir:

- **Hazırlıkta (depo):** hazırlayan eksik/karşılanamayan kalemi işaretler (`OrderItem.fulfilled_qty` düşer). **Kararı hazırlayan verir:** (i) müşteriye sor — "kalanı göndereyim mi / iptal mi?" — ya da (ii) kalanı gönder + farkı otomatik iade. Sistem **akıllı bir öneri** sunar (eksiğin değeri/kritikliğine göre) ama **son karar hazırlayanda**.
- **Kapıda (kurye):** kurye o an eksik/reddedilen kalemi işaretler.

**Para çözümü ödemenin yapılıp yapılmadığına göre dallanır:**
- **Peşin ödendiyse** (online/kargo) → fark **otomatik iade** (`amount_refunded` artar).
- **Kapıda ödenecekse** → tahsil edilecek tutar karşılanan tutara **düşürülür**, o tahsil edilir.

Ödeme durumu bu tutarlardan **türetilir** (§7). Karşılanamayan kalemin ayrılmış stoğu, stok gerçeğine göre düzeltilir (fiziksel yoksa ayrılmış geri bırakılır — bkz. §4).

---

## 9. Ön muhasebe sınırı

- Sistem **resmî muhasebe değildir**, e-fatura kesmez; **hiçbir resmî belge (fatura, avoir vb.) sistemde üretilmez** — müşteri faturasını muhasebe tarafından alır, sitede fatura indirme yoktur.
- Yaptığı: dış muhasebe yazılımına gidecek veriyi temiz üretmek (export) ve o veriden iş rakamları çıkarmak.
- Resmî fatura numarası dış yazılımda üretilir; sistem bir **referans numarası** verir, sonradan gerçek fatura numarasıyla eşleştirilir.
- Banka hareketleri Excel ile alınır, sipariş/alımlarla eşleştirilir (öneri + elle onay; tam otomatik değil).

### Para hareketleri, hesaplar ve satın almalar

Tüm finans tek mantıkla: **para bir hesapta durur, hareketlerle girer/çıkar.**

- **Hesap:** paranın durduğu yer — Kasa (nakit), bankalar (Revolut, Crédit Mutuel), Stripe. Kasa da banka gibi bir hesaptır; "online" ayrı havuz değil, **Stripe hesabıdır**. Nakit şirkette durabilir, bankaya yatırmak zorunlu değil.
- **Para hareketi (tek tablo):** her giriş/çıkışın bir **hesabı** ve **tipi** var — sipariş ödemesi, gider, satın alma, transfer (hesaplar arası: nakit→banka, Stripe→banka payout), sermaye girişi, sair. Kasa hareketi ile banka hareketi **aynı şeydir**, yalnız hesabı farklı.
- **Satın alma / gider:** giderler bu hareketlerin bir tipidir. **Stok alımı** olan gider ayrıca bir **stok girişi** (`StockIntake` → partiler + maliyet) oluşturur; diğer giderler (kira, akaryakıt, maaş) yalnız hareket + kategoridir.
- **Reklam gideri kampanya etiketiyle girer:** `category=advertising` + `meta.campaign` — analitik, kampanyanın **cirosunu ve giderini yan yana** koyar; gerçek ROI Excel'e taşınmaz.
- **Banka import (AI):** AI ajanı banka dosyasından sütun şablonunu çıkarır (`BankImportProfile`), satırlar hesabın para hareketleri olarak girer, sonra sipariş/gider/transfer olarak eşleşir (öneri + elle onay).
- **Türetilir:** şirket kârlılığı (gelir − gider) ve her hesabın bakiyesi bu hareketlerden. Sipariş tahsilatı (yukarıdaki online/kapıda/banka toplama noktaları) buraya bir hesaba giriş olarak düşer.
- **(İleride, AI):** tedarikçi faturasından stok-giriş formunu AI hazır doldurabilir — faturalar ve form kurgulandıktan sonra ayrı ele alınır.

### Patron ikramı (hediye sipariş)

Patron bazen bir arkadaşına siparişi hediye eder; müşteri ödemez ama **parayı patron kendisi öder** — yani para yine kasaya girer. Sipariş `is_gift_order=true` işaretlenir.

- **Operasyon tam normal:** stok düşer, hazırlanır, teslim edilir.
- **İç muhasebe tam normal:** gelir, kâr, kasa ve **ortaklık paylaşımı dahil** her şeyde sayılır — parası (patron tarafından) ödenmiş gerçek bir satıştır.
- **Tek fark:** **muhasebe export'una girmez** — dış muhasebeye giden veride yer almaz; gerisi tam.
- Yani `is_gift_order` yalnızca **export filtresini** etkiler, başka hiçbir hesabı değiştirmez.

---

## 10. Kimlik ve müşteri birleştirme

Aynı kişi farklı yüzeylerden farklı anahtarlarla gelir; sistem tek müşteride birleştirir.

- **Web** kimliği: e-posta / oturum. **WhatsApp** kimliği: telefon numarası.
- WhatsApp'tan gelen sipariş/konuşmada kural: **telefonla bul-veya-oluştur.** Numara bir müşteriyle eşleşiyorsa ona bağlanır; eşleşmiyorsa taslak müşteri açılır.
- `Customer.phone` normalize edilir (E.164) ve bir kimlik anahtarı gibi davranır.
- Kanal (b2b/b2c) yine `company_info` varlığından türetilir — kaynaktan değil. WhatsApp'tan gelen bir şirket de B2B'dir.
- Bu çözümleme `domain-core`'da saf bir fonksiyondur; uygulama katmanına dağıtılmaz. Ayrıntı: `CHANNELS.md §3`.
- **E-posta ikinci kimlik anahtarıdır:** telefon *veya* e-posta eşleşirse aynı müşteridir. Yine de kopya oluşursa (WhatsApp taslağı + web kaydı) admin **"müşteri birleştir"** aksiyonuyla tekleştirir — siparişler, puanlar, konuşmalar hedef müşteriye taşınır, kaynak kayıt kapanır. Taslak müşteri `is_draft` ile işaretlidir.

### Kimlik anahtarı, çapa ve süreklilik

> Kararlar 30.07.2026, kullanıcıyla birlikte. Uygulaması `04.10`; hangi mesajın nereye yazılacağı `15`.

**Telefon ve e-posta eşit giriş yollarıdır** — biri asıl, öteki ona takılan eklenti değil. Ama arıza modları farklıdır ve tasarımın tamamı bu farkın üstünde durur:

> **Telefon kolay anahtardır, e-posta dayanıklı anahtardır.**

Telefon numaraları el değiştirir — operatörde karantina süresi dolunca yeniden dağıtılır. E-posta adresleri pratikte devredilmez. İkisi birbirinin yedeği değil, **birbirinin arıza modunun kapağıdır**.

#### Anahtar yazmak bir kimlik eylemidir

- **Doğrulanmamış numara anahtar olmaz.** Formdan gelen numara (hesap kartı, checkout) yalnız **iletişim** numarasıdır. Teslimat telefonu zaten **adrese** aittir (`address.phone`); hesabın numarası ayrı bir şeydir ve ayrım burada başlar.
- **Doğrulama "bu numarayı bugün alabiliyorum" der, "bu numaranın geçmişi benim" demez.** Zilyetlik gerçektir, bağ bayat olabilir. Kod doğrulaması bu yüzden tek başına geçmişe erişim vermez.
- **Numara kendi kaydında yaşar, kolonda değil.** Aşağıdaki kararlar numaranın ne zaman doğrulandığını, en son ne zaman görüldüğünü ve devredildiğinde **emekliye ayrıldığını** tutmayı gerektiriyor. Kolon modelinde emeklilik `null`'lamaktır — o numaranın bir zamanlar o müşteriye ait olduğu bilgisini silmek; sonra ne olduğunu kimse açıklayamaz.
  **AÇIK:** bir hesabın kaç numara taşıyacağı **karara bağlanmadı** (`04.10`). Meşru çok-numara halleri var (kişisel + işyeri, FR + TR hattı — diasporada yaygın), ama kullanıcının tereddüdü sürüyor. Kayıt yapısı iki seçeneği de taşır; karar ertelenebilir.
- **Bir numara en çok bir hesaba çıkar.** Bu ürün tercihi değil zorunluluk: gelen mesajı tek bir müşteriye çözemezsek her mesaj cevapsız bir soruya döner.

#### Çapa isteme akışı — ilk siparişten sonra

Sürtünme, kaybedecek bir şeyin olduğu ilk anda konur; "merhaba" diyen yabancıdan e-posta istemek WhatsApp'ı seçme sebebimizi bozar.

- **İlk sipariş tamamlanınca e-posta bağlama önerilir.** Kod **e-postaya** gider, müşteri **WhatsApp'tan** geri yazar. Kanıtın gücü buradan gelir: kod, doğrulanan kanaldan **başka** bir kanaldan geçer — "bu numarayı tutan kişi şu posta kutusunu da yönetiyor."
- **Aynı mekanizma, üçüncü kez:** Supabase'in mail göndermesi devre dışı, kodu biz üretip kendi kanalımızdan yolluyoruz (`admin.generateLink` + `verifyOtp`). Burada tek fark taşıyıcının Resend değil WhatsApp olması — yeni altyapı yok.
- **E-posta zaten bir hesaba aitse bu çakışma değil buluşmadır:** posta kutusunu yönetiyor olmak, web girişinde kullandığımız kanıtın aynısıdır, gücü düşmez → doğrudan o hesaba bağlanır.
- **E-posta zorunlu değildir.** Sipariş vermek için istenmez; **puanı harcamak için bir çapa aranır** (aşağıdaki güvenlik kodu da çapa sayılır). *Bu son cümle karardan türetilmiştir: devredilmiş hattın sahibi kodu da bilemeyeceği için koruma aynıdır.*
- **E-posta bir kez yazılır, sonra değişmez** (hesap kartında salt okunur). Posta kutusunu gerçekten kaybeden müşterinin yolu admin birleştirmesidir (04.7).

#### Çapa vermeyene: 6 haneli güvenlik kodu

E-posta bağlamak istemeyen müşteriye, **aynı konuşmada**, sistemin ürettiği 6 haneli bir kod verilir: *"Bunu saklayın; zaman zaman siz olduğunuzu teyit etmek için isteyebiliriz."*

- **Sır, şüphe doğmadan önce kurulur.** Dönüş anında oluşturulan bir kod hiçbir şey kanıtlamaz — karşımıza kim çıkarsa kodu o belirler ve geçmişi o devralır.
- **Kodu sistem üretir**, müşteri seçmez: seçilen 4 haneli kodların gerçek dağılımı `1234`/`0000`/doğum yılında yığılır. Sistem üretimi + 6 hane + **5 deneme tavanı** → tahmin şansı ~200.000'de 1.
- **Kod yalnız kendi numarasından geçerlidir.** Bu, kodun tek başına değerini sıfırlar: onu okuyan biri (ör. admin konuşma ekranında) kullanmak için o hattı da elinde tutmak zorundadır. Aynı özellik **oltalamayı da defeder** — dolandırıcıya yazılan kod işe yaramaz.
- **Sorgunun yönü güvenliğin tamamıdır: koddan kimliğe gidilmez, kimlikten koda gidilir.**
  Doğru: *gelen mesajın gönderen numarası → o numaraya bağlı kimlik → o kimliğin kodu eşleşiyor mu.*
  Yanlış: *girilen kod → bu kod kime ait → o hesabı aç.* İkincisi çalışır, testleri geçer ve kodu numaradan bağımsız bir anahtara çevirir.
  Sonucu iki yasak: **web formundan / admin panelinden kod doğrulanmaz**, ve **admin panelinde "kod doğrula" kutusu bulunmaz.** Telefonda arayan müşteriyi doğrulamanın yolu bu değildir (WhatsApp'tan yazması istenir ya da 04.7).
- **Çapa numaradır, `Conversation` değil.** Konuşma bizim türettiğimiz kayıttır (24s penceresi kapanınca yenilenebilir); numara taşıyıcının beyanıdır. Numaraya çapalamak zincire halka eklemez, çıkarır.
- **Bu güvenin dayanağı webhook imzasıdır** (15.7). İmzasız uç noktaya herkes istek atıp "şu numaradan geliyorum" diyebilir; o durumda geriye yalnız 6 haneyi tahmin etmek kalır. İmza doğrulaması bu kararla birlikte rutin hijyen olmaktan çıkıp **kodun üzerinde durduğu temel** hâline gelir.
- **Kod özetlenerek (hash) saklanır** — canlı DB'ye yazma yetkisi olana karşı değil (o zaten cevabı değiştirebilir), **yedek sızarsa** ortaya (numara, kod) listesi çıkmasın diye.
- **E-posta doğrulanınca kod silinir.** İki anahtar tutmanın anlamı yok; azaltmak hem sızacak yüzeyi hem anlatılacak şeyi azaltır.
- **Neyi korumadığı da yazılıdır:** telefonu eline geçiren kişiye karşı bir şey yapmaz (kodu da görür, numara da ondadır). Kapsamı **devredilmiş numaradır** — çözemediğimiz vaka tam olarak oydu.

#### Kimlik şüphesi doğduğunda

- **Kod rutin sorulmaz, tetiğe bağlı sorulur:** ~3 ay sessizlik sonrası dönüşte, ya da geçmiş/puan/kişiye özel fiyat açılmadan önce. Her konuşmada sormak müşteriyi yorar ve kodu sıradanlaştırır.
- **Boşluğun kendisi teşhis değildir.** Yılda bir bayramda sipariş veren sadık müşteri ile devredilmiş hat aynı şekli üretir. Sessizlik süresi bir **tetik**tir, karar değil — kapı olarak kullanılırsa cezalandırdığı kitlenin ezici çoğunluğu kendi müşterilerimiz olur.
- **Kimliği bilmeden ne açtığımız asıl sorudur.** Sipariş almak geçmiş gerektirmez. Kapılı olan üç yetki: **geçmişi göstermek · puanı harcatmak · kişiye özel fiyat/kupon uygulamak.**
- **Ajan geçmişi söylemez, sorar.** *"Her zamanki adrese mi göndereyim?"* sızıntının kendisidir. *"Adresinizi alabilir miyim?"* ise, verilen cevap elimizdekiyle tutarsa kimliği **müşterinin kendi beyanıyla** teyit eder — biz hiçbir şey açıklamadan.
  Ama **adres tek başına kimlik ölçütü değildir:** aynı müşteri hediye gönderiyor, iş yerine istiyor ya da taşınmış olabilir. Teyit ederse kazançtır; tutmaması suçlama sebebi değildir.
- **Doğrulanamayan dönüş zarifçe düşer:** suçlama yok, sipariş engellenmiyor. Eski kimlik emekliye ayrılır, **yeni müşteri kaydı** açılır, sipariş oraya yazılır. Eski siparişler eski kayıtta kalır — muhasebe sağlam. Müşteri itiraz ederse admin birleştirir (04.7).
- **Teslim durumu, sessizlikten GÜÇLÜ bir sinyaldir (02.08).** Taşıyıcı her giden mesaj için durum döner (`sent` · `delivered` · `read` · `failed`). `failed` bir tahmin değil, **taşıyıcının beyanıdır**: numara kapanmış ya da bizi engellemiş. O hâlde 3 aylık tetiği beklemenin anlamı yok — bağ zaten şüpheli.
  Ama ölçüt tek başına yeterli değil: `delivered` gelip okunmaması hâlâ belirsizdir (telefon kapalı, bildirim kapalı, umursamamış). Yani `failed` **erken tetik**tir, sessizlik **geç tetik** — ikisi birbirinin yerine geçmez. `sent`te kalan mesaj da hiçbir şey söylemez; ağ gecikmesi ile terk edilmiş hat aynı görünür.
- **Dönüşte çapa EZBERDEN değil, KANALDAN sorulur (02.08 · kullanıcı kararı).** Müşterinin bağlı e-postası varsa tetik anında ondan 6 hane ezberlemesini beklemeyiz: **kod yine e-postasına gider, WhatsApp'tan geri yazılır** — bağlama anındaki çapraz kanal kanıtının aynısı, bu kez dönüş anında.
  Gerekçe pratik: aylar sonra kimse 6 haneli bir kodu saklamış olmaz, ama posta kutusu hâlâ elindedir. Güvenlik özelliği aynen korunur — devredilmiş hattın yeni sahibi o posta kutusunu okuyamaz.
  **İki çapa YEDEK DEĞİL, birbirini dışlayan iki hâldir** ve bunlar iki ayrı kitledir: e-posta bağlandığında kod zaten silinir (yukarıdaki kural), yani aynı müşteride ikisi hiç bir arada bulunmaz. **6 hane, e-postasını hiç bağlamamış müşterinin TEK çapasıdır** — dönüşünde ondan başka sorulacak bir şey yoktur. "Yedek" demek, sistemin e-posta yolu tutmayınca koda düşeceğini ima ederdi; öyle bir düşüş yok.
- **Kapsam hedefi %100 değildir ve olmamalı.** Kimlik, kanıtı olmayan bir alandır: hattı devralan kişi bazen gerçekten hiçbir izle ayırt edilemez. Tasarımın iddiası vakaların ezici çoğunluğunu **sessizce** soğurmak; kalanı bir kapıya değil **insana** düşürmek (admin birleştirme, 04.7). Kalan yüzdeyi kapatmak için kurulacak her ek kapı, ödediği bedeli kendi müşterilerimize ödetir — yukarıdaki "boşluk teşhis değildir" kuralının aynısı.

#### Sipariş taşınmaz

- **`Order.customer_id` bağlandığı yerde kalır.** Fatura ve muhasebe kaydı bir telefon numarasının peşinden dolaşamaz.
- **"WhatsApp siparişlerim" bir SÜZGEÇTİR, ayrı bir hesap değil** — `order_source='whatsapp'` zaten var. Sahiplik değil mercek.
- Bu, "bağladıktan sonra gelen siparişler kimin?" sorusunu ortadan kaldırır: **hesabın; ama WhatsApp'tan geldiği yazılı.** Sahiplik zamana bağlı olsaydı destek şu cümleyi kurmak zorunda kalırdı — "bağlamadan öncekiler kalır, sonrakiler geçer" — ve kimse onu taşıyamaz.
- **Numarayı çıkarmak bir KANALI kapatır, geçmişi geri almaz.** Birleştirme geri alınamadığı için sıkı olması gereken yer öncesindeki kapıdır.
- **Puan ile sipariş ayrılamaz**, çünkü puan siparişten doğar (§14, sipariş başına puan). "Puan geçsin, sipariş kalsın" kurgusu, kaynağı başka kayıtta duran puan satırları üretir; bağ çözülünce ikisi de tutarsızlaşır.
- **Kod göndermek para harcar** (§11: template ~€0,13): bağlama akışı numara/hesap/IP başına hız sınırlıdır. Sınırsız bir uç nokta, faturası bize kesilen bir mesaj gönderme aracıdır.

### B2B self-servis kayıt ve onay kapısı

Şirket, hesabını **kendisi açar**; toptan fiyatlar **onaya kadar görünmez** (SIRET herkese açık bilgidir — numarayı giren kişinin o şirket olduğunu kanıtlamaz; fiyat listesi onaysız açılırsa rakibe açılmış olur).

- **Kayıt:** SIRET girilir → resmî kayıt API'sinden (Sirene/Annuaire des Entreprises, ücretsiz) unvan/adres/faaliyet kodu otomatik dolar; hesap anında oluşur, `b2b_approved=false`. Alman şirketleri elle doldurur + USt-IdNr VIES ile doğrulanır (muadil açık API yok).
- **Onay kartı (admin):** sistem başvuruyu hazır sinyallerle sunar — şirket **aktif mi**, **faaliyet kodu** gıda/restoran mı, **kuruluş yılı**, adres **rota uyumu**, telefon/e-posta/SIRET **mükerrer** kontrolü, tek-tık Google/Haritalar linki, `packages/ai` tek cümlelik özet ("2016'dan beri aktif restoran, rota içinde — risk işareti yok"). Tipik karar ~15 saniye; **karar insanın** (tek dokunuş onay/ret).
- Onay sonrası müşteri toptan fiyatları görür; **vade/limit yine ayrı ve elle** açılır (§7). Reddedilen kayıt B2C olarak kalabilir.

### Hesap ve doğrulama (kimlik nasıl kurulur)

- **Hesapsız sipariş yoktur.** Sipariş "misafir" akışıyla başlasa da son adımda müşteri **doğrulanmış bir kimliğe** bağlanır; her sipariş bir hesaba bağlıdır (`Order.customer_id` zorunlu). "Misafir" burada **şifre/profil sürtünmesi olmadan hızlı doğrulama** demektir — hesapsızlık değil.
- **Doğrulama yöntemleri:**
  - Önce Google (OAuth) + e-posta + OTP; WhatsApp ile giriş canlı kanal devreye girince (hepsi Faz 1).
- **Supabase Auth yalnız kimlik/oturum motorudur.** Doğrulama maili (OTP) dahil **tüm e-posta `packages/email`'den default şablonla** gönderilir (Auth "send email" hook → `packages/email`); Supabase'in yerleşik mail şablon/gönderim yapısı **kullanılmaz**.
- Hangi yoldan girilirse girilsin (Google / e-posta / WhatsApp) kişi **aynı `Customer`'da birleşir** — yukarıdaki bul-veya-oluştur ve `company_info`'dan kanal türetme kuralları aynen geçerli.

---

## 11. Mesajlaşma, servis penceresi ve opt-in (GDPR)

- **Inbound-öncelik:** "Önce müşteri yazsın." Kullanıcı-başlatan **24 saatlik servis penceresinde** mesajlar ücretsiz; bu pencere dışında işletme-başlatan mesaj Meta-onaylı **template** gerektirir (FR/DE'de pahalı, ~€0,13–0,14).
- **Utility template** (sipariş onayı, kargo bildirimi) servis penceresi içinde önceliklidir.
- **Broadcast/pazarlama** yalnızca **double opt-in** ile, seyrek ve segmentli (Faz 2). Opt-in durumu ve pencere bitişi `Conversation`'da bizde tutulur (bkz. `DATA_MODEL.md`).

### Pazarlama izni — toplama gönderimden önce başlar

İzin **geriye dönük üretilemez**; bu yüzden toplama ilk günden başlar, gönderim liste biriktikçe:

- **Toplama (Faz 1, ilk günden):** kayıt/checkout'ta **işaretlenmemiş** kutu ("kampanyalardan haberdar olmak istiyorum") + sitede küçük bülten kayıt kutusu → `Customer.marketing_consent` (kanal bazlı: e-posta/WhatsApp; verildiği an + kaynak = GDPR kanıtı). **Hiçbir kampanya gönderimi yapılmaz** — yalnız liste birikir. Kutu baştan işaretli gelemez (AB'de açık eylem şartı).
- **Gönderim (Faz 1, elle):** izinli listeye elle hazırlanan kampanya e-postası; WhatsApp ajanı canlıyken sohbet sonunda izni sorup kaydeder.
- **Faz 2:** kampanya otomasyonu + WhatsApp broadcast (double opt-in, yukarıdaki kural).
- **Edinim kaynağı:** ilk siparişte `Customer.acquisition_source` bir kez yazılır (UTM + order_source snapshot) — "bu kampanyadan gelen müşteri tekrar alıyor mu" (kohort/LTV) raporu ancak bununla mümkündür; oturum verisi geçicidir, sonradan kurulamaz.
- Gerekçe: hem maliyet hem GDPR aynı yöne işaret eder. Karar kaydı: `ADR_WHATSAPP.md` ADR-005. Bütünsel akış: `CHANNELS.md §6`.

---

## 12. Kârlılık — ürün vs şirket

Yalancı/kaba kâr kimseye fayda getirmez. Bu yüzden **iki ayrı kavram**, ayrı hesaplanır ve karıştırılmaz.

### Ürün (sipariş) kârlılığı — olabildiğince detaylı

Yalnızca siparişin **doğrudan** (o sipariş yüzünden var olan) giderleri düşülür; genel gider karışmaz ("katkı payı" mantığı):

- **Malın maliyeti (COGS):** tüketilen partilerin alış fiyatı (`Stock.purchase_price`). Hazırlıkta yazılan kalem–parti kaydından (`OrderItemBatch`, §4) hesaplanır — gerçek maliyet, ortalama değil.
- **Teslimat maliyeti:** kargoda gerçek ücret; rota-içinde sipariş başına dağıtılmış birim maliyet (parametrik).
- **Ödeme komisyonu:** online (Stripe) ve kapıda kart (SumUp) oranı; nakit 0.
- **Paketleme:** soğuk zincir (jel/kutu) sipariş/kalem başına maliyet (parametrik).

Ürün kârı = karşılanan satış − bu doğrudan giderler. **Kanal ve ürün bazında** toplanır. Bu doğrudan gider kalemleri sipariş kapanışında **sabitlenir** (snapshot) — geçmiş kârın rakamı sonradan değişen oran/maliyetten etkilenmesin (fiyat sabitleme ile aynı mantık). **Kapanış = `completed`'a geçiş anıdır** (`OrderStatusLog`'dan).

**Fire ürün kârlılığına dahil edilir:** `StockAdjustment` (DLC imhası, hasar, sayım farkı) maliyet değeriyle kayıptır; ürün bazında **"fire düşülmüş net marj"** raporlanır — "bu üründen yılda ne kadar çöpe attım" görünür, kârlılık süslü kalmaz.

### Şirket kârlılığı — bütünsel

Ürün kârlarının toplamından **genel giderler** (kira, maaş, araç, sabit masraf — ön muhasebe gelir/gider, §9) düşülür. Genel giderler tek tek ürüne dağıtılmaz; şirket seviyesinde bir kez düşülür. Böylece hem ürün kararı temiz kalır hem şirketin gerçek kârı görünür.

> Ürün kârlılığı = katkı payı (doğrudan gider düşülür). Şirket kârlılığı = tam P&L (genel gider de düşülür). Ortaklık paylaşımı platform satışları üzerinden yürür (bkz. `PRODUCT.md`); sistem her satışı doğru ve değişmez kaydeder.

---

## 13. Katalog: kategori, koleksiyon, paket

### Kategori — ürünün yapısal yeri (tek)

- Kategoriler **düz** (tek seviye): Börekler, Tatlılar, Çerezler… İç içe ağaç yok (modern yaklaşım).
- Her ürün **tek kategoride** — "bu ürün nedir"in sabit cevabı; kategori bazlı rapor temiz kalır.

### Koleksiyon — esnek pazarlama grubu (çoklu)

- Koleksiyon, adı olan bir ürün listesidir (Bayram, Yeni, İndirimde). Bir ürün **istediğin kadar** koleksiyona girer.
- Gel-geç gruplar burada yaşar; kategori yapısını kirletmez, istediğinde açar/kapatırsın. Kendi bağlantısı (slug) sosyal paylaşıma uygundur.

### Paket (bundle) — birden çok ürünü tek fiyata sunma

Amaç: birkaç ürünü bir arada tek pakette, kendi fiyatıyla sunmak (sosyal medyada paylaşınca müşteri tek tıkla seçsin). **Yeni ürün yaratmaz.**

- Paketin **kendi toplam fiyatı** vardır — içindeki ürünlerin normal fiyatları toplamı olmak zorunda değil. **Genel indirim/kupon paketlere uygulanmaz** (fiyatı sabittir).
- **Paket yalnız B2C kanalındadır.** Fiyatı tek sayıdır ve **TTC** tabanındadır (B2C tabanı); paketin kanal listesi, müşteriye özel fiyatı ya da `Price` satırı yoktur. Toptan müşteri vitrininde paket **görünmez** — toptan alışverişte pazarlık kalem üzerinden yürür, paket ise sosyal medyaya yönelik bir pazarlama kısayoludur. Etkin kanalı `b2c`'ye düşen müşteri (onaysız şirket, §10) paketi görür — kural etkin kanala bakar, kayıt tipine değil.
- Paket sepete eklenince **içindeki her ürün ayrı `OrderItem` olur** (variant + qty + o kaleme **atanmış birim fiyat**). Sistem, müşteri her ürünü tek tek atmış gibi akar: stok, hazırlık, kâr, **fatura hep kalem kalem**.
- **Atanmış fiyatların toplamı = paket toplam fiyatı** (admin her kaleme fiyat verir, sistem toplamı doğrular). Müşteri **yalnız paket toplamını** görür; kalem fiyatları arka planda (fatura + her ürünün KDV'si kendi oranından doğru işlensin diye gerekli).
- **Hediye = fiyatı 0 bir paket kalemi.** Faturada 0€ satır, stoktan normal düşer (gerçek mal), maliyeti kâra yansır. Ayrı "paket + hediye" kuralına gerek yok.
- Sipariş kalemi hangi paketten geldiğini tutar (`OrderItem.bundle_id`) — müşteriye "Bayram Paketi" olarak gruplu göstermek ve raporlamak için.
- Stok: paket, ancak içindeki tüm kalemler yeterli stoktaysa satılabilir görünür (türetilir). **Depo boyutu (kullanıcı kararı 08.08):** yer belliyken paketin stok okuması da §17'nin süzgecinden geçer ve karma-sepet kuralı (C8) paketin BÜTÜNÜNE uygulanır — tüm kalemler müşterinin deposundaysa rota; değilse, paket kargolanabilirse ve tüm kalemleri kargo deposunda tam takımsa KARGO siparişi; ikisi de değilse erken durdurulur ("bu adrese verilemiyor" ≠ "tükendi" — C3). "Paketi ikiye böl" yoktur: paket bütün olarak TEK depodan gider (K5). Yer bilinmiyorken ağ-geneli okuma C3 gereği doğrudur. Uygulama: `build/19 (19.22)`.
- **Satılabilirlik TÜRETİLİR, `is_active` ÇEVRİLMEZ.** Kalemin ürünü/boyu satıştan çıkarsa paket vitrine çıkmaz — ama `bundle.is_active` operatörün NİYETİDİR ve sistem onu ezmez. Ezseydi ürün geri açıldığında paket pasif kalırdı ve geri açılması gerektiğini kimse bilemezdi. Operasyon listesi bu farkı söyler ("vitrinde yok" işareti), ürün formu da ürünü satıştan çıkarırken hangi paketlerin düşeceğini yazar.
- **Paketin PARTİSİ YOKTUR.** "Bu paket hangi partiden gider" sorusunun paket düzeyinde cevabı yok: paket sepette kalemlerine açıldığı için parti seçimi sıradan kalemin kuralını **miras alır** (rezervasyon + hazırlık onayında FEFO → `OrderItemBatch`). Pakete ayrı bir parti seçimi eklemek aynı kararı iki yerde tutmak olurdu; lot/geri çağırma sorgusu da paketten geçen kalemi kalem düzeyinde bulur.
- **Yaklaşan tarihli (near-expiry) parti pakete girer, fiyatını DEĞİŞTİRMEZ.** Paket fiyatı sabittir; ucuz gelen parti müşterinin ödediğini değil **maliyeti/marjı** etkiler (COGS gerçek partiden hesaplanır). Tersi de otomatik değil: "raf ömrü azalan partiyi pakete koy da erisin" bir **iş kararıdır** — teklif listesi uyarır, paketi admin kurar. Sistem kendiliğinden yapsaydı kürelenmiş sabit fiyatlı bir seçkiye habersiz indirim sokmuş olurdu.
- **Paketin marjı ancak paylardan hesaplanır:** paket fiyatı KDV dahil tek bir sayıdır, kalemlerin KDV oranları farklıdır (tatlı %5,5, malzeme %20) — toplama tek oran uygulanamaz. Her kalemin payı kendi oranıyla HT'ye indirilir, toplanır, maliyet düşülür. Maliyet tahmini: eldeki partilerin **ağırlıklı ortalama alış fiyatı** (gerçek COGS sipariş anında FEFO ile kesinleşir). Bir kalemin maliyeti bilinmiyorsa marj YAZILMAZ — eksiği 0 saymak marjı şişirir.
- **Atanmış paylar TÜRETİLİR:** admin tek sayı girer (paket fiyatı), sistem payları kalemlerin **liste fiyatlarına oransal** dağıtır — pahalı kalem indirimin çoğunu taşır. Elle giriş kaçış kapısıdır (hediye kalem, bilinçli kaydırma) ve o satır sonraki dağıtımlarda korunur. Birim fiyatlar tam kuruş olduğu için hedef **her zaman tutturulamaz** (bkz. `domain-core/bundle-allocation`); tutmazsa sistem sessizce yuvarlamaz, farkı söyler.
- **Aynı ürün hem pakette hem ayrıca sepette olabilir:** ikisi **ayrı kalem** kalır (paket kalemi atanmış fiyat + `bundle_id`; ayrı eklenen normal fiyat + boş `bundle_id`). Birleşmezler — müşteri ikisini de ister. Sepette paket **grup** olarak görünür ve bütün eklenir/çıkarılır; ayrı kalem bağımsız düzenlenir. Stok ikisini de sayar.

### Tarif ("Sofradan Fikirler") — editoryal içerik, satış birimi DEĞİL

Amaç: var olan ürünleri bir yemek fikri etrafında sunmak; malzeme satırından tek ürün, alttan tüm tarif sepete eklenir. Kararlar müşteri şeridinin araştırmasıyla verildi (07.08); uygulama planı `build/05-katalog (05.16)` · `09-admin (09.21)` · `08-musteri-app (08.24)`.

- **Paketin tam tersidir:** kendi fiyatı, kendi sipariş kalemi, faturada izi YOKTUR — yalnız var olan varyantları sepete taşır; sepete giren her şey sıradan kalemdir. Karıştırılırsa tarif bir gün faturaya kalem olarak düşmeye çalışır.
- **Malzeme bağı VARYANTA kurulur** — "Ezine Beyaz Peynir" yetmez, sepete eklenebilen tek şey "350 g" satırıdır; ürün kimliği varyanttan türer.
- **Üç dil dolmadan yayına çıkmaz; kural VERİDE ve DOLULUK arar** (boş metin de reddedilir). Yayındaki tarifte dil yedeğine düşülmez: ürün adında yedek doğrudur (müşteri ürünü tanır), hazırlanış adımında yanlıştır (anlaşılmayan adım işe yaramaz). Zorlanan şey doluluktur, çeviri kaynağı değil — AI önerir (Sınıf 1), operatör elle de yazar; tarif BİZİM editoryal metnimiz olduğundan "orijinal/çeviri" kavramı yoktur.
- **Fiyat ve tükenme müşterinin YERİNE ve personasına göre okunur** — vitrinle aynı depo süzgecinden (§17). Tükenen kalem toplamdan düşer, toplam kalanla hesaplanır; hepsi tükendiyse "sepete ekle" pasif, kısmen tükendiyse aktif ve onay mesajı yalnız EKLENENİ sayar ("3 malzeme sepete eklendi" — dördüncüsü tükendiyse üç der).
- **Tarif içeriği operatörden doğar** (09.21 ekranı): taslak `is_active=false` doğar, üç dil dolunca yayınlanır; slug operatörden istenmez, addan türetilir.

### Aday ürün ve keşif (tinder-kart)

- **Aday ürün** (`Product.is_candidate=true`): stokta olmayan ama tedarik edilebilecek ürün. **Satılamaz** — yalnız müşteri tarafındaki **keşif/beğeni bölümünde** (mobil-öncelikli tinder-kart) gösterilir. Normal (satılabilir) kataloğa karışmaz.
- Müşteri kaydırır → **beğen/geç** = `ProductFeedback(context='candidate', vote)`. Giriş yaptıysa `customer_id` ile kişisel tercih; değilse kimliksiz kayıt (toplu talep sinyali).
- **Ziyaretçinin kaydırması BOŞA GİTMEZ — sonradan açtığı hesaba puan olarak yüklenir** (kullanıcı kararı 03.08). Tur bitince ziyaretçiye hesap açması önerilir ("bu bilgileri paylaştığınız için teşekkürler; dilerseniz biriken puanı hesabınıza yükleyelim") ve giriş sonrası kaydırmalar hesaba **bağlanır**. Eski kural ziyaretçiye "puan yok" diyordu; değişimin sebebi ikisini birden kazanmak — sinyal zaten toplanıyordu, giriş daveti artık değerin gösterildiği anda geliyor.
  - **Bağlama ÜRÜN başına yapılır, kaydırma başına değil.** Girişli müşteride "aynı ürüne bir kez puan" kuralını `upsert` sağlar (aynı satır güncellenir); ziyaretçide kimlik olmadığı için her kaydırma yeni satır açar, yani beş kez kaydıran beş satır üretir. Talep kapısı bu yüzden ürün başına yalnız **en yeni** kaydırmayı bağlar ve müşterinin o ürüne ait kaydı zaten varsa hiç bağlamaz — turu tekrarlayarak puan biriktirme yolu böyle kapanır (§14'ün kuralı, yeni bir kural değil).
  - **Bir kez bağlanan satır artık kimliksiz değildir**, yani ikinci kez talep edilemez; sahiplik doğrulaması bunun üstüne kuruludur.
- **Admin — Talep/İlgi panosu (analitik içinde):** swipe beğenileri + kataloğun **ürün-ilgi** sinyali (çok bakılıp az alınan) burada birleşir; adaylar talebe göre sıralanır. Yüksek talepli adayı admin **etkinleştirir** (varyant/stok/fiyat ekleyip satılabilir yapar).

---

## 14. Geri bildirim, yorum, puan ve ürün skoru

Tinder-kart tek bir yer değil, bir **geri bildirim mekanizması**; birkaç bağlamda çalışır. Amaç: değerli veri toplarken müşteriyi ödüllendirmek.

**Bu bölümün tamamı BEYAN'dır, iz değil** — müşterinin bize vermeyi seçtiği bilgi. Hepsi tek varlıkta yaşar: `ProductFeedback` (yıldız · yazılı yorum · beğen/geç). Analitik (`AnalyticsEvent`) ise müşteriyi tanımadan toplanan gezinme izidir ve buraya karışmaz — puan kazandıran, kişiye bağlanan, "bir kez" kuralı olan bir kayıt anonim bir olay defterinde duramaz (bkz. `DATA_MODEL.md` kalıcı kararlar).

- **Swipe geri bildirimi — aynı mekanizma, iki bağlam** (`ProductFeedback.context`):
  - **Aday talep** (`candidate`): stokta olmayan aday ürünler, keşif bölümünde beğen/geç (bkz. §13). Satın alma aranmaz — aday ürün henüz satılmıyor.
  - **Alım-sonrası memnuniyet** (`purchase`): teslimden ~10 gün sonra WhatsApp/e-posta link'iyle, aldığı ürünleri beğen/beğenme. Davet ve tamamlanma `FeedbackRequest`'te izlenir.
- **Yazılı yorum:** yalnız **satın alan** müşteri puan + yorum yazar (`context='purchase'`); **moderasyondan sonra ürün sayfasında** görünür. Sosyal kanıt + SEO değeri. Moderasyon yalnız METİN içindir: yıldız ve beğeni kuyruğa düşmez, okunacak bir şey yoktur.
- **Puan / oyunlaştırma:** her değerli aksiyon (yorum, swipe'lar, sipariş…) **puan** kazandırır (`PointsEntry`; değerler parametrik). Biriken puan **kişisel indirim koduna** çevrilir (redemption → `Discount.customer_id`). Tek tek kupon yerine biriken puan — daha güçlü sadakat döngüsü. **Puan aksiyonu tamamlamaya bağlıdır, beğeniye değil.**
- **Puan kuralları:** puanlar **süreyle yanmaz** (süresiz birikir); yalnız **B2C (son kullanıcı)** kazanır/kullanır — B2B'nin zaten özel fiyatı var. İstismara karşı: aynı ürüne yorum/swipe **bir kez** puan verir + günlük tavan. **Redemption:** müşteri kendi isteyince çevirir (otomatik değil). **Yorum:** doğrulanmış alışveriş yorumu hafif moderasyonla yayınlanır.
- **Geri dönüş ödülü VERİ ödülünden ayrıdır** (kullanıcı kararı 03.08). Müşteriyi geri getirmek için keşif kaydırmasını tekrar tekrar ödüllendirmek **tartışıldı ve reddedildi**: oy puanı ürün başına bir kez kalır, çünkü tekrar eden oy yeni bilgi taşımaz ve onu ödüllendirmek `signal-quality`'nin bastırmak için var olduğu davranışı **satın almak** olurdu — aday panosu gerçek para harcatan bir kararı besliyor. Bunun yerine **günlük ziyaret puanı**: müşteri günde bir kez ziyaret için sabit bir puan kazanır (varsayılan 10 ≈ 0,10 €), aynı gün içindeki ikinci gelişte kazanmaz. Ayrı bir sebep (`visit`) olması şart: defterde "veri bedeli" ile "gelme bedeli" aynı satıra yazılırsa panoyu okuyan ikisini ayırt edemez.
  - **Ziyaret SİTE genelidir, keşfe bağlı değil** — ana sayfaya gelen de kazanır. Keşfe bağlansaydı ödül, aday ürün kalmadığı gün kendiliğinden kesilirdi; oysa istenen şey ziyaretin kendisi.
  - **Sınır TAKVİM GÜNÜdür, yuvarlanan 24 saat değil** (kullanıcı kararı 03.08). Sebep teknik ve bilinçli: defterin ikinci ödemeye karşı güvencesi bir veritabanı indeksidir, yuvarlanan pencere indekslenemez. Kodda pencere tutmak garantiyi indeksten koda taşırdı — 10 cent'lik bir sınır bu geri adıma değmez. Bedeli 23:50'de kazanıp 00:10'da yeniden kazanabilmek.
- **İKİ DAVET VARDIR ve karıştırılmaz** (kullanıcı kararı 11.08 · 17.9 · 17.10). İkisi de bir bağlantı paylaştırır ama farklı şeyi ödüllendirir, farklı ömre sahiptir ve farklı sebeple deftere yazılır:
  - **Getiren daveti** (`referral`, `/invite/[code]`) — **hesabı olmayan** birini müşteri yapmanın ödülü. Anahtarı KİŞİdir (`user_profiles.referred_by`), ömür boyu bir kez kurulur, süresi yoktur. Kod istek üzerine üretilir; bağ **kayıt anında** kurulur (OTP akışının içinde), ödül **paranın alındığı anda** doğar.
  - **Komşu daveti** (`neighbor`, `/neighbor/[token]`) — var olan bir **sefere ikinci sipariş eklemenin** ödülü. Anahtarı SEFERdir (`delivery_zone_id` + `delivery_date`), ömrü o günün **kesim saatine** kadardır, davet başına birkaç kez kullanılır (`max_uses`, varsayılan 3). Davet edilen kişi **zaten müşterimiz olabilir** — kazanılan şey kimlik değil, aynı durakta ikinci bir durak-maliyetsiz sipariş.
  - **İkisi aynı turda da doğabilir ve bu çift ödeme değildir:** hesapsız bir komşu, komşu bağlantısından gelip kaydolur ve sipariş verirse iki farklı şey olmuştur. Sebepleri ayrı tutmanın sebebi tam da bu: tek sebebe yığılsalardı "davet bize ne kazandırdı" sorusunun iki ayrı cevabı tek sayının içinde kaybolurdu.
  - **Komşu daveti KARGOda yoktur** ve bu bir kısıtlama değil, kavramın kendisi: kargoda "aynı sefer" diye bir şey yok, taşıyıcı paket başına ücretlendiriyor. Rota içi teslimat ise zaten ücretsiz — yani komşu davetinin müşteriye vaadi indirim DEĞİL, **aynı gün birlikte teslim alma** ve davet edene puandır. Kazanan taraf işletmedir (durak başına maliyet); müşteriye söylenen şey doğru olanıdır.
- **Ödül ≠ güven (kritik ilke):** müşteri katılım için puanını **alır**, ama sinyalin **analize etkisi kalitesine bağlıdır.** Hep aynı yöne / çok hızlı / ayırt etmeyen swipe'lar **düşük kaliteli** sayılır, analizde **zayıflatılır veya hariç tutulur**; ayırt eden ve **satın almayla tutarlı** sinyaller **ağırlıklı** sayılır. Ölçüm için kaydırma kaydında **kart süresi + oturum deseni** (`ProductFeedback.dwell_ms`) tutulur; ağırlıklandırma domain-core'da. Sonuç: müşteri ödülünü alır, **manipüle veri iş kararını bozmaz.**
- **Ürün skoru (türetilir):** kullanıcı geri bildiriminden — yorum puan ortalaması + beğen/beğenme oranı — **her ürünün kendi puanı** oluşur. İki ayak da `ProductFeedback`'ten gelir, tek okumadan. Admin için karar aracı; müşteriye de gösterilebilir (sosyal kanıt).
- **Dış değerlendirme köprüsü:** alım-sonrası ankette memnuniyeti yüksek çıkan müşteri, akışın sonunda **halka açık bir değerlendirme sayfasına** tek-tık yönlendirilir (`FeedbackRequest` akışına bir link — yeni mekanizma değil).
  - **Platform bir AYARDIR, kural değil** (`review_platform_url` + `review_platform_name`). Kod vendor adı bilmez; motorun sonucu `review_invite`'tır.
  - **Varsayılan Google İşletme Profili.** Mağaza yok ama iş yereldir: teslimat Strasbourg bölgesine rota ve bölgelerle yapılır, o yüzden Google'ın **"hizmet bölgesi" (SAB)** kaydı — adres gizli, teslimat bölgeleri beyan edilir — tam bu duruma göredir. Oradaki yorum haritada/yerel sonuçlarda görünür; **yeni müşteri bulduran** taraf odur. (`SCOPE §38`, `BACKLOG §221`.)
  - **Trustpilot farklı bir işi görür:** bulunmayı değil, bulunduktan sonra **güveni** artırır. Bölgenin dışına çıkıldığında veya B2B alıcı referans istediğinde anlamlı olur; ücretli plan gerektirir ve yerel sonuçları beslemez. Ürün yıldızlarının aramada çıkması için de gerekmez — onu kendi `ProductFeedback` verimiz + schema.org zaten üretir.
- **Admin geri bildirim analizi:** yorumlar + swipe oranları + ürün skorları admin analitiğinde toplanır — hangi ürün seviliyor/sevilmiyor, neyi öne çıkar, neyi düzelt/çıkar. Yorumlar **ürün sayfasında**, analiz **admin tarafında**.
- Tümü Faz 1; **design dokümanı bu ekranları baştan kapsar** (keşif bölümü, alım-sonrası swipe, ürün sayfası yorum+skor, admin geri bildirim/puan analizi).

## 15. Müşteri talep ve şikâyet

Basit yaşam döngüsü; karmaşık ticket sistemi kurulmaz. Amaç: müşteri sorununu kolay iletsin, biz siparişe/ürüne bağlı net veri görelim.

### Giriş noktaları — hepsi aynı akışa çıkar

- **Sipariş detayından:** "Bir sorun mu var?" → siparişin kalemleri listelenir, müşteri ilgili ürünleri **işaretler**, tip seçer (bozuk / eksik / soru / diğer), açıklama + isteğe bağlı fotoğraf ekler.
- **Genel "bize yaz":** birkaç küçük yönlendirme sorusuyla başlar — *"Bir siparişle mi ilgili?"* Evet ise: oturum yoksa oturum açtırılır, sonra sipariş seçtirilir → yukarıdaki akışa girer. Hayır ise: doğrudan serbest mesaj (siparişsiz talep).
- **WhatsApp:** numara bir hesaba bağlıysa oradan da açılabilir. Zeminde admin konuşmadan elle talep açar; canlı kanalda AI ajanı hangi sipariş → hangi ürün → birkaç netleştirme sorusu sorup talebi kendisi oluşturur (teknik uygunluk BSP altyapısına göre doğrulanacak). Talep `conversation_id` ile konuşmaya bağlanır.

### Akış ve yaşam döngüsü

- Şikâyet **talep (Ticket) açar**; müşteri doğrudan iade başlatamaz. Admin inceler, gerekirse **iade/para iadesi akışını tetikler** (bkz. §8) — karar ve kontrol bizde.
- Durumlar: `open → in_progress → resolved` (yeniden açılabilir → `open`). Müşteri hesabından talebinin durumunu ve yazışmayı **görür** (şeffaflık); cevap geldiğinde e-posta bildirimi.
- Yazışma basit bir mesaj dizisidir (müşteri ↔ admin), talebe bağlı.

### Analiz bağı

Ürüne bağlı şikâyetler (bozuk/eksik) admin analitiğine girer: hangi üründe/partide sorun yoğunlaşıyor (ürün skoru ve kalite sinyaliyle yan yana, bkz. §14).

## 16. Tedarik (satın alma) yönetimi

Müşteri tarafının simetriği: tedarikçi de bir karttır, alım da bir akıştır. İlke aynı — **sistem önerir, siparişi insan verir.**

> **Depo ağı (01.08):** mal kabul depoya yapılır; tek PO birden çok depoda parçalı kabul edilebilir,
> eşik ve sipariş önerisi depo başınadır — §17.

### Tedarikçi kartı ve borç

- Tedarikçi kartı: ad, iletişim, vergi no, **bize tanıdığı vade** (`payment_term_days`, null = peşin), not.
- **Muhasebe bağı:** her stok girişi (`StockIntake.supplier_id`) ve tedarikçiye yapılan her ödeme (`MoneyMovement.supplier_id`) karta bağlanır. **Tedarikçiye borç türetilir**: Σ girişler − Σ ödemeler; "bu tedarikçiye bu yıl ne ödedik" tek sorgudur. Saklanan bakiye yoktur (türetme ilkesi).

### Ürün–kod eşlemesi

Her varyant için tedarikçideki **sipariş kodu**, oradaki adı, koli içi adet ve son alış fiyatı tutulur (`SupplierProduct`). Tedarik siparişi bu sayede **tedarikçinin diliyle** yazılır — telefonda kod tarif etme devri biter. Bir varyantın birden çok tedarikçisi olabilir; biri "tercihli" işaretlenir.

### Tedarik siparişi (PurchaseOrder)

- **Taslak:** admin kalemleri seçer (öneri listesinden veya elle); liste tedarikçi kodlarıyla oluşur.
- **Gönderim insana aittir:** sistem WhatsApp'a/e-postaya kopyalanacak temiz bir liste/PDF üretir, **otomatik göndermez** — tedarikçi ilişkisi insan ilişkisidir.
- **Mal kabulde kapanır:** mal gelince depo mal kabul formu PO kalemleriyle **önceden dolu** gelir; depocu tarih/lot girer, sayıyı doğrular. Kabul tamamlanınca PO `received` olur ve `StockIntake`'e bağlanır. Böylece **sipariş ettim ↔ gelen mal ↔ ödeme** üç halkası zincirlenir; eksik gelen mal fark olarak görünür.
- PO'suz doğrudan stok girişi de her zaman mümkündür (küçük/plansız alım) — PO zorunluluk değil, araçtır.

### Sipariş önerisi

- **Faz 1 — eşik:** varyant başına asgari stok (`min_stock_qty`, isteğe bağlı); kullanılabilir stok altına düşen ürün admin'de **"sipariş zamanı"** listesine düşer. Liste tedarikçiye göre gruplanır → tek dokunuşla PO taslağına dönüşür.
- **Faz 2 — akıllı öneri:** satış hızı + kalan stok + tedarik süresi + sezon (Kasım–Aralık) → "şu tarihte biter" tahmini; AI içgörü ailesine girer. Her iki halde de otomatik sipariş **yoktur**.

---

## 17. Depo ağı (çok depo)

> **Karar 01.08.2026; implementasyon `docs/build/19-coklu-depo.md`.** Kod bugün tek depoyla çalışır —
> bu bölüm yürürlükteki hedef kurallardır; 19 modülü indikçe kod bu bölüme yaklaşır. Teknik karar
> dökümü `DATA_MODEL.md` Kalıcı kararlar'dadır (01.08 bloğu).

### Omurga: posta kodu → bölge → depo

- Her teslimat bölgesi (`DeliveryZone`) **tek bir depoya** bağlıdır; bir posta kodu **tek bir
  bölgede** olabilir — pasif bölge dahil ("pasifken çakışsın" esnekliği, bölge yeniden açıldığında
  iki sahipli kod bırakırdı). Tekillik veritabanında `(ülke, kod)` anahtarıyla zorlanır, çakışma
  kayıt anında reddedilir ("ilki kazanır" sessiz çözümü kalkar). Ülke bölgeye değil kod satırına
  yazılır — bölge sınır ötesi olabilir (ADR-002). Sonuç: posta kodu her zaman tek depoya çözülür.
- Müşteriye depo **gösterilmez** — altın kural: sistemin karmaşıklığı arayüze yansımaz. Müşteri
  posta kodunu girer; gerisi içeride çözülür.
- **Varsayılan depo kavramı YOKTUR.** Belirsizlik varsayılanla çözülmez: sipariş deposunun kaynağı
  ya adresin posta kodudur (uzaktan sipariş: web/WhatsApp/elle) ya işlemi yapan personelin sabit
  deposudur (kapı önü satış). Admin kapı önü satış yapmaz.
- **Ülke:** posta kodu ülkeler arası benzersiz değildir (FR ve DE ikisi de 5 hane; `67000` ikisinde
  de geçerli). Yer çözümü `(ülke, posta kodu)` ikilisidir. Ülke seçici yalnız aktif bölge/depoların
  ülke kümesi 1'i aşınca görünür (veriden türer, ayar değil); site dili en fazla ön-seçim
  **ipucudur**, karar müşterinindir. Dış coğrafi servis kullanılmaz — belirsizlik niyettedir,
  hiçbir servis çözemez.

### Sipariş: tek depodan, istisnasız

- **Bir sipariş tek depodan çıkar** (`Order.warehouse_id`); bölünmüş sipariş yoktur ve soğuk zincir
  ürünü asla depo değiştirmez. Değişmez **veride** durur: siparişe yazılan partiler siparişin
  deposundan olmak zorundadır (ertelenmiş kısıt — `order_discount_balance` emsali).
- **Karma sepet (rota müşterisi):** kendi deposunda OLAN her şey — kargolanabilir dahil — rota
  siparişiyle araçtan gider. Kendi deposunda OLMAYAN kargolanabilir ürün **engellenmez**:
  "kargoyla gönderilir" işaretiyle satılır ve **ayrı ödemeli ayrı bir kargo checkout'una** gider
  (kargo deposundan). İki checkout = iki sipariş = iki ödeme — "her ödeme bir siparişe" modeli
  değişmez. Ürün iki depoda da yoksa gerçekten "tükendi"dir.
  **Yolu stok belirler, müşteri seçmez (01.08):** kendi deposunda mevcut kalem kargoya
  yönlendirilemez — ücretsiz kapı teslimi varken paralı kargo seçtirmek ikinci bir karar noktası
  açar, karşılığı yoktur. Sepet tamamen yerel-dışı kalemlerden oluşuyorsa salt-kargo siparişi
  kendiliğinden doğar; farklı adrese gönderim de o adresin posta kodundan doğru yola düşer.
- **Kargo deposu ülke başına en fazla BİRDİR:** `ships_online` işaretli tek aktif depo — tekillik
  veritabanındadır (kısmi unique indeks; uygulama unutsa da ikincisi yazılamaz). Bugün tek ülke =
  tek kargo deposu; DE açıldığında kendi kargo deposu olur, kod değişmez. Kargo deposu bölge dışı
  müşterilere ve rota müşterilerinin kargo dolgusuna hizmet eder.

### Katalog ve sepet davranışı

- **Katalog süzülmez, işaretlenir** — "yer bir sözdür, filtre değildir" sözleşmesi korunur. Depo
  stoğu karta işaret olarak düşer; süzme müşterinin elindeki çiptir (varsayılan kapalı).
- Posta kodu **zorunlu değildir**; ısrarlı ve nazik davetle istenir (anasayfa, katalog girişi,
  soğuk zincir ürün detayı — tasarım deseni). Yer bilinmiyorken yere bağlı hiçbir vaat verilmez:
  "tükendi" yalnız **hiçbir depoda** yoksa söylenir, gerisi "muhtemel" tonunda kalır.
- Posta kodu değişince sepet yeniden değerlendirilir: yeni depoda karşılanamayan kalem
  **silinmez**, `saved_items`'a taşınır (mevcut mekanizma; tetik genişler). "Burada satılmıyor" ile
  "şu an tükendi" ayrı mesajlardır — ilki kalıcı, ikincisi geçici.

### Operasyon

- **Roller iki eksenlidir:** ne yapar (rol) × nerede yapar (depo kapsamı). Admin ve muhasebe
  depo-**üstüdür**; depocu ve kurye depoya bağlıdır — kapsamı boşsa **hiçbir** depoyu göremez
  (kapalı kapı). Kapsamında birden çok depo olan personel ekranda kapsamıyla sınırlı seçici görür.
- **Depocu başka deponun stoğunu görmez** — eksik kaleminde "diğer depoda var" bilgisi de yoktur;
  depolar fiziksel olarak uzaktır, bilginin operasyonel karşılığı yoktur. Depo karşılaştırma ve
  transfer kararı admin'in işidir.
- **Tedarik:** satın alma siparişi depo-üstüdür; **mal kabul depoya yapılır** — tek PO birden çok
  depoda parçalı kabul edilebilir, PO durumu kabullerden **türetilir**. PO kalemine isteğe bağlı
  hedef depo yazılabilir ("20 koli STR'ye, 10 koli KEHL'e") — kabul eden depocu kendi payını
  listeden okur. Asgari stok eşiği depo bazlıdır: varyanttaki genel eşik varsayılan, depo satırı
  istisnadır (müşteriye-özel fiyat deseni); sipariş önerisi depo başına hesaplanır.
- **Depolar arası transfer** iki fiziksel-gerçek anıyla çalışır (sevk → kabul; §4'ün "yalnız
  fiziksel an stoğu değiştirir" ilkesi): yoldaki mal hiçbir depoda satılamaz, "yolda ne var"
  transfer kaydının kendisidir. Parti kimliği korunur (tarih/lot/alış hedefte yeni partiye
  kopyalanır) — geri çağırma ve gerçek COGS transferden etkilenmez. Parti seçiminde sistem FEFO
  **önerir**, operatör serbestçe değiştirir; hedefe ulaşım süresi (parametrik) kadar ömrü kalmayan
  parti önerilmez — uyarır, engellemez. Sevk deponun **kullanılabiliri** üzerinden yapılır:
  müşteriye söz verilmiş (ayrılmış ya da teklife çıpalı) mal yola çıkamaz.
- **Her depo bir kasadır:** kapıya teslim + kapıda tahsilat her depoda mümkün; depo başına
  `Account` satırı açılır ("Kasa — STR"), merkeze aktarım hesaplar arası harekettir (§7/§9 modeli
  değişmez).
- **İmha/sayım belge numarası depo koduyla ayrışır** (`IMH-STR-26-0012`) — kâğıt klasör fiziksel
  olarak o depoda durur; ortak sıra denetmene delik gösterirdi.
- **Araçlar depoya bağlanmaz**; kurye günü ve kapanışı kurye/gün ekseninde kalır (§7). Sıcaklık
  kaydı depo + konum (dolap/araç) taşır — hijyen denetimi tesis bazındadır.
- **Fiyat depo boyutu almaz** — aynı katalog her yerde aynı fiyattır; depo bazlı tek fiyat farkı
  partiye bağlı near-expiry teklifidir (parti zaten bir depodadır). Ülke farkı gerekirse araç
  kanal/ülke eksenidir, depo değil (§5).

> ⚠ **Almanya ön koşulu:** DE'de depo açmak vergi modelini değiştirir (§5 KDV uyarısı) — mali
> danışmana sorulmadan DE deposu açılmaz.
