# OBSERVABILITY — Log, Hata İzleme ve Sistem Sağlığı

> **Kapsam:** sistemin kendi hakkındaki bilgisi. "Dün gece checkout neden 500 döndü", "cron koştu mu",
> "disk doluyor mu" sorularının nerede yanıtlandığı.
>
> **Kapsam DIŞI:** iş kayıtları. `order_status_log`, `job_run`, `webhook_event`, `temperature_log`,
> `account_movement` bu dosyanın konusu değil — bkz. "§1 İki tür iz".
>
> Görev satırı: `build/18-operasyon-guvenlik.md` (18.5). Ekran içeriği: `design/pages/admin-sistem.md`.
> Tablolar: `data-model/operasyon.md`.

---

## 0. Neden bu dosya var

`STACK.md` bu konuyu tek satırda geçiyordu: *"yapılandırılmış JSON log + logrotate; kritik hatada
admin'e e-posta."* O satır bir niyetti, tasarım değil. Ölçtük (29.07): kodda **17 çıplak `console.*`**
çağrısı var, her biri farklı biçimde; logger yok, seviye yok, istek kimliği yok, PII disiplini yok,
saklama süresi yok, bakılacak bir ekran yok. Yani üretimde bir şey ters gittiğinde elimizde
**hiçbir şey** olmayacaktı.

Kararlar tek yerde toplandı çünkü üç parça (log · hata · sağlık) **birbirinin yerine geçmez ama
birbirini besler**: sağlık ekranı "son bir saatte kaç hata" der, o sayı `error_log`'dan gelir; hata
kaydı stack'i taşır, o stack'in bağlamı istek kimliğiyle log satırlarına bağlanır.

---

## 1. İki tür iz — karıştırılmaması gereken ayrım

| | **İş kaydı** (zaten var) | **Teknik iz** (bu dosya) |
| --- | --- | --- |
| Neyi yanıtlar | "Sipariş ne zaman teslim oldu", "kupon kaç kez kullanıldı" | "Checkout neden 500 döndü", "cron neden gecikti" |
| Kim okur | Operasyon, muhasebe, müşteri | Geliştirici / sistem sahibi |
| Örnek | `order_status_log`, `account_movement`, `discount_use` | `error_log`, yapılandırılmış log satırı |
| Ömrü | **Kalıcı** — silinmez, denetim malı | **Sınırlı** — saklama süresi var (§6) |
| Şeması | Sıkı, alan alan tanımlı | Gevşek (`context jsonb`) |

Bu ayrım kurala bağlanıyor: **iş kaydı log'a yazılmaz, teknik iz iş tablosuna yazılmaz.** Sipariş
onayını `logger.info` ile bildirmek, kaydı süresi dolan bir yere koymak olur; bir Postgres bağlantı
hatasını `order_status_log`'a yazmak da denetim verisini gürültüyle kirletir.

Tek kesişim `job_run`: cron'un **son turu** orada durur (iş kaydı), turun **neden düştüğü**
`error_log`'da (teknik iz). Biri "koştu mu" sorusunu, öbürü "neden koşamadı"yı yanıtlar.

---

## 2. Üç katman

### Katman 1 — Yapılandırılmış log (`pino`)

Her sürecin (web · backend) kendi logger'ı. Üretimde **JSON**, geliştirmede okunur renkli çıktı;
seviye `LOG_LEVEL` ortam değişkeninden, varsayılan üretimde `info`, geliştirmede `debug`.

JSON şart çünkü log'un okuyucusu insan değil, `grep`/`jq`. Serbest metin satırı ("Sipariş kaydedildi
LA-26-99C7YN, toplam 47.50") aranabilir değildir; alanlı satır aranabilirdir.

Çağrı biçimi tek: **bağlam nesnesi önce, mesaj sonra.**

```ts
logger.error({ context: 'order/checkout', orderId, err: getErrorMessage(err) }, 'taslak açılamadı');
```

**Sınırlar** (referans projede öğrenilmiş, tekrar öğrenmeye gerek yok): `pino` node-only —
istemci komponentinde `console` kalır. Edge runtime'da çalışmaz; bugün edge kullanmıyoruz, kullanılırsa
o rotada `console` fallback'i gerekir.

### Katman 2 — Hata kaydı (`error_log` + `capture_error`)

Sunucu tarafı hataları **kendi tablomuza** yazılır ve operasyon ekranında görünür. Dış servis
(Sentry) yok: veri sahipliği, KVKK ve sıfır dış bağımlılık. Ölçeğimizde bir SaaS'ın aylık bedeli ve
veri aktarımı, kazandırdığından fazla.

**Parmak izi (`fingerprint`) ile gruplama** bu katmanın bütün değeri. Anahtar üç parçadan kurulur:
kaynak + normalize edilmiş mesaj + `node_modules` dışındaki ilk stack karesi. Mesajdaki UUID, uzun
sayı ve hex diziler sabitlerle değiştirilir — böylece *"Order abc-123 not found"* ile *"Order def-456
not found"* **aynı satıra** düşer (`count++`, `last_seen_at` tazelenir). Bin aynı hata bir satır;
gruplanmasa liste kendi kendini gömerdi ve içindeki tek yeni hata görünmezdi.

**Çözüldü işareti ve regresyon.** Kısmi unique indeks yalnız aktif satırlara bakar
(`where resolved_at is null`). Operatör "çözüldü" dedikten sonra aynı hata tekrar gelirse **yeni satır**
açılır. Bu bilinçli: çözülmüş bir hatanın geri gelmesi, hiç çözülmemiş olmasından **farklı bir
haberdir** — sayacı sessizce artırmak o haberi yutardı.

**Yazma sırası: ÖNCE log, SONRA veritabanı.** İki gerekçesi var ve ikisi de tek başına yeterli:
(a) hata kaydının kendisi çökerse orijinal hatayı maskelememeli; (b) veritabanına erişilemezken de
diskte iz kalmalı — DB'nin düştüğü an, iz tutmanın en gerekli olduğu andır. `captureError` bu yüzden
**asla fırlatmaz**.

**Otomatik yakalama.** Next'in `instrumentation.ts` → `onRequestError` kancası sunucu tarafı
hatalarını (RSC render, route handler, server action) kendiliğinden toplar; `NEXT_*` digest taşıyan
kontrol-akışı "hataları" (`redirect`, `notFound`) atlanır — onlar hata değil, akıştır. Backend
tarafında aynı işi Hono'nun `onError`'ı ve cron kabuğu yapar. Elle `try/catch` serpmeye gerek yok:
**yakalama altyapının işi, bağlam eklemek çağıranın işi.**

### Katman 3 — Sistem sağlığı (`system_health_snapshot`)

Backend cron'u iki dakikada bir sunucunun anlık görüntüsünü alır, eşiklerden bir durum hesaplar
(`ok` / `warn` / `crit`) ve **tek `jsonb` satırı** yazar. Ekran son durumu kart olarak, geçmişi grafik
olarak gösterir.

Toplanan dört küme:

| Küme | İçerik | Kaynak |
| --- | --- | --- |
| `system` | yük ortalaması (1/5/15 dk), çekirdek sayısı, RAM (toplam/kullanılan/kullanılabilir), swap, disk (toplam/kullanılan/%), uptime | `/proc/meminfo`, `df`, `os.*` |
| `processes` | PM2 süreç başına durum · yeniden başlama sayısı · bellek · CPU | `pm2 jlist` |
| `services` | web ayakta mı, Caddy etkin mi, HTTPS sertifikası kaç gün sonra doluyor | `fetch localhost`, `systemctl is-active`, `openssl` |
| `app` | son bir saatteki hata sayısı, son bir saatteki cron düşüşü | `error_log`, `job_run` |

**Her metrik defansif.** Bir kaynak (`df`, `pm2`, `openssl`) patlarsa o alan güvenli varsayılana düşer
ve görev devam eder. Sağlık toplamanın kendisi bir arıza kaynağı olamaz — "izleme çöktü" demek
"izleme yok" demektir.

**Tek `jsonb` sütunu, kolon kalabalığı değil.** Metrik kümesi zamanla değişir (yeni bir servis,
yeni bir eşik); her metrik için kolon açmak her eklemede migration demek olurdu. Karşılığında alan
adı doğrulaması Zod'a düşüyor — kabul edilir bir bedel, çünkü bu veri **rapor girdisi değil**, panele
bakan bir gözün gördüğü şey.

**Neden anlık görüntü, neden zaman serisi değil.** Zaman serisi veritabanı (Prometheus, InfluxDB)
bir bileşen daha, bir port daha, bir yedek daha demek. İki dakikalık çözünürlükte 14 günlük satır
Postgres için önemsiz (≈10.000 satır) ve sorduğumuz sorular ("disk ne zamandan beri doluyor")
bu çözünürlükte yanıtlanıyor.

---

## 3. İstek kimliği (correlation id)

Backend'de her HTTP isteğine bir `reqId` (UUID) atanır; method · path · status · süre tek satırda
loglanır (5xx → `error`, 4xx → `warn`, gerisi → `info`). Aynı isteğin bütün log satırları bu kimlikle
birleşir.

Değeri şurada görünür: müşteri *"sipariş veremedim"* dediğinde elde tek bir ipin ucu olur. Kimlik
olmadan aynı saniyedeki on isteğin satırları iç içe geçer ve hangi satırın hangi isteğe ait olduğu
ancak tahminle bulunur.

Web tarafında karşılığı `onRequestError`'ın taşıdığı `path` + `routePath`; Next istek kimliği vermez,
uydurmak da yanlış olurdu (aynı isteğin iki kancası iki farklı kimlik üretirdi).

---

## 4. Referans projeden ne alındı, ne DEĞİŞTİRİLDİ

Yapı `~/dev/petitcigogne`'dan alındı — orada çalışıyor, deseni olgun ve bu projeyle aynı yığında
(Next + Hono + Supabase + PM2 + Caddy). Aynen alınanlar: `pino` yapılandırması, `reqId` ara katmanı,
`fingerprint` gruplama mantığı, `capture_error` RPC'sinin atomik "insert veya count++" davranışı,
`onRequestError` kancası, sağlık metrik kümeleri ve eşik mantığı.

Dört şey **bilinçli farklı**:

### 4.1 E-posta alarmı YOK (kullanıcı kararı, 29.07)

`STACK`'in ilk taslağı *"kritik hatada admin'e otomatik e-posta"* diyordu. **Kaldırıldı.**

Gerekçe: alarm maili, gerçekten okunmadığı sürece bir güvence duygusu üretir ama güvence üretmez.
Eşiği doğru kurulmamış bir alarm ya susar ya bağırır; ikisinin de sonu görmezden gelinen bir klasördür.
Bu ölçekte izleme **çekme** modeliyle çalışır: operasyon panelinde çözülmemiş hata sayacı durur,
sistem sayfası tek bakışta `ok`/`warn`/`crit` söyler. Bakan görür.

Karşılığında bir yükümlülük doğuyor ve açıkça yazılıyor: **ekran, alarmın yerini tutmak zorunda.**
Sayaç panelin görünen yerinde olmalı, `crit` durumu göz kaçırmayacak biçimde işaretlenmeli. Bunun
tasarım karşılığı `design/pages/admin-sistem.md`'de duruyor.

İtme bildirimi ileride istenirse yeri hazır: `packages/notify` var ve sağlık işi durumu zaten
hesaplıyor. Ama **bugün yazılmıyor** — çağıranı olmayan bir alarm, ölü koddur.

### 4.2 Saklama süresi tanımlı (referansta yok)

Referansta `error_logs` sınırsız büyüyor. Bizde tanımlı:

| Veri | Süre | Gerekçe |
| --- | --- | --- |
| `error_log` | **90 gün** (`resolved_at` dolu olanlar) | `context` alanı sipariş kimliği taşıyor; teknik iz süresiz tutulacak kişisel veri değil (KVKK/GDPR veri minimizasyonu). 90 gün, `feedback_request.expires_at` ile aynı sayı — ikinci bir eşik uydurmanın gerekçesi yok |
| `error_log` (çözülmemiş) | **süresiz** | Çözülmemiş hata hâlâ açık bir sorundur; süpürülürse sorun kaybolmaz, yalnız görünmez olur |
| `system_health_snapshot` | **14 gün** | Ekranın en geniş penceresi 7 gün; iki katı, bir haftalık geriye bakışı her koşulda garanti eder |

Süpürme **mevcut cron kabuğuna** girer (`runJob` + `job_run`), yeni altyapı istemez.

### 4.3 Tablo adları tekil

Referans `error_logs` / `system_health_snapshots` kullanıyor; bizim şemada tablolar tekil
(`order`, `job_run`, `order_status_log`, `points_entry`). Adlandırmayı projeye uyduruyoruz:
**`error_log`** ve **`system_health_snapshot`**. Kozmetik ama tutarlılık ucuz.

### 4.4 Tek ekran, iki ekran değil

Referansta `/admin/errors` ve `/admin/health` ayrı sayfalar. Bizde **tek sayfa**: `/operations/system`.

Gerekçe: bu iki panel tek bir soruyu yanıtlıyor — *"her şey yolunda mı?"* İki ekrana bölmek, e-posta
alarmını kaldırdığımız (§4.1) bir kurulumda bakılması gereken yer sayısını ikiye çıkarır. Bakılmayan
ikinci ekran, olmayan ekrandır.

Referansın `mcp_call_log`'u ve `chromeCount` metriği **alınmıyor**: ikisi de oradaki MCP/headless
tarayıcı kurulumuna özgü, bizde karşılığı yok. Desen kopyalanırken bağlamı düşen madde olmasın.

---

## 5. PII ve `context` disiplini

`context jsonb` serbest bir alan ve serbest alanlar dolar. Kural: **kimlik yeter, içerik değil.**

- **Yazılır:** `orderId`, `customerId`, `variantId`, `path`, `jobName`, `provider`, sayaçlar.
- **Yazılmaz:** e-posta, telefon, ad, adres, kart/ödeme belirteci, oturum çerezi, ham istek gövdesi,
  tam varlık kopyası (`{...order}`).

Gerekçe pratik, yalnız hukuki değil: hata kaydı **teşhis** içindir ve teşhis için kimlik yeter — o
kimlikle veritabanına bakılır. Ham kopya taşımak, süresi olan bir tabloya kişisel veri taşımak ve
kaydı okunmaz kılmak olur.

`message` 2000, `stack` 8000 karaktere kırpılır. Kırpma sessiz değil: kesilen metnin sonu görünür
olduğu için parmak izi zaten ilk stack karesinden kuruluyor.

---

## 6. Diskteki log ve döndürme

PM2 süreç çıktısını dosyaya yazar; döndürme `pm2-logrotate` ile (boyut tavanı + tutulacak dosya
sayısı). JSON log'un yeri stdout'tur — dosyaya yazmayı uygulama üstlenmez: süreç yöneticisi bunu
zaten yapıyor ve iki yazan olursa biri eksik kalır.

Ayrıntı ve komutlar dağıtım işinde (`18.9`); burada yalnız kural: **uygulama stdout'a yazar, döndürme
süreç yöneticisinin işidir.**

---

## 6b. Uygulamada netleşenler (kodlandı 30.07)

Tasarım yazıldıktan sonra kodlarken beş şey somutlaştı; ikisi tasarımı değiştirdi:

- **`packages/observability` — TEK paket, iki değil.** Referans projede web ve backend kendi `pino`
  yapılandırmasını kuruyor; burada duplication yasak (CLAUDE.md §1). Paket `logger` + `captureError`
  + `SOURCES` taşır.
- **Alt yol dışa açımı: `@lezzet/observability/logger`.** Kök giriş `captureError`'ı da veriyor ve o
  `@lezzet/database`'e bağlanıyor. `packages/email` gibi yaprak paketlerin veritabanıyla işi yok —
  onlar yalnız logger alt yolunu çeker (bağımlılık grafiği **import'ları** izler, `package.json`'u değil).
- **Eşik hesabı `domain-core`'a gitti** (`observability/health-status`), toplama işi `apps/backend`'de
  kaldı. Ayrım STACK §4: "disk %84 uyarı mı" saf bir yüklemdir ve testlenir; `df`/`pm2` okumak I/O'dur
  ve testlenemez. Tek dosyada yaşasalardı eşiği sınamak için sunucu taklidi kurmak gerekirdi.
- **RLS politikası YAZILMADI** — tablolar `enable row level security` + politika yok (deny-by-default),
  `job_run`/`webhook_event` ile aynı desen. Referans projede admin `SELECT` politikası var ama oradaki
  `is_admin()` yardımcısının burada karşılığı yok ve RLS kapsamı hâlâ açık karar (18.1). Okuma
  operasyon sayfasında `requireAdmin` kapısından geçecek.
- **Normalize kuralında bir hata testle bulundu:** parmak izi `\b\d{4,}\b` kullanıyordu ve
  *"timeout after 30000ms"* gibi **birime yapışık** sayıları sabitlemiyordu — rakam ile harf arasında
  kelime sınırı oluşmuyor. Her zaman aşımı kendi satırını açardı, yani gruplamanın en çok gerektiği
  yerde çalışmıyordu. Son sınır kaldırıldı (`\b\d{4,}`).

## 7. Kararlar özeti

1. Üç katman birlikte kurulur, kademeli değil (kullanıcı kararı 29.07): yalnız logger yazmak, hatayı
   görecek ekranı olmayan bir sistem bırakırdı.
2. Dış izleme servisi yok — kendi tablomuz, kendi ekranımız.
3. **E-posta/itme alarmı yok**; izleme çekme modeliyle, ekran alarmın yerini tutar.
4. Hata kaydı asla fırlatmaz ve daima önce stdout'a yazar.
5. `fingerprint` ile gruplama; "çözüldü" sonrası tekrar = yeni satır (regresyon görünür).
6. Saklama: hata 90 gün (çözülmüşler), sağlık 14 gün; çözülmemiş hata süresiz.
7. `context`'e kimlik yazılır, içerik yazılmaz.
8. Tek operasyon ekranı (`/operations/system`), iki panel.
