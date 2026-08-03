# Denetim — hata kaydı ağının kör noktaları (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Soru: hata ÜRETEBİLEN her yol bir İZ bırakıyor mu? İlk taramada
> üç kör nokta çıktı (G1–G3); ağın geri kalanı örnek düzeydeydi (funnel · `onRequestError` ·
> Hono `onError` · cron çifte izi · bildirim yolu — ilk sürümdeki G4 dökümü).

## Kapananlar (03.08 — kodda doğrulandı)

- **G2 — backend süreç emniyet ağı:** iki kanca uygulama kurulumundan ÖNCE takılı
  (`apps/backend/src/index.ts:28-33`); `unhandledRejection` yazar-yaşar, `uncaughtException`
  yazar-temiz çıkar (`finally` ile — kayıt yarıda kesilmez). Şeridin `SOURCES.backendProcess`
  ayrımı ("bir iş düştü" ≠ "süreç öldü") öneriden doğru bir sapma. İkinci yarı ("backend N
  dakikadır görüntü yazmadı" uyarısı) `18.11` görev satırına devredildi — orada izlenir.
- **G3 — webhook izleri:** işleme hatasında `markFailed` yanına `captureError`
  (`stripe-webhook.ts:82`, kimlik taşır, gövde yok); imza reddinin iki dalında `logger.warn`
  (`route.ts:73,90`). Şeridin "imza reddi `error_log`'a düşmez" seçimi doğru: kapının beklenen
  reddi arıza değildir, bot gürültüsü gerçek arızayı boğardı — gerekçe kodda künye olarak duruyor.

## G1-açık: istemci hata sınırlarının MÜŞTERİ yarısı

Kapı kuruldu ve operasyon bağlandı (`lib/observability/report-client-error.ts` — yol sorgu
dizesiz, yığınsız, throttle'lı; `SOURCES.webClient` sabiti de arka uçça eklendi). **Kalan:**
`app/(customer)/[locale]/error.tsx` + kök `global-error.tsx` aynı kapıya bağlanacak — üçer satır,
müşteri şeridinde. Bağlanana kadar müşteri tarafındaki render çökmeleri sunucuda izsiz.

**Cevap (müşteri şeridi):** —
