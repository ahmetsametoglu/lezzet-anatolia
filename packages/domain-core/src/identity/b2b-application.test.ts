import { describe, expect, it } from 'vitest';
import {
  b2bApplicationIssues,
  b2bStatusOf,
  formatSiret,
  isValidSiret,
  normalizeSiret,
  normalizeVatNumber,
  splitVatNumber,
  type B2bApplicationInput,
} from './b2b-application';

/** Gerçek, herkese açık bir numara: işletmenin kendi SIRET'i (`BUSINESS_CATALOG.md`). */
const REAL_SIRET = '90749664000026';

describe('SIRET', () => {
  it('rakam dışını atar — belgeden kopyalanan boşluklu numara aynı numaradır', () => {
    expect(normalizeSiret('907 496 640 00026')).toBe(REAL_SIRET);
    expect(normalizeSiret('907-496-640-00026')).toBe(REAL_SIRET);
  });

  it('geçerli numarayı kabul eder', () => {
    expect(isValidSiret(REAL_SIRET)).toBe(true);
    expect(isValidSiret('907 496 640 00026')).toBe(true);
  });

  it('tek hane hatasını yakalar — resmî kayda hiç gitmeden', () => {
    expect(isValidSiret('90749664000025')).toBe(false);
  });

  it('14 haneden kısa ya da uzun numarayı reddeder', () => {
    expect(isValidSiret('9074966400002')).toBe(false);
    expect(isValidSiret('907496640000267')).toBe(false);
    expect(isValidSiret('')).toBe(false);
  });

  /**
   * La Poste istisnası: `356 000 000` SIREN'i Luhn'a UYMAZ, hane toplamının 5'e bölünmesiyle
   * doğrulanır. Meşru bir numarayı biçim denetiminde elemek, müşteriye kendi doğru numarasını
   * yanlış sandırır.
   */
  it('La Poste numaralarını Luhn ile elemez', () => {
    expect(isValidSiret('35600000000001')).toBe(true);
    expect(isValidSiret('35600000000002')).toBe(false);
  });

  it('okunur biçim SIREN + NIC gruplar', () => {
    expect(formatSiret(REAL_SIRET)).toBe('907 496 640 00026');
    // Eksik numara OLDUĞU GİBİ döner: yarım bir numarayı gruplamak yazarken imleci zıplatır.
    expect(formatSiret('9074')).toBe('9074');
  });
});

describe('AB vergi numarası', () => {
  it('boşluk ve küçük harfi tek biçime indirir', () => {
    expect(normalizeVatNumber('de 812 345 678')).toBe('DE812345678');
  });

  it('ülke kodunu gövdeden ayırır — doğrulama servisi ikisini ayrı ister', () => {
    expect(splitVatNumber('DE812345678')).toEqual({ country: 'DE', number: '812345678' });
    expect(splitVatNumber('FR 50 907496640')).toEqual({ country: 'FR', number: '50907496640' });
  });

  it('harf içeren AB numaralarını eler MEZ (IE/NL)', () => {
    expect(splitVatNumber('IE6388047V')).toEqual({ country: 'IE', number: '6388047V' });
  });

  it('ülke kodu olmayan ya da gövdesi boş numarayı reddeder', () => {
    expect(splitVatNumber('812345678')).toBeNull();
    expect(splitVatNumber('DE')).toBeNull();
    expect(splitVatNumber('')).toBeNull();
  });
});

const FR_BASE: B2bApplicationInput = {
  kind: 'siret',
  siret: REAL_SIRET,
  legalName: 'Restaurant Anatolie SARL',
  vatNumber: '',
  contactName: 'Mehmet Demir',
  email: 'mehmet@anatolie-restaurant.fr',
  phone: '+33 6 98 76 54 32',
  line1: '8 Rue du Fossé',
  postalCode: '67000',
  city: 'Strasbourg',
};

const DE_BASE: B2bApplicationInput = {
  ...FR_BASE,
  kind: 'eu_vat',
  siret: '',
  legalName: 'Kehl Feinkost GmbH',
  vatNumber: 'DE812345678',
  phone: '+49 30 12345678',
  line1: 'Hauptstraße 12',
  postalCode: '77694',
  city: 'Kehl',
};

describe('başvuru denetimi', () => {
  it('tam başvuruda hiç sorun yok — iki yolda da', () => {
    expect(b2bApplicationIssues(FR_BASE)).toEqual([]);
    expect(b2bApplicationIssues(DE_BASE)).toEqual([]);
  });

  /** İki yol BİRBİRİNİN alanını istemez: SIRET yolunda vergi no sorulmaz, tersi de öyle. */
  it('SIRET yolu vergi numarası istemez, AB yolu SIRET istemez', () => {
    expect(b2bApplicationIssues({ ...FR_BASE, vatNumber: '' })).toEqual([]);
    expect(b2bApplicationIssues({ ...DE_BASE, siret: '' })).toEqual([]);
  });

  it('yolun kendi kimlik alanını ister', () => {
    expect(b2bApplicationIssues({ ...FR_BASE, siret: '123' })).toContain('siret');
    expect(b2bApplicationIssues({ ...DE_BASE, vatNumber: '123' })).toContain('vatNumber');
  });

  /** Hepsi birden dönüyor: tek tek dönseydi form "düzelt-gönder-düzelt" döngüsüne girerdi. */
  it('eksik alanların HEPSİNİ birden döndürür', () => {
    const issues = b2bApplicationIssues({ ...FR_BASE, contactName: '', email: 'a@b', phone: 'abc' });
    expect(issues).toEqual(expect.arrayContaining(['contactName', 'email', 'phone']));
    expect(issues).toHaveLength(3);
  });

  /**
   * Adres iki yolda da zorunlu: yoksa onay kartının rota sinyali "ölçülemedi" kalır ve operatör
   * başvuruyu değerlendiremez.
   */
  it('adres eksikse başvuru tamam değildir', () => {
    expect(b2bApplicationIssues({ ...DE_BASE, line1: '', postalCode: '', city: '' })).toEqual([
      'line1',
      'postalCode',
      'city',
    ]);
  });

  it('beş haneli olmayan posta kodunu eler', () => {
    expect(b2bApplicationIssues({ ...FR_BASE, postalCode: '670' })).toEqual(['postalCode']);
  });
});

describe('başvuru durumu', () => {
  const company = { legalName: 'Restaurant Anatolie SARL' };

  it('künyesi olmayan ziyaretçi hiç başvurmamıştır', () => {
    expect(b2bStatusOf(null)).toBe('none');
    expect(b2bStatusOf({ companyInfo: null, b2bApproved: null })).toBe('none');
    // Künye YOKSA `b2bApproved` ne olursa olsun başvuru yoktur — kanal künyeden türer.
    expect(b2bStatusOf({ companyInfo: null, b2bApproved: false })).toBe('none');
  });

  it('künye var, onay yoksa inceleniyor', () => {
    expect(b2bStatusOf({ companyInfo: company, b2bApproved: false })).toBe('pending');
    expect(b2bStatusOf({ companyInfo: company, b2bApproved: null })).toBe('pending');
  });

  it('yalnız açık onay toptan fiyatı açar', () => {
    expect(b2bStatusOf({ companyInfo: company, b2bApproved: true })).toBe('approved');
  });
});
