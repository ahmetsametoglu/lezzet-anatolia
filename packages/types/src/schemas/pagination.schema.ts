import { z } from 'zod';

// Sayfalama sözleşmesi — TEK KAYNAK. `database` bunu tüketir, uygulama katmanı taşır (RSC → action →
// client). Offset DEĞİL keyset (cursor) kullanılır: liste akarken araya kayıt girip çıktığında offset
// satır atlar/tekrarlar; keyset son satırın yerini işaret ettiği için kaymaz (CLAUDE.md: tüm listeler
// infinite scroll → servis okumaları keyset paginasyonlu).

/**
 * Keyset imleci: son satırın SIRALAMA DEĞERİ + id'si. id, eşit sıralama değerlerinde belirleyicidir
 * (tie-breaker) — onsuz aynı `sort_order`'a sahip satırlar sayfa sınırında karışır.
 */
export const KeysetCursorSchema = z.object({
  value: z.union([z.string(), z.number()]),
  id: z.string().uuid(),
});
export type KeysetCursor = z.infer<typeof KeysetCursorSchema>;

/**
 * Bir sayfa sonuç. `nextCursor` null ise liste bitti — client "daha fazla yükle"yi kapatır.
 * Sayfa boyutu istenenden bir fazlası çekilerek belirlenir (ekstra sorgu yok).
 */
export interface Page<T> {
  rows: T[];
  nextCursor: KeysetCursor | null;
}

/** Varsayılan sayfa boyutu — parametrik; ekranlar gerekirse kendi değerini geçer. */
export const DEFAULT_PAGE_SIZE = 30;
