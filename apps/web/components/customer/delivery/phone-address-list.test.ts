import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Address } from '@lezzet/types';
import addressCopy from '@lezzet/i18n/customer/address';
import { PhoneAddressList } from './phone-address-list';

/*
  Düzenle seçim düğmesinin içine düşerse geçersiz iç içe düğme olur ve ekran okuyucu onu ayrı eylem olarak bulamaz; depo kartına çizilirse
  müşteriyi adresi olmayan bir yeri düzenlemeye çağırır. Bileşen JSX'siz düz fonksiyon olarak çağrılır (`chat-text.test.tsx` deseni).
*/
vi.mock('@/i18n/navigation', () => ({ Link: () => null }));

const copy = addressCopy.tr;
const address = {
  id: 'adr-1',
  label: 'Ev',
  recipient: 'Ayşe Demir',
  phone: '+33600000000',
  line1: '12 Rue des Orfèvres',
  line2: null,
  postalCode: '67000',
  city: 'Strasbourg',
  country: 'FR',
  isDefault: true,
} as unknown as Address;

describe('PhoneAddressList', () => {
  it('Düzenle adres kartında seçim düğmesinin dışındadır, depo kartında yoktur', () => {
    const out = renderToStaticMarkup(
      PhoneAddressList({
        locale: 'tr',
        addresses: [address],
        failed: false,
        selectedId: 'adr-1',
        pickup: { warehouses: [{ id: 'wh-1', name: 'Strasbourg deposu', addressLine: '14 Rue de la Course, 67000 Strasbourg' }], selectedWarehouseId: null },
        error: null,
        onPick: vi.fn(),
        onPickPickup: vi.fn(),
        onEdit: vi.fn(),
        onAdd: vi.fn(),
      }),
    );

    const selectButtons = out.match(/<button[^>]*aria-pressed[^>]*>.*?<\/button>/g) ?? [];
    expect(selectButtons).toHaveLength(2);
    for (const button of selectButtons) expect(button).not.toContain(copy.edit);
    expect(out.split(`>${copy.edit}</button>`)).toHaveLength(2);
  });
});
