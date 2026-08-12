import { z } from 'zod';
import { MovementDirectionEnum, type MovementType } from '@lezzet/types';

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
 */
export const ManualMovementSchema = z.object({
  accountId: z.string().min(1),
  type: z.enum(MANUAL_TYPES),
  /** **EURO** — kapıya `toCents` ile gider. */
  amount: z.number().positive().nullable(),
  direction: MovementDirectionEnum,
  category: z.string(),
  campaign: z.string(),
  valueDate: z.string(),
  description: z.string(),
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
  if (values.type === 'expense' && !values.category.trim()) return 'Giderin kategorisi yazılmalı (kira, akaryakıt…).';
  return null;
}

/** Bugünün günü — `valueDate` varsayılanı. Para çoğu zaman girildiği gün hareket etmiştir. */
export function movementToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tür seçicisinin etiketleri ve ipuçları. */
export const MANUAL_TYPE_VIEW: Record<ManualType, { label: string; hint: string }> = {
  expense: { label: 'Gider', hint: 'İşletmenin harcaması: kira, akaryakıt, maaş, ambalaj, reklam…' },
  capital: { label: 'Sermaye', hint: 'İşletmeye dışarıdan konan para — bir satışın karşılığı değil.' },
  misc: { label: 'Sınıflandırılmadı', hint: 'Sebebi henüz belli değil; sonradan adı konabilir.' },
};

/**
 * En sık girilen gider kategorileri — hızlı seçim çipleri.
 *
 * Kategori serbest METİNDİR (kalemler işletmeyle büyür, enum olsaydı her yeni kalem migration
 * isterdi) ve bu liste onu KISITLAMAZ, yalnız kısayol sunar. İki kazancı var: yazım farkını keser
 * ("Kira" ile "kira" iki ayrı kategori olurdu) ve **reklamın ham sabitini erişilebilir kılar** —
 * raporun süzdüğü değer `advertising`tir ve operatörden onu İngilizce yazması beklenemez.
 */
export const QUICK_CATEGORIES = [
  { value: 'kira', label: 'Kira' },
  { value: 'akaryakıt', label: 'Akaryakıt' },
  { value: 'maaş', label: 'Maaş' },
  { value: 'ambalaj', label: 'Ambalaj' },
  { value: 'advertising', label: 'Reklam' },
] as const;

/** Elle girişin KAPSAMI — "burada olmayan"ı susarak değil cümleyle söylemek (gerekçe gövdede). */
export const MANUAL_ENTRY_SCOPE =
  'Sipariş tahsilatları buradan girilmez — online ödeme, kapıda tahsilat ve kurye gün kapanışı kendi akışlarından düşer. Elle giriş gider, transfer ve sermaye içindir.';
