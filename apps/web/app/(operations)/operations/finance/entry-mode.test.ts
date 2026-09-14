import { describe, expect, it } from 'vitest';
import type { ManualMovementForm } from '@/components/operation/form/movement-form/schema';
import type { TransferForm } from '@/components/operation/form/transfer-form/schema';
import { ENTRY_MODES, carryToMovement, carryToTransfer } from './entry-mode';

const movement: ManualMovementForm = {
  accountId: 'bank',
  type: 'expense',
  amount: 100,
  direction: 'out',
  nature: 'kira',
  counterpartyId: 'cp',
  tags: ['arac'],
  campaign: '',
  valueDate: '2026-09-14',
  description: 'Kasa teslimi',
  documentId: null,
};
const transfer: TransferForm = { fromAccountId: 'cash', toAccountId: 'bank', amount: null, valueDate: '2026-09-01', description: '' };
const accounts = ['cash', 'bank', 'stripe'];

describe('"Yeni hareket" penceresinin kipleri (12.24)', () => {
  it('dört kip, seçicideki sırayla', () => {
    expect(ENTRY_MODES).toEqual(['expense', 'capital', 'transfer', 'misc']);
  });

  it('transfere geçerken hesap "Nereden" olur; tutar, gün ve açıklama taşınır', () => {
    expect(carryToTransfer(movement, transfer, accounts)).toEqual({
      fromAccountId: 'bank',
      toAccountId: 'cash',
      amount: 100,
      valueDate: '2026-09-14',
      description: 'Kasa teslimi',
    });
  });

  it('"Nereye" hâlâ farklı bir hesapsa yerinde kalır', () => {
    expect(carryToTransfer({ ...movement, accountId: 'cash' }, { ...transfer, toAccountId: 'stripe' }, accounts).toAccountId).toBe('stripe');
  });

  it('geri dönerken "Nereden" hesap olur; tür, cari ve etiket yerinde kalır', () => {
    expect(carryToMovement({ ...transfer, amount: 50, description: 'Payout' }, movement)).toEqual({
      ...movement,
      accountId: 'cash',
      amount: 50,
      valueDate: '2026-09-01',
      description: 'Payout',
    });
  });
});
