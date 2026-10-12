import { describe, expect, it } from 'vitest';
import type { ProductVariant, UserProfile } from '@lezzet/types';
import { toStaffCustomerOption, toStaffVariantRow } from './staff-order';

/**
 * Personel sipariş girişinin seçici eşlemeleri, DB'siz. Sınanan kararlar ekranda doğru görünüp yanlış olabilecek türden: onaysız
 * şirketin kanalı, kanala göre hedef marj, bilinmeyen deponun sıfıra düşmemesi ve maliyetin yalnız pazarlık yazabilene gitmesi.
 */

const profile = (patch: Partial<UserProfile> = {}): UserProfile =>
  ({
    id: 'c1',
    name: 'Ayşe Yılmaz',
    phone: '+33612345678',
    email: 'ayse@ornek.fr',
    type: 'individual',
    b2bApproved: null,
    b2bPending: false,
    isDraft: false,
    companyInfo: null,
    roles: ['customer'],
    ...patch,
  }) as UserProfile;

const variant: Pick<ProductVariant, 'id' | 'label'> = { id: 'v1', label: { tr: '1 kg' } };

const product = (patch: Partial<Parameters<typeof toStaffVariantRow>[0]['product']> = {}) => ({
  name: { tr: 'Baklava' },
  vatRate: 5.5,
  targetMarginPercent: 40,
  targetMarginB2bPercent: null,
  shippable: true,
  ...patch,
});

const row = (patch: Partial<Parameters<typeof toStaffVariantRow>[0]> = {}) =>
  toStaffVariantRow({
    product: product(),
    variant,
    priceCents: 2000,
    costCents: 1000,
    availableQty: 12,
    channel: 'b2c',
    warehouseKnown: true,
    includeCost: true,
    ...patch,
  });

describe('müşteri seçeneği', () => {
  // Ekran `type === 'company'` kontrolünü kopyalasaydı onaysız şirkete B2B yazar ama fiyatı B2C çözerdi.
  it('onaysız şirket B2C fiyat görür, onaylı şirket B2B', () => {
    expect(toStaffCustomerOption(profile({ type: 'company', b2bApproved: null }), null).channel).toBe('b2c');
    expect(toStaffCustomerOption(profile({ type: 'company', b2bApproved: false }), null).channel).toBe('b2c');
    expect(toStaffCustomerOption(profile({ type: 'company', b2bApproved: true }), null).channel).toBe('b2b');
    expect(toStaffCustomerOption(profile(), null).channel).toBe('b2c');
  });
});

describe('kalem seçicisi satırı', () => {
  it('satışa kapalı boyda fiyat null kalır, sıfıra düşmez', () => {
    expect(row({ priceCents: null }).listPriceCents).toBeNull();
  });

  it('depo bilinmiyorsa adet null, sıfır değil', () => {
    expect(row({ warehouseKnown: false, availableQty: 12 }).availableQty).toBeNull();
    expect(row({ warehouseKnown: true, availableQty: 0 }).availableQty).toBe(0);
  });

  it('hedef marjı kanala göre çözer; toptan hedefi yoksa ortak hedef geçer', () => {
    const toptanHedefli = { product: product({ targetMarginB2bPercent: 25 }) };
    expect(row({ ...toptanHedefli, channel: 'b2b' }).targetMarginPercent).toBe(25);
    expect(row({ ...toptanHedefli, channel: 'b2c' }).targetMarginPercent).toBe(40);
    expect(row({ channel: 'b2b' }).targetMarginPercent).toBe(40);
  });

  it('maliyet ölçülemediyse null taşır; marj uyarısı o hâlde susar', () => {
    expect(row({ costCents: null }).costCents).toBeNull();
  });

  it('pazarlık yazamayan personele maliyet ve hedef marj gitmez', () => {
    const saha = row({ includeCost: false });
    expect(saha.costCents).toBeNull();
    expect(saha.targetMarginPercent).toBeNull();
    expect(saha.listPriceCents).toBe(2000);
  });
});
