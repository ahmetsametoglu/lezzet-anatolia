import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { serviceDb } from '@lezzet/database';
import { dailySalt as sharedDailySalt } from '@lezzet/application';

/**
 * **ÇEREZSİZ OTURUM ANAHTARI** (13.1 · `ANALYTICS §2`) — kapının ve atfın ortak zemini.
 *
 * Kendi dosyasında çünkü İKİ tüketicisi var: olay kapısı (`record.ts`) ve edinim kaynağı atfı
 * (`attribution.ts`). Türetimi ikinci kez yazsaydık iki anahtar bir gün ayrışır ve **hata vermezdi**
 * — yalnız kampanya atfı sessizce hiç eşleşmezdi.
 */

/**
 * Günlük tuz ARTIK ORTAK PAKETTE (24.08 · MB-63) — native ölçüm açılınca ikinci tüketici doğdu
 * (`apps/mobile-api`) ve uygulamalar birbirinden import edemez. Kopyalamak seçenek değildi: iki
 * üretici aynı gün iki farklı tuz üretebilir ve o gün iki yüzeyin anahtarları karşılaştırılamaz
 * hâle gelirdi — hata vermeden. Kararların künyesi taşındığı yerde (`@lezzet/application`).
 *
 * Buradan yeniden ihraç ediliyor: bu dosyanın iki tüketicisi (`record.ts`, `attribution.ts`) tuzu
 * hep buradan aldı, import satırlarını oynatmanın bir kazancı yok.
 */
export async function dailySalt(): Promise<string> {
  return sharedDailySalt(serviceDb());
}

export function ipv6Prefix(ip: string): string {
  const [sol, sag] = ip.split('::');
  const solGruplar = sol ? sol.split(':').filter(Boolean) : [];
  const sagGruplar = sag ? sag.split(':').filter(Boolean) : [];
  const gruplar =
    sag === undefined
      ? solGruplar
      : [...solGruplar, ...Array<string>(Math.max(0, 8 - solGruplar.length - sagGruplar.length)).fill('0'), ...sagGruplar];
  // Baştaki sıfırlar da normalleştirilir (`0db8` ↔ `db8`), yoksa aynı adres iki yazımla iki anahtar olur.
  return gruplar
    .slice(0, 3)
    .map((g) => g.replace(/^0+(?=.)/, '').toLowerCase())
    .join(':');
}

export function sessionKeyOf(salt: string, ip: string, ua: string): string {
  // IPv6'da **ilk 3 grup** tutulur (48 bit): tartışmanın kararı "son 80 bit atılır" idi ve kod 4
  // grup tutuyordu — 16 bit fazla, yani tahsis bloğu içinde daha dar bir iz (denetim P3).
  // `::` sıkıştırık gösterim ÖNCE AÇILIR: `2001:db8::1` ile `2001:0db8:0000:0000:...:1` aynı
  // adrestir ama düz `split(':')` ikisine iki farklı anahtar üretirdi — kimlik riski değil, oturum
  // gürültüsü: aynı ziyaretçi iki oturum sayılır ve dönüşüm oranı sessizce düşerdi.
  const kirpik = ip.includes(':') ? ipv6Prefix(ip) : ip.split('.').slice(0, 3).join('.');
  return createHash('sha256').update(`${salt}|${kirpik}|${ua}|lezzet`).digest('hex').slice(0, 32);
}

/** İstek üstbilgisinden istemci IP'si — kırpma `sessionKeyOf`'un işi. */
export function clientIp(h: Headers): string {
  return (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || h.get('x-real-ip') || '0.0.0.0';
}

/**
 * İÇİNDE BULUNULAN isteğin oturum anahtarı — UA yoksa `null`.
 *
 * `null` "anahtar üretilemedi" demektir ve okuyan taraf onu bir kova olarak DEĞİL, bir yokluk
 * olarak ele almalı: UA'sız istek zaten ölçülmüyor (ISR/arka plan), yani eşleşecek bir oturum da
 * yok.
 */
export async function currentSessionKey(): Promise<string | null> {
  const h = await headers();
  const ua = h.get('user-agent');
  if (!ua) return null;
  return sessionKeyOf(await dailySalt(), clientIp(h), ua);
}
