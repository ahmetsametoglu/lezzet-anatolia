import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData } from '@lezzet/database/testing';
import { zoneAvailableJob } from './zone-available';

/**
 * Bölge açıldı → bekleyene haber (14.10 · 19.21).
 *
 * **Bu iş MÜŞTERİYE SÖZ VERİYOR**, o yüzden sınanan şey gönderimin kendisi değil (sağlayıcı
 * anahtarı yerelde yok) — **damganın ne zaman atıldığı**. Yanlış damga iki yönde de sessizdir:
 * erken atılırsa müşteri hiç haber almaz ve kimse fark etmez, hiç atılmazsa aynı kişiye her saat
 * mail gider.
 *
 * **Küresel sayıya bakılmıyor** (`CLAUDE §4b`): `zone_notice` paylaşılan bir tablo. Her sınama
 * kendi damgalı kaydına bakıyor.
 */
const db = serviceDb();
const notices = new ZoneNoticeService(db);
const zones = new DeliveryZoneService(db);

const stamp = String(Date.now()).slice(-5);
/** Uydurma kodlar: hiçbir gerçek bölgeye düşmesinler. */
const coveredCode = `98${stamp.slice(0, 3)}`;
const uncoveredCode = `97${stamp.slice(0, 3)}`;
const email = (ne: string) => `zone-${ne}-${stamp}@ornek.test`;

let warehouseId = '';
let zoneId = '';

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'ZONE' })).id;
  const zone = await zones.insert({ name: `Test bölgesi ${stamp}`, warehouseId, isActive: true });
  zoneId = zone.id;
  await zones.replacePostalCodes(zoneId, [{ country: 'FR', postalCode: coveredCode }]);
});

afterAll(async () => {
  await mustDelete(db, 'zone_notice', (q) => q.in('postal_code', [coveredCode, uncoveredCode]));
  await purgeTestData(db, { warehouseIds: [warehouseId] });
});

describe('zone_available', () => {
  it('KAPSANMAYAN kod damgalanmaz — söz verilmemiş bir haber verilmiş sayılamaz', async () => {
    await notices.record({ postalCode: uncoveredCode, email: email('disarda'), locale: 'fr' });
    await zoneAvailableJob();

    const { data } = await db.from('zone_notice').select('notified_at').eq('postal_code', uncoveredCode).single();
    expect((data as { notified_at: string | null }).notified_at).toBeNull();
  });

  it('GÖNDERİM olmadan damga ATILMAZ — yerelde sağlayıcı anahtarı yok', async () => {
    // Kapsanan koda kayıt var ve iş onu görüyor; ama mail gerçekten gitmediği için damga atılmıyor
    // ve satır sıradaki turda yeniden denenecek. Ters davranış (önce damgala) müşteriyi KALICI
    // sessizliğe mahkûm ederdi: satır "haber verildi" görünür, bir daha hiçbir tur onu bulmaz.
    await notices.record({ postalCode: coveredCode, email: email('iceride'), locale: 'de' });
    const sonuc = await zoneAvailableJob();

    expect(sonuc.covered).toBeGreaterThan(0);
    const { data } = await db.from('zone_notice').select('notified_at').eq('postal_code', coveredCode).single();
    expect((data as { notified_at: string | null }).notified_at).toBeNull();
  });

  it('kayıt DİLİ taşıyor — ziyaretçide profil yok, kaydetmeseydik tahmin ederdik', async () => {
    const bekleyen = (await notices.listPending(500)).find((n) => n.postalCode === coveredCode);
    // Alman müşteri Fransızca haber okumamalı; dil kolonu 14.10'da tam bunun için eklendi.
    expect(bekleyen?.locale).toBe('de');
  });

  it('DAMGALANMIŞ kayıt bir daha hiç görülmez — idempotentlik sorgunun kendisinde', async () => {
    const bekleyen = (await notices.listPending(500)).find((n) => n.postalCode === coveredCode);
    await notices.markNotified([bekleyen!.id], new Date().toISOString());

    const sonuc = await zoneAvailableJob();
    const kalan = (await notices.listPending(500)).filter((n) => n.postalCode === coveredCode);
    expect(kalan).toHaveLength(0);
    expect(sonuc.sent).toBe(0);
  });
});
