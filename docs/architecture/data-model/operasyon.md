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

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | iş adı, **tekil** — upsert anahtarı (ör. `sweep_reservations`) |
| last_run_at | timestamptz | son turun zamanı; **hatalı turda da yazılır** — "koştu ama düştü" ile "hiç koşmadı" ayrımı buradan doğar |
| last_result | jsonb \| null | son turun özeti (`{"affected": 3}`); şeması işe göre değişir |
| last_error | string \| null | son hata mesajı; başarılı turda `null`'lanır → "şu an sağlıklı mı" tek bakışta |

**Neden bellekte değil:** backend yeniden başlayınca bellekteki iz silinir; "cron dün gece koştu mu"
sorusu tam da yeniden başlatmalardan sonra sorulur.

**Neden tarihçe yok:** her tur için satır açmak, iki dakikalık işlerde günde 720 satır demek olurdu ve
sorduğumuz soru "geçmiş turların listesi" değil. Turun *neden* düştüğü `error_log`'da yaşar
(`context.jobName`) — ikisi birlikte hem "ne zaman" hem "neden" verir.

---

## ErrorLog (hata kaydı)

Sunucu tarafı hataların gruplanmış kaydı. Dış izleme servisi (Sentry) yerine kendi tablomuz —
gerekçe `OBSERVABILITY §2`.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| fingerprint | string | **gruplama anahtarı**: `source` + normalize edilmiş `message` + `node_modules` dışındaki ilk stack karesi. Mesajdaki UUID/uzun sayı/hex sabitlenir → "Order abc-123 not found" ile "Order def-456 not found" aynı gruba düşer. Servis katmanı hesaplar, DB değil |
| level | enum(`warning`,`error`,`fatal`) | `warning` = beklenen ama izlenmeli · `error` = beklenmeyen istisna · `fatal` = akış tamamen koptu |
| source | string | hatanın geldiği yer: `web-server` · `backend-http` · `backend-cron` · `backend-webhook` |
| message | string | 2000 karaktere kırpılır |
| stack | string \| null | 8000 karaktere kırpılır |
| context | jsonb | ek bağlam: `orderId`, `jobName`, `provider`, method… **KİMLİK yazılır, İÇERİK yazılmaz** (`OBSERVABILITY §5`): e-posta/telefon/adres/ham gövde buraya girmez |
| path | string \| null | istek yolu (varsa) |
| count | int | aynı **aktif** parmak izi kaç kez görüldü |
| first_seen_at | timestamptz | |
| last_seen_at | timestamptz | listeleme sırası ve "son bir saatte kaç hata" sayımı bunun üstünde |
| resolved_at | timestamptz \| null | operatör "çözüldü" işaretlediyse dolu |
| resolved_by | uuid \| null | → `user_profiles`; `on delete set null` (personel silinse geçmiş karar bozulmaz) |
| created_at | timestamptz | |

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

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| created_at | timestamptz | trend sorgusu ve süpürme bu kolonun indeksini kullanır (`desc`) |
| status | enum(`ok`,`warn`,`crit`) | eşiklerden **türetilir**, elle yazılmaz; panelin renk kodu |
| metrics | jsonb | tam görüntü: `{ system, processes, services, app }` — alanları aşağıda |

`metrics` içeriği (Zod ile doğrulanır — `SystemHealthMetricsSchema`):

| Küme | Alanlar |
| --- | --- |
| `system` | `loadAvg` (1/5/15 dk), `cpuCount`, `memTotalMb`, `memUsedMb`, `memAvailableMb`, `swapTotalMb`, `swapUsedMb`, `diskTotalGb`, `diskUsedGb`, `diskUsedPct`, `uptimeSec` |
| `processes` | `pm2[]`: `name`, `status`, `restarts`, `memoryMb`, `cpuPct` |
| `services` | `webUp`, `caddyActive`, `certDaysLeft` (alınamazsa `null`) |
| `app` | `errorLogsLastHour`, `failedJobsLastHour` |

**Neden tek `jsonb`, kolon kalabalığı değil:** metrik kümesi zamanla değişir (yeni servis, yeni eşik);
her metrik için kolon açmak her eklemede migration demek olurdu. Bu veri **rapor girdisi değil**,
panele bakan bir gözün gördüğü şey — alan doğrulaması Zod'da yeter.

**Durum eşikleri** (`crit` biri yeterse, yoksa `warn` biri yeterse, yoksa `ok`):

| Durum | Koşullar |
| --- | --- |
| `crit` | PM2 süreci `online` değil · disk ≥ %90 · kullanılabilir RAM < 200 MB · web ayakta değil · Caddy etkin değil · sertifika < 7 gün |
| `warn` | disk ≥ %80 · kullanılabilir RAM < 500 MB · swap kullanımı ≥ %50 · 1 dk yük > çekirdek sayısı · son bir saatte > 10 hata · son bir saatte cron düşüşü · sertifika < 14 gün |

Eşikler **parametrik değil, sabit** ve bu bilinçli: ayar tablosuna taşımak, operatörün ayarlayacağı bir
şey olmadığı hâlde bir ayar ekranı borcu doğurur. Değişmesi gerekirse kodda değişir ve testi vardır.

**Her metrik defansif:** bir kaynak (`df`, `pm2`, `openssl`) patlarsa o alan güvenli varsayılana düşer,
görev devam eder. İzlemenin kendisi bir arıza kaynağı olamaz.

**Saklama: 14 gün.** Ekranın en geniş penceresi 7 gün; iki katı, bir haftalık geriye bakışı her koşulda
garanti eder. İki dakikalık çözünürlükte 14 gün ≈ 10.000 satır — Postgres için önemsiz.
