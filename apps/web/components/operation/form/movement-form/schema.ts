import { z } from 'zod';
import { classificationTypeOf } from '@lezzet/domain-core';
import { parisDateOf } from '@lezzet/helper';
import { CAPITAL_NATURE, MovementDirectionEnum, type MovementDirection, type MovementNature, type MovementType } from '@lezzet/types';

/*
  Elle para hareketi formunun şeması ve sözlüğü ortak alandadır, çünkü form hem finans sayfasında hem asistan kuyruğunda çizilir.
  Komponentin sayfa klasöründen şema okuması ters yönlü bağımlılık olurdu; sayfa bunları yeniden ihraç ederek okur.
*/

/**
 * Elle girilebilen hareket türleri, `money_movement.type`ın alt kümesi. Sipariş tahsilatı ve iadesi yoktur, çünkü sipariş bakiyesi iki
 * yerden değişemez; alım da yoktur, çünkü stok alımı mal kabule bağlıdır.
 */
export const MANUAL_TYPES = ['expense', 'capital', 'misc'] as const satisfies readonly MovementType[];
export type ManualType = (typeof MANUAL_TYPES)[number];

/**
 * `amount` euro taşır ve kapıya giderken `toCents` ile çevrilir. Seçici alanlar "seçilmedi"yi boş dizeyle söyler, çünkü seçici kutular
 * dize taşır; kapıya giderken boş dize `null` olur.
 */
export const ManualMovementSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(MANUAL_TYPES),
  /** **EURO** — kapıya `toCents` ile gider. */
  amount: z.number().positive().nullable(),
  direction: MovementDirectionEnum,
  /** Paranın neyin parası olduğu, sözlükten tek tür; `reklam` seçilince kampanya sorulur. */
  nature: z.string(),
  /** Kime ödendi / kimden geldi — cari. */
  counterpartyId: z.string(),
  /** Serbest etiketler — izah DEĞİLDİR, isteğe bağlı ("Ortak A aracı"). */
  tags: z.array(z.string()),
  campaign: z.string(),
  valueDate: z.string(),
  description: z.string(),
  /** Dayanak belge: "Ödemesini yaz" ile açılan formda dolu gelir, elle girişte `null`. Form bunu düzenletmez, ödeme belgeye bağlı doğar. */
  documentId: z.string().nullable(),
});
export type ManualMovementForm = z.infer<typeof ManualMovementSchema>;

/**
 * Kaydetmenin engeli tek cümlede, çünkü "düğme neden kapalı" sorusunun cevabı başka yerde yazmıyor. Finans diyaloğu ile kuyruk aynı
 * fonksiyonu okur, ki hareket bir ekranda kaydedilip ötekinde reddedilmesin.
 */
export function movementBlock(values: ManualMovementForm): string | null {
  if (!values.accountId) return 'Önce hesabı seçin.';
  if (!values.amount || values.amount <= 0) return 'Tutar sıfırdan büyük olmalı.';
  // Belgeden gelen ödeme belgeye bağlanır ve bağ satırı zaten izah eder — tür orada şart değil.
  if (values.type === 'expense' && !values.nature && !values.documentId) return 'Giderin türü seçilmeli (kira, akaryakıt, maaş…).';
  return null;
}

/** Paris takviminde bugün, `valueDate` varsayılanı: para çoğu zaman girildiği gün hareket etmiştir. */
export function movementToday(): string {
  return parisDateOf(new Date());
}

/** Tür seçicisinin etiketleri ve ipuçları. */
export const MANUAL_TYPE_VIEW: Record<ManualType, { label: string; hint: string }> = {
  expense: { label: 'Gider', hint: 'İşletmenin harcaması — türüyle: kira, akaryakıt, maaş, ambalaj, reklam…' },
  capital: { label: 'Sermaye', hint: 'İşletmeye dışarıdan konan para — bir satışın karşılığı değil.' },
  misc: { label: 'Sınıflandırılmadı', hint: 'Sebebi henüz belli değil; türü sonradan da konabilir.' },
};

/**
 * Serbest etiket sözlüğünün (`movement_tag`) formdaki hâli: `value` slug, `label` okunur ad. Sınıflandırma etiketle değil tek türle
 * yapılır (`NatureOption`), çünkü çok etiketli satırda hangisinin tür olduğu ve dökümdeki hesap kodu belirsiz kalırdı.
 */
export interface TagOption {
  value: string;
  label: string;
}

/** Tür seçeneği — `direction` `null` ise iki yöne de uyar (sözlüğün kendi alanı). */
export interface NatureOption {
  value: string;
  label: string;
  direction: MovementNature['direction'];
}

/** Cari seçeneği — varsayılan türü, seçildiğinde boş türe önerilir. */
export interface CounterpartyOption {
  value: string;
  label: string;
  defaultNature: string | null;
}

/** Paranın yönüne uyan türler — satırdaki seçici, kuyruk kartı, seçim penceresi ve belge formu. */
export function naturesForDirection(options: readonly NatureOption[], direction: MovementDirection): NatureOption[] {
  return options.filter((option) => option.direction === null || option.direction === direction);
}

/**
 * Elle girişin türleri: yönüne uyan ve seçilen hareket türünü veren türler, kural motorun (`classificationTypeOf`). Sınıflandırılmamış
 * çıkışın türü yoktur, çünkü türü biliniyorsa o bir giderdir.
 */
export function naturesFor(options: readonly NatureOption[], type: ManualType, direction: MovementDirection): NatureOption[] {
  return naturesForDirection(options, direction).filter((option) => classificationTypeOf(direction, option.value) === type);
}

/**
 * Hareket türü ya da yön değişince türün yeni hâli: hâlâ uyuyorsa aynen kalır; sermayede tek doğru
 * tür olduğu için o konur; öteki durumda boşalır — uymayan tür formda sessizce kalsaydı kapı
 * reddederdi ve operatör sebebini formda göremezdi.
 */
export function natureAfterChange(options: readonly NatureOption[], type: ManualType, direction: MovementDirection, current: string): string {
  const fitting = naturesFor(options, type, direction);
  if (fitting.some((option) => option.value === current)) return current;
  if (type === 'capital' && fitting.some((option) => option.value === CAPITAL_NATURE)) return CAPITAL_NATURE;
  return '';
}

/**
 * Hareket türü değişince yön türün sonucudur: gider çıkış, sermaye giriştir ve yalnız `misc` serbest kalır, çünkü banka sebebini
 * söylemez. Tür seçici asistan kuyruğunda ve Para penceresinde durur ve ikisi kuralı buradan okur.
 */
export function typePatch(
  options: readonly NatureOption[],
  values: Pick<ManualMovementForm, 'direction' | 'nature'>,
  type: ManualType,
): Pick<ManualMovementForm, 'type' | 'direction' | 'nature'> {
  const direction = type === 'expense' ? 'out' : type === 'capital' ? 'in' : values.direction;
  return { type, direction, nature: natureAfterChange(options, type, direction, values.nature) };
}

/**
 * Elle girişin kapsamı cümleyle söylenir, çünkü sipariş tahsilatını neden giremediğini bilmeyen operatör onu "sınıflandırılmadı" diye
 * girer ve sipariş ile para kaydı sessizce ayrışır.
 */
export const MANUAL_ENTRY_SCOPE = 'Sipariş tahsilatları burada girilmez — online ödeme, kapıda tahsilat ve kurye gün kapanışı kendi akışlarından düşer.';
