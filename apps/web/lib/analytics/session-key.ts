import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { SettingsService, serviceDb } from '@lezzet/database';

/**
 * **ÇEREZSİZ OTURUM ANAHTARI** (13.1 · `ANALYTICS §2`) — kapının ve atfın ortak zemini.
 *
 * Kendi dosyasında çünkü İKİ tüketicisi var: olay kapısı (`record.ts`) ve edinim kaynağı atfı
 * (`attribution.ts`). Türetimi ikinci kez yazsaydık iki anahtar bir gün ayrışır ve **hata vermezdi**
 * — yalnız kampanya atfı sessizce hiç eşleşmezdi.
 */

const SALT_KEY = 'analytics_session_salt';

/** Süreç içi tuz önbelleği — gün değişene kadar DB'ye gidilmez. */
let saltCache: { day: string; salt: string } | null = null;

/**
 * Günün OTURUM TUZU.
 *
 * **Tuz her gün değişir ve eskisi SAKLANMAZ** — üzerine yazılır. Atıldığı an o günün anahtarları
 * geri hesaplanamaz, yani defter psödonimden ANONİME döner (GDPR Recital 26'nın aradığı şey).
 *
 * **Sabit bir sırdan TÜRETİLMEZ ve fark önemli:** `hash(SIR ‖ gün)` biçiminde bir tuz, sırrı bilen
 * için her günü geriye dönük yeniden hesaplanabilir kılardı — yani "eskisi saklanmıyor" iddiası
 * yalan olurdu. Rastgele üretilip üzerine yazılan bir tuzda o yol kapalıdır.
 *
 * Yarış: aynı gün iki süreç birden üretirse ikisi de yazar ve son yazan kazanır. Kabul edilebilir —
 * en kötü hâlde o günün bir kısım anahtarı iki farklı tuzla üretilir ve oturumlar bölünür; ölçüm
 * biraz gürültülenir, kimlik sızmaz. Ters ödünleşme (kilit) en sıcak yola kilit koymak olurdu.
 */
export async function dailySalt(): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  if (saltCache?.day === day) return saltCache.salt;

  const settings = new SettingsService(serviceDb());
  const stored = await settings.get<{ day?: string; salt?: string }>(SALT_KEY, {});
  if (stored.day === day && stored.salt) {
    saltCache = { day, salt: stored.salt };
    return stored.salt;
  }

  const salt = createHash('sha256').update(`${day}:${Math.random()}:${process.hrtime.bigint()}`).digest('hex');
  await settings.set(SALT_KEY, { day, salt }, { description: 'Analitik oturum tuzu — günlük döner, eskisi saklanmaz.' });
  saltCache = { day, salt };
  return salt;
}

/**
 * Oturum anahtarı: `hash(günlük_tuz ‖ kırpılmış_ip ‖ ua ‖ site)`.
 *
 * **IP KIRPILIR** ve ham hâli hiçbir yerde durmaz (IPv4 son oktet, IPv6 son bloklar). Kırpılmamış
 * IP + UA sabit bir tuzla birleşseydi bu bir PARMAK İZİ olurdu ve CNIL'e göre rıza isterdi.
 *
 * **Çerezden TÜRETİLMEZ:** sitenin bugünkü çerezleri (oturum tazeleme, yer cevabı) kesinlikle-gerekli
 * muafiyetindedir; analitiğe kullanıldıkları an o muafiyetin gerekçesi düşer ve banner tartışması
 * geri gelir.
 */
/**
 * IPv6'nın ilk 48 biti — sıkıştırık gösterim açıldıktan sonra. Saf ve sınanabilir.
 *
 * `2001:db8::1` ile `2001:0db8:0000:0000:0000:0000:0000:0001` aynı adres; `::` yerine eksik grup
 * sayısı kadar sıfır konur. Açmadan kırpsaydık ikisi iki farklı anahtar üretirdi.
 */
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
