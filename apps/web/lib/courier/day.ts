import 'server-only';
import { serviceDb } from '@lezzet/database';
import { listCourierDay as listCourierDayFor, markUndelivered as markUndeliveredFor } from '@lezzet/application';

/**
 * Kuryenin GÜNÜ — durak listesi ve teslim edilemeyen işaretlemesi (11.x) — **geçiş köprüsü**
 * (terfi aşama 2/3, denetim K5-1).
 *
 * Gövde `@lezzet/application/courier/day`ta ve künyenin tamamı orada: durakların neden sipariş
 * satırından değil rotadan sıralandığı, "ulaşılamadı" ile "reddetti"nin neden ayrı kaldığı.
 *
 * ── PAKET SÜRÜMÜ DAHA GENİŞ VE BU BİR SORUN DEĞİL ───────────────────────────
 * `CourierStop` pakette bir alan fazla taşıyor (`items` — kapıda kısmi iade yazabilmek için kalem
 * kimlikleri, 21.10d). Web ekranları o alanı okumuyor; fazladan alan taşıyan bir tip, eksik alan
 * taşıyandan farklı olarak hiçbir çağıranı bozmaz. Asıl mesele buydu zaten: **ayrışma tek yönlü
 * ilerliyordu** — paket sürümü büyürken buradaki 241 satırlık ikiz olduğu yerde duruyordu.
 *
 * `server-only` burada kalıyor, pakette değil: paket taşıma bilmez, koruma çağıran yüzeyin işidir.
 */

export type { CourierStop, StopOutcome } from '@lezzet/application';

export function listCourierDay(input: Parameters<typeof listCourierDayFor>[1]) {
  return listCourierDayFor(serviceDb(), input);
}

export function markUndelivered(input: Parameters<typeof markUndeliveredFor>[1]) {
  return markUndeliveredFor(serviceDb(), input);
}
