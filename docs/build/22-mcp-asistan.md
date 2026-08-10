# 22 — MCP Yönetici Asistanı

## Kapsam

Kurgu ve teknik sınırlar `docs/architecture/AI_ADMIN_ASSISTANT.md`'de (09.08 kararlarıyla) —
bu dosya İLERLEMEYİ tutar, kurguyu tekrarlamaz. **Modülün tam görev listesi Faz 1 bitince açılır**
(kullanıcı kararı: üretim implementasyonu — ikili anahtar paneli, onay kuyruğu + ekranı, OAuth,
araç fazları — Faz 1 sonrası). Bugün yalnız deneme dilimi var; erken açılışın gerekçesi görev
satırında.

## Okunacaklar

- `docs/architecture/AI_ADMIN_ASSISTANT.md` — kurgu, sınırlar, araç fazları, kararlar
- `docs/architecture/AI_CUSTOMER_AGENT.md` — iki AI yüzeyinin ayrımı (bu asistan müşteriye konuşmaz)
- Petit referansı: `~/dev/petitcigogne/apps/backend/src/routes/mcp/` (guard · server-factory · well-known)

## Görevler

- [x] (22.1) **Deneme dilimi — yerel salt-okuma asistan** *(kullanıcı kararı 09.08: "denemem
  lazım" — Faz-1 kuralının incelticisi; üretim implementasyonu yine Faz 1 sonrası)*: `apps/backend`e
  `/mcp` ucu (Hono `app.all` + `@modelcontextprotocol/sdk` streamable HTTP, istek-başına stateless
  `Server`) + `.env` Bearer kapısı (`MCP_CONNECTION_KEY`, fail-closed, sabit-zamanlı kıyas) + Faz
  A'dan ÜÇ salt-okuma araç: `morning_briefing` (bugünün teslimatları/ciro/kapıda + açık hata +
  sağlık + açık talep + depo başına eşik-altı tedarik önerisi + `attention` listesi) ·
  `sales_summary` (teslim gününe göre son N gün — sipariş-tarihi süzgeci kapıda yok, araç bunu
  saklamaz) · `system_errors` (açık sayı + seçilmiş alanlarla son satırlar). **Maskeleme koddan
  önce testte:** `lastPurchasePriceCents`/`supplierCode` çıktının serileşmiş hâlinde GEÇEMEZ
  (finans sınırı §6), `error_log.context` gövdesi dökülmez, müşteri kimliği hiçbir araçta yok.
  Yazma aracı YOK — istenirse asistan "onay kuyruğu fazı henüz yazılmadı" der (talimatta) —
  touches: `apps/backend/src/mcp/**`, `apps/backend/src/http/request-log.ts`,
  `apps/backend/src/index.ts`, `packages/observability/src/capture.ts` (SOURCES.mcp)
  - *Bitti:* backend tip denetimi + eslint temiz; 6/6 test yeşil (kapının üç hâli + üç aracın
    şekli/maskeleme sözleşmesi); canlı duman 09.08: `tools/list` üç aracı döndü, yanlış anahtar
    401, `morning_briefing` gerçek veriyle cevapladı (geçici port 8788, süreç temiz kapatıldı).
    Bağlanma: `claude mcp add lezzet-asistan --transport http http://localhost:8787/mcp --header
    "Authorization: Bearer <anahtar>"` — anahtar `MCP_CONNECTION_KEY` olarak
    **`apps/backend/.env.local`**'a yazılır (backend `src/env.ts` bu dosyayı okur; şablon
    `.env.example`, üretme `openssl rand -hex 32`), backend `pnpm --filter @lezzet/backend dev`
    ile ayakta olmalı.
  - **Yan bulgu — BACKEND PORTU rastgeleye düşüyordu (ölçüldü ve düzeltildi 09.08):** bağlanmayı
    denerken çıktı; `apps/backend/.env.local`'da `BACKEND_PORT=` **tanımlı ama boş**tu ve kod
    `Number(process.env.BACKEND_PORT ?? 8787)` yazıyordu. Boş dizgi nullish DEĞİL → `??` yakalamaz
    → `Number('')` = 0 → port 0 "işletim sistemi rastgele port versin" demek. Süreç sağlıklı
    kalkıyor, log'a doğru portu yazıyor, ama her başlatmada BAŞKA port (ölçülen: 60800) ve 8787'yi
    bekleyen hiçbir istemci bağlanamıyor — MCP'siz de var olan sessiz bir arıza. Düzeltme
    `|| 8787` (boş değer = tanımsız değer; ikisinde de varsayılan geçer), künye `index.ts`'te.
  - **Durum (09.08):** çağrı izi şimdilik `logger.info` (araç adı + süre; argüman yazılmaz) —
    `mcp_call_log` tablosu üretim turunun işi (§8). Brifing, canlı DB'de o an duran test-fikstürü
    depoyu da listeler (`T-…` kodlu); bu bir süzme eksiği DEĞİL, bilinçli: ekran/araç veriyi
    düzeltmez, gösterir — çöp `pnpm test:purge` ile temizlenir, araçtan gizlenmez.

- [x] (22.2) **Faz A tamamlandı — araç kataloğu üçten SEKİZE** *(kullanıcı isteği 09.08:
  "araçların geliştirilmesi gerekiyor")*: `catalog_health` (kaç ürün · aday · eksik beyanlı +
  hangi ürünün NEYİ eksik — ölçüt motorun `missingDeclarations` sözlüğünden, araç kendi ölçütünü
  uydurmaz + vitrin işaretleri) · `stock_watch` (N gün içinde ömrü dolan partiler, depo koduyla;
  DLC/DDM ayrımı korunur — geçen DLC imha, yaklaşan DDM teklif) · `sold_out_watch` (vitrinde
  duran ama hiçbir depoda kalmamış varyantlar) · `demand_signals` (**kullanıcının istediği iki
  gündem kaleminin ham verisi**: kapsanmayan posta kodu talebi → rota önerisi · sonuçsuz aramalar
  + ürün-ilgi → paket/ürün önerisi) · `customer_pulse` (talep + moderasyon + cevap bekleyen
  konuşma — YALNIZ SAYIM; MCP'nin mesajlaşmadaki rolü gözlemdir, kullanıcı kararı 09.08).
  Dağıtım zincirli koşuldan sözlüğe (`HANDLERS`) geçti; talimat gündem/gıda-güvenliği/rol
  sınırlarıyla genişledi — touches: `apps/backend/src/mcp/**`
  - *Bitti:* 13/13 test (yenileri: beyan ölçütü motordan mı · parti satırında alış fiyatı YOK ·
    nabız yalnız sayı mı · **araç tanımı ↔ uygulama eşliği**) · tsc + eslint temiz · canlı
    doğrulama: `tools/list` sekiz araç; katalog 129 ürün/25 eksik beyan; stok 2 geçmiş (biri DLC)
    + 5 yaklaşan; talep panosunda 67500 kodu 47 kez sorulmuş (kapsanmıyor) — asistan artık gerçek
    bir haftalık gündem kurabiliyor.

- [~] (22.3) **Faz B — onay kuyruğu: asistan YAZABİLİR, uygulayamaz** *(kullanıcı kararı 09.08;
  tablo `0042` canlıda)*: `assistant_proposal` + `AssistantProposalService` + payload şemaları +
  **uygulayıcı kaydı** (`packages/application/src/assistant/apply.ts`) + **yedi öneri tipi** +
  yedi `propose_*` aracı + `list_proposals` + süre süpürme cron'u (saatte bir) + onay ekranının
  tasarım brief'i — touches: `supabase/migrations/0042_*`, `packages/types/src/entities/
  assistant-proposal.schema.ts`, `packages/database/src/services/assistant-proposal.service.ts`,
  `packages/application/src/assistant/`, `apps/backend/src/mcp/`, `apps/backend/src/jobs/`
  - **Kapsam TASARIMA göre belirlendi (kullanıcı kararı 09.08).** İlk üç tip "en kolay
    yazılabilen"e göre seçilmişti (vitrin · tedarik · paket); Claude Design'ın çizdiği beşli ise
    kullanıcının gerçek iş listesiydi (faturadan stok girişi · para girişi · ürün tamamlama ·
    bölge önerisi). **Uyuşmazlığın kaynağı benim brief'imdi**: dokuz tipi listeledim ama "bugün
    uygulanabilir olanlar" ayrımını yazmadım. Değer kolaylığı yendi — dört tip eklendi, tasarım
    yeniden istenmedi. Sözleşme: `docs/talep/operasyon-asistan-kuyrugu-veri-sozlesmesi.md`.
  - **Güvenlik ŞEMAYLA kuruldu, prompt'la değil** (petit "fiziksel engel" ilkesi):
    `product_draft` payload'ında **alerjen ve saklama alanı YOK** — asistan onları teknik olarak
    yazamaz (gıdada makul görünen bir alerjen satırı en pahalı hatadır). `money_movement` tip
    kümesinde `order_payment`/`order_refund` YOK — sipariş bakiyesi iki yerden değişemez.
    `stock_intake` aracı SKT'siz kalemi reddeder (uydurulmuş tarih raftaki gerçeği yanlış gösterir).
  - **Uygulama sırası ŞEMANIN kısıtından geliyor:** `claimForApply` → gerçek iş →
    `markApplied`/`markFailed`. Testin ilk hâli kilidi atlıyordu ve `assistant_proposal_decided_status`
    reddetti — "iki kez uygulanamaz" güvencesi kodda değil VERİDE.
  - **Uygulayıcılar mevcut servis kapılarını çağırır** (kuyruk ikinci yazma yolu açmaz): `setFeatured` ·
    `PurchaseOrderService.createDraft` (adetler MOTORDAN) · `BundleService.create` (mutabakat motorda) ·
    `StockIntakeService.receive` (RPC bölünmezliği) · `MoneyMovementService` · `DeliveryZoneService.
    replacePostalCodes` (önce okur, üstüne ekler — "ekle" sessizce "değiştir" olmasın) ·
    `ProductService.updateDetails`. Bölge bildirimi uygulayıcıdan GİTMEZ: `zone_available` cron'u
    zaten kapsanmış-ve-haberi-gitmemiş bekleyişleri arar.
  - *Bitti (kısmi):* 21/21 test · tsc + eslint temiz · canlı: 15 araç; `propose_zone_extend`
    gerçek talep panosundan öneri kurdu ve *"haber bekleyen 3 müşteriye bildirim gider — GERİ
    ALINAMAZ"* uyarısını üretti. `purgeTestData` yeni hedef `assistantProposalIds`.
  - **PANEL YAZILDI (operasyon şeridi, 09.08)** — `/operations/assistant`: üç sekme (bekleyen ·
    süresi geçti · karar geçmişi) + kuyruk + her tipte aynı karar çerçevesi + **yedi önizleme**
    (çizimin beşi + sözleşmenin tarif ettiği vitrin/tedarik) + üç karar penceresi + ray girişi.
    Okuma kapısı ve iki action denetimden geldi (`a76a71a`), ekran tek satırla bağlandı — fikstür
    aynı turda silindi. touches: `apps/web/app/(operations)/operations/assistant/**`,
    `components/operation/ui/{ops-nav,icons,format}.ts*`
    - **Ekran `payload`ın içine girip kendi hesabını yapmıyor:** rozet metni, etki cümlesi, hedef
      tablolar, tutar ve tazelik kapıdan hazır geliyor. Ekranın kendi kararı yalnız SUNUM (anlam
      rengi, durum cümlesi) — sözleşmenin istediği ayrım bu.
    - **Çizimden dört bilinçli sapma** (gerekçeleriyle `design/BACKLOG.md`): "ayrı ayrı alınsa"
      karşılaştırması · ürün tablosundaki alerjen/saklama satırları · yakın-SKT vurgusu · doğan
      kayda köprü düğmesi. Dördü de aynı sebeple: **ölçülemeyen ya da payload'da olmayan veri**.
    - *Doğrulandı:* `pnpm ui:shot /operations/assistant` — yedi tipin tamamı, üç sekme, açık+koyu
      tema (geçici örnek öneriler yerel DB'ye yazıldı, çekimden sonra silindi).
    - **Sekmeler ORTAK BAŞLIĞIN İÇİNDE** (kullanıcı düzeltmesi 09.08): bir tur `ui/tabs` ile
      başlığın altına ayrı bir bant olarak yazılmıştı, çizim ise başlık barının içinde gri rayın
      üstünde kayan bir hap veriyor. Sapmanın bedeli de vardı — iki sütun ekranı dolduruyor, bant
      o yüksekliği karar çerçevesinden çalıyordu. `components/operation/ui/segmented-nav.tsx`.
    - **Karar çubuğu MODA göre üç hâlde (22.5 A maddesi, aynı turda):** `handoff` tiplerinde
      "Uygula" YOK, yerinde hedef ekrana köprü ("Rota ekranında aç →"); `draft_then_edit`te
      uygulama kalır ve uygulanmış satırda listeye köprü çıkar; `apply` eski davranış. Mod ve adres
      SUNUCUDA türetilir — `KIND_META`/`modeOf`u istemciden çağırmak `node:crypto`'yu tarayıcı
      paketine sokup sayfayı 500'e düşürüyor (ölçüldü).
    - **On tipin onunda önizleme var:** `batch_offer` (eski→yeni fiyat + oran + parti künyesi),
      `discount_draft` (kural tek cümlede), `recipe_draft` (üç dil doluluğu + malzeme tablosu)
      bu turda eklendi. Şemasız tip kalmadığı için eski "bu tip uygulanamıyor" cümlesi de kalktı —
      o cümle üç tip eklendiği an yalan olmuştu.
    - **ROTA EKRANI DEVRE BAĞLANDI (22.5 B, ilk hedef):** `deliveries?tab=routes&proposal=<id>`
      öneriyi okuyup rotayı açıyor, kodları ÖN SEÇİLİ getiriyor ve mor bir künye ile *"asistan
      önerisinden"* diyor. Kodlar **üstüne eklenir, yerine geçmez** (`zone_extend` bir ekleme
      önerisidir; değiştirmek operatörün haberi olmadan rotadan kod düşürürdü).
      **Bildirim sayısı CANLI:** kod çıkarınca "şu seçimle N müşteriye bildirim gider" sayısı da
      düşüyor — kullanıcının derdinin kalbi buydu (*"hepsine birden gidiyor, ben belki bir bölgeyi
      istiyorum"*). Kaydetme `withProposal` içinde koşuyor: satır `claimForApply` → iş →
      `markApplied`; `proposalId` yoksa elle kurulum yolu hiç değişmiyor.
      touches: `deliveries/{page,routes-client,routes.desktop,routes-actions}.tsx`, yeni
      `deliveries/routes-handoff.ts`
    - **MAL KABUL ve PARA da bağlandı (22.5 B tamam):** üç devir hedefinin üçü de `?proposal=`
      okuyor. touches: `receiving/{page,receiving-client,receiving.desktop,receiving-actions}.tsx`
      + yeni `receiving-handoff.ts`; `finance/{page,finance-client,finance.desktop,movement-dialog,
      actions}.tsx` + yeni `finance-handoff.ts`
      - **Mal kabulde ADET ön doldurulmuyor** — ekranın kendi kuralı (*"beklenen adedi 'gelen'
        hanesine yazmak, depocuya saymadan onaylamayı teklif etmektir"*) burada daha da geçerli:
        sayıyı bir modelin okuduğu fatura söylüyor. SKT ve lot ise sayım değil ETİKETTEN KOPYA,
        onlar dolu gelir. Denetimin talebi "adet de yazılsın" diyordu; bilerek sapıldı.
      - **Fatura maliyeti kaybolmuyor ama ekrana da inmiyor:** `stock_intake` payload'ı birim alış
        fiyatı taşıyor, depo ekranının tipi taşıyamıyor (rol duvarı). Maliyet SUNUCUDA payload'dan
        alınıp `receivePurchase` yoluna ekleniyor; istemci onu hiç görmüyor. Künye operatöre
        "gideri ayrıca elle yazmayın" diyor.
      - **Parada ~~beş~~ dört tipin üçü bu ekrandan geçer:** `transfer` kendi kapısından geçer (iki
        hesap ister), formu AÇILMIYOR; künye hangi yoldan gidileceğini söylüyor. ~~`purchase` elle
        yazılamaz~~ — bulgu denetime bildirildi ve kabul edildi: motor bağsız alımı reddettiği için
        asistan **uygulanması imkânsız** bir dilekçe kurabiliyordu; daraltma şemaya taşındı
        (`MoneyMovementPayload.type` artık `expense · transfer · capital · misc`) ve ekranın o dalı
        gereksiz kalıp silindi.
      - **`invalid` sonucunda kuyruk satırı artık YANLIŞ damgalanmıyor:** motorun reddi
        `withProposal` içinde FIRLATILIYOR, yoksa hiçbir şey yazılmadan satır "uygulandı" olurdu.

    - **DÖRDÜNCÜ devir hedefi + iki payload alanı ekrana bağlandı (22.5 tamam · dördüncü tur).**
      touches: `stock/{page,stock-client,stock.desktop,stock-types}.tsx` + yeni `stock-handoff.ts`,
      `components/operation/stock/offer-dialog.tsx`, `lib/stock/offer-actions.ts`,
      `assistant/{assistant-preview,assistant-labels,assistant-url}.ts(x)`, yeni
      `components/operation/ui/handoff-note.tsx`, yeni `lib/catalog/featured-slots.ts`
      - **Fırsat devri (`batch_offer` → `stock?tab=attention&proposal=`):** teklif diyaloğu ön dolu
        AÇILIYOR; fiyat önerininki, ama kilitli değil ve üç yüzü (tutar · indirim · marj) yanında
        duruyor. Adres "yaklaşan tarihli" sekmesine gidiyor, varsayılan seviye tablosuna değil —
        devredilen parti orada listelenmiyor olurdu.
      - **Künye DİYALOĞUN İÇİNDE, sayfada değil — ve bu bir KUSUR DÜZELTMESİ:** pencere öneriden
        gelindiğinde kendiliğinden açılıp örtüsüyle sayfayı kaplıyor, yani arkadaki künyeyi operatör
        ancak kararı verdikten SONRA görürdü. Aynı kusur para ekranında da vardı (üçüncü turda
        yazılmıştı), o da düzeltildi. Sayfada kalan tek hâl **açılamayan** devir.
      - **Devredilen parti listede yoksa SESSİZ GEÇİLMİYOR:** amber künye sebebini sayıyor (satıldı ·
        imha edildi · depo kapsamı dışında) ve teklifin açılamayacağını söylüyor. `data.attention`
        sayfalanmadığı için "listede yok" gerçekten yok demek, "bu sayfada yok" değil.
      - **Teklifi KAPATMAK öneriyi uygulamak sayılmaz:** `null` fiyat kuyruğa hiç dokunmuyor. Tersini
        yapan bir kaydı onay diye damgalamak, kuyruğun söyleyebileceği en kötü yalanlardan olurdu.
      - **`product_draft` önizlemesi artık ESKİ/YENİ gösteriyor** (`currentFields`): dolu alan varsa
        amber "üzerine yazılacak" uyarısı adıyla; `currentFields` hiç yoksa "eski hâl okunamadı" denir
        ve varsayılmaz. Alan kümesi 22.6 ile büyüdüğü için tablo üç şekli birden indirger (çok dilli
        metin · besin künyesi · alerjen listesi). `remainingGaps` ve `uncertainFields` de çiziliyor.
      - **`featured_flag` önizlemesinde ızgara doluluğu:** *"vitrinde şu an 6 kategori var, ızgarada 6
        yer görünüyor — ızgara dolu"*. Sayı gelmediyse satır HİÇ çizilmiyor: "0 kayıt vitrinde" demek
        ölçülemeyen değeri sıfıra düşürmek olurdu (`CLAUDE §1`).
      - **Üç duplikasyon kapatıldı:** devir künyesi dört ekranda tekrarlanacaktı → `HandoffNote`;
        vitrin slot sayısı iki sekmede ayrı ayrı yazılıydı → `lib/catalog/featured-slots`; eksik beyan
        etiketleri ürün önizlemesinde gömülüydü → `DECLARATION_GAP_LABELS` (`@lezzet/types`).
      - Doğrulandı (`ui:shot`, açık + koyu tema): fırsat devri diyaloğu gerçek bir partiyle
        (1,61 € · %30 · %39,1 marj), ürün taslağının fark tablosu ve üç uyarısı, vitrin sayacının
        "ızgara dolu" hâli. `product_create` (22.6) bilerek "önizlemesi henüz yok" dalında —
        istenen şey fark tablosu değil bir İNCELEME ekranı ve tasarım turunu bekliyor.

  - **Harici MCP denetimi · tur 2 (09.08)** — dış bir ajan 18 aracın tamamını bozuk veriyle
    yokladı; iki bulgunun ikisi de karşılandı, biri ölçünce başka çıktı:
    - **Kimlik biçimi artık veritabanına gitmeden süzülüyor** (`isUuid`). Bulgunun gerekçesi
      "boşa sorgu + Postgres'in İngilizce cümlesi"ydi; ölçünce daha ağırı çıktı: `listByIds` TEK
      bozuk kimlikle komple patlıyor, yani **toplu hata dönüşünün kendisi çöküyordu** — öteki dört
      satırın sorunu hiç ölçülemeden istisna dönüyordu. Doğrulandı: bir bozuk + bir eksik kimlikle
      artık beş sorun tek turda listeleniyor.
    - **"(silinmiş ürün)" satırları LİSTEDEN sayaca** (`unresolvedProductSignals`): adsız satır
      modele bir şey söylemez, yalnız bağlam yer. Gizlenmiyor, sayılıyor.
    - **Rapordaki "canlı veri" aslında test artığıydı** — üç satırın üçü de
      `analytics.test.ts`'in damgalı sahte kimlikleri (`…-8001-…`), 08.08'in kesilen koşularından
      kalma. Kök sebep kodun değil TEARDOWN'un: temizlik sınamanın son satırındaydı, yani testin
      GEÇMESİNE bağlıydı. `afterAll`'a alındı (`analytics_daily_product`'ın ürüne FK'si yok —
      bilinçli, ölçüm ürünle birlikte kaybolmasın diye; o yüzden hiçbir cascade onu toplamıyor).
      Öksüz satırlar temizlendi.

- [ ] (22.4) **Üretim turu — Faz 1 bitince AÇILIR:** ikili anahtar tablosu + Ayarlar paneli ·
  oran sınırı · `mcp_call_log` · OAuth (`well-known`, claude.ai connector — canlıya çıkış 18'e
  bağlı) · onay kuyruğu `assistant_proposal` + operasyon paneli (tasarım ısmarlaması burada) ·
  araç fazları B1/B2 · oturum anahtarı (1 saat + kapsam). Ayrıntı ve sıra `AI_ADMIN_ASSISTANT
  §4-7`; bu satır Faz 1 kapanışında gerçek görevlere bölünür.

- [~] (22.5) **Kuyruk ÜÇ KAPILI karara geçiyor + kimlik köprüsü + parti teklifi** *(kullanıcı kararı
  09.08; harici denetim turu 3)* — touches: `packages/application/src/assistant/`,
  `apps/web/lib/assistant/handoff.ts`, `apps/backend/src/mcp/`, `packages/types/src/entities/
  assistant-proposal.schema.ts`, `supabase/migrations/0042_*`
  - **Tek kapı gerçek kullanımda çöktü.** Kullanıcı dolu kuyruğu ilk kez elden geçirdi: *"bölgeye
    hangi posta kodlarının gireceğine haritaya bakmadan karar veremem; bildirim hepsine birden
    gidiyor, ben belki bir bölgeyi istiyorum"* · *"paketten bazı şeyleri çıkarabilmeliyim,
    fiyatlarını değiştirebilmeliyim"*. Karar düzenlemeden verilemiyor.
  - **Çözüm: tipe göre DEĞİL, kararın cinsine göre üç kapı** (`modeOf(kind)`). `apply` (vitrin ·
    fırsat: payload tek değer, düzenlenecek şey yok) · `draft_then_edit` (paket · indirim · tarif ·
    ürün · tedarik: pasif kayıt doğar, ince ayar kendi ekranında — kuyruğun işi köprü) · `handoff`
    (bölge · stok girişi · para: geri alınamaz, ilgili ekran ÖN DOLDURULUR, kayıt oradan ve normal
    akışla olur). **Kuyruğa on form yazılmıyor** — kullanıcının ikinci şartı buydu ve ihtiyaç
    duyulan editörler zaten yazılı (`postal-code-picker` + rota haritası 19.20, paket/indirim/tarif
    ekranları). Sıra tek yerde: `withProposal()` (`claimForApply` → iş → `markApplied`).
  - **Araç kataloğu 18 → 20.** `catalog_lookup` okuma ile yazma arasındaki **kimlik köprüsü**
    (ad → `variantId` + liste fiyatı + son alış maliyeti); `stock_watch` artık `batchId`/`variantId`,
    fiyat/maliyet/KDV oranı, motorun kararı (`offerDecisionOf`) ve önerdiği teklif fiyatını taşıyor.
    Boşluk denetimin turu 3'ünde ölçüldü: asistan SKT'si yaklaşan malı görüyor ama hiçbir yazma
    aracına besleyemiyordu (*"paket kuramadım, variantId'leri bilmiyorum"*).
  - **`batch_offer` — onuncu öneri tipi ve İLK KEZ satış fiyatına dokunan yetki** (kullanıcı kararı
    09.08, sınırsız: tavan yok, tek güvence onay). Denetim "indirime ürün kapsamı ekleyin" demişti;
    teşhis doğruydu (koleksiyon indirimi taze partiyi de ucuzlatıyor) ama çözüm yanlıştı — indirim
    ürünün TAMAMINI kapsar, oysa ucuzlaması gereken **o parti**. `stock.offer_price` bunun için
    zaten var. DLC'si geçmiş partiyi motor reddediyor (satılamaz, tek yol imha).
  - **Fiyat okuması liste + ALIŞ MALİYETİ** (kullanıcı kararı 09.08): maliyet bugüne kadar
    asistanın bağlamı dışındaydı; kârlılık hesabı yapabilmesi için açıldı. Maliyet KDV hariç, liste
    KDV dahil — oran da satırda, ki hesap doğru yapılsın. Bilinmeyen maliyet `null`, sıfır DEĞİL.
  - **ON TİPİN TAMAMI TARANDI (kullanıcı isteği 09.08: "diğerlerinde de benzer durumlar var mı?").**
    Bölgeyi bulduğumuz yöntem — payload'ı KARAR İHTİYACIYLA karşılaştırmak — hepsine uygulandı.
    `draft_then_edit` beşlisinin beşinin de hedef editörü gerçekten var (ölçüldü: paket
    `bundle-items-editor` · indirim `saveDiscountAction` · tarif `recipe-dialog` · ürün katalog ·
    tedarik `updateDraftLineAction`), yani ölü doğan kayıt yok. Üç şey çıktı:
    - **`batch_offer` yanlış kapıdaydı → `handoff`.** "Tek sayı" diye `apply` demiştim; oysa teklif
      fiyatının ÜÇ YÜZÜ var (tutar · indirim · marj) ve `offer-dialog` üçünü birlikte gösteriyor.
      Kuyrukta tek sayı onaylamak **marjı görmeden fiyat onaylamaktır** — zararına satışı fark
      etmenin tek yeri o diyalog.
    - **`product_draft` ÜZERİNE YAZIYOR ve ekran bunu söyleyemiyordu.** `updateDetails` düz bir
      `update`, sürüm tutmuyor: dolu bir açıklama onaylandığı an kayboluyor. Önizleme "boş alanlara
      yazılanlar" diyordu ama karşılaştıracak eski değeri hiç almıyordu — vaadi doğrulanmamış bir
      varsayımdı. Payload artık `currentFields` taşıyor; kayıp GÖRÜLEREK onaylanır.
    - **`featured_flag` bağlamsızdı:** vitrin liste değil SEÇKİ, doluysa eklenen ötekini iter.
      Payload artık `currentlyFeaturedCount` taşıyor.
  - **Devir kapısı SUNUCUDA, ekranın iyi niyetinde değil:** `applyProposalAction` `handoff`
    modundaki tipi hiç tüketmez — `{ status: 'handoff', target }` döner, öneri `pending` kalır.
    Gerekçe geçiş penceresinden büyük: ekran düğmeyi gizlemeyi unutsa ya da eski bir sekme açık
    kalsa, geri alınamaz bir eylem (bildirim · stok · defter · satış fiyatı) düzenlenmeden koşardı.
  - **İki payload kümesi DARALDI (operasyon şeridinin iki sorusu, 09.08).** İkisi de aynı kusurun
    iki yüzü: **asistan uygulanması imkânsız bir öneri kurabiliyordu.** ① `money_movement.type`
    kümesinden `purchase` çıktı — stok alımı mal kabule bağlı ve motor bağsız satırı
    `supply_link_missing` ile zaten reddediyor. ② `zone_extend.country` serbest iki harften
    `CountryEnum`a indi; daraltmayı EKRAN yapıyordu, tanınmayan ülkede ön dolgu yapılamayıp öneri
    sessizce yarım açılıyordu. Kuyruğun en sinsi çürüme yolu budur: reddedilmeyi bekleyen kalemler
    patronun onay refleksini köreltir.
  - ~~**BEKLEYEN(22.5):** ekran tarafı operasyon şeridinde~~ **KAPANDI (09.08, dördüncü tur):** dört
    devir hedefinin dördü de bağlı, iki yeni payload alanı da önizlemede
    (`docs/talep/operasyon-asistan-kuyrugu-uc-kapili-karar.md` cevabı; ayrıntı 22.3'ün Durum
    notunda). Kalan tek boşluk 22.6'nın kendi ekranı.

- [x] (22.6) **Belgeden ürün — ambalaj fotoğrafından ürün açma ve tamamlama** *(kullanıcı senaryosu
  09.08: "içindekiler fotoğrafını çekip yükleyeceğim, asistan bazen ürünü oluşturacak bazen
  bilgilerini güncelleyecek")*: yeni `product_create` tipi + `product_draft`ın beş çok dilli alana
  ve beyan alanlarına genişlemesi + ham kaynak metin ve güven işareti alanları + onay ekranı —
  touches: `packages/types/src/entities/assistant-proposal.schema.ts`,
  `packages/application/src/assistant/apply.ts`, `apps/backend/src/mcp/`, `design/pages/`
  - **GIDA DUVARI YER DEĞİŞTİRDİ: şemadan EKRANA (kullanıcı kararı 09.08).** 22.3'te duvar
    şemadaydı — alerjen/saklama alanı payload'da yoktu, "fiziksel engel". Bu senaryoda o duvar
    işlevsiz: ambalajın fotoğrafını PATRON veriyorsa alerjen bilgisi uydurma değil **belgeden
    okuma**, ve fatura senaryosunda (`§6` write-only nüansı) aynı karar zaten verilmişti. Kullanıcı
    yeni duvarı adıyla koydu: *"en net duvarımız onay ekranımız… insanın gözüne problemler
    hızlıca batabilsin."*
  - **Ekranın cevaplayacağı soru ötekilerden FARKLI — ve ilk yazımda YANLIŞ kurdum.** Brief'i
    "bu veri ambalajla uyuşuyor mu" ekseninde yazmıştım; kullanıcı düzeltti: *"resim benim elimde,
    ürün benim elimde, yükleyen benim, onaylayan da benim."* Kaynağı doğrulatmak boş yük — soru
    **"sisteme ne yazılıyor ve neyi eksik bırakıyor?"**. Yani doğrulama değil **inceleme** ekranı:
    işi eksik ve tuhaf olanı öne çıkarmak, doğru olanı sessizce geçmek.
  - **Üç görsel gereklilik** (brief `design/pages/admin-asistan-kuyrugu.md §5b`): ① **TAMLIK** —
    "onaylarsan kayıt tam olur" ya da "şu alanlar eksik kalacak", eksikler adıyla (sistem bunu
    `is_incomplete` ile zaten hesaplıyor) ② **on dört alerjenin tamamı**, işaretlenmeyenler de
    görünür — en tehlikeli hata fazladan değil EKSİK alerjendir ve yalnız seçilenleri gösteren
    liste tam da onu gizler ③ **asistanın emin olmadığı alanlar** göze batmalı: patron ürünü zaten
    biliyor, ona "şuraya bak" demek bütün alanları okutmaktan değerli.
  - **Emniyet veri modelinden geliyor ve korunuyor:** beyan tamlığı (`is_incomplete`, üretilmiş
    kolon) ile satış durumu (`status`) ayrı eksenler. Asistan birinciyi doldurabilir, **ikincisi
    hiçbir yoldan açılmaz** — ürün `candidate` doğar. En kötü hâlde yanlış okunmuş bir alerjen
    vitrine düşmez.
  - **Kapsam dışı:** fiyat · stok · ürün görseli (medya ayrı yetki sınıfı, `§7 Faz C`).
  - *Kod tarafı BİTTİ (09.08) — araç kataloğu 20 → 21:*
    - `product_create` tipi (enum + payload + uygulayıcı + araç). Ürün **`candidate`** doğar;
      `status` payload'da yok, uygulayıcı elle yazıyor. Kategori ADLA çözülür (model uuid
      ezberlemez), bulunamazsa mevcutlar listelenir. En az bir varyant — varyantsız ürün satılamaz.
    - `product_draft` beş çok dilli alana + beyan alanlarına genişledi; `fields` ↔ `currentFields`
      **simetrik** (ekran alan alan yan yana koyabilsin diye).
    - **Alerjen kapalı küme ve sessiz atlama YOK:** tanınmayan değer reddediliyor, mevcut küme
      cevaba yazılıyor. Canlı doğrulandı — *"süt içerebilir"* girişimi
      `allergens: tanınmayan değer` ile döndü. Gıdada sessiz atlama, eksik alerjenin ta kendisidir.
    - **Tamlık MOTORDAN:** `missingDeclarations` → payload `remainingGaps`; etki cümlesi ondan
      kuruluyor (*"onaylansa bile şu beyanlar eksik kalır: üç dilde ad · besin künyesi · saklama"*).
      Canlı: eksik beyanlı bir öneride motor `lang · nutrition · storage` saydı.
    - **Payload GİDİŞ-DÖNÜŞÜ teste bağlandı:** jsonb'ye yazılırken anahtar biçimi dönüşüyor; dönüş
      yolunda geri çevrilmezse `remainingGaps` okunamaz ve **tamlık cümlesi sessizce yanlış olur**
      (eksik beyanlı ürün "tam olacak" görünür). Sessiz olduğu için fark edilmezdi.
    - `uncertainFields` — modelin "net okuyamadım" dediği alanlar; talimat da buna göre yazıldı:
      *"tahmin etmek yerine uncertainFields'e yaz"*.
  - **Harici denetim · tur 4 (09.08) — 4/4 boşluk kapandı, ama asıl bulgu raporun içinde SAKLIYDI.**
    Ajan kârlılık analizini övüyor ve örnek veriyor: *"Liste 2,40 € · Alış 2,80 € — bu parti
    zararlı!"*; ardından zararına bir paket önerisi kurup "makul strateji" diye gerekçelendiriyor.
    Araç doğru çalıştı, model doğru okudu — **veri yalan söyledi.** Ölçtüm: **159 varyanttan 31'i
    zararına** görünüyor (en kötü birim marj −2,07 €). Kök sebep `scripts/seed/stock.ts:125` —
    alış fiyatı sabit bir formülden üretiliyor, varyantın liste fiyatına hiç bakmıyor. **Sınıfı bu
    depoda daha önce yaşandı** (05.14: seed teklif fiyatını sabit yazıyordu, "indirim" ürünü
    pahalılaştırıyor ve fırsat bandı boş kalıyordu). Maliyet okuması asistana açılana kadar sessiz
    bir gürültüydü; artık yanlış öneri üreten bir girdi. Talep:
    `docs/talep/arka-uc-seed-alis-fiyati-listeden-bagimsiz.md`.
  - ~~**BEKLEYEN(22.6):** ekran tarafı~~ **YAZILDI (09.08, operasyon şeridi)** — brief
    `design/pages/admin-asistan-kuyrugu.md §5b`, tasarımsız, mevcut yapı taşlarıyla. touches:
    `apps/web/app/(operations)/operations/assistant/assistant-preview.tsx`,
    `packages/types/src/entities/product.schema.ts`
    - **İki önizleme de aynı gövdeyi paylaşıyor** (`DeclarationBlocks` · `GapNotice`): ikisi de aynı
      soruya cevap veriyor — *"sisteme ne yazılıyor, neyi eksik bırakıyor?"*. Fark kimlikte: yeni
      kayıt kategori · tarih tipi · raf ömrü · KDV · boyları da getiriyor, karşılaştıracak "bugünkü
      hâl"i ise yok.
    - **① Alanlar** üç dil yan yana; tamamlamada "Bugün ↔ Yazılacak", yeni üründe tek sütun.
    - **② TAMLIK** `remainingGaps`ten, eksikler ADIYLA. Eksik yoksa cümle KUTU DEĞİL düz satır:
      "onaylarsanız eksik kalmıyor" bir uyarı değil bir teyittir, kutuda riskle aynı ağırlıkta
      okunurdu.
    - **③ ON DÖRT ALERJENİN TAMAMI**, işaretsizler sönük ama OKUNUR ve üstü çizili değil — üstünü
      çizmek "yok" iddiası olurdu, oysa söylenen "asistan işaretlemedi". Başlık sayıyla:
      "3 işaretli" / "hiçbiri işaretlenmedi". İz listesi aynı kuralla.
    - **④ Besin künyesi** 100 g başına; enerji TEK satır (kJ · kcal aynı büyüklüğün iki birimi).
      Ondalık **ancak varsa** — sabit basamak iki yönde de yanlış: `0` "16,4 g yağ"ı 16'ya yuvarlar,
      `1` enerjiyi "1.650,0 kJ" diye yazıp olmayan bir hassasiyet iddia eder. Tutarsızlık ölçülüyor:
      makro toplamı 100 g'ı aşarsa kırmızı ("bu değerlerden biri yanlış okunmuş"). **"Sıfır enerji"
      İŞARETLENMİYOR** — bir içecekte meşrudur ve her makul değeri uyarıya çevirmek uyarıyı
      değersizleştirir.
    - **⑤ Emin olunmayan alanlar** kırmızı kutuda, adlarıyla. **⑥ Üzerine yazma** yalnız eski hâli
      DOLU olan alanlarda; alerjen ve besin künyesi tabloda değil ama uyarı onları da sayıyor.
    - **⑦ Emniyet bir RAHATLAMA olarak yazıldı**, uyarı olarak değil: ürün aday doğar, satışa
      çıkarmak bu ekranın işi değil, fiyat/stok/görsel öneriye dahil değil.
    - **Ölçüldü** (`ui:shot`, açık + koyu): gerçek bir tamamlama önerisinde fark tablosu + 14'lü
      ızgara + künye; yeni üründe kimlik künyesi. **Üç kusur ölçümde çıktı:**
      ① KDV tam sayıya yuvarlanıp %5,5 yerine "%6" yazıyordu; ② sonra canlı bir öneride **%550**
      çıktı — `vatRate`ı kesir sanıp 100 ile çarpmıştım, oysa `product.vat_rate` veride YÜZDE
      duruyor (`5.50`) ve motor da öyle okuyor (`removeVat`: `1 + vatRate/100`); ③ besin künyesi
      sütunu sayıyı kesiyordu (`394 kca`) — kesilen bir sayı yanlış bir sayıdır.
    - **Tamlık cümlesi ÖNİZLEMEDE YAZILMIYOR ve bu bilinçli bir geri adım:** bir tur burada da
      "onaylasanız da eksik kalacak" kutusu vardı; ölçünce aynı cümlenin künye kutusunda zaten
      kurulduğu görüldü (`kind-meta.impactFor`). Kendi kopyam silindi — her yerde uyaran ekran
      hiçbir yerde uyarmamış olur. Bedeli: cümle kartın ALTINDA, brief'in istediği gibi en üstte
      değil. Daha görünür istenirse doğru hamle ikinci kopya değil, künye kutusunun yeri.
    - **İki duplikasyon kapandı:** eksik beyan etiketleri (`DECLARATION_GAP_LABELS`) ve besin kalemi
      adları/birimleri (`NUTRITION_LABELS`) `@lezzet/types`e, enum'ların yanına taşındı; ürün
      önizlemesi ile künye formu artık aynı sözlükten okuyor.
    - **Bilerek YAPILMADI:** ambalajın ham metni ekrana serilmiyor (brief: fotoğrafı çeken, yükleyen
      ve onaylayan aynı kişi — kaynağı ona tekrar okutmak boş yük) ve fiyat/stok/görsel için yer
      tutucu bile çizilmedi.

- [~] (22.7) **Asistan KÖR SEÇİYORDU — referans okumaları + sistem modeli** *(kullanıcı sorusu 09.08:
  "hangi depo hangi bölgeye tavsiyede bulunacağı ile ilgili bir yol haritası var mı, mevcut bölgeleri
  ve posta kodlarını veriyor muyuz? … onun sağlıklı analiz yapabilmesi için doğru dataları vermemiz
  gerek")* — touches: `apps/backend/src/mcp/tools-reference.ts`,
  `packages/domain-core/src/delivery/distance.ts`, `apps/backend/src/mcp/server-factory.ts`
  - **Kullanıcı bir örnek buldu, tarama SEKİZ yerde aynı deseni çıkardı.** Öneri araçlarının çoğu
    bir kaydı ADLA/KODLA seçtiriyor (depo · bölge · hesap · kategori · koleksiyon · tedarikçi ·
    vitrin adayı · ayar eşiği) ama o adların listesini okuyabildiği tek yer **hata mesajıydı**:
    *"Bölge bulunamadı. Mevcutlar: …"*. Üstelik tutarsız — bazısı mevcutları sayıyor, bazısı
    saymıyordu. Çalışma yöntemi fiilen **"kör dene, hatadan öğren"**di.
  - **Görünmeyen zarar daha büyüktü: YAPILMAYAN öneriler.** Model hiç denemediği şeyi öneremez;
    *"şu koleksiyonu vitrine çıkaralım"* cümlesi hiç kurulmuyordu, çünkü o koleksiyonun varlığından
    haberi yoktu. Boşluğun ölçülemeyen kısmı buydu.
  - **`delivery_map`** — depolar + bölgeler (**bağlı depo · teslimat günleri · kapsanan kodlar**) +
    kapsanmayan talep kodları ve her biri için **hangi hatta UYDUĞU**.
    - **Ölçüt mesafeden GÜZERGÂHA döndü (kullanıcı düzeltmesi, aynı gün).** İlk yazımda "en yakın
      bölge" vardı; kullanıcı çürüttü: *"araba ana yol üzerinde ilerlerken sağındaki solundaki
      kodlara dağıtım yapabilir, ama ters yöndeki bir noktaya gidip de dağıtım yapamaz."* Mesafe
      yanıltıyordu — hattın 5 km ötesindeki ters yön, hattın üzerindeki 15 km'den pahalıdır.
      Motor artık dört hâl veriyor: `on_route` · `extends_route` · `detour` · `opposite`.
    - Canlı: *67500 → **Schiltigheim'ın uzantısı** (açı 8°, sapma 3 km, perşembe hattı); Illkirch
      **TERS YÖN** (162°)* · *68000 → Illkirch yönünde ama 8 km sapma* · *67600 → Illkirch uzantısı*.
      Eski hâl 67500 için "Schiltigheim ~18 km" diyordu — doğru hattı buluyordu ama **neden**
      doğru olduğunu söyleyemiyor, ters yöndekini de eleyemiyordu.
    - **Yönü ölçülemeyen bölge ELENMİYOR, ayrı kovaya gidiyor** (`zonesWithoutDirection`): merkez
      bölgesinin kodları deponun üstünde durduğu için hattın istikameti yok. İlk ölçümde motor bunu
      fark etmiyor ve *"sapma 0,6 km, açı 2°"* gibi **ikna edici ama uydurma** bir sonuçla o bölgeyi
      birinci sıraya koyuyordu — ikna ediciliği tam da tehlikesiydi. `null` dönüyor, çağıran "yön
      bilinmiyor" diyor (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
  - **`reference_data`** — hesaplar, kategoriler, koleksiyonlar (vitrin işaretiyle), tedarikçiler,
    iş eşikleri. **Ayarlar BEYAZ listeyle**: `settings` tablosunda iş parametreleriyle birlikte
    **`analytics_session_salt`** duruyor (oturum anonimleştirmesinin dayanağı). Kara liste yarın
    eklenen hassas bir ayarı sessizce sızdırırdı; beyaz liste yeni ayarı sessizce göstermez —
    ikinci hata ucuz, birincisi geri alınamaz. Doğrulandı: çıktıda tuz yok.
  - **Mesafe MOTORDA** (`domain-core/delivery/distance`, 5 test): koordinatlar veride zaten vardı
    (`postal_code_place.lat/lng`) ama hesap hiçbir yerde yoktu. Kuş uçuşu bilinçli — aranan şey
    "hangi hat daha yakın" sıralaması, rota servisi değil. **Koordinatsız aday elenir, sıfır
    sayılmaz**: sıfır "aynı yerde" demek olurdu ve hakkında hiçbir şey bilinmeyen kod hep "en yakın"
    çıkardı.
  - **Talimata SİSTEM MODELİ eklendi** — doğru veriyi verip yanlış çerçeveyle okutmak, veriyi hiç
    vermemek kadar zararlı: ① varsayılan depo YOK ② **bölge = dağıtım güzergâhı** (bir depoya bağlı,
    sabit günlerde koşar; bölge genişletmek zaten yola çıkmış bir araca durak eklemektir) ③ fiyatlar
    kanallı — liste b2c ve KDV DAHİL, maliyet HARİÇ ④ üründe beyan tamlığı ile satış durumu ayrı
    eksenler, ikincisi asistanın değil.
  - **Vitrin ADAYLARI açıldı** — `catalog_health.featured` artık iki kova: işaretliler VE **aktif
    ama işaretsiz** kayıtlar. Aynı "yapılmayan öneri" sınıfının en net örneğiydi: asistan bir
    koleksiyonu ancak `propose_featured_flag`ı kör deneyip hata alarak keşfedebiliyordu. Canlı:
    *kategori — vitrinde 4, aday 2 (Dondurma · Anadolu Mutfağı)*.
  - *Bitti:* araç kataloğu **21 → 23** · 26/26 test · tsc + eslint temiz · canlı doğrulandı.
  - **KÂRLILIK KAPISI** (`apps/web/lib/assistant/economics.ts`) — harici denetimin zararına paket
    önerisi (maliyet 6,10 € · fiyat 5,90 €) kuyruğa düştü ve **ekran bunu söylemiyordu**: paket
    önizlemesi kalemleri ve mutabakatı gösteriyor, maliyeti hiç göstermiyordu. `AssistantQueueRow`
    artık `economics` taşıyor (paket: kalem maliyetleri + KDV hariç fiyat + marj · fırsat: alış
    fiyatı = "üçüncü yüz").
    - **KDV tabanı ayrı ve bu şart:** satış fiyatı KDV DAHİL, maliyet HARİÇ. Test bunu kilitliyor —
      dar marjda KDV atlanırsa **aynı veri zararı kâr gösteriyor**. Karışık KDV'li pakette oran
      kalemlerin liste değerine göre ağırlıklı (tek oran varsaymak marjı sessizce kaydırırdı).
    - **Bilinmeyen maliyet `null`, sıfır DEĞİL** — sıfır maliyet "%100 kâr" gösterir ve bu en
      tehlikeli yanlıştır: ikna edicidir. Bir kalemin maliyeti bilinmiyorsa TOPLAM da `null`.
    - **Ayrışma bir uyarıdır:** payload'daki fiyat önerinin dayandığı gerçek, kapıdaki şu anki
      gerçek. Ekran ayrışmayı söyler, sessizce güncelini göstermez (operasyon şeridiyle mutabık).
    - Marj negatifse uyarı ama **yol kapatılmaz**: zararına satmak bir karardır (elde kalıp imha
      edilecek maldan iyidir) ve `offer-dialog` da aynı davranıyor.
    - **EKRANA BAĞLANDI (10.08, operasyon şeridi)** — kapı aynı gün tüketicisini buldu. touches:
      `assistant/{assistant-preview,assistant-sections}.tsx`
      - **Pakette maliyet SÜTUN, kârlılık BLOK:** kalem tablosuna "Alış (KDV hariç)" eklendi ve
        mutabakat rozetinin yanına *"Bu paket ne kazandırıyor"* bloğu kondu — ikisi aynı ağırlıkta,
        çünkü ikisi de "bu paket kurulmalı mı" sorusunun parçası. **Paylar tutuyor olabilir ve paket
        yine zararına olabilir**; bir tur ekran yalnız ilkini söylüyordu.
      - **Maliyet sütunu künye YOKSA hiç çizilmiyor:** boş bir sütun "maliyet sıfır" diye okunurdu ve
        o, kârlılığı görünmez kılmaktan kötü.
      - **Fırsatta "üçüncü yüz" geldi:** tutar ve listeye göre indirim zaten vardı, alışa göre marj
        yoktu — yani devretmeden önce kararın büyüklüğü görünmüyordu. Parti tükenirse toplam etki de
        yazılıyor (`offer-dialog`un kendi cümlesinin aynısı: karar tek adet için değil).
      - **Zarar ROZET DEĞİL CÜMLE:** kırmızı bir rozet operatörü düşünmeden geri adım attırırdı.
        Tutarıyla söyleniyor ve yolun açık olduğu yazılıyor — iki ekran aynı karara iki farklı cevap
        vermemeli.
      - **Liste fiyatı ayrışmışsa ekran SÖYLÜYOR** (payload öneri anındaki, künye şu anki): *"öneri
        şu listeye göre kurulmuştu, şu an bu"*. Sessizce güncelini göstermek, patronun eski gerçeğe
        göre karar verdiğini gizlerdi.
      - Ölçüldü (`ui:shot`, açık + koyu): kârlı paket (1,63 € · %41,2) ve **zararına teklif**
        (0,08 € zarar · %-5,7 · parti toplamı 0,88 € zarar) gerçek fiyat/alış verisiyle.

- [~] (22.8) **Karar KUYRUĞUN İÇİNDE veriliyor — öneri detayına form gövdesi** *(kullanıcı şikâyeti
  10.08: "öneri tiplerinin onaylanması sırasında asistan sayfasından dışarı çıkmam benim açımdan
  büyük problem, çünkü konseptten kopuyorum" · brief: `docs/talep/operasyon-oneri-onayi-formun-icinde.md`)* —
  touches: `packages/application/src/assistant/kind-meta.ts`, `apps/web/lib/assistant/economics.ts`,
  `apps/web/app/(operations)/operations/assistant/**`
  - **Ölçüm şikâyeti doğruladı: 11 tipin 10'u kullanıcıyı ekrandan çıkarıyordu** (6 `draft_then_edit`
    + 4 `handoff`); yalnız vitrin işareti yerinde bitiyordu. İkinci ölçüm daha ağırdı: o tiplerin
    hedeflerinin **zaten formu var** (ürün · paket · indirim · tarif · tedarik · finans diyalogları),
    yani ekran alanları ANLATAN bir tablo yazmıştı — oysa o alanları GÖSTEREN form duruyordu. İki
    gösterim dili bakımı da ikiye böler: forma alan eklendiğinde önizleme bilmez ve öneri ekranı
    sessizce eksik gösterir.
  - **Kararın cinsine dördüncü hâl: `inline`.** Devir (`handoff`) gerçek bir sorunu çözüyordu —
    geri alınamaz etki düzenlenmeden onaylanmamalı — ama bedeli kullanıcının kuyruktan kopmasıydı.
    Yeni hâl ikisini birden karşılıyor: **düzenleme yüzeyi kuyruğa GELİYOR**, karar orada veriliyor.
  - **İkinci yazma yolu yine açılmadı** ve bu ayrım kurgunun kendisi: gövde, hedef ekranın kullandığı
    server action'ın TA KENDİSİNİ çağırıyor (`setOfferPriceAction`) ve o eylem `withProposal` ile
    kuyruk satırını da kapatıyor. Kuyruk hâlâ uygulamıyor; değişen tek şey formun nerede DURDUĞU.
    Genel kapı (`applyProposalAction`) `inline` tipini de reddediyor — buradan uygulansaydı asistanın
    ÖNERDİĞİ ham fiyat yazılırdı, yani operatörün az önce elleriyle değiştirdiği sayı sessizce yok
    sayılarak.
  - **Çerçeve tipi BİLMİYOR:** `kind`'a göre dallanan tek yer gövde kaydı (`assistant-body.tsx`).
    Sözleşme beş parça — şekil doğrulaması · ilk değer · çizim · engel · kaydeden kapı. Taslak
    ÇERÇEVEDE duruyor, gövdede değil: kararı yürüten, hatayı gösteren ve kuyruğu tazeleyen taraf o.
  - **İlk gövde: parti fırsatı** (`bodies/batch-offer-body.tsx`) — en az sürtünmeli tip seçildi,
    en değerli olan değil; amaç deseni çalışır hâlde görmek.
    - **Yeni form YAZILMADI:** ortadaki kontrol `PriceTriple`, yani `offer-dialog`un ve
      müşteriye-özel-fiyat diyaloğunun kullandığı ortak üçlü. Kopyalansaydı bir gün biri KDV'yi
      düşerken öteki unuturdu ve aynı parti iki ekranda iki farklı marj gösterirdi.
    - **Yeni okuma YAZILMADI:** maliyet · liste · KDV oranı `economics` künyesinden (22.7).
      Künyeye eklenen tek alan **`vatRate`** ve gerekçesi düzenlemenin kendisi: `marginCents` öneri
      fiyatına göre hesaplanmış SABİT bir sayı, operatör fiyatı değiştirdiği an bayatlıyor. Orandan
      geriye türetmek kayıplı (1,40 / 1,33 → %5,26 çıkar, gerçeği %5,5) ve o fark doğrudan marja
      yazılırdı. Değer zaten okunuyordu, künyeye taşındı.
    - **Marj GİRİLEN fiyattan hesaplanıyor:** eski sayıyı bırakmak, yeni fiyatın altında eski fiyatın
      kârını yazmak olurdu — kuyruğun yapabileceği en sinsi yalan, çünkü hem doğru görünür hem de
      kararın tam konusudur.
    - **Öneriden sapma KÜNYE olarak yazılıyor** ("5,90 € yerine 5,40 € yazılacak"): asistanın dilekçesi
      değişmiyor, geçmişte olduğu gibi kalıyor — *"asistan ne önerdi, patron ne onayladı"* farkı
      kaybolmamalı.
    - **Onay penceresi açılmıyor:** gövdenin kendisi zaten onay yüzeyi. Modal koymak hem *"dialog
      açılmaz, konteynere gömülür"* kuralının karşısı olurdu hem de aynı kararı iki kez sordururdu.
    - **`assistant-preview.tsx`ten `batch_offer` bloğu SİLİNDİ** (1.281 → 1.170 satır): iki gösterim
      birden kalsaydı aynı fiyat iki yerde iki farklı hâlde okunurdu.
    - **Karar verilmiş öneride AYNI gövde, okunur hâlde** (`readOnly`): arşive ayrı bir "özet"
      bileşeni yazmak duplikasyonun kendisiydi. Üçlünün yerini sabit sayılar alıyor — olup bitmiş bir
      işte düzenlenebilir kutu, hâlâ seçenekmiş gibi okunur.
  - *Doğrulandı:* `typecheck` (18/18) · `lint` · `boundaries` · `knip` temiz · birim 1346/1346.
  - **BEKLEYEN(22.8):** kalan 10 tip. Sıra brief'te: `product_draft` → `zone_extend` (harita) →
    B sınıfı dört tip (gövde ayırma refactor'ü) → `stock_intake` ayrıca konuşulacak. **Desen kullanıcı
    onayından geçmeden çoğaltılmıyor** — yanlış deseni 11 kez yazmak, bir kez yazıp düzeltmekten pahalı.
