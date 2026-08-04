import type { UtmTags } from '@lezzet/types';
import { scrubMessage } from '@lezzet/observability/mask';

/**
 * **UTM'i KAPALI SÖZLÜĞE indirger** (13.2) — atıcı ham sorgu parametrelerini verir, kapı beş alana
 * düşürür.
 *
 * ── NEDEN ŞART ──────────────────────────────────────────────────────────────
 * Açık bırakılsaydı reklam aracının linke eklediği her parametre anonim deftere girerdi —
 * `gclid`/`fbclid` gibi **TIKLAMA KİMLİKLERİ** dâhil. O kimlikler reklam ağının tarafında tek
 * kullanıcıya çözülür; deftere düştükleri gün "kimlik kolonu yok" cümlesi teknik olarak doğru,
 * fiilen yanlış olurdu.
 *
 * ── ÜÇ YAZIM DA KABUL ───────────────────────────────────────────────────────
 * `utm_source` · `utmSource` · `source`. Kaynağı biz seçmiyoruz: bağlantıyı reklam panosu üretiyor
 * ve elle yazılmış bir kampanya linki de gelir. Sıra sabit — `utm_` öneki önce gelir ki çıplak bir
 * `source` parametresi kampanya etiketini gölgelemesin.
 *
 * Değer `scrubMessage`'dan geçer ve kırpılır: UTM bizim yazdığımız bir etikettir ama URL'i elle
 * değiştiren biri oraya ne isterse yazabilir.
 *
 * Kendi dosyasında çünkü SAF ve sınanabilir; kapı (`record.ts`) sunucu bağlamı ister, bu istemez.
 */

const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'] as const;

/** Tek etiketin tavanı. Kampanya adları kısadır; uzunu bir hata ya da bir enjeksiyon denemesidir. */
const UTM_MAX = 80;

export function normalizeUtm(raw: Record<string, string> | null | undefined): UtmTags | null {
  if (!raw) return null;

  const kunye: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const camel = `utm${key[0]!.toUpperCase()}${key.slice(1)}`;
    const value = raw[`utm_${key}`] ?? raw[camel] ?? raw[key];
    const temiz = typeof value === 'string' ? scrubMessage(value.trim()).slice(0, UTM_MAX) : '';
    if (temiz) kunye[key] = temiz;
  }

  // Hepsi boşsa `null`: boş bir künye için oturum satırı açmak, oturum tablosunu defterin ikinci
  // kopyasına çevirirdi.
  return Object.keys(kunye).length > 0 ? (kunye as UtmTags) : null;
}
