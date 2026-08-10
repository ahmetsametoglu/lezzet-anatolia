'use server';

import { revalidatePath } from 'next/cache';
import { DiscountCodeService, DiscountService, serviceDb } from '@lezzet/database';
import { LOCALES } from '@lezzet/i18n';
import type { LocalizedText } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import type { DiscountFormInput } from '@/components/operation/form/discount-form';

// İndirim yazma yolu — İKİ yüzeyin ortak eylemi (fiyat ekranı 09.x · asistan kuyruğu 22.10).
// Server action'lar kural gereği sayfa klasöründe kolokasyon eder; bu eylem artık tek bir sayfaya
// ait olmadığı için `lib/`'e taşındı (`CLAUDE.md §2`: paylaşılan yardımcı lib'te). Aynı devir
// teklif yazma yolunda da yaşanmıştı (`lib/stock/offer-actions`) — desen o.

/** Fiyat ekranının yolu; kural yazılınca liste tazelenir. */
const PRICES_PATH = '/operations/prices';

/**
 * İndirim/kupon yazar ya da günceller. `id` doluysa güncelleme.
 *
 * Doğrulamanın SON EMNİYETİ veritabanındadır (0031 kısıtları: hedefsiz kapsam, ters tarih, %100
 * üstü yüzde, tekil kod, kampanyaya kod yazılamaması). Burada yalnız operatöre okunur hata verecek
 * kadarı kontrol edilir — kuralı iki yerde tam olarak yazmak, ikisinin ayrışması demektir.
 *
 * **Kod SATIRLARI ayrı yazılır** (`discount_code`): bir kuponun birden çok kapısı olur ve hepsi aynı
 * kotayı açar. Kural yazıldıktan SONRA eşitlenir — kodun bağlanacağı kural henüz yoksa yazılamaz.
 *
 * Para dönüşümü YOK (02.9): servis cent alır, euro'ya sınırda kendisi çevirir (`STACK §8`).
 */
export async function saveDiscountAction(
  input: DiscountFormInput,
  /**
   * Asistan önerisinden gelindiyse o önerinin kimliği (22.10). **Yoksa akış hiç değişmez** — fiyat
   * ekranının elle kullandığı yol tek satır bile farklı koşmaz. Kuyruk kendi yazma yolunu açmıyor:
   * kural yine bu eylemden, aynı kısıtların altından doğuyor.
   */
  proposalId?: string | null,
): Promise<ActionResult> {
  try {
    const staff = await requireAdmin();
    const db = serviceDb();
    const svc = new DiscountService(db);

    const payload = {
      name: input.name.trim(),
      // Boş diller AYIKLANIR: form dokunulup silinen dili `''` olarak gönderir ve o boş metin
      // "ad var" gibi okunup yüzeyde boş bir tire bırakırdı ("İndirim — "). Hiçbir dil kalmazsa
      // alan `null` yazılır — ad verilmemiş demektir.
      publicLabel: trimmedLabel(input.publicLabel),
      trigger: input.trigger,
      type: input.type,
      // Tipine uyan alan dolu, öteki null — DB kısıtı (`discount_value_matches_type`) bunu bekliyor.
      percent: input.type === 'percent' ? input.percent : null,
      amountCents: input.type === 'fixed' ? Math.round(input.amountCents ?? 0) : null,
      scope: input.scope,
      categoryId: input.scope === 'category' ? input.targetId : null,
      collectionId: input.scope === 'collection' ? input.targetId : null,
      minBasketCents: input.minBasketCents === null ? null : Math.round(input.minBasketCents),
      firstOrderOnly: input.firstOrderOnly,
      validFrom: input.validFrom,
      validTo: input.validTo,
      customerId: input.customerId,
      maxUses: input.maxUses,
      perCustomerLimit: input.perCustomerLimit,
      isActive: input.isActive,
    };

    // Kodlar: boş bırakılan dil kapı açmaz. Büyük harfe çevrilir — müşteri "bayram10" yazsa da aynı
    // kupon bulunur (arama harf ayrımsız), ama listede tek bir yazım görünsün.
    const codes =
      payload.trigger === 'coupon'
        ? LOCALES.flatMap((locale) => {
            const code = input.codes[locale]?.trim().toUpperCase() ?? '';
            return code ? [{ code, locale }] : [];
          })
        : [];

    if (!payload.name) throw new Error('Ad girilmeli — listede kuralı bu adla tanıyacaksınız.');
    // Kodsuz kupon hiç uygulanamaz: kapısı olmayan bir kural, kimsenin giremediği bir odadır.
    // (Kural DB'de kısıt olarak DURAMAZ — kod ayrı tabloda ve kural yazılmadan satırı olamaz.)
    if (payload.trigger === 'coupon' && codes.length === 0) throw new Error('En az bir kupon kodu girilmeli.');
    // Tipe göre hangi alanın dolu olması gerektiği tek yerde: ekranda tek kutu, gönderilen iki alan.
    const entered = input.type === 'percent' ? input.percent : input.amountCents;
    if (entered === null || !Number.isFinite(entered) || entered <= 0)
      throw new Error('İndirim değeri sıfırdan büyük olmalı.');
    if (payload.scope !== 'cart' && !input.targetId)
      throw new Error('Kapsam hedefi seçilmeli (kategori ya da koleksiyon).');

    /**
     * Öneriden gelindiyse yazma ile kuyruk satırı BİRLİKTE koşar; sıra tek yerde (`withProposal`).
     * Kod satırları da işin İÇİNDE: kodsuz doğan bir kupon kimsenin giremediği bir odadır ve
     * kuyruk onu "uygulandı" diye damgalarsa arıza sessiz kalırdı.
     */
    await withProposal(
      proposalId,
      staff.profileId,
      async () => {
        const rule = input.id ? await svc.update({ id: input.id, ...payload }) : await svc.insert(payload);
        await new DiscountCodeService(db).replaceCodes(
          rule.id,
          codes.map((c) => ({ ...c, discountId: rule.id })),
        );
        return rule;
      },
      (rule) => ({ discountId: rule.id }),
    );

    revalidatePath(PRICES_PATH);
    // Kuyruk satırı da tazelenir: karar orada verildi, rozetin sayısı orada duruyor.
    revalidatePath('/operations/assistant');
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Müşteriye görünen adın temizlenmiş hâli. Formdan gelen `{tr:'Hoş geldin', fr:'', de:''}` gibi bir
 * nesnede boş diller SAKLANMAZ: yüzey "dil dolu mu" diye bakıyor ve boş metin "ad var" gibi okunup
 * satırda boş bir tire bırakırdı. Hiçbir dil kalmazsa `null` — "ad verilmedi".
 */
function trimmedLabel(label: LocalizedText | null | undefined): LocalizedText | null {
  const cleaned = Object.fromEntries(
    Object.entries(label ?? {})
      .map(([lang, text]) => [lang, text?.trim() ?? ''])
      .filter(([, text]) => text),
  );
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}
