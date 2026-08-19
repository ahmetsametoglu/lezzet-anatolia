# Sefer (`delivery_run`) — gerçekleşen teslimat rotası

> **Statü: İMPLEMENTE EDİLDİ (18.08, aynı gün).** Görev kaydı `docs/build/11-kurye-rota.md › (11.7)`;
> şema `0046_delivery_run.sql` (0025 kaldırıldı). Uygulamada verilen ek karar: **catch-up claim** —
> aynı kuryenin AÇIK sefere ikinci "başlat" basışı reddedilmez, sonradan hazırlanan durakları da
> sefere bağlar (mobil şeridin bulgusu: gün ortasında hazırlanan sipariş aksi hâlde hiçbir sefere
> giremiyordu). Açık kalan tek sınır 11.7'nin BEKLEYEN'i: rota seçimi kuryenin depo kapsamını
> süzmüyor (19.5 bağlanınca kapanır).
> Analizi iki ajan çıkardı (veri+arka uç · arayüz), tespitler ana şeritçe kod üzerinde doğrulandı
> (23 iddia ölçüldü, 21 birebir tuttu). Kardeş etüt: `cok-gunluk-sefer.md` — tur, çok günlü seferdir;
> oradaki karar bu tabloyu genişletir, çelişmez (§6).

## 1. Kavram — iki "sefer" var, biri zaten tanımlı

- **Planlanan sefer** = `(delivery_zone_id, delivery_date)` ikilisi. `DOMAIN.md` komşu davetini bu
  anahtarla tanımlıyor, `0044_neighbor_invite.sql` künyesi *"sefer yeni bir varlık değil"* diye
  saklamamayı seçmiş, motor `deliveryRunWindow` bu pencereyi ölçüyor. **Türetilmiş kalır — bu karar
  yürürlükte.** (Terim çakışması notu: `deliveryRunWindow` PLANLANAN penceredir; tablo gelince
  yorumlar bunu açıkça yazmalı, istenirse `plannedRunWindow`a taşıma üç çağrı + testleri.)
- **Gerçekleşen sefer (`delivery_run`)** = araç fiilen yola çıktı: kim sürdü, hangi araç, ne zaman
  çıktı/döndü, hangi duraklar, kasa mutabakatı. **Bugün hiçbir yerde saklanmıyor** — eksik varlık bu.
  Türkçesi "sefer" (müşteriye hiç görünmez — `BACKLOG-musteri.md` kuralı), İngilizcesi `delivery_run`:
  `delivery_*` ailesi (zone/date/type/proof) + `job_run`un `_run` soneki; `route` kelimesi şemada yok,
  `trip` bağsız, `dispatch` alınmış (sevkiyat ekranı), `tour` turizm çağrışımlı.

## 2. Neden gerekli — ölçülmüş yedi kanıt (18.08)

1. **`order.courier_id` DÖRT anlamı tek kolonda taşıyor:** plan ataması (tek yazan
   `assignCourierAction`) · fiili sürücü varsayımı (`listByCourier` zinciri) · mutabakat anahtarı
   (`courier_day_collection`) · **yetki/sahiplik kapısı** (5 kontrol noktası:
   `application/courier/{delivery,day,proof}.ts` + web köprüsü + `assertOwnStop`). Kapıda teslim
   edenin izi yalnız `order_status_log.actor_id` (+ kanıtlı kanalda `delivery_proof.courierId`).
2. **`courier_day_close` (0025) kendini kaymaya karşı donduruyor** — künyesi: *"sipariş sonradan
   başka kuryeye atansa bile"*. Yama var, model yok.
3. **Fiili çıkış/dönüş anının yazılacağı yer yok:** `route_departure_time`/`courier_close_time`
   yalnız PLAN ve *"onları hiçbir motor okumuyor"* (`day-hours.ts`).
4. **"Askıda kalanlar" bölümü bu boşluğun el yordamı:** `bringForwardAction` künyesi kilidi kendisi
   ölçmüş — *"hiçbir zamanlanmış iş/trigger siparişe dokunmuyor"*; sipariş `out_for_delivery`de
   kimsenin ulaşamadığı kilitte kalabiliyordu.
5. **İkinci yazılı tanık:** `warehouse/returns.ts` künyesi — *"`courier_day_close` ile sipariş
   arasında FK YOK; dolaylı bağ üstüne kurulan liste, kurye atanmadan dönen bir siparişi sessizce
   yutar."*
6. **Araç hiçbir şeye bağlanmıyor:** `temperature_log` araca bağlı ama araç↔sipariş köprüsü yok —
   "bu sipariş hangi araçla, hangi sıcaklıkta gitti" (gıda denetim sorusu) cevapsız.
7. **Kurye rota seçmiyor:** `listByCourier(courierId, {deliveryDate})` bölge süzgeçsiz; iki rotalı
   kurye ikisini karışık görür ve "yola çıktım" ikisini birden çıkarır. Hedef akış (kullanıcı,
   17.08): *"kurye giriş yapar, ROTA seçer, aracını doldurur, o rotayı sürer; siparişin kurye
   bilgisi o gün gerçekleştirilen seferin kurye bilgisinden gelir."*

## 3. Alınan kararlar (kullanıcı, 18.08)

| # | Karar | Sonucu |
|---|---|---|
| K1 | **Kasa kapanışı SEFER BAŞINA** | "Fark hangi seferde doğdu" cevaplanır. `0025` sefer eksenine iner (greenfield: doğrudan yeniden şekillenir): kapanış anahtarı `courier_id+date` → `delivery_run_id`; `courier_day_collection` → run bazlı görünüm; mobil K7 + web `close/` + K1 "cepteki para" okuması birlikte değişir. İki seferli günde iki sayım — bilinçli bedel. `DOMAIN §7/§17`nin "kurye/gün ekseninde kalır" cümleleri aynı commit'te güncellenir. |
| K2 | **Elle atama DEVİR düğmesine iner** | Toplu atama çubuğu (`AssignBar`) + sipariş seçim kolonu kalkar; SEFER üstünde tek istisna eylemi kalır: "kuryeyi değiştir/devret" (hasta kurye, evde kalan telefon). |
| K3 | **Rota+gün başına TEK sefer** | Mutlak `unique(delivery_zone_id, delivery_date)`. İkinci tur veride yasak; iki kuryenin aynı rotayı başlatma yarışı `already_started` ile veride reddedilir. İleride ikinci tur gerçek olursa kısıt kısmi unique'e gevşetilir. |
| K4 | **Sefer kapanışı takılı durakları OTOMATİK çözer, günü sevkiyatçı yazar** | Kapanış `out_for_delivery`de kalmış durakları `ready`'ye düşürür (not: "sefer kapandı, durak sonuçlanmadı") — bugünkü kilit yapısal olarak ölür. Hangi güne yeniden yazılacağı sevkiyatçının kararı kalır (16.08 "görünür devir" korunur). `bringForwardAction`ın durum-çözme dalı ölür, tarih yazımı kalır. |

Ana şeridin bildirdiği üç ek karar: **sefer kodu baştan var** (`SF-26-XXXXXX`,
`purchaseOrderReferenceNo` deseni — kullanıcının ilk sorusu "kodu oluyor mu" idi) · **araç seçimi
parametrik** (`Setting`, varsayılan zorunlu-değil; tek araçta otomatik) · **durum makinesi yok**
(`created_at/departed_at/returned_at` üç damgası; hâl türetilir, TS'te `runStateOf` motor
fonksiyonu).

## 4. Şema taslağı (0046 + 0025 revizyonu)

```sql
create table public.delivery_run (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,                 -- SF-26-XXXXXX (domain-core üretir)
  delivery_zone_id uuid not null references delivery_zone (id) on delete restrict,
  delivery_date date not null,
  warehouse_id uuid not null references warehouse (id) on delete restrict,  -- SNAPSHOT (zone taşınsa da sefer sabit)
  courier_id uuid not null references user_profiles (id) on delete restrict,
  vehicle_id uuid references vehicle (id) on delete restrict,               -- parametrik zorunluluk
  created_at timestamptz not null default now(),     -- yükleme başladı
  departed_at timestamptz,                           -- yola çıktı
  returned_at timestamptz,                           -- döndü
  note text,
  constraint delivery_run_times check (
    (departed_at is null or departed_at >= created_at)
    and (returned_at is null or departed_at is not null)
    and (returned_at is null or returned_at >= departed_at))
);
-- K3: rota+gün başına TEK sefer (mutlak unique).
create unique index delivery_run_key on delivery_run (delivery_zone_id, delivery_date);

alter table public.order add column delivery_run_id uuid
  references delivery_run (id) on delete set null;   -- kısmi indeksle
```

- **`order.courier_id` SÖKÜLMEZ, senkronlanır** (iki ajanın uzlaşması, doğrulandı): sefer
  başlatılırken `start_delivery_run` seferin kuryesini siparişlere `delivery_run_id` + `courier_id`
  birlikte yazar. 5 sahiplik kapısı + ~90 okuma noktası hiç değişmez; değişen yalnız kolonu dolduran
  el (sevkiyatçı menüsü → kuryenin sefer başlangıcı). Emsal: `delivery_zone_id` snapshot deseni.
- **`start_delivery_run` RPC** (STACK §13: eşzamanlılık + bölünemez çok-tablolu yazım): satır aç →
  `(zone,date)` siparişlerini `for update` claim et → `delivery_run_id`+`courier_id` yaz. Durum
  geçişi RPC'ye GÖMÜLMEZ: claim sonrası `out_for_delivery` geçişleri motor izniyle uygulama
  katmanında (dört-liste sözleşmesi korunur). Unique ihlali → `already_started` + mevcut satır.
- **`close_delivery_run` de RPC** (K1+K4 bunu gerektirdi): `returned_at` + kapanış satırı
  (`delivery_run_close`: expected/counted × üç yöntem, delivered/returned/pending kimlik listeleri,
  `reconciled` generated — 0025'in alanları, anahtarı `unique(delivery_run_id)`) + takılı durakların
  `ready`'ye düşürülmesi TEK transaction. Beklenen tahsilat görünümü `order.delivery_run_id` ile
  gruplar — 0025'in "sonradan atama kayması" yaması kökten gereksizleşir.
- **Soğuk zincir KOLONLA değil JOIN'le:** `order.delivery_run_id → delivery_run.vehicle_id →
  temperature_log.vehicle_id` + `recorded_at between departed_at and coalesce(returned_at, now())`.
  `temperature_log`a run kolonu eklenmez (`one_point` kısıtı: ölçüm tek noktanın kaydıdır).
- **Komşu daveti (0044) ve `order.delivery_zone_id+delivery_date` DOKUNULMAZ:** onlar PLANLANAN
  seferin fotoğrafı; davet anında gerçekleşen sefer henüz yok.
- **Sözleşme geçişi eklemeli:** `StartCourierDayRequest`e `zoneId?`/`vehicleId?` eklenir; `zoneId`
  verilmezse ve kuryenin o gün TEK rotası varsa otomatik seçilir, birden çoksa `route_required` —
  Zod bilinmeyen alanı soyduğu için eski istemci kırılmaz. Yeni okuma: `GET /courier/routes?date=`.

## 5. Yol haritası (iki raporun sentezi; kararlar işlenmiş)

| Faz | İş | Başlıca dosyalar |
|---|---|---|
| 0 | **Tasarım turu:** `admin-teslimat` · `kurye-gun` · `app-kurye` · `kurye-kapanis` · `admin-dashboard` güncelle, `admin-seferler` yaz; Claude Design kareleri (K1 rota seçimi, dispatch sefer şeridi, sefer listesi/detayı) | `design/pages/*` |
| 1 | **Tablo+tip+servis+seed+purge** — davranış değişmez | `0046_delivery_run.sql` · `packages/types` (delivery-run + order şeması) · `delivery-run.service.ts` · `cleanup.ts` (3 restrict silmesi: profil/zone/araç grupları) · `scripts/seed/orders.ts` + `coverage.ts` · fikstürler (`accounting/{export,profit}`, `orders-read`, mobil `courier-fixture`) · yorum hijyeni (`delivery-days.ts`, bayat `seed.ts` vehicle notu) |
| 2 | **Yazma yolu + mobil K1:** `start_delivery_run` RPC; `startCourierDay` → `startDeliveryRun`; sözleşme genişlemesi; K1'e rota-seçim hâli (ayrı ekran değil, gövdenin dördüncü hâli; tek rotada atlanır) + "Seferi başlat" CTA; `started` bayrağının sunucu verisinden türemesi (yerel kilit hack'i ölür) | `0046` (RPC) · `application/courier/day.ts` · `courier-api.schema.ts` · `mobile-api courier.ts` · `courier-day-screen.tsx` + `use-courier-day.hook.ts` (native şeride talep dosyası) |
| 3 | **Dispatch:** rota başına sefer şeridi (açılmadı / yolda <saat> / döndü <saat> · kurye · araç); `unassigned` engeli → "sefer açılmadı" (rota başına); K2: `AssignBar`+seçim kolonu sökülür, sefere "devret" gelir; kurye kolonunun kaynağı sefer | `dispatch-{read,types,sections,client,actions}` |
| 4 | **Kapanışın sefer eksenine inişi (K1+K4):** `0025` yeniden şekillenir (`delivery_run_close` + run bazlı görünüm + `close_delivery_run` RPC, takılı durak otomatiği içinde); mobil K7 "Seferi kapat" + web `close/` + K1 "cepteki para" — üçü aynı taslağı okur, tek pencerede; `bringForward` tarih yazımına iner | `0025` revizyonu · `application/courier/day-close.ts` · `day-close-screen` · web `close/*` · `dispatch-actions.ts` |
| 5 | **Geçmiş + köprüler + senkron:** `deliveries`e üçüncü sekme `runs` (keyset + infinite scroll; tablo/detay emsalleri mevcut desenlerden); sipariş detayına sefer köprüsü; panel `routesOf` kurye-grubundan sefer kimliğine; web durak "Yola çıktım" temizliği; `DOMAIN §6/§7/§17` + `data-model/musteri-siparis.md` + `build/11-kurye-rota.md` senkronu | `deliveries-url` · `delivery-tabs` · yeni `runs-*` · `order-detail.desktop` · `dashboard-page-read` |

**İlk gün değişmek zorunda olan tek yüzey mobil K1** (sefer kaydını doğuran yüzey); orders/routes/
panel/web-kurye-dalı eski okumayla yaşar. Faz 1 bir `db:refresh` penceresi ister (kullanıcı kararı).

## 6. Çok günlü turla ilişki (`cok-gunluk-sefer.md`)

Tur = **çok günlü sefer**; aynı varlığın iki ölçeği. `delivery_run` tek günlük hâliyle açılır; tur
kararı verilirse genişleme doğal: `departed_at`/`returned_at` zaten gün sınırı tanımıyor (timestamptz),
tur içi sıra/rota kümesi PLAN tarafının işi (`trip_group`/`trip_day` önerisi zone'da). K1 kararı
(sefer başına kapanış) turda da doğallaşır: tur başına tek dönüş, tek mutabakat — §7.4'ün sorusuna
bugünkü kararla cevap verilmiş oldu. §7.5 (kurye kasası) ve §7.6 (yoldaki mal) AÇIK kalıyor — bu
etüdün kapsamına alınmadı, tur kararıyla birlikte ele alınmalı.

## 7. Riskler

1. **Mobil şerit senkronu:** K1/K7 ekran işi native şeridin — sözleşme eklemeli tutuldu, yine de
   Faz 2 ve 4 talep dosyasıyla eşgüdüm ister (`docs/talep/`).
2. **Doküman çelişkisi penceresi:** `DOMAIN §17` *"araçlar bir güne ya da kuryeye bağlanmaz; kapanış
   kurye/gün ekseninde"* — `delivery_run.vehicle_id` ve K1 bu cümleleri değiştiriyor; kod ve doküman
   AYNI commit'te gitmezse `docs:check` görmez, insan gözünde yalan olur.
3. **Sefer satırı doğmazsa ekranlar boş kalır:** kurye "seferi başlat" demeden hiçbir kayıt doğmaz.
   Çare kapının kendisi: teslim/ulaşılamadı yalnız YOLDAKİ siparişten yazılabilir (bugünkü kural) ve
   yola çıkarmak artık sefer açmak demek — kayıt zorunlu kapı, seçenek değil.
