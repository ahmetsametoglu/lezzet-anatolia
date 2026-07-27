import { describe, expect, it } from 'vitest';
import { isStaff, validateRoleSet, withRole, withoutRole } from './roles';

describe('rol kümesi kuralları (04.3)', () => {
  it('müşteri ve personel rolü BİR ARADA olamaz', () => {
    expect(validateRoleSet(['customer', 'warehouse'])).toEqual({ valid: false, reason: 'customer_with_staff' });
  });

  it('personel içinde çoklu rol olağandır — depo + muhasebe aynı kişide', () => {
    expect(validateRoleSet(['warehouse', 'accounting'])).toEqual({ valid: true });
    expect(validateRoleSet(['admin', 'courier', 'accounting'])).toEqual({ valid: true });
  });

  it('rol kümesi boş olamaz — herkes bir eksende yaşar', () => {
    expect(validateRoleSet([])).toEqual({ valid: false, reason: 'empty' });
  });

  it('yalnız müşteri geçerlidir', () => {
    expect(validateRoleSet(['customer'])).toEqual({ valid: true });
  });
});

describe('personel mi', () => {
  it('operasyon rolü olan personeldir', () => {
    expect(isStaff(['warehouse'])).toBe(true);
    expect(isStaff(['accounting', 'courier'])).toBe(true);
  });

  it('yalnız müşteri personel değildir', () => {
    expect(isStaff(['customer'])).toBe(false);
    expect(isStaff([])).toBe(false);
  });
});

describe('rol ekleme/çıkarma — geçiş açıkça yapılır', () => {
  it('müşteriye operasyon rolü verilince müşteri ekseni DÜŞER', () => {
    expect(withRole(['customer'], 'warehouse')).toEqual(['warehouse']);
  });

  it('personele ikinci operasyon rolü eklenir, ilki durur', () => {
    expect(withRole(['warehouse'], 'accounting')).toEqual(['warehouse', 'accounting']);
  });

  it('aynı rol iki kez eklenmez', () => {
    expect(withRole(['warehouse'], 'warehouse')).toEqual(['warehouse']);
  });

  it('personele müşteri rolü verilince TÜM operasyon rolleri düşer', () => {
    expect(withRole(['admin', 'accounting'], 'customer')).toEqual(['customer']);
  });

  it('rol çıkarılır, diğerleri kalır', () => {
    expect(withoutRole(['warehouse', 'accounting'], 'warehouse')).toEqual(['accounting']);
  });

  it('son rol çıkarılırsa kişi müşteriye düşer — hesap eksensiz kalmaz', () => {
    expect(withoutRole(['warehouse'], 'warehouse')).toEqual(['customer']);
  });

  it('üretilen her küme geçerlidir', () => {
    expect(validateRoleSet(withRole(['customer'], 'admin'))).toEqual({ valid: true });
    expect(validateRoleSet(withoutRole(['admin'], 'admin'))).toEqual({ valid: true });
  });
});
