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
    creditLimitCents: null,
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

describe('depo ekseni — arka uç açtı, ekran kabloladı (03.08)', () => {
  const WAREHOUSES = [{ id: 'w-1', code: 'STR', name: 'Strasbourg' }];

  it('istisna hedefleri arasında depo var — kod ÖNDE, ekranın geri kalanıyla aynı yazım', () => {
    expect(toScopeOptions(ZONES, WAREHOUSES).warehouse).toEqual([{ value: 'w-1', label: 'STR · Strasbourg' }]);
  });

  it('depo listesi verilmezse eksen BOŞ kalır, çökmez', () => {
    expect(toScopeOptions(ZONES).warehouse).toEqual([]);
  });

  it('depo istisnası adıyla okunur', () => {
    const rows = toSettingRows({
      settings: [setting({ key: 'order_cutoff_time', scopeType: 'warehouse', scopeId: 'w-1', value: '14:00' })],
      zones: ZONES,
      warehouses: WAREHOUSES,
    }).rows;
    expect(rows.find((r) => r.key === 'order_cutoff_time')!.exceptions[0]).toMatchObject({
      scopeLabel: 'Depo: STR · Strasbourg',
      display: '14:00',
    });
  });

  it('SİLİNMİŞ deponun istisnası GİZLENMEZ — görünmeyen istisna kaldırılamaz', () => {
    // Ad sözlüğünde yoksa satır yine listelenir; sessizce düşseydi okunmaya devam eden ama
    // ekranda olmayan bir kural kalırdı.
    const rows = toSettingRows({
      settings: [setting({ key: 'order_cutoff_time', scopeType: 'warehouse', scopeId: 'w-yok', value: '14:00' })],
      zones: ZONES,
      warehouses: WAREHOUSES,
    }).rows;
    expect(rows.find((r) => r.key === 'order_cutoff_time')!.exceptions[0]!.scopeLabel).toBe('Depo: bilinmeyen depo');
  });

  it('depo ekseni HER ayarda açık değil — sözlük `0016`nın adaylarını izler', () => {
    const rows = toSettingRows({ settings: [], zones: ZONES }).rows;
    const has = (key: string) => rows.find((r) => r.key === key)!.exceptionScopes.includes('warehouse');
    expect(has('order_cutoff_time')).toBe(true); // adaylardan: kesim saati
    expect(has('route_delivery_unit_cost_cents')).toBe(true); // adaylardan: rota birim maliyeti
    expect(has('near_expiry_percent')).toBe(false); // "raf ömrü eşikleri global kalır"
  });
});

describe('fabrika değeri OLMAYAN ayar — kapı önü satış kasası (AÇIK 3)', () => {
  const ACCOUNTS = [{ id: '1dd7ec2f-27bb-462a-9873-cbbf5a16d885', name: 'Kasa' }];
  const row = (settings: Setting[] = [], accounts = ACCOUNTS) =>
    toSettingRows({ settings, zones: ZONES, accounts }).rows.find((r) => r.key === 'door_cash_account_id')!;

  it('kimlik değil AD gösterilir — operatör uuid okumaz', () => {
    const view = row([setting({ key: 'door_cash_account_id', value: ACCOUNTS[0]!.id })]);
    expect(view.display).toBe('Kasa');
  });

  it('ad sözlüğü yoksa HAM KİMLİK görünür — uydurma bir ad yazılmaz', () => {
    // "Bilinmeyen hesap" demek, yanlış bir şeyin düzeldiğini düşündürürdü; kimlik en azından aranabilir.
    const view = row([setting({ key: 'door_cash_account_id', value: ACCOUNTS[0]!.id })], []);
    expect(view.display).toBe(ACCOUNTS[0]!.id);
  });

  it('hiç seçilmemişse "seçilmedi" der — boş bir tire değil', () => {
    expect(row().display).toBe('— seçilmedi');
  });

  it('fabrika değeri YOK: dönülecek varsayılan da yok', () => {
    // Ekran bu satırda "Varsayılana dön" düğmesini hiç çizmiyor; `null` o kararın kaynağı.
    expect(row().fallbackDisplay).toBeNull();
  });

  it('"varsayılandan farklı" İŞARETLENMEZ — karşılaştırılacak bir normal yok', () => {
    // Kurulumun kendi seçimi; onu "değiştirilmiş" saymak olmayan bir normalden sapma uydurmaktı.
    expect(row([setting({ key: 'door_cash_account_id', value: ACCOUNTS[0]!.id })]).changed).toBe(false);
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
