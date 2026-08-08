import type { Context } from 'hono';
import { z } from 'zod';

/**
 * `/api/v1` İSTEK ayrıştırma yardımcıları — zarfın (`respond.ts`) karşı yakası.
 *
 * Üçü de 21.10'da `courier.ts`in içinde doğdu ve o dosyada kalmalarının tek sebebi tek çağıranlı
 * olmalarıydı. Depo uçları (21.11) ikinci çağıran oldu: aynı gün anahtarını, aynı uuid kontrolünü ve
 * aynı gövde okumasını ikinci kez yazmak, bir gün birinin ötekinden ayrılması demekti (`Bearer`
 * ayrıştırmasının `auth.ts`e çıkarılmasıyla aynı gerekçe — CLAUDE.md §1).
 *
 * Üçü de bir İŞ KURALI değil TAŞIMA kuralıdır: doğrulanmamış bir dize sorguya inince PostgreSQL
 * "invalid input syntax" fırlatır ve çağıran, KENDİ gönderdiği bozuk parametre için **500** görür.
 * Burada süzülünce cevap 400 olur — soru istemciye geri verilir.
 */

/** Gün anahtarı — `YYYY-MM-DD`. */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Yol/sorgu parametresindeki kimlik — uuid olmayan bir değer sorguya İNMEDEN 400 alır. */
export const UuidSchema = z.string().uuid();

/**
 * Gövdeyi ham okur — **çözülemeyen gövde bir istisna değil, geçersiz bir istektir.**
 *
 * `c.req.json()` bozuk/boş gövdede fırlatır; yakalanmasaydı `app.onError` onu bir SUNUCU hatası gibi
 * kaydeder (500 + `error_log` satırı) ve hata defteri istemci kaynaklı gürültüyle dolardı.
 * `undefined` dönüyor: kararı şemaya bırakıyoruz — gövdesi hiç olmayan bir isteğin cevabı da
 * `safeParse`ten çıkan 400'dür, ayrı bir dal gerekmiyor.
 *
 * Bağlam tipi bilinçli GENİŞ (`Context`): yardımcı gövdeyi okur, bağlamdan bir şey OKUMAZ — tek bir
 * Hono kuşağına bağlanması onu her yeni bölümde yeniden yazdırırdı (`bearerTokenOf` ile aynı karar).
 */
export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
