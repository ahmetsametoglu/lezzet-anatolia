import { describe, expect, it } from 'vitest';
import { app } from '../../app';
import { envelopeData, envelopeError } from '../../lib/testing';

/**
 * ZİYARETÇİYE AÇIK OKUMALAR — `recipes` · `delivery-terms` · `discover` (üç ince uç, tek dosya).
 *
 * ── NEDEN TEK DOSYA ─────────────────────────────────────────────────────────
 * Üçü de **ince geçiş katmanı**: kararlarını başka yerde veren, burada yalnız zarfa koyan uçlar.
 * Her birine ayrı bir dosya açmak, üç dosyalık kurulum maliyetine karşılık üçer iddia demekti.
 * Konuları da ortak: *"kimliksiz okunur, sözleşmenin dışına çıkmaz, bozuk girdide çökmez."*
 *
 * ── ÇİVİLENEN ORTAK KARAR: SAYININ KAYNAĞI ──────────────────────────────────
 * `delivery-terms` müşteriye **ilan edilen teslimat tutarlarını** veriyor ve bu yüzden AÇIK: posta
 * kodu adımı ve yasal sayfa hesapsız açılıyor, sayıyı sözlüğe dondurmak ise ayar değiştiği gün
 * müşteriye gerçekleşmeyecek bir vaat vermek olurdu (29.07 denetiminin kapattığı arıza sınıfı).
 * İddia, ucun gerçekten SAYI döndürdüğünü ölçüyor — boş bir zarf, ekranı sabit yazmaya iter.
 *
 * ── VE BİR EROZYON KORUMASI: KEŞİF TURU 401 DÖNMEZ ──────────────────────────
 * Tur ziyaretçiye açıktır ve `swipeAction` kimliği sunucuda çözer; yoksa kaydırmayı KİMLİKSİZ
 * yazar (21.19). Bearer varsa yalnız iki şey değişir — oylanmış kartlar destede elenir ve oy
 * sahibine yazılıp puan doğar. **Erişim değişmez, 401 hiçbir hâlde dönmez.** Bu, `router.test.ts`
 * teki kapı listesiyle örtüşüyor ama oradaki iddia yalnız "401 değil" diyor; burada BOZUK jetonun
 * da kapıyı kapatmadığı ayrıca ölçülüyor.
 */

describe('GET /api/v1/delivery-terms — ilan edilen tutarlar', () => {
  it('kimliksiz okunur ve GERÇEK SAYI döner', async () => {
    // Boş bir zarf ekranı sabit yazmaya iterdi; ucun var olma sebebi tam da bunu engellemek.
    const res = await app.request('/api/v1/delivery-terms');

    expect(res.status).toBe(200);
    const terms = await envelopeData<Record<string, unknown>>(res);
    const sayilar = Object.values(terms).filter((v) => typeof v === 'number');
    expect(sayilar.length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/recipes — tarifler', () => {
  it('liste kimliksiz okunur', async () => {
    // Dil ZORUNLU ve varsayılansız (katalogun `LocaleSchema` kuralı): verilmezse
    // `resolveLocalizedText` kanonik sıraya düşer ve Fransız müşteriye Türkçe ad gönderirdi.
    const res = await app.request('/api/v1/recipes?locale=tr');

    expect(res.status).toBe(200);
  });

  it('DİLSİZ istek 400 `invalid_locale` — dil tahmin edilmez', async () => {
    const res = await app.request('/api/v1/recipes');

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_locale');
  });

  it('TANINMAYAN slug 404 — boş gövde DEĞİL', async () => {
    // Boş bir tarif dönmek ekranı "tarif var ama içi yok" diye çizmeye bırakırdı.
    const res = await app.request(`/api/v1/recipes/yok-${Date.now()}?locale=tr`);

    expect(res.status).toBe(404);
    expect(await envelopeError(res)).toBeTruthy();
  });
});

describe('GET /api/v1/discover — keşif turu', () => {
  it('kimliksiz erişilebilir — 401 HİÇBİR hâlde dönmez (21.19)', async () => {
    const res = await app.request('/api/v1/discover');

    expect(res.status).not.toBe(401);
  });

  it('BOZUK jeton da kapıyı kapatmaz — kimlik cevabı ZENGİNLEŞTİRİR, kapıyı değil', async () => {
    /* Kırılgan dal: kimlik okumayı `bearerAuth`a çevirmek ya da geçersiz jetonu reddetmek, turu
       ziyaretçiye kapatırdı. Oysa karar ölçülmüş bir web kararının terfisi — tur girişsiz açıktır
       ve eski oturumu bozulmuş bir ziyaretçi de kapıda kalmamalı. */
    const res = await app.request('/api/v1/discover', { headers: { authorization: 'Bearer uydurma-jeton' } });

    expect(res.status).not.toBe(401);
  });

  it('oy verme de kimliksiz AÇIK — kaydırma KİMLİKSİZ yazılır', async () => {
    // Gövde bilerek geçersiz: sınanan şey oyun kabul edilip edilmediği değil, KAPININ açık olduğu.
    const res = await app.request('/api/v1/discover/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).not.toBe(401);
  });
});
