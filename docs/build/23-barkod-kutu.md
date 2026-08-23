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
- [~] (23.6) **Kutu şeması + döngüsü**: `order_box`/`order_box_item` + `seal_order_box` RPC (kutu +
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
- [ ] (23.10) **Test dalgası — Dalga 1b** (plan: `docs/build/test-dalgasi.md` §5, §6.2). Modül 23 en
  yeni modül ve yüzeyi hâlâ küçük; testi ucuzken yazılır. `touches: packages/database/src/services/variant-barcode.service.ts, apps/mobile/src/components/scan/**, packages/types/src/entities/variant-barcode.schema.ts`
  - *Bitti:* aşağıdaki envanterin tamamı yazılmış; birim olanlar yeşil, DB'ye vuranlar denetmenin
    kilitli paketinde koşulmuş.
  - **Bugünkü hâl ölçüldü (22.08):** `packages/application/src/warehouse/scan.ts` ve
    `apps/mobile/src/components/scan/scan-sheet.tsx` TESTLİ; `variant-barcode.service.ts` ve
    `dev-scan-pool.ts` testsiz.
  - ⚠️ **ENVANTER DÜZELTMESİ (23.08):** ~~Barkod biçim doğrulaması (EAN-13/EAN-8 sağlama basamağı) — geçersiz basamak REDDEDİLMELİ~~ → **YANLIŞ ÖNERİYDİ.** Şema biçimi BİLEREK zorlamıyor ve gerekçesi künyede yazılı: *"iç etiketler ve QR'lar da taranabilir; 'geçersiz biçim' reddi gerçek bir kolinin kabulünü durdururdu."* Test, olmayan bir davranışı istemiş olurdu. Yerine **kararın kendisi** çivilendi: EAN olmayan iç etiket kabul EDİLMELİ — biri bir gün "iyilik olsun diye" doğrulama eklerse depoda gerçek koli reddedilmeye başlar ve sebebi aylarca anlaşılmaz.
  - ⏳ **YAZILDI — KOŞULMADI (23.08):** `packages/database/src/services/variant-barcode.test.ts`, 7 iddia. Typecheck + lint yeşil; koşmak denetmenin işi (`CLAUDE §4b`).
    - **Tek arama kapısı:** bilinmeyen kod **`null`** (sıfır ya da "ilk varyant" DEĞİL — tahmin eden bir arama yanlış malı stoğa yazardı) · bilinen barkod doğru varyanta düşer ve `source` ile kesinlik derecesini söyler · **koli barkodu çarpanını KENDİ taşır** (tedarikçinin `pack_qty`si okunmaz — iki tedarikçinin kolisi farklı olabilir).
    - **Kısıtlar veride, kodda değil:** aynı kod ikinci varyanta bağlanamaz · `unit` kodun çarpanı 1 olmak zorunda · çarpan sıfır/negatif olamaz.
    - **Biçim doğrulamasının YOKLUĞU** ayrıca çivilendi (yukarıdaki düzeltme).
  - **MOBİL YARISI ŞERİDİNDE KALIYOR:** `dev-scan-pool` ve tarama ekranı testleri `apps/mobile/src/components/scan/**` altında ve orası **23.4'ün açık çalışma alanı** (`[~]`, mobil şerit şu an o dosyalarda). `touches` kesişen iki görev aynı anda başlamaz (`WORKFLOW §7`); mobil suite zaten jest'te ve kendi şeridi koşuyor. Dalga 2'de o şeritle birlikte ele alınır.
  - **DB'YE VURAN — KALAN:**
    - Mal kabulde okutma → kod eşleşmesinin doğru partiye yazması (`receive_intake` yolu).

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
