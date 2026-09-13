import { z } from 'zod';
import { classificationTypeOf } from '@lezzet/domain-core';
import { CAPITAL_NATURE, MovementDirectionEnum, type MovementDirection, type MovementNature, type MovementType } from '@lezzet/types';

/*
  ELLE PARA HAREKETİ FORMUNUN ŞEMASI VE SÖZLÜĞÜ (22.18) — finans sayfasından TAŞINDI, kopyalanmadı.

  Form ortak alana çıktı: asistanın para önerisi artık kuyruğun içinde, gerçek formuyla karar
  veriliyor (`money_movement` → `inline`). Bir komponentin sayfa klasöründen şema okuması ters
  yönlü bağımlılıktır (`docs:check §3e`); sayfa bunları yeniden ihraç ederek okuyor.
*/

/**
 * Elle girilebilen hareket türleri — `money_movement.type`ın ALT kümesi.
 *
 * `order_payment`/`order_refund` yok: sipariş bakiyesi iki yerden değişemez. `purchase` de yok —
 * stok alımı mal kabule bağlıdır ve bağsız satırı motor `supply_link_missing` ile reddeder.
 */
export const MANUAL_TYPES = ['expense', 'capital', 'misc'] as const satisfies readonly MovementType[];
export type ManualType = (typeof MANUAL_TYPES)[number];

/**
 * Formun şeması.
 *
 * **`amount` EURO taşır, cent değil** ve adı bunu söyler: alan bir tur `amountCents` adıyla euro
 * taşıyordu ve doğru görünüyordu — operatörün yazdığı "340,00" kapıya 340 CENT gidiyor, deftere
 * 3,40 € yazılıyordu. Çevrim gönderme anında (`toCents`).
 *
 * Seçici alanlar (tür, cari) "seçilmedi"yi BOŞ DİZEYLE söyler, `null` ile değil: seçici kutular dize
 * taşır; kapıya giderken boş dize `null` olur (`recordManualMovementAction`).
 */
export const ManualMovementSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(MANUAL_TYPES),
  /** **EURO** — kapıya `toCents` ile gider. */
  amount: z.number().positive().nullable(),
  direction: MovementDirectionEnum,
  /** TÜR (13.09 · ikinci karar) — "bu para neyin parası", sözlükten TEK tür. `reklam` seçilince kampanya sorulur. */
  nature: z.string(),
  /** Kime ödendi / kimden geldi — cari. */
  counterpartyId: z.string(),
  /** Serbest etiketler — izah DEĞİLDİR, isteğe bağlı ("Ortak A aracı"). */
  tags: z.array(z.string()),
  campaign: z.string(),
  valueDate: z.string(),
  description: z.string(),
  /**
   * Dayanak belge (12.12) — "Ödemesini yaz" ile açılan formda dolu gelir, elle girişte `null`.
   * Form bunu DÜZENLETMEZ (belge seçici yok); belgeden gelen ödeme belgeye bağlı doğar.
   */
  documentId: z.string().nullable(),
});
export type ManualMovementForm = z.infer<typeof ManualMovementSchema>;

/**
 * Kaydetmenin ENGELİ, tek cümlede.
 *
 * Alan alan kırmızı yazı yerine bu: eksik alan zaten kutuya bakınca görülüyor, ama "neden düğme
 * kapalı" sorusunun cevabı hiçbir yerde yazmıyordu. İki yüzey (finans diyaloğu · kuyruk) aynı
 * fonksiyonu okuyor — ayrışsalardı hareket bir ekranda kaydedilir ötekinde reddedilirdi.
 */
export function movementBlock(values: ManualMovementForm): string | null {
  if (!values.accountId) return 'Önce hesabı seçin.';
  if (!values.amount || values.amount <= 0) return 'Tutar sıfırdan büyük olmalı.';
  // Belgeden gelen ödeme belgeye bağlanır ve bağ satırı zaten izah eder — tür orada şart değil.
  if (values.type === 'expense' && !values.nature && !values.documentId) return 'Giderin türü seçilmeli (kira, akaryakıt, maaş…).';
  return null;
}

/** Bugünün günü — `valueDate` varsayılanı. Para çoğu zaman girildiği gün hareket etmiştir. */
export function movementToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tür seçicisinin etiketleri ve ipuçları. */
export const MANUAL_TYPE_VIEW: Record<ManualType, { label: string; hint: string }> = {
  expense: { label: 'Gider', hint: 'İşletmenin harcaması — türüyle: kira, akaryakıt, maaş, ambalaj, reklam…' },
  capital: { label: 'Sermaye', hint: 'İşletmeye dışarıdan konan para — bir satışın karşılığı değil.' },
  misc: { label: 'Sınıflandırılmadı', hint: 'Sebebi henüz belli değil; türü sonradan da konabilir.' },
};

/**
 * Etiket seçeneği — serbest etiket sözlüğünün (`movement_tag`) formdaki hâli: `value` slug,
 * `label` okunur ad.
 *
 * ── SINIFLANDIRMA ARTIK TÜR (13.09 · ikinci karar) ─────────────────────────
 * Bir tur sınıflandırmanın tek mekanizması etiketti ve iki şey kayboluyordu: çok etiketli satırda
 * hangisinin tür olduğu, ve muhasebeciye giden dökümde hesap kodu. Tür artık tektir
 * (`NatureOption`); etiket isteğe bağlı serbest işarettir. İkisi de sözlükten, çağırandan gelir.
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
 * Elle girişin türleri — yönüne uyan VE seçilen hareket türünü veren türler. Kural motorun
 * (`classificationTypeOf`): sermaye girişinin türü sermayedir, öteki çıkış gider, öteki giriş
 * sınıflandırılmamış giriştir. Sonuç: "Sermaye" yalnız sermaye türünü, "Gider" çıkış türlerini
 * görür; sınıflandırılmamış ÇIKIŞIN türü yoktur — türü biliniyorsa o bir giderdir.
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

/** Elle girişin KAPSAMI — "burada olmayan"ı susarak değil cümleyle söylemek (gerekçe gövdede). */
export const MANUAL_ENTRY_SCOPE =
  'Sipariş tahsilatları buradan girilmez — online ödeme, kapıda tahsilat ve kurye gün kapanışı kendi akışlarından düşer. Elle giriş gider, transfer ve sermaye içindir.';
