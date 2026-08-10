import 'server-only';
import { serviceDb } from '@lezzet/database';
import { closeCourierDay as closeCourierDayFor, openDayClose as openDayCloseFor } from '@lezzet/application';

/**
 * Kurye gün kapanışı (12.6) — **geçiş köprüsü** (terfi aşama 2/3, denetim K5-1).
 *
 * Gövde `@lezzet/application/courier/day-close`ta; künyenin tamamı orada (kasa mutabakatının neden
 * sayımdan değil türetimden çıktığı, farkın neden gizlenmeyip açıklandığı).
 *
 * Burada 80 satırlık bir ikiz duruyordu ve iki dosya arasındaki tek fark `db`nin nereden geldiğiydi.
 * **Kasa mutabakatı ayrışmaya en az dayanan yer:** aynı günün kapanışı web'de bir tutar, mobil
 * kurye ucunda başka bir tutar söyleseydi, hangisinin doğru olduğunu söyleyecek üçüncü bir kayıt
 * yok — ve hiçbir test yakalamaz, çünkü iki dosyanın da kendi testi yeşildir.
 *
 * Köprünün taşıdığı tek şey `serviceDb()` enjeksiyonu: paket taşıma bilmez (Next'e ait hiçbir şey
 * pakete girmez), `server-only` de bu yüzden burada kalıyor.
 */

export type { DayCloseDraft } from '@lezzet/application';

export function openDayClose(input: { courierId: string; date?: string }) {
  return openDayCloseFor(serviceDb(), input);
}

export function closeCourierDay(input: Parameters<typeof closeCourierDayFor>[1]) {
  return closeCourierDayFor(serviceDb(), input);
}
