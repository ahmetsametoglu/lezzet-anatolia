'use server';

import { serviceDb } from '@lezzet/database';
import type { KeysetCursor } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { readOrderPage } from './procurement-read';
import type { PurchaseOrderRowView } from './procurement-types';

// Tedarik ekranı server action'ları — 'use server' + requireAdmin ilk + servise devret +
// `{ data, error }` DÖNER (throw yok).
//
// Guard ekranın kapısını TEKRARLAR: sayfanın `requireAdmin`'i düğmeyi gizlemeye yarar, action
// kendi kapısını kendi tutar (çağrı doğrudan da yapılabilir).

/**
 * Sipariş listesinin bir sonraki sayfası (sonsuz kaydırma).
 *
 * İmleç istemciden gelir ama süzgeç GELMEZ: bugün liste süzgeçsiz okunuyor ve imleç yalnız
 * sıralama alanına dayanıyor. Süzgeç eklendiği gün buraya da geçmesi gerekir — yoksa ikinci sayfa
 * birinciyle aynı ölçütü kullanmaz ve liste sessizce karışır.
 */
export async function loadMorePurchaseOrdersAction(
  cursor: KeysetCursor,
): Promise<ActionResult<{ rows: PurchaseOrderRowView[]; nextCursor: KeysetCursor | null }>> {
  try {
    await requireAdmin();
    return { data: await readOrderPage(serviceDb(), cursor), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}
