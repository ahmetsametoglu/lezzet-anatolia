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
| 1 | **Kasa Hiboutik; bütün ödemeler oraya yazılır** — nakit, kapıda kart, online, kanal fark etmez | Yasal kayıt Hiboutik'te. Bizdeki tahsilat kaydı iç kontrol aynası olarak kalır; bunun için muhasebeciye soru gitmez. Hiboutik'in NF525 sertifikasını kullanıcı doğruladı. |
| 2 | **Muhasebe Pennylane; kurulumunu kullanıcı yürütür** | Pennylane hem muhasebe yazılımı hem kayıtlı platform (PA): e-fatura alımı bugün, düzenleme ve e-reporting 2027'de. Aylık muhasebe ve KDV beyanı (CA3) Pennylane'den çıkar → **canlı öncesi şart.** |
| 3 | **Hiboutik ↔ Pennylane ve banka ↔ Pennylane doğrudan konuşur** | Bu iki akış için bizden kod yok; sistemimiz muhasebe işine karışmaz. |
| 4 | **Pennylane'e bizden giden: alış faturası ve eşleşme** | Yabancı ve e-faturaya geçmemiş tedarikçinin PDF faturası bizden yüklenir. Fransız tedarikçinin e-faturası Pennylane'e platformdan gelir; biz okuruz, yüklemeyiz. |
| 5 | **Eşleştirme bizde** — alış faturası ↔ ödeme ↔ mal kabul | Cari çalışma, kısmi ödeme, tek havaleyle birden çok fatura. `money_allocation` bunu tutarıyla, çoktan çoğa taşıyor. Revolut BillPay önerisi bu yüzden geri çekildi. |
| 6 | **Banka hareketlerinin kaynağı Pennylane** | Revolut ve Crédit Mutuel tek kaynaktan gelir. Excel içe aktarma yedek kalır. |
| 7 | **Revolut: çevrim içi ödeme + kapıda kart + banka** | Stripe'ın yerini alır; Stripe'taki sipariş başına defter düzeni aynen sürer. Revolut nakit almaz, Fransa'da nakit yatırma da kalktı → **nakit için Crédit Mutuel kalır.** Revolut hesap açılışı kullanıcıda. |
| 8 | **Revolut ↔ Pennylane bağlantısında yalnız banka akışı açık** | "Harcamalar" modülü ve Revolut'tan Pennylane'e fatura aktarımı kapalı: ikisi de bizim yüklediğimiz faturanın ikizini üretir. |
| 9 | **SumUp kasa olarak yok** | Genel API'si kasaya satış yazmıyor; Fransa'daki POS Pro (eski Tiller) 2026 sonunda kapanıyor, yeni entegrasyon talebi 2027'nin ikinci çeyreğinden itibaren. O tarihte yeniden bakılabilir. |

**Açık karar:** B2B faturasının 2027'de nereden kesileceği (Pennylane mi Hiboutik mi) — §7.

## 3. Veri akışı

| # | Akış | Yön | Bizden kod | Dayanak |
|---|---|---|---|---|
| 1 | Her ödeme → kasa | biz → Hiboutik | var | Hiboutik API: `/sales`, `/sales/add_product`, `PUT /sale/{id}`, `/sales/close` |
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
| 1 | **Hiboutik kasa.** Mağaza = depo eşlemesi (mağaza API'den açılmıyor, elle kurulur); ödeme yöntemi kodları (nakit, kapıda kart, online); ürün aynası (varyant ↔ Hiboutik ürün numarası eşlemesi bizde, stok Hiboutik'te tutulmaz); satış yazma (tahsilat kapısından; `ext_ref` ile tekrar koruması; Hiboutik'e gidemeyen satış için yeniden deneme kuyruğu); iptal ve iade; kasa hareketleri (bozukluk, bankaya yatırma); depo başına günlük mutabakat (bizim toplamlar ↔ Hiboutik Z). | `payment.ts` ve çağıranları; yeni Hiboutik adaptörü; migration (siparişte Hiboutik satış numarası, kuyruk) | Faz 0 Hiboutik ölçümü |
| 2 | **Pennylane.** Tedarikçi eşleme (`POST /suppliers`); belgeye KDV oranlı satır; PDF yükleme (yabancı ve e-faturasız tedarikçi; fotoğraf PDF'e çevrilir); yüklemeden önce mükerrer kontrolü; e-fatura okuma ve mal kabule bağlama; banka hareketi okuma; eşleşme yazma; hesap başına "hareket gelmiyor" uyarısı. | `money_document` şeması; para modülü; yeni Pennylane adaptörü | Faz 0 Pennylane ölçümü |
| 3 | **Revolut.** Çevrim içi ödeme Stripe yerine (Merchant API: sipariş, kart alanı, Apple / Google Pay, webhook, iade); kapıda kart (Terminal'e tutar gönderme ya da elle onay + sonradan doğrulama); defter düzeni (brüt tahsilat · komisyon · Merchant'tan ana hesaba aktarma). | `payment-gateway.ts`; web ve mobil ödeme ekranları; `stripe-webhook.ts`'in karşılığı | Faz 0 Revolut ölçümü; canlı için asıl hesap |
| 4 | **2027.** B2B e-fatura düzenleme ve e-reporting: kim gönderecek (Pennylane / Hiboutik), bağlantı. | — | Son tarih 01.09.2027 |

- **Sıra 1 → 2 → 3.** Hiboutik, sağlayıcıdan bağımsız tahsilat kapısına oturduğu için Revolut'tan önce
  yapılması ek iş doğurmaz. Faz 1–3 canlı öncesi şart; Revolut geçişi canlıdan önce en ucuz.
- **Şema değişiklikleri** (Faz 1 ve 2) migration'da doğrudan yapılır; `db:refresh` kararı kullanıcının.
- **Değişecek mimari cümleler** kendi fazının commit'inde güncellenir: `DOMAIN.md` §7 (ödeme havuzları,
  kapıda kart cihazı) ve §9 (ön muhasebe sınırı: "hiçbir resmî belge üretilmez", banka import, export);
  `INTEGRATIONS.md` (Ödeme: Stripe / SumUp; Muhasebe export; Banka import); `data-model/para.md`.

## 6. Ölçülecekler (Faz 0)

**Hiboutik — ölçüldü (01.10, demo hesap `lezzetanatolie`).** Betikler `.test-results/hiboutik-olcum.mjs` ve
`hiboutik-olcum-iade.mjs`, raporlar aynı klasörde. Güncel API belgesi `/docapi/yaml/` (belge sayfası bunu yüklüyor,
309 işlem); `/docapi/json/` eski sürüm (228 işlem, yorum satırına alınmış).

| Konu | Sonuç |
|---|---|
| Satış aç → kalem → ödeme → kapat | Çalışıyor. Kapatma, her kalemin `stock_withdrawal = 1` olmasını istiyor (yoksa 422). Cevaplar: `{sale_id}`, `{id_sale_product_detail}`. |
| Satış kaydı | `GET /sales/{id}`: günlük sıra numarası (`unique_sale_id`, ör. `2026-10-1-1`), gün sonu tarihi, kalem başına KDV, oran başına HT/KDV/TTC (`taxes`), ödemeler (`payment_total`), dijital fiş ve QR bağlantısı (`url_receipt`, `url_qrcode`). |
| Sipariş numarası (`ext_ref`) | 25 karakterde kesiliyor. Kısa numarayla arama (`/sales/search/ext_ref/{q}`) satışı buluyor: tekrar koruması mümkün. |
| Bölünmüş ödeme (`DIV`) | Çalışıyor (nakit 10 + kart 20). |
| B2B KDV hariç fiyat | `prices_without_taxes = 1`: 10,00 HT → 10,55 TTC, doğru. |
| Almanya'ya ters yükleme | `duty_free_sale = 1`: KDV 0, ama KDV kodu `E` (muaf) yazılıyor, AB içi işlem kodu değil. |
| Tam iptal | `POST /sales/void`: eksi tutarlı ters satış, aynı ödeme yöntemi, yeni sıra numarası, gerekçe iz kaydında. |
| Kısmi iade | Eksi fiyatlı kalemle iade satışı kapanıyor (1 × −10,00, nakit). Eksi adet reddediliyor. Kalem iadesi (`sale_line_item_exchange`) para değil alacak notu (avoir) üretiyor ve kalemin tamamını iade ediyor: bizim iade yolu değil. |
| Ürün dış referansı (`products_ref_ext`) | 20 karakterde kesiliyor; belgede sınır yazmıyor. Varyant kimliğimiz (`uuid`, 36 karakter) sığmaz → ürün eşlemesi bizde tutulur. |
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
- Paket ve kargo ücretinin satır olarak yazılışı.
- Çağrı sınırı: satış başına kalem + 5 çağrı, toplu uç yok. Ayda 10.000 çağrı (ikincil kaynak) ve
  ayda 600 satışta ortalama 11 kaleme kadar sığar.
- Kurye nakdi: Hiboutik'te kurye ara kasası yok; kuryenin eksik teslim ettiği nakdin kayda nasıl
  yansıyacağı (açıklamalı kasa çıkışı ya da başka yol) — Faz 1 tasarımında karara bağlanır.

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

## 7. Riskler

1. **Banka bağlantısının kopması.** Bankalar bağlantıyı en çok 180 gün açık tutuyor, bazıları çok daha
   kısa (Pennylane'in tablosunda BNP 36 gün, CIC 0 gün). Kopunca hem Pennylane hem biz hareket alamayız.
   Çare: hesap başına "hareket gelmiyor" uyarısı; sık kopan bankada EBICS (Pennylane önerisi).
2. **Gecikme.** Hareket Pennylane'e bankaya göre saniyeler ile 72 saat arasında düşüyor; B2B havalesi
   siparişe geç bağlanabilir. Gerekirse yalnız Revolut'a gelen havaleler için Revolut webhook'u eklenir.
3. **Mükerrer belge.** Aynı fatura hem e-fatura hem PDF olarak ya da Revolut harcama aktarımıyla girerse
   iki kayıt olur; Pennylane yalnız aynı dosyayı yakalıyor. Çare: 8. karar + yüklemeden önce kontrol.
4. **Gelirin iki kez sayılması.** Pennylane'de Hiboutik dışında bir satış bağlantısı (ödeme sağlayıcısı
   vb.) açılırsa aynı satış iki kez gelir sayılır. Satış Pennylane'e yalnız Hiboutik'ten girer.
5. **Kasa kaydının yazılamaması.** Hiboutik erişilemezse satış bizde var, kasada yok: yasal açık.
   Çare: kuyruk + yeniden deneme + günlük mutabakatta fark uyarısı; gün kapanmadan kuyruk boşalmalı.
6. **B2B faturası (2027).** Hiboutik'ten kesilirse Pennylane'e günlük Z toplamının içinde gider; vadeli
   müşterinin alacağı Pennylane'de müşteri bazında görünmez. Hiboutik B2B e-faturayı ortak platformla
   2027'nin ilk yarısında açacağını yazıyor.

## 8. Kaynaklar

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
