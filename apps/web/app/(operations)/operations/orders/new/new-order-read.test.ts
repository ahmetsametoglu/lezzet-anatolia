import { describe, expect, it } from 'vitest';
import type { ProductVariant, UserProfile } from '@lezzet/types';
import { toCustomerOption, toVariantPickRow } from './new-order-read';

/**
 * Elle sipariş girişinin seçicileri (09.8) — **saf eşleme**, DB turu değil (sayfa okumalarının
 * ortak deseni: `toOrderRows` · `toWarehouseRows` emsali).
 *
 * Sınanan üç karar da sessizce yanlış olabilecek türden: onaysız şirketin kanalı, kanala göre
 * çözülen hedef marj ve "depo bilinmiyor" hâlinin sıfıra düşmemesi. Üçü de ekranda doğru görünür
 * ama yanlış olur — hata vermezler.
 */

const profile = (patch: Partial<UserProfile> = {}): UserProfile =>
  ({
    id: 'c1',
    name: 'Ayşe Yılmaz',
    phone: '+33612345678',
    email: 'ayse@ornek.fr',
    type: 'individual',
    b2bApproved: null,
    isDraft: false,
    roles: ['customer'],
    ...patch,
  }) as UserProfile;

const variant = (patch: Partial<ProductVariant> = {}): Pick<ProductVariant, 'id' | 'label'> => ({
  id: 'v1',
  label: { tr: '1 kg' },
  ...patch,
});

const product = (patch: Partial<Parameters<typeof toVariantPickRow>[0]['product']> = {}) => ({
  name: { tr: 'Baklava' },
  vatRate: 5.5,
  targetMarginPercent: 40,
  targetMarginB2bPercent: null,
  ...patch,
});

const pick = (patch: Partial<Parameters<typeof toVariantPickRow>[0]> = {}) =>
  toVariantPickRow({
    product: product(),
    variant: variant(),
    priceCents: 2000,
    costCents: 1000,
    availableQty: 12,
    channel: 'b2c',
    warehouseKnown: true,
    ...patch,
  });

describe('müşteri seçeneği', () => {
  it('bireysel müşteri B2C kanalındadır', () => {
    expect(toCustomerOption(profile()).channel).toBe('b2c');
  });

  /**
   * **ONAYSIZ ŞİRKET B2C'DİR** (DOMAIN §10) — SIRET herkese açıktır, şirket künyesi girmek
   * toptancı olmak değildir. Ekran `type === 'company'` kontrolünü kopyalasaydı burada "B2B"
   * yazar ama fiyat B2C çözülürdü: operatör müşteriye tutamayacağı bir fiyat söylerdi.
   */
  it('ONAYSIZ şirket B2B DEĞİL — B2C fiyat görür', () => {
    expect(toCustomerOption(profile({ type: 'company', b2bApproved: null })).channel).toBe('b2c');
    expect(toCustomerOption(profile({ type: 'company', b2bApproved: false })).channel).toBe('b2c');
  });

  it('onaylanmış şirket B2B kanalındadır', () => {
    expect(toCustomerOption(profile({ type: 'company', b2bApproved: true })).channel).toBe('b2b');
  });

  it('doğrulanmamış kaydı taşır — operatör kimin karşısında olduğunu bilmeli', () => {
    expect(toCustomerOption(profile({ isDraft: true })).isDraft).toBe(true);
  });
});

describe('kalem seçicisi satırı', () => {
  it('ürün ve boy adını birleştirir, fiyatı motordan olduğu gibi taşır', () => {
    const row = pick();
    expect(row.title).toBe('Baklava · 1 kg');
    expect(row.listPriceCents).toBe(2000);
  });

  it('satışa kapalı boyda fiyat NULL kalır — sıfıra düşmez', () => {
    expect(pick({ priceCents: null }).listPriceCents).toBeNull();
  });

  /**
   * Depo adresten çözülüyor; adres seçilmeden adet BİLİNMEZ. Sıfır yazmak elinde mal olan
   * operatöre "depoda 0 adet" okuturdu (CLAUDE §1 — ölçülemeyen değer sıfır değildir).
   */
  it('depo bilinmiyorsa adet NULL, sıfır DEĞİL', () => {
    expect(pick({ warehouseKnown: false, availableQty: 12 }).availableQty).toBeNull();
    expect(pick({ warehouseKnown: true, availableQty: 0 }).availableQty).toBe(0);
  });

  /** Hedef marj kanala göre çözülür (15.08): toptan hedefi ayrı kurulabilir, boşsa ortak hedef geçer. */
  it('hedef marjı KANALA göre çözer', () => {
    const b2bHedefli = { product: product({ targetMarginB2bPercent: 25 }) };
    expect(pick({ ...b2bHedefli, channel: 'b2b' }).targetMarginPercent).toBe(25);
    expect(pick({ ...b2bHedefli, channel: 'b2c' }).targetMarginPercent).toBe(40);
    // B2B hedefi yoksa ortak hedef iki kanalda da geçerli.
    expect(pick({ channel: 'b2b' }).targetMarginPercent).toBe(40);
  });

  it('maliyet ölçülemediyse null taşır — marj uyarısı o hâlde susar', () => {
    expect(pick({ costCents: null }).costCents).toBeNull();
  });
});
