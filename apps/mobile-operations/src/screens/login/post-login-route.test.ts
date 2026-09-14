import { operationsHomeRoute } from './post-login-route';

/*
  GİRİŞTEN SONRAKİ ADRES (21.32) — ekransız, ağsız birim testi.

  Kapının kendisi iki ekran testinde de doğrulanıyor (OTP + OAuth); burada sınanan şey KARARIN
  kendisi: hangi rol nereye açılır, çok rollüde hangisi kazanır, müşteri neden hiçbir yere gitmez.
  Ayrı durmasının sebebi, kuralın ekranlardan uzun yaşayacak olması — yeni bir personel rolü
  eklendiği gün kırılması gereken yer burasıdır.
*/

describe('operationsHomeRoute', () => {
  it('müşteri operasyona GİTMEZ — bölümü yok', () => {
    expect(operationsHomeRoute({ roles: ['customer'] })).toBeNull();
  });

  it('rolsüz profil de gitmez (boş dizi bir yetki değildir)', () => {
    expect(operationsHomeRoute({ roles: [] })).toBeNull();
  });

  it.each([
    ['courier', '/courier'],
    ['warehouse', '/warehouse'],
    ['admin', '/management'],
    ['accounting', '/money'],
  ] as const)('%s rolü %s bölümüne açılır', (role, route) => {
    expect(operationsHomeRoute({ roles: [role] })).toBe(route);
  });

  /* KRİTİK: sıra TASARIMIN sırasıdır, `roles` dizisininki değil. Sunucu aynı kişinin rollerini
     başka sırayla döndürdüğü gün açılış bölümü DEĞİŞMEMELİ — aksi hâlde personel her girişte
     başka bir ekranda uyanırdı ve sebebi hiçbir yerde görünmezdi. */
  it('çok rollü personel HER İKİ sıralamada da aynı bölüme iner', () => {
    expect(operationsHomeRoute({ roles: ['accounting', 'warehouse'] })).toBe('/warehouse');
    expect(operationsHomeRoute({ roles: ['warehouse', 'accounting'] })).toBe('/warehouse');
  });

  it('müşteri rolü personelin yanında TAŞINABİLİR ve kararı bozmaz', () => {
    expect(operationsHomeRoute({ roles: ['customer', 'courier'] })).toBe('/courier');
  });
});
