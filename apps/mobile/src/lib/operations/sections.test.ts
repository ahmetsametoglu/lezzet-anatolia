import { UserRoleEnum } from '@lezzet/types';

import {
  notificationScopeOf,
  OPERATIONS_SECTIONS,
  operationsSectionsOf,
  showsSectionTabs,
  visibleNotifications,
} from './sections';

/*
  SAF KURAL TESTİ — React yok, ağ yok. Rol süzmesinin doğruluğu ekrandan bağımsız ölçülür;
  ekran testi (`operations-shell.test.tsx`) yalnız bu kuralın kabuğa DOĞRU bağlandığını kanıtlar.
*/

describe('operationsSectionsOf', () => {
  it('rolleri tasarımın sırasına çevirir — `roles` dizisinin sırası sonucu OYNATMAZ', () => {
    // v3'ün ortak zemini çubuğu DEPO ile başlatıyor (30.08); `roles` dizisi kuryeyi önce saysa da
    // sonuç tasarımın sırasıdır — kullanıcının rolleri hangi sırayla gelirse gelsin çubuk kaymaz.
    expect(operationsSectionsOf(['accounting', 'courier', 'admin', 'warehouse'])).toEqual([
      'warehouse',
      'courier',
      'management',
      'money',
    ]);
  });

  it('yalnız müşteri rolü hiçbir bölüm açmaz — boş küme kapının "giremez" cevabıdır', () => {
    expect(operationsSectionsOf(['customer'])).toEqual([]);
  });

  it('personel aynı zamanda müşteridir: `customer` yanındaki operasyon rolünü gölgelemez', () => {
    expect(operationsSectionsOf(['customer', 'courier'])).toEqual(['courier']);
  });

  it('boş rol dizisi (oturumsuz / rolsüz profil) kapıyı açmaz', () => {
    expect(operationsSectionsOf([])).toEqual([]);
  });

  it('aynı rol iki kez gelse bile bölüm bir kez sayılır', () => {
    expect(operationsSectionsOf(['courier', 'courier'])).toEqual(['courier']);
  });

  it('dört operasyon rolünün her biri kendi bölümünü açar — eşleme sözleşmesi', () => {
    expect(operationsSectionsOf(['courier'])).toEqual(['courier']);
    expect(operationsSectionsOf(['warehouse'])).toEqual(['warehouse']);
    expect(operationsSectionsOf(['admin'])).toEqual(['management']);
    expect(operationsSectionsOf(['accounting'])).toEqual(['money']);
  });

  it('şemadaki HER rol bir karara bağlıdır — bölüm doğuran roller kadar doğurmayan da bilinçli', () => {
    // Kaynak `UserRoleEnum`; elle yazılmış bir rol listesi bir gün şemadan ayrışırdı.
    const sectionsByRole = UserRoleEnum.options.map((role) => operationsSectionsOf([role]));
    expect(sectionsByRole.filter((sections) => sections.length === 1)).toHaveLength(OPERATIONS_SECTIONS.length);
    // Bölümsüz İKİ rol var ve ikisi de bilinçli: `customer` (operasyon yüzeyine girmez) ve
    // `system` (yerinde satışın anonim alıcısı, 21.119 — oturum açamaz).
    expect(sectionsByRole.filter((sections) => sections.length === 0)).toHaveLength(2);
  });
});

describe('showsSectionTabs', () => {
  it('tek bölümde çubuk GİZLİ, birden çoğunda görünür (v2 `rolTabs.length > 1`)', () => {
    expect(showsSectionTabs(['courier'])).toBe(false);
    expect(showsSectionTabs(['courier', 'money'])).toBe(true);
    expect(showsSectionTabs([...OPERATIONS_SECTIONS])).toBe(true);
  });
});

describe('visibleNotifications', () => {
  const feed = [
    { id: 'a', section: 'warehouse' as const },
    { id: 'b', section: 'courier' as const },
    { id: 'c', section: 'management' as const },
    { id: 'd', section: 'money' as const },
  ];

  it('tek bölümlü kullanıcı yalnız kendi bölümünü görür', () => {
    expect(visibleNotifications(feed, ['courier']).map((item) => item.id)).toEqual(['b']);
  });

  it('dört bölümlü kullanıcıda tümü akar (süzme kaybı yok)', () => {
    expect(visibleNotifications(feed, [...OPERATIONS_SECTIONS])).toHaveLength(feed.length);
  });

  it('iki bölümlü kullanıcı, AÇAMADIĞI bölümlerin bildirimini görmez', () => {
    expect(visibleNotifications(feed, ['courier', 'money']).map((item) => item.id)).toEqual(['b', 'd']);
  });

  it('bölümsüz kullanıcıda liste boşalır', () => {
    expect(visibleNotifications(feed, [])).toEqual([]);
  });
});

describe('notificationScopeOf', () => {
  it('dört bölümün hepsi varsa "tümü"', () => {
    expect(notificationScopeOf([...OPERATIONS_SECTIONS])).toEqual({ kind: 'all' });
  });

  it('eksik kümede süzülen bölümler adlarıyla döner — "tüm bölümler" denmez', () => {
    expect(notificationScopeOf(['courier'])).toEqual({ kind: 'filtered', sections: ['courier'] });
    expect(notificationScopeOf(['courier', 'money'])).toEqual({ kind: 'filtered', sections: ['courier', 'money'] });
  });
});
