/**
 * **RPC REDDİNİN MESAJINI ÇIKARIR** — depo kapılarının `failed` dalının tek kaynağı.
 *
 * ── NEDEN VAR (ölçüldü 08.08, varsayılmadı) ─────────────────────────────────
 * Sözleşme (`warehouse-api.schema.ts`) `failed` için şunu vaat ediyor: *"Fiziksel gerçek ihlali
 * ('partide 3 var, 5 düşülemez') — mesaj operatöre AYNEN gösterilir."* Vaat TUTMUYORDU: kapılar
 * mesajı `error instanceof Error ? error.message : '<sabit metin>'` süzgeciyle okuyordu ve
 * **supabase-js reddi bir `Error` ÖRNEĞİ DEĞİL** — düz bir nesne (`{ code, details, hint, message }`,
 * `constructor.name === 'Object'`). Yani örnek denetimi her seferinde düşüyor, gerçek cümle
 * (*"adjust_stock_batch: partide 20 adet var, 999 adet düşülemez"*) atılıyor ve operatörün ekranına
 * hiçbir şey söylemeyen sabit metin (*"Kayıt yazılamadı"*) yazılıyordu. Ölçüm `apps/mobile-api`nin
 * depo uç testinde kayıtlı ve bu düzeltmeyle gerçek mesaja çevrildi.
 *
 * Aynı gözlem `packages/database`ta bir kez daha yapılmış (`product-variant.service.ts` → `errorText`)
 * ama orası kendi silme akışının içinde, ihraç edilmeyen özel bir yardımcı. Buradaki dört çağrı için
 * onu ihraç ettirmek yerine uygulama katmanının kendi kapısı yazıldı: `packages/database` bu şeridin
 * yazı alanı değil ve mesaj çıkarımı bir I/O kararı değil, kapının cevabını kurma kararıdır.
 *
 * ── NEDEN TEK YARDIMCI ──────────────────────────────────────────────────────
 * Dört çağrı yeri var (`adjustment.recordAdjustment`, `transfer.{receiveTransfer, dispatchTransfer,
 * cancelTransfer}`) ve dördü de aynı üç dalı yürüyor. Dört kopya, beşinci kapı açıldığında dördünden
 * birinin unutulması demekti (CLAUDE.md §1: hiçbir türde duplication).
 *
 * ── YEDEK METİN NEDEN DURUYOR ───────────────────────────────────────────────
 * Mesajı hiç olmayan bir reddin (`throw 'x'`, `throw null`) ekrana boş dize düşürmesi, arızayı
 * gözden saklamak olurdu. Yedek metin çağıranın verdiği cümledir — hangi kapının düştüğünü söyler.
 *
 * ── SINIRI: BURASI KAYIT DÜŞMEZ ─────────────────────────────────────────────
 * Hata yutulmuyor; çağıran onu `{ status: 'failed', message }` olarak DÖNDÜRÜYOR ve ekran gösteriyor
 * (CLAUDE.md §1'in "sessiz catch yok" dalı: iz cevabın kendisi). Buraya ayrıca `captureError` koymak,
 * operatörün gördüğü her fiziksel-gerçek reddini (günlük iş) hata kaydına yazardı.
 */
export function rpcRejectionMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message.length > 0 ? error.message : fallback;

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }

  return fallback;
}
