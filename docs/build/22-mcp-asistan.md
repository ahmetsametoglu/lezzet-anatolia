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
  - **BEKLEYEN(22.8):** kalan 9 tip. Sıra brief'te: `product_draft` → `zone_extend` (harita) →
    B sınıfının kalan üçü → `stock_intake` ayrıca konuşulacak. **Desen kullanıcı onayından geçmeden
    çoğaltılmıyor** — yanlış deseni 11 kez yazmak, bir kez yazıp düzeltmekten pahalı.

- [x] (22.9) **Önerinin KONU KARTI + kararın üç panel yerleşimi** *(kullanıcı kararı 10.08: "konu bir
  ürünle alakalı olduğu zaman buraya ürünün resmi gibi bilgiler koyabiliriz… tıklayınca o ürünün
  detay sayfasına")* — touches: `apps/web/lib/assistant/subject.ts`,
  `apps/web/components/operation/ui/subject-card.tsx`,
  `apps/web/app/(operations)/operations/assistant/bodies/batch-offer-body.tsx`
  - **Konu ORTAK bir okuma** (`subjectOf`), tip başına değil: 11 tipin 9'unda bir konu var (ürün ·
    paket · kategori · koleksiyon · tarif). Tip başına başlık kartı yazılsaydı dokuz kopya doğardı.
  - **Görsel payload'dan DEĞİL bugünkü kayıttan:** payload bir dilekçedir ve öneri anındaki gerçeği
    taşır; görsel ise "şu an ne satıyoruz"un parçası. Dondurulmuş bir görsel, fotoğraf değiştiyse
    yanlış ürünü gösterirdi. Bağlantı **yeni sekmede** — kurgunun bütün amacı operatörü sayfadan
    çıkarmamak; aynı sekmede gitmek az önce çözülen sorunu geri getirirdi.
  - **Görsel AKIŞKAN olamaz** (ölçüldü, kullanıcı ekran görüntüsü): sütun genişliğini izleyen 4:3 bir
    fotoğraf 550 piksellik sütunda 413 piksel boy tutuyordu; konu sütunu ötekilerin iki katına çıkıyor,
    yanlarında 450 pikselik ölü alan kalıyordu. Akışkan görsel, sütunlu bir dizilimde **daima en uzun
    sütunu üretir** — boy sabitlendi (132 px) ve kart yatay dizildi.
  - **Üç bölüm aynı kabukta ve `items-stretch` ile aynı boyda:** bir tur yalnız konu sütununun
    çerçevesi vardı, öteki ikisi çıplak metindi ve boy farkı "delik" olarak okunuyordu. Eşit boy o
    farkı panelin İÇ boşluğuna çeviriyor — aynı piksel, ama artık dizilimin parçası.

- [~] (22.10) **İkinci gövde: kampanya/kupon — B sınıfının ilk tipi, GERÇEK formuyla** *(kullanıcı
  talebi 10.08: "uygula dediğim zaman bana tarihi ve oranı indirim ekranında düzenlenir diye bir şey
  geliyor; doğrudan bu indirimle alakalı formun önüme gelmesini istiyorum")* —
  touches: `apps/web/components/operation/form/discount-form.tsx`,
  `apps/web/lib/prices/discount-actions.ts`, `apps/web/lib/assistant/form-options.ts`,
  `apps/web/app/(operations)/operations/prices/{discount-dialog,actions,prices-types,prices-read}.ts*`,
  `apps/web/app/(operations)/operations/assistant/**`,
  `packages/application/src/assistant/kind-meta.ts`
  - **Gövde SAYFADAN DA ÇIKTI, ortak komponentlere:** ilk tur `prices/discount-form.tsx` yazılmıştı
    ve `docs:check` reddetti (`STACK §7`: kardeş sayfadan yalnız `*-url` import edilir). Kural burada
    teknik bir ayrıntı değil ölçünün kendisi — iki yüzey aynı formu paylaşıyorsa o form bir sayfaya
    ait değildir. Aynı gerekçeyle `saveDiscountAction` da `lib/prices/discount-actions.ts`'e taşındı
    (teklif yazma yolunun `lib/stock/offer-actions` devriyle aynı desen).
  - **B sınıfının bedeli ödendi: gövde dialog'dan AYRILDI** (`discount-form.tsx`). Fırsat tipi C
    sınıfıydı — küçük bir karar kartı yeterdi; indirimde form vardı ama `discount-dialog`un içine
    gömülüydü (395 satır). Ayrım dosya bölmek değil **sözleşme kurmak**: değerler (`DiscountFormValues`),
    engel (`discountBlocked`) ve kaydetme girdisine dönüşüm (`discountInputOf`) gövdeyle birlikte
    taşındı. Engel dialog'da kalsaydı asistan kabuğu kendi engelini yazardı ve bir gün biri "%100 üstü
    yüzde" ya da "kodsuz kupon" kuralını unuturdu — aynı kural bir ekranda kaydedilir, ötekinde
    reddedilirdi. Dialog artık kabuk: başlık, alt bar, kaydetme çağrısı (395 → 103 satır).
  - **Aynı gövde iki yüzeyde:** `discount-dialog` (fiyat ekranı) ve `bodies/discount-draft-body`
    (kuyruk). Bir alan eklendiğinde ikisinde birden görünüyor — talebin birinci amacı bu ikiliği
    bitirmekti.
  - **`draft_then_edit` devri kapandı → `inline`.** Eski etki cümlesi kullanıcının itiraz ettiği
    cümlenin ta kendisiydi. **Kampanya artık pasif doğmuyor:** pasiflik bir emniyetti ama gerekçesi
    operatörün formu GÖRMEMESİYDİ; form kuyruğa gelince o gerekçe düştü ve "Aktif" anahtarı öteki
    alanlarla aynı ekranda duruyor. Görmediği bir kuralı yayına almak tehlikelidir, gördüğü kuralı
    yayına almamak ise ona sorulmamış bir karardır.
  - **Asistanın DOKUNDUĞU kutular işaretli** (`filled` kümesi → etiketin ucunda mor nokta + "asistan").
    Ayrı bir "değişiklikler listesi" yazılmadı (brief §3.4): operatör zaten bildiği forma bakıyor,
    farkı gözünün alışkın olduğu yerde görmeli. İşaret kutu düzenlenince de yerinde kalıyor —
    "asistan nereye dokundu" ile "operatör sonra ne yazdı" iki ayrı olgu.
  - **Yazan kapı yine varlığın kendi eylemi:** `saveDiscountAction(input, proposalId)` → `withProposal`.
    Kod satırları (`discount_code`) da işin İÇİNDE: kapısı olmayan bir kupon kimsenin giremediği bir
    odadır ve kuyruk onu "uygulandı" diye damgalamamalı.
  - **Yol üstünde bulunan arıza düzeltildi:** `DiscountRow` kapsam hedefinin yalnız ADINI taşıyordu,
    kimliğini değil. Kategori/koleksiyon kapsamlı bir kuralı düzenlemeye açan operatör hedef kutusunu
    boş buluyor, "Kapsam hedefi seçilmeli" engelini hiç kaldıramıyor ve kaydet düğmesi kilitli
    kalıyordu — yani o kayıtlar hiç düzenlenemiyordu. Ad İNSAN için, kimlik FORM için.
  - **Seçenek havuzu ortak** (`lib/assistant/form-options.ts`): kategori + koleksiyon listesi. Tip
    başına okuma açılsaydı aynı sorgu üç kez koşar ve biri bir gün sıralamayı ötekinden farklı yapardı.
  - **`assistant-preview.tsx`ten `discount_draft` bloğu SİLİNDİ** (1.170 → 1.126 satır).
  - **Gövdenin GENEL kurgusu kuruldu** *(kullanıcı kararı 10.08: "bir önerinin önizlemesi olacak, bir
    de kategori/koleksiyon/ürün her ne ile ilgiliyse onunla alakalı bir tanıtım kartı, bir de form —
    bu diğer öneri tiplerinde de olsun")*: her gövde **konu kartı + asistanın dilekçesi ⟷ form**.
    Ortak kabuk `components/operation/ui/proposal-aside.tsx`.
    - **Silinen önizlemeyle aynı şey DEĞİL:** `assistant-preview` formun YERİNE anlatıyordu (o yüzden
      silindi); bu sütun formun YANINDA duruyor ve başka bir soruya cevap veriyor. Form bir taslaktır
      ve operatör ona dokundukça asistanın ne dediği kaybolur — kullanıcının cümlesi: *"ben
      değiştirdiğim zaman önerinin ne olduğunu unutmam."*
    - **Sapma satırın ÜSTÜNDE:** değiştirilen alanda asistanın değeri üstü çizili kalır, yenisi
      yanında. Ayrı bir "değişiklikler listesi" kurulmadı — fark ait olduğu satırda durur.
    - **Boş bırakılan alanlar da listede** ("—"): kullanıcının ilk sorusu buydu (*"asgari sepete hiç
      girmemiş, haberi var mıydı?"*). Satırı listeden çıkarmak, verilmemiş bir kararı gizlerdi.
    - **`batch_offer` de aynı kabuğa çekildi** ve künye çifti oradan silindi: ikinci kopya doğmadan
      birleştirildi, yoksa biri bir gün sapmayı öğrenir öteki öğrenmezdi.
  - **Bayat test yakalandı ve düzeltildi:** `proposal.test.ts` hâlâ `batch_offer`'ı `handoff`
    bekliyordu (22.8'de `inline` olmuştu). Dosya `apps/backend` altında, yani ENTEGRASYON projesinde
    koşuyor — DB'siz bir test olduğu hâlde birim koşusunda görünmediği için sessizce bayatlamış.
  - *Doğrulandı:* `typecheck` · `lint` · birim 1346/1346.
  - **BEKLEYEN(22.10):** ekran doğrulaması kullanıcıda; yerleşim (form sütunu ↔ künye sütunu) geri
    bildirime göre oturacak. `applyDiscountDraft`/`applyBatchOffer` uygulayıcıları artık ULAŞILAMAZ
    (genel kapı `inline` tipini reddediyor) ama `APPLIERS` kaydında duruyor — `proposal.test.ts` şema
    ↔ uygulayıcı eşliğini şart koşuyor, yani temizlik o testin sözleşmesiyle birlikte düşünülmeli.

- [~] (22.11) **Kuyruk IZGARAYA döndü: tipe özel önizleme kartları** *(kullanıcı kararı 10.08: "grid
  şeklinde kartlar olacak, bir kart listesi şeklinde görünecek öneri; her önerinin kendi kart formatı
  olacak, sadece ön izleme için. Bu karta tıkladığımız zaman bir diyalog açılacak")* —
  touches: `apps/web/app/(operations)/operations/assistant/{assistant-card,assistant-card-bodies,assistant-sections,assistant.desktop,page}.tsx`,
  `apps/web/components/operation/ui/subject-card.tsx`, `apps/web/lib/assistant/subject.ts`
  - **İki sütun kalktı.** Önceki kurgu 326 piksellik bir kuyruk listesi + geniş bir karar panosuydu:
    liste sıkışıyor, pano da her an TEK öneriyi gösteriyordu. Izgara ikisini de düzeltiyor —
    öneriler yan yana görünüyor (hangisi önce, hangisi bekleyebilir), karar kendi penceresinde tam
    alan buluyor. `DecisionCard` → `ProposalDialog` (397 → 309 satır); `ProposalRow` ve
    `CardPlaceholder` silindi.
  - **Sütun sayısı ekrana değil KART GENİŞLİĞİNE bağlı** (`auto-fill` + `minmax(18rem,1fr)`):
    kullanıcının hedefi 1280'de dört karttı, ölçü oradan çıktı. **Kartlar eşit boyda** (`auto-rows-fr`):
    bir tur `items-start` yazılıydı ve ızgara kırık bir tarağa dönüyordu — ızgaranın tek gerekçesi
    tarama, hizasız taban gözü her kartta yeniden ayarlamaya zorluyor.
  - **İskelet ortak, gövde tipe özel** (`assistant-card` ⟷ `assistant-card-bodies`): rozet · tazelik ·
    yaş · durum her kartta aynı yerde; ortadaki önizleme gövdesini tip veriyor. Gövdesi olmayan tip
    asistanın cümlesine düşüyor, yani hiçbir kart boş kalmıyor. **Karta form konmaz** — kart "bu neyle
    ilgili, ne kadar acil, ne kadar para" sorusunun cevabı; "kaç lira yazayım" diyaloğun işi.
  - **Renk zeminden ÜST ŞERİDE geçti** (kullanıcı ölçümü: *"indirim kartları neden sarı"*). Bir tur
    kartın zemini tonun en soluk basamağıydı; ölçüm çürüttü: `olive-bg` = `#eef4e2`, `amber-bg` =
    `#fdf1e3` — o basamak **rozet arkası** için tasarlanmış, 288×352'lik bir yüzeyde ikisi de kirli
    beyaza düşüyor ve zeytin yeşili sarımsı olduğu için indirim kartı sarı görünüyordu. 3 pikselik
    doygun şerit iki tonu tartışmasız ayırıyor.
  - **Para iki katmanda, taban ADLANDIRILMIŞ** (kullanıcı ölçümü: *"üç rakam arka arkaya, aralarında
    boşluk yok… bu karta bakınca bir şey anlamıyorum"*): eski fiyat üstte ve sönük ("neydi → ne oldu"
    yönü), indirimli fiyat altta ve büyük. Yüzde artık daima **"indirim"** ve tabanın adı yazılı
    ("liste" · "ayrı alınsa") — *"avantaj kimin için?"* sorusunun cevabı: buradaki yüzde müşterinin,
    künyedeki `Kâr` bizim. Zarar "eksi kâr" diye yazılmıyor, **etiketi değişiyor** (`Zarar`) ve ton
    uyarıyor; kırmızı alarm yok, çünkü imha edilecek maldan zararına satış meşrudur.
  - **Görsel bandı TÜM KARTLARDA standart** (`MEDIA_H = h-32`, kullanıcı kararı: *"resim bölümünün bir
    yükseklik standardı olsun, onun hemen altında fiyat"*). Oran denendi ve yetmedi: oran kartın
    genişliğine bağlıdır, hiza kartın genişliğinden bağımsız olmalıdır — ızgarada hiza kazanıyor.
  - **Fotoğraf KARE çerçevede, kırpılmadan.** Bant bir tur tam genişlikti (1,9:1) ve `cover` ürünü
    kesiyordu; sebep ölçüldü: **117 görselli ürünün SIFIRININ odağı ayarlanmış** — hepsi
    `x50 y50 zoom100`. Kod odağı doğru okuyor (`cropOf` → `FramedImage`), künye "merkez" diyor. Kare
    kaynağı kare çerçevede göstermek kırpmayı sıfırlıyor; odaklar ileride ayarlanınca `crop` aynen
    çalışmayı sürdürüyor. `object-contain` yolu bilinçle terk edildi — proje zaten tek kaynaktan
    `cover` + odak + zoom ile çerçeve türetiyor (`image.schema §0B`), ikinci bir mekanizma açılmadı.
  - **Paket kalemleri DESTE** (kullanıcı kararı: *"resimler hafiften üst üste binsin, klasik tasarım"*):
    dar bir kartta yan yana dizilen kareler ya küçülüyor ya taşıyordu; örtüşen kısım yer tutmadığı için
    kareler bandın tamamını doldurabiliyor. Kenarlık **beyaz halka değil gri çizgi** — beyaz, ürün
    fotoğraflarının stüdyo zeminine karışıyor ve üç börek tek fotoğrafa dönüşüyordu (kullanıcı
    ölçümü). Gölge binmenin YÖNÜNÜ görünür kılıyor. Tek fotoğrafta çerçeve yok: bandın tamamı zaten o.
    Kırpılan kalem sayısı "+N" rozetiyle değil künyedeki `İçerik 4 kalem · 4 ad.` satırıyla korunuyor.
  - **`ProposalSubject` artık kırpma da taşıyor** (`crop`) ve çoğul `images` alanı paket kalemlerinin
    fotoğraflarını veriyor — paketin kendi fotoğrafı yoktur (kayıt henüz doğmamıştır), taslak evresinde
    tanınmanın tek yolu kalemleridir.
  - **Para hareketi kartı — görseli OLMAYAN ilk tip.** Bant boş bırakılmadı: yüksekliği standart
    (`MEDIA_H`) ve ızgaradaki hizayı o tutuyor, o yüzden bandı **kararın kendisi** dolduruyor — tür,
    tutar, paranın yolu. Tanımayı sağlayan şey burada fotoğraf değil bu üçlü.
    - **Tutar RENKLİ: gider kırmızı, gelir yeşil** *(kullanıcı düzeltmesi 10.08)*. İlk tur yalnız
      işaretti (`−`/`+`) ve gerekçesi "kira ödemek arıza değil"di; doğrusu şu: burada renk bir uyarı
      değil **sınıflandırma**. Muhasebenin kendi dili kırmızıyı çıkana, yeşili girene ayırır ve
      operatör o dili zaten biliyor. Zarar satırındaki amber ile karışmıyor — o beklenmeyen bir
      sonucun uyarısı, bu hareketin türü.
    - **Dilekçedeki açık kapatıldı: `counterAccountName`.** `counterAccountId` yalnız kimlik olarak
      yazılıyordu, yani transfer önerisi ekranda "Kasa → uuid" diye okunuyor ve onaylanamıyordu. Araç
      hedef hesabı elindeki listeden çözüyor (ikinci sorgu yok) ve tanımadığı hedefi artık reddediyor.
      Alan `.default(null)` — kuyrukta onsuz yazılmış dilekçeler `safeParse`ta düşüp kartları sessizce
      cümleye indirmesin diye.
    - **Boş alan da GÖSTERİLİYOR** (kategori · karşı taraf · değer tarihi, yoksa "—"): 22.10'daki
      kararın aynısı. Defterde daha da ağır basıyor — kategorisiz bir gider ay sonunda hiçbir raporda
      görünmez, satırı gizlemek o eksiği verilmiş bir karar gibi gösterirdi.
  - **Tedarik ikilisi (`purchase_order` · `stock_intake`) — kalemleri olan tiplerin dili.** İkisi de
    paketle AYNI desteyi kullanıyor *(kullanıcı düzeltmesi 10.08: "bizim diğer kartlardaki fotoğraf
    stilimiz bu değil")*: bir tur satır satır küçük künye + adet diziliyordu, ama "bu öneride hangi
    ürünler var" sorusunun iki farklı görünüşü olmamalı. Kalem başına adet KARTA değil diyaloğa ait.
    - **İki açık daha kapatıldı.** ① `purchase_order` dilekçesinde **depo kodu yoktu** (yalnız
      `warehouseId`) — oysa hangi depoya mal isteneceği bu kararın DEĞİŞMEZİ (`CLAUDE §1`); özet
      cümlesinde geçmesi yetmez, cümle serbest metindir. ② **Tutar hiç yoktu** ve gerekçem "alış mal
      kabulde kesinleşir, uydurma sayı onaylatmayalım"dı; kullanıcı sordu (*"bu ürünlerin yaklaşık
      kaç lira ettiğini biliyor muyuz?"*) ve ölçüm gerekçeyi çürüttü: `supplier_product
      .last_purchase_price` **23/23 dolu**. Bilinen bir sayıyı saklamak, kasadan ne çıkacağını
      görmeden sipariş onaylatmaktı. Tutar artık TAHMİN olarak (`~`) ve **bir kalemin bile fiyatı
      eksikse hiç** yazılmıyor — eksik tabanlı toplam gerçeğinden daima azdır, az görünen tutar da
      onayı kolaylaştırır.
    - **Eski dilekçeler için okuma katmanı devrede** (`economics.supply`): iki alan da 22.11'de
      eklendi, kuyrukta onlardan önce yazılmış öneriler var ve kart onlarda "—" ile "14 kalemde fiyat
      yok" gösteriyordu. Depo `warehouse`, fiyat `supplier_product` kaydından okunuyor; bilinen bir
      şeyi "bilinmiyor" diye göstermek eksikliği önerinin kusuru gibi okutur. Yan kazanç: sipariş
      kuyrukta beklerken alış değişirse onay anında geçerli olan görünüyor (`batch_offer`daki liste
      fiyatıyla aynı sıra — önce bugünkü, sonra dilekçe).
  - **Ürün ikilisi (`product_draft` · `product_create`) — kardeşler ama kartları bilinçle farklı.**
    - `product_draft`te ürün ZATEN VAR, yani fotoğrafı da var (`productSubject`). Asıl soru "ne
      kazanıyorum" değil **"ne kaybediyorum"**: `updateDetails` düz bir `update` ve sürüm tutmuyor,
      dolu bir açıklama onaylandığı an geri getirilemez. Kart bu yüzden **üzerine yazılan dolu kutu
      sayısını** ayrı satırda ve amber tonda söylüyor; `currentFields` hiç gelmediyse "0" değil
      "eski hâl okunamadı" yazıyor (`CLAUDE §1`).
    - `product_create`te ürün henüz DOĞMAMIŞ, o yüzden görsel yok; bandı ürünün kimliği dolduruyor
      (kategori · ad · boylar). Boy sayısı özellikle var: **varyantsız ürün satılamaz.**
    - **Kullanıcı sorusu üzerine iki eksik kapandı** (11.08, *"başka eksik bir şey var mı?"*):
      asistanın yazdığı **tanıtım metni** (müşteri sayfasına aynen o çıkacak — dilekçede dolu duran
      bir metni göstermemek, onaylanan şeyi görünmez kılmaktı) ve **`uncertainFields`** (modelin
      ambalajdan net okuyamadığı alanlar). İkincisi boşken satır çizilmiyor ve bu 22.10'daki "boş
      alan da gösterilir" kuralıyla çelişmiyor: o kural asistanın doldurmadığı KARAR alanları
      içindi, burada eksik bir veri değil olmayan bir SORUN var — her karta "belirsiz: yok" yazmak,
      asıl doluyken göze çarpması gereken uyarıyı sıradanlaştırırdı.
    - Beyan alanı adları sözlüğü `assistant-preview`ten `assistant-labels`a taşındı: kart da aynı
      adları yazıyor ve iki yerde tutulsalardı aynı alan bir ekranda "Saklama", ötekinde "Saklama
      koşulları" olurdu.
  - **Son ikili — `recipe_draft` · `featured_flag`; ON BİR TİPİN HEPSİNİN kartı var.**
    - Tarif de taslak evresinde doğmamış bir kayıttır: yüzü malzemeleri (paketle aynı deste).
      Hazırlanış metni karta sığmaz ama **adım sayısı** ölçeği söylüyor — iki adımlık bir servis
      önerisi ile sekiz adımlık pişirme aynı iş değil.
    - Vitrin işaretinde para yok, **yön** var: kartın büyük satırı "Vitrine çıkar" / "Vitrinden
      kaldır". Küçük bir künye satırına gömülseydi ızgarada iki zıt karar aynı görünürdü.
      `currentlyFeaturedCount` künyede: vitrin bir liste değil SEÇKİdir, doluysa eklenen ötekini
      aşağı iter — "bir tane daha" ile "sekizinci" aynı karar değil (22.5 denetim bulgusu). Alan hiç
      gelmediyse "0" değil "sayılmadı" (`CLAUDE §1`).
    - **Üç yerdeki görsel toplama tek yere alındı** (`variantImages`): paket · tedarik · tarif aynı
      üç adımı yazıyordu (varyant → ürün → görsel + kırpma). Dördüncüsü yazılmadan birleştirildi;
      ayrı kalsalardı biri bir gün kırpmayı unutur, öteki sırayı bozardı.
  - **Dört kart yeniden kuruldu** *(kullanıcı ölçümü 11.08: "indirim, ürün ve tarif kartlarını
    yetersiz buldum, alanı yeterince doldurmamış")* — hepsinde aynı hiyerarşi sorusu: hangi bilgi
    önemli, ne boyutta, kartın neresinde.
    - **İndirim, dilekçenin en KALABALIK tipi ve kartın en zayıfıydı:** on yedi alandan üçü
      görünüyordu. Bir indirim kararı üç sayıyla verilemez — asgari sepet, kullanım tavanı ve kimin
      için geçerli olduğu doğrudan cirodur. Bant artık indirimin kendisi (`%10` · yeşil, müşterinin
      kazancı), kupon kodu değerin yanında ve çerçeveli (kod kampanyanın KAPISI; künyeye inerse
      "kodsuz kupon" gibi okunur), bandın altında kapsam cümlesi, künyede koşullar.
    - **Ürün tamamlamada kart içeriği SAKLIYORDU:** "3 kutu dolduruluyor" deyip yeni değeri
      göstermiyordu. Yeni ad artık büyük ve MOR (bu ekranda "asistanın dokunduğu yer" rengi); ad
      yazılmıyorsa ilk metin alanının önizlemesi.
    - **Dil kapsaması** (`LocaleFact`) ürün ve tarifte ortak: katalog üç dilli ve eksik dil SESSİZ
      bir arıza üretir — kayıt onaylanır, vitrine çıkar, Fransız müşteri Türkçe başlık görür. Ölçüt
      sıkı: bir dil ancak VERİLEN METİNLERİN HEPSİNDE doluysa tam sayılır.
    - **Bölge kartında üç ayrı sorun vardı** *(kullanıcı: "büyük bir problem var")*: ① bandı yoktu,
      ızgarada yarı boş duruyordu; ② posta kodları tek bir künye DEĞERİNE diziliydi ve beş kodda o
      satır sarıp kartın boyunu tek başına belirliyordu (dar sütunda sağa yaslı uzun değer, en
      kırılgan yerleşim); ③ en güçlü sinyal künyeye gömülüydü — kırk yedi kişinin adres girip
      "buraya gelmiyor musunuz" demesi bölge açmanın tek gerçek gerekçesi. Kodlar artık bandın
      kendisi, talep bandın altında cümle. Sıfır talep gizlenmiyor ("rota kararı"), bekleyen kişi
      sayısı amber — onlara haber GİDECEK ve bu geri alınamaz.
    - **Eksik beyan adede indi** *(kullanıcı kararı: "gereksiz yükseklik oluşturuyor, adedini
      verelim")*: dört alanın adı dar sütunda üç satıra sarıyordu. Kararı değiştiren şey hangi
      alanların eksik olduğu değil KAÇ tanesinin eksik olduğu; adlar diyalogda, düzeltilecekleri
      yerde duruyor.
  - *Doğrulandı:* `typecheck` (web + backend) · `lint` · `boundaries` · `knip` temiz · birim 1346/1346 ·
    `mcp.test.ts` + `proposal.test.ts` 26/26.
  - **Gövdeler TİP BAŞINA dosyaya bölündü** *(kullanıcı ölçümü 11.08: token tüketimi)* — tek dosya
    926 satıra çıkmıştı ve bedeli somut: bir kartı düzeltmek için ajanın bütün dosyayı bağlama
    alması gerekiyordu (~14 bin token). Artık `cards/` altında on bir dosya (42–99 satır) + ortak
    yapı taşları `cards/shared.tsx` (280); `assistant-card-bodies.tsx`ta yalnız DALLANMA kaldı (99).
    Dallanmanın tek yerde durması bilinçli: bir tipin sessizce kartsız kalmasını engelleyen şey o.
    Bölme sırasında dört ortak blok da doğdu (`BandBox` · `BandLabel` · `BandNote` · `CardLead`) —
    görselsiz tiplerin bandı dört kartta birebir aynı yazılıydı.
  - **`docs:check`e dosya boyutu UYARISI eklendi** (600 satır): hata değil bilgi, çünkü bölme her
    zaman doğru cevap değil — tek bir durum makinesi 600 satır olabilir ve parçalamak onu okunmaz
    kılar. Sert bir kapı, dokunulan her eski dosyayı önce refactor etmeye zorlardı. Bugün 24 dosya
    eşiği aşıyor; en büyükleri mobil ekranlar ve `assistant-preview.tsx` (1115, tipe özel diyaloglar
    yazıldıkça eriyecek).
  - **BEKLEYEN(22.11):** `featured_flag` kartı ekranda DOĞRULANMADI — kuyrukta o tipten öneri yok
    (on tipin ikişer örneği var, bu tip hiç yazılmamış).
    tipe özel DİYALOGLAR da sırada (kullanıcı planı: *"önce liste, sonra teker teker diyaloglar"*).
    `assistant-preview.tsx` blokları o sırada düşecek.

- [x] (22.12) **Alan denkliği: dilekçedeki her alan modele SORULMUŞ olmalı** *(kullanıcı kararı
  11.08: "benzer çalışmayı her öneri modeli için çalışmalıyız — olabildiğince maksimum alan
  doldurmasına veya alandan haberdar olmasına müsaade etmeliyiz")*
  `touches: packages/types/src/entities/assistant-proposal.schema.ts · apps/backend/src/mcp/{server-factory,tools-propose,proposal.test}.ts · packages/application/src/assistant/apply.ts · apps/web/app/(operations)/operations/assistant/{assistant-preview.tsx,cards/}`
  - **Durum:** yapıldı. İş 22.10'da tek tipte yaşanan bir sorudan doğdu: kampanya formu kuyruğun
    içine gelince boş kutular göründü ve kullanıcı *"bunlardan asistanın haberi var mıydı?"* diye
    sordu. Yoktu. Aynı soru on bir tipe birden soruldu.
  - **Ölçüm ÜÇ SÜTUNLU** — ① hedef ekranın gerçek formu · ② payload şeması · ③ **MCP aracının girdi
    şeması**. Kullanıcının gördüğü boş kutu ①'de, sebebi ③'te: kod alanı bekliyor, model onun
    varlığından habersiz. **Boş kutu "asistan atladı" diye okunur; gerçek "asistana sorulmadı"dır.**
  - **Yedi tipte açık vardı, dördü tamdı:**
    - `recipe_draft` — `duration` · `meal` · `pantry` şemada HİÇ YOKTU (tarif formunun üç kutusu).
      `pantry` özellikle asistanın işi: bizden alınmayan malzeme (tuz, su, yağ) satılabilir satır
      değildir ama tarif onsuz yapılamaz.
    - `stock_intake` — `date` (belge tarihi) ve `totalAmountCents` (faturanın kendi yazdığı toplam).
      Tarihsiz kabul BUGÜNE yazılıyordu; oysa fatura genelde dünkü. Toplam ise mutabakat içindir:
      bizim topladığımızla belgenin yazdığı arasındaki fark = nakliye, iskonto ya da okunamamış satır.
      Araç bu farkı ölçüp modele geri söylüyor, kart da onaylayana yazıyor.
    - `product_create` — varyantta `netWeightG`/`piecesCount`, üründe `shippable`. Üçü de ambalajda
      yazılı. Etiket ("500 g") ile ölçü (500) ayrı alanlar: biri müşterinin okuduğu metin, öteki
      kilo başı fiyatın ve kargo hesabının tabanı. `shippable` saklama satırından çıkar — "-18 °C"
      yazan ürün kargoya verilemez; sorulmadığı için her ürün sessizce kargolanabilir doğuyordu.
    - `money_movement` — **en pahalısı**: `counterAccountId` işleyicide OKUNUYORDU, araç girdisinde
      hiç tanımlı değildi. Transfer önerisi kurulabiliyor, paranın gittiği hesap hep boş kalıyordu.
      Artık kaynak gibi ADLA çözülüyor ve `type: 'transfer'` için ZORUNLU — hedefsiz transfer
      uygulanınca "bir hesaptan çıkmış, hiçbir hesaba girmemiş" bir tutar bırakırdı.
    - `bundle_draft` — açıklamanın yalnız Türkçesi soruluyordu; paket müşteri yüzeyine çıkıyor ve
      vitrin Fransa.
    - `zone_extend` — `country` hiç sorulmuyor, bölgenin İLK kodundan türetiliyordu; kodu olmayan
      bölgede sabit `'FR'`e düşüyordu. Posta kodu sınır ötesi benzersiz değil (67000 iki ülkede de
      var), yani yanlış ülkeye yazılan kod sessizce kapsama girmez. Sıra artık: modelin dediği →
      bölgenin kodları → **deponun ülkesi** (bölge tek depoya bağlı, `DOMAIN §17`).
    - Tam olanlar: `product_draft` · `featured_flag` · `batch_offer` · `discount_draft` (sonuncusu
      22.10'da kapanmıştı).
  - **`purchase_order` eksik SANILDI, ölçümle çürüdü:** `createDraft` fiyat verilmezse tedarikçi
    eşlemesindeki son alıştan kendisi dolduruyor (`purchase-order.service.ts`). Sebebi kanıtlanmadan
    müdahale edilmedi (`CLAUDE §0`).
  - **Çok dilli alanlarda İKİ DESEN vardı, tekleşti:** `product_create`/`discount` nesne alıyordu
    (`name: {tr,fr,de}`), `recipe`/`bundle` düz alan (`nameTr`, `nameFr`…). Tarife üç alan eklemek
    düz desende dokuz yeni girdi demekti — araç 15'ten 24 alana çıkardı ve model doğru doldurmakta
    zorlanırdı. İkisi nesne desenine çekildi.
  - **Bilerek DIŞARIDA bırakılanlar iki ayrı gerekçeyle:** *asistan bilemez* (`sku` iç kodumuz,
    `minStockQty` operatörün eşiği, `location`/raf fiziksel yerleşim) — uydurmasına kapı açmak boş
    bırakmaktan kötü; *bilinçli duvar* (`isFeatured`, `status`, `isActive`, fiyat alanları) — taslak
    doğma kuralı, asistan beyanı doldurur satışa çıkarmaz.
  - **Kalıcı çare — denklik testi** (`proposal.test.ts`, 11 tip): payload'da olup araç girdisinde
    karşılığı olmayan her alan ya araca eklenir ya **gerekçesiyle** kayda geçer. Kör bir kural
    yazılamazdı, çünkü alanların bir kısmı gerçekten modelden gelmez (`warehouseCode` → `warehouseId`
    çözümü, motorun hesapladığı `lines`). Test kırıldığında eksik alanı ADIYLA söylüyor — kırıldığı
    doğrulandı (gerekçe silinince `counterAccountId` diye düştü, geri konunca 24/24 yeşil).
  - **Ekranlar da güncellendi:** tarif kartı süre/öğün/evinizden okuyor, mal kabul kartı belge
    tarihini ve fatura farkını yazıyor, para önizlemesi transferi ÜÇÜNCÜ bir hâl olarak gösteriyor
    ("Gider" demek yer değiştiren parayı kaybedilmiş gibi okuturdu), ürün önizlemesi boyların
    ölçüsünü ve kargo kararını basıyor. Doldurulmayan alan boş geçilmiyor, "yazılmadı" diye
    yazılıyor (22.10 ilkesi: verilmemiş kararı gizlemek onu verilmiş gibi gösterir).

- [x] (22.13) **Kimlik köprüsü: modelden istenen her kimliğin bir kaynağı olmalı** *(MCP denetim
  raporu 11.08, madde 12 — altı turdur açık; kullanıcı kararı: "bu rapor doğrultusunda yapman
  gereken değişiklikler varsa bunları yap")*
  `touches: apps/backend/src/mcp/{server-factory,tools-propose,tools-reference,tools-catalog,proposal.test}.ts · packages/database/src/services/purchase-order.service.ts`
  - **Durum:** yapıldı. 22.12 yazma eksenini kapatmıştı (dilekçedeki alan modele soruluyor mu);
    bu görev **okuma eksenini** kapatıyor: modelden istenen kimliği veren bir okuma aracı var mı.
  - **Ayrımı denetim raporu gösterdi.** `featured_flag` 22.12'nin denklik testinden TAM geçiyordu
    ve altı tur boyunca **tek bir kez bile kullanılamadı**: araç `id: uuid` istiyor, o kimliği veren
    hiçbir okuma aracı yok (`reference_data` kategoriyi/koleksiyonu yalnız ADIYLA listeliyor,
    paketleri hiç listelemiyor). Soru soruluyordu, cevabı elde etmenin yolu yoktu. Rapor bunu
    *"güvenlik açığı değil, erişilebilirlik"* diye doğru adlandırmış: veri var, asistana verilmiyor.
  - **Ölçünce üç kopukluk daha çıktı** ve ikisinin bedeli SESSİZDİ:
    - `stock_intake.supplierId` — son turdaki iki kabulün ikisi de tedarikçisiz yazılmıştı. Bedeli
      zincirleme: `receive_intake` son alış fiyatını `where supplier_id = p_supplier_id` ile
      tazeliyor (`0010_supply.sql:236`), yani tedarikçi boşken **hiçbir satır güncellenmiyor** —
      fiyat tazelenmeyince 22.12'de açılan `lastPurchasePriceCents` de hep boş kalırdı.
    - `stock_intake.purchaseOrderId` — iki kabulün ikisi de siparişsizdi, yani hiçbir sipariş
      kapanmıyor ve "yolda" sayılan mal sonsuza dek yolda kalıyordu.
    - `money_movement.supplierId` — iki giderin ikisi de tedarikçisiz; ödeme kime yapıldığı serbest
      metinde kalıyor, tedarikçi bakiyesine düşmüyor.
    - `purchase_order.supplierId` — alan opsiyonel olduğu için arıza görünmüyordu: "şu tedarikçiye
      sipariş aç" isteği karşılanamıyor, araç her seferinde en büyük gruba düşüyordu.
  - **Çözüm projenin kendi deseni: ADLA çözüm.** `zone_extend` (zoneName), `money_movement`
    (accountName), `discount_draft` (scopeName), `product_create` (categoryName) zaten böyle
    çalışıyordu; kimlik isteyen araçlar istisnaydı. Ortak kapı `resolveSupplier` — ad verilmezse
    `null` (tedarikçisiz alım meşru), **bulunamayan ad ise HATA** ve mevcutları yazar: sessizce
    `null`a düşmek, modelin kurduğunu sandığı bağı sessizce koparırdı.
  - **Sipariş bağı MODELE SORULMUYOR, türetiliyor:** tedarikçinin tek açık siparişi varsa
    kendiliğinden bağlanır; birden fazlaysa seçim modelin ama **referans numarasıyla**, uuid'yle
    değil. Kapı `PurchaseOrderService.listOpenBySupplier` — "açık" tanımı (`draft` · `sent` ·
    `partially_received`) `openProgress` künyesinde bir kez tarif edilmişti, ikinci bir tanım
    doğurmamak için servise taşındı.
  - **Bağ kurulamadığında araç SUSMUYOR:** cevap "tedarikçi bağlanmadı — bu kabul son alış fiyatını
    tazelemez" ya da "şu tedarikçinin 3 açık siparişi var, hangisi?" diyor. Sessiz eksik, modelin
    düzeltemeyeceği tek eksiktir.
  - **`reference_data` paketleri de listeliyor** (yoktu — `target: 'bundle'` bu yüzden hiç
    kullanılamıyordu) ve künyesi artık şunu söylüyor: buradaki her ad bir `propose_*` girdisine
    birebir yazılabilir. Kimlik hâlâ YAZILMIYOR ve bilerek: uuid modelin bağlamında yer kaplar,
    ezberlenemez, bir kez yanlış hatırlandığında panelde "(silinmiş kayıt)" doğurur.
  - **Rapor madde 10 da kapandı:** `catalog_lookup` alış fiyatı satıştan yüksekse `dataDoubt`
    işareti basıyor. Model bunu kârlılık sonucu sanıp "zararına satıyoruz" diye raporluyordu; ölçülen
    sebep başkaydı — eksik girilmiş alış fiyatı. Karşılaştırma **KDV tabanı eşitlenerek** yapılıyor
    (liste dahil, alış hariç); çıplak karşılaştırma her ürünü %5,5 daha kârsız gösterirdi.
  - **Vitrin önerisi artık DEĞİŞTİRMEYECEĞİ hâli reddediyor:** zaten vitrindeki bir kaydı "vitrine
    çıkar" diye kuyruğa yazmak, onaylandığında hiçbir şey yapmayan bir kalem bırakırdı — kuyruğun en
    sinsi çürüme yolu (`money_movement`'tan `purchase`ın çıkarılmasıyla aynı gerekçe).
  - **Denklik testi ikinci eksene genişledi** (`proposal.test.ts`): bir araç modelden uuid istiyorsa,
    o kimliği veren okuma aracı `READABLE_IDS`te yazılı olmalı. Bugün kaynaksız kimlik YOK —
    `ID_WITHOUT_SOURCE` boş ve boş kalması gerekiyor; doluysa açık bir borçtur.
  - **BEKLEYEN(22.13):** rapordaki iki "eksik araç" maddesi açık — **imha kaydı** (DLC'si geçmiş
    parti için `must_discard` tespit ediliyor ama kaydı oluşturacak araç yok) ve **liste fiyatı
    değiştirme** (yalnız parti bazlı teklif önerilebiliyor). İkisi de yeni öneri tipi demek: şema +
    uygulayıcı + kart + onay ekranı. Ayrı bir tur.
  - **Köprüler kurulduktan sonraki ÖLÇÜM (11.08, ikinci tur):** on bir tipin on biri ikişer öneri
    yazdı — `featured_flag` altı turdur boş olan haneyi doldurdu (*"Dondurma vitrine çıkarılsın"* ve
    *"Maraş Dondurma Seti vitrine çıkarılsın"*; ikincisi paket hedefi, `reference_data`ya paket
    listesi eklendiği için mümkün oldu). Mal kabulün tedarikçi bağı 0/2'den 2/2'ye çıktı, 22.12'nin
    on iki alanının hepsi 2/2 dolu geldi.
  - **BEKLEYEN(22.13): iki bağ hâlâ boş ve ikisi de KİMLİK KÖPRÜSÜ SORUNU DEĞİL** — araç doğru
    davranıyor, modelin sorusu cevapsız kalıyor. İkisi de araç tarafında kapatılabilir ve **ilgili
    tipin kuyruk-içi FORMU yazılırken ele alınacak** (kullanıcı kararı 11.08: *"ilgili forma
    geldiğimiz zaman tekrar konuşalım"*):
    - **`stock_intake` → açık sipariş bağı (0/2).** İlkinde bağ kurulamaz ve bu doğru: `Alsace Frais
      Distribution`ın hiç açık siparişi yok. İkincisi `Gaziantep Baklava Fabrikası`ndan ve o
      tedarikçinin ÜÇ açık siparişi var — araç otomatik bağlamayıp "hangisini karşılıyor?" diye
      sordu, model ikinci turu yapmadı. **Öneri:** araç kabuldeki varyantları açık siparişlerin
      kalemleriyle eşleştirsin; tek sipariş örtüşüyorsa kendiliğinden bağlasın. Veri elimizde, model
      uğraşmasın. Bağsız kabul siparişi sonsuza dek açık bırakıyor ("yolda" sayılan mal hiç inmiyor).
    - **`money_movement` → alıcı (0/2).** Biri transfer, orada tedarikçi zaten olmaz. Öteki "ambalaj
      gideri 150 €" ve ne `supplierName` ne `counterpartyName` dolu — para kime ödendi kayıtsız.
      **Öneri:** gider tipinde alıcı hiç yoksa araç cevabında uyarsın; bugün sessiz geçiyor ve
      alıcısı olmayan gider kaydı yarımdır.

- [x] (22.14) **Üçüncü gövde: ürün beyanı — ALAN ALAN karar** *(kullanıcı kararı 11.08: "daha önce
  tecrübeli olduğumuz konuyla başlayalım… ürünle alakalı bilgilerin güncellendiği öneriler" + form
  şekli seçimi: **alan alan seçim + düzenleme**)*
  `touches: apps/web/app/(operations)/operations/assistant/{assistant-body.tsx,bodies/product-draft-body.tsx} · apps/web/lib/catalog/product-actions.ts · apps/web/components/operation/form/{nutrition-field,form-nutrition,localized-text-field,multi-select,emphasis-textarea}.tsx`
  - **Durum:** yapıldı. Kuyruk içinde karar verilen üçüncü tip (`batch_offer` · `discount_draft`'tan
    sonra) ve ilk kez karar TEK bir şey değil.
  - **NEDEN "hepsi ya da hiçbiri" yetmedi:** fırsatta karar bir fiyat, kampanyada bir kuraldı.
    Burada yedi ayrı alan var ve **her birinin ayrı riski**: asistanın açıklaması iyi olabilir ama
    alerjen satırı şüpheli, ya da tersi. Tek düğme operatörü *"iyi olanı almak için şüpheliyi de al"*
    ikilemine sokuyordu — ve `updateDetails` sürüm tutmadığı için yanlış giden alan geri gelmiyordu.
  - **Seçim kaldırmak "boşalt" DEĞİL "dokunma" demek.** Kapı yalnız verilen alanlara dokunuyor
    (`saveProductDeclarationAction`); seçilmeyen alan girdiye hiç girmiyor. İkisi karıştırılsaydı
    reddedilen bir öneri, dolu bir alanı silen bir onaya dönerdi.
  - **Ayrı bir eylem yazıldı ve gerekçesi somut:** ürün sekmesinin `updateProductAction`ı ürünün
    TAMAMINI yazar ve **varyantları senkronlar**. Kuyruğu ona bağlamak, asistanın hiç bilmediği bir
    kümeyi (varyant listesi) her onayda yeniden yazmak olurdu.
  - **İLK DENEME GERİ ALINDI — ürün formu YENİDEN YAZILMIŞTI** *(kullanıcı düzeltmesi 11.08: "sen
    yeni form mu yazdın? bizim ürün formumuz bu değil ki")*. Doğruydu ve duplication'ın ta kendisiydi
    (`CLAUDE §1`): aynı ürün iki ekranda iki farklı formla düzenlenirse bir gün biri KDV seçeneğini,
    öteki alerjen vurgusunu ya da varyant etiketinin zorunluluğunu kaybeder. 22.10'da indirim formu
    için doğru yapılan şey (formu diyalogdan çıkarıp ortak komponente taşımak) burada atlanmıştı.
  - **Ürün formu ORTAK komponente taşındı** (`components/operation/form/product-form/`): alan
    sözleşmesi, iki yerleşim (`layout.desktop` · `declaration`), şema ve varyant düzenleyici. Kapta
    kalanlar: RHF örneği, kaydeden eylem, `Dialog` kabuğu, alt bar. İkisi de kendi kabuğunu kurar
    çünkü kararları farklı — ürün ekranı "ürünü kaydet" der, kuyruk "öneriyi uygula" der ve kuyruk
    satırını da kapatır.
    - `buildDefaults`ın girdisi `ProductView`den `ProductFormSource`a (şemadan türer) çevrildi:
      `components/` `app/`'e bakamaz (`STACK §4`, bağımlılık tek yönlü).
    - **Galeri SLOT, alan değil.** `ProductPhotos` canlı yazar — yükleme, sıralama, kapak seçimi
      anında kaydedilir. Kuyruğun içinde böyle bir blok olmamalı: onay beklemeyen bir yazma yolu,
      "kuyruk hiçbir şeyi kendi yazmaz" vaadini deler. Kuyruk `null` veriyor.
    - `updateProductAction` `lib/catalog/product-actions`e taşındı ve `proposalId` aldı — iki
      yüzeyin ortak eylemi sayfa klasöründe duramaz (`discount-actions` ile aynı devir).
  - **Form ürünün BUGÜNKÜ hâliyle açılır**, asistanın önerisi üzerine yazılır. Tersi (boş formu
    dilekçeyle doldurmak) kaydetmede asistanın hiç dokunmadığı alanları sıfırlardı: bir onay, ürünün
    varyantlarını silerdi. Kayıt okunamazsa form HİÇ AÇILMIYOR, uyarı çiziliyor.
  - **Asistanın dokunduğu kutu işaretli** (`filled` → "asistan" rozeti, `DiscountFormBody`nin aynı
    adlı prop'uyla aynı gerekçe): işaret olmasa operatör hangi kutunun kendi kaydı, hangisinin öneri
    olduğunu ayıramazdı — formun tamamı "zaten böyleydi" gibi okunurdu.
  - **Kilit `fieldset` ile, alan alan değil:** HTML'in kendi mekanizması bütün girdileri kapatıyor.
    Yol boyunca üç ortak komponente `disabled` eklendi (`LocalizedTextField` · `MultiSelect` ·
    `EmphasisTextarea`) — hiçbirinde yoktu; kilitli `MultiSelect` çipinden "✕" işareti kalkıyor,
    tıklanamayan bir kaldırma işareti yalan söyler. `LocalizedTextField` ayrıca `labelAside` aldı
    (rozet AI çeviri düğmesiyle yan yana durur, biri ötekini ezmez).
  - **Yeni alan komponenti yazılmadı** — besin künyesi bu iş için RHF sarmalayıcısından ayrıldı
    (`nutrition-field` + ince `form-nutrition`): kopyalansaydı kJ↔kcal çevrimi, satırların yasal
    sırası ve "0 bir beyandır" ayrımı bir gün iki yüzeyde ayrışırdı.
  - **Ürünün tam kaydı seçenek havuzuna girdi** (`readAssistantFormOptions(productIds)`): form
    kategori, KDV, tarih tipi, raf ömrü ve varyantları da ister; dilekçe bunları taşımaz ve
    taşımamalı. Kataloğun tamamı değil, YALNIZ kuyruktaki taslakların ürünleri okunuyor.
  - **BEKLEYEN(22.14):** ekran doğrulaması kullanıcıda — kuyrukta iki `product_draft` önerisi var
    (*Chocolate Baklava* · *Sobiyet Baklava*, ikisi de `name` + `description`).

- [x] (22.15) **Diyaloğun iki sütunu standartlaştı: solda iş, sağda DİLEKÇENİN KENDİSİ** *(kullanıcı
  kararı 11.08, ekran görüntüsüyle: "ajandan gelen bilginin en sağda bir sütun şeklinde özeti olsun.
  Düz metin değil. JSON'ın daha okunabilir şekilde çevrilmiş hâli. Bu tüm öneri diyaloglarında
  standart olacak" + "farklı öneri diyalogları farklı genişlik olması gerekecek")*
  `touches: apps/web/components/operation/ui/{payload-tree,proposal-aside}.tsx · apps/web/components/operation/form/product-form/layout.desktop.tsx · apps/web/app/(operations)/operations/assistant/{assistant-body,assistant-sections}.tsx · .../bodies/*`
  - **Durum:** yapıldı. Üç ayrı sorun aynı ekran görüntüsünden çıktı.
  - **① Dilekçe sütunu artık payload'ın KENDİSİNDEN türüyor** (`PayloadTree`). Tip başına elle künye
    listesi yazmak iki şeyi bozuyordu: on bir tipte on bir ayrı "hangi alanı göstereyim" kararı
    (biri mutlaka eksik kalır) ve şemaya eklenen alanın sessizce görünmez olması. **Ölçülmüş kanıt:**
    22.12'de on iki alan açıldı, hiçbiri kendiliğinden ekrana çıkmadı. Çeviri üç şey yapıyor — alan
    adı sözlükten Türkçeye, değer tipine göre (cent→euro, ISO tarih→kısa tarih, çok dilli metin dolu
    dilleriyle, boolean evet/hayır), **kimlik gizlenir** (uuid okunmaz ve yanındaki `…Name` aynı şeyi
    söyler; adsız kimlik kısaltılır ki satır sessizce kaybolmasın). `null` ve boş dizi satırdan
    DÜŞMEZ, "—" yazılır (22.10 ilkesi).
  - **② Diyalog genişliği TİPE GÖRE** (`InlineBody.width`). Tek sayı bütün tiplere dayatılıyordu:
    ürün formu tek başına 1180 px için tasarlanmış, yanına dilekçe sütunu gelince taşıyor —
    kutular kelime ortasından kırılıyordu (*"Gelene/ksel/baklav"*). Ürün taslağı 1560'a çıktı,
    ötekiler 1180'de kaldı.
  - **③ Galeri sütunu YOKSA çizilmiyor.** Kuyruk `photosSlot`u boş veriyor (canlı yazan blok kuyruğa
    girmemeli) ama yerleşim 360 px'lik sütunu yine ayırıyordu: formun sol üstünde koca bir boşluk,
    sağında sıkışmış kutular. Ölçüt `fields.image === null`.
    → ~~Koşullu ızgara~~ **KALKTI (11.08):** slot artık kuyrukta da dolu, dallanacak bir hâl yok
    (aşağıdaki "görsel bloğu kırpılmayacak" maddesi).
  - **Öne çıkan künye satırları KALDI ama azaldı:** `facts` artık yalnız SAPMA gösteren değerler
    için (fırsatta teklif fiyatı, indirimde formun oynattığı alanlar). Dilekçenin tamamı altında,
    kaydırılabilir bir ağaç olarak — tarifin malzeme listesiyle vitrin işaretinin üç satırı aynı
    sütunda yaşıyor ve sütun büyüyüp formu aşağı itmemeli.
  - **`Dialog` KAYDIRMASI HİÇ ÇALIŞMIYORDU — ortak hata, ortak düzeltme** *(kullanıcı bildirimi
    11.08: "bu diyalog içerisinde scroll hiç çalışmıyor")*. Gövdede `min-h-0 flex-1` yoktu ve
    sebep flexbox'ın varsayılanı: `flex-col` içindeki çocuğun asgari yüksekliği içeriği kadardır
    (`min-height: auto`), yani `overflow-y-auto` verilse bile kutu taşan içeriğe göre büyüyor,
    kaydıracak bir şey kalmıyor; dıştaki `overflow-hidden` de fazlalığı görünmez kılıyor — içerik
    kesiliyor ama okunamıyor. **Arıza küçük diyaloglarda görünmüyordu** (içerik `86vh`i aşmıyordu);
    ürün formu kuyruğun içine girince ortaya çıktı. Düzeltme `Dialog`'un kendisinde: çağıran her
    ekran kazandı. Aynı eksik `ProposalAside`ta da vardı.
  - **İki sütun, İKİ AYRI kaydırma** *(kullanıcı kararı: "o bölümün scroll'u ayrı olsun, form
    tarafının scroll'u ayrı olsun")*: tek kaydırma kolonunda dilekçe sütunu formu aşağı itiyordu —
    varyant tablosuna inmek için önce dilekçenin sonuna kadar geçmek gerekiyordu, oysa ikisi yan
    yana duran ayrı okumalar.
  - **Genişlik 1560 → 1720** (ölçüm: 1560 dar kaldı, formun sağ rayı ile içerik sütunu sıkışıyordu)
    ve dilekçedeki uzun metinler 90 karakterde kısaltılıyor, tamamı satırın ipucunda — kısaltma bir
    gösterim tercihi, bilgi kaybı değil.
  - **FORM ÜRÜNÜN KAYDINI HİÇ OKUMUYORDU — sessiz veri kaybı riski** *(kullanıcı bildirimi 11.08:
    "kategori bölümü boş gelmiş, beyan sekmesindeki hiçbir bilgi dolu değil")*. Ölçüldü: Chocolate
    Baklava'nın kategorisi "Tatlı", içindekiler/besin/saklama dolu, bir alerjeni var — ekranda
    hepsi boştu. Sebep sözleşmedeydi: `initial(payload)` seçenek havuzunu görmüyordu, taslak boş
    şablonla kuruluyor ve gövde gerçek kaydı okusa bile RHF o boş şablonu gösteriyordu. **Bedeli
    kaydetmede ortaya çıkardı: "Ürünü kaydet" ürünün dolu beyanlarını silerdi** ve ekran zaten
    "boş" dediği için kimse fark etmezdi. `initial` artık `(payload, options)` alıyor.
  - **Kaydırmanın İKİNCİ kök sebebi** *(kullanıcı: "content scroll hâlâ çalışmıyor, her iki sütun
    için de")*: `Dialog` düzeltmesi yetmedi çünkü gövdenin kendi kabı `flex-wrap` + `max-h`
    kullanıyordu. Sarmalayan bir flex kabında çocuklar kabın yüksekliğine GERİLMEZ, doğal boylarında
    kalır; `max-height` de yalnız bir tavandır, çocuğa aktarılacak bir yükseklik vermez. İkisi
    birleşince `overflow-y-auto` hiç devreye girmiyordu. Sabit yükseklik (`h-[68vh]`) + `flex-nowrap`
    + `min-h-0` üçlüsü çocuğa gerçek bir sınır veriyor.
  - **Kaydırmanın ÜÇÜNCÜ turu — sabit `vh` yanlış çareydi** *(kullanıcı ölçümü 11.08: "sağdaki
    sütun kaydırılıyor ama en aşağı indiğimde bile en altı görünmüyor; form tarafında ise kendi
    içinde kaydırma yok, ayrılmış alana sığmıyor")*. İki ayrı sebep vardı ve ikisi de
    `h-[68vh]`ten doğuyordu:
    - **Diyalogla satır aynı ölçüyü paylaşmıyordu.** Kabuk `86vh`, gövdenin payı ondan küçük
      (başlık + alt bar + dolgu). `68vh` satırın yanına gerekçe kutusu ve teknik döküm eklenince
      toplam gövdeyi aşıyor, DİYALOG da kaymaya başlıyordu: iki kaydırma iç içe girince ne form ne
      dilekçe sonuna kadar okunabiliyordu. Sabit ölçü kalktı — satır `flex-auto` + `min-h-0` ile
      gövdeden kalanı alıyor, kaydıran yalnız iki sütun. **Sonuç bir sayıya değil, kabuğun gerçek
      boşluğuna bağlı.**
    - **Dilekçe sütununda kaydıran bölge YANLIŞ yerdeydi:** yalnız ağaç kaydırılıyor, konu kartı ile
      künye satırları üstte sabit duruyordu. Sütun daraldığında sabit kısım sütunu tek başına
      doldurup ağaca sıfır yer bırakıyor, altta kalan kırpılıyordu. Başlık dışında ne varsa artık
      aynı bölgede kayıyor.
    - **Kaydırma çubuğu metnin üstüne biniyordu** *(kullanıcı 11.08)*: macOS'ta çubuk overlay
      çizilir, yani kutunun sağ kenarını yer. `-mr-3 pr-3` ile kaydırma kutusu kartın iç kenarına
      genişletildi, metin bugünkü yerinde kaldı — çubuk artık boş şeridin üstünde. Ölçü kartın
      kendi dolgusundan (`p-3`) alınıyor; ayrı bir sayı yazılsaydı biri değişince öteki unutulurdu.
  - **"Teknik döküm" bloğu diyaloğun DİBİNDEN dilekçe sütununa taşındı** *(kullanıcı kararı 11.08:
    "asistanın önerisi başlığının sağına bir aksiyon ekle, metadata ve view; view şu hâli kalsın,
    metadata da JSON görünsün; teknik döküm oradan kalksın")*. Katlanan blok yukarı doğru açılıp
    formun alanını yiyordu ve kendi içinde kaydırılamıyordu. Artık sütunun ikinci görünümü
    (`ProposalAside` · Görünüm ↔ Metadata): ham dilekçe + hedef tablolar + öneri kimliği + varsa
    doğan kayıtlar, aynı kaydırma alanında. Künye gövdelere TİP BAŞINA değil ortak geçiyor
    (`InlineBodyArgs.meta`). **Gövdesi olmayan tiplerde blok yerinde kaldı** — orada dilekçe sütunu
    yok (önizleme çizilir), kalkarsa ham dilekçeye bakılacak yer kalmazdı.
  - **`product_draft` ARTIK `inline` — üç yalan aynı ekranda görüldü** *(kullanıcı 11.08: "yeni ürün
    mü oluşturuyorum yoksa güncelliyor muyum? Aşağıda 'uygulanınca kayıt pasif doğar, ince ayar ve
    yayına alma kendi ekranının işi' yazıyor — burada her şeyi yapmıyor muyuz?")*
    - Tip hâlâ `draft_then_edit` künyesindeydi, oysa 22.14'te ürün ekranının **kendi formu** kuyruğa
      taşınmıştı. Alt bardaki cümle o künyeden geliyordu ve **olmayan bir kısıtı** anlatıyordu.
      Devir `discount_draft`ınkiyle birebir aynı gerekçe: pasif doğurmanın sebebi operatörün formu
      GÖRMEMESİYDİ (10.08); artık görüyor. `impact` metni de yenilendi.
    - **Satış ekseni kuyruğun DIŞINDA kaldı** *(kullanıcı kararı, aynı gün)*. Bir tur durum seçicisi
      ortak alana taşınmıştı — kuyruğun formu da yayına alabilsin diye; kullanıcı geri aldırdı ve
      kural netleşti: **kuyruk ürünün İÇERİĞİNİ yazar, satış eksenine dokunmaz.** Ürün pasifse
      pasif, satıştaysa satışta kalır; form mevcut durumu okuyup aynısını geri gönderiyor. Seçici
      ürün ekranının alt barında elle kurulu kalıyor — paket bağı uyarısı da (o ürünü içeren aktif
      paketler) yalnız orada okunuyor, karar oraya ait.
    - **Düğme "Ürünü kaydet" → "Ürünü güncelle".** `product_draft` VAR OLAN kaydın üstüne yazıyor
      (`payload.productId`); yeni ürün ayrı tip (`product_create`). "Kaydet" iki işi birden
      anlatabilen tek kelimeydi ve soruyu doğuran da oydu.
  - **"Neden bu öneri" banner'ı KALKTI, gerekçe başlığın altına indi** *(kullanıcı kararı 11.08:
    "bu bannerı kaldıralım; önerinin nedeni diyaloğun header'daki subtitle kısmına, dikkatimizi
    çekecek bir renk tonuyla")*. İki satırlık bir metin için kenarlık + dolgu + majüskül başlık
    harcanıyordu ve blok formun alanını yiyordu. Ton `ops-amber` (envanterin "dikkat" rengi; kırmızı
    DEĞİL — gerekçe bir hata değil, okunması gereken bağlam). `Dialog.subtitle` bunun için `string`
    yerine `ReactNode` oldu. **Gerekçesiz önerinin cümlesi duruyor** (brief §3): onaylanabilir ama
    patron neye dayandığını göremediğini bilmeli — kalkan yalnız kutu.
  - **GÖRSEL BLOĞU KIRPILMAYACAK — form bire bir aynı olacak** *(kullanıcı kararı 11.08: "eğer ben
    sistemde bir form kullanıyorsam o formu mümkünse bire bir kopyala. Code duplication olmasın, ama
    görüntüde bazı şeyleri kırpma.")*
    - 22.14'te galeri slotu kuyrukta bilerek `null` bırakılmıştı: blok CANLI yazıyor (yükleme,
      sıralama, kapak seçimi anında kaydediliyor) ve "kuyruk hiçbir şeyi kendi yazmaz" vaadini
      deleceği düşünülmüştü. Karar geri alındı — **galeri öneriyi uygulamıyor, ürünün fotoğraflarını
      yönetiyor**; operatörün kendi elinin işi, tıpkı ürün ekranındaki gibi. Kuyruğun onaya
      bağladığı şey asistanın DİLEKÇESİ ve oraya dokunan tek yol hâlâ alt bardaki düğme.
    - Taşınanlar (kopya YOK, yer değişikliği): `product-photos.tsx` →
      `components/operation/form/product-form/photos.tsx`, `photos-types.ts` aynı klasöre, altı görsel
      eylemi → `lib/catalog/product-photo-actions.ts` (kapak yükleme + galeri listele/ekle/sil/sırala/
      kapak yap/kırp). `updateProductAction`ın 22.14'teki devrinin aynısı ve aynı gerekçeyle: iki
      yüzeyin ortak eylemi sayfa klasöründe duramaz (`CLAUDE §2`).
    - `PRODUCTS_PATH` `lib/catalog/paths.ts`e alındı: iki eylem dosyası da tazeliyor ve `'use server'`
      modülü sabit dışa veremez, yani iki kopya doğacaktı.
    - Kapak adresi `AssistantFormOptions.products[...].imageUrl` ile SUNUCUDA kuruluyor —
      `publicImageUrl` `R2_PUBLIC_BASE_URL`i okuyor ve o env tarayıcıya gitmiyor. Ürün ekranı da
      aynısını yapıyor (`ProductView.imageUrl`); kuyruk kendi yolunu icat etmiyor.
    - Karar VERİLMİŞ öneride kapak yükleme kapalı (`uploadCover` verilmiyor): arşiv satırı okunur bir
      kayıttır.
  - **"Ürünü güncelle" FK ihlaliyle düşüyordu — auth kimliği profil kolonuna yazılmış** *(kullanıcı
    11.08: `assistant_proposal_decided_by_fkey [23503]`)*. `decided_by` `user_profiles`'a FK'li
    (`0042_assistant_proposal.sql`), oysa `updateProductAction` `withProposal`a `staff.id`yi (auth
    kimliği) geçiyordu — 22.14'te yazılmış bir hata; öteki beş `withProposal` çağrısı zaten
    `profileId` geçiyordu. **Arızayı `lib/guard`ın 04.11'de kurduğu nöbet yakaladı:** dev bypass iki
    kimliği ayrı tutuyor, o yüzden yanlış kolon ilk gerçek denemede patlıyor (aynı kod tek kimlikli
    bypass'ta sessizce çalışırdı). Süpürmede aynı sınıftan iki yer daha çıktı ve düzeltildi:
    kuyruğun kendi karar yolu (`claimForApply` + ret damgası — yani "Uygula"/"Reddet" de aynı hatayı
    verecekti) ve yorum moderasyonu (`product_feedback.moderated_by`). **Ham veritabanı mesajının
    ekrana çıkması ayrı bir konu ve bilinçli** (`lib/error` künyesi, denetim 09.08): operasyon
    yüzeyinde personel kısıt adını görür — kaldırılırsa teşhis kaybolur.
  - **Dilekçe sütununun üç gürültü kaynağı, üç karar** *(kullanıcı ölçümü 11.08: "dil konusu burayı
    çok karmaşık gösteriyor ve bu iç içe JSON yapıların hepsinde aynı duruma sebep olacak" +
    "besin künyesi de var… dolayısıyla asistanın önerisi değil hepsi")*
    - **Dil bir EKSEN oldu, üç satır değil.** Çok dilli her alan üç çocuk satır doğuruyordu; on
      alanlı bir dilekçe kırk satıra çıkıyordu. Artık ağacın tepesinde tek dil seçici var, her alan
      seçili dilde tek satır. **Eksik gizlenmiyor, SAYILIYOR:** sekmenin yanındaki sayı o dilde boş
      kalan alan adedi ("FR 2" = iki alan Fransızcasız). Bu, "eksik alan da gösterilir" ilkesinin
      daha okunur hâli — üç satır yerine tek sayı.
    - **İç içe yapı KATLANIR.** Nesne ve nesne dizileri açılıp kapanan başlık; kapalıyken kaç
      alan/kalem taşıdığını söyler. Derin yapı sütunu boydan boya doldurmuyor.
    - **BAĞLAM ÖNERİ DEĞİLDİR.** Ölçüldü: `product_draft` dilekçesinde `fields` yalnız
      `name` + `description` taşıyor (asistanın gerçekten yazdıkları), `current_fields` ise yedi
      alan — ad, açıklama, içindekiler, saklama, besin künyesi, alerjenler, izler. Ağaç ikisini aynı
      tonda basınca "hepsi öneri" gibi okunuyordu. Artık kökteki bölümler ne olduklarını söylüyor
      ("onaylarsan bunlar yazılır" ↔ "karşılaştırma için — asistan dokunmuyor") ve bağlam bölümü
      KAPALI doğuyor.
  - **Gerekçe künye satırına taşındı ve büyüdü** *(kullanıcı kararı 11.08: "asistan notunu asistan
    metninin yerine alalım, saat kalsın yanına yazalım, fontunu da büyütelim — çünkü bu aslında bize
    asistanın bir mesajı")*. "asistan" kelimesi kalktı: kuyruktaki her öneri zaten asistanın, kelime
    bilgi taşımıyordu. Künye artık `<saat> · <gerekçe>` ve gerekçe bir gövde punto büyük.
  - **Gerekçede makine kimliği vardı** *(kullanıcı 11.08: "neden alt çizgi var?")*. Ekranda
    *"catalog_health: lang eksik. İsim ve açıklama 3 dile tamamlandı."* yazıyordu. Çizim değil,
    asistanın kendi cümlesi: dayandığı OKUMA ARACININ adını (`catalog_health`) ve o aracın
    döndürdüğü eksik-parça anahtarını (`lang`) olduğu gibi yapıştırmış. İkisi de makine kimliği ve
    cümleyi yarı Türkçe bırakıyor. Kural MCP talimat metnine yazıldı: `reason` patrona AYNEN
    gösterilir, düz Türkçe tek cümle, araç adı/alan anahtarı/snake_case yok, dayandığı sayılar var.
    Araç açıklamalarına tek tek yazılmadı — on propose aracı var, biri mutlaka ayrışırdı.
    **Kuyrukta duran öneriler eski metinleriyle kalır**; kural bundan sonrakiler için.
  - **Sarmalayan kart üç gövdeden de kalktı** *(kullanıcı: "ürün formu ve asistan önerisi kart
    içinde kart şeklinde görünüyor; en dıştaki kartı kaldır")*. Panellerin kendi kenarlığı zaten
    vardı; dıştaki kabuk ikinci bir kenarlık ve ikinci bir dolgu ekliyordu. Üçünde birden yapıldı,
    çünkü desen üçünde de aynıydı ve biri kalsaydı tipler arası geçişte fark göze çarpardı.

- [x] (22.16) **Yeni ürün önerisi de kuyruğun içinde — `product_draft` ile AYNI gövde** *(kullanıcı
  sorusu 11.08: "yeni ürün ile ürün düzenleme ayna diyaloğu kullanabilir değil mi?")*
  `touches: apps/web/app/(operations)/operations/assistant/{assistant-body.tsx,bodies/product-draft-body.tsx} · apps/web/lib/catalog/product-actions.ts · apps/web/app/(operations)/operations/products/tabs/product/ · packages/application/src/assistant/kind-meta.ts`
  - **Durum:** yapıldı. Cevap "evet"ti ve zaten büyük kısmı hazırdı: ürün ekranında da tek diyalog
    iki işi görüyor (`ProductFormDialog`, `mode: 'create' | 'edit'`), şema ailesi ortak, görsel
    bloğu `productId: null` hâlini zaten biliyor (kapak yükleme kilitli, galeri şeridi çizilmiyor).
  - **İkinci gövde dosyası YAZILMADI.** `ProductDraftBody` iki tipe birden hizmet ediyor; değişen üç
    şey `assistant-body`de duruyor — açılış değeri (kayıt ↔ boş şablon), kaydeden kapı (güncelle ↔
    oluştur), düğmenin adı. Ayrımın ölçütü de uydurulmadı: `product_create` dilekçesinde `productId`
    YOK, gövde bunu okuyor. Tipi ayrıca geçirmek ikinci bir gerçek olur ve bir gün ayrışırdı.
  - **`createProductAction` `lib/catalog`e taşındı** (`withProposal` + `proposalId`), ürün
    sekmesinin kendi `actions.ts`i böylece BOŞALDI ve silindi — üç dalganın (güncelleme 22.14,
    görsel eylemleri 11.08, oluşturma 22.16) sonu. Doğan ürünün kimliği `result`a yazılıyor
    (`productId`), köprü onunla kuruluyor.
  - **Açılış değeri: form varsayılanları + dilekçe.** Dilekçenin `null` bıraktığı alan varsayılanı
    EZMEZ — şemada `null` "asistan okuyamadı" demek (`shippable` künyesi: bilinmiyor ile "hayır"
    ayrı şeyler). KDV formda dizge, dilekçede sayı; dönüşüm tek noktada.
  - **Mod `inline` oldu ama "ADAY doğar" cümlesi KORUNDU** ve bu bilinçli: satış durumu seçicisi
    kuyrukta yok (kuyruk içeriği yazar, satış eksenine dokunmaz), yani öneriden doğan ürün gerçekten
    aday doğuyor. `product_draft`taki devri körü körüne uygulamak, var olan bir kısıtı yok saymak
    olurdu. Test bunu makineyle tutuyor (`proposal.test.ts`: `impact` içinde "ADAY" geçmeli).
  - **Ekran doğrulaması YAPILDI ve uçtan uca çalıştı.** İki `product_create` önerisi uygulandı;
    ölçüm: adlar üç dilde, kategoriler doğru, KDV %5,5, Kadayıf DDM 365 gün · 2 boy (500g → net
    500 g, 1000g → net 1000 g), Gözleme DLC 120 gün · 1 boy (3'lü paket → paket içi 3) ve **kargo
    kapalı** (asistan saklama talimatından çıkarmış).
  - **AMA ürünler SATIŞTA doğdu — ekran "ADAY doğar" diye söz veriyordu** *(ölçüldü 11.08:
    `status: active`, üstelik `is_incomplete: true`)*. Sebep formun varsayılanıydı (`active`) ve
    kuyrukta durum seçicisi olmadığı için sessizce satışa çıkarıyordu. **Düzeltme kuyruğa değil
    FORMA yapıldı** (`buildDefaults(null)` → `candidate`): aynı yanlış elle oluşturmada da vardı,
    "Yeni ürün" diyaloğu da Satışta doğuruyordu. Yeni ürün artık iki yüzeyde de **Aday** doğar —
    fiyatı ve stoğu henüz yok, beyanı çoğu zaman eksik; yayına almak durum seçicisinin kararı.
    "Pasif" değil "Aday", çünkü pasif geri çekilmiş kaydın hâli, aday henüz tamamlanmamışın.
  - **BEKLEYEN(BACKLOG §1):** beyanı eksik ürün müşteri yüzeyinde SÜZÜLMÜYOR — vitrin okuması yalnız
    `status = 'active'` bakıyor, `is_incomplete` kapısı yok. Fiyat ve stok girilse yasal beyanı
    olmayan ürün satışa çıkardı. Sipariş/vitrin şeridinin alanı; kullanıcıya bildirildi.

- [x] (22.17) **"Fırsat" müşterinin kelimesi, operasyonunki "Teklif"** *(kullanıcı tespiti 11.08:
  "bu fırsat ifadesi müşteri için; bizim için aslında stok eritme — eritilmesi gereken bir stoku
  eritmeye çalışıyoruz, o yüzden fırsat kelimesi çok garip")*
  `touches: packages/application/src/assistant/kind-meta.ts · apps/web/app/(operations)/operations/assistant/assistant-body.tsx`
  - **Durum:** yapıldı. Ölçüm tutarsızlığın dar olduğunu gösterdi: operasyon yüzeyi zaten "Teklif"
    diyor (stok ekranı "Teklif açık", teklif diyaloğu, teklif fiyatı) — müşterinin kelimesi yalnız
    kuyruğun rozetine sızmıştı. Rozet `Teklif` oldu; müşteri yüzeyi `messages.json`'daki "Fırsat"ı
    korudu. **İki yüzey iki ayrı şey vaat ediyor ve aynı kelimeyi paylaşmak zorunda değil.**
  - Uygulama sonrası cümle İKİ dili birden taşıyor ("teklif açıldı… müşteri yüzeyinde Fırsat olarak
    görünüyor"): bağı operatör kendisi kurmak zorunda kalmasın.
  - Kullanıcının seçeneği vardı ("Stok eritme" · "Teklif" · "SKT indirimi"); **"Teklif"** seçildi —
    operasyonun zaten konuştuğu dil, iki ekran arasında tam tutarlılık.

- [x] (22.18) **Formu olan ÜÇ tip daha kuyruğa taşındı: Paket · Tarif · Para** *(kullanıcı talimatı
  12.08: "içinde form kullanılan üç çevirmediğimiz öneri tipini tamamen çevir")*
  `touches: apps/web/components/operation/form/{bundle-form,recipe-form,movement-form} · apps/web/lib/catalog/{bundle-actions,recipe-actions,variant-options}.ts · apps/web/lib/finance/actions.ts · apps/web/app/(operations)/operations/assistant/bodies/{bundle-draft-body,recipe-draft-body,money-movement-body}.tsx · packages/application/src/assistant/kind-meta.ts`
  - *Bitti:* üçünde de öneriye basınca hedef ekranın GERÇEK formu kuyruğun içinde açılıyor; kaydeden
    kapı yine varlığın kendi eylemi ve `withProposal` kuyruk satırını kapatıyor
  - **Durum (12.08):** 11 tipin 7'si inline oldu (önceki dördüne bu üçü eklendi). Kalan dört tip:
    `featured_flag` (tek tık, formu yok) · `purchase_order` · `stock_intake` · `zone_extend`.
  - **ÖNCE AYRIM, SONRA BAĞLAMA — ve ayrım işin büyük yarısıydı.** Üç formun üçü de kendi
    diyaloglarının içine gömülüydü (RHF kurulumu + sunucu okuması + `Dialog` kabuğu + JSX tek
    dosyada). Kopyalamak dört kez bedelini ödediğimiz sınıftı; gövdeler `components/operation/form/`
    altına ayrıldı ve diyaloglar onları kullanmaya başladı. **Davranış değişmedi** — ayrım
    typecheck/lint/knip ve birim testlerle doğrulandıktan SONRA kuyruğa bağlandı.
  - **ŞEMA VE TİPLER DE TAŞINDI, kopyalanmadı.** `BundleView`/`VariantOption` (ürün sayfası),
    `RecipeFormSchema` (tarif sayfası), `ManualMovementSchema` + `MANUAL_TYPE_VIEW` +
    `QUICK_CATEGORIES` (finans sayfası) form klasörlerine geçti; sayfalar gerektiği yerde yeniden
    ihraç ediyor. Sebep tek: bir komponentin sayfa klasöründen okuması TERS yönlü bağımlılıktır ve
    `docs:check §3e` kardeş sayfadan import'u zaten yasaklıyor.
  - **EYLEMLER `lib/`'e ÇIKTI** (`bundle-actions` · `recipe-actions` · `finance/actions`): server
    action'lar kural gereği sayfada kolokasyon eder, ama artık tek sayfaya ait değiller.
    `createBundleAction` ve `saveRecipeAction` `proposalId` aldı; `recordManualMovementAction`
    zaten alıyordu (devir yolundan).
  - **`variantOptionsForProducts` de ortak alana çıktı:** `bundle-actions` içinde özel bir
    fonksiyondu ve üçüncü çağıranı doğdu (kuyruk). `'use server'` bir modülden yardımcı dışa vermek
    onu tarayıcıya açılan bir uca çevirirdi — o yüzden `lib/catalog/variant-options.ts`.
  - **PAKET havuzu KUYRUK SAYFASINDA okunuyor** (`AssistantFormOptions.bundleVariants`): kalem satırı
    ad, birim fiyat ve marj gösteriyor ve bunlar dilekçede yok. Gövde kendi okumasını açsaydı her
    öneri kartı ayrı bir tur atardı. **TARİFTE gerek yok** — dilekçe `productName` taşıyor (ölçüldü)
    ve satır bir seçici + adetten ibaret.
  - **ÜÇ ETKİ CÜMLESİ DE DÜZELTİLDİ, çünkü ikisi artık yalan söylüyordu:** paket "PASİF doğar"
    diyordu (durum seçicisi formda), tarif "malzeme ve adım düzenlemesi tarif ekranında" diyordu
    (ikisi de kuyrukta). **Tarifin "PASİF doğar"ı KORUNDU** ve bu bilinçli: yayın ayrı bir karar ve
    ayrı bir eylemi var (05.16). Para için devrin gerekçesi de korundu — "defter silinemez, karar
    ÖNCESİ düzenleme şart" şartı kalkmadı, yalnız formun DURDUĞU yer değişti.
  - **TRANSFER hâlâ devirle:** `money_movement` payload'ı `type: 'transfer'` taşıyorsa gövde formu
    hiç açmaz — iki hesap ister ve kendi kapısı vardır. Kuyruğa uymayan bir kararı zorla oraya
    sığdırmak, yanlış doldurulmuş bir defter satırı demekti.
  - **BEKLEYEN(22.19): üç ortak kontrol `disabled` taşımıyor** — `BundleItemsEditor` · `FormSwitch` ·
    `MultiToggle`/`FormSelect`. Karar VERİLMİŞ bir öneride kalem satırları, vitrin anahtarı ve hesap
    seçicisi düzenlenebilir GÖRÜNÜYOR (yazım engelli, alt bar kapalı — ama ekran bunu söylemiyor).
    Ürün formunda da aynı iş ayrı turda yapılmıştı; üçü tek turda geçilecek.

- [ ] (22.19) **Ortak form kontrollerine `disabled`** — karar verilmiş öneride form GERÇEKTEN kilitli görünsün
  - *Bitti:* `readOnly` bir öneride kalem satırları, anahtarlar ve seçiciler düzenlenemez görünüyor
  - **Neden açık bir madde:** bugün yazım engelli (alt bar kapalı, `disabled` gövdeye iniyor) ama üç
    ortak kontrol bayrağı TAŞIMIYOR: `BundleItemsEditor` (dört düğme + iki alan) · `FormSwitch` ·
    `MultiToggle` ve `FormSelect`. Operatör arşivdeki bir kararı açtığında kutulara yazabiliyor,
    yazdığı hiçbir yere gitmiyor — ekranın söylediği ile sistemin yaptığı ayrışıyor.
  - Ürün formunda aynı iş 22.14'te ayrı bir turda yapılmıştı (`LocalizedTextField` · `MultiSelect` ·
    `EmphasisTextarea`); bu üçü de aynı desenle geçilecek. İş mekanik, kapsamı dar.

- [x] (22.20) **Tarif formu dil kartına geçti, adım numarası kaynağında kırpılıyor** *(kullanıcı
  tespiti 12.08: "bu form hazırlanışı itibariyle komple yanlış … her input'un dil tabı ayrı değil
  grup halinde olmalı")*
  `touches: apps/web/components/operation/form/recipe-form/body.tsx · apps/web/app/(operations)/operations/recipes/{recipe-dialog.tsx,recipes-labels.ts} · apps/web/app/(operations)/operations/assistant/bodies/recipe-draft-body.tsx · apps/backend/src/mcp/{server-factory.ts,tools-propose.ts} · packages/helper/src/rich-text.ts`
  - *Bitti:* tarifin yedi metin alanı TEK dil sekmesiyle değişiyor; kuyruğa yazılan adımlar
    numarasız; iki yüzeyin alan açıklamaları tek yerden geliyor
  - **Dil TEK yerden seçilir.** Her alan kendi sekmesini çiziyordu, üçlü künye (süre · porsiyon ·
    öğün) ise üç dili birden alt alta yığıyordu: Fransızcayı tamamlamak için yedi ayrı sekmeye tek
    tek basmak gerekiyordu ve hangi alanın hangi dilde eksik kaldığı ekranda görünmüyordu. Alanlar
    ürün/kategori formunun kullandığı `LocaleCard`'a alındı — **yeni komponent yazılmadı.**
    Malzemeler kartın DIŞINDA: kart "dile bağlı olan" demek, malzeme satırı ise ürün kaydını
    gösteriyor ve adı müşteriye kendi dilinde çözülüyor.
  - **Numarayı ekran veriyordu, asistan da veriyordu.** Sebep bizdeydi: `propose_recipe_draft`
    açıklaması modelden numaralı satır İSTİYORDU (*"write the steps as numbered lines"*), oysa hem
    operasyon önizlemesi hem müşteri detayı `index + 1` basıyor — müşteri sayfasına
    **"1. 1. Baklavayı ısıtın"** olarak çıkacaktı. Açıklama düzeltildi ve kuyruk kapısı ayrıca
    kırpıyor (`stripLineOrdinals`, `@lezzet/helper`): modelin biçim alışkanlığına güvenip veriyi ona
    bırakmak, düzeltilmesi kayıt üstünde kalan bir hata biriktirirdi. Kırpma YAZARKEN yapılıyor,
    okurken değil — gösterimde kırpsaydık dışa açılan her yeni okuma aynı arızayı yeniden bulurdu.
    Kuyrukta bekleyen iki eski öneri de aynı desenle temizlendi.
  - **`notes` parametresi KALKTI** (duplikasyon): iki çağıran aynı kutuya iki ayrı cümle veriyordu —
    tarif ekranı "her satır bir adım", kuyruk "her satır bir madde"; malzeme başlığı birinde fiyatın
    nereden okunduğunu söylüyor, ötekinde söylemiyordu. Alanın nasıl doldurulacağı alanın kendi
    bilgisi; cümleler gövdeye taşındı ve `BEKLEYEN(22.18)` işareti kapandı.
  - **Ölçülüp kapatılan şüphe:** müşteri tarif detayında ürün adları seçili dilde geliyor
    (`storefront/recipe.ts` → `resolveLocalizedText(product.name, locale)`; boy etiketi de
    `toVariant(…, locale, …)`). Mobil uç da aynı okumayı `locale` ile çağırıyor ve dili varsayılansız
    zorunlu tutuyor. Tek sınır: ürün adı o dilde boşsa yedek zincir TR'ye düşer — tarifin üç-dil
    yayın kısıtı ürün adlarını KAPSAMIYOR.

- [x] (22.21) **Çeviri düğmesi alanın kendi yeteneği oldu · onay ekranının üç görüntüleme arızası** *(kullanıcı
  tespitleri 12.08: "etiketin yanında otomatik kendisi çıkıyor olması lazım" · "burada bazı problemler var gibi")*
  `touches: apps/web/components/operation/form/localized-text-field.tsx · apps/web/components/operation/form/product-form · apps/web/components/operation/form/bundle-form/body.tsx · apps/web/components/operation/ui/{proposal-aside,payload-tree}.tsx · apps/web/app/(operations)/operations/assistant/bodies/money-movement-body.tsx · apps/backend/src/mcp/{tools,tools-propose}.ts`
  - *Bitti:* çok dilli her alanda çeviri düğmesi kendiliğinden çıkıyor; para künyesi doğru tutarı,
    Türkçe biçimde ve okunur enum'larla gösteriyor
  - **`onAiTranslate` KALKTI — düğme prop ile açılan bir şey olmaktan çıktı.** Aynı satır
    (`onAiTranslate={(t) => suggestTranslationAction(t, 'ad')}`) YİRMİ yerde tekrar ediyordu; iki form
    gövdesi (`product-form` · `bundle-form`) prop'u zincirle iç alanlara dağıtıyor, dört kap da kendi
    `aiTranslate` lambda'sını kuruyordu. Bedeli görünürdü: **yazmayı unutulan alanda düğme sessizce yok
    oluyordu** — tarifin süre/porsiyon/öğün kutuları böyle çevirisiz kalmıştı ve "3–4 kişilik" Fransız
    müşteriye Türkçe gidiyordu (yayın kapısı yalnız ADA bakıyor, künye alanları eksik kalsa da tarif
    yayınlanıyor). Alan artık yalnız TÜRÜNÜ söylüyor (`field="ad"`), çağrıyı komponent yapıyor.
    04.08'de kazanılan ton ayrımı korundu — ad · açıklama · içindekiler · saklama hâlâ ayrı ölçülerde.
  - **Para künyesi 100 kat küçük yazıyordu:** `money(payload.amountCents / 100)` — dilekçenin centi
    euroya bölünüp cent bekleyen biçimlendiriciye veriliyordu, 150,00 € ekranda **"1,50 €"** oluyordu.
    Formun eurosu da cent sanılmıştı. Paket künyesindeki tuzağın (22.18) tersi; çevrim artık sınırda.
  - **Euro biçimi elle kuruluyordu, BEŞ yerde:** `(cents / 100).toFixed(2)` Türkçede yanlış ayraç
    veriyor ve öneri başlığı "150.00 €" diye okunuyordu. Hepsi `formatPrice(cents, 'tr')`e geçti
    (`@lezzet/helper`; backend'e bağımlılık bu turda eklendi). Paket özetinde `toCents` de gerekti —
    paket ailesi euro taşıyor.
  - **Dilekçe ağacı enum'ları ham basıyordu:** "Yön: out", "Tür: expense" — üstündeki künye satırı aynı
    şeye "Hesaptan çıktı" derken. Alan adı + değer çiftiyle eşleşen sözlük eklendi (`ENUM_LABEL`);
    karşılıklar formların kendi kelimeleri, yeniden adlandırma yok. Sözlükte olmayan enum ham kalıyor:
    uydurma çeviri, olmayan bir alanı varmış gibi gösterirdi.
  - **Künye satırı artık sapmada konuşuyor** (kullanıcı kararı): Tutar · Hesap · Yön hem künyede hem
    ağaçta yazıyordu. `now` taşıyan satır yalnız değiştirildiğinde çiziliyor; `now` taşımayan satır
    (türetilmiş özet — "asistan hangi beyanları doldurdu", "kaç dil dolu") hep duruyor, çünkü ağaçta
    karşılığı yok. Para künyesinde Hesap ve Yön'e canlı değer bağlandı, yoksa sapmaları görünmezdi.

- [x] (22.22) **Transfer önerisi de kuyruğun içinde — para tipinin İKİNCİ hâli** *(kullanıcı tespiti
  12.08: "ikinci öneride form bu şekilde açılıyor, sağlıklı bir şekilde yüklenmeli fiyat bilgisi")*
  `touches: apps/web/components/operation/form/transfer-form · apps/web/app/(operations)/operations/finance/{transfer-dialog.tsx,finance-types.ts} · apps/web/app/(operations)/operations/assistant/{assistant-body.tsx,bodies/transfer-body.tsx} · apps/web/lib/finance/actions.ts · apps/web/lib/assistant/form-options.ts · apps/web/components/operation/form/{select.tsx,form-select.tsx}`
  - *Bitti:* transfer önerisi kuyrukta kendi formuyla açılıyor, dilekçenin tutarı ve iki hesabı dolu
    geliyor, kayıt `withProposal` ile kuyruk satırını kapatıyor
  - **Yarım bir devir, devir değildi.** `money_movement` 22.18'de `inline` oldu ama transfer hâli
    dışarıda bırakılmıştı: gövde "formu açmam" diyor, çerçeve ise BOŞ BİR TABAN formla açıyordu —
    tutar boş, tür "Sınıflandırılmadı", yön "Hesaba girdi" ve künyede **500,00 € → 0,00 €**, yani
    dilekçe operatör silmiş gibi görünüyordu. Niyet doğruydu (uydurma değerlerle açılan form yanlış
    bir defter satırı demektir) ama ekranda olan bambaşkaydı.
  - **İki hâl, iki form, TEK tip.** Elle giriş tek hesap + bir yön sorar, transfer iki hesap sorar ve
    yön sormaz; tek forma sıkıştırmak "para ne yaptı" sorusunu transferde anlamsız bırakırdı
    (`transfer-dialog` kararı korundu). Çatal çerçevede: taslak **ayrımcı birleşim** (`MoneyDraft`),
    çünkü düz bir nesnede her hâl ötekinin boş alanlarını da taşırdı. Ayrı bir öneri KİND'i
    açılmadı — şemayı ve asistanın araç kataloğunu ikiye bölerdi.
  - **Yön dilekçeden OKUNUR, varsayılmaz:** `direction: 'out'` ise `accountId` kaynak, `in` ise
    hedeftir. Sabit bir sıra yazsaydık "kasaya nakit çek" önerisi ekranda "kasadan bankaya" diye
    açılırdı — ve o hata bakiyeleri İKİ KAT kaydırır.
  - **Bakiye önizlemesi kuyrukta da var:** `AssistantFormOptions.accounts` artık `balanceCents`
    taşıyor (`account_balance` görünümü, ek tur yok). Transferin en sık hatası yanlış yön ve tek
    emniyeti sonucu kaydetmeden önce okumak.
  - **`Select`/`FormSelect` `disabled` kazandı** — 22.19'un üç maddesinden biri kapandı. Karar
    verilmiş bir öneride hesap seçicisi açılıyor, operatör bir seçenek işaretliyor ve seçtiği
    hiçbir yere gitmiyordu.

- [~] (22.23) **Mal kabul kuyruğun içinde — fatura fotoğrafından tek kararla stok girişi** *(kullanıcı
  kurgusu 12.08: "MCP ajanına ekran görüntüsü gönderip 'bu ürünlerin depo kabulünü yaptık' derse … kullanıcı
  bunları düzenleyip kaydet deyip hepsinin depo girişini yapabilecek")*
  `touches: apps/web/components/operation/form/intake-form · apps/web/app/(operations)/operations/assistant/bodies/stock-intake-body.tsx · apps/web/app/(operations)/operations/assistant/assistant-body.tsx · apps/web/lib/warehouse/{intake-actions.ts,intake-costs.ts} · apps/web/lib/assistant/form-options.ts · packages/application/src/assistant/kind-meta.ts`
  - *Bitti:* fatura önerisi kuyrukta satırlarıyla açılıyor, adet/SKT/lot/raf ve **birim alış** düzenlenebiliyor,
    tek kararla partiler stoğa giriyor
  - **Öneri üretimi zaten hazırdı, eksik olan tek adım formdu.** `propose_stock_intake` çok kalemli ve
    okunanı DOĞRULUYOR (varyant var mı, depo kodu geçerli mi, her satırda tarih var mı); talimatı SKT ve
    lot uydurmayı yasaklıyor, okunamayan alanı `uncertainFields`e yazdırıyor. Kaydeden kapı da `proposalId`
    alıyordu. Devir gerekçesi ("geri alınamaz, gözle doğrulanmalı") kalkmadı — doğrulama hâlâ karardan
    önce, yalnız formun yeri değişti. **Geriye tek devir kaldı: bölge** (kararın konusu haritada).
  - **ALIŞ FİYATI KUYRUKTA GÖRÜNÜR VE DÜZELTİLEBİLİR** (kullanıcı kararı 12.08). Depo ekranı fiyatı
    görmez ve bu bir ekran kuralı değil TİP sınırı (`IntakeFormLine` fiyatsız, `PurchaseIntakeLine`
    fiyatlı — "iki ayrı tip, iki ayrı kapı"). Devir yolunda maliyet sunucuda dilekçeden eşleştiriliyor
    (`costsForLines`); kuyrukta ise formdan gidiyor, çünkü fatura yanlış okunmuşsa düzeltilebilmeli.
    Kuyruğun kapısı bu yüzden AYRI (`receiveIntakeFromProposalAction`): ortak eyleme isteğe bağlı bir
    fiyat alanı eklemek, tip sınırını yalnız iyi niyetle ayakta bırakırdı.
  - **Mutabakat satırı:** satırların toplamı ↔ belgenin kendi yazdığı toplam, fark ayrıca. Fark bir hata
    değil bir SORU — nakliye mi, iskonto mu, okunamayan bir satır mı. Fiyatı bilinmeyen satır toplama 0
    olarak girmez, "eksik" sayılır: bilinmeyen bir maliyeti sıfır saymak mutabakatı sessizce doğru
    gösterirdi (`CLAUDE §1`).
  - **Satır editörü ortak alana ayrıldı** (`intake-form/`), fiyat kolonu `showCost` ile açılıyor — rampadaki
    depo ekranı istemez, kuyruk ister. Depo VARSAYILANSIZ (`CLAUDE §1`): kabul deposuz yazılamaz.
  - **FATURA TARİHİ ARTIK KAYDA GEÇİYOR.** Dilekçe `date` taşıyor, kapı (`receivePurchase`) `date`
    alıyor — ama HİÇBİR yol ikisini bağlamıyordu (ölçüldü 13.08): kabul her hâlde bugüne yazılıyordu.
    Şemanın kendi künyesi bunu uyarıyordu bile (*"fatura dünkü olabilir ve genelde öyledir; yanlış
    tarihe yazılan kabul stok yaşını ve dönem mutabakatını sessizce kaydırır"*). Forma "Belge tarihi"
    alanı eklendi ve kapıya geçiyor; boş bırakılırsa kapı bugüne yazar.
  - **BEKLEYEN(22.24): ölü kalan iki devir yolu.** `finance-handoff` ve `receiving-handoff` hâlâ kodda ama
    ikisi de artık `inline`; `?proposal=` linki elle yazılmadıkça tetiklenmiyor. Sökülmesi ekranların
    `handoff` prop'unu da kaldırmayı gerektiriyor, bu turda kapsam dışı bırakıldı.
  - **DURUM 13.08 — ÖNERİ ONAYLANMADI, forma geri dönülecek** *(kullanıcı: "mal kabul öneri diyaloğunu
    kabul edemiyorum")*. Yazma yolu (kapı · fiyat · tarih · mutabakat) ayakta ve doğru; reddedilen
    FORMUN KENDİSİ. İki gerekçe: **(a)** mal kabul, ortak komponent havuzunu kullanmıyor — SKT alanı
    ham `<input type="date">` olarak yeniden çizilmiş, oysa `DateField` var; öteki formlar diyalog
    kurgusuna oturmuşken bu form kendi düzenini kurmuş. **(b)** Mal kabul · stok · stoktan düşme
    **üç ayrı sayfaya** yayılmış, oysa üçü tek işin üç anıdır. Bu yüzden form tek başına düzeltilmiyor:
    üç ekranın birleşimiyle birlikte ele alınacak → **BEKLEYEN(22.26)**.

- [ ] (22.24) **Ölü devir yollarını sök** — `finance-handoff` · `receiving-handoff` ve ekranların `handoff` prop'ları
  - *Bitti:* devir okuması yalnız `zone_extend` için kalır; iki ekran `?proposal=` parametresini artık okumaz
  - Para (22.18) ve mal kabul (22.23) kuyruğa taşınınca bu iki yol ölü kaldı: kuyruk devir düğmesi
    çizmiyor, yani kimse oraya yönlenmiyor. Bugün zararsızlar ama okuyan ajana "bu tip devrediliyor"
    diye yanlış bilgi veriyorlar — ve bir gün biri o yolu düzeltmeye çalışır.

- [x] (22.25) **Mal kabul ekranı da ortak satır editörüne geçsin** — `FreeIntake` ↔ `intake-form/body`
  - *Bitti:* iki yüzey aynı satır editörünü kullanır; "adet boşsa kabule girmez" ve SKT zorunluluğu tek yerde
  - Kuyruk 22.23'te ortak gövdeye geçti, depo ekranı geçmedi: aynı satır iki yerde çiziliyor ve bir gün
    biri ötekinden ayrışacak. Geçiş `IntakeRow` state modelini değiştirmeyi gerektiriyor — o model PO'lu
    kabulde de kullanılıyor (`expectedQty` · `isMissing`), yani iş mekanik değil.
  - **14.08 kapandı — 22.26'nın içinde.** `FreeIntake` söküldü; siparişli kabul de irsaliyesiz kabul de
    `intake-form/body`yi kullanıyor. Kip ayrı bir bayrakla değil satırın `expectedQty`siyle okunuyor:
    ikinci bir bayrak, veriyle çelişebilecek ikinci bir gerçek olurdu.

- [x] (22.26) **Depo yüzeyi TEK SAYFA — mal kabul · stok · stoktan düşme bir araya** *(kullanıcı tespiti
  13.08: "bu üçü bir sayfa olması gerekirken üç sayfaya yayılmış … komponentler ortak komponent
  havuzundan kullanılmamış, yeniden tasarlanmış")*
  `touches: apps/web/app/(operations)/operations/{receiving,stock,temperature} · apps/web/components/operation/form/{intake-form,date-field.tsx} · apps/web/lib/warehouse · packages/database/src/services/purchase-order.service.ts`
  - *Bitti:* depo işi tek rotadan yürür; üç ekranın satır editörü ve alan komponentleri **ortak havuzdan**
    gelir; asistan kuyruğundaki mal kabul formu aynı düzeni kullanır ve onaylanabilir hâle gelir
  - **Neden tek sayfa:** üçü ayrı ekran değil, tek stoğun üç anı — mal GİRER, DURUR, ÇIKAR. Operatör
    "elimde ne var" sorusunu bir sayfada, "bunu düş" kararını başka sayfada veriyordu.
    **Karar zaten verilmişti, uygulanmamıştı:** `design/pages/admin-stok.md` 01.08'de sayfayı dört
    sekmeye kurmuş (Seviyeler · Yaklaşan tarihli · Mal kabul · Çıkışlar) ve gerekçesini paranın
    emsaline dayamış (`DOMAIN §7` — "kasa hareketi ile banka hareketi aynı şeydir, yalnız hesabı farklı").
  - **Ayrı sayfaların dayanağı DÜŞMÜŞ bir varsayımdı:** *form depocunun telefonunda, kayıt yöneticinin
    masaüstünde*. 06.08'de operasyon web'i masaüstü-yalnız oldu (telefon native uygulamanın işi), yani
    ayrım kendi gerekçesini kaybetti ama sayfalar kaldı.
  - **Dört sekme + iki diyalog.** `/operations/receiving` → `?tab=intake`e yönlendiriyor, nav'da tek
    "Stok" satırı kaldı. Kabul ve düşüm formları liste ÜSTÜNDE diyalogda (bu ekranın kendi deseni:
    teklif diyaloğu, lot sorgusu) — kullanıcı kararı 13.08.
  - **Rol daralması ekranın değil KAPININ işi** (kullanıcı kararı 13.08: "aynı sayfa, role göre
    daralır"). Alış fiyatı kolonu depo-üstü kapsamda çiziliyor; kaydeden kapı kapsamı YENİDEN sorup
    depoya bağlı personelin gönderdiği maliyeti düşürüyor (`receiveIntakeAction`). Ekran gizlemek bir
    yetki kontrolü değildir. Tip duvarı yerinde: `IntakeFormLine` fiyatsız, `PurchaseIntakeLine` fiyatlı.
  - **SATIR EDİTÖRÜ ARTIK TEK** — 22.25 burada kapandı. `FreeIntake` söküldü; siparişli kabul de
    irsaliyesiz kabul de aynı gövdeyi kullanıyor (`intake-form/body`), kip satırın `expectedQty`sinden
    okunuyor. "Gelmedi" beyanı boş adetten ayrı bir alan olarak şemaya girdi.
  - **ORTAK HAVUZ İHLALİ KAPANDI** (kullanıcının tespiti). SKT ham `<input type="date">` ile
    çiziliyordu — oysa `date-field.tsx`in kendi künyesi onu yasaklıyor (tarayıcı takvimi her platformda
    başka görünür, dili tarayıcının dilidir). Kural vardı, **satır içi karşılığı yoktu**: `DateInput`
    (etiketsiz, `sm`) eklendi ve `DateField` onu sarmalıyor. Üç ihlalin üçü de düştü.
  - **SICAKLIK KAYDI AYRI KALDI** ve yolu düzeldi (`/operations/adjustments` → `/operations/temperature`):
    hijyen defteri bir stok hareketi değil, tesisin günlük kaydıdır. Kalıcı evi açık → `BEKLEYEN(22.29)`.
  - **Ölü devir yolunun MAL KABUL yarısı söküldü** (22.24'ten): `receiving-handoff` · `receiveGoodsAction`
    · `costsForLines` gitti — öneri kuyruğun içinde karara bağlanıyor, o yola yönlendiren düğme kalmadı.
  - **Yol üstünde bir N+1 kırıldı:** bekleyen sipariş kartları sipariş başına `getById` atıyordu;
    künyeler tek sorguda geliyor (`PurchaseOrderService.listOpen`). Sekme okuması da daraldı — her sekme
    yalnız kendi sorgularını atıyor, eskiden dört sekmenin verisi her açılışta okunuyordu.
  - **SEÇİCİLER KISALMIYORDU — üç tetikleyicide aynı hata** *(kullanıcı bildirimi 14.08: "stoktan düş
    diyaloğunun içindeki form diyalog içerisine sığmıyor")*. `truncate` vardı ama `min-w-0` yoktu:
    flex çocuğunun asgari genişliği varsayılan olarak İÇERİĞİ kadardır (`min-width:auto`), yani
    `overflow-hidden` verilse de kutu kısalmıyor. Uzun bir parti adı tetikleyiciyi, tetikleyici satırı,
    satır da pencereyi taşırıyordu. Düzeltme komponentlerin kendisinde (`Combobox` · `Select` ·
    `DateField` tetikleyicisi) — her çağıran kazanıyor; `MultiSelect` bunu zaten doğru yapıyordu.
    Ayrıca parti seçeneği tek uzun metin olmaktan çıktı: ad · ikinci satır (tarih · depo) · sağda adet.
  - **DURUM 14.08:** iskelet, iki form ve söküm tamam; doğrulandı (typecheck · lint · knip · boundaries
    temiz, birim 1358/1358). Eksik kalan iki liste ayrı maddede: `BEKLEYEN(22.27)` · `BEKLEYEN(22.28)`.
    Kullanıcı ekranda görmeden `[x]` yazılmıyor.

- [ ] (22.27) **Çıkışlar sekmesi TÜM çıkışları göstersin** — hazırlık · kapı satışı
  - *Bitti:* "bu dönemde ne çıktı" sorusunun cevabı tam olur; dönem toplamı eksik bir sayı vermez
  - Bugün sekme yalnız `stock_adjustment` kayıtlarını okuyor (imha · hasar · sayım farkı · kayıp ·
    stoğa geri alma). Tasarımın istediği küme daha geniş ama **hazırlık ve kapı satışının hareket
    kaydı YOK** (ölçüldü 14.08): stok siparişten doğrudan eriyor. Ekran bunu yazıyor, sessizce
    toplamıyor — eksik bir toplam, doğru bir toplam gibi okunurdu.
  - Sevk (`warehouse_transfer`) de burada: kaydı var ama listeye bağlı değil.

- [ ] (22.28) **Mal kabul sekmesine "kabul edilenler" listesi** — geçmiş girişler
  - *Bitti:* sekme iki bölüm olur (bekleyenler + kabul edilenler); "ne geldi" sorusu Stok'tan yanıtlanır
  - `stock_intake` için sayfalı bir okuma yok (bugün yalnız tedarikçi bazlı `listBySupplier`). Boş bir
    bölüm çizilmedi: veri olmadan başlık koymak, olmayan bir listeyi vaat etmektir.

- [~] (22.29) **Sıcaklık kaydının kalıcı evi** — Depolar mı, native uygulama mı
  - *Bitti:* ölçüm kaydı ait olduğu yüzeyde yaşar; `/operations/temperature` ya taşınır ya gerekçesiyle kalır
  - Ölçüm dolabın önünde, ayakta, tek elle girilir (`docs/uygulama` D-serisi) — asıl adayı native.
    Web'deki adayı Depolar sayfasının tesis künyesi. Bugün kendi sayfasında duruyor ve işlevi tam;
    karar verilmeden taşımak, ikinci kez taşımak olurdu.
  - **Durum (16.08) — İLK YARI CEVAPLANDI: kendi sayfası DEĞİL.** Kullanıcı ekranda gördü ve menüden
    kaldırttı (`ops-nav.ts`, `19.26` ile aynı turda). Gerekçe ekranın kendisiydi: tek form, tek
    "bugün" şeridi — günde bir-iki kayıtlık bir iş, menüde bir depo ekranıyla aynı ağırlıkta
    duruyordu. **Rota silinmedi**, `/operations/temperature` çalışmaya devam ediyor (ölçüldü: 200).
  - **Kalan yarısı: ölçüm NOKTALARININ nereye tanımlanacağı.** Bugün `temperature_log.location`
    serbest metin ve çipler geçmiş kayıtlardan türüyor — yani "Dolap 1" ile "Dolap1" iki ayrı
    noktadır ve hiçbir yer uyarmaz. Kullanıcı araç · soğutucu · buzdolabı tanımlarının **Depolar'ın
    içinde** yer alacağını söyledi (16.08); yeri kesinleşince form da oraya taşınır.
  - ⚠ **Ölçüldü 16.08 — `stock.location` ile `temperature_log.location` aynı kavram, ayrı tablo,
    ilişkisiz.** İkisi de serbest metin ve künyeleri bile aynı şeyi söylüyor (*"depo İÇİ konum
    (dolap/raf)"* ↔ *"depo İÇİ dolap adı / araç plakası"*). Veri örtüşmüyor: stok rafları
    `Dolap 1-4 · Soğuk oda · Karantina`, sıcaklık noktaları `Derin dondurucu 1-2 · Soğuk oda ·
    Frigo araç` — ortak tek isim "Soğuk oda". Yani **sıcaklığı ölçülen dondurucularda kayıtlı stok
    yok, stok tutulan dolapların sıcaklığı hiç ölçülmüyor**; soğuk zincir kanıtı ise malın DURDUĞU
    yerin ölçümüdür. Kullanıcı bu konuyu ayrıca ele alacağını söyledi (doküman ↔ şema ↔ pratik
    karşılaştırması) — o tur bu görevi de kapatacak.
- [x] (22.30) **Seviyeler sekmesi: ürün görseli + seçili ürünün STOK GEÇMİŞİ** *(kullanıcı tespiti
  14.08: "ürünlerin resmi ile beraber görmek daha kalıcı olur … bir ürüne tıkladığım zaman o ürünle
  alakalı geçmiş stok girişleri, tarihleri, fiyatları … bize teknik bir yük çıkartmadan")*
  `touches: apps/web/app/(operations)/operations/stock/tabs · apps/web/lib/stock/history-actions.ts · packages/{domain-core,application,database,types}`
  - *Bitti:* satır tıklanınca sağ panel o boyun geçmişini açar; liste ürünü görseliyle gösterir
  - **SEÇİMİN TÜKETENİ YOKTU** — `selectedId` yazılıyor ama hiçbir yerde okunmuyordu; tıklamanın satır
    vurgusundan başka karşılığı yoktu. Panel bilerek seçimden bağımsız yazılmıştı ve gerekçesi
    tutarlıydı, ama sonucu bir TEKRARDI: aynı kuyruk bir sekme ötede duruyor ve başlık satırı kaç parti
    beklediğini zaten söylüyor. Kullanıcının sorusu buydu: *"bir tık ötemdeki bir listeyi koymak çok
    anlamlı mı?"*
  - **Panelde dört blok:** giriş geçmişi (tarih · giren→kalan · SKT · lot · birim alış · depo) ·
    satış hızı ve stok kaç gün yeter · tükenmiş partilerin ortalama ömrü · fire oranı ve sebep kırılımı.
  - **AĞIR DEĞİL, ÇÜNKÜ SORU TEK VARYANTIN.** Okuma tıklandığında yapılıyor ve üç sorgu, üçü de
    indeksli: partiler · çıkışlar (`order_item_variant_idx`) · düzeltmeler. Sayfa açılışında hiç
    çalışmıyor; listedeki yirmi ürünün geçmişini önden getirmek, on dokuzunu boşa okumak olurdu.
  - **Satış hızı `order_item`ten DEĞİL `order_item_batch`ten** geliyor: birincisi "sipariş edildi",
    ikincisi "depodan fiilen çıktı" (hazırlıkta depocunun onayladığı gerçek). Stok sorusunun doğru
    paydası ikincisidir.
  - **ÖLÇÜLEMEYEN DEĞER SIFIR DEĞİL** (`CLAUDE §1`) — dosyanın omurgası bu. Hiç satış görmemiş ürün
    "günde 0 satıyor" diye okunursa stok sonsuza kadar yeter görünür; hız `null` döner ve yeterlilik
    "—" yazar. Parti ömrü yalnız TÜKENMİŞ partiden ölçülür (elde durana "3 günde eridi" denemez) ve
    ortalama en az iki örnek ister — kaç partiye dayandığı ekranda YAZILI.
  - Kararlar motorda (`domain-core/stock/history`), okuma uygulamada (`warehouse/variant-history`),
    ekran ikisini de bilmiyor. Görsel iki kolonla geldi (`image_key`, `image_updated_at`) — ek sorgu
    yok; kutu ortak havuzdan (`Thumbnail`), ham `<img>` yazılmadı.
  - **DURUM 14.08:** yazıldı ve doğrulandı (typecheck · lint · knip · boundaries temiz, birim
    1358/1358); kullanıcı ekranda görmedi.

- [x] (22.31) **"Elde 0" yalanı · malın akışı · ayrılmışın sahibi · seviyelerde arama** *(kullanıcı
  ekran görüntüsü 14.08: "36 tane alınmış, 34 kalmış ama aktif adet yok … 1 ayrılmış, o neye ayrılmış
  bilmiyorum … bu bölümde ürünü arama yok")*
  `touches: packages/database/src/services/{stock,reservation,order-item-batch}.service.ts · packages/application/src/warehouse/variant-history.ts · apps/web/app/(operations)/operations/stock`
  - *Bitti:* ekrandaki adet ile partilerin toplamı çelişmez; panel malın nereye gittiğini tek satırda
    söyler; ayrılmış mal sahibini gösterir; seviyeler sekmesinde ortak arama kutusu çalışır
  - **KÖK SEBEP ÖLÇÜLDÜ — SESSİZ SATIR KIRPMASI.** `available_stock` bir `varyant × depo` ÇAPRAZ
    birleşimidir: malı olmayan çift için de satır üretir ve hepsi sıfırdır. `listAvailableAcross`
    süzgeçsiz sorduğu için istenen satır sayısı `depo × boy` kadardı ve PostgREST'in tavanına
    (`max_rows`, yerelde 1000) dayanınca kalanı **sessizce kesiyordu**; sıralama da olmadığı için
    hangi boyun satırının düştüğü rastgeleydi. Ölçüm (14.08, yerel DB): **53 aktif depo** × ~50 boy =
    2650 satır isteniyor, 1000 dönüyordu. Çikolatalı Baklava 2000g'nin `available_stock` satırı
    gerçekte `physical 34 / available 34` — ekranda "elde 0" yazmasının sebebi veri değil okumaydı.
    Düzeltme: sıfır satırlar istenmiyor (`physical_qty>0 or reserved_qty>0`) — sıfırın bilgisi yok,
    çağıran zaten topluyor ve eksik satır 0 demek. Tüm çağıranlar denetlendi: hepsi `?? 0` ya da
    `<= 0 continue` ile eksik satırı zaten 0 sayıyor.
  - **YAN OLGU — 52 ARTIK TEST DEPOSU.** Aktif 53 deponun 51'i entegrasyon testlerinden kalmış
    (`TYERUC-…`, `TA-MSSB…`). Kırpmayı görünür yapan şey buydu. `CLAUDE §4b` bu sızıntıyı zaten
    uyarıyor (`warehouse` `restrict` FK'lerle korunuyor, Supabase `delete()` hatayı fırlatmaz
    döndürür). Temizlik `db:reset` gerektirir → **kullanıcının kararı**, kod tarafı ondan bağımsız
    düzeltildi.
  - **MALIN AKIŞI tek satırda:** giren − satılan − düşülen = elde. Denklem EKRANDA duruyor çünkü asıl
    soru sayılar değil birbirini tutup tutmadığı; tutmuyorsa kayda geçmemiş bir hareket var demektir
    ve ekran bunu söylüyor. Liste tavana dayandıysa satır çizilmiyor — eksik toplam, tutuyormuş gibi
    görünen bir denklem üretirdi.
  - **"HİÇ SATILDI MI" PENCERESİZ SORULUR.** Çıkış okuması tarih süzgecini bıraktı: son 90 günde çıkış
    olmaması "hiç satılmadı" demek değil. Panel artık ayırıyor — *"bu boy HİÇ satılmamış"* ile
    *"son 90 günde çıkış yok · toplam N satılmış (son gün)"* aynı cümle değil.
  - **AYRILMIŞ MALIN SAHİBİ GÖRÜNÜYOR:** hangi sipariş, hangi durumda, ne kadar. Ayrılmış mal depoda
    duruyor ama satılamaz; sahibi görünmezse operatör ya kayıp sanır ya elle aramaya çıkar. Müşteri
    bilgisi okunmuyor — soru "hangi sipariş", "kim" değil.
  - **SEVİYELERDE ARAMA** ortak `SearchInput` ile ve süzgeç ŞERİDİNDE (eylem barında değil: bir eylem
    değil, kategori/depo çipleriyle aynı aileden bir daraltma). Terim SUNUCUYA gidiyor — liste keyset
    sayfalı, istemcide süzmek ikinci sayfadaki ürünü "yok" gösterirdi.
  - **REZERVASYONUN SİPARİŞİ GÖMÜLÜ OKUNAMAZ — çalışırken patladı** (`PGRST200`, kullanıcı bildirimi).
    `reservation.order_id`nin **FK'sı YOK** ve bu bilinçli: tablo 0006'da açıldı, `order` 07'de
    (kolonun kendi künyesi yazıyor). FK olmadan PostgREST ilişki kuramıyor. Künye ikinci ve TEK bir
    turda çözülüyor (`OrderService.listByIds`) — `created_by` adlarının çözüldüğü desenin aynısı.
    **Tipler bunu göremez**; okuma bu yüzden gerçek DB'ye karşı koşturularak doğrulandı.
  - **"1530 GÜN YETER" — doğru bölme, yanlış cümle** (ölçüldü 14.08). 90 günde 2 adet satan üründe
    34 adet dört yıllık bir yeterlilik veriyordu ve o sayıyı okuyan onu bir ÖLÇÜM sanar. Sonuç gözlem
    penceresiyle sınırlandı ve sınırlandığı söyleniyor: **"90+ gün · gözlem penceresini aşıyor"**.
  - **DURUM 14.08:** yazıldı ve doğrulandı — typecheck 18 paket · lint · knip · boundaries temiz,
    birim 1358/1358, ve okuma **gerçek yerel DB'ye karşı** koşturuldu (baklava: giren 36 − satılan 2
    = elde 34 ✓; limonlu kek: 1 ayrılmış → `LA-26-WTGHQA` ✓). Kullanıcı ekranda görmedi.

- [x] (22.32) **Panel satırla AYNI evreni gösterir · arama şeridin sağ ucunda** *(kullanıcı sorusu
  14.08: "yüz depoyu seçiyorum ve ürünü seçiyorum, sadece o depoyla alakalı görünmeli, değil mi?")*
  `touches: apps/web/lib/stock/history-actions.ts · apps/web/app/(operations)/operations/stock`
  - *Bitti:* depo süzgeci aktifken panelin TAMAMI o deponun gerçeği ve panel bunu yazıyor; arama
    kutusu süzgeç şeridinin sağ ucunda
  - **SORU HAKLIYDI VE ALTINDA BİR TUTARSIZLIK VARDI.** Süzgeç aktifken satırın sayıları zaten o
    deponundu (`available_stock` süzgeçle okunuyor, parti listesi süzgeçle daraltılıyor) ama panel
    kapsamın TAMAMINI okuyordu: aynı pencerede başlık bir deponun, alttaki parti geçmişi bütün
    depoların gerçeğini gösteriyordu. Bir tercih değil, iki evrenin tek panele karışmasıydı — ve
    "stok kaç gün yeter" hesabı ikisini birden kullandığı için **sayı da yanlıştı** (payı süzülmüş,
    paydası süzülmemiş).
  - **VERİ MODELİ BUNU ZATEN DESTEKLİYOR:** panelin her sayısı depo taneli bir kayıttan çıkıyor —
    parti (`stock.warehouse_id` not null, "parti her zaman TEK depodadır"), rezervasyon
    (`reservation.warehouse_id`, türetme ilkesinin gerekçeli istisnası), çıkış (`order_item_batch`
    partiye bağlı, parti de bir depoda), fire (düzeltme partiye yazılır). Yani depoya daraltmak bir
    yaklaşıklık değil, kaydın kendi taneliği.
  - **AMA HER SÜZGEÇ DEĞİL — YALNIZ DEPO.** Arama ve kategori hangi ÜRÜNLERİN listeleneceğini
    seçer; bir ürünün geçmişi arama terimine bağlı değildir. Depo bir EKSENDİR (`operasyon-depo-ekseni`),
    veri o eksende taneli; arama bir bulma aracıdır. İkisini aynı kefeye koyup paneli aramaya da
    bağlamak, olmayan bir bağ kurmak olurdu.
  - Kod → kimlik çevrimi sunucuda ve kapsama karşı doğrulanıyor (`warehouseFilterOf`, eksen kural 7):
    kapsam dışı bir kod süzgeç olarak geçemez, sessizce düşer ve bağlamın evreni kalır.
  - **ARAMA ŞERİDİN SAĞ UCUNDA** (kullanıcı kararı): çiplerin arasında değil. Çipler kapalı bir
    kümeden seçim yaptırır, arama açık uçlu bir daraltmadır; yan yana dizilince ikisi aynı türden
    şeymiş gibi okunuyordu. Şerit yine tek — ikisi de "bu listede neye bakıyorum"un parçası.
  - **DEPO KIRILIMI SÜTUNLARA OTURMUYORDU** *(kullanıcı ekran görüntüsü 14.08: "açılan satırdaki
    ayrılmış bilgisi yukarıdaki Ayrılmış sütununun altına denk gelmiyor")*. Blok kendi `flex`
    düzenini kurmuş, sayıları elle verilmiş genişliklerle sağa itiyordu. Kırılım satırın PARÇASIDIR:
    artık tablonun kendi ızgarasını kullanıyor (`STOCK_COLUMN_TRACKS` + `templateOf`, aynı dolgu ve
    sütun boşluğu) ve Fiili sütunu da kazandı — üç sayı üç başlığın tam altında. Bu, iskeletlerin
    ölçüyü elle yazıp tutturamadığı hatanın aynısıydı (`table-columns` künyesi). Girinti 46px:
    kırılım ürün ADININ hizasından başlıyor, görselin altından değil.
  - **"DENKLEM TUTMUYOR" UYARISI KENDİ ARIZAMDI** *(kullanıcı ekran görüntüsü 14.08)*. Panel
    `56 − 8 − 3 = 53` yazıp "tutmuyor" diyordu ve **haklıydı, ama sebebi yazdığım şey değildi** —
    uyarı operatörü olmayan bir transferi aramaya gönderiyordu. Ölçüldü: `record_preparation`
    yalnız `order_item_batch` satırını yazıyor, `physical_qty`ye DOKUNMUYOR ve rezervasyonu
    bırakıyor; stok `deliver_order`da düşüyor. Yani hazırlanmış mal AYNI ANDA üç yerde sayılıyor:
    çıkış kaydında, fiili stokta ve rezervasyonda. Ekrandaki 8 adet tam olarak buydu
    (`LA-26-RC3HX9`, `preparing`) — hem "satılan" hem "ayrılmış" hem "elde".
    **Düzeltme:** çıkışlar siparişin durumuna göre ayrıldı (`hasLeftShelf`). Denklem artık
    `giren − TESLİM − düşülen = elde` ve hazırlanan mal ayrı bir satırda: *"eldekinin N adedi
    hazırlanmış siparişlerde — rafta duruyor, teslimde düşecek"*. Aynı veriyle doğrulandı:
    `56 − 0 − 3 = 53` ✓.
  - **DURUM 14.08:** yazıldı ve doğrulandı (typecheck 18 paket · lint · birim 1358/1358 · boundaries
    temiz) ve akış **gerçek yerel DB'ye karşı** koşuldu.
  - **KAPANDI 15.08 — kullanıcı ekranda inceledi ve onayladı.** 22.26 · 22.30 · 22.31 · 22.32 dörtlüsü
    birlikte kapanıyor: tek sayfa, ürün geçmişi paneli, üç ölçülmüş arıza ve depo süzgecinin panele
    de uygulanması. Kalanlar ayrı satırlarda duruyor (`22.27` çıkışların tamamı · `22.28` kabul
    edilenler listesi · `22.29` sıcaklığın kalıcı evi).
- [~] (22.33) **Tedarik siparişi önerisi kuyruğun içinde — kalemler DÜZENLENEBİLİR** *(kullanıcı
  talimatı 15.08: "kalan öneri diyalogları hangileri tespit edelim")* — `touches:
  apps/web/components/operation/form/purchase-order-form/**, apps/web/app/(operations)/operations/{assistant,procurement}/**`
    - *Bitti:* `purchase_order` tipinin gövdesi var; adet/kalem/tedarikçi onaydan önce düzeltilebiliyor
      ve kayıt formdan gidiyor (`createDraftFromProposalAction`).
    - **ÖNCE ÖLÇÜLDÜ — 11 tipin 8'inde gövde vardı, 3'ünde yoktu** (`purchase_order` · `zone_extend` ·
      `featured_flag`). Kuyruk BOŞTU (`assistant_proposal` 0 satır): DB sıfırlanmıştı ve **seed öneri
      üretmiyor** — dilekçeler yalnız MCP'nin `propose_*` araçlarıyla doğuyor.
    - **NEDEN GEREKTİ:** tip gövdesiz olduğu için karar iki uçluydu — onayla ya da reddet — ve onay
      `applyPurchaseOrder`'a gidip **dilekçede ne yazıyorsa onu** taslağa çeviriyordu. Adetleri MOTOR
      hesaplıyor (`ReorderService`); motor eşiği bilir, kasayı bilmez. *"Bu hafta bu kadarını alalım"*
      ya da *"şunu şimdilik geçelim"* kararı patronundur. Reddetmek de çözüm değildi: öneriyi reddedip
      aynı siparişi elle kurmak kuyruğun var oluş sebebini siliyordu.
    - **FORM YENİDEN YAZILMADI** (`CLAUDE §1`): tedarik ekranının "elle sipariş" penceresi aynı formu
      zaten açıyordu. Gövde ortak alana çıktı (`purchase-order-form/{schema,body}`) ve İKİ yüzey onu
      paylaşıyor — `intake-form`un 22.23'te kurduğu desen. İkinci bir satır editörü yazmak, kullanıcının
      22.23'te reddettiği şeyin ta kendisi olurdu (*"komponentler ortak komponent havuzundan
      kullanılmamış, yeniden tasarlanmış"*).
    - **Elle sipariş penceresi RHF'ten ÇIKTI** ve bu geçişin şartıydı: ortak gövde kontrollü bir liste
      (`IntakeFormBody`'nin aynı kararı — gerçeğin sahibi çağıran). İki yüzey aynı gövdeyi ancak aynı
      sözleşmeyle paylaşabilir. Doğrulama da ortaklaştı: `purchaseOrderBlock` hem pencerenin hem
      kuyruğun engel cümlesini yazıyor. `ManualOrderSchema` böylece ölü kaldı ve silindi (`knip` yakaladı).
    - **TEDARİKÇİ ENGELİ ARAYÜZE TAŞINDI:** `applyPurchaseOrder` tedarikçisiz dilekçeyi reddediyordu ama
      bu, onay anında öğrenilen bir kuraldı — "Onayla"ya basıp hata okumak. Asistan eşleşme bulamadan da
      öneri üretebilir; artık form soruyor.
    - **Fiyat SALT OKUNUR** (`lastPurchasePriceCents`): alış siparişte değil MAL KABULDE kesinleşir, giriş
      alanı koymak henüz bilinmeyen bir sayıyı yazdırmak olurdu. Ama gizlenmiyor da — tahmini tutar
      başlıkta canlı oynuyor ve bir kalemin bile fiyatı eksikse sayı hiç yazılmıyor (`CLAUDE §1`).
    - **DOĞRULAMA:** `propose_purchase_order` GERÇEK yolundan çağrıldı (`ReorderService` → kuyruk) ve
      STR deposu için 3 kalemlik dilekçe düştü (Gaziantep Baklava Fabrikası · 27+12+36 adet). Okunan
      payload'ın camelCase'e döndüğü ayrıca ölçüldü — jsonb dönüşümü çalışıyor, `parseProposalPayload`
      geçiyor. typecheck · lint · knip temiz.
- [~] (22.34) **Panel başlığı: ürün görseli + depolar arası geçiş · denklemin İKİ eksik hareketi**
  *(kullanıcı isteği ve iki ekran görüntüsü 15.08)* — `touches:
  apps/web/app/(operations)/operations/stock/tabs/product-history-panel.tsx,
  packages/{domain-core,application,database}/src/**`
    - *Bitti:* başlıkta görsel ve depo şeridi var; denklem iade ve transferi doğru sayıyor.
    - **İKİ ARIZA DA ÖLÇÜLDÜ VE İKİSİ DE BENİM PANELİMDEYDİ — veri her ikisinde de doğruydu.**
    - **(1) İADE İKİ KEZ SAYILIYORDU.** Kullanıcı ekranı: `120 − 3 − (−1) = 117` ve "denklem tutmuyor".
      Ölçüm: teslim sonrası iade `restock` ile geri alınınca `0020_order_return` İKİ şeyi birden yapar —
      `physical_qty` artar (`return_restock` kaydı) **ve aynı adet `order_item_batch`ten düşülür**.
      Migration künyesi bunu yazıyordu: *"`order_item_batch`'in anlamı bu kuralla keskinleşir: bizden
      çıkıp GERİ GELMEYEN mal."* Yani `deliveredQty` zaten net rakam; restoku bir de fireye katmak aynı
      iadeyi iki kez saymaktı. `countsAsLoss(reason)` (domain-core) ile ayrıldı — kırılımda GÖRÜNMEYE
      devam ediyor, çünkü saklanan şey olay değil onun fire toplamına katkısı. Fire %−0,8 → %0.
    - **(2) TRANSFER DENKLEMDE HİÇ YOKTU.** İkinci ekran: `141 − 6 − (−3) = 134` ve yine "tutmuyor".
      Ölçüm: `A227-04` partisinden **4 adet `in_transit`** — `dispatch`te kaynaktan düştü, hedefte ancak
      `receive` ile parti olacak, yani o an HİÇBİR deponun stoğunda değil. `66 − 4 + 3 = 65` ✓.
      İronik olan, uyarı metni doğru şüpheliyi adıyla söylüyordu (*"transferle gelen/giden parti"*) ama
      kod onu denkleme katmıyordu. `inTransitFromStocks` eklendi (**yalnız `in_transit`**: `completed`
      transferin karşılığı hedefte parti olarak duruyor, ikisini saymak malı iki kez düşürürdü;
      `cancelled` kaynağa geri konmuştur). Denklem artık `giren − teslim − düşülen − yolda = elde` ve
      yolda satırı yalnız varken çiziliyor, açıklamasıyla birlikte.
    - **Doğrulama (gerçek veri):** `141 − 6 − (−3) − 4 = 134` ✓ · `120 − 3 − 0 − 0 = 117` ✓.
      Regresyon yok: gerçek fire'lı ürün (`expired` 3 adet) hâlâ %5,4 ve denklemi tutuyor.
    - **BAŞLIK** (kullanıcı isteği): ürün görseli 40px `Thumbnail` ile geldi — listede satırı tanıtan
      şey panelde de duruyor. Depo geçişi `row.warehouses`ten (yalnız MALI OLAN depolar): tek depoluysa
      hiç çizilmez (seçenek sunmayan seçici, tıklanacak bir şey vaat edip hiçbir şey yapmaz), üçe kadar
      SEKME, üstünde SEÇİCİ — kullanıcının kuralı ve sebebi ölçülebilir: yedi depolu şerit dar sütunda
      taşar. **Başlıktaki sayılar da seçili evrenden okunuyor**, yoksa gövde bir deponun başlık
      hepsinin gerçeğini söylerdi.
    - **Tablo süzgeci hâlâ KİLİTLER** (22.32 kararı): üstte depo seçiliyken panel onu aşamaz — aynı
      ekranda iki farklı gerçek olurdu; o hâlde geçiş yerine hangi depoya bakıldığı yazılıyor.
    - **ÇIPLAK "yükleniyor…" METİNLERİ İSKELETE ÇEVRİLDİ** *(kullanıcı tespiti 15.08)*. İkisi de bu
      turda BENİM yazdığım koddu ve ortak iskeletin künyesinin açıkça yasakladığı şeydi: *"Çıplak metin
      — `Yükleniyor…`. Gelecek içeriğin ŞEKLİ yok; içerik gelince yerleşim zıplar ve operatörün
      tıklamak üzere olduğu düğme yer değiştirir."* Panelde bu her ürün tıklamasında yaşanıyordu (bir
      sayfa açılışında bir kez değil); mal kabul diyaloğunda ise kalemler gelince alt bardaki "Kabulü
      tamamla" düğmesi aşağı itiliyordu. Panel iskeleti gerçek gövdenin sırasını izliyor (akış → dört
      ölçüm → geçmiş); KOŞULLU bloklar (rezervasyon, fire) çizilmiyor — olmayabilecek bir şeyin yerini
      önden ayırmak, iskeletin verdiği sözü tutmamak olurdu.
    - **BEKLEYEN(22.34):** operasyon yüzeyinde AYNI ihlalden üç tane daha var ve bu turun dışında:
      `bundle-form-dialog` ("Paket bilgileri yükleniyor…") · `order-dialog` ("yükleniyor…") ·
      `catalog-form-dialog` (ad çözülemezken yer tutucu). Üçü de kendi ekranlarının işi.
    - **BEKLEYEN(22.34):** kullanıcı ekranda denemedi. Ayrıca fire oranı `count_diff` negatifken hâlâ
      eksi çıkıyor (%−2,1) — ölçüm doğru (net kayıp) ama "FİRE" başlığı altında eksi sayı garip okunuyor;
      sayım farkını kendi satırına ayırmak kullanıcının kararına bırakıldı.
    - **BEKLEYEN(22.33):** kullanıcı ekranda denemedi; kuyrukta bekleyen gerçek dilekçe duruyor.
      Kalan iki gövdesiz tip `zone_extend` (harita ister) ve `featured_flag` (üç alan — form gerekmeyebilir,
      ama o tipten hiç öneri üretilmediği için ölçülemedi: `BEKLEYEN(22.11)`). *(`featured_flag`
      `22.35`'te yazıldı; `zone_extend` duruyor.)*

- [~] (22.35) **ARAÇ TAKIMININ AÇIKLARI KAPATILDI + VİTRİN GÖVDESİ** *(kullanıcı kararı 15.08:
  «taşıma yerine düzeltmen gereken yerler varsa düzelt» — MCP 8. turunun kendi raporu üzerine)* ·
  `touches: apps/backend/src/mcp/{server-factory,tools,tools-catalog,tools-propose,tools-signals}.ts,
  packages/types/src/primitives/featured-slots.ts,
  apps/web/components/operation/form/featured-form/**, apps/web/lib/catalog/featured-actions.ts,
  apps/web/app/(operations)/operations/assistant/{assistant-body.tsx,bodies/featured-flag-body.tsx}`
    - *Bitti:* araç sayısı **23 → 25**; asistanın kör yazdığı üç yer görür oldu; vitrin önerisi
      diyaloğun içinde düzenlenebiliyor.
    - **RAPOR TAŞINMADI, İŞLENDİ.** 8. tur kendi raporunu `temp/`e yazmıştı; kullanıcı onu backlog'a
      taşımak yerine düzeltilmesini istedi. Maddeler tek tek ölçüldü ve **raporun KRİTİK dediği
      §3.1 ölçümle ÇÜRÜTÜLDÜ** — "depo süzgeci çalışmıyor" diye bildirilen şey aslında `§3.5`'in
      sessiz kırpmasıydı: brifing depo başına 8 satır çiziyor ama `lineCount` 20 diyordu, okuyan taraf
      o 8 satırı deponun tamamı sanıp `propose_purchase_order` çıktısıyla karşılaştırınca kesişim az
      çıktı ve **doğru çalışan bir süzgeci arızalı ilan etti.** Ders sessiz kesmenin bedelidir:
      kırpma söylenmediğinde okuyan taraf yanlış teşhis üretir ve maliyeti bir tur olur.
    - **YENİ ARAÇ · `product_detail` (§3.8).** `propose_product_draft` ÜZERİNE YAZAR ve sürüm geçmişi
      yok; asistanın ürünün bugünkü metnini okuyacak hiçbir aracı yoktu — yani her metin önerisi
      birinin emeğini silme riskiydi. Artık dil başına (`tr/fr/de`) alanın **dolu mu** olduğu ve kısa
      bir önizlemesi dönüyor; alerjen kapalı küme olduğu için listenin kendisi, besin değeri evet/hayır.
      `declarationGaps` motorun gördüğü eksikleri tekrarlıyor ki ikinci bir `catalog_health` turu
      gerekmesin. Ad parçasıyla da aranıyor, birden çok eşleşmede tahmin etmiyor — eşleşmeleri döndürüyor.
    - **YENİ ARAÇ · `money_overview` (§3.11).** `propose_money_movement` vardı, hesapların durumunu
      okuyan araç yoktu: asistan bu türde ancak adminin dikte ettiğini yazabiliyordu. Artık hesap
      başına bakiye, tür × yön kırılımıyla dönem toplamı ve son 15 hareket okunuyor. **Sınır korundu:**
      kâr/marj/nakit tahmini YOK (`AI_ADMIN_ASSISTANT §6`) — hareket önermek kapsamda, işletmenin
      finansal yorumu değil. Hiç hareket görmemiş hesabın bakiyesi `null` döner, sıfır değil.
    - **§3.10 · TEDARİKÇİ SATIRA TAŞINDI.** Motor eksikleri zaten tedarikçiye göre gruplarken
      düzleştirme bunu yutuyordu; "hangi tedarikçiden sipariş açabilirim" sorusu ancak
      `propose_purchase_order`ı deneyip **hatasından** öğreniliyordu. Satıra ad geldi, ayrıca
      **kırpmadan bağımsız** `suppliersWithShortfall` özeti: ölçümde STR'nin ilk 8 satırında hiç eşleme
      yokken 9–11 arasında vardı — kırpma doğru bildirilse bile yanlış çıkarım mümkündü. Eşlemesi
      olmayan kalem sayısı da ayrı (`unmappedLineCount`): o kalemlerden sipariş AÇILAMAZ ve sebebi görünür.
    - **§3.5 · `truncated`.** `stock_watch` bu deseni zaten doğru uyguluyordu; brifinge de geldi.
    - **§3.3 · MÜKERRER UYARISI.** Kuyrukta bekleyen bir öneri varken aynı özetli ikincisi sorunsuz
      kabul ediliyordu (raporun kendi turunda "Gaziantep — STR" iki kez açıldı). Model kendi geçmişini
      hatırlamıyor. **Engel değil UYARI ve bu bilinçli:** ilki bayat kalmış olabilir, koşullar değişmiş
      olabilir — reddetmek doğru bir öneriyi de keserdi. Sayım YAZMADAN ÖNCE yapılıyor, yoksa her öneri
      kendini sayıp mükerrer görünürdü.
    - **§3.2 · KAPSANAN POSTA KODU İŞARETLİ.** `demand_signals` ham talebi sayıyor ve kodun zaten
      dağıtım yaptığımız bölgede olup olmadığını bilmiyordu; sonuç `delivery_map` ile ZIT cevaptı —
      orası 67400'ü "kapsanıyor" derken burası aynı kodu bölge genişletme adayı gibi sunuyordu.
      Kapsanan kod **gizlenmiyor, işaretleniyor** (`coveredBy` bölge ADI ile): oradaki yüksek talep de
      bir bilgidir (daha sık gitmek, kapasite artırmak) — yanlış olan onu "gidemediğimiz yer" diye
      sunmaktı.
    - **§3.9 · «VİTRİN» TEK BİR YER DEĞİL** *(kullanıcı tespiti 15.08: «hepsinde vitrin diyoruz ama
      hepsi vitrinde farklı mantıklar ve yerlerde görünüyor»)*. Üç hedefin üç ayrı kuralı vardı ve
      hiçbiri asistana söylenmiyordu: **kategori** 6'lık ızgarayı sırayla doldurur (fazlası çizilmez) ·
      **koleksiyon** 2 kartlık bandda GÜNLÜK DÖNER (işaretlinin tamamı sırayla görünür, fazlası
      kaybolmaz — sırasını bekler) · **paket** 2 kartlık banda girer ama **stoğu tükenen paket işaretli
      olsa da hiç girmez**. Bunu bilmeden verilen "vitrine çıkar" önerisi, etkisini bilmeden verilmiş
      demekti. Kural tek kaynağa yazıldı: `FEATURED_SLOTS` + **`FEATURED_PLACEMENT`**
      (`packages/types/src/primitives/featured-slots.ts`) — sabit `apps/web/lib`den `@lezzet/types`e
      **TAŞINDI**, çünkü artık iki uygulama birden okuyor (web + MCP) ve iki kopya bir gün ayrışırdı.
      Araç yanıtı artık bölümü, kuralı, bugünkü doluluğu, kontenjanı ve **kuyrukta bekleyen aynı
      hedefli öneri sayısını** söylüyor — bekleyenler henüz ızgarada GÖRÜNMÜYOR, o yüzden ayrı sayılıyor.
    - **VİTRİN GÖVDESİ — `featured_flag` artık diyaloğun içinde düzenleniyor** *(kullanıcı kuralı
      15.08: «biz yönlendirme yapmıyoruz; doğrudan açılan diyaloğun içerisinde düzenlenecek ORTAK
      komponent yapıyoruz»)*. Karar iki uçlu görünüyordu (onayla/reddet) ama vitrin bir SEÇKİ ve
      kontenjanı var: dolu ızgaraya ekleme sıradakini düşürür ve kimin düşeceğine karar vermenin yolu
      yoktu. Form `components/operation/form/featured-form/`te — **ortak havuzda**, `intake-form` ve
      `purchase-order-form` deseninin aynısı: `schema.ts` saf (RHF'siz, kontrollü) + `body.tsx`
      çizim. Izgaranın tamamı Toggle listesi olarak geliyor, canlı sayaç kontenjanı gösteriyor,
      altında o hedefin yerleşim cümlesi (`FEATURED_PLACEMENT`) yazılı.
      **ENGEL YOK ve bu bilinçli:** ızgarayı boşaltmak da geçerli bir karardır (vitrini kapatmak).
    - **DOĞRULAMA:** `typecheck` 18/18 · `lint` temiz · `docs:check` temiz · araç kayıt tablosu
      `araç: 25 · handler: 25` (eşleşme tam, `product_detail` ✓ `money_overview` ✓) · `db:refresh`
      sonrası kuyruk 31 → 0, 3 gerçek depo, 0 test artığı.
    - **BEKLEYEN(22.35):** `zone_extend` hâlâ gövdesiz — harita gerektiriyor; `ZoneMap` ortak havuzda
      hazır ama diyaloğa bağlanmadı. Kalan TEK gövdesiz tip bu.
    - **BEKLEYEN(22.35):** kullanıcı ekranda denemedi; yeni araçlarla henüz öneri turu atılmadı.
      `product_detail`in çürüttüğü vaka duruyor: ölçümde 124 üründe `en` alanı boş görünüyordu ve o
      turun `product_draft` önerisi onaylansaydı dolu TR metni silecekti.

### KARAR (kullanıcı, 15.08) — besleme dosyası asistan önerisi YAZMAZ

`docs/talep/arka-uc-seed-asistan-onerileri.md` 10.08'de açılmıştı: seed `assistant_proposal`
tablosunu hiç yazmıyor, dolayısıyla her `db:refresh` kuyruğu boşaltıyor ve asistan ekranı boş
açılıyor. 15.08'de birebir yaşandı — refresh sonrası kuyruk **31 → 0** ve kullanıcının incelemek
istediği iki gövde (`22.33` tedarik siparişi, `22.35` vitrin) bakılamaz hâle geldi.

**Talep REDDEDİLDİ, gerekçesi kullanıcınındır ve sağlamdır:**

> *"Asistan bölümüyle alakalı önerileri ben CANLI almak istiyorum. En iyi testin o şekilde
> yapılacağına inanıyorum."*

Seed'in ürettiği öneri, ajanın gerçekten üretebileceği öneri **değildir**. Uydurulmuş bir payload
ekranı doğru gösterir ama asistanın o payload'ı hiç kuramayacağını gizler — yani ekran yeşil,
zincir kırık olabilir ve seed bunu görünmez yapar. Test edilmek istenen şey ekranın çizimi değil,
**ajan → kuyruk → gövde → uygulama** zincirinin tamamı.

**Bedeli kayda geçiyor ve bilinerek kabul edildi:** ajanın hiç üretmediği bir tipin gövdesi de
sınanamaz. Bunun emsali bu dosyada zaten var — `featured_flag` gövdesi uzun süre yazılamadı ve
sebebi `BEKLEYEN(22.11)`'de aynen yazılı: *"o tipten hiç öneri üretilmediği için ölçülemedi"*.
Bir tip turlarca üretilmezse çözüm seed değil, **o tipin neden önerilmediğini ölçmektir** (aracın
tanımı mı yetersiz, veri mi o durumu hiç doğurmuyor).

**VE KARAR AYNI GÜN HAKLI ÇIKTI.** Ajan 15.08 akşamı Tur 9'u attı ve kuyruğa **12 öneri** düştü —
içinde tam da ölçülemeyen iki tip vardı: **`featured_flag`** (Dondurma → vitrine) ve
**`zone_extend`** (Schiltigheim + 67500, 47 istek · 3 bekleyen müşteri). İkisi de seed'le değil,
ajan gerçek veriyi okuyunca kendiliğinden geldi. Seed yazılsaydı bu iki gövdeyi uydurma payload'la
sınamış olacaktık.

- [~] (22.36) **`zone_extend` gövdesi — SON gövdesiz tip kuyruğun içine girdi, haritasıyla**
  *(kullanıcı kararı 15.08; ilk gerçek dilekçe aynı gün geldi)* — `touches:
  apps/web/components/operation/form/zone-form/**, apps/web/lib/delivery/{zone-actions.ts,zone-proposal-map.ts},
  apps/web/app/(operations)/operations/assistant/bodies/zone-extend-body.tsx,
  packages/application/src/assistant/kind-meta.ts`
    - *Bitti:* **on bir öneri tipinin on biri de artık diyaloğun içinde düzenleniyor.** Yönlendirme
      kalmadı.
    - **İKİ KAYITLI KARAR ÇELİŞİYOR GÖRÜNÜYORDU, ÇELİŞMİYORMUŞ.** `kind-meta` künyesi bu tipi
      `handoff`ta tutuyordu ve gerekçesi sağlamdı (kullanıcı 09.08): *"hangi kod girsin sorusu
      haritasız cevaplanamaz."* Kullanıcının 15.08 kuralı ise *"biz yönlendirme yapmıyoruz"*
      diyordu. Çözüm ikisinden birini feda etmek değildi — **haritayı diyaloğa getirmekti.** Rota
      ekranının bileşeni (`ZoneMap`) olduğu gibi kullanıldı: operatör iki ekranda aynı renkleri,
      aynı hâl sözlüğünü okuyor.
    - **KARAR "HEPSİ" DEĞİL, "HANGİLERİ".** Kullanıcının 09.08 itirazının kalbi buydu: *"hepsine
      birden gidiyor, ben belki bir bölgeyi istiyorum."* Form dilekçenin kodlarını tek tek
      seçtiriyor; her satırda kanıtı duruyor (kaç istek, kaç bekleyen). **Bekleyen sayısı
      SEÇİMDEN hesaplanıyor**, dilekçeden değil — kod çıkarınca düşüyor, yani kaç kişiye geri
      alınamaz mesaj gideceği onaydan ÖNCE görünüyor. Açılış değeri "önerinin kabul edilmiş hâli":
      çoğu onay olduğu gibi geçer, çıkarmak tek tıklama.
    - **BAŞKA ROTANIN TUTTUĞU KOD SEÇİLEMİYOR** ama sayısı yazılıyor. Kural veritabanında (bir kod
      tek bölgede) ve burada yeniden uygulanmıyor — yalnız reddedilecek bir seçimin önü kesiliyor.
      Sessizce yok saymak, önerinin bir parçasının nereye gittiğini gizlerdi. `heldBy` payload'dan
      değil bölge okumasından geliyor: dilekçe kurulduğunda boşta olan kod onay anında başka rotaya
      girmiş olabilir.
    - **AYRI YAZMA KAPISI** (`addZoneCodesFromProposalAction`), rota ekranınınki DEĞİL. O kapı
      bölgenin TAMAMINI yazıyor (ad, günler, aktiflik + kod kümesinin son hâli); kuyruğun işi ise
      dar — **var olan bölgeye kod EKLEMEK**. Onu çağırmak taşımadığımız üç alanı da göndermeyi
      gerektirirdi ve patron kod eklerken teslim günlerini kaybedebilirdi. Kapı **ekler,
      değiştirmez**: mevcut kodlar önce okunuyor, seçilenler üstüne biniyor. Bölgede zaten olan kod
      ikinci kez yazılmıyor — kısıt onu reddeder ve tüm yazım düşerdi.
    - **BİLDİRİMİ BU KAPI GÖNDERMİYOR:** `zone_available` uzlaştırma işi (saatte bir) "kapsanmış ve
      haberi gitmemiş" bekleyişleri buluyor (14.10 · 19.21). İkinci bir gönderim yolu açmak aynı
      mesajı iki kez yollardı. Ekranın uyarısı yine de doğru — mesaj gidecek, yalnız birkaç dakika
      gecikmeli ve geri alınamaz.
    - **HARİTA OKUMASI DAR** (`zone-proposal-map`): bölgeler + kodların koordinatları + depo adı.
      `routes-read` tam bu bağlamı üretiyor ama kardeş sayfa klasöründe (`STACK §7`) ve çok
      fazlasını okuyor. **Boştaki kodların keşfi bilerek YOK:** kuyruğun sorusu *"asistanın önerdiği
      kodları kabul ediyor muyum"*, *"başka nereye gidelim"* değil — ikinci bir keşif aracı kararı
      genişletip önerinin kendisini gölgede bırakırdı.
    - **Doğrulama:** typecheck 18/18 · lint temiz · knip değişmedi.
    - **EKRANDA DENENDİ VE İKİ EKSİK ÇIKTI** *(kullanıcı, 15.08)* — ikisi de düzeltildi:
      - **HEDEF ROTA SEÇİLEMİYORDU.** Gövde kodları yalnız dilekçenin işaret ettiği rotaya
        atıyordu. Kullanıcının cümlesi: *"belki de bu posta kodunu farklı rotaya atamak istiyorum,
        belki farklı depoya."* Haklıydı ve eksik BENDEYDİ: asistanın rota seçimi bir ÖNERİDİR —
        `delivery_map` en yakın güzergâhı bulur ama hangi aracın o kodu taşıyacağı operatörün
        bilgisidir (kapasite, sürücü, gün). Rota seçici en üste geldi; seçenek etiketi **depoyu da
        yazıyor**, çünkü "farklı depoya ver" kararı buradan veriliyor — rota kendi deposuna bağlı,
        başka deponun rotasını seçmek kodu o depoya bağlamaktır. **Ayrı bir depo seçicisi
        KONULMADI:** rotasız bir depo ataması diye bir kayıt yok, olsaydı uygulanamayan bir seçim
        doğardı. Hedef değişince haritadaki "bu rotanın kodu" kümesi, engel listesi ve künye
        satırları da onunla birlikte değişiyor; künyede dilekçenin istediği rota ile kaydın gittiği
        rota **yan yana** duruyor, ki arşiv farkı okuyabilsin.
      - **HARİTA YÜKSEKLİĞİ KÖTÜYDÜ** (*"genişliği fena değil ama yüksekliği kötü"*). Diyalog
        1320 → **1600**, harita 260 → **420 piksel**. Harita bir ORAN işidir: pencere genişleyince
        sabit kalan yükseklik onu bant gibi gösteriyordu.
    - **İKİNCİ EKRAN TURU — İKİ KUSUR DAHA, ikisi de aynı kökten** *(kullanıcı, 15.08)*:
      - **AÇILIŞTA ÖNERİLER SEÇİLİ GELİYORDU.** Gerekçem hızdı (*"patron çoğu zaman öneriyi olduğu
        gibi onaylar"*) ve yanlıştı: *"önerilen posta kodları haritada mor görünmesi gerekirken
        seninki doğrudan seçili geliyor."* **Seçili açılış, kararı verilmiş gibi gösterir.** Öneri
        mor durmalı ki operatör onu bir TEKLİF olarak görsün; kabul bir EYLEM olmalı, varsayılan
        değil — üstelik geri alınamaz bir bildirim tetikleyen bir kararda "hepsi seçili" açılış
        dikkatsiz onayı davet ediyordu. Açılış artık boş. *(Rota seçili gelmeye devam ediyor ve bu
        farklı: rota bir seçenektir, kabul değil.)*
      - **SEÇİLEN İLE ESKİ AYIRT EDİLEMİYORDU:** *"hangi nokta eski seçilenlerle yeni seçilen
        karışıyor."* Kabul edilen öneri `mine` oluyordu, yani bölgenin YILLARDIR taşıdığı kodla bu
        diyalogda AZ ÖNCE eklenen kod aynı yeşil noktaydı — **kararın kendisi haritada görünmüyordu.**
        Haritaya beşinci hâl eklendi: **`adding`** — zeytin dolgu + **mor çember** (*"asistanın
        önerisiydi, bu kararla bölgeye giriyor"*), `mine`'dan bir tık iri çünkü gözün ilk gideceği
        yer az önce verilen karar olmalı. Rota kurulum ekranı bu hâli hiç üretmiyor, o yüzden lejant
        satırı da **yalnız o hâlden nokta varken** çiziliyor: lejant haritanın aynası olmalı,
        sözlüğü değil.
      - **HARİTA 420 → 630 piksel** (*"bir buçuk kat daha arttır"*). Karar coğrafi olduğu için
        haritanın ekranın baskın öğesi olması gerekiyor; kod listesi onun SONUCU.
    - **BEKLEYEN(22.36):** kuyrukta gerçek dilekçe var (Schiltigheim + 67500), TTL 16.08; son hâli
      henüz ekranda denenmedi.
    - **BEKLEYEN(22.36):** rota ekranının devir yolu (`routes-handoff.ts` + `?proposal=` ön dolgusu)
      artık HİÇBİR öneri tarafından tetiklenmiyor — `zone_extend` onun tek tüketicisiydi. Kod ölü
      değil (sayfa hâlâ okuyor), ama pratikte ulaşılamaz. Sökülmesi rota ekranının kendi turunun işi;
      bu turda dokunulmadı çünkü ekranı bozma riski kazancından büyük.
    - **KURALIN KANITI GERİDE KALMIŞTI — düzeltildi (15.08).** `proposal.test.ts` hâlâ *"geriye tek
      devir kaldı: bölge"* diyip `zone_extend`den `handoff` bekliyordu; mod `inline` olunca test
      kırmızıya döndü ve bunu **birim koşusu göremiyor** (dosya entegrasyon projesinde). Aynı sınıf
      bir düşüş 10.08'de de yaşanmıştı (`stock_offer`, mobil şeridin notu) — kural değişiyor, kuralın
      kanıtı değişmiyor. Satır artık boş bir döngü değil İDDİA: *"hiçbir künye `handoff` değil"*.
      Karşılaştırma `modeOf` üzerinden yapılıyor çünkü künye sabit olduğu için TypeScript alanı
      daraltıyor ve `meta.mode === 'handoff'` **hiç derlenmiyor** (TS2367) — derleyicinin itirazı
      daha güçlü bir kanıt ama künyeye yeniden `handoff` eklendiği gün sessizleşirdi.

- [x] (22.37) **Kuyrukta TİP SÜZGECİ · bekleme hâli KART IZGARASI çiziyor** *(kullanıcı isteği
  15.08: "bu öneri tiplerini tiplerine göre filtreleyemiyorum… ayrıca buradaki skeleton düzgün
  kurgulanmamış, card view şeklinde olmalı")* — `touches:
  apps/web/app/(operations)/operations/assistant/{assistant-url.ts,assistant-types.ts,assistant-client.tsx,assistant.desktop.tsx,assistant-sections.tsx,loading.tsx},
  apps/web/components/operation/ui/skeleton.tsx`
    - **SÜZGEÇ SEKME DEĞİL, ÜÇÜNCÜ URL SORUSU.** Sekmeler kuyruğun HÂLİNİ ayırıyor (bekleyen ·
      düşen · arşiv) ve üçü birbirini dışlayan üç ayrı iş; tip ise aynı işin içinde bir daraltma
      ("bugün yalnız stok girişlerine bakacağım"). On bir tipi sekmeye çevirmek on dört sekmelik bir
      bar üretir ve asıl ayrımı — hangi kararı verdiğimi — gölgede bırakırdı. Adres artık `?kind=`
      taşıyor (varsayılan yazılmaz), yani süzülmüş bir görünüm paylaşılabiliyor.
    - **ÇİPLER KUYRUKTA VAR OLAN TİPLERDEN TÜRÜYOR**, on bir tipin sabit listesinden değil: sabit
      liste her açılışta sekiz boş çip gösterirdi ve "0" yazan bir süzgeç, tıklanınca boş ekran vaat
      eden bir düğmedir. Adet çipin içinde, çünkü şerit süzmeden önce de bir işe yarıyor — kuyruğun
      BİLEŞİMİNİ okutuyor. Sıra alfabetik, adede göre değil: sayı her kararla değişiyor ve adede
      göre sıralanan bir şeritte çipler operatörün parmağının altında yer değiştirirdi.
    - Etiket satırın kendi `kindLabel`'ından okunuyor, `KIND_META`'dan DEĞİL: o sözlük
      `@lezzet/application` içinde ve paket `node:crypto`'ya açılıyor — istemciden import edildiği
      gün sayfa 500'e düşüyor (ölçüldü 09.08). Şerit yalnız birden çok tip varken çiziliyor.
    - **İSKELET YANLIŞ EKRANI ÇİZİYORDU.** `loading.tsx` hâlâ 10.08'de terk edilmiş iki sütunlu
      yerleşimi (326 px kuyruk + karar panosu) çiziyordu; ızgaraya geçiş bu dosyayı atlamış. Yani
      iskeletin tek işinin tam tersi oluyordu — bekleyen ekran bir şekil vaat ediyor, içerik gelince
      sayfa baştan diziliyordu. Artık gerçek yerleşim: başlık + görünüm hapı · süzgeç şeridi · sekiz
      kartlık ızgara. Ölçüler gerçeğinden birebir (`auto-rows-fr`, `minmax(18rem,1fr)`, `min-h-22rem`,
      kalın üst şerit); üst şerit RENKSİZ çünkü hangi tipin geleceği bilinmiyor.
    - Kite iki parça eklendi: `SkeletonSegmentedNav` (`SkeletonTabs`ın kardeşi — sekme adları gerçek
      metin, seçili hap işaretlenmez) ve `SkeletonFilterBar`a `label` yuvası (şeridin baştaki eksen
      adı: "Hesap", "Tip").
    - **Süzgeç açıkken boş kalan ızgaranın AYRI cümlesi var** ("Bu süzgeçte öneri yok"): oraya
      "bekleyen öneri yok" yazmak düpedüz yanlış olurdu — kuyrukta öneri var, süzgeç dışarıda
      bırakıyor. Aynı görüntüye iki farklı gerçeği bindirmek, dolu bir kuyruğu boş sandırır.
    - **Doğrulama:** typecheck (web · backend · domain-core) temiz · lint temiz · `knip` değişmedi ·
      birim 1358/1358.

- [ ] (22.38) **Fırsat kararında TARİH TİPİ ve kalan gün ekranda yok** *(10.08 talimatının kapanmamış
  iki maddesi; talep dosyası kapatılırken ölçülerek doğrulandı 15.08)* — `touches:
  apps/web/app/(operations)/operations/assistant/bodies/batch-offer-body.tsx`
    - **`DDM` ↔ `DLC` ayrımı gösterilmiyor.** Alan veride var (`product.date_type`) ve fark gıda
      güvenliğinin özü: **DLC** geçince mal satılamaz (tek yol imha), **DDM** geçince satılabilir,
      yalnız kalite garantisi düşer. Fırsat kararı tam olarak "bu partiyi ne yapalım" kararıdır ve
      operatör bugün hangi tipe baktığını gövdeden okuyamıyor. Emsali var: `product_create`
      önizlemesi *"DLC · güvenlik" / "DDM · kalite"* diye yazıyor (`assistant-preview.tsx`).
    - **Kalan/geçen gün sayısı yok.** Talimatın biçimi: `DDM · 16 Ağu 2026 · 6 gün kaldı` (nötr) ·
      `DDM · 4 Ağu 2026 · 6 gün geçti` (amber; DLC ise kırmızı). Hesap ekranda yapılır, `expiryDate`
      payload'da duruyor.
    - **Neden bugün yok:** 10.08 talimatı yazıldığında kartın kendi künye satırı vardı; 22.15 o satırı
      `ProposalAside`'a taşıdı (haklı olarak — iki kopya vardı) ama tarih oraya **ham ağaç** olarak
      düştü, yani okunan bir karar girdisi olmaktan çıktı. Talimatın öteki maddeleri (gri paragrafın
      silinmesi, üç bağlı kutu, başlıktan oranın çıkması, kâr satırı) uygulandı ve yerinde.

- [ ] (22.39) **`product_create` KATEGORİSİZ kayıt açabiliyor** *(kapatılan bir talep dosyasının
  açık maddesi; 15.08'de koda karşı ölçüldü)* — `touches:
  apps/web/app/(operations)/operations/assistant/assistant-body.tsx`
    - Dilekçe `categoryId: null` taşıyabiliyor (`ProductCreatePayloadSchema`), form da onu zorunlu
      kılmıyor (`categoryId` şemada `nullable`) — yani asistan kategoriyi okuyamadığında operatör
      **hiçbir uyarı görmeden** kategorisiz bir ürün açabilir. Önizleme "Kategori: seçilmedi" diyor
      ama bu bir bilgi satırı, bir engel değil.
    - **Karar gerekiyor, düzeltme değil:** kategorisiz ürün katalog listelerinde hiçbir kategoriye
      düşmez, yani kayıt açılır ama görünmez. `blocked` ile engellemek mi doğru, yoksa uyarı satırı
      mı — ikincisi "aday" statüsüyle zaten uyumlu olabilir (ürün nasılsa satışa çıkarken ürün
      ekranından geçiyor).
    - ⚠ **KAYIT EKSİK OLABİLİR:** bu madde `docs/talep/operasyon-belgeden-urun-onizlemesi.md`
      dosyasındaydı; dosya 15.08'de **doğrulanmadan silindi** (`docs/talep` `.gitignore`'da, geri
      gelmiyor). Buradaki tarif envanterin kendi satırından ve koddan yeniden ölçülerek kuruldu;
      dosyada başka bir açık madde varsa kaybolmuştur. Aynı dosyanın öteki maddesi (22.6 belgeden
      ürün önizlemeleri) 09.08'de teslim edilmişti ve kaydı 271. satırda duruyor.

