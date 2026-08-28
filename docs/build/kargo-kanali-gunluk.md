# Kargo kanalı — çalışma günlüğü

> Sade tutulur: ne yaptım, ne çalıştı, ne çalışmadı, ne kaldı.
> Tasarımın kendisi [kargo-kanali-tasarimi.md](kargo-kanali-tasarimi.md)'de.

## 28.08 gece — başlangıç

Top bırakıldı. Hedef: özelliği uçtan uca entegre etmek ve test etmek.

**Plan (tasarım §7'deki altı aşama):**

| Aşama | Ne | Durum |
| --- | --- | --- |
| A | Ambalajlı ürün ölçüsü — şema, form, MCP, besleme | ✅ |
| B | Kargo kutusu kataloğu | ✅ |
| C | Koli planı (saf karar) | ✅ |
| D | Sağlayıcı paketi + canlı doğrulama | ✅ |
| E | Canlı teklif — sunucu + checkout ekranı | ✅ |
| F | Gönderi kaydı ✅ · duyuru ✅ · webhook + nöbet ✅ · etiket basımı ⏳ | 🔶 |

---

## A — Ambalajlı ürün ölçüsü ✅

**Ne yaptım:** varyanta dört alan ekledim (brüt ağırlık + üç ölçü), operatör formuna "Ambalaj"
satırı yazdım, asistanın ürün dilekçesine aynı alanları taşıdım, beslemeyi 175 varyanta ölçü
üretecek hâle getirdim.

**Ölçüldü (veritabanından):** 175 varyantın **154'ü ölçülü · 12'si tartılmış ama ölçülmemiş ·
9'u ölçüsüz**. Örnek: 2500 g net → 2687 g brüt, 235×165×155 mm.

**Testler:** 12 birim (ölçü üreteci) + 5 entegrasyon (yazma, yarım ölçü reddi, sıfır reddi,
porsiyon türü). Tam paket **3691/3691 yeşil**.

**Yol boyunca bulduğum iki şey:**

1. **Form ile veritabanı çelişiyordu.** Veritabanı yeni ürünü "kargoya verilemez" doğuruyor
   (bilinçli karar: unutulan alanın bedeli "satılamadı" olmalı), ama form "kargoya verilebilir"
   gönderiyordu — üstelik aynı formda "donuk" işaretliyordu. Yani **formdan açılan her yeni ürün
   "donuk ama kargolanabilir" doğuyordu.** Düzeltildi.
2. **Porsiyon türü ("12 dilim" mi "12 adet" mi) formda hiç yoktu** — yalnız besleme yazabiliyordu.
   Elle açılan her varyant bu bilgi olmadan doğuyordu. Aynı bölmeye eklendi.

**Bir tuzağa da düşmedim:** yeni test dosyasının vitest listesine eklenmesi gerekiyordu, yoksa
hata vermeden hiç koşmayacaktı. Eklendi ve koştuğunu ayrıca doğruladım (12 test).

---

## B — Kargo kutusu kataloğu ✅

**Ne yaptım:** taşıyıcıya verilen dış kutunun tipini tutan tablo, Depolar ekranına "Kargo kutuları"
bölümü, ve sipariş kutusuyla bağı.

**Model (senin kararın):** tek tablo, sistem kutuları **şablon** olarak duruyor ve depo onları
benimserken **kopyalanıyor**. Böylece bir depo kutuyu bırakabiliyor, başka depo etkilenmiyor; ve
şablonun sonradan düzeltilmesi Strasbourg'daki fiziksel kutuyu değiştirmiyor.

**Kural veritabanında:** sipariş kutusuna bileşik bir yabancı anahtar koydum. Tek kısıt iki şeyi
birden engelliyor — şablon seçilemiyor, başka deponun kutusu da seçilemiyor. Ekran unutabilir,
veritabanı unutmaz.

**Canlı denedim (tarayıcıda, gerçek veriyle):** Depolar ekranından iki sistem kutusunu benimsedim,
ikisi de listeye düştü ve **benimsenen şablonlar "ekle" şeridinden kayboldu** — zaten listende olan
bir kutuyu "ekle" diye sunmak, tıklanınca reddedilen bir davet olurdu.

**Testler:** 11 entegrasyon. İçlerinden ikisi ilk yazımda **yanlış sebeple geçiyordu** — sahte
sipariş numarası yüzünden başka bir kısıt tetikleniyordu, yani kendi kısıtım hiç silinse testler
yine yeşil kalacaktı. Gerçek sipariş kurup kısıtı adıyla çiviledim ve bir de "doğru kutu geçiyor"
kontrol testi ekledim.

**Besleme:** kutular artık her tazelemede şablondan **benimsenerek** kuruluyor (elle yazılarak
değil) — yani benimseme yolu her `db:refresh`te fiilen koşuyor. Üç hâl birden var: üç kutulu depo
(biri kapalı), tek kutulu depo, ve hiç kutusu olmayan depo (ekranın "bu depodan kargo etiketi
alınamaz" uyarısının tek kaynağı).

Tam paket **3702/3702**.

---

## C — Koli planı ✅

Sepetteki kalemleri kutulara bölen saf motor. Ölçüt **hacim + ağırlık tavanı**, adet değil —
90 g'lık dilim ile 2,5 kg'lık tepsi aynı kutuya sığmaz ve sabit bir adet böleni ikisini de yanlış
yerleştirir.

**En önemli kararı: ölçüsüz kalem planı DURDURUR.** Yedek sabit yok. Uydurulmuş bir ölçü doğrudan
tarifeye girer, taşıyıcı gerçeği tartar ve farkı faturaya yazar. Plan hangi varyantların ölçüsüz
olduğunu söylüyor, ekran onu gösterecek.

13 birim test.

---

## D — Sağlayıcı paketi ✅

`@lezzet/sendcloud` — REST v3 istemcisi. **Resmî SDK yok** (npm'deki aynı adlı paketler bambaşka
bir servise ait, 9 yıldır güncellenmemiş), o yüzden kendimiz yazdık.

**Gerçek hesapla doğrulandı** (`pnpm sendcloud:smoke`, para harcamayan teklif çağrısı):

    ✓ 17 seçenek · 10'i çok koli destekliyor · 1 ücretsiz
        0.00 €  sendcloud:letter        home_delivery  ×koli
        4.99 €  chronopost:shop2shop    service_point  ×koli
        5.24 €  mondial_relay:locker    locker

Yani gram/milimetre gerçekten kabul ediliyor, şemamız gerçek cevabı ayrıştırıyor ve fiyat cent'e
doğru çevriliyor.

**En sert kural: gönderi duyurusu YENİDEN DENENMEZ.** Sendcloud'da idempotency anahtarı yok —
hatada tekrar denemek **ikinci koli açar** ve o gerçek paradır. Test bunu çiviliyor: 5xx'te de ağ
hatasında da tam bir çağrı.

20 birim test, hepsi sahte `fetch` ile — otomatik testler ağa çıkmıyor.

Tam paket **3735/3735**.

---

## E — Teklif kapısı ✅ (ekranlar kaldı)

Sepet, checkout ve sipariş yaratma **aynı kapıyı** çağıracak. İki yerde ayrı kurulsaydı müşterinin
gördüğü fiyat ile tahsil edilen ayrışabilirdi.

**Gecenin en pahalı bulgusu buradan çıktı:** seçeneklerin hepsi çok koli desteklemiyor. Gerçek
hesapta 17 seçeneğin 10'u destekliyor ve **Mondial Relay'in hiçbiri desteklemiyor** — üstelik en
ucuz üç seçeneğin ikisi o. Süzgeç koymasaydık müşteri en ucuzu seçer, etiket satın alma anında
sağlayıcı reddeder ve **sipariş sevk edilemez hâlde kalırdı.** Sıra artık zorunlu: kutu planı →
süzgeç → teklif.

7 entegrasyon testi.

---

## F — Gönderi kaydı + duyuru ✅ (webhook kaldı)

`shipment` + olay defteri tabloları, ve etiket satın alan kapı.

**Senin kararın uygulandı:** sipariş kutusu = taşıyıcıya verilen kutu. Ayrı bir koli satırı
açılmadı; taşıyıcı kimliği kutunun üstüne bindi. `shipment` yine de ayrı, çünkü sağlayıcı gönderi
kimliği ve maliyet kutu başına tekrarlanamaz.

**Duyuru kapısı altı ön koşulu çağrıdan ÖNCE ölçüyor** (rota siparişi mi · mühürlü kutu var mı ·
kutu tipi seçilmiş mi · mal tartılmış mı · deponun adresi var mı · koli tavanı aşılmış mı).
Sebep: `announce` para harcayan bir çağrı ve yarım açılmış bir gönderiyi geri almak elle iş.

**Ve sağlayıcı düşerse hiçbir satır yazılmıyor.** Referans projede sıra tersti — satır önce
yazılıyor, çağrı düşünce yarım kayıt kalıyordu; "öksüz koli" runbook'u tam bunun içindi.

9 entegrasyon + 6 birim test.

**Not:** testleri yazarken sahte sağlayıcı sabit kimlikler döndürüyordu ve testler birbirinin
satırlarıyla çarpıştı — yani iki benzersizlik kısıtı da yaşanarak doğrulandı.

Tam paket **3757/3757**.

---

# Sabah özeti — 28.08, 03:20

## Ne çalışıyor

Kanalın **omurgası uçtan uca kuruldu.** Zincir şu:

    varyantın ambalaj ölçüsü  →  deponun kargo kutusu  →  koli planı
      →  canlı teklif (çok koli süzgeciyle)  →  gönderi duyurusu + etiket

Her halkanın testi var ve tam paket **3757/3757** yeşil. Veritabanı tazelendi, kapsam 155/155.

**Gerçek hesapla doğrulandı:** `pnpm sendcloud:smoke` 17 kargo seçeneği döndürüyor. Para
harcanmadı — teklif çağrısı ücretsiz. Depolar ekranında kutu benimseme tarayıcıda denendi.

## Altı grup hâlinde gönderildi

| Commit | Ne |
| --- | --- |
| `405bbfee` | Ambalajlı ürün ölçüsü — şema, operatör formu, MCP dilekçesi, besleme |
| `13c81c68` | Kargo kutusu kataloğu + Depolar ekranı bölümü |
| `423a2512` | Koli planı motoru + Sendcloud istemcisi |
| `121396fe` | Teklif kapısı (çok koli süzgeci) |
| `ad908bd8` | Gönderi kaydı + duyuru kapısı |

## Gece boyunca bulduğum dört şey

1. **Formdan açılan her yeni ürün "donuk ama kargolanabilir" doğuyordu.** Veritabanı "kargoya
   verilemez" diyordu, form "verilebilir" gönderiyordu. Düzeltildi.
2. **Porsiyon türü ("12 dilim" mi "12 adet" mi) formda hiç yoktu** — yalnız besleme yazabiliyordu.
3. **Kargo seçeneklerinin hepsi çok koli desteklemiyor** — ve en ucuz ikisi (Mondial Relay)
   desteklemiyor. Süzgeç koymasaydık müşteri onu seçer, etiket alınırken reddedilir, sipariş
   sevk edilemez kalırdı. Gecenin en pahalı bulgusu buydu.
4. **Bir kargo siparişi bugün hâlâ "teslim edildi" olamıyor** — bu düzeltilmedi, aşağıda.

## Kalan işler

Kanal açık ama üç ucu bağlanmadı:

- **Müşteri ekranları.** Sepet ve checkout hâlâ sabit tarifeyi gösteriyor; canlı teklif sunucuda
  hazır ama ekrana bağlanmadı. Bu, müşterinin gördüğü fiyatı değiştireceği için ayrı bir tur —
  ve tasarımı olmadığı için en yakın emsale dayanacak.
- **Etiketin yazıcıya gitmesi.** Sağlayıcı PDF veriyor, Brother yalnız görüntü basıyor. Önce
  ölçülecek şey: sağlayıcıdan doğrudan PNG istenebiliyor mu? İstenebiliyorsa yeni bir bağımlılık
  gerekmiyor. Ayrıca **4×6 kâğıtla gerçek bir prova şart** — kâğıdımız 103×164 mm, etiket A6
  (105×148) görünüyor, genişlikte ~2 mm taşma riski var.
- **Webhook ve durum zinciri.** Kargo siparişi bugün `ready`de takılı kalıyor: `out_for_delivery`
  ve `delivered`ı kargo kulvarında yazan hiçbir şey yok (bunu ölçtüm, tasarım kaydı §8.1). Tablolar
  ve durum eşlemesi hazır; webhook ucu ve nöbet cron'u yazılacak.
- **Native ekranlar** — mobil şeridin alanı; sözleşmeler hazır olunca talep açılacak.

## Senden bir karar

Etiket basımı için: sağlayıcıdan PNG istenemezse PDF→PNG çeviren bir bağımlılık eklemem gerekecek.
Küçük bir paket ama yeni bir bağımlılık — onayını almadan eklemem.

---

## 28.08 sabah — etiket basımı çözüldü, bağımlılık gerekmiyor

**Sorduğun soru doğru soruydu.** Ölçtüm: `expo-brother-printer-sdk` PDF'i **doğrudan basabiliyor**
(`printPDF`, native tarafta `printPDFAtPath`), ayarları görüntü basımıyla aynı. Çeviriye ve yeni
bir bağımlılığa gerek yok — bekleyen karar kapandı.

23.7'deki *"Brother yalnız görüntü basıyor"* notu bizim kendi kutu etiketimiz içindi (onu SVG
üretiyoruz); dışarıdan gelen PDF'e uygulanmıyormuş. Ölçmeden varsaysaydım gereksiz bir paket
eklemiş olacaktım.

**Yazılanlar:** etiket PDF'i özel kovaya kaydediliyor (`shipping-labels/{kutuId}.pdf` — üstünde
alıcının adresi var, herkese açık kovada duramaz), anahtarı kutuya yazılıyor, ve telefon tarafına
`printLabelPdf` eklendi (yalnız ilk sayfa: sağlayıcı bir gün gümrük belgesi eklerse ruloya art
arda basılırdı).

**Etiket saklanamazsa duyuru geri çekilmiyor** — gönderi alındı ve parası ödendi; satırı yazmamak
ödenmiş bir etiketi kayıt dışı bırakmak olurdu. `labelKey` boş kalıyor, hangi kutu olduğu
söyleniyor ve deftere yazılıyor.

### ⚠ Kendi hatam: test gerçek depoya yazmıştı

İlk yazımda duyuru kapısı doğrudan R2'yi çağırıyordu ve entegrasyon testi sahte bir PDF'i
**gerçek özel kovaya** yükledi. Depoda R2'ye yazan başka test yok — yani sessizce bir kural
çiğnenmişti: test yeşil geçiyor, kovada dosya kalıyordu.

Düzeltildi: yükleyici artık enjekte ediliyor (`fetchImpl` deseninin aynısı), testler sahte
yükleyiciyle koşuyor. Kovada kalan **6 sahte dosya silindi** (`dev/` önekindeydi, üretim kovası
değil).

Tam paket **3759/3759**.

---

## 28.08 öğleden sonra — E tamam: müşteri artık kargo servisi seçiyor

Checkout'un teslimat adımında eskiden statik bir *"2-3 iş gününde kargoda"* satırı vardı. Artık
taşıyıcı seçenekleri **canlı** geliyor: taşıyıcı adı, fiyat, süre, takipli mi. Müşteri seçiyor,
ücret ve toplam anında yeniden hesaplanıyor.

**Fiyat istemciden hiç sorulmuyor.** Ekran yalnız hangi seçeneği seçtiğini söylüyor; tutar
sunucudaki teklif listesinden okunuyor. Önseçimi de sunucu yapıyor (en ucuz) — istemci kendi
önseçseydi liste seçili görünür ama ücret sabit tarifeden hesaplanmış olurdu, yani ekran kendi
kendisiyle çelişirdi.

**Sessiz geri düşüş yok:** teklif alınamazsa sabit tarife uygulanıyor ve ekran bunu *söylüyor* —
sebebi ayrı cümlelerle (ölçü eksikliği bizim işimiz, seçenek yokluğu adresin gerçeği).

Yeni komponent yazılmadı: `ChoiceCard` bu ekranda zaten adres, gün ve ödeme yönteminde
kullanılıyordu — bu dördüncüsü.

### Yol boyunca: müşteri checkout e2e'si 27.08'den beri düşüyormuş

Kendi değişikliğimi doğrularken çıktı. Test fikstürünün künyesi *"varsayılanlar yeter, ürün
`active` doğar"* diyordu; ama 05.36 (27.08) hem varsayılanı `candidate` yapmış hem üç dil yayın
kısıtı eklemişti. Fikstür o günden beri **vitrinde hiç görünmeyen** ürün üretiyordu.

Arıza sessizdi: fikstür hata vermiyor, ürün gerçekten yaratılıyor — yalnız satılabilir olmuyor.
Kırmızı da ürünü değil "sepete ekle" düğmesini gösteriyordu. Düzeltildi, senaryo geçiyor.

**Testler:** 5 birim (motor) + tam paket 3764/3764 + müşteri e2e 13/15. Düşen 2 senaryo bildirim
şeridinin alanı (girişsiz ziyaretçi hesap sayfasından yönlendirilmiyor) — not bırakıldı.



---

## F (kalan) — webhook + durum zinciri + nöbet ✅

**Ne yaptım:** kargo siparişinin `ready`de takılı kalma sorununu bitirdim. Artık taşıyıcı koliyi
alınca sipariş yola çıkıyor, **tüm kutular** teslim olunca teslim ediliyor.

Uzlaştırma tek kapıda: webhook da saatlik nöbet turu da aynı fonksiyondan geçiyor. Gelen olay
yalnız *"bir şey değişti"* demek; durumun kendisi taşıyıcıya sorulup okunuyor. Sebep basit — gelen
gövdenin şeması belgeli değil, biçim oynadığı gün siparişi sessizce yanlış yere taşırdı.

### Yol boyunca bulduğum en önemli şey: durum tablosu yanlıştı

Kendi yazdığım eşleme tablosunu *"taşıyıcının tam kod listesi yayında yok"* varsayımıyla kurmuştum
ve metin araması yapıyordu. **Varsayım yanlıştı** — liste yayında ve tek çağrıyla alınıyor. Aldım
(35 kod), eski tabloyu ona karşı koşturdum:

| kod | benim tablom ne diyordu | gerçek | ne olurdu |
| --- | --- | --- | --- |
| `CANCELLATION_FAILED` | iptal edildi | **hata** | iptal EDİLEMEDİ demekken koliyi defterden düşürüp izlemeyi bırakırdık |
| `COLLECTED_BY_CUSTOMER` | taşıyıcı topladı | **teslim edildi** | teslim noktasından alınan sipariş sonsuza dek "yolda" kalırdı |
| `SHIPMENT_ON_ROUTE` · `DRIVER_ON_ROUTE` | tanımıyordu | **dağıtımda** | **sipariş "yola çıktı"ya hiç geçemezdi** |
| `ANNOUNCED_UNCOLLECTED` | taşıyıcıda | **hâlâ bizde** | taşıyıcı hiç almamışken "aldı" derdik |
| `REFUSED_BY_RECIPIENT` · `UNDELIVERABLE` · `ADDRESS_INVALID` | tanımıyordu | ret / müdahale | müşteri reddettiğinde hiçbir şey görünmezdi |

Toplam **yedi kod yanlış, on biri tanınmıyordu.** Hepsi sessiz arızaydı — her biri makul görünen
bir cevap üretiyordu. Tabloyu ölçülen listeden baştan yazdım; harf benzerliğine bakan kod kalmadı.

### Ekleyeceğim bir ayrım

Eskiden "cevap veremedim" tek bir şeydi. Artık üç: **tanıdım ve yerini biliyorum** ·
**tanıdım ama yerini söylemiyor** ("teslim adresi değişti", "iptal sürüyor") · **hiç tanımadım**.
Üçüncüsü operasyonda sayılıyor — tablonun büyümesi gerektiğinin işareti. Ayrım olmasaydı her adres
değişikliği o sayacı şişirirdi, hep yanan bir uyarı da uyarı olmaktan çıkardı.

### Bilerek yapmadıklarım

- **İade siparişe yazılmıyor.** Taşıyıcı "gönderene dönüyor" dediğinde mal daha kamyonda. İade
  stoğa ve paraya dokunuyor ve stok etkisi malın fiilen depoya girmesine bağlı — o an "iade edildi"
  yazmak olmamış bir olayı kaydetmek olurdu. Gönderi durumu ve ham kod deftere yazılıyor, kararı
  operatör veriyor.
- **Sipariş kapanışı (`completed`) yazılmadı.** Ölçtüm: kapanışı çağıran hiçbir üretim kodu yok —
  kargoda da rotada da. Yani eksik olan kargoya özel bir halka değil, zincirin tamamı. Kargoya özel
  bir kapanış yazmak iki kulvarı ayrı kurallara bölerdi. Görev satırı açtım (07.16), kararı sana
  soruyor: kapanış otomatik mi (teslimden N gün sonra) yoksa operatörün eylemi mi?

### Nöbet — webhook'un kaçırdığını yakalayan iki tur

Taşıyıcı başarısız çağrıyı 10 kez deniyor, sonra pes ediyor. Yarım günlük bir kesinti olayları
kalıcı yutabilir, o yüzden iki tarama var:

- **Takılı gönderi** (saat başı): ilerlemeyen gönderileri taşıyıcıya yeniden soruyor. Sorduktan
  sonra da ilerlememişse operasyon ekranına uyarı düşüyor — **kaç tane değil, hangileri**.
- **Öksüz/hayalet mutabakatı** (haftada bir): taşıyıcıda olup bizde olmayan koli (para ödendi,
  kayıt yok) ya da tersi. **Yalnız buluyor, hiçbir şey düzeltmiyor** — yolda olan bir koliyi
  otomatik iptal etmek, teslim edilecek malı yolundan çevirmek olurdu. El kitabı yazıldı:
  `docs/runbook/kargo-oksuz-gonderi.md`.

Tarama sonuna kadar gidemezse bunu **söylüyor**. Yarım tarama "öksüz yok" diye okunmamalı.

### Ölçerek bulduğum bir hâl

Kutusu olmayan bir gönderi ilerlemiyor — ve doğrusu bu. Uzlaştırma bizim kutularımız üzerinden
yürüyor; kutusu yoksa "en gerideki koli" diye bir şey yok, cevap "bilmiyorum". Taşıyıcının
listesine düşseydik kutuları kaybolmuş bir gönderi sessizce teslim sayılabilirdi. Nöbet onu takılı
diye raporluyor — susturmak değil, seni masaya çağırmak doğru davranış.

**Testler:** 50 birim (durum tablosu, 35 kodun hepsi) + 11 birim (imza + kimlik) + 15 entegrasyon
(durum zinciri) + 9 entegrasyon (nöbet) + 7 entegrasyon (webhook ucu). İmzayı taşıyıcının kendi
yayımladığı örnek değerle sınadım — kendi hesabımla değil.

**Testlerin gerçekten yakaladığını doğruladım:** iki korumayı geçici olarak kaldırdım, biri 1 test
diğeri 4 test düşürdü; geri koyunca yeşile döndü.

Tam paket **3850/3850**.

### Kalan

- **Etiket basımı** — `printPDF` telefonda var (ölçüldü), kalan iş çağıranı ve fiziksel prova.
  Senin kararınla gerçek bir akışta denenecek.
- **Native ekranlar** — mobil şeride talep açılacak.
- **Sipariş kapanışı** — yukarıdaki soru.
