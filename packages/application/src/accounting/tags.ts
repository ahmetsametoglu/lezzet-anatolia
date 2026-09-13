import { MoneyMovementService, MovementTagService } from '@lezzet/database';
import { tagSlugOf } from '@lezzet/domain-core';
import type { MoneyMovement, MovementTag } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { unknownTagOf } from './document';

/*
  ETİKET SÖZLÜĞÜ VE İZAH KAPILARI (12.12 · kullanıcı kararları 13.09).

  Sınıflandırmanın tek mekanizması etikettir ve sözlük YÖNETİLİR: operatör ekler, yazım tek kalır.
  Slug kuralı motorda (`tagSlugOf`); ortak etiketi `ortak:<ad>` ön ekiyle doğar — ortaklar arası
  hesap ayrı bir varlık değil, bu etikettir.

  "İzah edilmemiş" kuyruğunu kapatan yol da burada: bağı ve belgesi olmayan bir hareket etiket
  alınca izahlı olur (`explained` türetilmiş kolon, satırla birlikte değişir).
*/

export type TagOutcome =
  | { status: 'ok'; tag: MovementTag }
  | { status: 'invalid'; reason: 'bad_label' | 'exists' | 'not_found' };

/**
 * Sözlüğe etiket ekler. `partner` işaretli ad `ortak:` ön ekiyle ve "Ortak …" okunur adıyla girer
 * — liste ortakları kendiliğinden gruplar, kimse ön eki elle yazmaz.
 */
export async function addMovementTag(db: SupabaseClient, input: { label: string; partner?: boolean }): Promise<TagOutcome> {
  const slug = tagSlugOf(input.label, { partner: input.partner });
  if (slug === null) return { status: 'invalid', reason: 'bad_label' };

  const service = new MovementTagService(db);
  if ((await service.list()).some((tag) => tag.slug === slug)) return { status: 'invalid', reason: 'exists' };

  const label = input.partner ? `Ortak ${input.label.trim()}` : input.label.trim();
  const tag = await service.insert({ slug, label });
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
 * Hareketin etiketlerini YAZAR (yerine koyar, eklemez): ekran çipleri açık/kapalı gösteriyor ve
 * gönderdiği liste operatörün gördüğü listenin kendisidir. Boş liste de geçerli — etiketi kaldırmak
 * bir karardır; hareket o zaman yeniden izah bekler (bağı ya da belgesi yoksa).
 */
export async function tagMovement(db: SupabaseClient, input: { movementId: string; tags: readonly string[] }): Promise<TagMovementOutcome> {
  if ((await unknownTagOf(db, input.tags)) !== null) return { status: 'invalid', reason: 'unknown_tag' };

  const service = new MoneyMovementService(db);
  if (!(await service.getById(input.movementId))) return { status: 'invalid', reason: 'not_found' };

  const movement = await service.update({ id: input.movementId, tags: [...input.tags] });
  return { status: 'ok', movement };
}
