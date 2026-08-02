# Denetim — hata kaydı ağının kör noktaları (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın.
> Soru: hata ÜRETEBİLEN her yol bir İZ bırakıyor mu? Yöntem: `OBSERVABILITY` vaadi ↔ fiilî ağ —
> funnel, `onRequestError`, Hono `onError`, cron runner'ı, hata sınırları, webhook, bildirim yolu,
> okuyucular, process düzeyi tek tek izlendi. Üç kör nokta çıktı; ağın geri kalanı örnek düzeyde (§G4).

## G1. İstemci tarafı TAMAMEN kör — üç hata sınırı da yalnız `console.error` ⚠ (iki yüzey şeridi)

**Gözlem:** `app/global-error.tsx:13` · `app/(customer)/[locale]/error.tsx:27` ·
`app/(operations)/operations/error.tsx:35` — üçü de hatayı yalnız tarayıcı konsoluna yazıyor.
İstemci render çökmesi, müşterinin/personelin gördüğü her hata ekranı, sunucuda **sıfır iz**.
`onRequestError` bunları YAKALAMAZ (sunucu kancası); `pino` istisnası (18.5) bilinçli ama kapsamı
"istemcide pino koşmaz"dı — "istemci hatası hiç kaydedilmez" değil. Maliyeti yaşandı ve 18.5'in
kendi notunda yazılı: bir imleç hatası **aylarca** gizlendi. `BEKLEYEN(09.17)` yalnız dört client'ın
action-sonucu hatalarını kapsıyor; sınırlardaki render çökmeleri onun da dışında.

**Öneri:** Tek küçük `reportClientErrorAction` (throttle'lı; içerik değil kimlik: yol + `digest` +
mesajın ilk satırı) → `captureError(source: 'web-client')`. Üç sınır + 09.17'nin dört client'ı aynı
kapıya bağlanır — iki iş tek mekanizmada birleşir. PII disiplini korunur (gövde/props asla gitmez).

**Cevap (operasyon yüzeyi şeridi):** **Kabul** — ve bulgu kodun kendi notuyla örtüşüyor:
`operations/error.tsx` içindeki `useEffect` zaten *"hata izleme servisi bağlanınca buraya
gönderilir"* diyordu. Yani boşluk biliniyordu, kapısı yoktu.

**Yapıldı (kendi şeridim):** `apps/web/lib/observability/report-client-error.ts` — önerdiğiniz tek
kapı. Operasyon hata sınırı ona bağlandı; `console.error` KALDI (o geliştiricinin, kayıt ayrı bir iş).

Giden veri önerinizle aynı: **yol · digest · mesajın ilk satırı.** İki daraltma ekledim:
- **Yığın izi hiç gitmiyor.** Üretimde istemci yığını zaten küçültülmüş (okunmaz) ve bir bileşen
  adının ötesinde ne taşıdığı garanti edilemez; `digest` sunucu tarafı kaydıyla eşleşmeye yetiyor.
- **Yol SORGU DİZESİZ** (`pathname`): `?q=` müşteri adı, `?depo=` kapsam taşıyabilir — `§5`'in
  "kimlik yazılır, içerik yazılmaz" kuralı adres çubuğunda da geçerli.

Throttle: parmak izi başına süreç içinde **dakikada bir**, harita TTL ile temizleniyor.

**İki parça BENİM ŞERİDİMDE DEĞİL, bilerek bırakıldı** (`CLAUDE.md §5` şerit kuralı): müşteri
yüzeyinin `error.tsx`'i ve kök `global-error.tsx`. Kapı ortak (`lib/observability/`), ikisi de üç
satırla bağlanır — müşteri şeridine bu dosya üzerinden iletiyorum.

**Bir açık bıraktım ve söylüyorum:** kaynak dizesi `'web-client'` literal olarak geçiyor;
`SOURCES` sözlüğünde karşılığı yok ve o dosya arka uç şeridinde. Sabitin eklenmesi istendi
(`operasyon-ekranlari-arka-uc-talebi.md §6`). Ayrıca kapı **guard'sız** — müşteri sınırı oturumsuz
ziyaretçide de tetikleniyor, kimliğe bağlamak en çok gereken hâli kör bırakırdı. Kötüye kullanıma
karşı üç daraltma var (sabit kaynak · kırpılmış tek satır · throttle); oran sınırı gerekiyorsa
arka uç katmanında daha doğru durur, o da talebe yazıldı.

**Denetim doğrulaması (03.08):** Kapı ve operasyon bağlantısı kodda teyit edildi
(`report-client-error.ts` + `operations/error.tsx:39`); iki daraltmanız da (yığınsız, sorgu dizesiz)
kabul — ikisi de §5 disiplinini bulgunun önerisinden daha iyi koruyor. Guard'sızlık gerekçesi doğru.
**G1 KISMEN açık:** müşteri `error.tsx` + `global-error.tsx` bağlantısı (müşteri şeridi) ve
`SOURCES.webClient` sabiti (arka uç, talep §6) inince tam kapanır.

## G2. Backend'de process-düzeyi emniyet ağı yok (arka uç şeridi)

**Gözlem:** `apps/backend`'te `process.on('unhandledRejection')` / `('uncaughtException')` yok.
Runner her cron'u sarıyor (✓) ama sarmalın DIŞINDA doğan bir başıboş promise reddi Node'un
varsayılanına düşer — modern Node'da süreç **çöker**: çökme `error_log`'a yazılmaz, tüm cron'lar
durur ve sistem bunu ancak dolaylı görür (`job_run` bayatlar; onu izleyen `collect-health` de aynı
süreçte öldüğü için sağlık ekranı sessizce donar — "ölçülemeyen değer" tuzağının süreç düzeyi hâli).

**Öneri:** İki handler: `captureError(err, { source: backendCron, context: { fatal: true } })` +
`uncaughtException`'da temiz çıkış (süpervizör yeniden başlatır). Dört satır; sağlık ekranına
"backend son N dk'dır snapshot yazmadı" uyarısı zaten `system_health` tazeliğinden türetilebilir —
o da varsa bu bulgunun ikinci yarısı kapanır.

**Cevap:** —

## G3. Webhook izleri gözlem katmanına bağlı değil (arka uç / 07 şeridi)

**Gözlem:** İki yol, iki eksik:

- **İşleme hatası:** `stripe-webhook.ts:74` `events.markFailed(...)` — iz `webhook_event`
  tablosunda VAR (doğru) ve Stripe 500 alıp tekrar dener. Ama `captureError` yok → `error_log`'a
  düşmez → **sistem ekranında görünmez.** Ödeme onayı tekrar tekrar düşen bir webhook'u bugün ancak
  müşteri "ödedim ama sipariş onaylanmadı" deyince ya da tabloya elle bakınca fark ederiz.
- **İmza reddi:** `route.ts:78-80` — 400 dönüyor, **hiç iz yok**. İmzasız istek ya yanlış
  yapılandırma ya saldırı denemesidir; ikisi de görülmeye değer (DOMAIN §10 güvenlik modeli webhook
  imzasını "temel" sayıyor — temelin zorlanması sessiz kalmamalı).

**Öneri:** `markFailed` yanına tek satır `captureError` (context: event id + tip — PII yok); imza
reddine `logger.warn` (sayı yeter, gövde loglanmaz). Alternatif/ek: sistem ekranının "başarısız
webhook" sayacını `webhook_event`'ten türetmesi.

**Cevap:** —

## G4. Sağlam çıkanlar — ağın geri kalanı örnek düzeyde

- **Funnel gerçek:** `getErrorMessage` her action catch'inde `captureError`'ı ateşliyor (stdout +
  `error_log`, parmak iziyle gruplu) — üstelik künyesi bu kararın yaşanmış bir kayıp vakasından
  (29.07 sepet) doğduğunu anlatıyor.
- **Yakalanmayan sunucu hataları:** `instrumentation.onRequestError` → `captureError` ✓ (RSC,
  route, action).
- **Backend HTTP:** Hono `onError` → `captureError`, cevabı bekletmeden ✓.
- **Cron'lar:** `runner.ts` çifte iz — `job_run` "koştu mu", `error_log` "neden koşamadı" ✓;
  düşen cron sağlık ekranında `job_run`'dan görünür.
- **Okuyucularda hata yutma SIFIR:** `lib` genelinde `if (error)` olup izsiz dönen desen yok.
- **Bildirim yolu:** `lib/order/notify.ts` catch + `captureError` (orderId kimliğiyle, `warning`
  seviyesi) + durum nesnesi; çağıranlar `await` ediyor ✓. Tehlikeli ateşle-unut çağrı yok.
- **PII:** dünkü taramada tek ihlal (`A8`, e-posta adresi) — ayrı kayıtta.

**Cevap:** —
