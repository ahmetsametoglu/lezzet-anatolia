'use server';

import type { KeysetCursor } from '@lezzet/types';
import { serviceDb } from '@lezzet/database';
import { readCustomerPointsHistory } from '@lezzet/application';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { POINTS_PAGE_SIZE, type PointsHistoryPage } from './points-types';

/**
 * Puan dökümünün sonraki sayfası (20.08). İmleç URL'e yazılmaz, istemcide yaşar (CLAUDE §1 —
 * sayfalama kuralı). Kimlik SUNUCUDA çözülür; imleç istemciden gelir ve zararsızdır: kapı yalnız
 * o müşterinin satırlarını okur.
 */
export async function loadMorePointsAction(cursor: KeysetCursor): Promise<CustomerResult<PointsHistoryPage>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const result = await readCustomerPointsHistory(serviceDb(), { customerId, cursor, limit: POINTS_PAGE_SIZE });
    // Program dışı (B2B) buraya normalde hiç gelmez — sayfa daha girişte hesaba yönlendiriyor.
    // Yine de kapı reddederse boş sayfa döneriz: hata değil, gösterilecek satır yokluğu.
    if (result.status !== 'ok') return { data: { entries: [], nextCursor: null }, errorKey: null };
    return { data: { entries: result.entries, nextCursor: result.nextCursor ?? null }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
