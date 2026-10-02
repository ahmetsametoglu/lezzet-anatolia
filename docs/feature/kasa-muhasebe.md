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
| 2 | **Muhasebe Pennylane; kurulumunu kullanıcı yürütür** | Pennylane hem muhasebe yazılımı hem kayıtlı platform (PA): e-fatura alımı bugün, düzenleme ve e-reporting 2027'de. Aylık muhasebe ve KDV beyanı (CA3) Pennylane'den çıkar → **canlı öncesi şart.** |
| 3 | **Hiboutik ↔ Pennylane ve banka ↔ Pennylane doğrudan konuşur** | Bu iki akış için bizden kod yok; sistemimiz muhasebe işine karışmaz. |
| 4 | **Pennylane'e bizden giden: alış faturası ve eşleşme** | Yabancı ve e-faturaya geçmemiş tedarikçinin PDF faturası bizden yüklenir. Fransız tedarikçinin e-faturası Pennylane'e platformdan gelir; biz okuruz, yüklemeyiz. |
| 5 | **Eşleştirme bizde** — alış faturası ↔ ödeme ↔ mal kabul | Cari çalışma, kısmi ödeme, tek havaleyle birden çok fatura. `money_allocation` bunu tutarıyla, çoktan çoğa taşıyor. Revolut BillPay önerisi bu yüzden geri çekildi. |
| 6 | **Banka hareketlerinin kaynağı Pennylane** | Revolut ve Crédit Mutuel tek kaynaktan gelir. Excel içe aktarma yedek kalır. |
| 7 | **Revolut: çevrim içi ödeme + kapıda kart + banka** | Stripe'ın yerini alır; Stripe'taki sipariş başına defter düzeni aynen sürer. Revolut nakit almaz, Fransa'da nakit yatırma da kalktı → **nakit için Crédit Mutuel kalır.** Revolut hesap açılışı kullanıcıda. |
| 8 | **Revolut ↔ Pennylane bağlantısında yalnız banka akışı açık** | "Harcamalar" modülü ve Revolut'tan Pennylane'e fatura aktarımı kapalı: ikisi de bizim yüklediğimiz faturanın ikizini üretir. |
| 9 | **SumUp kasa olarak yok** | Genel API'si kasaya satış yazmıyor; Fransa'daki POS Pro (eski Tiller) 2026 sonunda kapanıyor, yeni entegrasyon talebi 2027'nin ikinci çeyreğinden itibaren. O tarihte yeniden bakılabilir. |
| 10 | **B2B Hiboutik'e yazılmaz** (01.10) | Kasa yükümlülüğü B2B'yi kapsamıyor (BOFiP §10). B2B faturası bugünkü gibi Pennylane'de kesilir; müşteri alacağı ve vade orada izlenir, 2027'de e-fatura olarak da oradan gider. Kapıda nakit alınan B2B parası Hiboutik kasasına yalnız kasa girişi olarak yazılır. |
| 11 | **Hediye sipariş ödemesiz kapanır** (01.10) | Kasaya para girmez, Hiboutik'e bir şey yazılmaz; mal hediye olarak stoktan çıkar, muhasebeci hediye gideri olarak işler. DOMAIN §9'daki "parasını patron öder, muhasebe aktarımına girmez" kuralının yerine geçer. |
| 12 | **Kurye nakdi farkı açıklamalı kasa hareketiyle yazılır** (01.10) | Sefer kapanışında nakit eksik ya da fazla çıkarsa fark bizde nakit hesabına hareket olarak, Hiboutik'e "Sefer kapanış farkı <sefer no>" açıklamalı kasa çıkışı ya da girişi olarak yazılır. Muhasebeci kasa farkı ya da kurye alacağı olarak işler. Kart farkı kasaya dokunmaz. |
| 13 | **Faz 1 bitince iki ajanla inceleme** (01.10) | İki ajan birebir aynı istemle, birbirinden bağımsız çalışır: ikisi de Hiboutik entegrasyonunu ve projenin muhasebe sistemini (para hareketleri, ödeme durumu, muhasebe aktarımı, kâr, KDV, B2B ve hediye kuralları) tasarım (§7), ölçülen davranış (§6) ve yasal zemin (§1) karşısında inceler, uyumsuzlukları raporlar. Bulgular doğrulanıp kullanıcıya özetlenir. `CLAUDE.md`'deki alt ajan yasağının bu inceleme için istisnasıdır. |
| 14 | **Kapıda kart parası nakit kasadan ayrı hesaba yazılır** (02.10) | Kurye, gel-al tezgâhı ve kapı önü satış kartla alınan parayı kapıda kart hesabına (`door_card_account_id`, kart cihazının hesabı), nakdi kapı çekmecesine (`door_cash_account_id`) yazar; hesabı istemci değil sunucu yöntemden seçer. Çekmece sayımı yalnız nakdi sayar. Yöntemin hesabı ayarlı değilse o yöntemle tahsilat kapalıdır ve teslim yazılmaz. |

## 3. Veri akışı

| # | Akış | Yön | Bizden kod | Dayanak |
|---|---|---|---|---|
| 1 | Her B2C ödemesi → kasa | biz → Hiboutik | var | Hiboutik API: `/sales`, `/sales/add_product`, `PUT /sale/{id}`, `/sales/close` |
| 2 | Satış → muhasebe | Hiboutik → Pennylane | yok | Pennylane, Chift üzerinden günlük Z kayıtlarını (*tickets Z*) çeker |
| 3 | Banka → muhasebe | Revolut, Crédit Mutuel → Pennylane | yok | Revolut'un resmî Pennylane bağlantısı (Open Banking); Crédit Mutuel toplayıcı (Powens / Bridge) ile |
| 4 | Kart tahsilatı → bizim defter | Revolut Merchant API → biz | var | ödeme nesnesinde komisyon (`fees`); para 24 saat içinde Business içindeki Merchant hesabına, oradan ana hesaba |
| 5 | Banka hareketi → biz | Pennylane API → biz | var | `GET /transactions` (hesap ve tarih süzgeci) + `/changelogs/transactions` |
| 6 | Alış faturası (yabancı / e-faturasız) | biz → Pennylane | var | `POST /file_attachments` (yalnız PDF) → `POST /supplier_invoices/import` |
| 7 | E-fatura (Fransız tedarikçi) | Pennylane API → biz | var | `/changelogs/supplier_invoices` (son 4 hafta) + `GET /supplier_invoices/{id}` |
| 8 | Eşleşme | biz → Pennylane | var | `POST /supplier_invoices/{id}/matched_transactions` (çağrı başına tek hareket–tek fatura) |
| 9 | Nakit → banka | Hiboutik kasasından çıkış, Crédit Mutuel'e yatırma | var | `POST /till/cash_out`; yatırma 3. akışla Pennylane'e gelir |

## 4. Bizim tarafta bağlantı noktaları (ölçüldü, 30.09)

- **Tahsilatın tek kapısı:** `packages/application/src/order/payment.ts` (`recordOrderPayment`,
  `recordOrderRefund`). Çağıranlar: kapıda tahsilat (`courier/delivery.ts`), gel-al
  (`warehouse/pickup.ts`), kapı önü satış (`order/quick-sale.ts`), çevrim içi onay
  (`order/confirm-payment.ts`), iade (`order/refund.ts`), Stripe webhook
  (`apps/web/lib/order/stripe-webhook.ts`). Kapı ödeme sağlayıcısından bağımsız; Hiboutik buraya oturur.
- **Ödeme sağlayıcı portu:** `packages/application/src/order/payment-gateway.ts` (durum, iptal, iade).
  Sağlayıcıya özgü kalan: ödeme ekranları (web, mobil), webhook, defter düzeni. Testler hariç 81
  dosyada `stripe` geçiyor.
- **Para modeli** (`0018_money.sql`):
  - `money_document` tek KDV tutarı taşıyor; Pennylane içe aktarma KDV oranlı satır istiyor →
    **şema değişikliği** (gıda %5,5 ile ambalaj %20 aynı faturada olabilir). KDV rejimi ve para birimi
    alanı var.
  - `money_allocation` (hareket ↔ belge, tutarıyla, çoktan çoğa) değişmez; 5. karar bunun üstüne.
  - Hesap türleri `cash · bank · provider · partner`. Revolut Merchant hesabı Stripe'ın `provider`
    düzenine oturur; komisyon için `stripe-ucreti` doğasının Revolut karşılığı gerekir.
- **Banka içe aktarma (Excel + yapay zekâ şablonu):** yedek olarak kalır.
- **B2B havalesi:** peşin ve vadeli havale siparişe bizim sistemde bağlanır
  (`packages/domain-core/src/payment/checkout-options.ts`); banka hareketi artık Pennylane'den gelir.

## 5. Yol haritası

| Faz | İş | Başlıca yerler | Ön şart |
|---|---|---|---|
| 0 | **Erişim ve ölçüm.** Hesaplar: Hiboutik demo modunda (API için Premium, ikincil kaynak), Pennylane test ortamı ve API anahtarı (API Essentiel planda ve üstünde), Revolut deneme hesabı (asıl hesaptan bağımsız, anında). §6'daki soruların ölçümü; çıktı ölçüm tablosu ve tasarım kararları. | kök `.env` (değişken adları kullanıcıdan) | Hesapları kullanıcı açar |
| 1 | **Hiboutik kasa.** Tasarım §7: sipariş başına durum farkı, kasa aynası, ürün ve mağaza eşlemesi, kasa hareketleri, günlük mutabakat, gün kapanışı. | domain-core `register/`; migration (kasa tabloları, tetikleyici, hareketin ödeme yöntemi); Hiboutik uyarlaması; backend cron'ları | Faz 0 Hiboutik ölçümü (tamam) |
| 2 | **Pennylane.** Tedarikçi eşleme (`POST /suppliers`); belgeye KDV oranlı satır; PDF yükleme (yabancı ve e-faturasız tedarikçi; fotoğraf PDF'e çevrilir); yüklemeden önce mükerrer kontrolü; e-fatura okuma ve mal kabule bağlama; banka hareketi okuma; eşleşme yazma; hesap başına "hareket gelmiyor" uyarısı. | `money_document` şeması; para modülü; yeni Pennylane adaptörü | Faz 0 Pennylane ölçümü |
| 3 | **Revolut.** Çevrim içi ödeme Stripe yerine (Merchant API: sipariş, kart alanı, Apple / Google Pay, webhook, iade); kapıda kart (Terminal'e tutar gönderme ya da elle onay + sonradan doğrulama); defter düzeni (brüt tahsilat · komisyon · Merchant'tan ana hesaba aktarma). | `payment-gateway.ts`; web ve mobil ödeme ekranları; `stripe-webhook.ts`'in karşılığı | Faz 0 Revolut ölçümü; canlı için asıl hesap |
| 4 | **2027.** B2B e-faturası Pennylane'den (10. karar): siparişten Pennylane faturasına bağlantı gerekip gerekmediği. B2C e-reporting: Hiboutik'in Z verisi Pennylane'e gidiyor; Pennylane'in bunu idareye e-reporting olarak iletip iletmediği bakılacak. | — | Son tarih 01.09.2027 |

- **Sıra 1 → 2 → 3.** Hiboutik, sağlayıcıdan bağımsız tahsilat kapısına oturduğu için Revolut'tan önce
  yapılması ek iş doğurmaz. Faz 1–3 canlı öncesi şart; Revolut geçişi canlıdan önce en ucuz.
- **Şema değişiklikleri** (Faz 1 ve 2) migration'da doğrudan yapılır; `db:refresh` kararı kullanıcının.
- **Değişecek mimari cümleler** kendi fazının commit'inde güncellenir: `DOMAIN.md` §7 (ödeme havuzları,
  kapıda kart cihazı) ve §9 (ön muhasebe sınırı: "hiçbir resmî belge üretilmez", banka import, export);
  `INTEGRATIONS.md` (Ödeme: Stripe / SumUp; Muhasebe export; Banka import); `data-model/para.md`.

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
| Çalışmayanlar | Fiş içeriği (`/print/ticket`) ve Z raporu (`/reports/z`) 500; `/z/credit_notes_issued` canlıda yok (404). |
| Yuvarlama | `sale_total_net/tax` (23,12 / 1,88) ile oran toplamları (23,13 / 1,87) bir kuruş ayrışıyor; mutabakat oran toplamlarından yapılır. |
| Hız | Çağrı başına 40–110 ms; kota başlığı yok. |
| Demo sıfırlama | `POST /reset` (`reset_action`: `sales_and_products`, `sales_keep_stock`, `sales_and_stock`, `clients`, `everything`), yalnız demo modunda. `sales_and_products` satışları, ürünleri ve kasa sayımını siliyor; ödeme yöntemleri, KDV oranları ve mağaza kalıyor. |

**Hiboutik — açık kalan:**
- Gün kapanışı, mali arşiv ve kapanış sonrası kasa defteri yalnız üretim hesabında görülebilir.
- Ters yüklemenin `E` kodu 2027 e-fatura / e-reporting için yeterli mi, Faz 4'te bakılacak.
- Çağrı sınırı: yeni fiş başına 8 çağrı (arama, açma, iki okuma, iki ayar, ödeme, kapatma) + kalem
  başına 1 (bölünen ya da KDV'si değişen kalem 1 daha), toplu uç yok. Ayda 600 siparişte 8 kalemle ~9.600
  çağrı; kota (ikincil kaynakta ayda 10.000) canlı planla doğrulanacak.

**Pennylane** (test ortamı):
- E-fatura okumada fatura satırları, PDF bağlantısı ve e-fatura alanları geliyor mu (veri modelinde
  görünmüyor).
- İçe aktarmanın zorunlu alanları (KDV oranlı satır, hesap kodu).
- Eşleşme yazmada kısmi tutar: "havalenin 360 €'su A'ya, 140 €'su B'ye" nasıl görünüyor.
- Banka hareketinde karşı taraf bilgisi (belgede yalnız açıklama, tutar, tarih, hesap var).
- Fatura durumunu (onaylandı, reddedildi, itirazda) bizden yazma: `PUT /supplier_invoices/{id}/e_invoice_status`.

**Revolut** (deneme hesabı):
- Ödeme başına komisyon (`fees`) ve Merchant hesabından ana hesaba aktarmanın görünüşü.
- Kapıda kart: Tap to Pay / Reader ödemesi sipariş numarası taşıyor mu; Terminal'e sunucudan tutar
  gönderme.
- Android'de Google Pay, itiraz akışı.

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
2. Backend cron'u (`register-sync`, dakikada bir) kuyruğu sırayla işler: motor planı çıkarır, Hiboutik
   uyarlaması yazar, sonuç bizdeki kasa aynasına geçer. Hiç para görmemiş sipariş yazılmaz.
3. **Kalem farkı varsa yeni fiş** (Hiboutik satışı): fark kalemleri (artı ya da eksi) ve yöntem
   farkı kadar ödeme satırı. İade, eksi kalemli fiştir; `void` kullanılmaz, çünkü iadeyi asıl ödemenin
   yöntemine yazıyor, oysa operatör kartla ödenmiş siparişi nakit iade edebilir (DOMAIN §8).
4. **Yalnız ödeme farkı varsa** (kalan borcun ödenmesi, fazla tahsilatın iadesi) siparişin son fişine
   ödeme satırı eklenir; gün kapanmışsa Hiboutik onu satışın nakit akışı olarak kaydeder. Her fiş `DIV`
   açılır: tutarlar açık yazılır, eksik ya da fazla ödeme fişin bakiyesinde görünür.
5. **Para doğurmayan kalem farkı** (eksik ödenmiş siparişte iade, borçsuz iptal) ödemesiz fiştir; fişi
   olan siparişi kalem ve durum değişikliği de kuyruğa düşürür.
6. **Değişen hareket:** kasadaki satır değişmez; tutarı, yöntemi ya da siparişi değişen hareketin farkı
   aynı harekete yeni ödeme satırıdır, siparişten çıkan hareketin neti ters satırla geri alınır.

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

**Hata:** Hiboutik'e ulaşılamazsa sipariş kuyrukta kalır, artan aralıkla (1 dakikadan 1 saate) yeniden
denenir; beşinci denemede `error_log`. Plan durursa (yöntemi bilinmeyen hareket, iadeyle başlayan sipariş,
eşlenmemiş depo) satır sebebiyle bekler; çözüm bir para değişikliğiyle gelir ve satırı yeniden işaretler. Mağaza
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
kapanışı önceki günleri de kapattığı için tutmayan gün düzelene kadar sonrakiler de bekler. Fark `error_log`a
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

## 8. Riskler

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
   Çare: kuyruk + yeniden deneme + günlük mutabakatta fark uyarısı; gün kapanmadan kuyruk boşalmalı.
6. **Kasa sıfırlanması.** Hiboutik'te ürünler silinirse (demo sıfırlama) bizdeki ürün eşlemesi
   (`register_product`) olmayan ürünleri anar ve her yazım düşer; sıfırlamadan sonra eşleme silinmeli.

## 9. Kaynaklar

Resmî:
- [BOFiP BOI-TVA-DECLA-30-10-30 (25.03.2026)](https://bofip.impots.gouv.fr/bofip/10691-PGP.html/identifiant=BOI-TVA-DECLA-30-10-30-20260325)
- [DGFiP fiş 1: e-fatura (Haziran 2026)](https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fiches_reforme/fiche-1_que-va-t-il-se-passer-pour-mon-entreprise.pdf)
- [DGFiP: e-reporting fişi (Eylül 2025)](https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fiches_reforme/fiche-e-reporting_transactions.pdf)
- [impots.gouv.fr: e-faturayı tanıyın](https://www.impots.gouv.fr/professionnel/je-decouvre-la-facturation-electronique)

Hiboutik:
- API belgesi: `https://lezzetanatolie.hiboutik.com/docapi/yaml/` (kopyası `.test-results/hiboutik-docapi-hesap.yaml`, depoda değil)
- [Webhooklar](https://faq.hiboutik.com/en/api-development/webhooks)
- [E-fatura ve e-reporting](https://faq.hiboutik.com/fr/caisse-cloture/facturation-electronique-france-e-reporting)

Pennylane:
- [Kasa yazılımlarından satış senkronu](https://help.pennylane.com/fr/articles/212053-logiciels-de-gestion-de-point-de-vente-synchroniser-les-ventes-en-magasin)
- [Tedarikçi faturası API'si](https://pennylane.readme.io/docs/supplier-invoicing)
- [Değişiklik akışı](https://pennylane.readme.io/docs/tracking-data-changes-with-pennylane-api)
- [Banka hareketleri](https://pennylane.readme.io/reference/gettransactions)
- [Faturaya hareket eşleştirme](https://pennylane.readme.io/reference/postsupplierinvoicematchedtransactions)
- [Banka bağlama](https://help.pennylane.com/fr/articles/18855-connecter-et-synchroniser-un-compte-bancaire)
- [Bankaların otomatik bağlantı kopması](https://help.pennylane.com/fr/articles/20882-anticiper-la-deconnexion-automatique-des-banques)
- [Test ortamı oluşturma](https://help.pennylane.com/fr/articles/18773-creer-un-environnement-de-test)

Revolut:
- [Merchant API](https://developer.revolut.com/docs/merchant/merchant-api)
- [Deneme ortamı](https://developer.revolut.com/docs/guides/merchant/test-and-go-live/set-up-sandbox.md)
- [Terminal'e sunucudan ödeme gönderme](https://developer.revolut.com/updates/2025/12/01/push-payments-to-terminal)
- [Pennylane entegrasyonu](https://www.revolut.com/fr-FR/business/integrations/pennylane-integration/)
- [Ödeme işleme sözleşmesi (Merchant hesabı)](https://www.revolut.com/en-FR/legal/business-acquiring)

SumUp:
- [POS Pro kapanış duyurusu](https://tillersystems-v3.readme.io/reference/introduction-1)
