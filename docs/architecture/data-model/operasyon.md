# Veri Modeli — Operasyon ve Gözlemleme

> Sistemin **kendi hakkındaki** verisi: zamanlanmış işlerin izi, hata kayıtları, sunucu sağlığı.
> Kararlar ve gerekçeler → [`../OBSERVABILITY.md`](../OBSERVABILITY.md). Görev satırı →
> `build/18-operasyon-guvenlik.md` (18.5), `build/06-stok.md` (06.4 — `job_run`).
>
> Bu dosyadaki tablolar **iş kaydı değildir** (o ayrım `OBSERVABILITY §1`): hiçbiri müşteriye
> gösterilmez, hiçbiri muhasebe girdisi değildir, `job_run` dışında hepsinin **saklama süresi** vardır.
>
> Yazma daima **service-role** iledir (backend cron, sunucu kancaları); okuma yalnız admin'e açıktır.

---

## JobRun (zamanlanmış iş izi)

Cron'un **son turu** — tarihçe değil. İş adı tekildir ve upsert anahtarıdır; her tur aynı satırı
üzerine yazar. "En son ne zaman koştu ve ne oldu" sorusunun en küçük cevabı budur.

<!-- alanlar:job_run -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `name` | text |  |  |
| `last_run_at` | timestamptz |  | `now()` |
| `last_result` | jsonb | • |  |
| `last_error` | text | • |  |
<!-- /alanlar -->

**Kararlar**

- **`name`** — iş adı, **tekil** — upsert anahtarı (ör. `sweep_reservations`)
- **`last_run_at`** — son turun zamanı; **hatalı turda da yazılır** — "koştu ama düştü" ile "hiç koşmadı" ayrımı buradan doğar
- **`last_result`** — son turun özeti (`{"affected": 3}`); şeması işe göre değişir
- **`last_error`** — son hata mesajı; başarılı turda `null`'lanır → "şu an sağlıklı mı" tek bakışta

**Neden bellekte değil:** backend yeniden başlayınca bellekteki iz silinir; "cron dün gece koştu mu"
sorusu tam da yeniden başlatmalardan sonra sorulur.

**Neden tarihçe yok:** her tur için satır açmak, iki dakikalık işlerde günde 720 satır demek olurdu ve
sorduğumuz soru "geçmiş turların listesi" değil. Turun *neden* düştüğü `error_log`'da yaşar
(`context.jobName`) — ikisi birlikte hem "ne zaman" hem "neden" verir.

---

## ErrorLog (hata kaydı)

Sunucu tarafı hataların gruplanmış kaydı. Dış izleme servisi (Sentry) yerine kendi tablomuz —
gerekçe `OBSERVABILITY §2`.

<!-- alanlar:error_log -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `fingerprint` | text |  |  |
| `level` | error_log_level |  | `'error'` |
| `source` | text |  |  |
| `message` | text |  |  |
| `stack` | text | • |  |
| `context` | jsonb |  | `'{}'::jsonb` |
| `path` | text | • |  |
| `count` | int |  | `1` |
| `first_seen_at` | timestamptz |  | `now()` |
| `last_seen_at` | timestamptz |  | `now()` |
| `resolved_at` | timestamptz | • |  |
| `resolved_by` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`fingerprint`** — **gruplama anahtarı**: `source` + normalize edilmiş `message` + `node_modules` dışındaki ilk stack karesi. Mesajdaki UUID/uzun sayı/hex sabitlenir → "Order abc-123 not found" ile "Order def-456 not found" aynı gruba düşer. Servis katmanı hesaplar, DB değil
- **`level`** — `warning` = beklenen ama izlenmeli · `error` = beklenmeyen istisna · `fatal` = akış tamamen koptu
- **`source`** — hatanın geldiği yer: `web-server` · `backend-http` · `backend-cron` · `backend-webhook`
- **`message`** — 2000 karaktere kırpılır
- **`stack`** — 8000 karaktere kırpılır
- **`context`** — ek bağlam: `orderId`, `jobName`, `provider`, method… **KİMLİK yazılır, İÇERİK yazılmaz** (`OBSERVABILITY §5`): e-posta/telefon/adres/ham gövde buraya girmez
- **`path`** — istek yolu (varsa)
- **`count`** — aynı **aktif** parmak izi kaç kez görüldü
- **`last_seen_at`** — listeleme sırası ve "son bir saatte kaç hata" sayımı bunun üstünde
- **`resolved_at`** — operatör "çözüldü" işaretlediyse dolu
- **`resolved_by`** — → `user_profiles`; `on delete set null` (personel silinse geçmiş karar bozulmaz)

**Kısmi unique indeks — `(fingerprint) where resolved_at is null`.** Aktif bir parmak izi için tek satır
olabilir; `capture_error` bunu `update … count = count + 1` ile yakalar, bulamazsa yeni satır açar.
Çözüldükten sonra aynı hata tekrar gelirse **yeni satır** doğar: çözülmüş bir hatanın geri gelmesi,
hiç çözülmemiş olmasından farklı bir haberdir (`OBSERVABILITY §2`).

**`capture_error` RPC (atomik).** Neden fonksiyon: "önce oku sonra yaz" arası iki eşzamanlı hata aynı
parmak izine düşerse biri kaybolur ya da unique ihlali fırlatır — `STACK §13` yazmada-RPC eşiğinin (a)
maddesi. Fonksiyon `security definer`, çağırma yetkisi yalnız `service_role`'da.

**Saklama:** çözülmüş kayıtlar **90 gün**; çözülmemiş kayıtlar **süresiz** (açık sorun süpürülmez,
süpürülürse yalnız görünmez olur). Süpürme mevcut cron kabuğundan geçer.

---

## SystemHealthSnapshot (sistem sağlığı anlık görüntüsü)

Backend cron'unun iki dakikada bir aldığı sunucu görüntüsü. Ekran son satırı kart, geçmişi grafik
olarak okur.

<!-- alanlar:system_health_snapshot -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `created_at` | timestamptz |  | `now()` |
| `status` | health_status |  |  |
| `metrics` | jsonb |  |  |
<!-- /alanlar -->

**Kararlar**

- **`created_at`** — trend sorgusu ve süpürme bu kolonun indeksini kullanır (`desc`)
- **`status`** — eşiklerden **türetilir**, elle yazılmaz; panelin renk kodu
- **`metrics`** — tam görüntü: `{ system, processes, services, app }` — alanları aşağıda

`metrics` içeriği (Zod ile doğrulanır — `SystemHealthMetricsSchema`):

| Küme | Alanlar |
| --- | --- |
| `system` | `loadAvg` (1/5/15 dk), `cpuCount`, `memTotalMb`, `memUsedMb`, `memAvailableMb`, `swapTotalMb`, `swapUsedMb`, `diskTotalGb`, `diskUsedGb`, `diskUsedPct`, `uptimeSec` |
| `processes` | `pm2[]`: `name`, `status`, `restarts`, `memoryMb`, `cpuPct` |
| `services` | `webUp`, `caddyActive` (**üç değerli** — alınamazsa `null`), `certDaysLeft` (alınamazsa `null`) |
| `app` | `errorLogsLastHour`, `failedJobsLastHour` |

**Neden tek `jsonb`, kolon kalabalığı değil:** metrik kümesi zamanla değişir (yeni servis, yeni eşik);
her metrik için kolon açmak her eklemede migration demek olurdu. Bu veri **rapor girdisi değil**,
panele bakan bir gözün gördüğü şey — alan doğrulaması Zod'da yeter.

**Durum eşikleri** (`crit` biri yeterse, yoksa `warn` biri yeterse, yoksa `ok`):

| Durum | Koşullar |
| --- | --- |
| `crit` | PM2 süreci `online` değil · disk ≥ %90 · kullanılabilir RAM < 200 MB · web ayakta değil · **Caddy `false`** (systemd "etkin değil" dedi) · sertifika < 7 gün · ölçüm 10+ dk bayat |
| `warn` | disk ≥ %80 · kullanılabilir RAM < 500 MB · swap kullanımı ≥ %50 · 1 dk yük > çekirdek sayısı · son bir saatte > 10 hata · son bir saatte cron düşüşü · sertifika < 14 gün · **ölçüm boşluğu** (disk `null` · pm2 `null` · **Caddy `null`**) |
| `info` | hükme GİRMEZ, yalnız gerekçe listesinde görünür: 1 sa'ten yeni çalışma süresi · okunamayan sertifika · 3+ yeniden başlamış ama ayakta süreç |

**`false` ile `null` ayrımı üç ölçümde de var ve zorunlu** (`OBSERVABILITY §6d`): "kapalı" bir arızadır, "soramadım" bir boşluktur. İkisi
tek değere indiğinde ölçüm boşluğu arıza gibi okunuyordu — Caddy'de bu, systemd olmayan her makinede ekranı kalıcı kırmızıya
çeviriyordu. Boşluk yine de sessiz geçmez: kendi başına `warn` üretir.

**Hüküm ve gerekçe TEK listeden.** `healthSignals(metrics, ageMinutes)` tutan bütün koşulları döner; `healthStatusOf` onu en ağır
seviyeye indirger. Ekran gerekçe cümlesini aynı listeden yazar — iki ayrı dallanma bir gün ayrışır ve motor "kritik" derken ekran
sebebi gösteremezdi. Sinyal metni motorda DEĞİL: karar motorun, dil arayüzün.

Eşikler **parametrik değil, sabit** ve bu bilinçli: ayar tablosuna taşımak, operatörün ayarlayacağı bir
şey olmadığı hâlde bir ayar ekranı borcu doğurur. Değişmesi gerekirse kodda değişir ve testi vardır.

**Her metrik defansif:** bir kaynak (`df`, `pm2`, `openssl`) patlarsa o alan güvenli varsayılana düşer,
görev devam eder. İzlemenin kendisi bir arıza kaynağı olamaz.

**Saklama: 14 gün.** Ekranın en geniş penceresi 7 gün; iki katı, bir haftalık geriye bakışı her koşulda
garanti eder. İki dakikalık çözünürlükte 14 gün ≈ 10.000 satır — Postgres için önemsiz.
