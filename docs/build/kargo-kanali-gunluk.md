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


---

## F (kalan 2) — takip numarası müşteriye ulaştı ✅

**Ne yaptım:** bir önceki turda yazdığım zincir siparişi "yola çıktı"ya taşıyor ve müşteriye mail
gönderiyordu — ama o mailin takip kutusu **boş çıkıyordu**. Şablon takibi çiziyor, şema alanı
taşıyor, veri katmanı ise sabit `null` yazıyordu: *"alan hazır, kaynak yok."* Kaynağı bağladım.

Aynı bilgi üç yerde görünüyor (mail · müşteri sipariş detayı · mobil sözleşmesi). Üçü kendi
sorgusunu yazsaydı, çok kutulu hâl birinde doğru ötekinde eksik olurdu — ve eksik olan taraf hata
vermez, yalnız bir kutuyu hiç göstermez. Tek kapı yazdım, üçü oradan besleniyor.

### Tahminim yanlıştı, düzelttim

Tasarım kaydında *"şablon ve şema değişmiyor"* yazmıştım. Yanlıştı: çok kolili gönderide **her
kolinin ayrı takip numarası var**. Tek numara basan bir mail, üç kutulu siparişin ikisini görünmez
kılardı — müşteri eksik kutuyu bize sorardı. Şema diziye çevrildi, mail koli başına satır basıyor.

Kutu sırasını **`2/3`** diye yazdım, "Kutu 2/3" diye değil: rakam çifti her dilde aynı okunuyor ve
üç dile sözlük satırı eklemek gerekmedi. Tek kutuluda sıra hiç basılmıyor — `1/1` yazmak olmayan
bir bölünmeyi varmış gibi göstermek olurdu.

### İki meşru kaynak var, sessiz yedek yok

Duyurulan gönderi konuşuyor. Yoksa hazırlık panelinden **elle girilen** numaraya düşülüyor — o da
gerçek bir yol, sağlayıcının kapsamadığı taşıyıcı için. İkisi de doluysa gönderi kazanıyor; elle
girilen o durumda bayattır.

Elle girişte takip **bağlantısı** taşıyıcının adres kalıbından üretilmeye devam ediyor. Bunu
atlasaydım bugün çalışan "Kargoyu takip et" düğmesi elle girilen numaralarda sessizce kaybolurdu —
kimse fark etmezdi, çünkü hiçbir şey patlamaz.

### Müşteri ekranı

Tek kutuda görüntü **birebir aynı** kaldı (satır + büyük düğme). Çok kutuda numaralar alt alta ve
her biri kendi bağlantısını taşıyor; büyük düğme çizilmiyor — üç büyük düğme kartı okunmaz yapardı
ve hangisinin hangi kutu olduğunu da söylemezdi.

### Mobil şeridine dokunmadım

Native ekran eski üç alanı okuyor. Sözleşmeyi **ekleyerek** genişlettim (eski alanlar duruyor), yani
onların ağacı kırılmadı. Ama dürüst olmak gerekirse bugün orada üç kutulu bir sipariş yanlış
görünüyor: taşıyıcı adı "Kargo firması" diyor ve 3 numaradan 1'i gösteriliyor. Not bıraktım, geçiş
mekanik — onlar geçtiğinde eski alanları silerim.

**Testler:** 12 entegrasyon (kaynak + iki yüzey). Kaynağı koparıp doğruladım: 2 test kırmızıya
döndü. Tam paket **3862/3862**.


---

## F (kalan 3) — operasyon yüzeyi + besleme ✅

**Ne yaptım:** yazdığım zincirin ürettiği bilgiyi operatörün ekranına taşıdım ve beslemeyi
düzelttim.

### Sayaç yerine hata kaydı

Kendi açtığım borcu kapatırken fikrimi değiştirdim. Tasarım *"sistem ekranında N tanınmayan
taşıyıcı kodu"* diyordu ve ben o sayacı yazmıştım — ama çağıranını yazarken şunu gördüm: **sayaç
kaç tane olduğunu söyler, operatörün ihtiyacı hangi kod olduğudur.** Eşleme tablosuna yazılacak şey
odur.

Onun yerine her tanınmayan kod artık hata kaydına **uyarı** olarak düşüyor. Orada kod başına
gruplanıyor, sayılıyor ve **çözülene kadar duruyor** — bir sayaç ise pencere geçince sıfırlanır,
gece gelen kod sabah görünmez olurdu. Sayacı sildim; çağıranı hiç doğmamıştı.

### Ölçerken bulduğum bir arıza

Kargo siparişinin Teslimat kartı **"Kurye: sefer bekliyor · Sefer: açılmadı"** yazıyordu — sonsuza
dek. O iki satır rota kulvarının; kargoda kurye de sefer de hiç doğmuyor. Cevabı olmayan bir soruyu
boş bırakmak, operatöre eksik bir şey varmış gibi okutuyordu. Artık kargoda o iki satır yerine
taşıyıcı, gönderi durumu ve **kutu başına** takip numarası var; numaralar tıklanabilir.

Kaynak müşteri yüzeyiyle aynı kapı. İki ayrı sorgu bir gün ayrışır ve destek konuşması "bende
başka görünüyor"a dönerdi.

### Besleme boştu

Ölçtüm: `shipment` tablosunda **tek satır yoktu**. Yani yazdığım üç ekran da yalnız testlerde
görülebiliyordu — kimse bakıp "böyle mi görünmeli" diyemezdi. Beslemeye iki gönderi ekledim: tek
koli (taşıyıcıda) ve **çok koli** (yolda, iki ayrı takip numarası). İkincisi zorunlu bir kapsam
kovası oldu: "her kolinin ayrı numarası" kuralı tek kolili veride hiçbir ekranda görünmez — ve o
kural bir kez tam bu yüzden yanlış yazılmıştı.

Besleme **sağlayıcıya çıkmıyor**: duyuru gerçek para harcıyor. Satırlar doğrudan yazılıyor,
sağlayıcı kimlikleri `seed-` önekli — canlı bir gönderiyle karışmasınlar ve öksüz nöbeti onları
kendi hesabımızda aramasın.

### Ekranı kendim gördüm

`ui:shot` ile çektim, aydınlık ve karanlık modda kontrol ettim: taşıyıcı "Chronopost · Yolda",
altında "Kutu 1/2" ve "Kutu 2/2" ayrı takip numaralarıyla. Kurye/Sefer satırları gitmiş.

**Testler:** 1 entegrasyon daha (tanınmayan kodun hata kaydına düşmesi). Tam paket **3863/3863**.
Kapsam turu 157 kovanın hepsinde örnek buluyor.


---

## Yol boyunca: iki kararsız test kaynağı (yalancı kırmızı)

Tam paket bir koşuda kırmızı döndü ve **kod hatası değildi**: `delivery.test.ts` kurulumda
*"duplicate key value violates unique constraint"* deyip düştü, 7 test hiç koşamadı. Tekrar
koşturunca yeşildi — yani kaçırılması en kolay türden.

Ölçünce sebep çıktı: test posta kodları **1000 değerlik** bir alandan üretiliyordu
(`67` + `Date.now()`in son üç hanesi). İki ayrı çarpışma yolu vardı:

- `67` önekli dosya beslemenin gerçek Alsace kodlarıyla çarpışıyor (`67000` · `67100` · `67300` ·
  `67500`) — koşu başına **binde dört**. Düşen buydu.
- İki ayrı dosya aynı `99` önekini kullanıyordu; modül yükleme anları saniyenin aynı milisaniyesine
  denk gelirse birbirlerini eziyorlardı.

Kod artık tek bir yardımcıdan geliyor: `9` öneki (besleme hiç kullanmıyor) + süreç içinde artan
sayaç + rastgele hane. Sayaç aynı süreçteki dosyaları kesin ayırır, rastgele hane ayrı süreçlere ve
önceki koşulardan kalan satırlara karşı.

Yalancı kırmızı yavaş koşudan pahalı: olmayan bir hatanın teşhisine harcanan zaman geri gelmiyor —
üstelik bu düşüş koda hiç benzemiyor, "bölge kurulamadı" diyor.

## Ayrıca: nöbeti gerçek hesapta koşturdum

Öksüz/hayalet turunu canlı hesapta çalıştırdım (ücretsiz okuma). İlk sonuç bir **yalanımı** yakaladı:
seed satırlarına `seed-` öneki koyup künyeye *"öksüz nöbeti onları aramasın"* yazmıştım — ama nöbet
onları hayalet diye sayıyordu (2 adet). Önek artık gerçekten okunuyor; tur temiz.

Geriye kalan bulgu gerçek: **sağlayıcıda 1 öksüz gönderi var** — D aşamasında canlı denerken
açtığım ücretsiz mektup etiketi. Veritabanı o günden beri birkaç kez tazelendiği için bizdeki satırı
kalmadı. Yani nöbet ilk gerçek koşusunda gerçek bir öksüzü buldu; el kitabı tam bu hâl için yazılı.


---

# 29.08 — günlük mobil şeride devroldu

**Neden devir:** kargo kanalının kalan işi native yüzeylerde (`kargo-kanali-tasarimi.md §8.5–8.6`)
ve kullanıcı 29.08'de bu özellik için alan sınırını kaldırdı: *"sadece bu özellik için kendi alanın
dışına çıkabilirsin, projenin tamamına müdahale edebilirsin."* Günlük aynı defterde sürüyor —
ikinci bir defter açmak zincirin hikâyesini ikiye bölerdi.

**Devraldığımda ne buldum (ölçüldü, iddia edilmedi):**

| Halka | Durum |
| --- | --- |
| Ölçü · kutu kataloğu · koli planı · teklif · webhook · nöbet · takip kaynağı | ✅ çalışıyor |
| **Etiket satın alma** (`announceOrderShipment`) | ⚠ motor var, **üretim çağıranı YOK** |
| Etiket basımı (PDF) | ⚠ SDK'da kapı var, `printLabelPdf` yazılmadı |
| İş başına yazıcı seçimi | ❌ tek `settings` satırı, amaç ayrımı yok |
| Devir okutması | ❌ yok |
| Kargoda kutusuz onay reddi | ❌ karar var, kod yok |
| Kapanış (`completed`) | ❌ `closeOrder`ın hiç çağıranı yok — iki kulvarda da |

**Yani zincir tam ortasında kopuk:** sipariş hazırlanıyor, kutulanıyor, mühürleniyor — ve orada
duruyor. Sonrasındaki her şey bugün yalnız beslemeyle görülebiliyor.

## Kullanıcının 28–29.08'de verdiği kararlar (kanalın modelini değiştiriyor)

1. **Eşik ALTI müşteri seçer** — ve seçim iki kademeli: *teslimat noktası* ↔ *adrese teslim*.
2. **Eşik ÜSTÜ seçim sorulmaz** ve **ücretsiz kargo EVE gider**, noktaya değil.
3. **Sınırı geçen sipariş EVE gider** — yurt dışında nokta kademesi hiç çizilmez.
4. **Elle taşıyıcı seçimi yok:** ön tanımlı (onaylı) taşıyıcılar ∩ belirlenen süre ∩ (çok koliyse)
   multicollo → **en ucuzu otomatik**. Hiçbiri kalmazsa ham liste **depocuya** gösterilir.
5. **Yazıcı: envanter deposunda, seçim cihazın local storage'ında.**
6. **Kargoda kutusuz onay reddedilir.**

Bunların kod karşılığı ve ölçüm dayanağı `kargo-secim-ve-fiyat-raporu.md`'de.

## Ölçerken bulduğum arıza — mektup seçeneği otomatik seçiliyor

`quoteShipping` fiyatı **`null`** olanı süzüyor ama **sıfır** olanı süzmüyor (`quote.ts:61`).
Sağlayıcı her sorguya `sendcloud:letter` · **0,00 €** döndürüyor, liste ucuzdan sıralı ve
`checkout-snapshot.ts:342` seçim yoksa `options[0]`'ı alıyor — yani **daima mektup.** Her kargo
siparişinde ücret 0,00 € hesaplanıyor ve 15 kg'lık koli mektup tarifesiyle işaretlenmiş oluyor.

Ölçüm (FR→Paris, 5 kg): ilk satır `0.00 € sendcloud:letter`, ikinci satır `8.50 €
mondial_relay:home_domestic`. Sipariş başına kaçan **8,50 €**.

**Yaması "sıfırı at" DEĞİL** — yarın gerçek bir kampanya tarifesi de düşerdi. Doğrusu kullanıcının
istediği onaylı taşıyıcı listesi (Faz 2). Talep dosyası açıldı.

## Faz planı — zincirin koptuğu yerden başlıyorum

**Faz 1 (zinciri kapat):** çok kutulu takip · etiket satın alma ucu · PDF basımı + iş başına
yazıcı · devir okutması · kargoda kutusuz onay reddi
**Faz 2:** onaylı liste + otomatik seçim + iki kademe + depocu fallback
**Faz 3:** teslimat noktası (arama ucu · `service_point` adres türü · harita)
**Faz 4:** kapanış (`completed`) + iki yeni bildirim türü

---

## Faz 1.1 — mobil çok kutulu takip ✅

**Ne vardı:** native sipariş detayı eski üç alanı okuyordu (`carrier` · `trackingNumber` ·
`trackingUrl`). Üçü de İLK koliyi anlatıyor ve `carrier` sağlayıcının adını enum'a sıkıştırdığı
için çoğu gönderide `other` diyor. Yani üç kutulu bir siparişte ekran **yanlış taşıyıcı adı + üç
numaradan biri** gösteriyordu.

**Ne yaptım:** ekran `carrierName` + `parcels`a geçti.

- **Taşıyıcı adı iki kaynaklı, tek arama:** sağlayıcıdan gelen ad özel isimdir ve çeviri istemez;
  elle girilen taşıyıcı bir anahtardır ve ister. Tanıdığımız anahtar çevrilir, tanımadığımız olduğu
  gibi basılır — webin `carrierLabel` kararının aynısı. `carrierName` boşsa eski enum'a düşülüyor;
  elle girilmiş gönderi hâlâ meşru bir hâl.
- **Özet paneli koli başına satır yazıyor**, sıra (`2/3`) yalnız birden çok kutuda.
- **Takip bağlantısı:** tek kutuda görüntü **birebir eskisi gibi** (tek "Kargoyu takip et ↗"); çok
  kutuda kutu başına bir `TextAction` satırı, etiketinde sırası yazılı.

**Bir tasarım kararı, gerekçesiyle:** web numaraları satır içi bağlantı yaptı; mobilde özet paneli
(`SummaryPanel`) dokunulabilir satır taşımıyor. Onu dokunulabilir yapmak, paylaşılan bir kit
komponentini tek ekranın ihtiyacına göre genişletmek olurdu (`CLAUDE §1`) — bunun yerine ekranın
zaten kullandığı eylem satırı deseni çoğaltıldı.

**Doğrulama:** 4 yeni ekran testi (tek kutu değişmedi · çok kutuda her koli kendi satırı ve
bağlantısı · gerçek taşıyıcı adı · adresi olmayan koli düğme açmaz ama numarası durur).
Mobil jest **891/891**, `typecheck` · `lint` temiz.

**Sözleşme borcu kapandı:** `not-mobil-cok-kutulu-kargo-takibi.md` notunun istediği geçiş bitti.
Eski üçlü (`carrier` · `trackingNumber` · `trackingUrl`) artık native tarafından **okunmuyor** —
sözleşmeden silinebilir.

---

## Faz 1.2 — etiket satın alma ucu açıldı (zincirin kopuk halkası) ✅

**Ne kopuktu:** `announceOrderShipment` üretimde **hiç çağrılmıyordu**. Yani kutu kapanıyor,
mühürleniyor — ve orada duruyordu. Motoru vardı, kapısı yoktu.

**Ne yaptım:** iki uç açtım ve ikisinin de arkasına ORTAK bir zemin koydum.

    GET  /warehouse/orders/:id/dispatch-options   ← salt okuma, para harcamaz
    POST /warehouse/orders/:id/announce           ← GERÇEK PARA

### Ortak zemin, çünkü iki hesap bir gün ayrışırdı (`shipping/dispatch.ts`)

Depocuya "hangi servisle gönderelim" diye sormak, ön koşulların ve koli kurulumunun **ikinci kez**
yapılması demekti. Ayrı yazılsaydı listede görünen seçenek satın alma anında reddedilebilirdi —
ve o hâl **para harcandıktan sonra** görünürdü.

`resolveDispatch` artık tek yerde: ön koşullar (kulvar · adres · mühürlü kutu · kutu tipi ·
tartılmış mal · gönderici · koli tavanı) + kolilerin mühürlü kutulardan kurulması. Duyuru da
teklif de oradan geçiyor, yani listedeki fiyat gerçekten satın alınacak olanın fiyatı.

### Teklif niye checkout'unkinden ayrı

`quoteShipping` müşterinin sepetinden bir plan **kurar**; `quoteOrderShipment` depoda mühürlenmiş
kutuları **ölçer**. Sevk anında bağlayıcı olan ikincisidir — depocu üç kalemi tek kutuya sığdırmış
olabilir, ya da tam tersi.

Ve **ücretsiz "mektup" kanalı burada da eleniyor**: fiyatı sıfır olan seçenek gerçek bir kargo
hizmeti değil, ucuzdan sıralı listede daima başa geçiyor. Müşteri yüzeyinde ölçülen arızanın
aynısını depocuya yaşatmak, reddedilecek bir etiketi satın almaya davet etmek olurdu.

### Alıcı adresi artık ÇAĞIRANDAN alınmıyor

Eskiden duyuru girdisinde `to` vardı. Kaldırdım: adres siparişin kendi kopyasında
(`addressSnapshot`) duruyor ve gönderi oraya gidecek. İstemciden almak, depocunun telefonunu
müşteri adresini kuran taraf yapardı — yanlış yazılmış bir posta kodu hem yanlış tarife hem yanlış
teslimat demek. Yeni bir ön koşul dalı doğdu: `no_recipient`.

**E-posta bilerek gönderilmiyor:** sağlayıcı e-posta gördüğünde kendi takip bildirimlerini
yolluyor ve müşteriye biz zaten yazıyoruz. Telefon gidiyor — taşıyıcının teslimat için aradığı
numaranın bizde karşılığı yok.

### Ucun kendi kararı: sağlayıcı kapalıysa 503, boş liste DEĞİL

Anahtar yoksa ağa hiç çıkılmıyor ve uç bunu söylüyor. Boş liste dönseydi ekran "bu siparişe hiç
servis yok" derdi — yapılandırma eksiği, veri eksikliği gibi okunurdu.

### Yol boyunca: kök `typecheck` 28.08'den beri kırmızıymış

`scripts/seed/orders.ts:899` — `'kutuTipi' is possibly null`. Sebep: `if (kutuTipi)` daraltması
**hoisted iç fonksiyonda görünmüyor**. Turbo adımları yeşil olduğu için gözden kaçmış; kırmızı olan
kökün `tsc -p scripts` adımıydı. Daraltılmış değeri yerel bir sabite aldım (`!` ile susturmak
kontrolü de silerdi). Artık kök typecheck temiz.

**Doğrulama.** 5 yeni entegrasyon (adres kopyası yoksa/posta kodu boşsa sağlayıcıya çıkılmaz ·
ön koşullar teklifle ortak · koliler mühürlü kutulardan · fiyatsız ve sıfır seçenek elenir · çok
kolide multicollo süzgeci) + 3 uç testi (sağlayıcı kapalı 503 · gövdesiz duyuru 400 · bozuk kimlik
400). **Kilitli tam paket 3886/3886**, `typecheck` · `lint` temiz.

**Kalan (Faz 1.3):** telefonun bu ucu çağıran ekranı ve etiketin Brother'dan basımı.


---

## Mobil şeridin notu bir para kaçağı yakaladı ✅

Uyandığında ilk bakman gereken yer burası olabilir: **checkout her kargo siparişinde ücreti
0,00 € hesaplıyormuş.**

Sağlayıcı her sorguya ücretsiz bir "mektup" kanalı da döndürüyor (`sendcloud:letter` — bizim
bilinçli prova kanalımız). Yazdığım süzgeç yalnız *fiyatı olmayan* seçeneği eliyordu, **sıfır
olanı elemiyordu**; liste ucuzdan sıralı ve müşteri seçim yapmadığında ilk sıra alınıyor. Yani
15 kg'lık koli mektup tarifesiyle işaretlenip ücret sıfır yazılıyordu.

Canlı ölçtüm (Strasbourg → Paris, 5 kg):

```
   0,00 €  sendcloud:letter          ← alınan
   7,74 €  chronopost:shop2shop
```

Sipariş başına kaçan tutar bu örnekte **7,74 €**. Düzeltildi ve testi yazıldı; testin yakaladığını
süzgeci geri alarak doğruladım.

Notta *"fiyatı sıfır olanı atma, kampanya tarifesi de düşer"* uyarısı vardı — katılmadım ve
gerekçemi cevaba yazdım: **bu liste bizim maliyetimiz, müşteriden aldığımız ücret değil.** Ücretsiz
kargo bizim kararımız ve eşik mantığında yaşıyor; taşıyıcının 15 kg'ı sıfıra taşıması diye bir şey
yok. Sıfır, "bu kanalı fiyatlamıyorum" demek. (Mobil şeridin kendi kodu da zaten aynı kuralı
uyguluyordu.)

### Senin kararını bekleyen bir konu var

Aynı notta bir **kullanıcı kararı** aktarılmış: müşteri artık taşıyıcı seçmeyecek — eşik üstünde
"Ücretsiz kargo · adrese teslim" yazılacak, eşik altında iki kademeli seçim (teslimat noktası ↔
adrese teslim) ve nokta kademesinde harita olacak. Bu, dün yazdığım checkout adımını (düz taşıyıcı
listesi) geçersiz kılıyor.

Kararı ikinci elden okuyup yüzeyi yeniden kurmadım — sana soruyorum. Onaylarsan sıra: onaylı
taşıyıcı listesi → otomatik seçim politikası → checkout iki kademe → `/service-points` ucu.

---

## Faz 1.3 — telefon artık kargoya veriyor ✅

**Zincir tamamlandı:** kutu kapanır → **"Kargoya ver"** → servis listesi → duyuru → etiket PDF'i
indirilir → Brother'a basılır → damga.

### Ekranın en zor kararı: sipariş kuyruktan DÜŞÜYOR

Son kutu mühürlenince sipariş `ready`ye geçiyor ve hazırlık kuyruğu yalnız `confirmed`+`preparing`
okuyor — yani sevk anında sipariş listeden **kayboluyor**. Sevk kartı bu yüzden `order`a bağlı
değil, kendi durumunu taşıyor (etiket kartının aynı gerekçesi).

**Ve bunu test yakaladı:** kartı kuyruk ve sipariş dallarına koymuştum; kuyrukta TEK sipariş varsa
liste boşalıyor ve ekran "Toplanacak sipariş yok" dalına giriyor. Depocu tam kutuyu mühürlediği
anda etiket alma yolunu kaybediyordu. Kart üç dalda da çiziliyor artık — ve boş dal onun **en olası
yeri**.

### Seçim para harcıyor, o yüzden karttan ayrı katmanda

Servis listesi karta gömülseydi kart ekranın yarısını kaplayan bir tabloya dönerdi — ve kaza eseri
basılmaya en açık yer listenin ortasıdır. Çekmece niyeti ayırıyor: *"seçenekleri gör"* ayrı bir
adım, *"şununla gönder"* ayrı. Çekmece komponent oldu çünkü üç dalda da açılabilmeli.

Başlıkta **koli sayısı + ağırlık** yazıyor (`2 koli · 7,4 kg`): depocu elindekiyle ekrandakinin
aynı olduğunu doğrulayabilsin.

### Üç hâl de söyleniyor, hiçbiri sessiz değil

- **Ön koşul tutmadı** → sebebin ADI ("kalemlerin ambalaj ağırlığı yazılmamış"), "olmadı" değil.
  Çekmece hiç açılmıyor: cevabı olmayan bir listeyi göstermek boş bir seçim ekranı olurdu.
- **Süre bildirilmeyen servis** → "teslim süresi bildirilmiyor". Gizlemek depocuya "hemen gider"
  dedirtirdi (`CLAUDE §1`) — ve ölçüldü ki en ucuz seçenekler tam da süresi bilinmeyenler.
- **Basım** → basıldı / yazıcı modülü yok / hata cümlesi. Sessiz kalmak "bastı" sanılırdı.
  **Basım hatası duyuruyu geri çekmiyor** (23.7 çizgisi): gönderi alındı, parası ödendi.

### Etiket sunucudan AKITILMIYOR

`GET /warehouse/boxes/:id/shipping-label` imzalı bir adres döndürüyor, telefon PDF'i doğrudan
kovadan indiriyor. Sunucudan geçirmek her basımda VPS'i aradaki boru yapardı. İki hâl AYRI:
`not_announced` ("henüz satın alınmadı" → duyur) ve `no_label` ("alındı ama dosya saklanamadı" →
gönderiyi iptal edip yeniden duyur, ve bu bir OPERATÖR kararı çünkü ikinci duyuru gerçek para).

`printLabelPdf` SDK'nın `printPDF` kapısına bağlandı — **yalnız ilk sayfa** (`pages: [1]`): kargo
etiketi tek sayfadır ve sağlayıcı bir gün gümrük belgesi eklerse hepsi ruloya art arda basılırdı.

### ⚠ Kalan iki fiziksel açık

1. **İş başına yazıcı yok.** Etiket bugün deponun TEK ayarlı yazıcısından çıkıyor. Kargo etiketi A6
   yatay, bizim kutu etiketimiz 4×6 — aynı ruloya basılmaları fiziksel bir tesadüf olurdu.
   BEKLEYEN(kargo-kanali-tasarimi.md §4.7): `warehouse_printer(warehouse_id, purpose, …)` envanteri
   sunucuda, seçim cihazın local storage'ında (kullanıcı kararı 29.08).
2. **Kâğıt uyuşmazlığı ölçüldü ve duruyor** (tasarım §4.6): gerçek etiket 148×105 mm, rulo
   103×164 mm — döndürülünce 2 mm taşıyor. Sürücü küçültürse barkod da küçülür. **Basılan barkod
   okutularak doğrulanmadan bu iş bitmiş sayılmaz** ve bunu kod çözemez.

**Doğrulama.** 4 ekran testi (rota kartı doğurmaz · kargo kartı kuyruktan düşse de kalır · liste
gerçek kolileri anlatır ve seçim duyuruya gider · ön koşul tutmazsa sebep yazılır) + sözleşme
uçtan. Mobil jest **895/895**, `typecheck` · `lint` · `knip` temiz.

### Kargo şeridinden cevap geldi

`sendcloud:letter` arızasını doğrulayıp `quote.ts`te kapatmışlar. **Bir itirazları haklı:**
"sıfırı süzerek yamamayın" demiştim, oysa benim `dispatch.ts`im tam olarak `priceCents > 0` yapıyor.
Gerekçeleri de doğru — **bu liste bizim MALİYETİMİZ, müşteriden aldığımız ücret değil**; ücretsiz
kargo kararı eşik mantığında yaşıyor ve taşıyıcının 15 kg'ı sıfıra taşıması diye bir şey yok.
Beyaz liste hâlâ gerekli ama bu arıza için değil, **onaylı taşıyıcı ve teslim süresi** için.

**Ve açık bir uyarı bırakmışlar:** mektup elendiği için listenin başı artık
`chronopost:shop2shop` — yani bir **teslimat noktası**. *"Eşik üstünde ücretsiz kargo EVE gider"*
kuralı bugünkü otomatik seçimde henüz yok. Faz 2'nin ilk maddesi bu.

### Tam paket turunda üç düşüş — üçü de bize ait değil, ölçüldü

`pnpm test` **3895/3898**. Üç düşenin sahipliğini tek tek ölçtüm:

| Düşen | Sahibi | Kanıt |
| --- | --- | --- |
| `messaging/send.test.ts` | WhatsApp/sosyal şeridi | `send.ts` + `send.test.ts` ŞU AN çalışma ağacında kirli |
| `ticket/ai.test.ts` (servis penceresi) | aynı şerit | `domain-core/messaging/service-window.ts` kirli |
| `checkout-shipping-order.test.ts` | kargo şeridi (yalancı kırmızı) | **tek başına koşunca 5/5 GEÇİYOR** |

Üçüncüsü ilginç ve kayda değer: `blocked_lines` beklerken `address_city_mismatch` geliyor. Tek
başına yeşil, pakette kırmızı — yani **çapraz dosya girişimi**. Test rota siparişi kuruyor ve
`placesForPostalCode` sorusunu soruyor; posta kodu damgayla üretiliyor ve başka bir dosyanın
`postal_code_place` satırıyla çakışınca şehir eşleşmesi düşüyor. 28.08'de aynı sınıftan bir çakışma
zaten ölçülüp düzeltilmişti (`9` öneki + sayaç + rastgele hane) — bu, aynı kalıbın **ikinci
yüzü**: çakışan kod değil, çakışan YER kaydı.

**Kendi alanımı ayrıca koşturdum:** `shipping/*` + `warehouse/boxes` + `mobile-api/warehouse`
→ **133/133 geçti**. Mobil jest 895/895.

Kargo şeridine not bırakıldı; kendi test dosyaları ve kendi üreteçleri.


---

## Taşıyıcı seçimi — kararını yazdım ✅

Cümlen şuydu: *"Teslimat noktasına kullanıcı kendisi seçiyorsa ve kargo parası siparişin üzerine
ekleniyorsa olabilir. Ama eşiği geçtiyse ve kargo ücretsiz diyorsak evine teslim senaryosu
devrede."* Ayıran şeyi **paranın kimden çıktığı** diye yazdım:

- **Müşteri ödüyor** → seçim onun; teslimat noktası da meşru.
- **Biz ödüyoruz** ("ücretsiz kargo") → seçim bizim, koli **eve** gider, müşteriye sorulmaz.

### Kuralı checkout'a koymadım — çünkü orada işe yaramazdı

Ölçtüm: **müşterinin checkout'ta seçtiği servis kodu hiçbir yere yazılmıyor.** Yalnız gösterilen
ücreti belirliyor; taşıyıcıyı gerçekte depo seçiyor, sevk anında. Yani kuralı yalnız checkout'a
koysaydım onu *söylemiş* ama *uygulamamış* olurdum — depo yine teslimat noktası satın alabilirdi ve
müşteri ücretsiz kargo bekleyip kolisini noktada bulurdu.

Kural artık sevk kapısında bağlayıcı; checkout'ta yalnız **sormama** kısmı var: eşik üstünde liste
çizilmiyor, "Ücretsiz kargo — adresinize teslim" yazıyor (üç dil).

Bir incelik: son adımı **bilinmeyen** seçenek de eleniyor. "Bilmiyorum" ile "eve gidiyor" aynı şey
değil ve burada yanılmanın bedeli somut.

### Doğrulayamadığım bir şey

Checkout ekranını **gözle göremedim**: dev server kapalı (3000 cevap vermiyor). Paralel üretim
kopyası (3001) ayakta ama o donmuş bir kopya, benim değişikliğim orada yok. Kuralın kendisi birim
testli, sevkteki uygulaması entegrasyon testli ve ikisinin de yakaladığını kuralı geri alarak
doğruladım — ama ekranın son hâline bakmadım. Sunucuyu açtığında bir bakmak isteyebilirsin.

**Açık bıraktığım iki şey, ikisi de kayıtlı:** eşik üstünde teklif çağrısı hâlâ yapılıyor ve
sonucu kullanılmıyor (ücret zaten sıfır, kod saklanmıyor); ve onaylı taşıyıcı listesi + teslim
süresi süzgeci henüz yok.

Tam paket **3911/3911**.

---

## Faz 1.4 — devir okutması ✅

**Ne eksikti:** kutu etiketi alıp basılıyordu ama taşıyıcıya verildiğini yazan bir şey yoktu.
`courier/load.ts` aynı fiziksel olayı yazıyor (kutu depodan çıktı) ama kapısı `order.courierId`
şartına bağlı — **kargo siparişinin kuryesi yok.** Kargo kulvarına kendi kapısı gerekti.

### Sahiplik sorusu farklı, o yüzden kapı ayrı

Kurye kapısında soru *"bu kutu senin rotanın mı"*, kargoda *"bu kutu senin deponun mu"*. İkisi ayrı
kural; tek kapıya sıkıştırmak, birinin şartını ötekine borç yazmak olurdu.

### Okutulan şey taşıyıcının numarası — ama bizim kodumuz da kabul

Kargo kulvarında bizim QR'lı etiketimiz basılmıyor (tasarım §4.6: iki barkod taşıyıcının
tarayıcısını şaşırtır), yani kutunun üstündeki tek barkod taşıyıcınınki. **Bizim kodumuzun da kabul
edilmesi bir yedek değil bir gerçek:** etiketi saklanamamış (`no_label`) ya da elle taşıyıcı
girilmiş gönderide kutunun üstünde taşıyıcı barkodu olmayabilir; o hâlde depocunun elinde hazırlık
kâğıdındaki kod kalır. İki kimlik uzayı da BİZİM kayıtlarımız — tahmin yok, iki kolonda arama var.

### Sipariş taşıyan kural KOPYALANMADI

"Gönderi yolda ⇒ sipariş `out_for_delivery`" kuralı webhook'un kapısında yazılıydı; onu dışa açtım
(`siparisiTasi`) ve devir de oradan geçiyor. İkinci bir kopya, bir gün yalnız birinde değişen iki
durum makinesi olurdu (`CLAUDE §1`). Gönderi ilerideyse geri çekilmiyor: taşıyıcı bizden önce
okutmuş olabilir ve devir onu `in_transit`ten `handed_over`a geri almamalı.

### Ekran bir liste değil, bir okutucu

Fiziksel an şu: depocu rampada, kurye karşısında, kutuları tek tek uzatıyor. *"Hangi siparişi
vereceğim"* diye bir soru YOK. Bekleyenler listesi çizmek olmayan bir seçimi varmış gibi göstermek
olurdu — ekranın gövdesi bu yüzden **okutma geçmişi**: hangi kutu verildi, kaç kaldı. En yeni
üstte, çünkü depocu son okuttuğunun cevabını aramak için kaydırmamalı.

**Sayım GÖNDERİYİ sayıyor, siparişi değil:** bir siparişin kutuları iptal + yeniden duyuruyla iki
gönderiye bölünmüş olabilir ve depocunun elindeki yığın ikincisidir.

**İkinci okutma hata değil:** "zaten verilmişti, sayı değişmedi". Depocu rampada aynı kutuyu iki kez
okutabilir; hata cümlesi onu kendi sayımından şüphelendirirdi.

### Yol boyunca: expo-router tipleri bayattı

Yeni rota (`/handover`) eklendi ama `.expo/types/router.d.ts` üretilmiş bir dosya ve dev server
kapalıyken tazelenmiyor — `typecheck` "böyle bir rota yok" diyordu. Kullanıcının 8081'ine
dokunmadan **8099'da kısa süreli** bir Metro açıp tipleri ürettim ve kapattım. SDK 57'de bağımsız
bir `typegen` komutu yok (dokümandan doğrulandı).

**Doğrulama.** 4 entegrasyon (iki kimlik uzayı da çözülüyor · son kutu gönderiyi ve siparişi taşıyor
· ikinci okutma sayacı kıpırdatmıyor · duyurulmamış kutu ve başka depo reddediliyor) + 4 ekran
testi. Mobil jest **899/899**, `typecheck` · `lint` · `knip` temiz.

**Hub'a satır eklendi** (`D8 · Kargo devri`) — **rozet bilerek YOK**: "kaç kutu bekliyor" sorusunun
bir ucu henüz yok ve uydurulmuş bir sayı olmayan bir işi varmış gibi gösterirdi.
BEKLEYEN(kargo-kanali-tasarimi.md §8.6).


---

## Test borcumu kapattım

Kendi işimi denetledim: hangi parçanın testi yok diye baktım. Üç boşluk buldum, üçünü de kapattım.

**İki cron nöbetinin testi yoktu** — takılı gönderi ve öksüz gönderi turları. Altlarındaki motorlar
testliydi ama işin kendisi (anahtar yoksa atlama, eşiğin env'den okunması, operatöre ne yazıldığı)
denetlenmiyordu. Test yazabilmek için sağlayıcıyı enjekte edilebilir yaptım — depoda emsali vardı.

**Test yazarken iki şey ortaya çıktı:**

1. **Arka ucun kendi ortamında Sendcloud anahtarları yok.** Anahtarlar `apps/web/.env.local`da; arka
   uç onları görmüyor, yani nöbet orada sessizce kendini atlıyor. Bunu söylüyor (`job_run`a
   `skipped` yazıyor), ama canlıya çıkarken anahtarların arka uca da verilmesi gerekecek.
2. **İlk yazdığım test küresel bir sayıya bakıyordu** — `CLAUDE §4b`'nin tam yasakladığı şey. Aynı
   dosyanın önceki testleri de gönderi bırakıyor, yani sayı benim kontrolümde değildi. Kendi
   satırıma bakacak şekilde düzelttim.

**Posta kodu üretecinin de testi yoktu.** Tek işi kararsızlığı önlemek; sessizce bozulursa geri
gelen şey bir hata değil, teşhisi en pahalı arıza türü olur. İddiaları yalnız gerçekten garanti
edilene bağladım — "1000 çağrı hepsi benzersiz" yazmak tutmayacağı bilinen bir iddia olurdu ve bir
gün kendi kararsız testini doğururdu.

Üçünün de yakaladığını kuralları tek tek geri alarak doğruladım.

Tam paket **3935/3935**.

---

## Faz 1.5 — kargoda kutusuz onay reddi ✅ (Faz 1 tamam)

**Kullanıcı kararı 28.08 uygulandı.** Kutusuz akış ROTA kulvarında meşru ve öyle kalıyor (23.6'nın
bilinçli çift akışı); kargoda değil.

**Gerekçe ölçülebilir:** gönderinin ölçüsü de ağırlığı da **kutu tipinden** geliyor
(`dispatch.ts`). Kutusuz kapanan bir kargo siparişinin ikisi de yoktur → etiket satın alma HİÇ
yapılamaz → sipariş "hazır" görünür ve **sevk edilemez hâlde kalır.** En kötü arıza türü, çünkü
hiçbir yerde hata vermez.

**Duvarın yeri de bir karar:** duyuruda çarpmak, kutuların çoktan mühürlenmiş ve kartonun kapanmış
olması demekti — depocu malı geri açardı. Kapı hazırlık onayında, yani kartonu doldurmadan önce.

### Bu bir masa kısıtı getiriyor ve açıkça söyleniyor

Kutu döngüsü yalnız telefonda var (23.6 karar §1.1: *"web'de kutu açılmaz/kapanmaz"*). Yani
**kargo kulvarının hazırlığı artık telefondan yürüyor.** Web masasının cümlesi bunu söylüyor ve
çareyi de yazıyor — ret bir çıkmaz değil bir yönlendirme.

### Ekranın ulaşabildiği bir hâl var, o da yazıldı

Normalde kargo siparişi kutu moduyla açılıyor ve kutusuz CTA hiç çizilmiyor. Ama **web masasından
yarım başlamış** bir kargo siparişi (kutusuz `pickedQty > 0`) kutu moduna girmiyor — kalem düzeyinde
karışım RPC'ce reddediliyor (0048) — ve o hâlde eski CTA çıkıyor. Kapı reddediyor, ekran sebebi
yazıyor.

**Doğrulama.** 2 entegrasyon (kargo reddedilir ve **hiçbir satır yazılmaz** — `fulfilledQty` 0,
sipariş `confirmed` · rota etkilenmedi) + 1 ekran testi. Mobil jest **900/900**.

### Tam paket: bir kez daha yalancı kırmızı, bu kez env'den

İlk tur **3923/3927** döndü; düşen dördü de `shipment-watch.test.ts` ve hepsi
`{ skipped: 'not_configured' }` diyordu — yani sağlayıcı anahtarı o an ortamda yoktu. Dosya
anahtarları **süreç-genel `process.env`e** yazıyor (`beforeAll`) ve bir testinde geçici olarak
siliyor.

Ölçtüm: tek başına **5/5**, kardeş iş dosyasıyla **10/10**, benim uç testimle **58/58** — hiçbir
ikili bileşimde üretilemedi. İkinci tam paket **3935/3935 yeşil**.

**Kayda geçiyor çünkü üçüncüsü:** bugün üç ayrı yalancı kırmızı sınıfı görüldü — çakışan posta
kodu (28.08'de düzeltildi), çakışan **yer kaydı**, ve şimdi süreç-genel **env mutasyonu**. Üçünün
ortak kökü aynı: paylaşılan durumu değiştiren test. `SENDCLOUD_*` anahtarlarını enjeksiyonla
geçirmek (`sendcloudProvider(overrides)` zaten kabul ediyor) bu sınıfı kapatır —
BEKLEYEN(kargo-kanali-tasarimi.md §11.4).

---

# Faz 1 KAPANDI — zincir uçtan uca çalışıyor

    sipariş → hazırlık → kutu aç (TİP seçilir) → doldur → kapat
      → "Kargoya ver" → servis seç → etiket SATIN ALINIR → PDF basılır
      → devir okutması → gönderi taşıyıcıda, sipariş YOLDA
      → webhook/nöbet → teslim

**Faz 2'ye kalan ve ACİL olan:** kargo şeridinin uyarısı — mektup kanalı elendiği için otomatik
seçimin başı artık `chronopost:shop2shop`, yani bir **teslimat noktası**. Kullanıcının *"eşik
üstünde ücretsiz kargo EVE gider"* kuralı bugünkü seçimde YOK. Faz 2'nin ilk maddesi bu.
