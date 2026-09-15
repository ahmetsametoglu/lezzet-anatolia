/**
 * **Yeni mesaj uyarısı** (15.34 web · 15.35 mobil) — saf karar, I/O yok.
 *
 * Zil boştur ve yalnız "bir şey değişti" der: ajanın taslağı, çeviri ve bizim cevabımız da onu çaldırır. Ses
 * YALNIZ müşteriden yeni bir mesaj geldiğinde çalmalı. Ölçüt kuyruğun en son GELEN mesaj anı
 * (`conversation.last_inbound_at`'ların en büyüğü): bizim yazdığımız mesaj, taslak ve çeviri onu oynatmaz.
 *
 * İki yüzey (operasyon web'i, operasyon mobil uygulaması) aynı kararı okur. Push geldiğinde (14.16) de aynı
 * karar ve aynı bekleme süresi geçerli olmalı: uygulama açıkken push'un kendi sesi susturulur, sesi uygulama
 * çalar — bir mesaja tek ses.
 */

/** Art arda gelen mesajlarda iki ses arasındaki en kısa süre — PARAMETRİK; mesaj seli sırasında tek ses. */
export const MESSAGE_ALERT_COOLDOWN_MS = 3000;

/**
 * Yeni bir gelen mesaj var mı: önceki ölçümden bu yana en son gelen mesaj anı İLERLEDİYSE.
 *
 * `previous === undefined` = henüz ölçülmedi (açılış). İlk ölçüm SES ÇALDIRMAZ: o bir taban çizgisidir ve
 * açılışta zaten bekleyen mesajlar "yeni" değildir. Okunamayan damga yeni sayılmaz — bozuk veri ses çaldırmaz.
 */
export function hasNewInbound(previous: string | null | undefined, next: string | null): boolean {
  if (previous === undefined || next === null) return false;
  if (previous === null) return !Number.isNaN(Date.parse(next));
  const before = Date.parse(previous);
  const after = Date.parse(next);
  return !Number.isNaN(before) && !Number.isNaN(after) && after > before;
}

/** Ses şimdi çalabilir mi — son sesten bu yana bekleme süresi geçtiyse. `null` = daha önce hiç çalmadı. */
export function alertAllowed(lastAlertAt: number | null, now: number, cooldownMs: number = MESSAGE_ALERT_COOLDOWN_MS): boolean {
  return lastAlertAt === null || now - lastAlertAt >= cooldownMs;
}
