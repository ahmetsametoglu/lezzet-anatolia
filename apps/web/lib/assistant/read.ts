import 'server-only';
import { AssistantProposalService, UserProfileService, serviceDb } from '@lezzet/database';
import { KIND_META, amountCentsOf } from '@lezzet/application';
import type { AssistantProposal } from '@lezzet/types';

import type { AssistantQueueRow, QueueTab } from './assistant-types';

/**
 * Asistan onay kuyruğunun EKRAN OKUMASI (22.3) — panelin tek veri kapısı.
 *
 * Ekran `payload`ın içine girip kendi hesabını yapmaz: rozet metni, etki cümlesi, hedef tablolar,
 * tutar ve tazelik burada türetilir (`assistant-types.ts` künyesi). Ham `payload` yalnız "Teknik
 * döküm" bölümü için taşınır.
 */

/**
 * "Tazeliği doluyor" eşiği — bir GÖRÜNÜM kararı, iş kuralı değil; bu yüzden ayar değil sabit.
 * Altı saat: patronun aynı gün içinde dönüp bakmasına yetecek kadar erken, her öneriyi turuncu
 * göstermeyecek kadar geç.
 */
const SOON_MS = 6 * 3600 * 1000;

function freshnessOf(proposal: AssistantProposal): AssistantQueueRow['freshness'] {
  const left = Date.parse(proposal.expiresAt) - Date.now();
  if (left <= 0) return 'gone';
  return left <= SOON_MS ? 'soon' : 'ok';
}

/**
 * Kuyruk satırları. Sekmeler AYRI okumalar çünkü üç ayrı soru: "ne bekliyor", "neyi kaçırdım",
 * "ne karar verdim" (`AssistantProposalService` künyeleri).
 *
 * Karar veren personelin adı TEK TURDA çözülür — satır başına sorgu, karar geçmişinde N+1 olurdu.
 */
export async function readAssistantQueue(tab: QueueTab, limit = 50): Promise<AssistantQueueRow[]> {
  const db = serviceDb();
  const service = new AssistantProposalService(db);
  const rows =
    tab === 'pending'
      ? await service.listPending(limit)
      : tab === 'expired'
        ? await service.listExpired(limit)
        : await service.listDecided(limit);

  const staffIds = [...new Set(rows.map((r) => r.decidedBy).filter((id): id is string => id !== null))];
  const staff = staffIds.length > 0 ? await new UserProfileService(db).listByIds(staffIds) : [];
  const nameById = new Map(staff.map((s) => [s.id, s.name]));

  return rows.map((proposal) => {
    const meta = KIND_META[proposal.kind];
    return {
      id: proposal.id,
      kind: proposal.kind,
      kindLabel: meta.label,
      summary: proposal.summary,
      reason: proposal.reason,
      impact: meta.impact,
      targetTables: [...meta.tables],
      payload: proposal.payload,
      amountCents: amountCentsOf(proposal.kind, proposal.payload),
      createdAt: proposal.createdAt,
      expiresAt: proposal.expiresAt,
      freshness: freshnessOf(proposal),
      status: proposal.status,
      // Personel silinmişse ad düşer ama KARAR geçerlidir — satırı gizlemek izi silmek olurdu.
      decidedByName: proposal.decidedBy ? (nameById.get(proposal.decidedBy) ?? null) : null,
      decidedAt: proposal.decidedAt,
      decidedNote: proposal.decidedNote,
      error: proposal.error,
      result: (proposal.result as Record<string, string> | null) ?? null,
    };
  });
}

/** Menü rozeti / bildirim sayacı — bekleyen öneri sayısı (süresi geçmişler sayılmaz). */
export function countPendingProposals(): Promise<number> {
  return new AssistantProposalService(serviceDb()).countPending();
}
