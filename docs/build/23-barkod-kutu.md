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
- [x] (23.3) **Web dokunuşları:** varyant editörüne barkod listesi (öğrenen eşlemenin GERİ ALMA
  yeri: tür/çarpan + sil) · fiyat/tedarik aramalarına kod zinciri (`prices/actions.ts` ·
  `procurement/actions.ts` bugün yalnız ada bakıyor) · touches:
  `apps/web/lib/catalog/{barcode-actions.ts,code-search.ts}`,
  `apps/web/components/operation/form/product-form/variant-editor.tsx`,
  `apps/web/app/(operations)/operations/{prices/actions.ts,procurement/procurement-read.ts}`
  - *Bitti:* varyant satırının altında kod çipleri (tür + koli çarpanı + ×) ve iki seçicide kod
    zinciri; kodla arama kod EŞLEŞİRSE ada hiç bakmaz (kod kesin kimliktir).
  - **Durum (22.08) — YAZILDI.** Silme ONAYSIZ ve gerekçeli (`barcode-actions` künyesi): kaybolan
    şey bir eşleme — koli sonraki kabulde yeniden sorulur; varyant silmenin iki adımlı onayı emsal
    değil (orada fiyat satırları da gidiyor). Kod formun durumu DEĞİL: editör kayıtlı varyantların
    kodlarını kendisi okur, RHF'e sokmaz. Kod EKLEME bilinçle yok — öğrenme kabuldedir (karar §1.3).
    Zincir tek kapıdan (`findByCode`, scan.test.ts'te ölçülü); `code-search` yalnız varyantı ürüne
    çıkarır. **Ek (mobil şeridin işareti, aynı tur):** `recipientName` mobil kuyruğa girdi —
    sözleşme + D1 ekranında "Koliye: X" (yalnız alıcı hesap sahibinden farklıysa; web `parcelName`
    kuralı birebir) + 2 jest. Depo jest 10 suite · 81 test.
- [x] (23.4) **Kamera taraması (mobil):** `expo-camera` beyanlı girer; tek `onScan` bileşeni
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
  - **GERÇEK KAMERA ÖLÇÜLDÜ (23.08) — satır bununla kapandı.** Fiziksel barkod elde yoktu;
    seed'in EAN-13'ü (`8691000007919` — Limonlu Artisan Kek · 90 g; checksum'ı geçerli, kamera
    ancak geçerli koda tepki verir) 62 mm ruloya basıldı (62×19 mm etiket — yazıcının baskı payı
    kenarı yediği için ~3 mm güvenli boşluk gerekti, ölçüldü) ve KAĞITTAN okutuldu: yeni
    dev-client'ta izin kutusu kendiliğinden geldi, D1 kutu akışında `CameraView` kodu çözdü →
    `resolveScannedCode` ürünü tanıdı → siparişte olmayan ürün ANINDA reddedildi ("bu siparişte
    yok, kutuya girmez") — decode + çözüm + iş kuralı tek okutmada. Not: kamera önizlemesi ayrı
    yüzeyde çizildiğinden `screencap`e SİYAH düşüyor — ajan turlarında vizör ekran görüntüsüyle
    doğrulanamaz, sonuç cümlesiyle doğrulanır.
- [x] (23.5) **İğne deneyi (basım):** `expo-brother-printer-sdk` v0.7.0 + gerçek QL-1110NWB — RN
  0.86/New Architecture altında bağlanma ÖLÇÜLMEMİŞ tek varsayım; tutmazsa
  `apps/mobile/modules/brother-print/` local modülü. Hiçbir fazı bloklamaz.
  - **Durum (22.08) — DENEY TUTTU, iki yazıcıda da kâğıt çıktı.** SDK New Arch dev-client'ına
    bağlandı (config plugin + autolinking, elle native iş yok); `searchNetworkPrinters` iki
    yazıcıyı da buldu (QL-1110NWB → 192.168.1.90 · QL-820NWB → 192.168.1.169 — ağ keşfiyle
    birebir) ve `printImage` ikisinde de bastı; 1110'un çıktısını kullanıcı gözle doğruladı.
    Etüdün B planı (`modules/brother-print/` local modülü) DÜŞTÜ.
  - **Ölçülen etiket boyları** (23.7'nin `label_printer_*` ayarına yazılacak değerler):
    QL-1110NWB **`DieCutW103H164`** (103×164 mm kalıp kesim — DK-1247; sürekli `RollW102` ve
    `DieCutW102H152` reddedildi), QL-820NWB **`RollW62`** (62 mm sürekli rulo). Yanlış boyun
    reddi AYNEN: `Call to function 'ExpoBrotherPrinterSdk.printImageWithURL' has been rejected.
    → Caused by: GenericError(description='Print failed: SetLabelSizeError')` — takılı kâğıt
    SDK'dan OKUNAMIYOR, boy ayarla eşleşmek zorunda; `printNeedleTest` aday boyları sırayla
    deneyip tutanı raporlar (deney aracı; kalıcı çözüm 23.7'de depo başına ayar).
  - Dikiş `src/lib/print/{printer-availability.ts,brother.ts}` (kameranın yoklama deseni) +
    dev-only `PrintProbe` paneli (etiket kartının içinde; release'te ve modülsüz derlemede hiç
    çizilmez). Desen `assets/print/needle-test.png` — SDK yalnız yerel `file://` bastığı için
    `expo-asset` ile cihaza indirilir.
- [x] (23.6) **Kutu şeması + döngüsü**: `order_box`/`order_box_item` + `seal_order_box` RPC (kutu +
  picks TEK transaction; ⚠ `record_preparation` picks yazımı kalem başına ABSOLÜT — çok kutulu
  siparişte birleşimi `sealBox` kapısı kurar) + `boxCompletion` motoru + mobil toplama ekranı +
  web hazırlık paneline kutu özeti. Kutu kodu `reference_no` DEĞİL. Kutusuz sipariş eski yoldan
  gider (bilinçli çift akış). · touches: `supabase/migrations/0048_order_box.sql`,
  `packages/types/src/entities/order-box.schema.ts`, `packages/types/src/contracts/warehouse-api.schema.ts`,
  `packages/database/src/services/order-box.service.ts`, `packages/domain-core/src/order/{box-completion.ts,reference-no.ts}`,
  `packages/application/src/warehouse/{boxes.ts,preparation.ts}`, `apps/mobile-api/src/api/v1/warehouse.ts`,
  `scripts/seed/{orders.ts,coverage.ts}`
  - ~~*(tasarım dönünce)*~~ → **kullanıcı kararı 22.08: ekranlar MEVCUT desene göre şimdi yazılır,
    Claude Design'a sonra gösterilir** — modülün "kutu şeması tasarım dönene kadar açılmaz" kuralı
    bu kararla düştü.
  - *Bitti:* kutu döngüsü cihazda uçtan uca ölçüldü — kapalı kutu özeti · açık kutu çipi · "önceki
    kutularda N" · yanlış ürün reddi ("kutuya girmez") · çarpan/tavan kesişimi · kapanışta
    "sipariş HAZIR (2 kutu)" ve kuyruktan düşüş; DB'de Σ kutu = karşılanan (6=6 · 4=4) doğrulandı.
  - **Durum (22.08) — ARKA UÇ YAZILDI, ekranlar sırada.** `0048`: kutu AÇIK doğar (`sealed_at
    null`), kapanış `seal_order_box` ile TEK transaction (içerik + `record_preparation` + mühür);
    RPC **Σ kutu = fulfilled** eşitliğini denetler — eksik kurulmuş birleşim tümüyle geri alınır,
    kutulu/kutusuz karışım kalem düzeyinde reddedilir. Kutu kodu `orderBoxCode` (`KT-YY-` + 10
    karakter; referanstan hem önek hem uzunlukça ayrık — Netleşecek 4 kapandı). `boxCompletion`
    motoru (birim testli) "kapandı mı / eksik ne"yi söyler; eksik TAVSİYESİ yalnız `declareShort`
    beyanıyla üretilir (ara kutunun doğal eksiği yönetime soru olmaz). Kuyruk sözleşmesi `boxes`
    taşıyor; uçlar `POST /warehouse/orders/:id/boxes` + `POST /warehouse/boxes/:id/seal`. Çıpalı
    parti ve eksik tavsiyesi `confirmPreparation` ile ORTAK yardımcılardan (ikinci hazırlık dili
    açılmadı). Seed: tek kutu KAPALI + çok kutulu (1 kapalı · 1 açık), dördü zorunlu coverage
    kovası. Entegrasyon testi `boxes.test.ts` (10 test — çok kutulu birleşim dahil).
  - **EKRANLAR (22.08, aynı gün) — kullanıcı deseniyle yazıldı ve CİHAZDA ölçüldü.** Mobil D1 kutu
    eksenine döndü: taze sipariş "Kutu aç" ile başlar (ilk kutu tek dokunuş — brief'in anı), açık
    kutu çipi + kapalı kutu özetleri + `ScanSheet` yeniden kullanımı ("Kalemi kutuya okut", aynı
    `onScan` sözleşmesi, simülasyon havuzu dahil); okutulan kod satıra ÇARPAN kadar ekler ama tavan
    motorun kapasitesi; siparişte olmayan ürün ANINDA reddedilir; kapanış BU kutunun dağılımını
    gönderir (birleşim sunucuda), eksik beyanı satırlardaki "eksik bildir"den türer. **Kutusuz
    BAŞLANMIŞ iş kutu moduna girmez** (web masasından yarım gelen sipariş eski akışta biter —
    kalem düzeyi karışım duvarına ekran hiç koşturmaz). Web hazırlık paneli kutu ÖZETİ okur
    ("2 kutu · 1 kapalı · 1 açık") — web'de kutu açılmaz/kapanmaz (karar §1.1). Jest: eski akış
    testleri "kutusuz başlanmış iş" fikstürüne çevrildi, kutu akışına 5 test (`picking-box.test.tsx`);
    mobil 87 suite · 613 test yeşil.
  - ~~KALAN: toplama listesinin `storage_area.sort_order` dizilimi~~ → 23.7 ile birlikte yazıldı
    (22.08): kalemler ilk öneri partisinin alan sırasına dizilir — sıra SUNUCUDA kurulur
    (`listPreparationQueue`), sözleşmeye sayı taşınmaz; alansız kalem sona düşer. Gömüye
    `sort_order` girince İLK çok-kelimeli embed alanı doğdu ve `StockService.embeds` beyanı
    gerekti (ölçüldü: beyansız iç satır snake kalıyor, kuyruk okuma anında düşüyordu — taban
    künyesinin "arıza sessiz değildir" cümlesi). Kapanışın "etiket basılır" adımı da doldu.
- [x] (23.7) **Etiket + basım:** `GET /warehouse/boxes/:id/label` (içerik sunucudan; PDF/PNG kararı
  etiket tasarımıyla) · yazıcı ayarı `settings` warehouse kapsamı (`label_printer_*`) + Depolar
  ekranına ayar bölümü · basım kutu kapanışında, sistem diyaloğu olmadan · touches:
  `packages/application/src/warehouse/boxes.ts`, `packages/types/src/contracts/warehouse-api.schema.ts`,
  `apps/mobile-api/src/api/v1/warehouse.ts`, `apps/mobile/src/screens/warehouse/{use-preparation.hook.ts,preparation-screen.tsx}`
  - **Durum (22.08) — İÇERİK YARISI YAZILDI.** `boxLabelPayload`: 4×6 etiketin içeriği sunucudan
    (karar §1.9 — tek şablon, tek yerde test): kutu kodu (QR) · N/M · referans · koliye yazılacak
    ad (10.9 kuralı) · rota/gün (kargoda kulvar) · tahsilatın YÖNTEMİ · döküm. **Tutar alanı yok
    ve olamaz** (karar §1.5 — sözleşme taşımıyor; testte alan-adı sızıntısıyla da ölçülü). Açık
    kutunun etiketi YOKTUR (`not_sealed` — içerik kesinleşmedi). Bugünkü tüketici mobil kapanış
    ÖNİZLEMESİ (CLAUDE §3: dış-modül bekleyende UI tam, arka uç stub — kart "basım iğne deneyini
    bekliyor" der). Testler: +2 entegrasyon (para sızıntısı dahil) + jest kapanış testi etiketi
    de ölçüyor.
  - **Durum (22.08 gece) — BASIM YARISI YAZILDI ve CİHAZDA KÂĞITLA ölçüldü** (iğne deneyi 23.5
    aynı gün tuttuğu için kilit düştü). Biçim kararı (Netleşecek 2): **PNG** — Brother SDK yalnız
    görüntü basıyor, PDF ara katmanı kimseye hizmet etmeyecekti. Zincir: `boxLabelSvg`
    (`application/warehouse/label-svg.ts`, SAF string şablon + `qrcode` matrisi — birim testli,
    para sızıntısı ölçülü) → `GET /boxes/:id/label.png` (`mobile-api/lib/label-png`,
    `@resvg/resvg-js` + Karla dosyadan; zarfsız binary) → telefon `fetch`+`expo-file-system` ile
    cihaza yazar (`lib/print/label-file`) → `printLabel` ayarlı yazıcıya basar → **başarıda**
    `POST /boxes/:id/printed` damgayı vurur (niyet damgalanmaz — 05.08; yeniden basım damgayı
    günceller). Ölçüldü: `sealed_at` 20:16:04 → `printed_at` 20:16:11, kâğıt çıktı gözle onaylı.
  - Yazıcı ayarı üç anahtar (`label_printer_address/model/label_size` — warehouse kapsamı, yeni
    tablo yok); üçü birden dolu değilse `labelPrinterFor` **null** döner ve telefon basmayı hiç
    denemez (kart önizleme dilinde kalır, Depolar'a işaret eder). Ayar etiket cevabının İÇİNDE
    gelir (`BoxLabelResponse.printer`) — telefon ayrı ayar ucu okumaz, ayarın tüketicisi basım
    anıdır. Web: Depolar ekranına "Etiket yazıcısı" bölümü + pencere (boy KAPALI liste —
    `SetLabelSizeError` 23.5 ölçümü; üç alanı boşaltmak yazıcıyı kaldırır). Seed STR'ye ölçülen
    değerleri yazar (1110 · 192.168.1.90 · DieCutW103H164); öteki depolar bilerek yazıcısız
    (çift hâl coverage). Basım hatası kutu kapanışını GERİ ÇEKMEZ: cümle AYNEN karta yazılır,
    "yeniden bas" eli bekler. Jest +2 (otomatik basım · redde kapanışın ayakta kalışı + yeniden
    basım), entegrasyon +2 (`labelPrinterFor` yarım ayar reddi · damga yalnız kapalı kutuya).
- [x] (23.8) **Yükleme + teslim okutması:** `loadBox` (rota doğrulama + damga + sayaç) ·
  `startCourierDay` kutulu siparişte tüm kutular binmeden `out_for_delivery` yazmaz ·
  ~~`deliverByBox`~~ → ayrı kapı açılmadı: kutu ön koşulu `confirmDoorDelivery`'nin İÇİNE girdi
  (`deliver_order` DEĞİŞMEZ; okutulan kod `delivery_proof`a — B2C'ye bedava kanıt; tüm kutular
  okutulmadan teslim tamamlanmaz) · kurye ekranları · touches:
  `packages/application/src/courier/{load.ts,day.ts,delivery.ts,proof.ts}`,
  `packages/types/src/{entities/courier.schema.ts,contracts/courier-api.schema.ts}`,
  `apps/mobile-api/src/api/v1/courier.ts`, `apps/mobile/src/screens/courier/*`,
  `apps/mobile/src/components/scan/scan-sheet.tsx`
  - *Bitti:* çok kutulu sipariş son kutu okutulmadan yolda sayılmadı; kodsuz teslim `boxes_missing`
    ile reddedildi; kapanan teslimin kanıtında okutulan kodlar göründü — entegrasyonda ölçüldü.
  - **Durum (22.08) — YAZILDI.** `POST /courier/boxes/load`: kutu → sipariş → kurye damgası zinciri
    (`wrong_route` hangi siparişin malı olduğunu söyler — kurye rampada doğru yığını bulur; açık
    kutu `not_sealed`); kutulu siparişin `ready → out_for_delivery` geçişini SON kutunun okutması
    yazar (`orderStarted`), `startCourierDay` onları `awaitingBoxes` sayacıyla atlar (hepsi zaten
    yüklüyse eski yoldan geçirir — dünden araçtaki kutu bekletmez). Teslim: `scannedBoxCodes` ön
    koşul; kanıt `box_scan` türü doğdu (görselsiz — kodların kendisi kanıt; görselli kanıt varsa
    kodlar onun içine yazılır), web sipariş detayı türü tanıyor ("kutu QR"). `ScanSheet` çağıranın
    dev çiplerini kabul ediyor (`devCodes`): kutu QR'ları üretilmiş kayıt olduğundan simülasyon
    ancak ekranın elindeki gerçek kodlardan kurulur. Sayaç damgalardan türer, tablo yok.
    Testler: `load.test.ts` (8 — çok kutulu geçiş, boxes_missing, box_scan kanıtı dahil) +
    `day.test.ts` kutulu başlatma + kurye ekranlarına 5 jest (gerçek hook + sözleşme). Mobil 87
    suite · 618; tam kurye entegrasyonu 50/50. Kurye ekranlarında cihaz turu YAPILMADI (kutulu
    seed siparişleri Salı/Cuma rotasında — tur o güne denk bir seed ister); tarama zinciri cihazda
    23.4/23.6 turlarında kanıtlı.
- [x] (23.9) **Parti karışma sinyali:** aynı varyantın aynı depoda 2+ açık partisi sayısı — Stok
  "Dikkat" sekmesine tek satır (lot etiketi kararının sayısal ölçütü; etüt §1.10) · touches:
  `apps/web/app/(operations)/operations/stock/{stock-labels.ts,stock-types.ts,page.tsx,tabs/attention-tab.tsx,mixed-lot.test.ts}`
  - *Bitti:* `mixedLotCases` saf türetim (mevcut parti okumasından — yeni tablo/sorgu yok, 4 birim
    testi: tükenmiş parti SAYILMAZ, ayrım depo içinde) + Dikkat sekmesinde tek satır. **Sıfırda da
    çizilir** — sinyalin yokluğu ile ölçümün yokluğu karışmasın; Netleşecek 5 böylece kapandı
    (sinyalin yeri: Dikkat sekmesi).
- [x] (23.10) **Test dalgası — Dalga 1b** (plan: `docs/build/test-dalgasi.md` §5, §6.2). Modül 23 en
  yeni modül ve yüzeyi hâlâ küçük; testi ucuzken yazılır. `touches: packages/database/src/services/variant-barcode.service.ts, apps/mobile/src/components/scan/**, packages/types/src/entities/variant-barcode.schema.ts`
  - *Bitti:* envanterin tamamı yazıldı ve KOŞTU — kilitli tam pakette (25.08) modül 23'ün dokuz
    test dosyası da yeşil: `variant-barcode` 7 · `scan` 6 · `variant-search` 7 · `intake` 27 ·
    `boxes` 14 · `label-svg` 6 · `preparation` 17 · `load` 8 · `barcode-svg` 15.
  - **Durum (25.08) — KAPANDI.** Üç açık kalem vardı, üçü de kapatıldı:
    - **Koşulmamış test koştu:** `variant-barcode.test.ts` 23.08'de yazılmış ama hiç
      çalıştırılmamıştı ("test yazdım" ile "test koşuyor" farkı) — ilk koşusunda 7/7 geçti.
    - **Zincirin son halkası yazıldı:** okutma ve kabul kapıları ayrı ayrı testliydi, aralarındaki
      BAĞ değildi — okutulan kodun çözdüğü varyant, kabulün yazdığı partinin varyantı mı?
      `intake.test.ts`e üç iddia (kimlik zinciri · koli çarpanının partiye yansıması · öğretilen
      kodun aynı turda çözülmesi). Bir eşleme hatası olsaydı hiçbir test görmezdi; sonucu depoda,
      olmayan malı satmaya çalışırken görülürdü.
    - **Mobil yarısı da kapandı:** `dev-scan-pool.test.ts` (4 iddia) — havuz kodlarının KÂĞIDA
      basılabilir olduğunu ölçüyor (sağlama basamağı, benzersizlik, beş yolun tamamı). Kopya
      sessizce ayrışırsa çipe basmak ile kâğıdı okutmak aynı şeyi sınamaz olurdu.
  - ⚠️ **`scripts/` HİÇBİR VİTEST PROJESİNDE DEĞİLDİ** (bulgu 25.08): oraya yazılan test sessizce
    hiç koşmazdı — config'in kendi künyesindeki `mask.test.ts` tuzağının aynısı. Kök seviyesindeki
    test dosyaları birim projesine eklendi (`vitest.config.ts`); desen DAR — `scripts/seed/` altı
    DIŞARIDA, çünkü seed DB'ye vuruyor ve oraya yazılacak bir test entegrasyona ait.
  - **Tam pakette iki düşüş vardı, ikisi de MODÜL DIŞI ve altyapı kaynaklı** (ölçüldü): biri
    `warehouse.test.ts` — DE'de artık bir test deposu kalıntısı `warehouse_single_online` kısıtını
    dolduruyordu (`pnpm test:purge --apply` ile temizlendi, ikisi de o günün koşularından);
    öteki `checkout-shipping-order.test.ts` teardown'ında `delivery_zone` silme zaman aşımı.
    İkisi de tek başına koşulunca GEÇTİ (15/15 ve 5/5).
  - **Bugünkü hâl ölçüldü (22.08):** `packages/application/src/warehouse/scan.ts` ve
    `apps/mobile/src/components/scan/scan-sheet.tsx` TESTLİ; `variant-barcode.service.ts` ve
    `dev-scan-pool.ts` testsiz.
  - ⚠️ **ENVANTER DÜZELTMESİ (23.08):** ~~Barkod biçim doğrulaması (EAN-13/EAN-8 sağlama basamağı) — geçersiz basamak REDDEDİLMELİ~~ → **YANLIŞ ÖNERİYDİ.** Şema biçimi BİLEREK zorlamıyor ve gerekçesi künyede yazılı: *"iç etiketler ve QR'lar da taranabilir; 'geçersiz biçim' reddi gerçek bir kolinin kabulünü durdururdu."* Test, olmayan bir davranışı istemiş olurdu. Yerine **kararın kendisi** çivilendi: EAN olmayan iç etiket kabul EDİLMELİ — biri bir gün "iyilik olsun diye" doğrulama eklerse depoda gerçek koli reddedilmeye başlar ve sebebi aylarca anlaşılmaz.
  - ⏳ **YAZILDI — KOŞULMADI (23.08):** `packages/database/src/services/variant-barcode.test.ts`, 7 iddia. Typecheck + lint yeşil; koşmak denetmenin işi (`CLAUDE §4b`).
    - **Tek arama kapısı:** bilinmeyen kod **`null`** (sıfır ya da "ilk varyant" DEĞİL — tahmin eden bir arama yanlış malı stoğa yazardı) · bilinen barkod doğru varyanta düşer ve `source` ile kesinlik derecesini söyler · **koli barkodu çarpanını KENDİ taşır** (tedarikçinin `pack_qty`si okunmaz — iki tedarikçinin kolisi farklı olabilir).
    - **Kısıtlar veride, kodda değil:** aynı kod ikinci varyanta bağlanamaz · `unit` kodun çarpanı 1 olmak zorunda · çarpan sıfır/negatif olamaz.
    - **Biçim doğrulamasının YOKLUĞU** ayrıca çivilendi (yukarıdaki düzeltme).
  - ~~**MOBİL YARISI ŞERİDİNDE KALIYOR**~~ → 23.4 kapandığı için çalışma alanı serbest kaldı;
    `dev-scan-pool.test.ts` 25.08'de yazıldı (yukarıda).
  - ~~**DB'YE VURAN — KALAN:** mal kabulde okutma → doğru partiye yazma~~ → yazıldı ve koştu
    (`intake.test.ts` › "okutulan kod → yazılan parti").

- [x] (23.11) **Okutma çekmecesi + elastik adet seçici (mal kabul)** — kullanıcı tasarımı 23.08:
  okutma bir SAYIM değil TANITIMDIR. Kod çözülünce ürün kartı çekmecesi açılır (görsel + ad +
  kaynak künyesi + beklenen), varsayılan adet okutulan birimin miktarı (koli → çarpan, tekil → 1);
  "10 koli geldi" gerçeği adet artırılarak söylenir, satıra ONAYLA yazılır. · touches:
  `apps/mobile/src/components/operations/qty-slider.tsx`, `apps/mobile/src/screens/warehouse/{intake-screen.tsx,use-intake.hook.ts,intake-scan.test.tsx,messages.json}`,
  `packages/types/src/contracts/warehouse-api.schema.ts`, `packages/application/src/warehouse/{scan.ts,names.ts}`
  - **Durum (24.08) — YAZILDI ve CİHAZDA ÖLÇÜLDÜ; tek açık kalem sürükleme jestinin turu.**
    Kâğıttan okutulan koli kodu (ITF-14) çekmeceyi 24 adetle açtı; "1 koli" dökümü, beklenen
    çentiği ve satıra yazma ölçüldü. Kullanıcı bulgusuyla iki rötuş yapıldı (fotoğraf arka plana
    taşındı · eksen beklenen adete göre daraldı) ve sürükleme arızası düzeltildi — o düzeltmenin
    cihaz doğrulaması kaldı (künye 23.14'te).
  - *(ilk yazım künyesi)* `OperationsQtySlider`:
    elastik eksenli seçici — ray beklenen adetle açılır (yoksa 10 kaba adım), sürükleme KABA
    adımla atlar (okutulan birimin çarpanı), ± düğmeleri 1'er; topuz SAĞ UCA dayalı TUTULUNCA
    değer akar ve pencere onunla büyür (hızlanarak — `growthFactor`), bırakınca pencere değerin
    %25 üstüne oturur (`axisWindow`). Zemin parmağın altında KAYMAZ: ölçek yalnız kenar jestinde
    ve bırakışta değişir; çapa üstteki büyük sayıdır ("40" + "10 koli" dökümü). Mekaniğin emsali
    `route-hours.tsx`ün kaba/ince adımı; sürükleme + kenar büyümesi cihazda ölçülür (jest'te
    jest sahte). Çözüm cevabına `imageUrl` girdi (`ResolveCodeResponse` + `variantNames` —
    kapak `publicImageUrl` ile çözülür); çekmece görseli `AvatarThumb`. Vazgeçilen çekmece hiçbir
    satıra yazmaz (testli); PO'da olmayan ürün çekmece bile açmaz. Jest: seçiciye 9, tarama
    akışına 7 (davranış değişti: onaysız ekleme kalktı). Toplama okutması BİLEREK sessiz kaldı —
    çekmecenin oraya da gelip gelmeyeceği ayrı karar (tempo ödünleşmesi), kullanıcıya soruldu.
- [x] (23.12) **Öğrenme çekmecesine tür + çarpan** — tanınmayan kod öğretilirken "tekil mi koli
  mi, koliyse kaç adet?" sorulur. · touches: `apps/mobile/src/screens/warehouse/{intake-screen.tsx,use-intake.hook.ts,intake-scan.test.tsx,messages.json}`
  - *Bitti:* öğrenme iki adımlı (ürün → bu kod neyi sayıyor); koli seçilip çarpan verilince kod
    ÇARPANIYLA yazılıyor ve satıra o kadar ekleniyor. Jest +3.
  - **Durum (24.08) — YAZILDI.** Açık şuydu: kapı `kind`/`qtyPerCode` alıyordu ama ekran
    göndermiyordu, yani her öğretilen kod **1 adetlik** oluyordu (ölçüldü 23.08). Sonucu sessiz ve
    KALICIYDI — koli her okutmada 1 sayılır, depocu adedi hep elle düzeltir ve sebebi görünmezdi;
    web'de kod ekleme bilinçle kapalı olduğu için (öğrenme kabuldedir, karar §1.3) doğru çarpanı
    yazmanın başka yolu da yoktu. Varsayılan TEKİL: koli olduğunu ancak depocu bilir ve söylemesi
    bir dokunuş; tersini varsaymak her pakete uydurma bir çarpan yazmak olurdu. Tekile dönüşte
    çarpan 1'e çekilir (`unit` kodun çarpanı veride de 1 olmak zorunda — 0047 kısıtı). **Koli
    seçilip çarpan 1 kalırsa kapı AÇILMAZ**: "1 adetlik koli" bir beyan değil, eksik cevaptır.
    `already_bound` yarışında adet yine 1 — çarpan artık ötekinin yazdığı kaydın bilgisi, bizim
    tahminimiz değil.
- [x] (23.13) **Plansız kabul: ürün araması + satır açma** — PO'suz gelen mal. · touches:
  `packages/application/src/warehouse/variant-search.ts`, `packages/types/src/contracts/warehouse-api.schema.ts`,
  `apps/mobile-api/src/api/v1/warehouse.ts`, `apps/mobile/src/lib/api/warehouse.ts`,
  `apps/mobile/src/screens/warehouse/{intake-screen.tsx,use-intake.hook.ts,intake-screen.test.tsx,messages.json}`
  - *Bitti:* bekleyen sevkiyat listesinden "Siparişsiz mal geldi" ile girilir; ürün aramayla ya da
    okutmayla satır açılır, kabul `POST /intake/receive` ile yazılır (kapı 21.11'den beri hazırdı).
  - **Durum (24.08) — YAZILDI, kapı gerçek veriyle ölçüldü.** Arama `searchVariantsForIntake`:
    KOD önce (`findByCode` zinciri — eşleşirse ada hiç bakılmaz, kod kesin kimliktir), sonra ad
    (üç dilde `ilike`). Ölçüm: `"baklava"` → 27 boy · `8691000007919` → tek satır, çarpan 1 ·
    `18691000047516` → tek satır, çarpan 24 · eşleşmeyen sorgu → boş. **PO'lu kabulle iki noktada
    TERS ve ikisi de bilinçli:** (1) okutma SATIR AÇAR — orada küme siparişten gelir ve dışarıdan
    satır eklemek "beklenmedik mal"ı fark raporunun göremeyeceği yere yazmak olurdu; burada küme
    zaten yoktur. (2) **beklenen adet YOKTUR** — "beklenen 0" yazılmaz, satırın künyesi hiç
    çizilmez ve fark özeti bu satırları saymaz (CLAUDE §1: ölçülemeyen değer sıfır değildir).
    Arama düğmesi de yalnız plansızda çizilir. Uç `GET /warehouse/variants?q=…`; boş sorgu boş
    liste döner (400 değil — ekran her tuşta çağırıyor, "henüz yazmadın" bir hata değil) ve satır
    şeması PARA taşımaz (09.14).

- [x] (23.14) **Fiziksel test etiketi seti** — kâğıt israfını bitiren karar (kullanıcı 24.08:
  *"elimdeki etiketleri sistemin test etiketi olarak tanımla, her testi bunlar üzerinden yapalım"*).
  Kodlar SABİT, bağlandıkları ürün ROLLE seçilir; set bir kez basılır, her `db:refresh` sonrası yine
  çalışır. · touches: `scripts/seed/test-labels.ts`, `scripts/labels-test.ts`,
  `scripts/seed/{barcode.ts,orders.ts}`, `scripts/seed.ts`,
  `apps/mobile/src/components/scan/dev-scan-pool.ts`, `packages/application/src/warehouse/label-svg.ts`
  - *Bitti:* `pnpm labels:test` altı etiketi üretiyor, seed kodları gerçek kayıtlara bağlıyor ve
    bağların doğruluğu DB'de ölçüldü (toplama → açık kutulu siparişin kalemi · yabancı → hiçbir
    kabulde/siparişte yok · kutu QR → kapalı kutu · tanınmayan → hiçbir yere yazılmamış).
  - **Durum (24.08) — YAZILDI ve db:refresh ile ölçüldü (kapsam 138/138).** Altı etiket, taramanın
    altı yolu: paket · koli ×24 · toplama · yabancı ürün (ret) · tanınmayan (öğrenme) · kutu QR
    (yükleme+teslim). İlk ikisi 22–24.08'de basılmış ve kullanıcının elinde — kodları bu yüzden
    değiştirilemez. **Kod sabit, ürün rolle seçilir:** etikette ürün adı YAZMAZ; hangi ürüne
    bağlanacağı katalog sırasından değil rolden gelir ("kabul bekleyen siparişin ilk kalemi", "açık
    kutulu siparişin kalemi") — ad yazsaydık ilk katalog değişiminde kâğıt yalan söylerdi. Eski hâl
    ölçüldü: kodlar sıra tabanlı formüldendi ve hangi etiketin hangi ekranda işe yaradığı
    TESADÜFTÜ (kutulu siparişlerin kalemleriyle barkodlu varyantların kesişimi BOŞTU — toplama
    ekranı kâğıtla hiç sınanamıyordu). Genel kodlama artık rezerve kodlardan uzak duruyor
    (çakışma ölçüldü: `23505`, seed durmuştu). Kutu kodu sonradan değiştirilemediği için
    (`OrderBoxUpdate` bilerek yalnız damga alanlarını alıyor) test kutusu en baştan sabit kodla
    açılıyor; kapanış AYNEN `seal_order_box` RPC'sinden geçiyor ve `openBox` kapısı da sınanmaya
    devam ediyor (çok kutulu sipariş onu kullanıyor). QR üreticisi kutu etiketiyle ORTAK
    (`qrPath` dışa verildi — ikinci bir "QR nasıl çizilir" kararı açılmadı). Simülasyon havuzu
    setin aynası: çipe basmak ile kâğıdı okutmak artık AYNI kodu üretiyor.
  - **SİMGE DÜZELTMESİ (kullanıcı bulgusu 24.08) — ilk set tamamen QR basılmıştı, YANLIŞTI.**
    Yazılım katmanı için simge tipi fark etmez (kapı ham metin alır, `variant_barcode` biçim
    zorlamaz — o karar bilinçli ve duruyor), ama DECODE katmanı için eder: QR en kolay okunan
    simgedir, gerçek depoda okutulacak şeyse paket için **EAN-13**, koli için **ITF-14** — ince
    çizgili, açı ve mesafe toleransı düşük. Set tamamen QR olsaydı sınamak istediğimiz zor yol hiç
    sınanmazdı. Simge artık setin kendi kararı (`TestLabel.symbology`); QR yalnız BİZİM kodumuzda
    (kutu QR'ı harf taşır, EAN'a sığmaz). Çizim `scripts/barcode-svg.ts` (EAN-13 L/G/R + parite ·
    ITF-14 geçmeli kodlama; bitişik modüller tek dikdörtgende birleşir — rasterde saç teli kadar
    boşluk okuyucuda "ince çubuk" olur). **Sağlama basamağı artık zorlanıyor** (`assertCheckDigit`):
    elde basılı `18691000047514` GEÇERSİZ bir GTIN-14'tü ve okuyucu onu sessizce yutardı — doğrusu
    `…516`, kod düzeltildi. Diğer üç kod da geçerli EAN-13 olacak şekilde seçildi.
  - **KÂĞIDA BASMADAN MAKİNEYLE DOĞRULANDI (24.08):** üretilen altı PNG macOS Vision ile decode
    edildi — `EAN13 = 8691000007919` · `I2of5 = 18691000047516` · `EAN13 = 8691000030009` ·
    `EAN13 = 8691000040008` · `EAN13 = 8691000050007` · `QR = KT-99-TESTKUTU01`. Yani çizim doğru
    ve kod okunabiliyor; cihaz turunda ölçülecek olan artık yalnız KAMERANIN bu simgeleri gerçek
    kâğıttan çözmesi. İlk düzende metin guard çubuklarına biniyordu (ölçüldü, düzeltildi: çubukların
    altında sessiz şerit).
  - **SÜRÜKLEME ARIZASI (kullanıcı bulgusu 24.08) — düzeltildi, cihaz ölçümü bekliyor.** Adet
    topuzu sürüklenince değer değişmiyordu; ± düğmeleri çalıştığı için akış tıkalı değildi ama
    tasarlanan etkileşim ölüydü. Kanıt zinciri koddan çıkarıldı: çekmecenin kendi tutamak
    sürüklemesi `ScrollView`in DIŞINDA ve çalışıyor, ray İÇİNDE. İki eksik birden bulundu ve ikisi
    de RNGH'nin belgelenmiş kuralı: (1) RN `Modal` kendi pencere hiyerarşisini kurar ve uygulama
    kökündeki `GestureHandlerRootView` oraya UZANMAZ — jest kökü çekmecenin içinde ayrıca gerekir;
    (2) Android'de dıştaki kaydırma içteki pan ile yarışır ve dokunmayı alabilir — ilişki AÇIKÇA
    kurulmalı. Kök `BottomSheet`e eklendi (kitteki her çekmecenin içi artık jest alabilir);
    rayın eşikleri kondu: `activeOffsetX` yatay niyeti, `failOffsetY` dikey kaydırmayı ayırıyor,
    dokunulan noktaya atlama eşiği beklemiyor (`onBegin` aktivasyondan önce çalışır).
  - **SKU eşleşmesi bilerek sette YOK:** o kodun bir varyantın SKU'sunun kendisi olması gerekir,
    yani sabitlenemez (SKU fiyat dosyalarının anahtarı; test için değiştirmek fiyat eşlemesini
    bozardı). Zincirin o halkası jest + entegrasyonda ölçülü.
  - **CİHAZDA KÂĞITLA ÖLÇÜLDÜ (24.08) — ITF-14 gerçek kameradan okundu.** Kullanıcı basılı KOLİ
    etiketini (`18691000047516`) okuttu: `CameraView` çözdü → çekmece 24 adetle açıldı, "1 koli"
    dökümü ve rayda beklenen (54) çentiği göründü. Yani zincirin tamamı kâğıttan kanıtlandı:
    çizgili simge → decode → kod çözümü → satır bulma → adet önerisi.
  - **BESLEME SAĞLAMLAŞTIRILDI (kullanıcı isteği 24.08: *"her seferinde uyumsuzluk problemleri
    yaşamayalım"*).** Üç kırılganlık ölçülüp giderildi, üçü de aynı kökten — seed test senaryosunu
    GARANTİ etmiyor, tesadüfe bırakıyordu:
    - *Hedef kapanmış siparişe düşebiliyordu* → hedef artık veriden seçiliyor ve ölçüt DURUM
      (`sent`/`partially_received`), seed'in ara haritası değil.
    - *`pnpm db:seed` ikinci kez koşunca çöküyordu* (harita `tabloDolu` guard'ıyla boş dönüyor) →
      set haritadan bağımsızlaştı; `bagla` tekrar koşuya dayanıklı (aynı yere bağlıysa dokunmaz,
      BAŞKA yere bağlıysa durur — sessiz geçmek, kâğıdın bir ürünü sistemin başkasını göstermesi
      demekti).
    - *Seçim deterministik değildi* → aynı veri üstünde iki koşu farklı sipariş/kalem seçiyordu;
      sipariş ekranın kendi sıralamasıyla (en yeni önce), kalemler `variantId` ile sabitlendi.
    - **Set artık kendi vaadini DOĞRULUYOR** (`dogrula`): hedef kabul edilebilir mi · mal kabul
      listesinin İLK satırı mı · toplama kodu açık kutulu siparişin kaleminde mi · "yabancı" gerçekten
      hiçbir yerde yok mu · kutu QR'ı kapalı kutuda mı. Tutmayan biri seed'i DURDURUR — uyumsuzluk
      artık cihazda değil makinede, sebebiyle birlikte çıkar. (İkisi ölçümle yakalandı: kasten
      bozulan "yabancı" ve deterministik olmayan seçim.)
  - **DEEP LINK BAĞIMLILIĞI KALKTI — mal kabul artık kendi listesini okuyor.** Kök sorun buydu:
    sipariş kimliği her tazelemede değişiyor ve ekrana yalnız derin bağlantıyla girilebiliyordu.
    Uç (`GET /warehouse/intake`) 21.11d'den beri hazırdı, ekran okumuyordu; konusuz açılış artık
    "bekleyen sevkiyatlar" listesi (referans · tedarikçi · kalem sayısı → dokun, forma gir).
    Hedef siparişin listenin İLK satırı olması da doğrulanıyor: ikinci sıraya düşen bir hedef,
    sistem doğru çalışsa bile "bu siparişin kaleminde yok" cevabı üretiyordu (ölçüldü). Hub'ın
    bayat *"bekleyen sevkiyat listesi henüz uçtan gelmiyor"* dipnotu ve ekranın yanlış
    *"plansız kabul"* altyazısı da düzeltildi — ikincisi olmayan bir yetenek vaat ediyordu (plansız
    kabul 23.13'ün işi). Cihazda uçtan uca ölçüldü: giriş → liste → ilk satır → okutma → çekmece.

## Cihaz turu — KOŞULDU 25.08 (OPPO CPH1907, kablosuz ADB)

Tur simülasyon çipleriyle koşuldu; çipler kâğıt setin aynasıdır (23.8 kararı) ve aynı `onScan`
teslim noktasından geçerler — fark yalnız kodun kaynağıdır. Kâğıt set gerektiren tek madde kaldı
(kurye/teslim, aşağıda).

**Doğrulananlar:**

- ✅ **Sürükleme jesti (23.11) — arıza KAPANDI.** Adet topuzu sağa çekildi: **24 → 48 → 72**,
  altyazı "1 koli → 2 koli → 3 koli". Kullanıcının bildirdiği *"bara basıp sağa sola çektiğimde
  hareket etmiyor"* hâli yeniden üretilemedi.
- ✅ **Elastik max (kullanıcı tasarımı) çalışıyor:** topuz beklenen çentiğini (60) geçti ve ray
  uzamaya devam etti — sağ uca dayanmadı.
- ✅ **Okutma çekmecesi + fotoğraflı kart:** "Okutulan ürün" başlığı, arka planı ürün fotoğrafı olan
  kart, *"Koli barkodu — 1 koli = 24 adet"*, "beklenen 60". Kullanıcının 24.08 isteği ekranda.
- ✅ **YABANCI ÜRÜN reddi (D1 kutu döngüsü):** başka ürüne bağlı kod okutuldu →
  *"Bu kod Kıymalı E Böreği · 200 g ürününe bağlı — bu siparişte yok, kutuya girmez."* Kod
  ÇÖZÜLÜYOR ama kutuya girmiyor; ret cümlesi ürünü adıyla söylüyor.
- ✅ **Kutu döngüsü:** kutu açıldı ("KUTU 1 · AÇIK"), boş kutu kapatılamadı (CTA pasif).
- ✅ **Mal kabul formu** PO'dan dolu geldi (5 kalem, SKT zorunlu, lot alanları).
- ✅ **Plansız kabul (23.13)** ekranı ve boş hâli çalışıyor.
- ✅ **Hazırlık kâğıdının QR ucu (10.1)** — kuyruktaki "Hazırlık kâğıdını okut" düğmesi, okutucu,
  kuyruk referanslı çipler; okutulan referans DOĞRU siparişi açtı.

⚠ **TUR BİR ARIZA BULDU ve düzeltildi — plansız kabulde öğrenme çekmecesi hiç açılmıyordu.**
TANINMAYAN etiketi okutuldu, **ekran kıpırdamadı**: ne çekmece ne uyarı. Ölçüm koda gitti ve kök
göründü — ekranın plansız-BOŞ dalı erken dönüyor (`intake-screen.tsx`) ve öğrenme çekmecesi yalnız
ANA dalda çiziliyordu. Yani `setLearn` çalışıyor, state doğru kuruluyor, görünür yüzey yok. Sessiz
arızanın tam tanımı: kod doğru, ekran boş, depocu kamerayı suçlar. Çekmece `LearnSheet` bileşenine
çıkarıldı ve iki dalda da çiziliyor; **testi yazıldı ve mutasyonla doğrulandı** (bileşen boş daldan
çıkarılınca test kırılıyor). Testler bunu görmüyordu çünkü hepsi PO'lu kabulde koşuyordu — dal hiç
uyanmıyordu.

✅ **DÜZELTME CİHAZDA DOĞRULANDI (aynı oturum):** çekmece açıldı ve kodu okudu
(*"8691000050007 sistemde kayıtlı değil"*).

⚠ **VE HEMEN ARDINDAN İKİNCİ KUSUR GÖRÜNDÜ — aday listesi BOŞTU.** Çekmece *"Satırı seçin"*
diyordu ama altında hiçbir satır yoktu: plansız kabulde İLK okutma tanınmayan bir kodsa aday
kümesi zaten boştur ve depocu çıkmaza girer. Arızayı ancak çekmece açılınca görebildik — yani
birinci düzeltme ikinciyi ortaya çıkardı.

**Çözüm iki adımı BİRLEŞTİRDİ** (kullanıcı kararı 25.08): boş listede çekmece *"bu kabulde henüz
ürün yok — ürünü arayıp seçin, satır açılır ve kod ona öğretilir"* diyor ve aramayı kendi içinden
açıyor; seçilen ürün hem satırı açıyor hem kodu alıyor. Ayrı bırakılsaydı depocu ürünü ekleyip
kodu İKİNCİ kez okutmak zorunda kalırdı — oysa okutma zaten yaptığı işti.

**Cihazda uçtan uca koşuldu:** TANINMAYAN okutuldu → çekmece boş-liste hâlini gösterdi → arama
açıldı ("baklava" → 7 sonuç, SKU'larıyla) → *Fıstıklı Baklava · 1250 g* seçildi → **arkada satır
açıldı** ve çekmece **2. adıma geçti** (*"Bu kod neyi sayıyor?"* · Tek paket / Koli). Öğretme
tuşuna basılmadı: kod kalıcı bağlanırsa etiket bir daha "tanınmayan" olmaz ve tur düzeneği bozulur.

**İki test:** çekmece boş dalda açılıyor · boş listede arama düğmesi çiziliyor ve satır seçtiren
liste ÇİZİLMİYOR. Birincisi mutasyonla doğrulandı.

## Kalan cihaz turu

- **KUTU QR etiketi** → kurye yükleme + kapıda teslim okutması. Simülasyonla koşulamaz: kutu QR'ları
  ÜRETİLMİŞ kayıtlardır (`KT-…`) ve havuz onları taşımaz — ekranın kendi `devCodes`'u gerekiyor
  (23.8 künyesi). Kâğıt setteki KUTU QR etiketi `db:refresh` sonrası yeni bir kutuya bağlanmalı.
- **Öğrenme çekmecesinin cihazda görülmesi** (yukarıdaki düzeltme).

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
