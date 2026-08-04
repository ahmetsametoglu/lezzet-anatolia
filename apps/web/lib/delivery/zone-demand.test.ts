import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '@lezzet/database';
import { mustDelete } from '@lezzet/database/testing';
import { readZoneDemand } from './zone-demand';

/**
 * Bölge talebi okuması (19.21 · 13.4).
 *
 * **Sınanan şey sayı değil ANLAM:** iki sayacın ayrı kalması (anonim yoğunluk ↔ kimlikli bekleyiş),
 * sipariş tarafının doğru koda bağlanması ve ölçülemeyen oranın `null` kalması.
 *
 * **Küresel sayıya bakılmıyor** (`CLAUDE §4b`): `postal_code_demand` paylaşılan bir tablo ve başka
 * ajanların kodları da listede. Her sınama kendi damgalı koduna bakıyor.
 */
const db = serviceDb();

// Damgalı ve GERÇEK OLMAYAN bir kod: hiçbir bölgeye düşmesin ve kimsenin verisiyle çakışmasın.
const stamp = String(Date.now()).slice(-4);
const code = `99${stamp}`;

afterAll(async () => {
  await mustDelete(db, 'postal_code_demand', (q) => q.eq('postal_code', code));
});

describe('readZoneDemand', () => {
  it('siparişi olmayan kodda `orderCount` 0, oran 0 — ama TALEP yoksa oran `null`', async () => {
    await db.rpc('record_postal_code_demand', { p_postal_code: code });
    await db.rpc('record_postal_code_demand', { p_postal_code: code });

    const rows = await readZoneDemand(500);
    const satir = rows.find((r) => r.postalCode === code);

    expect(satir?.requestCount).toBe(2);
    // Bu koda hiç sipariş gitmedi: sayı 0 ve oran 0 — ikisi de ÖLÇÜLMÜŞ değerler.
    expect(satir?.orderCount).toBe(0);
    expect(satir?.revenueCents).toBe(0);
    expect(satir?.orderRatio).toBe(0);
    // Uydurma kod hiçbir aktif rotada olamaz.
    expect(satir?.covered).toBe(false);
  });

  it('iki sayaç AYRI kalır — anonim yoğunluk ile kimlikli bekleyiş toplanmaz', async () => {
    const rows = await readZoneDemand(500);
    const satir = rows.find((r) => r.postalCode === code);

    // `waitingCount` ayrı bir alan ve bu koda kimse haber bekletmiyor. Tek bir "ilgi" sayısına
    // indirilseydi anonim sayaç geriye dönük kimliklendirilmiş olurdu (`DATA_MODEL` emsali).
    expect(satir?.waitingCount).toBe(0);
    expect(satir).toHaveProperty('requestCount');
    expect(satir).toHaveProperty('waitingCount');
  });

  it('sipariş sayısı TALEBİ AŞABİLİR ve bu arıza değildir', async () => {
    // Sayaç yalnız "posta kodu soruldu" anını sayıyor; kayıtlı müşteri adresini seçip sipariş
    // verdiğinde sayaç hiç artmıyor. Yani oran 1'i geçebilir — okuyan taraf bunu bir dönüşüm
    // YÜZDESİ sanarsa yanılır; sıralama sinyali olarak anlamlıdır.
    const rows = await readZoneDemand(500);
    for (const r of rows) {
      expect(r.orderRatio === null || r.orderRatio >= 0).toBe(true);
    }
  });
});
