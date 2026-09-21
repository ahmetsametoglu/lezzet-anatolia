import { isValidPriceRule } from '@lezzet/domain-core';
import type { CustomerPriceBasis } from '@lezzet/types';
import { percent } from '@/components/operation/ui/format';

/** Genel fiyat kuralının operatöre okunuşu; fiyat ekranı ve müşteri kartı aynı cümleyi kurar. */
export function priceRuleLabel(basis: CustomerPriceBasis, value: number): string {
  return basis === 'list' ? `listeden −${percent(value)}` : `alış +${percent(value)}`;
}

/** Kural geçersizse operatöre söylenecek cümle; düzenleme penceresi ve kaydetme eylemi aynı cümleyi kullanır. */
export function priceRuleError(basis: CustomerPriceBasis, value: number | null): string | null {
  if (value === null) return 'Yüzde girilmeli.';
  if (isValidPriceRule({ basis, percent: value })) return null;
  return basis === 'list' ? 'İndirim %0 ile %100 arasında olmalı.' : 'Pay sıfır ya da pozitif olmalı.';
}
