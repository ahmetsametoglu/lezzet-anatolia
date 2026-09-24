import type { MeAddress } from '@/lib/api/addresses';

/** Testlerin adres satırı: yalnız kimlik, posta kodu ve varsayılan rolü değişir, gerisi sabit. */
export function addressFixture(id: string, postalCode: string, isDefault: boolean): MeAddress {
  return {
    id,
    label: null,
    recipient: 'Claire Weber',
    phone: '+33624510988',
    country: 'FR',
    line1: '1 rue du Test',
    line2: null,
    postalCode,
    city: 'Test',
    isDefault,
    isBilling: false,
  };
}
