# Profesyonel müşteriye satış — sipariş, fatura, cari

> **Statü: KARAR ALINDI (11.10.2026); Faz 0 ve Faz 1 tamamlandı (davet bağlantısı sonraya); Faz 2 ve Faz 3 tamamlandı (mobil sipariş girişi; kapıdan ve araçtan profesyonele satış, vadeli dahil).** Özelliğin tek kaydı bu dosya: kararlar, akışlar, yol haritası ve
> açık sorular burada tutulur; iş `docs/KALAN.md`'ye satır olarak açılmaz. Her faz ayrı onayla başlar. Muhasebe zemini
> [`kasa-muhasebe.md`](kasa-muhasebe.md), iki işin ayrımı [`iki-is.md`](iki-is.md)'dedir.

Personel (ofiste web'den, sahada mobilden) profesyonel müşteri adına sipariş girer. Mal depoda hazırlanıp kuryeyle gider ya
da personel aracındaki maldan o an satar. Fatura Pennylane'de kesilir, müşteri havaleyle öder (cari). İhtiyaç QUALITE'den
doğdu; Lezzet de profesyonel satışında aynı usulü kullanır. Asıl hedef B2C kalır: vadeli satış istisnadır, altyapı B2B'ye
uygundur. Sistemde ayrı bir satış rolü yoktur: siparişi personel girer, teslim eden kuryedir.

## 1. Kararlar (kullanıcı, 11.10)

| # | Karar | Sonucu |
|---|---|---|
| 1 | **Ana iskelete dokunulmaz:** hesap birleştirme, kimlik, sipariş durum makinesi, siparişin ödeme hesabı | Her adım dokunuş seviyesiyle planlanır (§5); çekirdek değişikliği yoktur. |
| 2 | **Profesyonel müşteride SIRET de e-posta gibi miras anahtarı;** devri yönetici onaylar | SIRET herkese açık bir numaradır, tek başına devir yapmaz; aynı SIRET'li kayıt onay kartında aday olur. |
| 3 | **Miras birleştirmeyle değil e-posta değiştirerek sağlanır** | Girişe bağlanmamış kaydın e-postası değişir; müşteri o e-postayla girince kayıt ve siparişleri ona bağlanır (`0002_auth_user_profile_trigger.sql`). |
| 4 | **Müşteri başka e-postayla açmak isterse davet bağlantısı** | Müşteri e-postasını kendisi yazar; 3. kararın kolaylaştırılmış hâlidir. |
| 5 | **Bir fatura bir ya da birçok siparişi kapsar** | Teslim başına ya da ay sonu; müşteri başına ayardır. |
| 6 | **Resmî fatura öne alınır** | Fatura Pennylane'de kesilir (2027 e-faturası dahil) ya da muhasebeciyle konuşulur; sistem resmî belge üretmez. |
| 7 | **Operasyon mobil uygulamasında sipariş girişi şart;** ofis de saha da girer | Mobilde kurye ve depocu rolleri (ve yönetici) sipariş girer; yeni rol açılmaz. |
| 8 | **Pazarlık yalnız yönetici rolünde** | Kişi kurye ya da depocu da olsa yöneticiyse pazarlık yapar; web ve mobil aynı kuralı okur. |
| 9 | **Vade için tek kural, en sıkısı herkese** | Yasadaki süreler üst sınırdır, daha kısa vade her zaman serbesttir; ürüne göre ayrım gerekmez (§3). |
| 10 | **Araçtan profesyonele vadeli satış ilk sürümde** | Yerinde satışa müşteri seçimi ve vadeli girer; anonim yerinde satış değişmez. |
| 11 | **Peşin havale kalkar** | Havale yalnız vade izni olan müşteriye açıktır; izni olmayan online ya da kapıda öder. |
| 12 | **Toplu havale satın alma faturalarındaki gibi çözülür** | Havale faturalara bağlanır; bir havale birden çok faturayı, bir fatura birden çok havaleyi tutarıyla kapatır. |
| 13 | **Bir şirkete birden çok kişinin girmesi kapsam dışı** | Bir kayda tek giriş bağlanır. |
| 14 | **Müşteri ayrıca boş bir hesap açtıysa boş hesap silinir** | Boş hesap GDPR silmeyle kapanır (giriş silinir, e-posta boşalır), e-posta ofisin açtığı kayda yazılır, müşteri yeniden girer ve kayıt ona bağlanır; birleştirme kullanılmaz. |
| 15 | **Yeni profesyonel kayıt yöneticinin işlemlerini bekler; mevcut akış değişmez** | Sahada açılan kayıt, yönetici B2B onayını ve vade iznini (limit, süre) verene kadar perakende fiyatla ve peşin yollarla alır; QUALITE müşterisi sayılmaz, vadeli sipariş giremez. |
| 16 | **Limit aşılınca vadeli sipariş yazılmaz; yönetici limiti artırınca seçenek açılır** | Bugünkü davranış: ödeme seçenekleri her okumada müşterinin güncel limitinden hesaplanır. Tek seferlik geçirme yolu kurulmaz. |
| 17 | **Bilgisi tam satış faturası teslimde kendiliğinden kesilir; eksik olan onay bekler** | Fatura teslim edilen miktarlardan hazırlanır, hemen kesinleşir ve müşteriye gider. SIREN ya da fatura adresi yoksa ya da kayıt B2B onayı almamışsa "Kesilecek faturalar" listesinde onay bekler (§5, Faz 4). Kesinleşen fatura düzenlenmez; düzeltme alacak notu ve yeni faturadır. |
| 18 | **Varsayılan fatura modu teslim başına** | Her teslimden sonra bir fatura; ay sonu toplu fatura müşteri başına seçilen bir ayardır. |
| 19 | **Fatura iki görünümle, tek numara sırasıyla kesilir** | QUALITE ve Lezzet Anatolie için ayrı Pennylane şablonu (logo, ticari ad); numara sırası ortak. Mevzuat tek ve kesintisiz sırayı ister; Pennylane'de numaralandırma şablondan bağımsızdır (§3). |
| 20 | **Pennylane'de aynı firma SIREN ya da KDV numarasıyla bulunur; kaydı bizden güncellenir** (12.10) | Elle açılmış kayıt ikinci kez açılmaz, satış faturası ona kesilir; uyan birden çok kayıt varsa fatura bekler. Unvan, kimlik ve fatura adresi bizden yazılır; e-postalar muhasebenindir. |

## 2. Saha akışları

**Akış A — sipariş girilir, mal depodan kuryeyle gider**
1. Personel müşteriyi arar (ad, telefon, SIRET). Yoksa yeni profesyonel kayıt açar: SIRET'ten resmî kayıttaki unvan ve
   adres; fatura e-postası; telefon.
2. Kalemler müşterinin fiyatıyla gelir (özel → grup → liste). Pazarlık yalnız yönetici.
3. Teslim adresi depoyu ve günü belirler.
4. Ödeme: kapıda (nakit, kart) ya da vadeli (izin ve limit varsa).
5. Depo hazırlar, kurye seferle götürür, teslimde imza ya da fotoğraf alır.
6. Fatura Pennylane'de doğar ve müşteriye e-postayla gider (teslimde ya da ay sonunda).
7. Havale gelir, faturalara bağlanır, siparişler ödendi olur.

**Akış B — aracındaki maldan satış**
1. Personel aracını depo olarak seçer (bugünkü yerinde satış) ve müşteriyi seçer.
2. Kalemler araç stoğundan, müşterinin fiyatıyla gelir.
3. Ödeme: nakit, kart ya da vadeli.
4. Satış o an kapanır; fatura ve tahsilat Akış A'daki gibidir.

## 3. Yasal zemin (kaynaktan okundu, 11.10)

- **Fatura her profesyonel satışta zorunludur:** teslimde ya da aynı ay içindeki teslimatlar için en geç ay sonunda toplu
  fatura (CGI art. 289; DGCCRF broşürü).
- **Vade üst sınırı** (Code de commerce L441-10): fatura gününden 60 gün ya da 45 gün ay sonu; toplu faturada fatura gününden
  45 gün; sözleşmede yoksa malın alınmasından 30 gün.
- **Bozulabilir gıda, donuk et ve balık, hazır yemek** (L441-11): toplu faturada teslimin düştüğü on günlük dilimin
  bitiminden 30 gün. Dilimler ayın 1–10'u, 11–20'si ve 21'inden ay sonuna kadarıdır.
- **E-fatura:** almak 01.09.2026'dan beri zorunlu, göndermek bizim boyumuzda 01.09.2027'den ([`kasa-muhasebe.md`](kasa-muhasebe.md) §1).
  Fatura alıcıya SIREN'iyle yönlenir; alıcının SIREN'i faturada zorunlu yazı olur.
- **Fatura teslimde kesilir** (Code de commerce L441-9: satıcı faturayı satış gerçekleşir gerçekleşmez verir). Kesinleşen fatura
  değiştirilmez; sonraki iade ya da şikâyet alacak notuyla düzeltilir.
- **Numaralandırma** tek, kronolojik ve kesintisiz bir sıradır; ayrı seriler ancak faaliyet koşulları gerektiriyorsa ve ayrı
  önekle olur (BOI-TVA-DECLA-30-20-20-10 §70–100). Satıcının adı (QUALITE), adresi ve KDV numarası zorunludur.
- **E-fatura gönderimi:** Pennylane onaylı platformdur. Gönderim şirket ayarlarından bir kez açılır (Paramètres › Transmission de
  factures; şirket yöneticisi ya da muhasebeci açar, şirketin imzalı alım rızası ya da açan kişinin kimlik doğrulaması gerekir).
  Sonra Pennylane'den gönderilen fatura müşterinin seçtiği platforma gider, fatura ve ödeme verisi vergi idaresine iletilir.

## 4. Bugünkü durum (ölçüldü, 11.10)

| Konu | Bugün | Yer |
|---|---|---|
| Sipariş girişi | Yalnız web, yalnız yönetici | `apps/web/app/(operations)/operations/orders/new/` |
| Mobil sipariş girişi | Yok; mobil tasarımda da yok | `design/02-operasyon/Operasyon Mobil.dc.html` |
| Araçtan satış | Hep anonim alıcı, anında ödeme, kanal B2C; QUALITE deposunda kapalı | `packages/application/src/order/on-site-sale.ts`, `apps/mobile-api/src/api/v1/sale.ts` |
| Pazarlık | Web'de yalnız yönetici; mobil araçtan satışta kurye ve depocu dahil herkes | `apps/mobile-api/src/api/v1/sale.ts` |
| Yeni kayıtta SIRET | Alınmıyor; mükerrer arama yalnız telefon ve ad | `packages/database/src/services/user-profile.service.ts` |
| Miras | E-postası tutan girişte kendiliğinden; şirket kayıtları birleştirilemez; yönetici birleştirme ekranı yok | `supabase/migrations/0040_customer_merge.sql` |
| Vadeli işaret | Sunucu vade iznini denetlemiyor; seçeneği yalnız ekran gizliyor | `packages/application/src/order/checkout-draft.ts` |
| Peşin havale | Havale beklenmeden kesinleşir ve teslim edilir | `packages/application/src/order/place-order.ts` |
| Vade günü | Siparişin açıldığı günden sayılıyor | `packages/domain-core/src/payment/credit.ts` |
| Havale eşleştirme | Bir banka satırı tek siparişe; aday yalnız son 30 günde teslim edilen; ipucu yalnız sipariş numarası | `apps/web/lib/bank/reconcile.ts` |
| Satış faturası | Pennylane'de elle; numarası siparişe elle (raporlar › fatura kuyruğu) | `order.invoice_no` |

## 5. Yol haritası

Dokunuş seviyeleri: **S0** kodsuz (ayar, süreç, Pennylane şablonu) · **S1** yerel (var olan kapıları çağıran uç ya da ekran,
tek kuralın düzeltilmesi; şema yok) · **S2** eklemeli şema (yeni tablo, kolon ya da sabit hesap; var olan akış değişmez) ·
**S3** çekirdek (kimlik, birleştirme, durum makinesi, siparişin ödeme hesabı) — **bu yol haritasında yok**.

| Faz | İş | Seviye | Var olan akışın davranışı |
|---|---|---|---|
| 0 | Zemin onarımı: vadeli işaret sunucuda, peşin havale kalkar, mobilde pazarlık yalnız yönetici — **tamamlandı** | S1 | Dar değişir; meşru akış etkilenmez |
| 1 | Profesyonel kayıt (SIRET) ve miras — **tamamlandı** (davet bağlantısı sonraya) | S0 + S1 | Değişmez |
| 2 | Mobilde sipariş girişi | Tasarım + S1 | Web masası ortak katmana taşınır, davranış aynı |
| 3 | Araçtan profesyonele vadeli satış | S1 + hızlı satış kapısında dar değişiklik | Anonim yerinde satış aynı |
| 4 | Satış faturası Pennylane'de | S0 + S2 | Değişmez |
| 5 | Tahsilat ve cari: satın alma gibi | S1 + S2 | Havale kuyruğuna yeni hedef |

Sıra: 0 → 1 → 2 ve 3 (tasarım birlikte) → 4 → 5. Faz 4–5'e kadar fatura ve havale eşleştirmesi bugünkü gibi elle yürür.

**Faz 0 — zemin onarımı**
- Vadeli işaret sunucuda denetlenir: sipariş, vade izni ve limiti uygun değilse yazılmaz (`checkout-draft.ts`).
- Peşin havale kalkar: havale yalnız vadeli siparişte; müşteri ödeme adımından (masaüstü, mobil web, native) ve operasyon
  masasından ayrı "Havale ile öde" seçeneği çıkar (`packages/domain-core/src/payment/checkout-options.ts`).
- Mobil araçtan satış, yönetici olmayandan gelen pazarlıklı fiyatı reddeder; ekranda fiyat düzenleme yalnız yöneticiye görünür.
- Belgeler koda uyar: DOMAIN §5 (pazarlık) ve §7 (peşin havale, limit aşımı).
- **Açık:** tasarım dosyası (`design/01-musteri/ekranlar/Musteri - Checkout.dc.html`) peşin "Havale ile öde" kartını hâlâ
  çiziyor; kod kararı izliyor, tasarımın da güncellenmesi gerekir.

**Faz 1 — profesyonel kayıt ve miras**
- Yeni kayıtta SIRET (**tamamlandı**, web sipariş masası): resmî kayıttan unvan ve fatura adresi `company_info`'ya yazılır, kayıt
  onay kuyruğuna girer. Kayıt açma ortak katmanda (`packages/application/src/customer/staff-customer.ts`); mobil Faz 2'de aynı
  fonksiyonu çağırır. Müşteri araması SIRET'le de bulur.
- Aynı SIRET uyarısı (**tamamlandı**): B2B onay kartının aday listesi SIRET'e de bakar; kayıt açarken aynı SIRET ya da e-postayla
  kayıt varsa yenisi açılmaz, pencere var olanı "Bu kaydı seç" ile önerir.
- E-posta değiştirerek miras (S0, bugün çalışıyor): girişe bağlanmamış kaydın e-postasını yönetici değiştirir; müşteri o
  e-postayla girer. Müşteri ayrıca boş hesap açtıysa boş hesap GDPR silmeyle kapanır (giriş silinir, e-posta boşalır),
  e-posta ofisin kaydına yazılır, müşteri yeniden girer.
- Girişe bağlı kayıtta e-posta salt okunur (**tamamlandı**): düzenleme penceresi alanı kilitler, sunucu değişikliği reddeder.
- SIRET ile devir (**tamamlandı**, web onay kartı): aynı SIRET'li girişsiz kaydın satırında "Bu kayda bağla" yukarıdaki
  adımları sırayla yapar; başvuru hesabında sipariş varsa devir yapılmaz. Mobil onay ekranında düğme yok, tasarım ister.
- Davet bağlantısı (S2) sonradır.

**Faz 2 — mobilde sipariş girişi**
- Önce tasarım: mobil ekranlar (müşteri ara ya da yeni profesyonel kayıt, kalemler, teslim günü, ödeme ve vadeli, özet),
  Akış B'nin müşteri seçimiyle birlikte. Öneri panosu Claude Design'da (`07-kesif/Kesif - Operasyon Mobil Siparis.dc.html`).
  **Seçilen akış tek sayfa (1b), hâlleri 2a'da onaylandı.** Dört bölüm (müşteri, teslim, ürünler, ödeme) aynı ekranda; alttaki
  düğme eksik olanı söyler; duraktan açılınca müşteri ve adres gelir, gün kendiliğinden seçilmez.
  **Seçim düzeni 3a (onaylandı):** ekranda hiçbir öğe yerinden oynamaz. Müşteri, adres ve ürün sayfanın üstüne açılan tam
  ekran seçicide seçilir; arama kutusu, yeni kayıt düğmesi ve liste başı her hâlde aynı yerdedir. Sayfa bölümleri sabit boydadır,
  kapanıp açılmaz; uyarı ve kapalı seçeneğin sebebi satırın kendi ikinci satırında yazar; sıfıra inen kalem yerinde kalır.
  Müşteri araması iki harften başlar, 20'şer sayfalanır; ürün seçici arama boşken kataloğun tamamını sırasıyla gösterir.
- Web masasının okumaları ve yazımı ortak katmanda (`packages/application/src/order/staff-order.ts`); web aynı fonksiyonları
  çağırır, ret cümlesi iki yüzeyde aynıdır.
- Mobil uçlar `/api/v1/staff-order` altında: müşteri arama (kalan vade limitiyle), resmî kayıt önizlemesi, kayıt açma, adresler,
  teslim bağlamı ve sepet tutarına göre ödeme ön izlemesi, kalem seçicisi, sipariş. Kurye, depocu ve yönetici girer;
  pazarlıklı fiyatı yalnız yönetici yazar, maliyet ve hedef marj yalnız yöneticiye gider. Barkod, SKU ya da tedarikçi koduyla
  okutma koli çarpanını sayar; duraktan açılan siparişin müşterisi ve adresi sunucuda durağın siparişinden çözülür; stok reddinde
  sepetteki boyların kalanı siparişin deposundan yeniden okunur.
- Mobil ekran `apps/mobile-operations/src/screens/staff-order/`: girişler depo merkezindeki D10 "Yeni sipariş" kutusu ve kurye
  durağındaki "Bu müşteriye sipariş aç" bağlantısı. Yeni profesyonel kayıt sahada SIRET'le açılır (aynı SIRET varsa o seçilir),
  yeni adres müşterinin defterine eklenir.

**Faz 3 — araçtan profesyonele vadeli satış**
- Yerinde satışa isteğe bağlı müşteri (`?customerId=`): seçilirse fiyat, kanal ve KDV müşteriden okunur, borç her tabanda KDV
  dahil yazılır; müşterinin işi deponun işiyle tutmazsa satış açılmaz. Anonim satış olduğu gibi kalır.
- Vadeli satış yalnız seçilmiş müşteride, havale yöntemiyle ve vade freni (`resolveCheckoutPayment`) izin verirse yazılır; hızlı
  satış kapısı (`packages/application/src/order/quick-sale.ts`) vadeli siparişte kapı hesabı aramaz ve tahsilat yazmaz.
- QUALITE deposunda anonim satış kapalı kalır; adı belli QUALITE müşterisine açılır.
- Mobil ekran: katalogda müşteri satırı (sipariş girişinin seçicisi ve yeni kaydı), sepette vadeli seçeneği ve sebebi.
- Ölçüldü: vadeli araç satışı seferin beklenen nakdine girmez (beklenen nakit tahsilat hareketinden sayılır); geri bildirim daveti
  doğmaz (kapı satışında teslim kaydı yoktur, profesyonel müşteri zaten dışarıda); ödenmemiş satış havale kuyruğunda aday olur;
  B2B nakdi kasaya fiş olarak değil kasa girişi olarak gider (`register/plan.ts`, `sync.ts`).

**Faz 4 — satış faturası Pennylane'de**
- S0 (kullanıcı): iki işin şablonu Pennylane'de açılır (Paramètres › Facturation client › Personnalisation, "Invoice template";
  logo, ticari ad, IBAN, "açıklamaya fatura numarasını yazın"). Şablon sayısı Pennylane planına bağlıdır, iki şablon en az Basique
  ister. Ayarlar › Pennylane'de şablon adıyla seçilir: liste arka ucun anahtarı ve kipiyle (`PENNYLANE_MODE`) Pennylane'den okunur,
  kimlik sayı olarak saklanır; boşsa fatura Pennylane'in varsayılan şablonuyla kesilir. Anahtar bütün yetkilerle açıldı (kullanıcı,
  12.10); şablon listesi sandbox'ta okundu, müşteri ve müşteri faturası erişimi ilk kesimde ölçülür.
- Satış faturası bizde belge olur: `money_document` (karşı taraf müşteri, yön giriş), siparişleri `money_document_order`, akışı
  `sales_invoice` (onay bekliyor · kuyrukta · kesildi) ([`data-model/para.md`](../architecture/data-model/para.md)).
- **Açılış (tamamlandı):** backend işi on dakikada bir faturası açılmamış satışları tarar. Aday, kasanın yazmadığı satıştır (kanal
  `b2b`, hediye dışı), böylece aynı satış hem fişe hem faturaya girmez. Teslim başına modda (varsayılan, karar 18) fatura hemen, ay
  sonu modunda ayın son günü 20.00'den (Paris) sonra açılır; ay sonu faturası müşteri, iş, ay ve KDV rejimi aynı olan satışları
  toplar. Tutar ve KDV kırılımı dökümün hesabından, teslim edilen adetten çıkar; siparişin tahsil edilmiş parası faturaya bağlanır.
  Bilgisi eksik fatura (SIREN, fatura adresi, B2B onayı; Alman şirket SIREN yerine geçerli KDV numarasıyla tanınır) onay bekler ve
  her turda müşteri kaydından yeniden hesaplanır.
- **Kesim (tamamlandı, Pennylane'de ölçülmedi):** kuyruğa giren fatura için müşteri Pennylane'de dış referansla, yoksa aynı SIREN
  ya da KDV numarasıyla bulunur (karar 20), hiçbiri yoksa fatura adresiyle açılır; bağlı kaydın unvanı, kimliği ya da adresi bizden
  ayrıysa fatura kesilmeden önce güncellenir. Fatura taslak açılır: kalem başına KDV hariç birim fiyat, kargo oran payı başına bir satır, çok siparişli faturada satır
  sipariş numarasını taşır, ters yüklemede dökümün ibaresi ("Autoliquidation") basılır. Pennylane'in hesapladığı toplam bizimkiyle
  aynıysa fatura kesinleşir, numarası belgeye ve siparişlere (`order.invoice_no`) yazılır, fatura müşteriye e-postayla gider.
  Toplam farklıysa taslak bekler ve muhasebeye bir kez haber gider. Fatura günü kesildiği gündür, vade o günden hesaplanır.
- Vade günü tek kuralla: fatura günü + müşterinin vadesi, ama faturadaki ilk teslimin on günlük diliminin bitiminden 30 günü
  geçmez.
- **Ekran (tamamlandı, tasarım 5a):** Para'nın "Belgeler" sekmesinin adı "Faturalar" oldu. Satış faturası alış belgeleriyle aynı
  listede durur: rozeti "Satış faturası", karşı tarafı müşterinin yasal adı, alt satırda durumu (onay bekliyor ve eksikleri,
  Pennylane sırasında, Pennylane'e gitmedi ve sebebi, Pennylane ✓). "Kesilecek faturalar" süzgeci kesilmemiş satış faturalarını
  sayar ve süzer. Eksiği olan satırda "Müşteriyi aç", olmayanda "Onayla" durur; yönetici ve muhasebe onaylar, onay önce müşterinin
  faturalarını yeniden hesaplar. Onaylanmadan geceyi geçiren fatura panonun "Bugün" kümesinde sayılır. Raporlar'daki elle numara
  kuyruğuna B2B satışı girmez, elle numara da almaz. Tasarımdan tek fark: satırda "müşteriye gönderildi" yazmaz, çünkü gönderimin
  başarısı kaydedilmiyor.
- **Kalan:** Pennylane ölçümü (§7); alacak notu (faturadan sonraki iade ya da eksik "Kesilecek faturalar"a taslak olarak düşer,
  şeması Pennylane'deki açılışı ölçüldükten sonra Faz 5'in şemasıyla gelir); asistanın belge önerisi açıklaması
  (`packages/application/src/assistant/kind-meta.ts`) hâlâ "Belgeler sekmesi" diyor, dosyanın yorum temizliğiyle düzeltilir.

**Faz 5 — tahsilat ve cari**
- Havale kuyruğunda açık satış faturaları aday olur; ipucu fatura numarası ve müşteri adıdır.
- Bir havale birden çok faturayı, bir fatura birden çok havaleyi kapatır; tutar satın almadaki kuralla bağlanır.
- Siparişler ödendi olsun diye banka satırı aracı hesaba transfer olur, aracı hesapta faturanın siparişlerine tahsilat
  yazılır. Aracı hesap sıfırlanır, banka parayı bir kez sayar, siparişin ödeme hesabı değişmez (Revolut Merchant düzeni).
  Aracı hesap yalnız bizde durur ve Pennylane'e eşlenmez; Pennylane'de havale doğrudan müşteri faturalarına eşlenir, muhasebeciye
  giden veri de oradan çıkar.
- Eşleşme Pennylane'deki müşteri faturasına yazılır; vadeli frenin açık bakiyesi ve gecikmesi faturanın vade gününü okur.

## 6. Açık sorular

1. Bekleyen: şirketin e-fatura alım kaydının EBP'de olup olmadığını kullanıcı teyit ettiriyor; teyitten sonra Pennylane'de
   gönderim açılır.
2. Bekleyen: muhasebeciye giden dosyanın biçimi, muhasebeci istediğinde belirlenir.
3. Muhasebeciye: Almanya'ya mal tesliminde faturaya basılan ibare. Döküm ve fatura bugün yalnız "Autoliquidation" yazıyor; AB içi
   mal teslimi için kaynak "Exonération de TVA, article 262 ter, I du CGI" ya da denk bir ibare istiyor
   ([CCI Paris](https://www.entreprises.cci-paris-idf.fr/fiches-pratiques/factures-quelles-sont-les-mentions-obligatoires),
   [Legifiscal](https://www.legifiscal.fr/tva/tva-internationale/facture-mentions-obligatoires-operations-internationales.html)).
   Kesinleşen fatura değişmediği için Almanya'ya ilk faturadan önce netleşmeli.

## 7. Ölçülecekler

- Aracı hesabın türü ve iade yolu: B2B iadesi bankadan havaleyle dönmeli (`packages/domain-core/src/payment/refund-method.ts`).
- API ile kesilen faturanın e-fatura gönderimi: API'de faturayı alıcının platformuna gönderen ayrı uç var
  (`POST customer_invoices/{id}/send_to_pa`); tetik ve hata dönüşleri Faz 4'te sandbox'ta ölçülür.
- Müşteri faturası (sandbox): toplamın yuvarlaması (satır başına mı, oran başına mı; bellek içi ikiz satır başına varsayar),
  cevapların biçimi ve taslağın durum adı, dış referansla arama, kesinleştirmenin fatura gününü değiştirip değiştirmediği, AB içi
  %20 ters yüklemenin kodu, alacak notunun açılışı.
- Müşteri kaydı (sandbox): listede ve kayıtta `reg_no`, `vat_number` ve fatura adresinin biçimi, elle açılmış kaydın türü
  (şirket ya da kişi), güncelleme ucunun yalnız gönderilen alanları değiştirip değiştirmediği.

## 8. Kaynaklar

- [DGCCRF — Les délais de paiement interprofessionnels](https://nouvelle-aquitaine.dreets.gouv.fr/sites/nouvelle-aquitaine.dreets.gouv.fr/IMG/pdf/brochure-delais-paiments.pdf)
- [BOFiP — dönemsel fatura](https://bofip.impots.gouv.fr/doctrine/pgp/13245-PGP%23Facturation_periodique_39)
- [FNFE-MPE — L'Annuaire](https://fnfe-mpe.org/wp-content/uploads/2025/12/Lannuaire-v1.1-1.pdf)
- Pennylane API: [faturayı kesinleştirme](https://pennylane.readme.io/reference/finalizecustomerinvoice) (kesinleşen fatura
  düzenlenmez) · [alacak notunu faturaya bağlama](https://pennylane.readme.io/reference/linkcreditnote) ·
  [müşteri kaydını güncelleme](https://pennylane.readme.io/reference/putcompanycustomer) ·
  [e-faturayı platforma gönderme](https://pennylane.readme.io/reference/sendtopacustomerinvoice)
- Pennylane: [müşteri faturası oluşturma](https://pennylane.readme.io/docs/create-a-customer-invoice-use-case) ·
  [otomatik ödeme eşleştirme](https://pennylane.readme.io/docs/automating-payment-matching) ·
  [faturaya hareket eşleme](https://pennylane.readme.io/reference/postcustomerinvoicematchedtransactions)
- Pennylane yardım: [e-fatura deneyimi](https://help.pennylane.com/fr/articles/561209-decouvrir-l-experience-de-la-facturation-electronique-dans-pennylane) ·
  [faturaları numaralandırma](https://help.pennylane.com/fr/articles/114356-numeroter-les-factures) ·
  [fatura şablonları](https://help.pennylane.com/fr/articles/146118-creer-des-modeles-de-facture)
- [BOFiP — faturanın zorunlu bilgileri ve numaralandırma](https://bofip.impots.gouv.fr/bofip/140-PGP.html)
- [Legifrance — Code de commerce, faturalama (L441-9)](https://www.legifrance.gouv.fr/codes/id/LEGISCTA000038411053/2019-04-26)
