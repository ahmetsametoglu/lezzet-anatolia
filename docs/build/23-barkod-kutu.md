# 23 — Barkod/QR ile Operasyon Takibi

## Kapsam

Malın depoya girişinden müşterinin kapısına kadar dört aşamanın **kod okutarak** takibi: mal kabul ·
sipariş hazırlama (kutu) · araca yükleme · teslim. İki ayrı kimlik vardır ve karıştırılmaz —
**ürün barkodu** (EAN/GTIN, dış dünyanın kimliği: "bu hangi mal") ve **bizim bastığımız kutu QR'ı**
(kendi kaydımızın kimliği: "bu hangi sipariş"). Tarama daima **telefon kamerasıyla** yapılır.

**Bu modül DEĞİLDİR:** müşteri yüzeyi (müşteri kod okutmaz) · satış/stok kararı (barkod kimlik
bulur, kararı yine mevcut motorlar verir — depo değişmezi aynen geçerli) · lot/parti etiketi
(bilinçle ertelendi, gerekçe etütte) · kurye haritası ve akıllı rota (`BACKLOG §8`, üç ayrı kalem;
bu modül hiçbirini beklemez) · operasyon **web** yüzeyi (tarama telefonda olduğu için web'de barkod
hiç olmayacak — masaüstü-yalnız kalır, `CLAUDE §2`).

Modül dört mevcut modülün üstünden geçtiği için (kod alanı `05`/`06`, kutu+hazırlık `10`,
yükleme+teslim `11`, kamera+basım `21`) kendi dosyasında toplandı: tek hikâye, tek yerden okunan
ilerleme (kullanıcı kararı 17.08). Öteki modüllere yalnız çapraz referans konur.

## Okunacaklar

- **`docs/feature/barkod-okuyucu.md` — §1'deki 13 karar BAĞLAYICIDIR** (kullanıcıyla sahne sahne
  alındı, 17.08). §0 bugünün kod ölçümü, §2 aşama aşama akış, §3 lot etiketinin neden ertelendiği,
  §4 veri modeli yönü, §5 fazlama.
- `design/pages/app-depo.md` (D1 toplama · D2 mal kabul) ve `app-kurye.md` (K1 rota · K3 teslim) —
  ~~ikisi de kutu akışını henüz taşımıyor~~ → **taşıyorlar (21.08, 23.1):** her ikisinde "Barkod
  güncellemesi" bölümü; YOKLAR'daki "v2" satırı düştü.
- `DOMAIN §4` (FEFO/parti/rezervasyon), `§16` (tedarik/mal kabul), `§17` (depo değişmezi),
  `ORDER_LIFECYCLE` (durum geçişleri — teslim yalnız `out_for_delivery`den olur).
- `19.28` (`0045_storage_area_vehicle.sql`) — depo içi alanlar; toplama sırasının dayanağı.

## Bağımlılık

`05-katalog` (varyant), `06-stok` (parti/intake/adjustment servisleri — hepsi hazır),
`07-siparis` (`record_preparation` · `deliver_order` · `delivery_proof` — hazır),
`10-depo` (hazırlık/mal kabul ekranları — yazılı, kutu ve tarama eklenecek),
`11-kurye` (gün/teslim ekranları — yazılı, okutma eklenecek),
`21-mobil-uygulama` (operasyon kabuğu + dört bölüm + 17 ekran — **hazır**, `(operations)` rota grubu).

**Yeni teknoloji girişi iki tanedir ve ikisi de beyan ister** (`STACK §2`): kamera taraması
(`expo-camera`) ve etiket basımı (Brother Print SDK üzerinden bir Expo modülü). İkinci sinin RN 0.86
/ New Architecture altında çalışması **ölçülmemiş tek varsayımdır** — bir günlük iğne deneyiyle
ölçülür ve kutu akışının önünde durmaz.

**Toplama sırasının zemini hazır (17.08):** `stock.location` serbest metni kalktı, yerine
`stock.storage_area_id` geldi (`19.29`) ve alan `sort_order` taşıyor (`19.28`). Yani "raf düzenine
göre sırala" isteği artık bir ekran işi — şema işi değil. Gerekçe zinciri:
`docs/feature/barkod-okuyucu.md §1.13`.

## Başlarken verilecek izah (örnek)

> "Depodaki ve yoldaki her adımı telefon kamerasıyla okutulan bir kodla bağlıyoruz. Mal gelince
> kolinin barkodu okutuluyor ve kabul satırı kendiliğinden bulunuyor — koli barkodu paketin
> barkodundan farklıdır, sistem ikisini de tanır ve kolinin kaç adet olduğunu kodun kendisinden
> bilir. Tanımadığı bir kod görürse 'bu hangi ürün?' diye sorar ve bir daha sormaz; yani kod listesi
> kullanımla kendi kendini dolduruyor, kimse oturup katalogun barkodlarını girmiyor.
>
> Sipariş hazırlanırken her siparişe bir kutu açılıyor, ürünler okutularak kutuya konuyor — sipariş
> kaleminde olmayan bir ürün okutulursa ekran anında durduruyor. Kutu kapanınca üstüne, içinde ne
> olduğunu ve QR'ını taşıyan bir etiket basılıyor. Kurye araca yüklerken o QR'ı okutuyor: rotasına
> ait olmayan kutu kabul edilmiyor, ve kaç kutu yüklendiği sürekli önünde duruyor. Kapıda aynı QR
> okutulunca teslim kaydı kendiliğinden düşüyor — kurye ayrıca bir onay ekranı doldurmuyor.
>
> Kazanç iki tarafta: depoda yanlış ürün seçimi ve satır arama süresi, yolda ise yanlış kutunun
> yanlış adrese gitmesi. Etikette fiyat yazmıyor — depo tarafı tutar görmez, kurye tahsil edeceği
> tutarı okuttuğunda ekranda görür."

## Görevler

**Operasyona geçildi (21.08, kullanıcı kararlarıyla):** *(1)* iki koldan — tasarım brief'i Claude
Design'a giderken tasarımdan bağımsız parçalar (barkod şeması · tarama · iğne deneyi) beklemez;
*(2)* toplayan kişi ROL VARSAYMAZ (kimi gün depocu toplar kurye yükler, kimi gün kurye kendisi) —
yükleme okutması hem doğrulama hem sayım; *(3)* modülü uçtan uca web şeridi yazar (mobil ekranlar +
mobile-api dahil), mobil şeride bilgilendirme notu bırakılır. Plan: etüt §5 fazlaması.

- [x] (23.1) **Tasarım brief'i** — kutu döngüsü + tarama anları iki brief'e işlendi, istek yazıldı ·
  touches: `design/pages/app-depo.md`, `design/pages/app-kurye.md`, `design/project/uploads/barkod-kutu-tasarim-istegi.md`
  - *Bitti:* D1'de kutu döngüsü (aç · okut · yanlış ürün reddi · kapat+etiket · eksik), D2'de
    tarama + öğrenen eşleme, K1'de yükleme sayacı + yanlış kutu reddi, K3'te okutmayla teslim;
    YOKLAR'daki "Barkod/QR okuma (v2)" satırı düştü; 4×6 etiket şablonu istekte (fiyat/tutar asla).
  - **Durum (21.08):** yazıldı; Claude Design'a iletim kullanıcıda. Kutu ŞEMASI (`order_box`) ve
    ekranları tasarım dönene kadar AÇILMAZ — modülün kendi kuralı.
- [x] (23.2) **Barkod şeması + tek arama kapısı + öğrenen eşleme** · touches:
  `supabase/migrations/0047_barcode.sql`, `packages/types/src/entities/variant-barcode.schema.ts`,
  `packages/types/src/contracts/warehouse-api.schema.ts`, `packages/database/src/services/variant-barcode.service.ts`,
  `packages/application/src/warehouse/scan.ts`, `apps/mobile-api/src/api/v1/warehouse.ts`,
  `scripts/seed/barcode.ts`, `scripts/seed/coverage.ts`
  - *Bitti:* `variant_barcode` (kod global unique · `kind: unit|case` · çarpan KODUN üstünde ·
    `created_by` izi); `findByCode` zinciri tek metot (`barkod → sku → supplier_code`, kaynak
    cevapta); kapılar `resolveScannedCode`/`learnCode` (`already_bound` reddi); mobil uçlar
    `POST /warehouse/codes/resolve` + `POST /warehouse/codes`; seed 4 zorunlu kovayla.
  - **Durum (21.08):** yazıldı. `supplier_product.barcode` BİLEREK açılmadı (etüt "isteğe bağlı" —
    öğrenen eşleme aynı işi görür, ihtiyaç ölçülünce). SKU/tedarikçi kodu eşleşmesi çarpansız (1) —
    çarpan yalnız gerçek koli barkodunun bilgisi. Kapı stok KARARI vermez (depo değişmezi).
- [ ] (23.3) **Web dokunuşları:** varyant editörüne barkod listesi (öğrenen eşlemenin GERİ ALMA
  yeri: tür/çarpan + sil) · fiyat/tedarik aramalarına kod zinciri (`prices/actions.ts` ·
  `procurement/actions.ts` bugün yalnız ada bakıyor)
- [~] (23.4) **Kamera taraması (mobil):** `expo-camera` beyanlı girer; tek `onScan` bileşeni
  (`apps/mobile/src/components/scan/`); mal kabul entegrasyonu — tara → satır bul (koli kodunda
  çarpan kadar öner) → tanınmayan kodda "bu kod hangi ürün?" → `learnCode` · touches:
  `apps/mobile/src/components/scan/scan-sheet.tsx`, `apps/mobile/src/screens/warehouse/{intake-screen.tsx,use-intake.hook.ts,messages.json}`,
  `apps/mobile/src/lib/api/warehouse.ts`, `apps/mobile/app.config.ts`, `apps/mobile/jest.setup.ts`
  - *Bitti:* gerçek cihazda koli okutulup satırın bulunduğu ve tanınmayan kodun öğretildiği görüldü
  - **Durum (22.08) — YAZILDI, cihaz ölçümü bekliyor.** `expo-camera ~57.0.4` girdi (beyan modül
    dosyasında; app.config'e izin metniyle eklendi — "yalnız kod okutmak için"). `ScanSheet` tek
    `onScan` sözleşmesi: ham kodu verir, çözüm/karar çağıranın; tekrar-okuma kilidi OKUMA başına
    (kod başına değil — iki koli aynı kodu taşıyabilir); izin kendiliğinden sorulur, kalıcı redde
    tekrar-sor düğmesi ÇİZİLMEZ. Mal kabul: "📷 Koli okut" (çevrimdışıyken çizilmez — çözüm
    sunucuda, kuyruğu yok), bulunan satıra çarpan kadar EKLENİR (kaynak SKU/tedarikçiyse cümle
    bunu söyler), PO'da olmayan ürünün kodu satır AÇMAZ (fark raporunun kümesi bozulmaz);
    tanınmayan kod alt sayfada formun satırlarından seçtirilir (katalog araması bilinçle yok —
    yanlış ürüne öğretmenin kapısı). Jest'e `expo-camera` mock'u girdi (paketin hazır mock'u yok,
    ölçüldü). Mobil jest 84 suite · 599/599; tsc kendi dosyalarımda temiz.
  - **SİMÜLASYON HAVUZU (kullanıcı kararı 22.08): geliştirmede kamerasız tarama.** İki kaynak,
    TEK yol: üretimde kod kameradan, geliştirmede ayrıca havuz çiplerinden gelir (paket · koli ·
    SKU · tanınmayan — dört çip dört yolu tetikler) ve İKİSİ AYNI teslim noktasından geçer
    (`deliver`: kilit + `onScan`) — fark yalnız kodun kaynağı. Havuz `__DEV__` arkasında (release'te
    bundler atar; ayrı env bayrağı bilinçle yok — "üretimde açık kalan simülasyon" derleme sabitiyle
    kapanır). Kodlar seed formülünün AYNASI (`dev-scan-pool.ts` ↔ `scripts/seed/barcode.ts`,
    künyeler birbirini gösterir; ayrışırsa çip "tanınmayan"a düşer, kırılmaz). **Yan kazanım:**
    kamera modülü TEMBEL yükleniyor (`require` try/catch) — eski dev-client'ta üst-düzey import
    ScanSheet'li her ekranı çökertirdi; şimdi modülsüz derlemede kamera alanı açıklamaya düşer,
    akış simülasyonla bugün test edilebilir.
  - **TESTLER (kullanıcı isteği 22.08):** `scan-sheet.test.tsx` (4 — çip tek yoldan teslim eder ·
    kilit okuma başına · yeniden açılışta sıfırlanır · izin kutusu + havuz birlikte) +
    `intake-scan.test.tsx` (5 — çarpanla toplama · SKU cümlesi · PO-dışı satır açmaz · öğren+1 ·
    `already_bound` yarışı). Mobil jest 84→86 suite, 599→608.
  - **CİHAZDA ÖLÇÜLDÜ (22.08, bağlı Android — OPPO CPH1907, eski dev-client):** simülasyon
    havuzuyla uçtan uca: depocu girişi → hazırlık hub'ı → PO'lu kabul formu → "Koli okut" →
    kamera-yok açıklaması + dört çip → "Tanınmayan kod" → "Bu kod hangi ürün?" → satır seçimi →
    *"Kod öğrenildi — Çilekli Artisan Kek · 90 g satırına 1 adet eklendi"* → **aynı çip ikinci
    kez: sormadan buldu, adet 2** ("ikinci gelişte tanır" fiilen). DB'de kod öğreten kişinin
    iziyle doğrulandı; cihaz turunun yazdığı kod ölçümden sonra silindi.
    - ⚠ **Cihazın öğrettiği ders — çıplak `require` yetmiyor:** native modül yokken tembel
      `require('expo-camera')` try/catch İÇİNDE bile Metro'nun guarded-require'ı yüzünden tam
      ekran hataya dönüşüyordu (ölçüldü). Çözüm `requireOptionalNativeModule('ExpoCamera')` ile
      ÖNCE yoklamak — fırlatmaz, yoksa `null` döner; JS paketi ancak native varken yüklenir.
    - ⚠ **19.25 artçısı bu turda yakalandı ve düzeltildi:** depocuya verilen çift kapsam
      (str+colmar) MOBİL depo bölümünü kilitliyordu (bölüm çok kapsamlı depocuda kapanıyor —
      seçim listesi uçtan yok; ekran dürüst ama iş duruyor). Depocu tek kapsama döndü, Colmar
      kendi depocusunu aldı (`depocuColmar`); çok kapsamlı depo-rolü hâli muhasebede yaşıyor,
      kurye çift kapsamlı KALDI (rota seçimli akış kilitlenmez, Colmar rotası için şart).
      Hub'ın bayat "barkod v2'de" dipnotu da düzeltildi.
  - **KALAN:** kameranın KENDİSİ gerçek cihaz + yeni dev-client build'i ister (kullanıcının
    build'i). Satır o ölçümle `[x]` olur; akışın geri kalanı cihazda kanıtlı.
- [ ] (23.5) **İğne deneyi (basım):** `expo-brother-printer-sdk` v0.7.0 + gerçek QL-1110NWB — RN
  0.86/New Architecture altında bağlanma ÖLÇÜLMEMİŞ tek varsayım; tutmazsa
  `apps/mobile/modules/brother-print/` local modülü. Hiçbir fazı bloklamaz.
- [ ] (23.6) **Kutu şeması + döngüsü** *(tasarım dönünce)*: `order_box`/`order_box_item` +
  `seal_order_box` RPC (kutu + picks TEK transaction; ⚠ `record_preparation` picks yazımı kalem
  başına ABSOLÜT — çok kutulu siparişte birleşimi `sealBox` kapısı kurar) + `boxCompletion` motoru +
  mobil toplama ekranı + web hazırlık paneline kutu özeti. Kutu kodu `reference_no` DEĞİL.
  Kutusuz sipariş eski yoldan gider (bilinçli çift akış).
- [ ] (23.7) **Etiket + basım:** `GET /warehouse/boxes/:id/label` (içerik sunucudan; PDF/PNG kararı
  etiket tasarımıyla) · yazıcı ayarı `settings` warehouse kapsamı (`label_printer_*`) + Depolar
  ekranına ayar bölümü · basım kutu kapanışında, sistem diyaloğu olmadan
- [ ] (23.8) **Yükleme + teslim okutması:** `loadBox` (rota doğrulama + damga + sayaç) ·
  `startCourierDay` kutulu siparişte tüm kutular binmeden `out_for_delivery` yazmaz ·
  `deliverByBox` (`deliver_order` DEĞİŞMEZ; okutulan kod `delivery_proof`a — B2C'ye bedava kanıt;
  tüm kutular okutulmadan teslim tamamlanmaz) · kurye ekranları
- [ ] (23.9) **Parti karışma sinyali:** aynı varyantın aynı depoda 2+ açık partisi sayısı — Stok
  "Dikkat" sekmesine tek satır (lot etiketi kararının sayısal ölçütü; etüt §1.10)

## Netleşecekler

1. ~~**Toplayan kişi kuryenin kendisi mi?**~~ → **CEVAPLANDI (kullanıcı kararı 21.08): rol
   ayrılmaz** — kimi gün depocu toplar kurye yükler, kimi gün kurye kendisi toplar. Ekranlar rol
   varsaymaz; yükleme okutması hem doğrulama hem sayım olarak kalır.
2. **Etiket dosya biçimi: PDF mi PNG mi?** Brother SDK ikisini de basıyor. Karar barkod/QR üretimi
   ve font kontrolüyle birlikte verilir — etiketin içeriğine sunucu karar verdiği için biçim de
   sunucu tarafının kararı.
3. **Hazır paket mi kendi modülümüz mü?** `expo-brother-printer-sdk` (v0.7.0, MIT) önce denenir;
   RN 0.86 altında tutmazsa `apps/mobile/modules/brother-print/` local modülü yazılır (kullanıcı
   kararı 17.08: ucuzdan başla).
4. **Kutu kodunun biçimi.** `order.reference_no` OLMAMALI — o müşteriye gösteriliyor; kutu kodu ayrı
   ve tahmin edilemez olmalı, yoksa referansı bilen biri teslim kaydı düşürebilir.
5. **Parti karışma sinyali.** Lot etiketi ertelendi ama kararın ölçütü sayısal olmalı: aynı varyantın
   aynı depoda 2+ açık partisi bulunduğu durumların sayısı (mevcut `stock` okumasından türer, yeni
   tablo yok). Bu sinyalin nereye düşeceği (depo ekranı mı, analitik mi) netleşecek.
