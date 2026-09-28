/**
 * Keşifte bir kaydırmanın sunucuya yazılmadan beklediği süre (ms); "Geri al" oyu sunucudan silmez, pencere içinde geri alınan oy
 * hiç gönderilmez. Yanlış yöne kaydırdığını fark edip başlığa uzanacak kadar uzun, sinyali geciktirmeyecek kadar kısa.
 */
export const DISCOVER_UNDO_WINDOW_MS = 6000;
