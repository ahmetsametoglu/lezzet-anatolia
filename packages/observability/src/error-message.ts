/**
 * Bir hatanın OKUNABİLİR mesajı — `unknown`dan tek kapıdan çıkarılır.
 *
 * ── NEDEN GEREKLİ (ölçüldü 09.08, harici MCP denetimi) ──────────────────────
 * Her yerde `error instanceof Error ? error.message : String(error)` yazıyorduk ve bu **Supabase
 * hatalarını kaçırıyor**: PostgREST hatası bir `Error` DEĞİL, düz bir nesnedir
 * (`{ message, code, details, hint }`). Sonuçlar somut:
 *
 * - MCP aracı geçersiz bir uuid alınca modele **`Araç hatası: [object Object]`** dönüyordu —
 *   asistan neyi düzelteceğini anlayamıyor, `error_log`a da aynı dize düşüyordu (ölçüldü: 1 kayıt).
 * - Web tarafında `getErrorMessage` aynı sebeple **"Beklenmeyen bir hata oluştu"**ya düşüyordu:
 *   veritabanı "geçersiz uuid biçimi" diye tam olarak söylüyor, operatör hiçbir şey görmüyordu.
 *
 * Yani kayıp bilgi teşhisin kendisiydi. Kural artık çağıranlarda değil burada.
 *
 * **Maskeleme burada YAPILMAZ** — `captureError` mesajı `scrubMessage`den geçirir (tek kapı kuralı,
 * 03.08). Bu fonksiyon yalnız "hangi alan mesajdır" sorusunu cevaplar.
 */
export function errorMessageOf(error: unknown): string {
  // ZodError'un `.message`'ı issue dizisinin HAM JSON'udur ve o hâliyle ekrana düştü (yaşandı 15.08:
  // teklif diyaloğunun alt barında köşeli parantezli blok). Personel yüzeyi detayı hak eder ama
  // JSON'u değil — alan + sebep tek satıra iner. Zod'a paket bağımlılığı YOK: `name` + `issues`
  // duck-typing'i yeter, observability şema kütüphanesini tanımak zorunda değil.
  if (error instanceof Error && error.name === 'ZodError') {
    const issues = (error as unknown as { issues?: Array<{ path?: Array<string | number>; message?: string }> }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const parts = issues.slice(0, 3).map((i) => `${(i.path ?? []).join('.') || 'veri'}: ${i.message ?? 'geçersiz'}`);
      const more = issues.length > 3 ? ` (+${issues.length - 3} sorun daha)` : '';
      return `Veri doğrulaması reddetti — ${parts.join(' · ')}${more}`;
    }
  }
  if (error instanceof Error) return error.message;

  if (error !== null && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) {
      // Postgres/PostgREST kodu mesajın yanına alınır: `23505` ile "duplicate key" birlikte
      // okunduğunda teşhis tek satırda biter (kısıt ihlali mi, tip hatası mı, yetki mi).
      const code = typeof obj.code === 'string' && obj.code ? ` [${obj.code}]` : '';
      // `details`/`hint` PostgREST'in en işe yarayan iki alanı — "hangi kolon, ne bekleniyordu".
      const hint = typeof obj.hint === 'string' && obj.hint ? ` — ${obj.hint}` : '';
      return `${obj.message}${code}${hint}`;
    }
    try {
      // Son çare: nesneyi OLDUĞU GİBİ yaz. `[object Object]`ten her hâlde iyidir — bilinmeyen bir
      // şeklin içeriğini görmek, hiç görmemekten teşhise daha yakındır.
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}
