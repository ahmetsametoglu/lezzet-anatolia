'use server';

import { revalidatePath } from 'next/cache';
import {
  dispatchTransfer,
  readDispatchCandidate,
  receiveTransfer,
  type DispatchCandidate,
  type DispatchTransferOutcome,
  type ReceiveTransferOutcome,
} from '@lezzet/application';
import { serviceDb, SettingsService, WarehouseTransferService } from '@lezzet/database';
import type { DispatchLine, KeysetCursor, ReceiveLine } from '@lezzet/types';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { TRANSFER_TRANSIT_DAYS_DEFAULT, TRANSFER_TRANSIT_DAYS_KEY } from '@/lib/settings-keys';
import { readWarehouseContext, readWorkWarehouse } from '@/lib/warehouse/context';
import { readHistoryPage, readTransferDetailView } from './transfer-read';
import type { HistoryPageView, TransferDetailView } from './transfer-types';

/**
 * Transfer ekranının yazma yolları (19.6). Kural YAZILMAZ, kapıya devredilir: kapsam/eksik-satır/
 * stok denetimi `@lezzet/application`ın üç fiilinde — burada yalnız kimlik sorulur, KAYNAK depo
 * çözülür ve cevap Türkçeye çevrilir.
 *
 * ── KAYNAK DEPO İSTEMCİDEN GELMEZ — bir istisnayla (10.7'nin bu ekrandaki hâli) ─────────────
 * Depocunun kaynağı ÇALIŞILAN depodur ve sunucuda bağlamdan çözülür; istemcinin gönderdiği kaynak
 * yok sayılır (başka deponun malını sevk etmenin kapısı olurdu). Tek istisna depo-üstü bakış:
 * yönetici "Tüm depolar"dayken kaynağı pencereden SEÇER (tasarım kuralı) — o seçim de yalnız
 * scope 'all' iken okunur, yine de son sözü partilerin gerçek deposu söyler (`dispatchTransfer`
 * kapısı kalemleri kaynağa karşı doğrular).
 */

async function resolveSourceWarehouse(clientChoice?: string): Promise<
  { ok: true; warehouseId: string } | { ok: false; message: string }
> {
  const context = await readWarehouseContext();
  if (context.scope.kind === 'all') {
    if (clientChoice) return { ok: true, warehouseId: clientChoice };
    const work = await readWorkWarehouse();
    return work.status === 'ok'
      ? { ok: true, warehouseId: work.warehouseId }
      : { ok: false, message: 'Kaynak depo seçilmedi — pencereden kaynağı seçin.' };
  }
  const work = await readWorkWarehouse();
  if (work.status === 'ok') return { ok: true, warehouseId: work.warehouseId };
  return {
    ok: false,
    message:
      work.status === 'needs_choice'
        ? 'Hangi depoda çalıştığınız belli değil — üst bardan depo seçip tekrar deneyin.'
        : 'Depo kapsamınız boş — yöneticiniz Ayarlar’dan kapsam atamalı.',
  };
}

/** Sevk penceresinin varyant kartı: partiler + FEFO önerisi. Öneri tavanı KULLANILABİLİR stok. */
export async function suggestDispatchAction(input: {
  variantId: string;
  wantedQty: number;
  sourceWarehouseId?: string;
}): Promise<ActionResult<DispatchCandidate | { status: 'no_stock' }>> {
  try {
    await requireWarehouseScope();
    const source = await resolveSourceWarehouse(input.sourceWarehouseId);
    if (!source.ok) return { data: null, error: source.message };

    const db = serviceDb();
    const transitDays = await new SettingsService(db).getNumber(TRANSFER_TRANSIT_DAYS_KEY, TRANSFER_TRANSIT_DAYS_DEFAULT);
    const data = await readDispatchCandidate(db, {
      warehouseId: source.warehouseId,
      variantId: input.variantId,
      wantedQty: input.wantedQty,
      transitDays,
      today: new Date().toISOString().slice(0, 10),
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Sevk — mal kaynaktan DÜŞER, ara hâl yoktur. Dönen union ekranın dilidir, istisna değil. */
export async function dispatchTransferAction(input: {
  toWarehouseId: string;
  lines: DispatchLine[];
  note?: string;
  sourceWarehouseId?: string;
}): Promise<ActionResult<Extract<DispatchTransferOutcome, { status: 'ok' }>>> {
  try {
    const { user } = await requireWarehouseScope();
    const source = await resolveSourceWarehouse(input.sourceWarehouseId);
    if (!source.ok) return { data: null, error: source.message };

    const outcome = await dispatchTransfer(serviceDb(), {
      fromWarehouseId: source.warehouseId,
      toWarehouseId: input.toWarehouseId,
      lines: input.lines,
      actorId: user.profileId,
      note: input.note?.trim() || null,
    });
    if (outcome.status !== 'ok') return { data: null, error: dispatchError(outcome) };

    revalidatePath('/operations/stock');
    return { data: outcome, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Kabul — hedef, TRANSFERİN KENDİSİNDEN çözülür; istemci depo adı taşımaz. */
export async function receiveTransferAction(input: {
  transferId: string;
  lines: ReceiveLine[];
}): Promise<ActionResult<Extract<ReceiveTransferOutcome, { status: 'ok' }>>> {
  try {
    const { user, scope } = await requireWarehouseScope();
    const db = serviceDb();
    const transfer = await new WarehouseTransferService(db).getById(input.transferId);
    if (!transfer) return { data: null, error: 'Transfer bulunamadı.' };
    // Kabulü hedefin personeli yapar (dört göz: sayan, gönderenden başkası). Depo-üstü bakış
    // her hedefi kabul edebilir; kapsamlıda hedef kapsam içinde olmalı — fail-closed.
    if (scope.kind === 'limited' && !scope.warehouseIds.includes(transfer.toWarehouseId)) {
      return { data: null, error: 'Bu sevkiyat sizin deponuza gelmiyor — kabulü hedef depo yapar.' };
    }

    const outcome = await receiveTransfer(db, {
      transferId: input.transferId,
      warehouseId: transfer.toWarehouseId,
      lines: input.lines,
      actorId: user.profileId,
    });
    if (outcome.status !== 'ok') return { data: null, error: receiveError(outcome) };

    revalidatePath('/operations/stock');
    return { data: outcome, error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// Geri alma ("mal hiç çıkmadı") action'ı BİLEREK YOK (tasarım: v1'de düğmesi çizilmiyor; knip
// kullanılmayan ihracata izin vermez): kapı `@lezzet/application.cancelTransfer`da hazır bekliyor,
// düğme doğduğu gün buraya `dispatchTransferAction` deseniyle bağlanır.

/**
 * İçerik penceresinin verisi — durum süzgeci YOK (19.08): yoldaki satırdan da geçmiş satırından da
 * aynı kapı açılır; kabul formu mu salt-okunur mu, dönen `canReceive` söyler. `null` = kayıt yok.
 */
export async function openTransferDetailAction(
  transferId: string,
): Promise<ActionResult<TransferDetailView | null>> {
  try {
    await requireWarehouseScope();
    return { data: await readTransferDetailView(transferId), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

/** Geçmişin sonraki sayfası — imleç istemcide durur, URL'e yazılmaz (runs emsali). */
export async function loadMoreTransferHistoryAction(
  after: KeysetCursor,
): Promise<ActionResult<HistoryPageView>> {
  try {
    await requireWarehouseScope();
    return { data: await readHistoryPage(after), error: null };
  } catch (error) {
    return { data: null, error: getErrorMessage(error) };
  }
}

// ── union → operatör cümlesi ────────────────────────────────────────────────
// Paket outcome'ları makine dilidir; ekrana çıkanın suçlamasız ve YOL GÖSTEREN olması bu katmanın
// işi. `failed` mesajı olduğu gibi geçer: RPC fiziksel gerçeği söylüyor (rpcRejectionMessage).

function dispatchError(o: Exclude<DispatchTransferOutcome, { status: 'ok' }>): string {
  switch (o.status) {
    case 'empty':
      return 'En az bir kalemde miktar girilmeli.';
    case 'forbidden':
      return o.reason === 'same_warehouse'
        ? 'Kaynak ile hedef aynı depo olamaz — transfer iki tesis arasındadır.'
        : 'Seçilen partiler kaynak deponun malı değil — pencereyi kapatıp yeniden açın.';
    case 'not_found':
      return 'Bazı partiler artık yok (satılmış ya da düzeltilmiş olabilir) — pencereyi yenileyin.';
    case 'failed':
      return o.message;
  }
}

function receiveError(o: Exclude<ReceiveTransferOutcome, { status: 'ok' }>): string {
  switch (o.status) {
    case 'not_found':
      return 'Transfer bulunamadı.';
    case 'forbidden':
      return 'Bu sevkiyat sizin deponuza gelmiyor — kabulü hedef depo yapar.';
    case 'stale':
      return o.currentStatus === 'received'
        ? 'Bu sevkiyat az önce kabul edilmiş — liste birazdan tazelenir.'
        : 'Bu sevk geri alınmış — kaynak depo "mal hiç çıkmadı" demiş.';
    case 'incomplete':
      return `${o.missingLineIds.length} satır sayılmadı — her satıra bir sayı girin ("0" da bir beyandır: geldi ama yok).`;
    case 'failed':
      return o.message;
  }
}

