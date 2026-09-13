import { MoneyAllocationService, MoneyMovementService, MovementNatureService } from '@lezzet/database';
import { acceptsNature, classificationTypeOf, dictionarySlugOf } from '@lezzet/domain-core';
import type { MoneyMovement, MoneyMovementUpdate, MovementDirection, MovementNature } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  TÜR KAPILARI (13.09 · ikinci karar, muhasebeci karşılaştırması) — DOMAIN §9.

  "Bu para neyin parası" sorusunun cevabı TEK bir türdür: kira, maaş, sosyal güvenlik, banka
  masrafı. Bir tur bu soru çoklu etiketle cevaplanıyordu ve iki şey kayboluyordu — çok etiketli
  satırda hangisinin tür olduğu, ve muhasebeciye giden dökümde hesap kodu. Tür artık tektir ve
  isteğe bağlı bir hesap planı kodu (PCG) taşır; etiket serbest işarettir (`tags.ts`).

  ── TÜR = SINIFLANDIRMA, TEK KAPI ─────────────────────────────────────────
  Satırdaki tür seçici, kuyruğun "Gider" menüsü ve seçim penceresinin "adını koy" bölümü aynı kapıya
  gelir (`setMovementNature`). Tür kaba tipi de belirler (motor: `classificationTypeOf` — sermaye
  girişi `capital`, öteki çıkış `expense`, öteki giriş `misc`). BANKA SATIRINDA tür koymak satırı
  ekstreyle mutabık yapar (kuyruktan düşer); türü kaldırmak, satırın başka bağı yoksa onu kuyruğa
  geri döndürür — geri almanın bu yarısı budur, öteki yarısı (bağlar) `unmatch_bank_movement`.
*/

export type NatureOutcome =
  | { status: 'ok'; nature: MovementNature }
  | { status: 'invalid'; reason: 'bad_label' | 'exists' | 'not_found' | 'bad_code' };

const ACCOUNT_CODE = /^[0-9]{2,8}$/;

/** Boş kod "kodu yok" demektir; yazılmışsa 2–8 hane olmalı (PCG). `undefined` = hata. */
function cleanCode(code: string | null | undefined): string | null | undefined {
  const trimmed = code?.trim() ?? '';
  if (trimmed === '') return null;
  return ACCOUNT_CODE.test(trimmed) ? trimmed : undefined;
}

/** Sözlüğe tür ekler — slug okunur addan (motor); hesap kodu isteğe bağlı. */
export async function addMovementNature(
  db: SupabaseClient,
  input: { label: string; direction: MovementDirection | null; accountCode?: string | null },
): Promise<NatureOutcome> {
  const slug = dictionarySlugOf(input.label);
  if (slug === null) return { status: 'invalid', reason: 'bad_label' };
  const accountCode = cleanCode(input.accountCode);
  if (accountCode === undefined) return { status: 'invalid', reason: 'bad_code' };

  const service = new MovementNatureService(db);
  if ((await service.list()).some((nature) => nature.slug === slug)) return { status: 'invalid', reason: 'exists' };

  const nature = await service.insert({ slug, label: input.label.trim(), direction: input.direction, accountCode });
  return { status: 'ok', nature };
}

/**
 * Türün adı, yönü, kodu ve etkinliği düzenlenir; slug DEĞİŞMEZ — hareketler ve belgeler onu taşıyor.
 * Tür SİLİNMEZ, pasifleşir: eski hareketler onu taşımaya devam eder, yeni harekete verilmez.
 */
export async function updateMovementNature(
  db: SupabaseClient,
  slug: string,
  patch: { label?: string; direction?: MovementDirection | null; accountCode?: string | null; isActive?: boolean },
): Promise<NatureOutcome> {
  const service = new MovementNatureService(db);
  if (!(await service.list()).some((nature) => nature.slug === slug)) return { status: 'invalid', reason: 'not_found' };
  const label = patch.label?.trim();
  if (label === '') return { status: 'invalid', reason: 'bad_label' };
  const accountCode = patch.accountCode === undefined ? undefined : cleanCode(patch.accountCode);
  if (patch.accountCode !== undefined && accountCode === undefined) return { status: 'invalid', reason: 'bad_code' };

  const nature = await service.updateBySlug(slug, {
    ...(label !== undefined ? { label } : {}),
    ...(patch.direction !== undefined ? { direction: patch.direction } : {}),
    ...(accountCode !== undefined ? { accountCode } : {}),
    ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
  });
  return { status: 'ok', nature };
}

/**
 * Tür kapısının sorusu — sözlükte ve AKTİF mi, paranın yönüne uyuyor mu. Tür yoksa (`null`/boş)
 * sorun yoktur. Veritabanı tanımadığı türü FK ile zaten reddeder; burada önce sorulur ki ret okunur
 * olsun — kısıt hatası bir constraint adıdır, operatöre söylenecek cümle değil.
 */
export async function natureProblemOf(
  db: SupabaseClient,
  nature: string | null | undefined,
  direction: MovementDirection,
): Promise<'unknown_nature' | 'nature_direction' | null> {
  if (!nature) return null;
  const found = (await new MovementNatureService(db).list({ activeOnly: true })).find((row) => row.slug === nature);
  if (!found) return 'unknown_nature';
  return found.direction !== null && found.direction !== direction ? 'nature_direction' : null;
}

export type MovementNatureOutcome =
  | { status: 'ok'; movement: MoneyMovement }
  | { status: 'invalid'; reason: 'not_found' | 'unknown_nature' | 'nature_direction' | 'nature_not_applicable' };

/** Türden başka bir açıklaması var mı: iş bağı, transfer ya da belge bağı. */
async function hasOtherExplanation(db: SupabaseClient, movement: MoneyMovement): Promise<boolean> {
  if (movement.orderId || movement.stockIntakeId || movement.supplierId || movement.counterAccountId) return true;
  return (await new MoneyAllocationService(db).listByMovements([movement.id])).length > 0;
}

/**
 * Hareketin TÜRÜNÜ koyar ya da kaldırır (`nature: null`).
 *
 * Sipariş parası, stok alımı ve transfer tür almaz — onları bağları açıklar; bu kapı reddeder.
 * Tür konunca kaba tip türden türer (`classificationTypeOf`). Banka satırında tür = sınıflandırma:
 * satır mutabık olur; tür kaldırılır ve satırın başka açıklaması yoksa satır ekstreden geldiği hâle
 * döner (`misc`, eşleşmemiş) ve kuyrukta yeniden görünür.
 */
export async function setMovementNature(db: SupabaseClient, input: { movementId: string; nature: string | null }): Promise<MovementNatureOutcome> {
  const movements = new MoneyMovementService(db);
  const movement = await movements.getById(input.movementId);
  if (!movement) return { status: 'invalid', reason: 'not_found' };
  if (!acceptsNature(movement.type)) return { status: 'invalid', reason: 'nature_not_applicable' };
  const problem = await natureProblemOf(db, input.nature, movement.direction);
  if (problem) return { status: 'invalid', reason: problem };

  const patch: MoneyMovementUpdate = { id: movement.id, nature: input.nature };
  if (input.nature !== null) patch.type = classificationTypeOf(movement.direction, input.nature);
  if (movement.source === 'bank_import') {
    if (input.nature !== null) patch.reconciled = true;
    else if (!(await hasOtherExplanation(db, movement))) {
      patch.reconciled = false;
      patch.type = 'misc';
    }
  }
  return { status: 'ok', movement: await movements.update(patch) };
}
