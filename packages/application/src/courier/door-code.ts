import { randomInt } from 'node:crypto';
import { OrderDeliveryCodeService, OrderService, SettingsService } from '@lezzet/database';
import { checkDoorCode, doorCodeApplies, type DoorCodeCheck, type DoorCodeScope } from '@lezzet/domain-core';
import { captureError, SOURCES } from '@lezzet/observability';
import type { OrderDeliveryCode } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  Kapı kodunun üretimi ve kapıdaki sınaması; kararlar `@lezzet/domain-core`ta, burada yalnız okuma ve yazma birleşir.
*/

/** Ayar okunamazsa kod üretilmez, çünkü kodsuz teslim her zaman açıktır ve fazladan mesaj ücretlidir. */
function readDoorCodeScope(db: SupabaseClient): Promise<DoorCodeScope> {
  return new SettingsService(db).get<DoorCodeScope>('delivery_code_channels', {});
}

/**
 * Yola çıkan siparişe kod üretir; kapsam dışındaki siparişte `null` döner. Hata yola çıkışı durdurmaz, çünkü kodsuz teslim her zaman
 * açıktır; iz kayda düşer.
 */
export async function issueDoorCode(db: SupabaseClient, orderId: string): Promise<OrderDeliveryCode | null> {
  try {
    const order = await new OrderService(db).getById(orderId);
    if (!order || !doorCodeApplies(order, await readDoorCodeScope(db))) return null;
    return await new OrderDeliveryCodeService(db).issue({ orderId, code: String(randomInt(0, 1_000_000)).padStart(6, '0') });
  } catch (error) {
    void captureError(error, { source: SOURCES.applicationCourier, level: 'warning', context: { orderId, step: 'issueDoorCode' } });
    return null;
  }
}

/** Kapıda girilen kodu sınar; yanlış kod hak düşürür. `given` boşsa kurye kodsuz teslim ediyordur. */
export async function verifyDoorCode(db: SupabaseClient, orderId: string, given: string | null): Promise<DoorCodeCheck> {
  const codes = new OrderDeliveryCodeService(db);
  const row = await codes.getByOrder(orderId);
  const check = checkDoorCode({
    issued: row?.code ?? null,
    given,
    failedAttempts: row?.failedAttempts ?? 0,
    maxAttempts: await doorCodeMaxAttempts(db),
  });
  if (check.kind === 'mismatch') await codes.recordFailure(orderId);
  return check;
}

export function doorCodeMaxAttempts(db: SupabaseClient): Promise<number> {
  return new SettingsService(db).getNumber('delivery_code_max_attempts', 5);
}
