# 00 — Monorepo İskeleti

## Kapsam

Boş ama çalışır monorepo: paket kabukları, ortak tooling, "her şey derleniyor" hali. **İş mantığı yok** — sadece zemin. Bu modül bitince her sonraki modül kendi paketinin içine kod eklemekle uğraşır, kurulumla değil.

## Okunacaklar

- `STACK.md §2-3` (yığın ve iskelet), `§4` (bağımlılık yönü), `§11` (kurulum sırası)
- `WORKFLOW.md §1-2` (çalışma disiplini, git)

## Bağımlılık

Yok — ilk modül.

## Başlarken verilecek izah (örnek)

> "Monorepo kuruyoruz: tek depo içinde `apps/` (web sitesi + arka uç servisi) ve `packages/` (ortak parçalar) olacak. Böylece tip tanımları ve iş kuralları tek yerde yaşar, iki uygulama da aynısını kullanır — kopya kod olmaz. pnpm paketleri bağlar, Turborepo derlemeyi hızlandırır. Bugün sadece boş kabukları ve araçları kuruyoruz; hiçbir özellik kodlanmıyor."

## Görevler

- [x] (00.1) pnpm workspace + Turborepo kök kurulumu (`pnpm-workspace.yaml`, `turbo.json`, kök `package.json`)
  - *Bitti:* kökte `pnpm install` hatasız
- [x] (00.2) TypeScript strict taban konfigi (kökte paylaşılan `tsconfig`), ESLint + Prettier
  - *Bitti:* `pnpm typecheck` ve `pnpm lint` kökte çalışıyor
- [x] (00.3) Paket kabukları: `packages/types`, `database`, `domain-core`, `helper`, `brand`, `i18n`, `storage`, `email`, `notify`, `ai` — her biri boş bir export ile
  - *Bitti:* hepsi derleniyor; bağımlılık yönü kuralı (`STACK §4`) ihlalsiz
- [x] (00.4) `apps/web` — Next.js App Router boş uygulama (tek "merhaba" sayfası, Tailwind bağlı, `packages/brand` token'ları import ediliyor)
  - *Bitti:* `pnpm dev` ile açılıyor
- [x] (00.5) `apps/backend` — Hono boş servis (tek `/health` ucu) + node-cron kabuğu
  - *Bitti:* lokal çalışıyor, `/health` 200 dönüyor
- [x] (00.6) Paket sınırı aracı (eslint-boundaries veya dependency-cruiser) — `STACK §4` kuralları makine-zorlamalı
  - *Bitti:* bilerek yapılan bir ihlal derlemede/lint'te yakalanıyor
  - **Durum (15.08 — son korumasız köprü kapandı).** `lib/storefront/featured.ts` barrel'dan DEĞER açıyordu ve bu klasördeki dört köprünün `server-only` taşımayan tekiydi. Bugün arıza değildi (yalnız sunucudan çağrılıyor) ama vitrin seçicisi istemciye taşındığı gün hata **sessizce** `node:crypto`'ya dönerdi — bir kez yaşandı ve ödeme sayfasını 500'e düşürdü (10.08, tek dosyadan 48 istemci dosyası). **Çare `server-only` değil DERİN YOL** (`@lezzet/application/catalog/featured`): `server-only` yanlış kullanımı okunur bir hataya çevirir, derin yol onu ORTADAN KALDIRIR — ve kaynak modül hiç import taşımıyor, yani yasaklanması gereken bir şey değil, saf. Doğrulama: `typecheck` temiz · `featured.test.ts` 17/17.
- [x] (00.7) Kök script'ler: `dev`, `build`, `typecheck`, `lint`, `test` (turbo pipeline)
  - *Bitti:* hepsi kökte tek komutla koşuyor
- [x] (00.8) `.env.example` + README (lokal kurulum üç adımda)
  - *Bitti:* temiz klonda README takip edilerek proje ayağa kalkıyor
- [~] (00.9) **Playwright — önce GÖZ, sonra duman** (kullanıcı kararı 03.08; denetim etüdü) · `touches: playwright.config.ts, scripts/ui-shot.mjs, e2e/**, package.json`
  - **Durum (03.08) — ÇEKİRDEK KURULDU (denetim ajanı, kullanıcı talimatıyla):** `pnpm ui:shot <yol>` (desktop+mobile-web+ops-karanlık görüntü + konsol dökümü → `.ui-shots/`, dev kapalıysa net mesaj) · `playwright.config.ts` (iki proje = fork'un iki yüzü; `webServer` bilerek yok — dev'i kullanıcı yönetir; artefakt yalnız düşüşte) · `pnpm test:e2e` (test kilidine bağlı) · iki DENEME dumanı (`e2e/customer/storefront` · `e2e/operations/panel` — kaba yapısal iddialar, örnek olsun diye) · **şerit disiplini `e2e/README.md`'de beş kural** (senaryo kaynağı tasarım+DOMAIN; çapraz yazım; §4b veri disiplini; görüntü=artefakt; iki proje).
  - **DUYURU — Kademe 2 senaryolarını DENETİM AJANI yazar (kullanıcı kararı 03.08, çapraz-yazım kararının yerine geçti):** denetmen hiçbir ekranın kodunu yazmadı ("bilen ama yazmayan"), kaynak yine tasarım+DOMAIN. **HENÜZ BAŞLAMADI** — kullanıcı işaret edince başlar. Şeritler `e2e/`ye senaryo AÇMAZ; senaryolara itiraz/katkı `e2e/README`'deki döngüyle. **Bakım ekran sahibinde** (ekranı değiştirip testi kızartan düzeltir). Sınırların tamamı `e2e/README.md`'de.
  - **Canlı doğrulama yapıldı (03.08):** `ui:shot` 5 görüntü + konsol dökümü; duman 8/8 yeşil (iki kurulum pürüzü giderildi: dev-yoklama 15 sn, mobil web profili chromium'a sabit — gerçek WebKit Kademe 3).
  - **Kademe 2 · Parti 1 İNDİ (04.08, denetim — kullanıcı işaretiyle):** iki müşteri salt-okur
    yolculuğu (`katalog → ürün → sepete ekle → sepette görünür` · `fr/de/tr rota sözlüğü + İngilizce
    iç yolun dış kelimeye yönlenişi`). Yol üstünde iki ortam kararı: gezinmeler `domcontentloaded`
    sözleşmesine bağlandı (`load` dev'de asılı kalıyor — ölçüldü) ve **tam paket sakin pencere
    ister** (şerit kaydedince aynı URL 0,3 sn → 60 sn+; `e2e/README` "Koşu gerçeği"). Her senaryo
    en az bir koşuda yeşil doğrulandı; sıradaki partiler: operasyon salt-okur → yazan akışlar.
  - **Kademe 2 · Parti 2 İNDİ (04.08):** üç operasyon salt-okur ilk bakış (sipariş kuyruğu ·
    müşteriler · analitik ekranı) — iddialar İÇERİK esaslı (özet satırı/durum etiketi; operasyon
    listeleri `<a>/<table>` değil, ölçüldü). "Rol yönlendirmesi" BİLİNÇLİ dışarıda: dev bypass tek
    kimlik verir (DEV_ADMIN), gerçek giriş akışı ister → OTP kapısıyla birlikte. **Tam paket
    20/20 yeşil (1,3 dk, sakin pencere)** — pencere kuralı doğrulandı.
  - **Kademe 2 · Parti 3 İNDİ (04.08):** `e2e/customer/place-checkout.smoke.ts` — kapsam-içi
    yer seçimi (67000; öneri→onay niyet kapısından, çip kalıcılığı çerezle) + yerli ziyaretçinin
    sepetle checkout'a ulaşıp KİMLİK SINIRINDA durduğu yolculuk ("Envoyer le code" görünür —
    ötesi OTP kapısı inince Parti 3b). Bilinçli dar: bölge-DIŞI kod denenmez (küresel sayacı
    kirletir, §4b); kalıcı satır yazılmaz. Dosya 4/4 yeşil (28 sn, sakin pencere).
  - **Kademe 2 · Parti 4a İNDİ (04.08):** yazan-taraf FİKSTÜR ALTYAPISI
    (`e2e/fixtures/order-fixture.ts` — damgalı depo+kategori+ürün+stok+sipariş; desen
    `preparation.test.ts`'ten, `purgeTestData` ile toplar; sipariş `confirmed`'a yükseltilir çünkü
    kuyruk draft listelemez) + kuyruk senaryosu (`queue.smoke.ts`): damgalı sipariş kuyrukta
    görünür, detayı müşteri+ürünle açılır. 2/2 yeşil (8,7 sn); koşu sonrası DB'de sıfır artık
    (ölçüldü). Bundan sonraki her yazan parti bu fikstüre basar.
  - **Kademe 2 · Parti 4b + 5 İNDİ (05.08, iki alt-ajan yazdı, denetim doğruladı):**
    `order-advance.smoke.ts` (onaylı sipariş detaydan Hazırlanıyor'a; kanıt çift katlı — birincil
    düğme "Hazır"a döner + rozet; fork'a göre ayrı geçiş yolu) · `stock-intake.smoke.ts` +
    `intake-fixture.ts` (mal kabul: EKRAN henüz yok — 10.4 çizim bekliyor; giriş ekranın da
    kullanacağı üretim RPC'sinden, iddia stok seviyeleri ekranında "parti yok"→"1 parti"+miktar) ·
    `edge-stock.smoke.ts` + `product-fixture.ts` (kullanıcının uç senaryoları: stoksuz ürün
    "Épuisé" basar ve ekleme yolu tamamen kapalı; sepetteyken stok sıfırlanınca sepet engel şeridi
    basar, checkout düğmesi pasif). **`workers: 1`** yapılandırmaya girdi (iki proje paralel
    işçide dev server'ı ezip yazan eylemleri zaman aşırıyordu — ölçüldü). **TAM PAKET 34/34
    yeşil (2,5 dk)**; koşu sonrası damgalı artık SIFIR (profil/ürün/depo/bölge sorgularıyla).
  - **Kademe 2 · Parti 3b İNDİ (07.08):** misafir OTP doğrulaması kimlik SINIRININ ötesine geçti
    (`checkout-otp.smoke.ts` + `otp-fixture.ts`) — Katman 1 kapısıyla (`OTP_TEST_CODE`, müşteri
    şeridi) kod Resend'siz sabitlenir, hash/tek-kullanım/auth zinciri GERÇEK akıştan işler;
    kilitli adımların açılması kanıttır. 2/2 yeşil (21,9 sn), artık SIFIR (auth+doğrulama).
    **Üç saha dersi:** *(1)* env TUZAĞI — Next dev KÖK `.env`'i okumaz, `OTP_TEST_CODE`
    `apps/web/.env.local`'da olmalı (iki restart'a mal oldu); *(2)* kod girişi 6 AYRI kutu —
    tek-alan fill "incorrect" üretir, klavyeden yazılır; *(3)* doğrulama bu aşamada YALNIZ
    `auth.users` açıyor (profil sonra bağlanıyor) — temizlik admin API'den e-postayla bulur.
    ~~Sınır: sabit kodla TEK doğrulama (`BEKLEYEN(08.22)`)~~ **SINIR KALKTI (07.08, arka-uc):**
    küresel `token_hash` tekilliği yerine "e-posta başına tek aktif kod" kondu — sabit kod koşuda
    istenen sayıda e-postayla çalışır, OTP senaryoları çoğalabilir. Her koşu kendi satırını yine
    purge'ler. Katman 2 (gerçek Resend teslimat provası, kod API'den geri okunur) Kademe 3'ün işi.
  - **Parti 5b İNDİ (07.08, kullanıcı sorusundan doğdu):** KISMÎ stok azalması — sepette 2 adet
    varken stok 1'e düşer: adet DEĞİŞMEZ (sessiz eksiltme yok), tavan cümlesi + "Réduire à 1"
    düğmesi çıkar; düzeltme MÜŞTERİNİN tıklamasıyla iner, cümle tavandayken bilgi olarak kalır
    (kod sözleşmesi: `capNote` overCap→düğme, atCap→span). 6/6 yeşil (28,3 sn), artık sıfır.
    Fikstüre `setStockQty` eklendi. Yazım sırasında bir iddia dersi: cümlenin tümden kalkmasını
    beklemek YANLIŞTI — sözleşme kodda okundu, iddia ona hizalandı (bulgu-doğrulama disiplini).
  - **Uç senaryo hattı · Parti 1 YAZILDI (08.08, kullanıcı onayıyla — "testlere devam et"):**
    `edge-min-basket.smoke.ts` — asgari sepetin SÖZÜ ile KURALI aynı sayı mı (arka-uc tavsiyesi 4;
    29.07 arıza sınıfı): eşik altında cümle + kapalı kapı, cümlenin istediği tutar eklenince
    İKİSİ BİRDEN açılır. Eşik damgalı bölgenin KENDİ ayar satırından gelir (fikstür
    `minBasketCents`; `purgeTestData`ya `settingIds` hedefi eklendi — küresel satıra dokunulmaz).
    Statik kanıt: `--list` 32 test/9 dosya + iki dosya tsc temiz. **İLK CANLI KOŞU yapıldı (08.08
    akşam) ve hattın varlık sebebini İLK KOŞUDA kanıtladı:** test KIRMIZI — sebep test değil,
    gerçek bir iş-kuralı arızası: ayar KAPSAMI sepete/checkout'a hiç bağlanmamış (bölge/kanal/ülke
    satırları ölü) → bulgu (07.15) + `arka-uc-ayar-kapsami-baglanmamis.md`; test düzeltme gelene
    dek NÖBETTE kırmızı kalır. Aynı koşu `x-e2e` kanıtını da verdi: iki projede onlarca sayfa
    gezildi, `analytics_session` 0 satırda kaldı — defter temiz (bekleyen kanıt kapandı). Yazım sırasında ölçülen bulgu: küresel `min_basket_cents` `0013`
    seed'inde **0** — `MIN_BASKET_DEFAULT` (40 €, kullanıcı kararı 04.08) hiçbir ortamda okunmuyor,
    b2c'de asgari sepet fiilen kapalı; kullanıcı kararına sunuldu (08.08). Onaylı listenin kalanı
    (iki-sekme bayat sepet · OTP beklerken tükenme · adres değişimi · rezervasyon yarışı · COD
    tavanı) checkout adım dumanlarını (adres/gün/ödeme) ister — kör yazılmaz, ilk canlı partiyle.
  - **Checkout ADIM DUMANI teslim edildi ve İKİ PROJEDE YEŞİL (08.08 akşam, denetim):**
    `checkout-steps.smoke.ts` — OTP sınırının ötesi tek yolculukta: damgalı adres formu → gün
    (kart/tek-gün iki hâl de meşru) → KAPIDA ÖDEME → gerçek sipariş → onay sayfası
    (desktop 41,6 sn · mobile-web 15,9 sn; teardown sıfır artık, DB'den sayımla kanıtlı).
    Uç senaryoların ön şartı hazır. Yol üstünde ÜÇ kalıcı kazanım:
    (1) `purgeTestData`ya **`orderIds` hedefi** — sipariş açan test kendi çöpünü toplayamıyordu;
    kalemler/log/`discount_use` cascade ama REZERVASYONUN `order_id` bağı FK'sız (0006, bilinçli) —
    hiçbir cascade toplamaz, hedef açıkça siler; `order-fixture`ın kural ihlali elle `delete()`i de
    (hata kontrolsüzdü) aynı hedefe çevrildi.
    (2) `otp-fixture` profili artık **`auth_user_id` İLE arıyor** (04.11 guard dersinin e2e'deki
    ikizi: auth id ≠ profil id; profil doğuran İLK test çıkardı — eski desen siparişli profili hiç
    bulamıyor, auth önce silinince FK `set null` profili öksüz bırakıyordu).
    (3) Yönlendirme beklemesi de gezinme sözleşmesine bağlandı (`waitForURL` varsayılan `load`
    dev'de asılıyken sipariş DB'de confirmed YAZILMIŞTI — ölçüldü; `domcontentloaded` şart).
  - Kalan: mal kabulün UI adımı (10.4 ekranı inince `stock-intake` yazım adımı UI'a taşınır,
    iddialar aynı kalır) + Katman 2 gerçek-OTP provası (Kademe 3).
  - **Kademe 1 — `pnpm ui:shot <yol>`:** ÇALIŞAN dev server'daki sayfayı açar (`reuseExistingServer` — build YOK), **desktop + mobile-web** (cihaz forku gereği ikisi de) ve operasyon yollarında **karanlık mod** görüntüsünü `.ui-shots/`a yazar; sayfanın konsol hatalarını da yanına döker. Amaç test değil, ajanlara GÖZ: ekran yapan şerit anlık çağırır, tasarım/fork denetimi görüntüden okunur. DB şartı yok.
  - **Kademe 2 — ~10 duman yolculuğu** (aynı kurulum, dev server'a karşı): müşteri (vitrin→ürün→sepet→checkout taslağı Stripe sınırına dek · misafir OTP · fr/de/tr rotaları · sipariş onayı) + operasyon (rol yönlendirmesi · kuyruk→hazırlık · mal kabul · para ekranı). **Veri disiplini entegrasyon testleriyle AYNI** (§4b): okuyan test seed'in deterministik satırları, yazan test damgalı veri + `purgeTestData`; **`db:refresh` hiçbir koşuda ön şart DEĞİL.** Koşu test kilidine girer (DB'ye vuruyor). Görüntüler assertion değil ARTEFAKT (piksel-diff yok — UI oynakken kırmızı gürültü üretir).
  - **Kademe 3 — ERTELENDİ (canlı öncesi):** production-build koşusu + geniş regresyon + piksel-diff kararı. Bugün kurulmaz.
  - Müşteri OTP'si için test ortamında kod-yakalama kapısı gerekir (Resend'e gitmeden) — Kademe 2'nin tek yeni parçası; tasarımı iskeleti alan şeridin.

- [ ] (00.10) **İstemciden barrel'a DEĞER yolu `docs:check` ile zorlansın** *(kalıbın kendi önerisi, 10.08; kayda geçirildi 15.08)* · `touches: scripts/docs-check.mjs`
  - Kalıp üç sebeple gözden kaçıyor ve üçü bir vakada aynı anda çalıştı: *(1)* `export … from` bir import gibi **görünmez** — dosyada "import" kelimesi hiç geçmez, göz de grep de kaçırır; *(2)* **`typecheck` göremez** — tip olarak her şey doğru, kırılma yalnız webpack'in istemci grafiğinde; *(3)* `import type` **güvenlidir** ve bu ayrımı bilmeyen "type de import" diye düşünüp yanlış tarafa geçebilir.
  - İstenen kontrol: `'use client'` dosyalarından başlayıp geçişli izle `@lezzet/application` barrel'ına **değer** kenarıyla ulaşan bir yol var mı. `export … from` kenarı sayılır, `import type`/`export type` sayılmaz.
  - **Bedeli ölçülmüş:** barrel'dan tek bir değer açmak paketin tamamını tarayıcıya sokuyor (veritabanı istemcisi · e-posta şablonları · `pino` · `node:crypto`). 10.08'de tek dosyadan 48 istemci dosyasına yayıldı ve ödeme sayfası 500 verdi.
  - Emsali `docs:check §3f` (teardown'da elle silme): `typecheck` göremiyor (çağrı tip olarak geçerli), `lint` de göremiyor (proje disiplini, dil kuralı değil) — o boşluğun tek çaresi makineyle zorlamaktı.

**Modül durumu:** tamam (00.9 sonradan açıldı — araç katmanı, iskelet değil). Kabuk paketlerin bir kısmı hâlâ kabuk (`domain-core` yalnız paket sabiti taşıyor — içeriği `03`'te); iskelet görevi bu, dolduran modüller ayrı.

## Netleşecekler

- Yok — bu modül tartışmasız zemin. (CI/staging `18-operasyon-guvenlik.md`'de konuşulacak; burada kurulmaz.)
