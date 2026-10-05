import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryZoneService, WarehouseService, serviceDb } from '@lezzet/database';
import { zonesOfBusiness } from '@lezzet/domain-core';
import type { Business } from '@lezzet/types';

/*
  Yer çözme eyleminin izi: kargo göndermeyen işin bölgesi dışındaki kod müşteriye cevap döner ve hata günlüğüne yazılmaz; yazılırsa her
  bölge dışı QUALITE seçimi bir hata satırı olur ve bu dosya kırmızıya döner. Oturum, günlük ve ölçüm sahtedir, bölge ve depo okuması gerçek.
*/
const captureError = vi.fn();
vi.mock('@lezzet/observability', () => ({ captureError, SOURCES: { webAction: 'web-action' } }));
const oturum: { profil: { business: Business } | null } = { profil: null };
vi.mock('@/lib/guard', () => ({ readSessionProfile: async () => oturum.profil }));
vi.mock('@/lib/analytics/record', () => ({ recordEvent: async () => undefined }));

const { resolvePlaceAction } = await import('./actions');

beforeEach(() => {
  captureError.mockClear();
});

describe('yer çözme eyleminin izi', () => {
  it('QUALITE müşterisinin bölgesi dışındaki kod cevap döner, hata günlüğüne yazılmaz', async () => {
    // Ön şart: 75001 hiçbir QUALITE bölgesinde değil, yoksa cevap "bölge dışı" olamazdı.
    const db = serviceDb();
    const [zones, warehouses] = await Promise.all([new DeliveryZoneService(db).listWithCodes(), new WarehouseService(db).list()]);
    const qualiteCodes = zonesOfBusiness(zones, warehouses, 'qualite').flatMap((zone) => zone.postalCodes.map((code) => code.postalCode));
    expect(qualiteCodes).not.toContain('75001');
    oturum.profil = { business: 'qualite' };

    const sonuc = await resolvePlaceAction('75001');

    expect(sonuc.data).toEqual({ kind: 'unresolved', reason: 'outside_zones' });
    expect(captureError).not.toHaveBeenCalled();
  });
});
