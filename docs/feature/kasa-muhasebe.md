# Kasa ve muhasebe entegrasyonu — Hiboutik · Pennylane · Revolut

> **Statü: KARARLAR ALINDI (30.09–01.10.2026), entegrasyon başlıyor.** Özelliğin tek kaydı bu dosya:
> yasal zemin, kararlar, veri akışı, yol haritası ve ölçülecekler burada tutulur; iş `docs/KALAN.md`'ye
> satır olarak açılmaz (kullanıcı kararı 01.10). Kapsam yalnız devletin dayattığı yükümlülükler ve ödeme
> kabulüdür: sertifikalı kasa, e-fatura, KDV beyanı, banka akışı. İç yazılımın kendi kazanımları
> (stok, kârlılık, kurye mutabakatı) bu dosyanın konusu değildir.

## 1. Yasal zemin (kaynaktan okundu, 30.09–01.10)

**Sertifikalı kasa** — CGI art. 286, I, 3° bis; BOFiP `BOI-TVA-DECLA-30-10-30` (25.03.2026 sürümü):

- **§30, §40:** tüketiciden alınan ödemeyi muhasebe dışında kaydeden her yazılım kasa sayılır. Çok
  işlevli yazılımda yalnız kasa işlevi güvenli kılınır, yazılımın tamamı değil.
- **§35, hoşgörü:** kasa yükümlülüğünden muafiyet, BÜTÜN ödemeler kredi kuruluşu ya da AB'de yerleşik
  banka üzerinden alınırsa geçerli. Ödemenin bir kısmı başka yolla alınırsa — payı ne olursa olsun —
  ya da ödeme hizmeti sağlayıcısı banka statüsünde değilse uygulanmaz. Stripe ve SumUp İrlanda'da
  elektronik para kuruluşu, banka değil. **Biz nakit alıyoruz: hoşgörü yok, kasa zorunlu.**
- **§375:** kendi ihtiyacı için yazılım geliştiren işletme kendi yazılımına beyan veremez; yalnız
  akredite kuruluş sertifikası (NF525 / LNE) geçer. **Bu yüzden kasa işlevi sertifikalı dış yazılımda.**
- **Dört koşul:** değişmezlik (§80), güvenlik (§130), saklama (§155), arşiv (§220).
- **§10:** işletmeler arası (B2B) satış kasa kapsamı dışında; fatura zorunlu.
- LF 2026 md. 125, 21.02.2026'dan itibaren editör beyanını sertifikanın yanına geri getirdi.

**Kasa SSS'si** — DGFiP, *logiciels de caisse* soru-cevap (28.07.2017; bağlayıcı yorum BOFiP'tir):

- **Soru 16:** ödemeler biri bilgisayarda biri kâğıtta iki yolla kaydedilebilir; kasa çalışmazken kâğıda geçmek yasal.
- **Soru 22:** işlemin verisi siparişin alınmasından ödemenin kaydına kadar değiştirilemez olmalı.
- **Soru 36:** ödeme kuruluşunun (Revolut) aracılık işlevi sertifika kapsamında değil.
- BOFiP arıza, çevrimdışı çalışma ve kaydın ne kadar sürede yapılacağı hakkında bir şey söylemiyor. Uygulamada sertifikalı
  kasa bağlantı kopunca satışı cihazda tutup bağlantı dönünce gönderiyor; tamamen çökünce satış elle yazılıp kasa dönünce
  yeniden giriliyor.

**E-fatura** — DGFiP fiş 1 (Haziran 2026):

- Fransa'da yerleşik iki profesyonel arasındaki fatura, kayıtlı bir platform (*plateforme agréée*, PA)
  üzerinden ve yapılandırılmış biçimde gider; *"factures « papier » scannées, de PDF ordinaires […] ne
  sera plus conforme"*. Fatura tedarikçiden müşteriye doğrudan gitmez.
- **Takvim:** e-fatura alımı 01.09.2026'dan beri herkes için zorunlu. Düzenleme büyük işletme ve ETI
  için 01.09.2026, PME ve mikro işletme (biz) için 01.09.2027.
- **Kamu portalı (PPF)** Ekim 2024'te yeniden konumlandı: fatura almıyor, göndermiyor; yalnız rehber
  (faturanın hangi platforma gideceği) ve idareye veri toplayıcı. **Alım yalnız seçilen PA'dan.**
- **Yurt dışı tedarikçi** e-fatura kapsamı dışında: faturası PDF ya da kağıt gelmeye devam eder.

**E-reporting** — DGFiP fişi (Eylül 2025), PME için 01.09.2027:

- Tüketici satışı: günlük toplam, KDV oranına göre KDV hariç tutar ve KDV; kişisel veri yok.
  Mesafeli satış (AB'ye) ayrı kategori.
- Yurt dışı işletmelerle işlem (AB içi alım dahil) bildirilir; mal ithalatı hariç (gümrük verisinden
  önceden dolduruluyor).
- Sıklık KDV rejimine bağlı: aylık normal rejimde ayda üç dönem (on günde bir).

## 2. Kararlar (kullanıcı, 30.09–01.10)

| # | Karar | Sonucu |
|---|---|---|
| 1 | **Kasa Hiboutik; bütün B2C ödemeleri oraya yazılır** — nakit, kapıda kart, online | Yasal kayıt Hiboutik'te. Bizdeki tahsilat kaydı iç kontrol aynası olarak kalır; bunun için muhasebeciye soru gitmez. Hiboutik'in NF525 sertifikasını kullanıcı doğruladı. |
| 2 | **QUALITE ile Lezzet'in buluştuğu yer Pennylane; muhasebeciye çıkan veri oradan gelir** (03.10) | Pennylane iki işin bütün kayıtlarını taşıyan iç defterdir; muhasebeci değişirse devam altyapısıdır. Muhasebeci kendi yazılımını kullanır, Pennylane'e bakmaz; e-fatura alımı onun platformundadır. Muhasebeciye giden dosya Pennylane'den üretilir, biçimi muhasebecinin cevabına bağlı: FEC olduğu gibi ya da Pennylane verisinden dönüştürülmüş döküm (ör. alışların Excel'i). Kurulumunu kullanıcı yürütür → **canlı öncesi şart.** |
| 3 | **Hiboutik ↔ Pennylane ve banka ↔ Pennylane doğrudan konuşur** | Bu iki akış için bizden kod yok; sistemimiz muhasebe işine karışmaz. |
| 4 | **Pennylane'e bizden giden: alış faturası ve eşleşme** | Lezzet'in bütün alış belgeleri bizden yüklenir, Fransız tedarikçinin e-faturasının kopyası dahil: e-fatura Pennylane'e gelmiyor (2. karar). E-fatura Pennylane'e gelmeye başlarsa okunur (akış 4) ve o faturalar bizden yüklenmez. |
| 5 | **Eşleştirme bizde** — alış faturası ↔ ödeme ↔ mal kabul | Cari çalışma, kısmi ödeme, tek havaleyle birden çok fatura. `money_allocation` bunu tutarıyla, çoktan çoğa taşıyor. Revolut BillPay önerisi bu yüzden geri çekildi. |
| 6 | **Banka hareketlerinin kaynağı Pennylane** | Banka hesapları (Revolut, Crédit Mutuel; 15. karar) Pennylane'den okunur. Excel içe aktarma yedek kalır. |
| 7 | **Revolut: çevrim içi ödeme + kapıda kart + banka** | Stripe'ın yerini alır; Stripe'taki sipariş başına defter düzeni aynen sürer. Revolut nakit almaz, Fransa'da nakit yatırma da kalktı → **nakit Crédit Mutuel'e yatırılır** (15. karar). Revolut hesap açılışı kullanıcıda. |
| 8 | **Revolut ↔ Pennylane bağlantısında yalnız banka akışı açık** | "Harcamalar" modülü ve Revolut'tan Pennylane'e fatura aktarımı kapalı: ikisi de bizim yüklediğimiz faturanın ikizini üretir. |
| 9 | **SumUp kasa olarak yok** | Genel API'si kasaya satış yazmıyor; Fransa'daki POS Pro (eski Tiller) 2026 sonunda kapanıyor, yeni entegrasyon talebi 2027'nin ikinci çeyreğinden itibaren. O tarihte yeniden bakılabilir. |
| 10 | **B2B Hiboutik'e yazılmaz** (01.10) | Kasa yükümlülüğü B2B'yi kapsamıyor (BOFiP §10). B2B faturası bugünkü gibi Pennylane'de kesilir; müşteri alacağı ve vade orada izlenir, 2027'de e-fatura olarak da oradan gider. Kapıda nakit alınan B2B parası Hiboutik kasasına yalnız kasa girişi olarak yazılır. |
| 11 | **Hediye sipariş ödemesiz kapanır** (01.10) | Kasaya para girmez, Hiboutik'e bir şey yazılmaz; mal hediye olarak stoktan çıkar, muhasebeci hediye gideri olarak işler. DOMAIN §9'daki "parasını patron öder, muhasebe aktarımına girmez" kuralının yerine geçer. |
| 12 | **Kurye nakdi farkı açıklamalı kasa hareketiyle yazılır** (01.10) | Sefer kapanışında nakit eksik ya da fazla çıkarsa fark bizde nakit hesabına hareket olarak, Hiboutik'e "Sefer kapanış farkı <sefer no>" açıklamalı kasa çıkışı ya da girişi olarak yazılır. Muhasebeci kasa farkı ya da kurye alacağı olarak işler. Kart farkı kasaya dokunmaz. |
| 13 | **Faz 1 bitince iki ajanla inceleme** (01.10) | İki ajan birebir aynı istemle, birbirinden bağımsız çalışır: ikisi de Hiboutik entegrasyonunu ve projenin muhasebe sistemini (para hareketleri, ödeme durumu, muhasebe aktarımı, kâr, KDV, B2B ve hediye kuralları) tasarım (§7), ölçülen davranış (§6) ve yasal zemin (§1) karşısında inceler, uyumsuzlukları raporlar. Bulgular doğrulanıp kullanıcıya özetlenir. `CLAUDE.md`'deki alt ajan yasağının bu inceleme için istisnasıdır. |
| 14 | **Kapıda kart parası nakit kasadan ayrı hesaba yazılır** (02.10) | Kurye, gel-al tezgâhı ve kapı önü satış kartla alınan parayı kapıda kart hesabına (`door_card_account_id`, kart cihazının hesabı), nakdi kapı çekmecesine (`door_cash_account_id`) yazar; hesabı istemci değil sunucu yöntemden seçer. Çekmece sayımı yalnız nakdi sayar. Yöntemin hesabı ayarlı değilse o yöntemle tahsilat kapalıdır ve teslim yazılmaz. |
| 15 | **Banka hesapları işe göre ayrılmaz** (04.10) | Revolut ve Crédit Mutuel şirketin hesaplarıdır; ikisi de Pennylane'e bağlı ve kurulum kartında eşlenir. Ödemenin işi hesaptan değil, bağlandığı belgeden ya da siparişten gelir ([`iki-is.md`](iki-is.md) 11. karar). Nakit Crédit Mutuel'e yatırılır: bizde "Kasa → Crédit Mutuel" transferi yazılır, Crédit Mutuel'e gelen satır bu transferin öteki yakası olarak eşleşir. |
| 16 | **Lezzet'in faturası Pennylane'de "Lezzet" analitik kategorisini taşır** (03.10) | Pennylane şirketi toptan operasyonuyla ortak; iki işin gideri ve kârı Pennylane'de kategoriyle ayrı raporlanır. Kategorinin adı ayardır (iş başına: `pennylane_category_lezzet` · `pennylane_category_qualite`, varsayılanı işin adı, boşsa kategori yazılmaz; QUALITE'nin belgesi `iki-is.md` ile eklendi); Pennylane'de adla bulunur, yoksa "Activité" grubunda açılır. Faturanın öteki eksenlerdeki kategorisi korunur, Pennylane'de elle değiştirilen kategori ezilmez. |
| 17 | **Kapıda kart Revolut Tap to Pay on iPhone ile alınır** (06.10) | Ödemeyi kuryenin uygulaması başlatır, ayrı cihazda tutar yazılmaz. Kurye iPhone taşır (XS ve üstü, iOS 16.4+); Android'de bu yol yok. |
| 18 | **Kasa yazımı ödemenin hemen arkasından, kimseyi bekletmeden** (06.10) | Ödeme kaydı ve kasa kuyruğu satırı aynı işlemde yazılır; işlem biter bitmez o siparişin satışı Hiboutik'te açılıp kapanır, müşteri ve kurye beklemez. Yazılamazsa satır bekler, dakikalık iş ilk fırsatta yazar (yeniden deneme tavanı 5 dk). Bekleme süresince ödemenin kaydını bizim yazılım tutar: B2C tahsilat hareketinin tutarı, yöntemi, hesabı ve siparişi değişmez, hareket silinmez, düzeltme ters harekettir (SSS 22, BOFiP §90). Satırı işleyen onu kilitler; satış Hiboutik'e iki kez yazılmaz. Kasa ve Revolut Merchant sabit hesaplardır: migration açar, pasifleşmez; kapı nakdi Kasa'ya, kapıda kart ve online ödeme Revolut Merchant'a yazılır. Ödemenin yazılacağı hesap yoksa ödeme başlamaz. Ödemeden önce Hiboutik'te taslak satış açılmaz: açık satış mali kayıt değildir (silinir, Z'ye girmez) ve yalnız beklemeyi uzatır. |

## 3. Veri akışı

| # | Akış | Yön | Bizden kod | Dayanak |
|---|---|---|---|---|
| 1 | Her B2C ödemesi → kasa | biz → Hiboutik | var | Hiboutik API: `/sales`, `/sales/add_product`, `PUT /sale/{id}`, `/sales/close` |
| 2 | Satış → muhasebe | Hiboutik → Pennylane | yok | Pennylane, Chift üzerinden günlük Z kayıtlarını (*tickets Z*) çeker |
| 3 | Banka → muhasebe | Revolut, Crédit Mutuel → Pennylane | yok | Revolut'un resmî Pennylane bağlantısı (Open Banking); Crédit Mutuel toplayıcı (Powens / Bridge) ile |
| 4 | Kart tahsilatı → bizim defter | Revolut Merchant API → biz | var | ödeme nesnesinde komisyon (`fees`); para 24 saat içinde Business içindeki Merchant hesabına, oradan ana hesaba |
| 5 | Banka hareketi → biz | Pennylane API → biz | var | `GET /transactions` (hesap ve tarih süzgeci) + `/changelogs/transactions` |
| 6 | Alış faturası (Lezzet'in bütün alış belgeleri) | biz → Pennylane | var | `POST /file_attachments` (PDF, JPEG, PNG) → `POST /supplier_invoices/import` |
| 7 | E-fatura (Fransız tedarikçi) — e-fatura Pennylane'e gelince | Pennylane API → biz | ertelendi | `/changelogs/supplier_invoices` (son 4 hafta) ya da webhook `supplier_invoice.e_invoicing_received` + `GET /supplier_invoices/{id}` ve `/invoice_lines` |
| 8 | Eşleşme | biz → Pennylane | var | `POST /supplier_invoices/{id}/matched_transactions` (çağrı başına tek hareket–tek fatura) |
| 9 | Nakit → banka | Hiboutik kasasından çıkış, Crédit Mutuel'e yatırma | var | `POST /till/cash_out`; yatırma 3. akışla Pennylane'e gelir (15. karar) |
| 10 | Muhasebeciye aktarım | Pennylane → muhasebeci | biçime göre | `POST /exports/fecs` (FEC), `/exports/analytical_general_ledgers`; biçim muhasebecinin cevabına bağlı (2. karar) |

## 4. Bizim tarafta bağlantı noktaları (ölçüldü, 30.09)

- **Tahsilatın tek kapısı:** `packages/application/src/order/payment.ts` (`recordOrderPayment`,
  `recordOrderRefund`). Çağıranlar: kapıda tahsilat (`courier/delivery.ts`), gel-al
  (`warehouse/pickup.ts`), kapı önü satış (`order/quick-sale.ts`), çevrim içi onay
  (`order/confirm-payment.ts`), iade (`order/refund.ts`), ödeme webhook'u
  (`apps/web/lib/order/payment-webhook.ts`). Kapı ödeme sağlayıcısından bağımsız; Hiboutik buraya oturur.
- **Ödeme sağlayıcı portu:** `packages/application/src/order/payment-gateway.ts` (durum, iptal, iade); Revolut
  uyarlaması `order/revolut.ts`. Sağlayıcıya özgü kalan: web'de Revolut ödeme sayfasının satırları ve dönüş adresi (`order/revolut.ts`), native kart
  formu (`lib/payment/payment-sheet.ts`), webhook çevirisi (`lib/order/revolut-event.ts`).
- **Para modeli** (`0018_money.sql`):
  - `money_document` KDV'yi oran başına kırılımla taşır (`vat_lines`; gıda %5,5 ile ambalaj %20 aynı
    faturada olabilir), KDV toplamı kırılımdan türer. KDV rejimi ve para birimi alanı var.
  - `money_allocation` (hareket ↔ belge, tutarıyla, çoktan çoğa) değişmez; 5. karar bunun üstüne.
  - Hesap türleri `cash · bank · provider · partner`. Kasa (`cash`) ve Revolut Merchant (`provider`) sabit hesaplardır
    (18. karar); komisyon
    `kart-komisyonu` doğasıyla, aktarım `card_payout_account_id` hesabına transferle yazılır.
- **Banka içe aktarma (Excel + yapay zekâ şablonu):** yedek olarak kalır.
- **B2B havalesi:** peşin ve vadeli havale siparişe bizim sistemde bağlanır
  (`packages/domain-core/src/payment/checkout-options.ts`); banka hareketi artık Pennylane'den gelir.

## 5. Yol haritası

| Faz | İş | Başlıca yerler | Ön şart |
|---|---|---|---|
| 0 | **Erişim ve ölçüm.** Hesaplar: Hiboutik demo modunda (API için Premium, ikincil kaynak), Pennylane test ortamı ve API anahtarı (API Essentiel planda ve üstünde), Revolut deneme hesabı (asıl hesaptan bağımsız, anında). §6'daki soruların ölçümü; çıktı ölçüm tablosu ve tasarım kararları. | kök `.env` (değişken adları kullanıcıdan) | Hesapları kullanıcı açar |
| 1 | **Hiboutik kasa.** Tasarım §7: sipariş başına durum farkı, kasa aynası, ürün ve mağaza eşlemesi, kasa hareketleri, günlük mutabakat, gün kapanışı. | domain-core `register/`; migration (kasa tabloları, tetikleyici, hareketin ödeme yöntemi); Hiboutik uyarlaması; backend cron'ları | Faz 0 Hiboutik ölçümü (tamam) |
| 2 | **Pennylane.** Tedarikçi eşleme (`POST /suppliers`); belgeye KDV oranlı satır; belge yükleme (Lezzet'in bütün alış belgeleri; PDF, JPEG ya da PNG); yüklemeden önce mükerrer kontrolü; e-fatura okuma ve mal kabule bağlama (e-fatura Pennylane'e gelince); banka hareketi okuma; eşleşme yazma; hesap başına "hareket gelmiyor" uyarısı. Tasarım §8. | `money_document` şeması; para modülü; yeni Pennylane adaptörü | Faz 0 Pennylane ölçümü (tamam; e-fatura okuma canlıda) |
| 3 | **Revolut.** Çevrim içi ödeme (Merchant API: sipariş, kart alanı, Apple / Google Pay, webhook, iade) — Stripe söküldü, kart ödemesi web'de ve native'de Revolut'ta; web'de "Öde" Revolut'un ödeme sayfasına götürür (Google Pay orada; Apple Pay alan adı kaydı yalnız canlıda); açık: Revolut panelinde işletme adı, logo ve renk; kapıda kart (Terminal'e tutar gönderme ya da elle onay + sonradan doğrulama); defter düzeni (brüt tahsilat · komisyon · Merchant'tan ana hesaba aktarma). | `order/revolut.ts`; web ve mobil ödeme ekranları; `payment-webhook.ts` | Faz 0 Revolut ölçümü; canlı için asıl hesap |
| 4 | **2027.** B2B e-faturası (10. karar): şirketin e-fatura platformu muhasebecininki olduğu için faturanın hangi platformdan gideceği ve siparişten faturaya bağlantı gerekip gerekmediği. B2C e-reporting: Hiboutik'in Z verisi Pennylane'e gidiyor; idareye hangi platformdan iletileceği bakılacak. | — | Son tarih 01.09.2027 |

- **Sıra 1 → 2 → 3.** Hiboutik, sağlayıcıdan bağımsız tahsilat kapısına oturduğu için Revolut'tan önce
  yapılması ek iş doğurmaz. Faz 1–3 canlı öncesi şart; Revolut geçişi canlıdan önce en ucuz.
- **Şema değişiklikleri** (Faz 1 ve 2) migration'da doğrudan yapılır; `db:refresh` kararı kullanıcının.
- **Değişecek mimari cümleler** kendi fazının commit'inde güncellenir: `DOMAIN.md` §7 (ödeme havuzları,
  kapıda kart cihazı) ve §9 (ön muhasebe sınırı: "hiçbir resmî belge üretilmez", banka import, export);
  `INTEGRATIONS.md` (Ödeme; Muhasebe export; Banka import); `data-model/para.md`.

## 6. Ölçülecekler (Faz 0)

**Hiboutik — ölçüldü (01.10, demo hesap `lezzetanatolie`).** Betikler `.test-results/hiboutik-olcum*.mjs`, raporlar
aynı klasörde. Güncel API belgesi `/docapi/yaml/` (belge sayfası bunu yüklüyor,
309 işlem); `/docapi/json/` eski sürüm (228 işlem, yorum satırına alınmış).

| Konu | Sonuç |
|---|---|
| Satış aç → kalem → ödeme → kapat | Çalışıyor. Kapatma, her kalemin `stock_withdrawal = 1` olmasını istiyor (yoksa 422). Cevaplar: `{sale_id}`, `{id_sale_product_detail}`. |
| Satış kaydı | `GET /sales/{id}`: günlük sıra numarası (`unique_sale_id`, ör. `2026-10-1-1`), gün sonu tarihi, kalem başına KDV, oran başına HT/KDV/TTC (`taxes`), ödemeler (`payment_total`), dijital fiş ve QR bağlantısı (`url_receipt`, `url_qrcode`). Ödeme satırları (`payment_details`) ve bakiye (`balance`) yalnız `DIV` satışta gelir; taze açılan satış `DIV` değildir. |
| Sipariş numarası (`ext_ref`) | 25 karakterde kesiliyor. Arama (`/sales/search/ext_ref/{q}`) "içerir" biçiminde: `…-S1` araması `…-S11`'i de getiriyor, tam eşleşme satış okunarak doğrulanır. |
| Bölünmüş ödeme (`DIV`) | Çalışıyor (nakit 10 + kart 20). |
| Eksik ve fazla ödeme | `DIV` satış eksik ödemeyle de kapanıyor; kalan `balance`ta duruyor, fişte "Reste" yazıyor. Kapanmış satışa sonradan ödeme satırı eklenebiliyor, eksi tutarlı da (fazla tahsilatın iadesi: bakiye −2,00 → 0,00; kasa sayımı ve Z bunu gösteriyor). Tek yöntemli satışa sonradan ödeme eklenemiyor. |
| Ödeme türü | Kasada açılmamış türle yazılan ödeme satırı 404 döner (`Please provide a valid payment`); tür `POST /payment_types` ile açılınca kabul ediliyor. Hesapta hazır gelenler ESP, CB, CHE. |
| Kalem KDV'si | Kalem bazında değiştirilebiliyor (`PUT /sale_line_item/{id}`, `vat` = oran, 0 < v < 1); vergi kimliğiyle reddediliyor. Sıfır oran kalemde verilemiyor, satış düzeyinde `duty_free_sale`. |
| Birim fiyat | Kuruşa yuvarlanıyor: 3 × 9,6667 → 29,01. Tam tutar için kalem ikiye bölünür (2 × 9,67 + 1 × 9,66). |
| İndirim | Kalemdeki `discount` fiyatı değiştirmiyor; Hiboutik onu "katalog fiyatı − satış fiyatı" olarak kendisi yazıyor, gün sonu indirim raporu bundan çıkıyor. İndirim satış fiyatına işlenir. |
| Fiş | Dijital fiş ürün adını, toplamı, KDV'yi, ödemeleri ve kalanı gösteriyor; kalem açıklaması (`product_comments`) görünmüyor. |
| B2B KDV hariç fiyat | `prices_without_taxes = 1`: 10,00 HT → 10,55 TTC, doğru. |
| Almanya'ya ters yükleme | `duty_free_sale = 1`: KDV 0, ama KDV kodu `E` (muaf) yazılıyor, AB içi işlem kodu değil. |
| Tam iptal | `POST /sales/void`: eksi tutarlı ters satış, aynı ödeme yöntemi, yeni sıra numarası, gerekçe iz kaydında. |
| Kısmi iade | Eksi fiyatlı kalemle iade satışı kapanıyor (1 × −10,00, nakit). Eksi adet reddediliyor. Kalem iadesi (`sale_line_item_exchange`) para değil alacak notu (avoir) üretiyor ve kalemin tamamını iade ediyor: bizim iade yolu değil. |
| Ürün dış referansı (`products_ref_ext`) | 20 karakterde kesiliyor; belgede sınır yazmıyor. Varyant kimliğimiz (`uuid`, 36 karakter) sığmaz → ürün eşlemesi bizde tutulur. 20 karakterlik referansla arama (`/products/search?products_ref_ext=`) ürünü buluyor. |
| Açık satış | `completed_at` boş tarih (`0000-00-00 00:00:00`), `unique_sale_id` boş. Kalem (`DELETE /sale_line_item/{id}`) ve ödeme satırı (`DELETE /sales_payment_div/{id}`) silinebiliyor; boşalan satış silinebiliyor, silinen satış okunurken 404. |
| Vergi listesi | `GET /taxes`: oran kesir (`tax_value` = `0.05500`) ve vergi kimliği; ürün açarken kimlik, kalemde kesir istenir. |
| Stok | Stok takipsiz üründe satış stok hareketi doğurmuyor. |
| Nakit kasası | Para koyma/çıkarma, anlık sayım ve aylık hareketler çalışıyor; sayım kapanmış satışların nakit payıyla tutuyor. |
| Gün sonu okumaları | Ödeme yöntemine, KDV oranına göre ve alınan ödemeler dökümü geliyor. Kasa defteri ve nakit akışı boş (kapanış olmadan). |
| Gün kapanışı | Demoda yapılamıyor: *"You can't close because your account is in demo mode"*. Çağrı yetki kapısını geçiyor. |
| Satışı önceki güne taşıma | `PUT /z/date/` demoda reddediliyor (02.10): *"You must be in production mode to use this function"*. Satış kapanışı bütün kalemlerin stoktan düşülmesini istiyor (`stock_withdrawal = 1`). |
| Çalışmayanlar | Fiş içeriği (`/print/ticket`) ve Z raporu (`/reports/z`) 500; `/z/credit_notes_issued` canlıda yok (404). |
| Yuvarlama | `sale_total_net/tax` (23,12 / 1,88) ile oran toplamları (23,13 / 1,87) bir kuruş ayrışıyor; mutabakat oran toplamlarından yapılır. |
| Hız | Çağrı başına 40–110 ms; kota başlığı yok. |
| Demo sıfırlama | `POST /reset` (`reset_action`: `sales_and_products`, `sales_keep_stock`, `sales_and_stock`, `clients`, `everything`), yalnız demo modunda. `sales_and_products` satışları, ürünleri ve kasa sayımını siliyor; ödeme yöntemleri, KDV oranları ve mağaza kalıyor. |

**Hiboutik — belgeden okundu (06.10).** Kaynak Hiboutik SSS'si ve hesabın API belgesi:
- Açık satış mali kayıt değildir: kalemi ve ödeme satırı değişir, boşaltılan satış silinir (SSS örneği: "ödenmediği için iptal
  edilen siparişler"). Açılışta hesap genelinde bir oluşturma numarası, kapanışta satış noktasının doğrulama numarası verilir;
  boşluk yalnız oluşturma sırasında olur. Premium'da en çok 500 açık satış.
- Z, o gün kapanan satışları içerir. Kapanmış satış silinmez, eksi kopyası olan ters satışla o gün düzeltilir. Mali arşiv
  doğrulanmış satışları, ödemeleri ve kapanışları elektronik imzayla korur.
- Hiboutik'in Revolut uygulaması yalnız Revolut Terminal'i "Pay at counter" kipinde sürer (satış Hiboutik ekranında açılır);
  online ödeme ve Tap to Pay kapsam dışı. WooCommerce eşitlemesi online satışı ödemeden sonra açıp kapatır.

**Hiboutik — açık kalan:**
- Gün kapanışı, satışı önceki güne taşıma, mali arşiv ve kapanış sonrası kasa defteri yalnız üretim hesabında
  görülebilir; üretime geçiş geri alınmaz, demo satışları silinir, ayarlar kalır.
- Hiboutik belgesine göre (02.10): kapanış geri alınmaz ve önceki kapanmamış günleri de kapatır; kapanan günün
  satışı ancak ters satışla düzeltilir. Bütün günleri kapanan ay ve 12 ayı kapanan yıl kendiliğinden kapanır, kapanan
  ayın mali arşivi indirilir. Gün, hesabın ayarlı saatinde (varsayılan gece yarısı) başlayan 24 saattir; satış
  kapanmamış önceki güne taşınabilir. Pennylane Hiboutik'ten günlük Z'yi alır (Chift), kapanmamış günde "POS still
  open" der.
- Canlıda ilk iş: gün başlangıç saatinin gece yarısı olduğu ekrandan doğrulanır; ilk gerçek satıştan önce kaydı
  olmayan bir gün API'den kapatılıp cevabı ölçülür.
- Ters yüklemenin `E` kodu 2027 e-fatura / e-reporting için yeterli mi, Faz 4'te bakılacak.
- Çağrı sınırı: yeni fiş başına 8 çağrı (arama, açma, iki okuma, iki ayar, ödeme, kapatma) + kalem
  başına 1 (bölünen ya da KDV'si değişen kalem 1 daha), toplu uç yok. Ayda 600 siparişte 8 kalemle ~9.600
  çağrı; kota (ikincil kaynakta ayda 10.000) canlı planla doğrulanacak.

**Pennylane — belgeden okundu (02.10).** Company API v2 belgesinin kopyası `.test-results/pennylane-api/`
(depoda değil; `oas.py` bir uç sayfasının alanlarını döker).
- **Erişim:** şirket anahtarı (Bearer), Essential ve üstü planda yönetici rolüyle Ayarlar › Bağlantılar ›
  Geliştiriciler'den üretilir ve bir kez gösterilir; okuma ya da okuma-yazma, süre 1–12 ay ya da süresiz.
  Test ortamını şirket kendisi açar (profil › Test environment › Create my sandbox); test şirketinin `/me`
  cevabında `reg_no` `sandbox-` ile başlar.
- **Sınır:** anahtar başına 5 saniyede 25 istek, aşımda 429 ve `retry-after`; sınır başlıkları her cevapta.
- **2026 değişikliği** (1 Temmuz 2026'dan beri zorunlu): `ledger` yetkisi yerine ayrıntılı yetkiler, imleçli
  sayfalama, sonek almayan kimlikler, dosya için `POST /file_attachments`. Bağlantı doğrudan yeni sürümle yazılır.
- **Alış faturası içe aktarma:** önce `POST /file_attachments` (PDF, JPEG, PNG, TIFF, BMP, GIF; 100 MB), sonra
  `POST /supplier_invoices/import`. Zorunlu alanlar: dosya, tedarikçi, tarih, vade, KDV hariç, KDV ve toplam tutar
  (iki ondalıklı metin), KDV oranlı satırlar (`vat_rate`: `FR_55`, `FR_200`; ters yükleme için `intracom_55`,
  `extracom` gibi kodlar). Hesap kodu isteğe bağlıdır, verilmezse Pennylane tedarikçiden atar. `external_reference`
  bizim belge kimliğimizi taşır; aynı dosya ikinci kez içe aktarılırsa 422. Fatura listesi `supplier_id`,
  `invoice_number` ve `external_reference` ile süzülür, yüklemeden önce mükerrer kontrolü bununla yapılır.
- **Tedarikçi:** `POST /suppliers` ad, SIREN/SIRET, KDV numarası, adres, IBAN, ödeme yöntemi, vade gün sayısı ve
  `external_reference` alır.
- **E-fatura okuma:** okunan faturada `e_invoicing` (durum, gerekçe, akış, asıl CII/UBL/Factur-X dosyasının adresi,
  alıcının e-fatura adresi), 30 dakika geçerli dosya adresi, ödeme durumu ve kalan tutar var; satırlar ayrı uçtan
  gelir (`/supplier_invoices/{id}/invoice_lines`: oran, tutarlar, etiket). Yeni e-fatura için webhook var
  (`supplier_invoice.e_invoicing_received`); değişiklik akışı (`/changelogs/supplier_invoices`) son 4 haftayı tutar.
- **E-fatura durumu yazma:** `PUT /supplier_invoices/{id}/e_invoice_status` ile itiraz (`disputed`; gerekçe
  sözlükten: yanlış miktar, kusurlu mal, teslimat sorunu vb.), ret (`refused`; geri alınmaz, ödeme bağlıysa
  yapılamaz) ve itirazı kaldırma (`approved`). Fatura `null` durumla gelir; bu örtük onaydır.
- **Banka hareketi:** `GET /transactions` hesap, günlük ve tarihle süzülür, kimliğe göre sıralanır, sayfa başına
  en çok 100. Alanlar: tutar, tarih, açıklama, ücret, hesap, Pennylane'de eşlenmişse tedarikçi ya da müşteri,
  eşlenen faturalar, `interbank_code`; karşı taraf adı ya da IBAN alanı yok. Değişiklik akışı
  (`/changelogs/transactions`) ekleme, güncelleme ve silmeyi işlenme sırasıyla verir, son 4 haftayı tutar; banka
  hareketi için webhook yok. Banka hesabında ad, bakiye ve günlük var, son eşitleme bilgisi yok: "hareket
  gelmiyor" uyarısı bizde hesaplanır.
- **Eşleşme:** `POST /supplier_invoices/{id}/matched_transactions` gövdesi yalnız hareket kimliğidir, tutar alanı
  yok. Bir hareket birden çok faturaya, bir fatura birden çok harekete bağlanabilir; geri alma
  `DELETE …/matched_transactions/{id}`.

**Pennylane — ölçüldü (02.10, test şirketi `sandbox-270612`).** Betikler `.test-results/pennylane-olcum*.mjs`,
raporlar aynı klasörde; ölçüm verisi test şirketinde `LA-TEST-…` etiketiyle duruyor.

| Konu | Sonuç |
|---|---|
| Kimlik | `/me` şirketi ve anahtarın yetkilerini döndürüyor; yazımdan önce `sandbox-` denetimi buna dayanır. |
| Banka hareketi | Test şirketinde API'den yaratılıyor (`POST /transactions`). Tutar işaretli ondalık metin (çıkış `-500.0`, giriş `250.0`; ondalık sayısı sabit değil). `outstanding_balance` belgesiz kalan tutarı ters işaretle taşıyor (çıkışta `500.0`). API'den yaratılan hareket hesabın bakiyesini değiştirmiyor (`0.0`). Kimlikler 14 haneli tam sayı. |
| Tedarikçi | Her yeni tedarikçiye ayrı muhasebe hesabı açılıyor. Dış referans tekil (ikincisi 422 *"External reference has already been taken"*) ve süzgeçle bulunuyor. |
| Fatura içe aktarma | Fatura doğrudan muhasebeleşiyor (`accounting_status: complete`); kalan borç eksi işaretli (`-360.0`). İki oranlı satır ve ters yüklemeli satır (`extracom`, `intracom_55`, KDV 0) kabul ediliyor. Satır toplamı fatura toplamını tutmazsa 422 ve açık mesaj. KDV'si oranla tutmayan satır kabul ediliyor (KDV dahil 120 €, %20, KDV 5 €): oran denetimi bizde. |
| Mükerrer | Aynı içerikli dosya, yeni yükleme olsa da, 409 *"A document with ID … already exists with such attachment"* (belgede 422 yazıyor; mesaj var olan faturanın kimliğini taşıyor). Aynı tedarikçiye aynı numarayla başka içerikli fatura kabul ediliyor: numara denetimi bizde, yüklemeden önce `supplier_id` + `invoice_number` süzgeciyle. |
| Süzgeç | Parametre adı `filter`; rehberdeki `filters` yok sayılıyor ve bütün listeyi döndürüyor. |
| Eşleşme | Tutar taşımaz; Pennylane hareketi faturalara açılma sırasıyla dağıtır, eşleme sırasıyla değil (03.10: aynı hareket önce sonraki faturaya eşlendiğinde de önce açılan tam ödendi). 400 € → 360 € + 140 €: önce açılan tam, öteki 40 € ödenmiş görünür. Fazlası harekette açık kalır (500 € → 360 €: 140 € açık). Eşleşen faturada `paid` ve kalan tutar değişir, `payment_status` `to_be_processed` kalır; harekete faturanın tedarikçisi yazılır. |
| Eşleşmeyi geri alma | Tek bir faturanın bağını çözmek hareketin bütün bağlarını çözer; kalanlar yeniden bağlanmalı (yeniden bağlama çalışıyor). |
| E-fatura durumu | İçe aktarılmış faturada 422 *"This supplier invoice is not an electronic invoice"*. |
| Değişiklik akışı | Yaratma, eşleşme ve geri alma 1–2 saniye içinde akışta (`insert`, `update`); muhasebecinin Pennylane'de yaptığı eşleşme de buradan görülür. |
| Hız | 75 istekte, istekler arasında 250 ms ile, en düşük kalan sınır 13/25. |
| Ek türü (03.10) | PDF, JPEG ve PNG ekli fatura içe aktarılıyor; WEBP ve HEIC eki 422 (*"invalid content type"*). |
| Güncelleme (03.10) | `PUT /supplier_invoices/{id}` gün, vade, numara, tedarikçi ve satırları değiştiriyor (satırlar kimlikle silinip yenisi yazılıyor). Toplamı satırlarla karşılaştırmıyor: tutmayan toplam da kabul ediliyor. Ek değiştirilemiyor. |
| Ödeme durumu (03.10) | `paid` yazılınca fatura `paid_offline` görünüyor (`paid` alanı ve kalan tutar değişmiyor); `to_be_paid` geri alıyor. |
| Fatura dış referansı (03.10) | Tekil: aynı referansla ikinci içe aktarma 422 *"External reference has already been taken"*. Numarasız fatura ve `exempt` satırı kabul ediliyor. Elle girilen faturaya Pennylane 10 karakterlik rastgele kod veriyor (`842FHEIKJD`). |
| Tedarikçi tekilliği (03.10) | Aynı ad ve aynı KDV numarasıyla ikinci tedarikçi 201 ile açılıyor. Elle açılan tedarikçiye Pennylane UUID dış referans veriyor. Tedarikçi süzgeci yalnız kimlik, muhasebe hesabı, ad (`start_with`) ve dış referans; KDV numarasıyla süzülmüyor, liste okunarak bulunuyor. |
| Eşlemenin izi (03.10) | Başka bir faturaya eşlenen hareket `update` olarak hareket akışına düşüyor; `/transactions/{id}/matched_invoices` faturanın kimliğini ve türünü veriyor, dış referansını vermiyor. Eşlenen harekete faturanın tedarikçisi yazılıyor. |
| Analitik kategori (03.10) | Kategori grubu ve kategori açılıyor; alış faturası ve banka hareketi ağırlıkla işaretleniyor (aynı grupta toplam 1), faturalar `category_id` ile süzülüyor. Faturanın kategorileri `GET /supplier_invoices/{id}/categories` ile sayfalı okunuyor, ağırlık ondalık dize ("0.5"). Yazım faturanın bütün kategorilerini değiştiriyor; aynı grupta toplamı 1 olmayan yazım 422 ile reddediliyor ("…must equal 100%"), fatura değişmiyor. |
| Fatura değişiklik akışı (03.10) | `GET /changelogs/supplier_invoices` hareket akışıyla aynı düzende. İçe aktarma `insert` ve `update`, eşleme ve çözme ikişer `update`, ödendi işareti bir `update` düşürüyor; kategori olay düşürmüyor. Olay 4 saniye içinde görünüyor. |
| Muhasebe dışa aktarımı (03.10) | FEC ve analitik genel defter API'den üretiliyor (`POST /exports/fecs`, `/exports/analytical_general_ledgers`; hazır olunca `file_url`). FEC 18 standart sütun: alış (`HA`), banka (`BQ`) ve KDV (`RT`) günlükleri, hesap numaraları, eşleşme kodu (`EcritureLet`) dolu. Analitik defter Excel; satır başına analitik eksen ve kategori. |

**Pennylane — açık kalan:**
- E-fatura okuma: test şirketine e-fatura gelmiyor; canlı hesapta yalnız okuyarak ölçülür.
- Ters yüklemenin KDV kodu (AB dışı `extracom`, AB içi `intracom_*`) ve hesap kodları muhasebeciyle netleşir.

**Revolut — belgeden okundu (06.10).** Kaynak geliştirici belgesi ve OpenAPI şeması (`Revolut-Api-Version: 2026-08-17`;
kopyası `.test-results/revolut/ham/api_merchant.yaml`, depoda değil). Site bot kontrolü yapıyor; sayfalar tarayıcıyla çekildi
(`.test-results/revolut/cek-cok.mjs`, `ham-indir.mjs`).

| Konu | Belgede yazan | Bizdeki karşılığı |
|---|---|---|
| Model | Her ödeme bir **sipariş** (`order`) üstünden yürür; siparişin altında ödeme denemeleri vardır, başarılı ödemeden sonra yeni deneme kabul edilmez. Durumlar: `pending → processing → authorised → completed`; deneme düşerse sipariş `pending`e döner ve aynı sipariş yeniden ödenebilir. Ara durumlara (`authentication_challenge` …) göre karar verilmez. | Ödeme kimliği (`payment_ref`) Revolut sipariş kimliğidir. Yarım kalan ödemeye dönüş siparişin `token`ıyla olur. |
| Sipariş açma | `POST /api/orders`: `amount` (cent), `currency` zorunlu; `merchant_order_data.reference` (bizim sipariş no, webhook'ta `merchant_order_ext_ref` olarak döner), `metadata` (yalnız metin), `expire_pending_after` (ödenmeyen sipariş bu sürede düşer), `capture_mode` (`automatic`/`manual`), `customer`, `line_items` (vergili), `shipping`, `location_id`, `redirect_url`. | `metadata.order_id` + `merchant_order_data.reference` + `expire_pending_after` (rezervasyon bitişi). |
| Manuel tahsil | `capture_mode: manual`: yetki varsayılan 7 gün geçerli (`cancel_authorised_after` ile değişir); tahsil edilmeyen yetki iptal edilir, para hemen serbest kalır (iade 5–7 gün sürer). | Bugün otomatik tahsil kullanılıyor; değiştirmek ayrı karar. |
| Webhook | Olaylar: `ORDER_COMPLETED · AUTHORISED · CANCELLED · FAILED`, `ORDER_PAYMENT_DECLINED · FAILED`, `PAYOUT_INITIATED · COMPLETED · FAILED`, `DISPUTE_*`. Gövde yalnız `event`, `order_id`, `merchant_order_ext_ref` taşır; ayrıntı siparişi okuyarak alınır. Sıra garanti değil; hata ya da zaman aşımında 10 dk arayla 3 kez yeniden gönderilir; en fazla 10 adres. İmza: `Revolut-Signature: v1=<HMAC-SHA256>`, imzalanan metin `v1.{Revolut-Request-Timestamp}.{ham gövde}`; zaman 5 dk toleransla doğrulanır; anahtar dönerken başlıkta birden çok imza olabilir. Gönderen IP'ler sabit (canlı 35.246.21.235 · 34.89.70.170). | `revolut-event.ts` + `payment-webhook.ts`; olay kaydı (`claim`) ve sıra bağımsızlığı aynen geçerli. |
| İade | `POST /api/orders/{id}/refund`: yalnız `completed` sipariş; kısmi iade birden çok kez, toplamı ödemeyi aşamaz. İade **yeni bir sipariş** (`type: refund`, `related_order_id`) doğurur ve eşzamansızdır; sonucu iade siparişinin `ORDER_COMPLETED` ya da `ORDER_PAYMENT_DECLINED/FAILED` olayıdır. Pay by Bank ödemesi iade edilemez. | `provider-refund.ts` kısmi tutarla zaten çalışıyor; iade siparişinin kimliği saklanıp olayla eşlenir. |
| İptal | `POST /api/orders/{id}/cancel`: yalnız `pending` ya da `authorised` (manuel tahsil) sipariş. | Rezervasyonu düşen siparişin ödemesi kapatılır. |
| Komisyon | Ödeme ayrıntısında (`GET /api/payments/{id}`) `fees[]`: `type` (`acquiring` · `fx`), `amount`, `currency`; ayrıca `settled_amount`. Raporlar (`settlement_report`, `payout_statement_report`) işlem başına `fee_amount` taşır. | `kart-komisyonu` doğası bu alandan yazılır. |
| Merchant → ana hesap | Para Merchant hesabına (Business'ın alt hesabı) yaklaşık 24 saatte yerleşir. `POST /api/payouts` bakiyenin **tamamını** Business hesabına aktarır (tutar seçilemez); `PAYOUT_*` olayları ve `payout_statement_report` aktarımın hangi işlemlerden oluştuğunu verir. | Aktarım transferi `PAYOUT_COMPLETED` olayından yazılır. |
| Web ödeme | `@revolut/checkout`: gömülü kart alanı (`createCardField`), açılır kart penceresi, Revolut Pay, Apple Pay / Google Pay düğmesi, ya da Revolut'un barındırdığı ödeme sayfası (`redirect_url`). Kart kabulünün canlıda sağlıklı çalışması için ad, e-posta ve **fatura adresi** verilmeli. Apple Pay için alan adı kaydı (`/.well-known/apple-developer-merchantid-domain-association` + `POST /api/apple-pay/domains/register`); Google Pay ek adım istemez. | Barındırılan ödeme sayfası (`checkout_url` + `redirect_url` + `line_items`): tasarımın "Kart ile güvenli ödeme sayfasında" kararı. Satır toplamı tutarı vermezse satırlar gönderilmez. |
| Native | React Native için `@revolut/revolut-merchant-card-form` + `@revolut/revolut-payments-core`: siparişin `token`ıyla açılan hazır kart formu (3D Secure dahil). | `payment-sheet.ts` bu formu açar; Android kart formu en az API 28 (Android 9) ister, uygulamanın tabanı buna çekildi; müşteri native uygulaması ilk etapta yayında değil. |
| Kapıda kart | **Revolut Reader artık satılmıyor.** Tap to Pay SDK yalnız iPhone'da (XS ve üstü, iOS 16.4+), **deneme ortamını desteklemiyor**: deneme yalnız canlıda gerçek ödemeyle (ilk kurulumda 1 birimlik deneme ödemesi). Önkoşullar: Revolut Developer Portal'da uygulama + `tap_to_pay_sdk` kapsamı ve canlı onayı; işletmeden OAuth (PKCE) izni, arka uçta jeton saklama ve yenileme, cihaza kısa ömürlü jeton; Apple'dan Tap to Pay hakkı (`com.apple.developer.proximity-reader.payment.acceptance`); SDK yerel iOS (CocoaPods). `performPayment` tutar, para birimi ve isteğe bağlı açıklama alır; sonuç olarak yalnız başarı/hata ve makbuz adresi döner, Revolut sipariş kimliği dönmez. Terminal'e sunucudan ödeme gönderme: sipariş `channel: pos` ve fiziksel `location_id` ile açılır, Terminal aynı konumda "Pay at Counter" kipinde olmalı. | 17. karar. SDK siparişi kendi açtığı için bizim siparişle bağ açıklamadan kurulur: açıklamaya sipariş numarası yazılır, webhook'taki sipariş okunup eşlenir; açıklamanın siparişte hangi alana düştüğü canlı denemede ölçülecek. Operasyon uygulaması Expo olduğu için SDK'yı saran yerel modül gerekir. |
| Deneme ortamı | Ayrı Sandbox Business hesabı (kayıt anında onaylanır, e-posta/SMS yok), ayrı anahtarlar, taban adres `sandbox-merchant.revolut.com`; yalnız test kartları (başarılı: 4929420573595709 Visa, 5281438801804148 Mastercard; ret senaryoları için ayrı kartlar). Apple Pay deneme ortamında yok. | Ölçüm turu buradan. |

**Revolut — deneme hesabında ölçüldü (06.10).** Betikler `.test-results/revolut/a1…a6-*.mjs`, çıktılar `olcum/`.

| Konu | Sonuç |
|---|---|
| Sipariş açma | 201, `pending`; cevapta `token`, `checkout_url`, `merchant_order_data.reference` ve `metadata` geri dönüyor, `expire_pending_after` cevapta görünmüyor. |
| Ödeme | Barındırılan ödeme sayfası kart için ad, e-posta, kart ve posta kodu istedi; test kartıyla (Visa) ödeme geçti, sayfa `redirect_url`e döndü. Sipariş `completed`, ödeme `captured`. Deneme hesabında sayfadaki işletme adı "Acme Corporation". |
| Komisyon | Tahsilden hemen sonra ödeme ayrıntısında `fees: [{ type: acquiring, amount: 36 }]` ve `settled_amount: 1214` (12,50 € − 0,36 €); ödeme raporunda da `fee_amount 0.36`. |
| Kısmi iade (5,00 €) | `type: refund` sipariş `processing` açıldı, 5 sn içinde `completed`; iade ödemesinde `fees: []`, `settled_amount: -500`; özgün siparişe `refunded_amount` eklendi. Komisyon iade edilmiş görünmüyor. |
| Süre dolması | `expire_pending_after: PT1M` verilen sipariş ~3 dk 20 sn sonra `failed` oldu (hemen değil). |
| İptal | Bekleyen sipariş `cancel` ile anında `cancelled`. |
| Aktarım | Deneme hesabında aktarım (payout) kaydı oluşmadı. |
| Yerleşme raporu | Deneme hesabında tutarsız: yerleşme satırında tutar 12,50, yerleşen 5,00, komisyon 0,00; ödeme ayrıntısı ve ödeme raporuyla uyuşmuyor. Canlıda doğrulanacak. |
| Webhook | Geçici genel adresle ölçüldü (`b1…b3-*.mjs`). Başarılı ödeme: `ORDER_PAYMENT_AUTHENTICATED` → `ORDER_AUTHORISED` → `ORDER_COMPLETED`; reddedilen kart (yetersiz bakiye): `ORDER_PAYMENT_AUTHENTICATED` → `ORDER_PAYMENT_DECLINED`, sipariş `pending`te kalır; iptal: `ORDER_CANCELLED`; kısmi iade: iade siparişinin `ORDER_COMPLETED`i (kendi referansıyla); süre dolması: `ORDER_FAILED` (bu turda ~2 dk sonra). Gövde her olayda yalnız `event`, `order_id`, `merchant_order_ext_ref`. Dokuz olayın dokuzunda HMAC-SHA256 imza (`v1.{ts}.{ham gövde}`) doğrulandı; olay ile zaman damgası arası ~0,1 sn; gönderen IP'ler belgedeki sandbox adresleri. Abone olunsa da `ORDER_PAYMENT_AUTHORISATION_STARTED` gelmedi. |

**Revolut — açık kalan:**
- Aktarımın Merchant hesabından ana hesaba kendiliğinden olup olmadığı, yerleşme raporu ve iadede komisyon: canlıda.
- Tap to Pay (canlıda): SDK'nın açtığı siparişte `description`ın nereye düştüğü ve webhook'tan sipariş numarasına ulaşılıp
  ulaşılamadığı; ödeme komisyonu.
- Android'de Google Pay, itiraz (dispute) akışı.

## 7. Faz 1 tasarımı — Hiboutik kasa (01.10)

**İlke: sipariş başına durum farkı.** Hiboutik'e hareket başına olay yazılmaz. Her turda siparişin bugünkü
hâli (ücretlenen kalemler ve yönteme göre net para) Hiboutik'e yazılmış olanla karşılaştırılır, yalnız
fark yazılır. Hareketler silinebildiği ve yutulabildiği için (ekstre birleştirmesi, `absorb_provisional_movement`)
hareket başına kayıt mükerrer üretirdi; durum farkında tekrar eden tur, yarıda kalan yazım ve sonradan
düzeltilen hareket kendiliğinden doğru sonuca iner.

**Kapsam:** B2C siparişlerin bütün tahsilat ve iadeleri (çevrim içi, kapıda nakit ve kart, gel-al, kapı
önü ve araç satışı) ve eşlenmiş kasaların öteki nakit hareketleri. B2B siparişi fiş olmaz (10. karar);
hediye sipariş hiç para görmez (11. karar). Canlıya geçiş anı ayardır; kapsamı paranın anı belirler.

**Akış:**
1. `money_movement`ta sipariş parası yazılınca, değişince ya da silinince tetikleyici siparişi kasa
   kuyruğuna işaretler; eşlenmiş nakit hesabının öteki hareketleri de kuyruğa düşer. Aynı işlemde olduğu
   için kuyruğa düşmeyen para kalmaz.
2. İşlem biter bitmez o siparişin kuyruk satırı işlenir (18. karar): motor planı çıkarır, Hiboutik uyarlaması
   yazar, sonuç bizdeki kasa aynasına geçer; müşteri ve kurye bunu beklemez. Yazılamayan satırı backend cron'u
   (`register-sync`, dakikada bir) tamamlar. Satırı işleyen onu kilitler, aynı satırı iki yazar birden işlemez.
   Hiç para görmemiş sipariş yazılmaz.
3. **Kalem farkı varsa yeni fiş** (Hiboutik satışı): fark kalemleri (artı ya da eksi) ve yöntem
   farkı kadar ödeme satırı. İade, eksi kalemli fiştir; `void` kullanılmaz, çünkü iadeyi asıl ödemenin
   yöntemine yazıyor, oysa operatör kartla ödenmiş siparişi nakit iade edebilir (DOMAIN §8).
4. **Yalnız ödeme farkı varsa** (kalan borcun ödenmesi, fazla tahsilatın iadesi) siparişin son fişine
   ödeme satırı eklenir; gün kapanmışsa Hiboutik onu satışın nakit akışı olarak kaydeder. Her fiş `DIV`
   açılır: tutarlar açık yazılır, eksik ya da fazla ödeme fişin bakiyesinde görünür.
5. **Para doğurmayan kalem farkı** (eksik ödenmiş siparişte iade, borçsuz iptal) ödemesiz fiştir; fişi
   olan siparişi kalem ve durum değişikliği de kuyruğa düşürür.
6. **Değişen hareket:** B2C tahsilat hareketinin tutarı, yöntemi, hesabı ve siparişi değişmez, hareket silinmez;
   bunu veritabanı korur (18. karar). Düzeltme ters harekettir ve kasaya eksi satır olarak gider.

**Ücretlenen kalem motorun tanımıdır** (`fulfilledLineAmountCents`, `isFulfillmentSettled`): hazırlık
kesinleşmeden sipariş edilen adet, sonra giden eksi müşteride kalan; iptalde sıfır; kargo ancak ücretlenen
kalem varsa. Hiboutik kalemi:
- Tutar indirim payı düşülmüş tutardır. Birim fiyat kuruşa bölünmüyorsa kalem ikiye ayrılır.
- Paket kalemleri zaten ayrı `order_item`, ayrı yazılır.
- Kargo, ücretlenen kalem tutarlarına göre KDV oranlarına bölünür (`apportionShippingVat`); oran başına
  bir "Frais de livraison" kalemi. Kalem değişince kargonun oran payı da değişir, fark iade fişinde
  düzeltilir.
- Kalemler türetilen borcu tutmazsa plan bunu işaretler ve uyarı yazılır; fark fişin bakiyesinde görünür.
  İndirimin kalemlere tam dağıtıldığını veritabanı zaten zorluyor (`assert_order_discount_balance`).

**Sabit hesaplar** (18. karar): Kasa (nakit) ve Revolut Merchant (sağlayıcı) migration'la açılır ve pasifleşmez. Kapı nakdi
ayarı (`door_cash_account_id`) Kasa'yı, kapıda kart ayarı (`door_card_account_id`) Revolut Merchant'ı gösterir; online
tahsilat da Revolut Merchant'a yazılır. Kart parasının aktarıldığı banka (`card_payout_account_id`) sabit değildir, banka
eşlemesiyle gelir. Ödemenin yazılacağı hesap okunamazsa ödeme başlamaz: online'da ödeme sayfası açılmaz, kapıda ve kapı
önünde tahsilat başlamaz.

**Ödeme kodu hareketin yönteminden:** nakit `ESP`, kapıda ve tezgâhta kart `CB`, çevrim içi `WEB`, havale
`VIR`. Yöntem bugün siparişte duruyor ve sonraki tahsilatta üzerine yazılıyor (kapıda nakit ve kart aynı
hesaba giriyor) → `money_movement`a `payment_method` kolonu; tahsilat kapısı (`recordOrderPayment`,
`recordOrderRefund`) onu çağıranlardan alır. İadede: kasa hesabından `ESP`, bankadan `VIR`, sağlayıcıdan
asıl ödemenin yöntemi; ortak cari iade yolu olarak sunulmaz, çünkü müşteriye para şirketin hesabından döner.

**Eşlemeler (bizde):**
- **Mağaza:** tesis deposu ↔ Hiboutik mağazası ↔ o kasanın nakit hesabı. Araç satışı aracın ana
  deposunun mağazasına yazılır. Eşlemesiz depodaki sipariş beklemede kalır ve uyarı verir.
- **Ürün:** varyant ↔ Hiboutik ürün numarası; ilk satışta açılır. Stok takipsiz; ad Fransızca ürün adı ve
  boy (fişte görünen bu); KDV varyantın oranı; katalog fiyatı B2C liste fiyatı ki Hiboutik'in indirim
  raporu anlam taşısın. `products_ref_ext` = varyant kimliğinin ilk 20 onaltılık hanesi (kurtarma anahtarı).
  Sipariş kalemindeki KDV ürününkinden farklıysa (oran sonradan değişmiş) kalemde oran değiştirilir.
- **Fiş numarası:** `ext_ref` = `<sipariş referansı>-<sıra>` (ör. `LA-26-7K4M2P-2`, 25 karakter sınırında).

**Kasa aynası** — Hiboutik'e ne yazıldığının bizdeki kaydı; plan farkı buna göre çıkarır:
- fiş: sipariş, sıra, Hiboutik satış numarası, günlük sıra numarası (`unique_sale_id`), dijital fiş
  bağlantısı, durum;
- fiş kalemi: kaynak (sipariş kalemi ya da kargo/oran), adet, tutar;
- ödeme satırı: kod, tutar, Hiboutik ödeme satırı numarası.

**Yarıda kesilme:**
- Her Hiboutik çağrısından önce aynaya "yazılıyor" satırı düşer, sonra Hiboutik'in verdiği numara.
- Yarım fiş yeniden ele alındığında Hiboutik'teki hâli okunur. Satış numarası kaybolduysa `ext_ref`
  aramasıyla bulunur ve tam eşleşme okunarak doğrulanır.
- Kapanmamış fişin satışı silinip aynadan yeniden yazılır (kapanmamış satış mali kayıt değil). Kapanmış
  fişe ödeme eklenmeden önce Hiboutik'te sahipsiz bir ödeme satırı ya da nakit akışı var mı diye okunur.

**Hata:** Hiboutik'e ulaşılamazsa sipariş kuyrukta kalır, artan aralıkla (1 dakikadan 5 dakikaya; bağlantı dönünce kayıt
en geç 5 dakikada yazılır) yeniden denenir; beşinci denemede (yaklaşık 12 dakika) `error_log`a yazılır ve yönetime ve
muhasebeye bildirim gider. Plan
durursa (yöntemi bilinmeyen hareket, iadeyle başlayan sipariş, eşlenmemiş depo) satır sebebiyle bekler ve ilk turda
bildirim gider, eşlenmemiş depoda depo ve gün başına bir kez; gece kapanışını beklemek düzeltmeyi ertesi güne,
kaydı da o günün Z'sine kaydırırdı. Çözüm bir para değişikliğiyle gelir ve satırı yeniden işaretler. Mağaza
eşlemesi ve canlıya geçiş günü kaydedilince eşlemesiz duran satırlar hemen yeniden denenir, eşlenen çekmecenin
canlıya geçişten sonra yazılmış hareketleri de kuyruğa alınır (tetikleyici yalnız yazım anındaki eşlemeyi görür).
Satış tarihini API almıyor: geciken fiş yazıldığı günün Z'sine düşer.

**Canlıya geçiş:** `register_live_from` ayarı (an). Ayar yoksa ya da okunamıyorsa eşitleme hiç koşmaz.
Bu andan sonra para görmüş siparişin bütün tahsilat ve iadeleri yazılır, açılışı önce olsa da; yalnız
önceden para görmüş sipariş ve önceden yazılmış kasa hareketi kasaya gitmez.

**Canlıya geçiş adımları:** Hiboutik'te mağaza açılır ve kurulum kartında tesise eşlenir. Ödeme
türlerinden ESP ve CB hazır gelir; WEB (online) ve VIR (havale) kasada açılır, yoksa o yöntemle yazılan
ödeme reddedilir. Backend ortamına anahtarlar ve `HIBOUTIK_MODE=live` girilir; en son kartta canlıya
geçiş günü girilir.

**Kasa hareketleri:** eşlenmiş nakit hesabının fiş olmayan hareketleri Hiboutik'e açıklamasıyla `cash_out`
/ `cash_in` olarak yazılır, kasa sayımı fiziksel kasayla tutsun diye: bankaya yatırma, kasadan ödenen gider,
bozukluk ve sermaye girişi, kapıda nakit alınan B2B parası ve iadesi, kurye farkı. B2C sipariş parası fişle
girer, kart çekmeceye girmez; var olan transfer ucuna bağlanmış ekstre satırı kasaya yazılmaz, karşılığı o
uçtur. Kasadaki kayıt değişmez: tutarı, yönü ya da kasası değişen ya da silinen hareketin yürürlükteki kaydı
ters çevrilir, yeni etkisi varsa yeni kayıt yazılır. Açıklama hareketin künyesini taşır (sonraki kayıtta sıra
eki alır), yarıda kalan yazım onunla bulunur.

**Kurye farkı** (12. karar): nakit farkı sıfır değilse sefer kapanışı (`close_delivery_run`) farkı aynı
işlemde seferin nakit tahsilatlarının girdiği hesaba hareket olarak yazar (eksikte çıkış, fazlada giriş; tür
"kasa farkı", hesap kodu muhasebecinin; `meta.deliveryRunId`). Hesap tek değilse yazılmaz, fark kapanış
kaydında kalır. Kasa hareketi kuralı hareketi Hiboutik'e taşır. Kart farkı kasaya dokunmaz, yalnız
mutabakattır.

**Hediye sipariş** (11. karar): sipariş açılırken her kalem sıfır fiyatla yazılır, liste fiyatı pazarlık
izinde kalır; kargo alınmaz (`checkout-draft`). Ödenecek tutar, ciro ve kâr raporundaki gelir böylece
kendiliğinden sıfırdır, mal maliyeti gider olarak kalır; sipariş teslim edilince ödeme beklemeden kapanır
(`isSettled`). Ödeme kapısı sıfır tutarı hareket olarak yazmaz; hediyeye yine de para yazılırsa kasa planı
durur ve uyarır.

**Gün sonu** (`register_close_day`, her gece `REGISTER_CLOSE_AT` saatinde, varsayılan 00:15 Paris; mağaza başına):
önceki gün bittikten sonra bakılır ki gece yarısına sarkan yazım da onun mutabakatına girsin. Kapanmamış
günler (en çok 7 gün geriye, canlıya geçişten önceye değil) sırayla karşılaştırılır:
1. **Defter ↔ ayna** (`register_day_movements`): gün içinde açılmış her hareketin kasada beklenen etkisi
   (B2C sipariş parası yöntemiyle ödeme satırı; çekmece hesabının kart dışı öteki nakdi, defterin karşı yaka
   kuralıyla kasa kaydı) aynada yazılanla tutmalı. Yanlış plan ayna ↔ kasada fark çıkarmaz, burada çıkarır.
2. **Ayna ↔ Hiboutik:** oran başına KDV dahil tutar (`/z/taxes`), yöntem başına ödeme (`/z/payment_types` ve
   kapanmış güne eklenen ödemeler için `/z/cash_flow`), satış kimlikleri (kasada olup bizde olmayan satış
   Hiboutik ekranından elle yapılmıştır) ve çekmecenin günlük net nakdi; bizim taraf yazıldığı ana göre sayılır.
3. **Bekleyen:** mağazanın kuyrukta duran siparişi ve kasa hareketi.

Hepsi tutuyorsa gün kasada kapatılır (`POST /z/closure`); yalnız `HIBOUTIK_MODE=live` iken, çünkü kapanış geri
alınmaz ve demoda yapılamıyor. Tutmuyorsa gün kapanmaz, yönetime ve muhasebeye bildirim gider; Hiboutik'in
kapanışı önceki günleri de kapattığı için tutmayan gün düzelene kadar sonrakiler de bekler; aynı sebeple 7 günün
gerisinde kapanmamış gün kalmışsa da gün kapatılmaz ve bildirim gider, o gün elle incelenir. Fark `error_log`a
uyarı olarak, özet `job_run`a yazılır.

**Ekranlar:** yeni ekran yok. Ayarlar › Kurulum: Hiboutik kartı (tesis ↔ mağaza ↔ çekmece eşlemesi, canlıya
geçiş günü, kuyruk özeti, son eşitleme ve gün sonu turu); kuyruk özeti sistem ekranında değil kasanın yanında,
çünkü çözümü (eşleme, canlıya geçiş) orada. Sipariş detayı: hareketin yöntemi, kasa fişinin günlük numarası,
dijital fiş bağlantısı ve kasaya yazılmayı bekliyorsa sebebi. Sistem ekranı: gün sonu farkı ve beşinci
denemede düşen yazım hata kaydı olarak.

**Kod yerleşimi:**
- `packages/domain-core/src/register/`: plan (ücretlenen kalem, kuruş bölmesi, kargo payı, fark, ödeme kodu,
  yeni fiş mi ödeme satırı mı) ve mutabakat karşılaştırması.
- `packages/database`: kasa tabloları (mağaza, ürün, fiş, fiş kalemi, ödeme satırı, kuyruk), tetikleyici,
  servisler; `money_movement.payment_method`.
- `packages/application/src/register/`: `CashRegister` portu ve Hiboutik uyarlaması (anahtar yoksa port
  yok), sipariş eşitleme, kasa hareketi, mutabakat. Hiboutik'in cevap biçimi `packages/types` sözleşmesinde;
  istemci ayrı paket değil, kullanıcısı yalnız uygulama katmanı.
- `apps/backend/src/jobs/`: `register-sync` (dakikalık) ve `register-close-day` (günlük kapanış ve mutabakat).
- Ödemenin hemen arkasından yazım `register/sync.ts`'teki `kickOrderRegister`'dır; tahsilat ya da iade yazan akış (online onay,
  kapıda ve gel-al teslimi, kapı önü satış, iade) sonunda çağırır. Kuyruk satırının kilidi `register_queue_claim`.
- Ortam: `HIBOUTIK_ACCOUNT`, `HIBOUTIK_USER`, `HIBOUTIK_API_KEY`, `HIBOUTIK_MODE` (`demo` | `live`), `REGISTER_CLOSE_AT`.

**Testler:**
- Motorun her dalı birim testte: kuruş bölmesi, kargo payı, iptal, müşteride kalan, eksik ve fazla ödeme,
  ödeme kodu, yeni fiş ya da ödeme satırı.
- Tetikleyicinin kuyruğa işaretlemesi ve eşitleme entegrasyon testinde; eşitleme bellek içi kasayla koşar,
  yarıda kesilen yazım o kasada kurulur.
- Hiboutik istemcisi sahte `fetch` ile birim testinde.
- Hiboutik'e karşı ölçüm demo hesapta, betiklerle; test paketinde değil.

**İş sırası** (her adım ayrı commit):
1. Motor ve testleri.
2. Hediye siparişin ödemesiz kapanışı.
3. Şema, servisler, tahsilat kapısının yöntem alanı ve kurye farkının hareketi.
4. Hiboutik uyarlaması, eşitleme cron'u, ürün aynası ve fiş dışı nakit (B2B nakdi, kurye farkı).
5. Mutabakat ve gün kapanışı.
6. Ekran satırları ve mimari belge güncellemeleri (`DOMAIN.md` §7 ve §9, `INTEGRATIONS.md`,
   `data-model/para.md`).
7. İki ajanla inceleme (13. karar) ve rapordaki uyumsuzlukların giderilmesi.

Şemaya dokunan adım `db:refresh` ister; kararı kullanıcının.

## 8. Faz 2 tasarımı — Pennylane (02.10)

**İlke: her verinin tek sahibi.** Banka hareketi Pennylane'den gelir (6. karar), bizde izah edilir. E-fatura
Pennylane'den gelir, bizde belge olarak açılır. PDF ya da fotoğrafla gelen alış belgesi bizde girilir ve
Pennylane'e bizden yüklenir (4. karar); Pennylane'e doğrudan (e-posta yönlendirme, elle yükleme) girilmez, yoksa
aynı fatura iki kez kaydedilir. Eşleştirme bizde yapılır ve Pennylane'e yazılır (5. karar). Pennylane'e yazım
Hiboutik'teki gibi durum farkıdır: kaydın bugünkü hâli Pennylane'de yazılmış olanla karşılaştırılır, yalnız fark
yazılır; yarıda kalan ya da tekrar eden tur kendiliğinden doğru sonuca iner.

**Kapsam:** eşlenmiş banka hesaplarının hareketleri; yönü çıkış olan fatura ve fişler (karşı tarafı tedarikçi ya
da cari); e-faturalar; bu belgelerle bu hareketler arasındaki bağlar. Sözleşme, bordro ve dekont Pennylane'e
gitmez. B2B satış faturası Faz 4'tedir. Para birimi avro olmayan belge yüklenmez, "Pennylane'e elle" diye
gösterilir.

**Bağın tutarı:** Pennylane bağda tutar taşımaz; hareketi faturalara açılma sırasıyla dağıtır, eşleme sırası dağılımı
değiştirmiyor (03.10 ölçümü). Bizim bağımız bağlanma sırasıyla dağılır: üç bağlama yolunun (banka kuyruğu, belgenin
ödeme seçicisi, "Ödemesini yaz") hiçbiri tutar sormuyor; bağ her seferinde hareketin kalanı ile belgenin açık
kalanının küçüğüdür (`allocateToDocument`). Model değişmez: bağın tutarı kalır, çünkü belgenin açık kalanı ve
tedarikçi borcu ondan türer. Tek faturayı kapatan ya da bütün faturaları tam kapatan harekette iki taraf aynı sonucu
bulur; hareket birden çok faturayı kısmen kapatıyorsa ya da fatura Pennylane'de başka tutardaysa veya ona orada başka
hareket bağlıysa Pennylane'deki kalan bizimkinden ayrılır ve belge "Pennylane'de farklı" diye işaretlenir; düzeltme elle
yapılır.

**Pennylane'de yapılan eşleşme:** muhasebeci Pennylane'de de eşleştirebilir; değişiklik akışı bunu 1–2 saniyede
gösterir.
- Bizde olmayan bir faturaya kurulan bağa dokunulmaz, çünkü Pennylane'e elle girilmiş kaydı ezerdi. İki işin bütün belgeleri
  bizde olduğu için o fatura Pennylane'e doğrudan girilmiştir ([`iki-is.md`](iki-is.md) 12. karar): hareket işaretlenir
  (`matched_elsewhere`) ama izahlı sayılmaz, banka kuyruğunda önerisi yoksa "Belgeyi bizde girin" der. Belge bizde girilince
  Pennylane'deki kopyası silinir; aynı tedarikçide aynı numaralı kopya durdukça belge yüklenmez.
- Bizim belgemize Pennylane'de kurulan, bizde olmayan bağ benimsenir: operatörün bağladığı kapıdan bizde de kurulur,
  satır tedarikçi ödemesi olur, tamamı bağlandıysa mutabıktır.
- Bizde duran ama Pennylane'de çözülen bağ bizde silinmez ve Pennylane'e yeniden yazılmaz; muhasebeye bildirim gider,
  karar bizim ekrandan verilir. Bağ Pennylane'de yeniden kurulursa işaret kalkar.
- Hareketin bizde yazılmayı bekleyen değişikliği varken Pennylane'deki eşleşmesi okunmaz, yoksa operatörün yeni
  çözdüğü bağ Pennylane'den geri benimsenirdi.

**Akışlar:**
1. **Banka hareketi okuma.** Ayarlar › Kurulum'daki Pennylane kartında banka hesabımız Pennylane'deki hesabına
   eşlenir ve canlıya geçiş günü girilir. Anahtar yalnız backend'dedir: eşitleme turu şirketi ve banka hesaplarını
   okuma kapalıyken de okuyup yazar, kart seçenekleri oradan alır. Pennylane'deki listeden düşen eşli hesap okunmaz,
   çünkü boş gelen hareket listesi bütün satırlarını silinmiş saydırırdı; kart onu işaretler. İlk okumada eşlenen hesabın o günden sonraki hareketleri listeden bir kez
   okunur (`GET /transactions`, hesap ve tarih süzgeciyle). Sonra değişiklik akışı (`/changelogs/transactions`)
   birkaç dakikada bir okunur. Akış son 4 haftayı tuttuğu için daha uzun bir kesintiden sonra liste canlıya geçiş
   gününden yeniden okunur; listede olmayan ama aynada duran hareket Pennylane'de silinmiştir. Hareket bizde eşleşmemiş banka satırı olarak yazılır (`source = bank_import`, tip
   `misc`); mükerrer kimliği `pennylane:<kimlik>`, Pennylane kimliği aynada durur. Pennylane'de tutarı, günü ya
   da açıklaması değişen satır bizde henüz izah edilmemişse güncellenir. İzahlı satıra dokunulmaz: parası (tutar, gün,
   yön) değişirse ya da hareket Pennylane'de silinirse muhasebeye ve yönetime bildirim gider. Eşlenmiş hesaba canlıya geçiş gününden sonrası için Excel yüklemesi
   reddedilir, çünkü iki kaynak aynı satırı iki kez yazardı; eşlenmemiş hesapta Excel yüklemesi bugünkü gibi kalır.
   Aynı kural öbür yönden de işler: dosyadan yüklenen son satırı canlıya geçiş gününe ya da sonrasına düşen hesap
   eşlenmez, gün de eşli hesabın son dosya satırına ya da öncesine alınmaz.
2. **Tedarikçi eşleme.** Pennylane'deki tedarikçi bizim tedarikçimize ya da carimize ayna tablosuyla bağlanır.
   Yüklenecek belgenin karşı tarafı Pennylane'de yoksa önce dış referansla (`sup:<kimlik>`, `cp:<kimlik>`), o da yoksa
   aynı firmanın elle açılmış kaydı aranır: KDV numarası tutan, tutan yoksa adı aynı olup KDV numarası çelişmeyen kayıt.
   Bulunan kayıt bağlanır, hiçbiri yoksa tedarikçi açılır (ad, KDV numarası, vade günü; ülke yalnız tam posta adresiyle
   gidiyor, bizde adres yapılandırılmış değil). Uyan birden çok kayıt ya da bizde başka karşı tarafa bağlı kayıt seçilmez,
   belge bekler. Dış referans tekil olduğu için tekrarlanan açılış çift kayıt doğurmaz.
3. **Alış belgesi yükleme.** Yönü çıkış olan, dosyası ve KDV kırılımı bulunan fatura ya da fiş, canlıya geçiş
   anından sonra girildiyse kuyruğa düşer. Pennylane iki şeyi yakalamıyor: KDV'nin orana uymadığı kırılımı ve
   aynı tedarikçide aynı numarayı. Birincisi belge girişinde denetlenir (`documentVatProblem`: oran başına pay en
   az 2 cent ya da beklenen KDV'nin binde beşi, çünkü fatura KDV'yi kalem kalem yuvarlayabilir). İkincisi yazımdan
   önce sorulur (`supplier_id` + `invoice_number` süzgeci).

   Belge dosyası PDF, JPEG ya da PNG'dir: Pennylane eki yalnız bunları alıyor, belge girişi de bunlarla sınırlı,
   fotoğraf çevrilmez. Dosya yüklenir ve fatura içe aktarılır: dış referans `doc:<belge kimliği>`, KDV kodu
   kırılımdan ve rejimden türer, vadesiz belgenin vadesi belge günüdür. Yarıda kalan yükleme dış referansla bulunur.
   409 cevabı aynı içerikli dosyanın başka bir faturada durduğunu söyler; belge "aynı dosya" sebebiyle bekler, çünkü
   Pennylane'e elle girilmiş faturayı sahiplenmek sonraki yazımla o kaydı ezerdi. Yüklenmiş belgenin alanları ya da kırılımı değişirse fark Pennylane'de
   güncellenir; satırlar silinip yeniden yazılır ve toplam onlarla birlikte gider. Dosyası değişirse Pennylane'deki
   ek değişmez, çünkü ek API'den değiştirilemiyor. Nakitle ödenen belge, yani bağlı hareketi banka satırı olmayan
   belge, tamamen kapanınca Pennylane'de `paid` işaretlenir; bağ çözülünce `to_be_paid`a döner.
4. **E-fatura okuma** (ertelendi: e-fatura Pennylane'e gelmeye başlayınca, 2. karar). İlk bağlantıda Pennylane'deki e-faturalar (`e_invoicing` dolu olanlar) listeden bir kez
   okunur; sonrasını değişiklik akışı taşır. Webhook (`supplier_invoice.e_invoicing_received`) isteğe bağlıdır,
   çünkü dışarıdan erişilen bir HTTPS adresi ister. Her e-fatura bizde belge olarak açılır: numara, gün, vade,
   tutar, satırlardan KDV kırılımı ve özel kovaya alınan PDF. Karşı taraf aynadan bulunur; bilinmiyorsa belge
   karşı tarafsız açılır, operatör seçer ve seçim aynaya yazılır. Operatör belgeyi mal kabule bugünkü "Neyin
   faturası" seçicisiyle bağlar. Mal kabulde eksik ya da kusur varsa belgeden itiraz yazılır (`disputed`, gerekçe
   sözlükten). Ret geri alınmadığı için ayrıca onay ister. Yeni e-fatura gelince muhasebeye ve depoya bildirim
   gider.
5. **Eşleşme yazma.** Pennylane'den gelen banka satırının bağı eklenince, silinince ya da "zaten yazmıştım"
   birleşmesiyle taşınınca, bağlı belgesi sonradan yüklenince de hareket kuyruğa düşer. İstenen küme hareketin bizdeki bağlarıdır: Pennylane'de karşılığı olan ve
   orada çözüldüğü işaretli olmayan belgeler. Sıra önemsizdir, çünkü Pennylane dağıtımı eşleme sırasına bağlamıyor.
   Eksik faturalarımız eklenir. Çıkan faturamız varsa hareketin bütün bağları tek çağrıyla çözülür ve küme baştan
   yazılır, çünkü tek bir bağı çözmek zaten hepsini çözüyor. Harekette bizde olmayan bir faturanın eşleşmesi de varsa baştan
   yazmak o kaydı ezerdi: hareket bu sebeple bekler, muhasebeye bildirim gider, düzeltme Pennylane'de elle yapılır. Yazımdan sonra ilgili faturaların Pennylane'deki açık kalanı okunup aynaya yazılır; bizimkinden
   ayrılan belge "Pennylane'de farklı"dır.
6. **Hareket gelmiyor uyarısı.** Günde bir kez bakılır. Eşlenmiş hesabın Pennylane'den gelen son hareketi
   `pennylane_quiet_days` günden (varsayılan 4) eskiyse muhasebeye ve yönetime bildirim gider; bankanın
   Pennylane bağlantısı yenilenir (§9, 1. risk).
7. **Açık kalanın okunması.** Faturalarımızın Pennylane'deki açık kalanı yazımdan sonra ve Pennylane'in fatura değişiklik
   akışından (`/changelogs/supplier_invoices`) okunur, çünkü toptan operasyonunun ya da muhasebecinin Pennylane'de yaptığı
   eşleşme bizim yazımımızdan geçmez. Akış şirketin bütün faturalarını getirir, yalnız bizimkiler okunur; akışın kapsamadığı
   boşlukta bütün faturalarımız yeniden okunur. Kalan bizimkinden ayrılırsa belge satırı "Pennylane'de farklı" yazar ve
   muhasebe kalan çifti başına bir kez uyarılır; kuyrukta bekleyen ve nakitle ödenen belge karşılaştırılmaz.

**Hata:** Hiboutik kuyruğunun aynısı: artan aralıkla yeniden deneme, beşinci denemede `error_log` ve anlık
bildirim. Yazım duran belge (oran tutmuyor, mükerrer numara, karşı taraf yok, avro dışı) ya da hareket (bizde olmayan
faturanın eşleşmesi) sebebiyle bekler, bildirim ilk turda gider. İstemci istek sınırına (5 saniyede 25) göre aralık bırakır; 429 gelirse `retry-after`
kadar bekler.

**Güvenlik:** istemci ilk istekte `/me` ile anahtarın şirketini okur; kip ile şirket uyuşmazsa (test kipinde
numarası `sandbox-` ile başlamayan, canlı kipte başlayan şirket) okuma dahil hiçbir istek gitmez, çünkü canlı
hareket test veritabanına ya da test şirketinin uydurma hareketi deftere karışırdı. Anahtar yalnız backend'dedir.
Log'a kimlik yazılır, tutar ve açıklama yazılmaz.

**Şema:**
- `money_document.vat_lines` (jsonb, oran başına KDV hariç tutar ve KDV, cent): belgenin KDV'sinin tek kaynağı.
  `vat_amount` ondan türeyen üretilmiş kolondur; satırsız belge KDV taşımaz. Satır varsa toplamı belgenin tutarıdır.
  Ters yüklemede satırın KDV'si 0, oranı beyandaki orandır; muaf belgenin kırılımı yoktur. Ayrı tablo değil, çünkü
  belge tek satırlık yazımla doğar ve kırılımı onunla tutarlı kalır; Pennylane kuyruğunun tetikleyicisi belgede
  durur.
- Ayna ve kuyruk:
  - `pennylane_bank_account`: Pennylane banka hesabı ↔ banka hesabımız; listede görülmesi, eşlenmesi, ilk okuması;
  - `pennylane_supplier`: Pennylane tedarikçisi ↔ tedarikçi ya da cari;
  - `pennylane_document`: Pennylane faturası ↔ belge; en son yazılan taslak, ödeme durumu, son okunan açık kalan, yazılan
    kategori;
  - `pennylane_transaction`: Pennylane hareketi ↔ banka satırı;
  - `pennylane_match_removed`: Pennylane'de çözülen bağımız;
  - `pennylane_queue`: yüklenecek belge ya da eşleşmesi yazılacak hareket;
  - `pennylane_cursor`: değişiklik akışının kaldığı yer.
- `money_movement.matched_elsewhere`: hareket Pennylane'de bizde olmayan bir faturaya eşli; izah sayılmaz.

  Pennylane kimlikleri `bigint`tir (ölçüldü: 14 hane).
- Ayarlar: `pennylane_live_from`, `pennylane_quiet_days`, `pennylane_category_lezzet` · `pennylane_category_qualite` (16. karar).
- Personel bildirimleri: e-fatura geldi, belge ya da eşleşme Pennylane'e yazılamıyor, eşleşme Pennylane'de çözüldü,
  izahlı hareket Pennylane'de değişti, hareket gelmiyor, Pennylane'de farklı.

**KDV kodu:** standart rejimde oran `FR_<oran × 10>` olur (`FR_55`, `FR_200`). Ters yüklemede AB içi tedarikçi
için `intracom_<oran>`, AB dışı tedarikçi için `extracom` kullanılır; muaf belge `exempt`tir. Ters yüklemenin
kodu muhasebeciyle doğrulanır: AB içi %20 için listede `intracom_*` kodu yok, yalnız %2,1 · 5,5 · 8,5 · 10 için
var.

**Ekranlar:**
- Ayarlar › Kurulum: Pennylane kartı (bağlantı ve kip, hesap eşlemesi, canlıya geçiş günü, kuyruk özeti, son
  eşitleme, hareket gelmeyen hesap); Hiboutik kartının deseni.
- Belge formu: tek KDV alanı yerine oran başına satırlar.
- Belge satırı: Pennylane durumu alt satırın sonunda (yüklendi ✓ · sırada · gitmedi ve sebebi · yazılamadı · Pennylane'de farklı
  ve oradaki açık kalan); Pennylane canlıya geçmeden yazılmaz. E-fatura durumu ve itiraz 7. adımla.
- Banka kuyruğu değişmez; satırın kaynağı "Pennylane" yazar, bizde olmayan faturaya eşli satırın hapı önerisi yoksa "Belgeyi
  bizde girin" der.

**Kod yerleşimi:**
- `packages/domain-core/src/accounting/pennylane/`: iki yönlü KDV kodu eşlemesi, içe aktarma gövdesi, yazım öncesi
  denetimler, bağ planı (eksikleri ekle; çıkan varsa baştan yaz, bizde olmayan faturanın eşleşmesi varsa bekle) ve
  okuması (benimse, çözüleni işaretle, bizde olmayan faturaya eşli), kalan tutar karşılaştırması.
- `packages/database`: tablolar, kuyruk tetikleyicileri (belge ve kırılımı, bağ), servisler.
- `packages/application/src/accounting/pennylane/`: port ve Pennylane istemcisi (istek sınırı, kip ile
  şirketin denetimi), bellek içi ikiz, okuma (hareket, fatura akışı, e-fatura), yazma (tedarikçi, belge, bağ, ödeme durumu), sessizlik
  uyarısı. Cevap biçimi ölçülen alanlarla `packages/types` sözleşmesindedir. Fotoğraf çevrilmez, yeni bağımlılık
  yok: Pennylane JPEG ve PNG eki alıyor.
- `apps/backend/src/jobs/`: `pennylane-sync` (birkaç dakikada bir; akışlar ve kuyruk), `bank-feed-quiet` (günlük).
- Ortam: `PENNYLANE_API_TOKEN`, `PENNYLANE_MODE` (`sandbox` | `live`).

**Testler:** motorun dalları birim testte; tetikleyiciler ve eşitleme entegrasyon testinde, bellek içi Pennylane
ile; istemci sahte `fetch` ile. Pennylane'e karşı ölçüm test şirketinde, betiklerle yapılır; test paketinde değil.

**İş sırası** (her adım ayrı commit):
1. Belgenin KDV kırılımı: şema, belge formu, asistan ve mal kabul önerileri, döküm.
2. Bağ kuralının kesinleşmesi (elle tutar seçeneğinin kaldırılması).
3. Pennylane istemcisi, port, sözleşme şemaları; sonraki her adım kendi okuma ve yazımını porta ekler.
4. Banka hareketi okuma (bellek içi ikiz ilk tüketicisiyle burada), Pennylane kartı (hesap eşlemesi, canlıya
   geçiş), hareket gelmiyor uyarısı.
5. Tedarikçi eşleme ve alış belgesi yükleme (denetimler, kuyruk, nakit ödemede ödeme durumu).
6. Eşleşme yazma ve Pennylane'deki eşleşmeleri okuma.
7. Ertelendi, e-fatura Pennylane'e gelmeye başlayınca: e-fatura okuma, mal kabule bağlama, itiraz; o faturaların bizden
   yüklenmemesi.
8. "Lezzet" kategorisi (16. karar), ekran satırları ve mimari belge güncellemeleri (`DOMAIN.md` §9, `INTEGRATIONS.md`,
   `data-model/para.md`).
9. Muhasebeciye aktarım, muhasebecinin istediği biçim gelince: Pennylane'den FEC olduğu gibi ya da Pennylane verisinden
   dönüştürülmüş döküm (2. karar).

Şemaya dokunan adımlar `db:refresh` ister; kararı kullanıcının.

**Aynı şirkette toptan operasyonu (03.10).** QUALITE'nin restoran ve marketlere toptan satışı Pennylane'i doğrudan kullanır:
fatura girer, tedarikçi açar, banka hareketini kendi faturasına eşler. Lezzet'in alış belgesi yalnız bizden gider. Bunun için:
tedarikçi açılmadan önce aynı firmanın kaydı aranır (akış 2), elle girilmiş fatura sahiplenilmez (akış 3), eşleşme yazımı
yalnız bizim yüklediğimiz faturalara dokunur ve Pennylane'de bizde olmayan faturaya eşlenmiş hareket bizde başka işe ait
sayılır (akış 5). Banka hesapları ayrıdır (15. karar), her belge işinin kategorisini taşır (16. karar, `iki-is.md`).
E-fatura alımı muhasebecinin platformundadır (2. karar); akış 4 e-fatura Pennylane'e gelince devreye girer.

**Muhasebeciye sorulacak:** ters yüklemenin KDV kodu; hesap kodlarını Pennylane'in tedarikçiden atamasının yeterli
olup olmadığı; fişin Pennylane'e fatura olarak girip girmeyeceği; Pennylane'den giden dosyanın biçimi (FEC ya da döküm)
ve sıklığı; alış faturasını Pennylane dosyasından mı kendi e-fatura platformundan mı kaydedeceği, çünkü aynı fatura
ikisinde de durur; belge dosyalarını isteyip istemediği.

## 9. Riskler

Operatörün Hiboutik ve Pennylane'de yapmaması gerekenler `docs/runbook/muhasebe-duzeni.md`'de.

1. **Banka bağlantısının kopması.** Bankalar bağlantıyı en çok 180 gün açık tutuyor, bazıları çok daha
   kısa (Pennylane'in tablosunda BNP 36 gün, CIC 0 gün). Kopunca hem Pennylane hem biz hareket alamayız.
   Çare: hesap başına "hareket gelmiyor" uyarısı; sık kopan bankada EBICS (Pennylane önerisi).
2. **Gecikme.** Hareket Pennylane'e bankaya göre saniyeler ile 72 saat arasında düşüyor; B2B havalesi
   siparişe geç bağlanabilir. Gerekirse yalnız Revolut'a gelen havaleler için Revolut webhook'u eklenir.
3. **Mükerrer belge.** Aynı fatura hem e-fatura hem PDF olarak ya da Revolut harcama aktarımıyla girerse
   iki kayıt olur; Pennylane yalnız aynı dosyayı yakalıyor. Çare: 8. karar + yüklemeden önce kontrol.
4. **Gelirin iki kez sayılması.** Pennylane'de Hiboutik dışında bir satış bağlantısı (ödeme sağlayıcısı
   vb.) açılırsa aynı satış iki kez gelir sayılır. B2C satışı Pennylane'e yalnız Hiboutik'ten, B2B satışı
   yalnız Pennylane'de kesilen faturadan girer.
5. **Kasa kaydının yazılamaması.** Hiboutik erişilemezse satış bizde var, kasada yok: yasal açık.
   Çare (18. karar): ödemenin hemen arkasından yazım, değiştirilemez bekleyen kayıt, en geç 5 dakikada bir yeniden
   deneme ve günlük mutabakatta fark uyarısı; gün kapanmadan kuyruk boşalmalı.
6. **Kasa sıfırlanması.** Hiboutik'te ürünler silinirse (demo sıfırlama) bizdeki ürün eşlemesi
   (`register_product`) olmayan ürünleri anar ve her yazım düşer; sıfırlamadan sonra eşleme silinmeli.

## 10. Kaynaklar

Resmî:
- [BOFiP BOI-TVA-DECLA-30-10-30 (25.03.2026)](https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325)
- [DGFiP fiş 1: e-fatura (Haziran 2026)](https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fiches_reforme/fiche-1_que-va-t-il-se-passer-pour-mon-entreprise.pdf)
- [DGFiP: e-reporting fişi (Eylül 2025)](https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fiches_reforme/fiche-e-reporting_transactions.pdf)
- [impots.gouv.fr: e-faturayı tanıyın](https://www.impots.gouv.fr/professionnel/je-decouvre-la-facturation-electronique)
- [DGFiP: logiciels de caisse soru-cevap (28.07.2017)](https://www.economie.gouv.fr/files/files/directions_services/dgfip/controle_fiscal/actualites_reponses/logiciels_de_caisse.pdf)

Hiboutik:
- API belgesi: `https://lezzetanatolie.hiboutik.com/docapi/yaml/` (kopyası `.test-results/hiboutik-docapi-hesap.yaml`, depoda değil)
- [Webhooklar](https://faq.hiboutik.com/en/api-development/webhooks)
- [E-fatura ve e-reporting](https://faq.hiboutik.com/fr/caisse-cloture/facturation-electronique-france-e-reporting)
- [Kapanış](https://faq.hiboutik.com/en/till-closing/perform-a-closing) · [Kapanış (FR)](https://faq.hiboutik.com/?faq=84)
- [Demo ve üretim modları](https://faq.hiboutik.com/fr/mon-compte/modes-demonstration-production)
- [Satışı önceki güne taşıma](https://faq.hiboutik.com/fr/caisse-cloture/transferer-une-vente-sur-une-journee-anterieure)
- [Açık satışlar](https://faq.hiboutik.com/en/sales/parked-sales) · [Satış numara sıraları](https://faq.hiboutik.com/?faq=38&locale=en) · [Ters satış](https://faq.hiboutik.com/?faq=54&locale=en) · [Mali arşiv](https://faq.hiboutik.com/?faq=2&locale=en)
- [Revolut Terminal uygulaması](https://faq.hiboutik.com/en/integrations/revolut-terminal) · [WooCommerce satış eşitlemesi](https://faq.hiboutik.com/en/integrations/sync-your-inventory-and-sales-with-woocommerce)

Pennylane:
- [Kasa yazılımlarından satış senkronu](https://help.pennylane.com/fr/articles/212053-logiciels-de-gestion-de-point-de-vente-synchroniser-les-ventes-en-magasin)
- [Tedarikçi faturası API'si](https://pennylane.readme.io/docs/supplier-invoicing)
- [Değişiklik akışı](https://pennylane.readme.io/docs/tracking-data-changes-with-pennylane-api)
- [Banka hareketleri](https://pennylane.readme.io/reference/gettransactions)
- [Faturaya hareket eşleştirme](https://pennylane.readme.io/reference/postsupplierinvoicematchedtransactions)
- [Banka bağlama](https://help.pennylane.com/fr/articles/18855-connecter-et-synchroniser-un-compte-bancaire)
- [Bankaların otomatik bağlantı kopması](https://help.pennylane.com/fr/articles/20882-anticiper-la-deconnexion-automatique-des-banques)
- [Test ortamı oluşturma](https://help.pennylane.com/fr/articles/18773-creer-un-environnement-de-test)
- [API seçimi (Company · Firm · Firm Group)](https://pennylane.readme.io/docs/what-apis-are-available)
- [Şirket anahtarı](https://pennylane.readme.io/docs/generating-my-api-token) · [Test ortamı ve ilk istek](https://pennylane.readme.io/docs/getting-started)
- [İstek sınırı](https://pennylane.readme.io/docs/rate-limiting-1) · [2026 değişiklikleri](https://pennylane.readme.io/docs/2026-api-changes-guide)
- [Webhook olayları](https://pennylane.readme.io/docs/list-of-events) · [E-fatura durumu](https://pennylane.readme.io/reference/putsupplierinvoiceeinvoicestatus)

Revolut:
- [Merchant API'ye giriş](https://developer.revolut.com/docs/guides/merchant/introduction) · [Başlarken](https://developer.revolut.com/docs/guides/merchant/get-started)
- [Merchant API başvurusu](https://developer.revolut.com/docs/api/merchant) · [OpenAPI şeması](https://developer.revolut.com/docs/api/merchant.yaml)
- [Sipariş ve ödeme yaşam döngüsü](https://developer.revolut.com/docs/guides/merchant/reference/order-lifecycle)
- [Webhook](https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/using-webhooks) · [İmza doğrulama](https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/verify-the-payload-signature)
- [İade](https://developer.revolut.com/docs/guides/merchant/operations/refunds) · [Sonra tahsil](https://developer.revolut.com/docs/guides/merchant/operations/capture-and-settlement/capture-later)
- [Kart alanı](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/card-payments/web/card-field) · [Apple Pay / Google Pay](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/apple-pay-google-pay/web) · [React Native kart formu](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/card-payments/mobile/react-native)
- [Tap to Pay](https://developer.revolut.com/docs/guides/merchant/accept-payments/in-person-payments/tap-to-pay/introduction) · [Terminal'e ödeme gönderme](https://developer.revolut.com/docs/guides/merchant/accept-payments/in-person-payments/terminal/push-payments)
- [Deneme ortamı](https://developer.revolut.com/docs/guides/merchant/test-and-go-live/set-up-sandbox) · [Test kartları](https://developer.revolut.com/docs/guides/merchant/test-and-go-live/testing/test-cards) · [Canlıya geçiş listesi](https://developer.revolut.com/docs/guides/merchant/test-and-go-live/testing/implementation-checklists)
- [Terminal'e sunucudan ödeme gönderme](https://developer.revolut.com/updates/2025/12/01/push-payments-to-terminal)
- [Pennylane entegrasyonu](https://www.revolut.com/fr-FR/business/integrations/pennylane-integration/)
- [Ödeme işleme sözleşmesi (Merchant hesabı)](https://www.revolut.com/en-FR/legal/business-acquiring)

SumUp:
- [POS Pro kapanış duyurusu](https://tillersystems-v3.readme.io/reference/introduction-1)
