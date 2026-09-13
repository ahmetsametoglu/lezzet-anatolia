import { MoneyMovementService, MovementTagService } from '@lezzet/database';
import { dictionarySlugOf } from '@lezzet/domain-core';
import type { MoneyMovement, MovementTag } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { unknownTagOf } from './document';

/*
  ETİKET KAPILARI (12.12 · 13.09 · ikinci karar).

  Etiket SERBEST bir işarettir: işletmenin kendi gruplaması ("Ortak A aracı", "Bayram hazırlığı").
  Sınıflandırma değildir — "bu para neyin parası" sorusunun cevabı TÜRDÜR (`natures.ts`) — ve bir
  hareketi izahlı YAPMAZ. Sözlük yine yönetilir (yazım tek kalsın: "Kira" ile "kira" iki kalem
  oluyordu) ama ekrandan tek dokunuşla büyür: etiket menüsündeki "yeni etiket" sözlüğe girer ve aynı
  anda satıra konur.

  Ortak etiketi (`ortak:<ad>`) KALKTI (13.09): ortağın kaydı cari hesabıdır, etiket değil.
*/

export type TagOutcome =
  | { status: 'ok'; tag: MovementTag }
  | { status: 'invalid'; reason: 'bad_label' | 'exists' | 'not_found' };

/** Sözlüğe etiket ekler — slug okunur addan (motor), aynı ad ikinci kez girmez. */
export async function addMovementTag(db: SupabaseClient, input: { label: string }): Promise<TagOutcome> {
  const slug = dictionarySlugOf(input.label);
  if (slug === null) return { status: 'invalid', reason: 'bad_label' };

  const service = new MovementTagService(db);
  if ((await service.list()).some((tag) => tag.slug === slug)) return { status: 'invalid', reason: 'exists' };

  const tag = await service.insert({ slug, label: input.label.trim() });
  return { status: 'ok', tag };
}

/** Etiket SİLİNMEZ, pasifleşir — eski hareketler onu taşımaya devam eder. */
export async function setMovementTagActive(db: SupabaseClient, slug: string, isActive: boolean): Promise<TagOutcome> {
  const service = new MovementTagService(db);
  if (!(await service.list()).some((tag) => tag.slug === slug)) return { status: 'invalid', reason: 'not_found' };
  return { status: 'ok', tag: await service.setActive(slug, isActive) };
}

export type TagMovementOutcome =
  | { status: 'ok'; movement: MoneyMovement }
  | { status: 'invalid'; reason: 'unknown_tag' | 'not_found' };

/**
 * Hareketin etiketlerini YAZAR (yerine koyar, eklemez): menü her dokunuşta listenin yeni hâlini
 * gönderir. Boş liste de geçerli. Etiket izah değildir — bu kapı satırın izahını değiştirmez.
 */
export async function tagMovement(db: SupabaseClient, input: { movementId: string; tags: readonly string[] }): Promise<TagMovementOutcome> {
  if ((await unknownTagOf(db, input.tags)) !== null) return { status: 'invalid', reason: 'unknown_tag' };

  const service = new MoneyMovementService(db);
  if (!(await service.getById(input.movementId))) return { status: 'invalid', reason: 'not_found' };

  const movement = await service.update({ id: input.movementId, tags: [...input.tags] });
  return { status: 'ok', movement };
}
