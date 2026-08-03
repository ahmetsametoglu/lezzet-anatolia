import { describe, expect, it } from 'vitest';
import type { Setting, UserProfile } from '@lezzet/types';
import { SETTING_BY_KEY } from './settings-catalog';
import { checkBounds, formatSettingValue, parseSettingValue } from './settings-labels';
import { filterSettingRows, toScopeOptions, toSettingRows, toStaffRows } from './settings-read';

const ZONES = [
  { id: 'z-1', name: 'Kuzey hattı' },
  { id: 'z-2', name: 'Merkez' },
];

function setting(over: Partial<Setting> & { key: string }): Setting {
  return {
    id: `s-${over.key}-${over.scopeType ?? 'global'}-${over.scopeId ?? ''}`,
    scopeType: 'global',
    scopeId: null,
    value: null,
    description: null,
    updatedAt: '2026-08-01T10:00:00Z',
    ...over,
  };
}

function profile(over: Partial<UserProfile> & { id: string }): UserProfile {
  return {
    roles: ['warehouse'],
    warehouseIds: [],
    type: 'individual',
    name: 'Ad Soyad',
    email: null,
    phone: null,
    preferredLanguage: 'tr',
    country: 'FR',
    authUserId: 'auth-1',
    b2bApproved: null,
    isDraft: false,
    companyInfo: null,
    vatNumber: null,
    vatNumberValid: null,
    creditEnabled: false,
    creditLimit: null,
    paymentTermDays: null,
    discountPercent: null,
    codAllowed: true,
    marketingConsent: {},
    acquisitionSource: null,
    referredBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  } as UserProfile;
}

describe('toSettingRows', () => {
  it('hiç satırı olmayan ayar da listede — çalışan bir değeri var, görünmezse değiştirilemez', () => {
    const { rows } = toSettingRows({ settings: [], zones: ZONES });
    const cutoff = rows.find((r) => r.key === 'order_cutoff_time')!;
    expect(cutoff.value).toBe('16:00');
    expect(cutoff.rowId).toBeNull();
    expect(cutoff.changed).toBe(false);
  });

  it('global satır fabrika değerini ezer ve "değiştirilmiş" işareti doğar', () => {
    const { rows } = toSettingRows({ settings: [setting({ key: 'min_basket_cents', value: 2500 })], zones: ZONES });
    const row = rows.find((r) => r.key === 'min_basket_cents')!;
    expect(row.value).toBe(2500);
    expect(row.display).toBe('25,00 €');
    expect(row.changed).toBe(true);
    expect(row.fallbackDisplay).toBe('0,00 €');
  });

  it('istisnalar ekseniyle ve hedef ADIYLA yazılır', () => {
    const { rows } = toSettingRows({
      settings: [
        setting({ key: 'min_basket_cents', value: 2500 }),
        setting({ key: 'min_basket_cents', scopeType: 'channel', scopeId: 'b2b', value: 10_000 }),
        setting({ key: 'min_basket_cents', scopeType: 'zone', scopeId: 'z-1', value: 3500 }),
      ],
      zones: ZONES,
    });
    const row = rows.find((r) => r.key === 'min_basket_cents')!;
    expect(row.exceptions.map((e) => `${e.scopeLabel} → ${e.display}`)).toEqual([
      'Bölge: Kuzey hattı → 35,00 €',
      'Kanal: B2B (toptan) → 100,00 €',
    ]);
  });

  it('silinmiş bölgenin istisnası GİZLENMEZ — kimliği bilinmese de satır görünür', () => {
    const { rows } = toSettingRows({
      settings: [setting({ key: 'min_basket_cents', scopeType: 'zone', scopeId: 'yok', value: 100 })],
      zones: ZONES,
    });
    expect(rows.find((r) => r.key === 'min_basket_cents')!.exceptions[0]!.scopeLabel).toBe('Bölge: bilinmeyen bölge');
  });

  it('kapsam kimliği olmayan (bozuk) istisna satırı listeye girmez', () => {
    const { rows } = toSettingRows({
      settings: [setting({ key: 'min_basket_cents', scopeType: 'channel', scopeId: null, value: 1 })],
      zones: ZONES,
    });
    expect(rows.find((r) => r.key === 'min_basket_cents')!.exceptions).toHaveLength(0);
  });
});

describe('filterSettingRows', () => {
  const { rows } = toSettingRows({ settings: [], zones: ZONES });

  it('ad ve açıklamada arar', () => {
    expect(filterSettingRows(rows, 'kesim').map((r) => r.key)).toEqual(['order_cutoff_time']);
  });

  it('İÇ ANAHTAR aranmaz — o ad arayüzde hiç yok', () => {
    expect(filterSettingRows(rows, 'order_cutoff_time')).toHaveLength(0);
  });

  it('boş terim listeyi daraltmaz', () => {
    expect(filterSettingRows(rows, '   ')).toHaveLength(rows.length);
  });
});

describe('parseSettingValue — sınır', () => {
  const ttl = SETTING_BY_KEY.get('reservation_ttl_minutes')!;

  it('alt sınırın altı SEBEBİYLE reddedilir', () => {
    const result = parseSettingValue(ttl, '15');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('sağlayıcısının oturum asgarisi');
  });

  it('sınırdaki değer geçer', () => {
    expect(parseSettingValue(ttl, '30')).toEqual({ ok: true, value: 30 });
  });

  it('para virgüllü yazımdan CENT üretir', () => {
    expect(parseSettingValue(SETTING_BY_KEY.get('min_basket_cents')!, '25,00')).toEqual({ ok: true, value: 2500 });
  });

  it('yüzde tavanı aşamaz', () => {
    expect(parseSettingValue(SETTING_BY_KEY.get('mlor_percent')!, '120').ok).toBe(false);
  });

  it('saat biçimi zorlanır', () => {
    const def = SETTING_BY_KEY.get('order_cutoff_time')!;
    expect(parseSettingValue(def, '9:5').ok).toBe(false);
    expect(parseSettingValue(def, '25:00').ok).toBe(false);
    expect(parseSettingValue(def, '17:30')).toEqual({ ok: true, value: '17:30' });
  });

  it('sayı olmayan metin reddedilir', () => {
    expect(parseSettingValue(SETTING_BY_KEY.get('payment_term_days')!, 'otuz').ok).toBe(false);
  });

  it('kanal bayrakları mantıksala indirgenir', () => {
    const def = SETTING_BY_KEY.get('delivery_proof_required')!;
    expect(parseSettingValue(def, { b2b: true, b2c: false })).toEqual({ ok: true, value: { b2b: true, b2c: false } });
  });
});

describe('formatSettingValue', () => {
  it('kanal bayrağının hepsi kapalıyken TAM cümle yazar — tire iki ayrı hâli gizlerdi', () => {
    const def = SETTING_BY_KEY.get('delivery_proof_required')!;
    expect(formatSettingValue(def, { b2b: false, b2c: false })).toBe('Hiçbir kanalda istenmiyor');
    expect(formatSettingValue(def, { b2b: true, b2c: false })).toBe('B2B (toptan)');
  });

  it('boş metin ayarı "tanımsız" der — davetin hiç gösterilmeyeceğini gizlemez', () => {
    expect(formatSettingValue(SETTING_BY_KEY.get('review_platform_url')!, '')).toBe('— tanımsız');
  });

  it('birim sayının yanında yazılır', () => {
    expect(formatSettingValue(SETTING_BY_KEY.get('payment_term_days')!, 30)).toBe('30 gün');
  });
});

describe('checkBounds', () => {
  it('sınırsız ayarda hiçbir şey söylemez', () => {
    expect(checkBounds(SETTING_BY_KEY.get('order_cutoff_time')!, 0)).toBeNull();
  });
});

describe('toStaffRows', () => {
  const warehouses = [
    { id: 'w-1', code: 'STR', name: 'Strasbourg' },
    { id: 'w-2', code: 'KEHL', name: 'Kehl' },
  ];

  it('müşteri satırı personel listesine girmez', () => {
    const rows = toStaffRows([profile({ id: 'p-1', roles: ['customer'] })], warehouses);
    expect(rows).toHaveLength(0);
  });

  it('çoklu rol etiketlenir, ada göre sıralanır', () => {
    const rows = toStaffRows(
      [
        profile({ id: 'p-2', name: 'Zeynep K.', roles: ['accounting', 'warehouse'], warehouseIds: ['w-1'] }),
        profile({ id: 'p-1', name: 'Ahmet B.', roles: ['admin'] }),
      ],
      warehouses,
    );
    expect(rows.map((r) => r.name)).toEqual(['Ahmet B.', 'Zeynep K.']);
    expect(rows[1]!.roleLabels).toEqual(['Muhasebe', 'Depo sorumlusu']);
  });

  it('depo-üstü roller kapsam sormaz, kapsamsız depocu UYARI metnini taşır', () => {
    const rows = toStaffRows(
      [profile({ id: 'p-1', name: 'A', roles: ['admin'] }), profile({ id: 'p-2', name: 'B', roles: ['courier'], warehouseIds: [] })],
      warehouses,
    );
    expect(rows[0]!.scopeText).toBe('depo-üstü');
    expect(rows[1]!.scopeText).toContain('kapsamsız');
  });

  it('kapsam depo KODLARIYLA yazılır', () => {
    const rows = toStaffRows([profile({ id: 'p-1', roles: ['warehouse'], warehouseIds: ['w-1', 'w-2'] })], warehouses);
    expect(rows[0]!.scopeText).toBe('STR · KEHL');
  });

  it('auth hesabı bağlanmamış kişi işaretlenir — rolü var ama giremiyor', () => {
    const rows = toStaffRows([profile({ id: 'p-1', roles: ['warehouse'], authUserId: null })], warehouses);
    expect(rows[0]!.canSignIn).toBe(false);
  });

  it('baş harfler en fazla iki parçadan alınır', () => {
    expect(toStaffRows([profile({ id: 'p-1', name: 'ali veli deli' })], warehouses)[0]!.initials).toBe('AV');
    expect(toStaffRows([profile({ id: 'p-2', name: '   ' })], warehouses)[0]!.initials).toBe('—');
  });

  it('e-posta yoksa telefon gösterilir', () => {
    const rows = toStaffRows([profile({ id: 'p-1', email: null, phone: '+33600000000' })], warehouses);
    expect(rows[0]!.contact).toBe('+33600000000');
  });
});

describe('toScopeOptions', () => {
  it('bölgeler ada göre sıralanır, kanal ve ülke sabittir', () => {
    const options = toScopeOptions(ZONES);
    expect(options.zone.map((z) => z.label)).toEqual(['Kuzey hattı', 'Merkez']);
    expect(options.channel.map((c) => c.value)).toEqual(['b2b', 'b2c']);
    expect(options.country.map((c) => c.value)).toEqual(['FR', 'DE']);
  });
});
