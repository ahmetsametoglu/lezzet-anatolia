import { CounterpartyService, MoneyMovementService, MovementNatureService } from '@lezzet/database';
import { acceptsNature } from '@lezzet/domain-core';
import type { Counterparty, CounterpartyKind, MoneyMovement } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setMovementNature } from './natures';

/*
  CARİ KAPILARI (13.09 · ikinci karar, muhasebeci karşılaştırması) — DOMAIN §9.

  Paranın KİME gittiği / KİMDEN geldiği: kurum (URSSAF, vergi dairesi), hizmet veren (muhasebeci,
  telefon, kiraya veren), çalışan. Bir tur bu soru belgede serbest metindi ve aynı kurum iki yazımla
  iki kişi oluyordu; "URSSAF'a bu yıl ne ödedik" bir kayıttan değil metin aramasından cevaplanıyordu.

  Tedarikçi ve ortak BURADA DEĞİL: tedarikçi stok modülünün kaydıdır (seçici ikisini aynı listede
  gösterir), ortağın kaydı cari hesabıdır.

  ── EŞLEŞME KELİMELERİ ─────────────────────────────────────────────────────
  Banka satırında carinin kelimesi geçerse cari ve varsayılan türü önerilir (motor: `suggestMatches`,
  `keyword_in_label`). Kelimeler yazıldığı gibi saklanır, karşılaştırma büyük/küçük harf ve aksandan
  bağımsızdır; üç harften kısa kelime aranmaz (motorun kuralı).
*/

export type CounterpartyOutcome =
  | { status: 'ok'; counterparty: Counterparty }
  | { status: 'invalid'; reason: 'bad_name' | 'exists' | 'not_found' | 'unknown_nature' };

/** Kelimeler: kırpılır, boşlar atılır, büyük/küçük harf farkıyla tekrar edenlerden ilki kalır. */
function cleanKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  return keywords.flatMap((raw) => {
    const keyword = raw.trim().replace(/\s+/g, ' ');
    const key = keyword.toLocaleLowerCase('tr');
    if (keyword === '' || seen.has(key)) return [];
    seen.add(key);
    return [keyword];
  });
}

async function natureKnown(db: SupabaseClient, nature: string | null | undefined): Promise<boolean> {
  if (!nature) return true;
  return (await new MovementNatureService(db).list()).some((row) => row.slug === nature);
}

/** Cari ekler — ad benzersizdir (büyük/küçük harf farkı aynı ad sayılır). */
export async function addCounterparty(
  db: SupabaseClient,
  input: { name: string; kind: CounterpartyKind; keywords?: readonly string[]; defaultNature?: string | null; note?: string | null },
): Promise<CounterpartyOutcome> {
  const name = input.name.trim();
  if (name === '') return { status: 'invalid', reason: 'bad_name' };
  const service = new CounterpartyService(db);
  const key = name.toLocaleLowerCase('tr');
  if ((await service.list()).some((row) => row.name.toLocaleLowerCase('tr') === key)) return { status: 'invalid', reason: 'exists' };
  if (!(await natureKnown(db, input.defaultNature))) return { status: 'invalid', reason: 'unknown_nature' };

  const counterparty = await service.insert({
    name,
    kind: input.kind,
    keywords: cleanKeywords(input.keywords ?? []),
    defaultNature: input.defaultNature || null,
    note: input.note?.trim() || null,
  });
  return { status: 'ok', counterparty };
}

/** Carinin adı, türü, kelimeleri, varsayılan türü, notu ve etkinliği düzenlenir. SİLİNMEZ, pasifleşir. */
export async function updateCounterparty(
  db: SupabaseClient,
  id: string,
  patch: { name?: string; kind?: CounterpartyKind; keywords?: readonly string[]; defaultNature?: string | null; note?: string | null; isActive?: boolean },
): Promise<CounterpartyOutcome> {
  const service = new CounterpartyService(db);
  const all = await service.list();
  if (!all.some((row) => row.id === id)) return { status: 'invalid', reason: 'not_found' };
  const name = patch.name?.trim();
  if (name === '') return { status: 'invalid', reason: 'bad_name' };
  if (name !== undefined && all.some((row) => row.id !== id && row.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
    return { status: 'invalid', reason: 'exists' };
  }
  if (!(await natureKnown(db, patch.defaultNature))) return { status: 'invalid', reason: 'unknown_nature' };

  const counterparty = await service.update({
    id,
    ...(name !== undefined ? { name } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.keywords !== undefined ? { keywords: cleanKeywords(patch.keywords) } : {}),
    ...(patch.defaultNature !== undefined ? { defaultNature: patch.defaultNature || null } : {}),
    ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
  });
  return { status: 'ok', counterparty };
}

export type MovementCounterpartyOutcome =
  | { status: 'ok'; movement: MoneyMovement }
  | { status: 'invalid'; reason: 'not_found' | 'unknown_counterparty' | 'party_taken' };

/**
 * Hareketin CARİSİNİ koyar ya da kaldırır (`counterpartyId: null`).
 *
 * Tedarikçili harekete cari konmaz — karşı taraf zaten belli, iki kayıt aynı soruyu iki ayrı cevapla
 * yanıtlardı. Carinin varsayılan türü varsa ve hareketin türü boşsa tür de konur: "URSSAF" seçmek
 * "Sosyal güvenlik" demektir (banka satırında bu, tür kapısının kuralıyla satırı mutabık yapar).
 * Tür yöne uymuyorsa (URSSAF'tan gelen bir iade) cari yine yazılır, tür operatöre kalır.
 */
export async function setMovementCounterparty(
  db: SupabaseClient,
  input: { movementId: string; counterpartyId: string | null },
): Promise<MovementCounterpartyOutcome> {
  const movements = new MoneyMovementService(db);
  const movement = await movements.getById(input.movementId);
  if (!movement) return { status: 'invalid', reason: 'not_found' };
  if (input.counterpartyId && movement.supplierId) return { status: 'invalid', reason: 'party_taken' };

  const counterparty = input.counterpartyId ? await new CounterpartyService(db).getById(input.counterpartyId) : null;
  if (input.counterpartyId && !counterparty?.isActive) return { status: 'invalid', reason: 'unknown_counterparty' };

  const updated = await movements.update({ id: movement.id, counterpartyId: input.counterpartyId });
  if (counterparty?.defaultNature && movement.nature === null && acceptsNature(movement.type)) {
    const withNature = await setMovementNature(db, { movementId: movement.id, nature: counterparty.defaultNature });
    if (withNature.status === 'ok') return { status: 'ok', movement: withNature.movement };
  }
  return { status: 'ok', movement: updated };
}
