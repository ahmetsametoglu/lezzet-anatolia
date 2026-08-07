/**
 * E2E ÖN-UÇUŞ YOKLAMASI (00.9 · 06.08 vakası) — koşu başlamadan dev server'ın CANLI ve MAKUL
 * hızda olduğunu doğrular; değilse adlı hatayla DÜŞER, koşu hiç başlamaz.
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * Yaşandı (06.08): Next dev süreci 30+ saat ayakta kaldıktan sonra ASILDI — süreç canlı (CPU %0),
 * port açık, ama her istek sonsuza dek bekliyor. E2E bunu ayırt edemeyince 8 senaryo × 60-180 sn
 * zaman aşımını sırayla yaktı: 15-20 dakikalık sessiz, kırmızı ve HİÇBİR ŞEY söylemeyen koşular.
 * Aynı belirti daha hafif biçimde "patlama penceresi"nde de görülür (şerit kaydedince derleme
 * fırtınası) — ikisinde de doğru davranış koşuyu yakmak değil, ERKEN ve SESLİ vazgeçmektir.
 *
 * ── EŞİKLER (parametrik) ─────────────────────────────────────────────────────
 * `E2E_PREFLIGHT_TIMEOUT_MS` (vars. 15000): tek yoklamanın tavanı — sağlıklı dev'de soğuk sayfa
 * bile bunun çok altında döner (ölçüldü: 0,3–5 sn). `E2E_PREFLIGHT_SKIP=1` kaçış kapısı (bilinçli
 * kullanım için; CI/Kademe 3 kendi build'ini kendisi yoklar).
 */
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const TIMEOUT_MS = Number(process.env.E2E_PREFLIGHT_TIMEOUT_MS ?? 15_000);
// İki yoklama iki ayrı soruya bakar: kök = süreç ayakta mı; operasyon rotası = uygulama derleyip
// CEVAP VEREBİLİYOR mu (kök bazen önbellekten döner, asılı sunucuda bile).
const PATHS = ['/', '/operations'];

if (process.env.E2E_PREFLIGHT_SKIP === '1') {
  console.log('[e2e-preflight] atlandı (E2E_PREFLIGHT_SKIP=1)');
  process.exit(0);
}

for (const path of PATHS) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, {
      redirect: 'manual', // yönlendirme de canlılık kanıtıdır (/ → /fr 307)
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'e2e-preflight' }, // bot deseni: analitik kapısı düşürür, defter kirlenmez
    });
    const ms = Date.now() - started;
    if (res.status >= 500) {
      console.error(`[e2e-preflight] ✗ ${path} → HTTP ${res.status} (${ms} ms) — dev server hata basıyor; koşu İPTAL.`);
      process.exit(2);
    }
    console.log(`[e2e-preflight] ✓ ${path} → ${res.status} (${ms} ms)`);
  } catch {
    console.error(
      `[e2e-preflight] ✗ ${path} ${TIMEOUT_MS} ms içinde CEVAPSIZ — koşu İPTAL (zaman aşımı yakılmadı).\n` +
        `  Bilinen sebep (06.08 vakası): uzun yaşayan Next dev süreci asılı kalır — süreç canlı görünür ama istek bekletir.\n` +
        `  Çare: dev server'ı YENİDEN BAŞLATIN (kullanıcı yönetir, CLAUDE §4) ve koşuyu tekrarlayın.\n` +
        `  Yoğun derleme penceresiyse birkaç dakika sonra deneyin; eşik: E2E_PREFLIGHT_TIMEOUT_MS.`,
    );
    process.exit(2);
  }
}
