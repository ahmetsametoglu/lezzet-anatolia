import { OPERATIONS_SECTIONS } from '@/lib/operations/sections';

import { operationsSectionRoute } from './post-login-route';

/*
  BÖLÜMÜN ADRESİ (21.32 · 21.312) — ekransız, ağsız birim testi. Hangi rolün hangi bölümü açtığı ve çok rollüde
  hangisinin kazandığı `lib/operations/sections.test.ts`te; burada sınanan adres sözleşmesi: bölüm adları
  `(operations)/(sections)` altındaki rotaların adıdır ve biri değiştiği gün kırılması gereken yer burası.
*/

describe('operationsSectionRoute', () => {
  it.each([
    ['warehouse', '/warehouse'],
    ['courier', '/courier'],
    ['management', '/management'],
    ['money', '/money'],
  ] as const)('%s bölümü %s adresinde açılır', (section, route) => {
    expect(operationsSectionRoute(section)).toBe(route);
  });

  it('her bölümün adresi tabloda — yeni bölüm eklenince burası da genişlemeli', () => {
    expect(OPERATIONS_SECTIONS.map(operationsSectionRoute)).toEqual(['/warehouse', '/courier', '/management', '/money']);
  });
});
