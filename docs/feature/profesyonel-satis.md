# Profesyonel müşteriye satış — sipariş, fatura, cari

> **Statü: KARAR ALINDI (11.10.2026); Faz 0 tamamlandı, sıradaki Faz 1.** Özelliğin tek kaydı bu dosya: kararlar, akışlar, yol haritası ve
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
| 1 | Profesyonel kayıt (SIRET) ve miras | S0 + S1 | Değişmez |
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
- Belgeler koda uyar: DOMAIN §5 (pazarlık) ve §7 (peşin havale, limit aşımı). §10'daki SIRET adayı cümlesi Faz 1'de kodla birlikte
  doğrulanır.
- **Açık:** tasarım dosyası (`design/01-musteri/ekranlar/Musteri - Checkout.dc.html`) peşin "Havale ile öde" kartını hâlâ
  çiziyor; kod kararı izliyor, tasarımın da güncellenmesi gerekir.

**Faz 1 — profesyonel kayıt ve miras**
- Yeni kayıtta SIRET: resmî kayıttan unvan ve adres (`packages/application/src/b2b/company-registry.ts`), `company_info`'ya
  yazılır. Kayıt açma ortak katmana iner; web ve mobil aynı fonksiyonu çağırır.
- Aynı SIRET uyarısı kayıt açarken ve B2B onay kartında.
- E-posta değiştirerek miras (S0, bugün çalışıyor): girişe bağlanmamış kaydın e-postasını yönetici değiştirir; müşteri o
  e-postayla girer. Müşteri ayrıca boş hesap açtıysa boş hesap GDPR silmeyle kapanır (giriş silinir, e-posta boşalır),
  e-posta ofisin kaydına yazılır, müşteri yeniden girer.
- Girişe bağlı kayıtta e-posta salt okunur olur; bugün değiştirilebiliyor ve profil e-postası girişten ayrışıyor.
- SIRET ile devir: onay kartı aynı SIRET'li kaydı gösterir, tek düğme yukarıdaki adımları sırayla yapar.
- Davet bağlantısı (S2) sonradır.

**Faz 2 — mobilde sipariş girişi**
- Önce tasarım: mobil ekranlar (müşteri ara ya da yeni profesyonel kayıt, kalemler, teslim günü, ödeme ve vadeli, özet),
  Akış B'nin müşteri seçimiyle birlikte.
- Web masasının okumaları ve yazımları `packages/application`'a taşınır; web aynı fonksiyonları çağırır.
- Mobil uçlar `placeOrder`'ın personel yolunu kullanır; kurye, depocu ve yönetici rolüne açıktır; pazarlıklı fiyat yalnız
  yöneticiden kabul edilir.

**Faz 3 — araçtan profesyonele vadeli satış**
- Yerinde satışa isteğe bağlı müşteri: seçilirse fiyat, kanal ve KDV tabanı müşteriden gelir; müşterinin işi aracın işiyle tutar.
- Vadeli araç satışında hızlı satış kapısı (`packages/application/src/order/quick-sale.ts`) kapı hesabı aramaz ve tahsilat
  yazmaz; başka dal değişmez.
- QUALITE deposunda yerinde satış yalnız anonim alıcıya kapalı kalır; adı belli profesyonel müşteriye açılır.

**Faz 4 — satış faturası Pennylane'de**
- S0: Pennylane anahtarına satış faturası ve müşteri yetkileri; şablonda IBAN ve "açıklamaya fatura numarasını yazın"; iki
  işin kategorisi.
- Satış faturası bizde belge olur: satın alma faturalarıyla aynı tablo (`money_document`), yönü "giriş", karşı tarafı müşteri.
  Pennylane yükleme kuyruğu yalnız "çıkış" belgesini aldığı için satış faturası tedarikçi faturası diye gitmez
  (`0060_pennylane.sql`). [`data-model/para.md`](../architecture/data-model/para.md)'deki "satış faturaları burada değil"
  kararı bu fazda güncellenir.
- İçerik teslim edilen miktarlardan; KDV kırılımı ve ters yükleme ibaresi muhasebe dökümünün hesabından
  (`packages/domain-core/src/accounting/export.ts`).
- Teslim başına modda fatura teslimden hemen sonra, ay sonu modunda ayın son günü kesilir.
- Vade günü tek kuralla: fatura günü + müşterinin vadesi, ama faturadaki ilk teslimin on günlük diliminin bitiminden 30
  günü geçmez.
- Fatura numarası siparişe yazılır (`order.invoice_no`); Pennylane faturayı müşteriye e-postayla gönderir. Faturadan sonra
  iade ya da eksik alacak notudur.

**Faz 5 — tahsilat ve cari**
- Havale kuyruğunda açık satış faturaları aday olur; ipucu fatura numarası ve müşteri adıdır.
- Bir havale birden çok faturayı, bir fatura birden çok havaleyi kapatır; tutar satın almadaki kuralla bağlanır.
- Siparişler ödendi olsun diye banka satırı aracı hesaba transfer olur, aracı hesapta faturanın siparişlerine tahsilat
  yazılır. Aracı hesap sıfırlanır, banka parayı bir kez sayar, siparişin ödeme hesabı değişmez (Revolut Merchant düzeni).
- Eşleşme Pennylane'deki müşteri faturasına yazılır; vadeli frenin açık bakiyesi ve gecikmesi faturanın vade gününü okur.

## 6. Açık sorular

1. Limit aşan vadeli sipariş müşteri yolunda reddedilir; yönetici elle girerken geçsin mi?
2. Fatura teslimde kendiliğinden mi kesinleşsin, ofisin onayıyla mı? Kesinleşen fatura silinmez; düzeltme alacak notudur.
3. Varsayılan fatura modu teslim başına mı, ay sonu mu?
4. QUALITE ve Lezzet faturaları aynı Pennylane şirketinde, aynı numara serisinde mi?
5. Muhasebeciye: satış faturasının Pennylane'de kesilmesi, aracı hesap düzeni, 2027 e-fatura gönderim kanalı.

## 7. Ölçülecekler

- Vadeli araç satışı "tamamlandı" durumunda ödemesiz kalır (ödeme ayrı eksen); bunu okuyan yerler (geri bildirim daveti,
  raporlar) kontrol edilir.
- Kapı satışında B2B nakdi ilk kez doğar; kasa planının onu kasa girişi olarak yazdığı ölçülür (`packages/application/src/register/`).
- Aracı hesabın türü ve iade yolu: B2B iadesi bankadan havaleyle dönmeli (`packages/domain-core/src/payment/refund-method.ts`).
- Aracı hesabın hareket dökümünde nasıl göründüğü muhasebeciye gösterilir.

## 8. Kaynaklar

- [DGCCRF — Les délais de paiement interprofessionnels](https://nouvelle-aquitaine.dreets.gouv.fr/sites/nouvelle-aquitaine.dreets.gouv.fr/IMG/pdf/brochure-delais-paiments.pdf)
- [BOFiP — dönemsel fatura](https://bofip.impots.gouv.fr/doctrine/pgp/13245-PGP%23Facturation_periodique_39)
- [FNFE-MPE — L'Annuaire](https://fnfe-mpe.org/wp-content/uploads/2025/12/Lannuaire-v1.1-1.pdf)
- Pennylane: [müşteri faturası oluşturma](https://pennylane.readme.io/docs/create-a-customer-invoice-use-case) ·
  [otomatik ödeme eşleştirme](https://pennylane.readme.io/docs/automating-payment-matching) ·
  [faturaya hareket eşleme](https://pennylane.readme.io/reference/postcustomerinvoicematchedtransactions)
