'use server';

import { revalidatePath } from 'next/cache';
import {
  openIntakeForm,
  receiveGoods,
  receivePurchase,
  type IntakeFormLine,
  type IntakeFormRow,
  type PurchaseIntakeLine,
} from '@lezzet/application';
import { ProductService, SupplierService, serviceDb } from '@lezzet/database';
import { StockIntakePayloadSchema, resolveLocalizedText } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { readHandoffProposal, withProposal } from '@/lib/assistant/handoff';
import { costsForLines } from './intake-costs';
import type { ReceiveOutcome } from '@/app/(operations)/operations/receiving/receiving-types';

/**
 * Mal kabulün yazma ve okuma yolları (10.4).
 *
 * **Depocu yolu FİYAT KABUL ETMEZ** ve bu bir ekran kuralı değil: `receiveGoods`'un satır tipinde
 * (`IntakeFormLine`) maliyet alanı YOKTUR. Fiyatlı giriş admin'in ayrı kapısıdır (`receivePurchase`,
 * 09.14). İki ayrı tip, iki ayrı kapı — depo ekranı fiyat gönderemez, gönderse tip tutmaz.
 */
const RECEIVING_PATH = '/operations/receiving';

/** Seçilen tedarik siparişinin kalemleri — beklenen adetlerle dolu form. */
export async function openIntakeFormAction(purchaseOrderId: string): Promise<ActionResult<IntakeFormRow[]>> {
  try {
    await requireWarehouseScope();
    return { data: await openIntakeForm(serviceDb(), purchaseOrderId), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Kabulü tamamla.** Fark ve uyarı GERİ DÖNER, iş DURMAZ.
 *
 * Uyarı (kısa raf ömrü) ve fark (eksik/fazla) birer red değil, birer bilgidir: malı kabul edip
 * etmemek sahadaki insanın kararı (DOMAIN §4), tedarikçinin eksik göndermesi de bizim hatamız
 * değil. Ekran ikisini de gösteriyor ama hiçbiri kaydı geri almıyor.
 */
export async function receiveGoodsAction(input: {
  warehouseId: string;
  purchaseOrderId: string | null;
  supplierId: string | null;
  note: string | null;
  lines: IntakeFormLine[];
  /** Asistan önerisinden gelindiyse o önerinin kimliği (22.5); yoksa akış hiç değişmez. */
  proposalId?: string | null;
}): Promise<ActionResult<ReceiveOutcome>> {
  try {
    // Depo kapsamı BU depo için doğrulanıyor: yöneticinin açık seçimi de, depocunun kimliğinden
    // geleni de aynı kapıdan geçer. Kapsamı olmayan personel hiçbir depoya kabul yazamaz.
    const { user: staff } = await requireWarehouseScope(input.warehouseId);

    if (input.lines.length === 0) throw new Error('Kabul edilecek satır yok — en az bir kaleme adet girin.');

    /**
     * **Öneriden gelen kabul FİYATLI yoldan yazılır** (`receivePurchase`), elle kabul fiyatsız
     * yoldan (`receiveGoods`) — ve fiyat istemciye hiç inmez.
     *
     * Fatura fotoğrafından okunan birim maliyet payload'da duruyor; ekranın tipi onu taşıyamıyor
     * (rol duvarı, `IntakeFormLine`). Burada payload sunucuda yeniden okunup maliyet operatörün
     * onayladığı satırlara ekleniyor. Böylece depocu fiyatı görmüyor ama "son alış fiyatı" da
     * kaybolmuyor — `auto_price` onu bu kayıttan öğreniyor.
     */
    const proposal = input.proposalId ? await readHandoffProposal(input.proposalId) : null;
    const payload = proposal?.kind === 'stock_intake' ? StockIntakePayloadSchema.safeParse(proposal.payload) : null;

    const run = async () =>
      payload?.success
        ? receivePurchase(serviceDb(), {
            warehouseId: input.warehouseId,
            purchaseOrderId: input.purchaseOrderId,
            supplierId: input.supplierId,
            note: input.note,
            lines: costsForLines(payload.data, input.lines),
          })
        : receiveGoods(serviceDb(), {
            warehouseId: input.warehouseId,
            purchaseOrderId: input.purchaseOrderId,
            supplierId: input.supplierId,
            note: input.note,
            lines: input.lines,
          });

    // Kuyruk satırı kayıtla BİRLİKTE kapanır; sıra tek yerde (`withProposal`).
    const result = await withProposal(input.proposalId, staff.profileId, run, (outcome) => ({
      stockIntakeId: outcome.status === 'empty' ? '' : outcome.result.intakeId,
    }));

    if (result.status === 'empty') throw new Error('Kabul edilecek satır yok — en az bir kaleme adet girin.');

    revalidatePath(RECEIVING_PATH);
    // Stok ekranı da tazelenir: kabul edilen mal aynı anda satılabilir hâle geliyor ve o ekran
    // aynı gerçeği gösteriyor.
    revalidatePath('/operations/stock');

    // **Kapının sonucu OLDUĞU GİBİ geçirilmiyor, süzülüyor:** `ReceiveIntakeResult` içinde
    // `totalAmountCents` var (girişin parasal toplamı). Sonucu yayarak döndürmek, depocunun
    // ekranına para taşımanın en sessiz yolu olurdu — rol duvarı tam burada delinirdi.
    // Ekrana giden tek sayı yazılan parti ADEDİ.
    return {
      data: { warnings: result.warnings, differences: result.differences, batches: result.result.stockIds.length },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Katalogdan varyant arama — siparişsiz kabulde satır eklemek için. */
export async function searchIntakeVariantsAction(term: string): Promise<ActionResult<{ variantId: string; label: string }[]>> {
  try {
    await requireWarehouseScope();
    const query = term.trim();
    if (!query) return { data: [], error: null };

    const db = serviceDb();
    const service = new ProductService(db);
    const page = await service.listPriceRows({ filters: { query }, limit: VARIANT_SEARCH_LIMIT });
    const pool = await service.listPool(VARIANT_SEARCH_LIMIT, page.rows.map((row) => row.id));

    return {
      data: pool.flatMap((product) => {
        const name = resolveLocalizedText(product.name, OPERATIONS_LOCALE) || 'Adsız ürün';
        return product.variants.map((variant) => ({
          variantId: variant.id,
          label: titleOf(name, resolveLocalizedText(variant.label, OPERATIONS_LOCALE)),
        }));
      }),
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Aramanın tavanı — eşleşen ürün sayısı; her ürün birkaç varyant açar. */
const VARIANT_SEARCH_LIMIT = 20;

/**
 * **Yeni tedarikçi — hızlı ekleme** (tasarımın kuralı: *"ad + telefon yeter; vergi no, vade, adres
 * admin işi"*).
 *
 * Kamyon rampada beklerken ayrı bir sayfaya gitmek akışı kırar. Eksik alanlar sonradan yöneticinin
 * Tedarik ekranından tamamlanır — burada eksiksiz kayıt istemek, kabulü tedarikçi formuna rehin
 * vermek olurdu.
 */
export async function createSupplierAction(name: string, phone: string | null): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    await requireWarehouseScope();
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Tedarikçi adı girilmeli.');

    // Telefon `contact` bloğunda: tedarikçide ayrı bir `phone` kolonu YOK ve açmıyorum — iletişim
    // bilgisi zaten orada yaşıyor, ikinci bir yer iki gerçek demek olurdu.
    const telefon = phone?.trim();
    const supplier = await new SupplierService(serviceDb()).insert({
      name: trimmed,
      ...(telefon ? { contact: { phone: telefon } } : {}),
    });
    revalidatePath(RECEIVING_PATH);
    return { data: { id: supplier.id, name: supplier.name }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **ÖNERİDEN MAL KABUL** — asistan kuyruğunun kendi kapısı (22.23).
 *
 * ── NEDEN AYRI BİR EYLEM, `receiveGoodsAction`A BAYRAK DEĞİL ────────────────
 * Depocu yolu fiyat GÖNDEREMEZ ve bu bir ekran kuralı değil TİP sınırı: `IntakeFormLine`de maliyet
 * alanı yok, `PurchaseIntakeLine`de var — "iki ayrı tip, iki ayrı kapı" (09.14). Ortak eyleme
 * isteğe bağlı bir fiyat alanı eklemek, o sınırı yalnız iyi niyetle ayakta bırakırdı: depo ekranı
 * da gönderebilir hâle gelirdi ve tip artık hiçbir şey söylemezdi.
 *
 * ── FİYAT DİLEKÇEDEN DEĞİL FORMDAN GELİR (kullanıcı kararı 12.08) ───────────
 * Devir yolunda maliyet sunucuda dilekçeden eşleştiriliyor (`costsForLines`), çünkü orada ekran
 * depocunun ve fiyatı görmemeli. Kuyruk ise patronun ekranı: fatura yanlış okunmuşsa maliyet
 * onaydan ÖNCE düzeltilebilmeli. Düzeltilen değeri yok sayıp dilekçedekini yazsaydık, ekranda
 * görünen ile deftere geçen ayrışırdı — sistemin söyleyebileceği en sessiz yalan.
 */
export async function receiveIntakeFromProposalAction(input: {
  warehouseId: string;
  supplierId: string | null;
  note: string | null;
  /** Belgenin tarihi — boşsa kapı BUGÜNE yazar (`StockIntakeService.receive`). */
  date: string | null;
  lines: PurchaseIntakeLine[];
  proposalId: string;
}): Promise<ActionResult<ReceiveOutcome>> {
  try {
    // Depo kapsamı BU depo için doğrulanıyor — kuyruktan gelmek yetkiyi atlatmaz.
    const { user: staff } = await requireWarehouseScope(input.warehouseId);
    if (input.lines.length === 0) throw new Error('Kabul edilecek satır yok — en az bir kaleme adet girin.');

    // Kuyruk satırı kayıtla BİRLİKTE kapanır; sıra tek yerde (`withProposal`). Motorun `empty`
    // cevabı FIRLATILIR: hiçbir parti yazılmadı demektir ve sessizce dönseydi satır "uygulandı"
    // damgası yerdi (`recordManualMovementAction` künyesi).
    const result = await withProposal(
      input.proposalId,
      staff.profileId,
      async () => {
        const outcome = await receivePurchase(serviceDb(), {
          warehouseId: input.warehouseId,
          // Tedarik siparişi bağı YOK: bu yol belgeden okunan doğrudan girişin yolu. PO'lu kabul
          // depo ekranının kendi akışı ve sayım orada yapılır.
          purchaseOrderId: null,
          supplierId: input.supplierId,
          note: input.note,
          ...(input.date ? { date: input.date } : {}),
          lines: input.lines,
        });
        if (outcome.status === 'empty') throw new Error('Kabul edilecek satır yok — en az bir kaleme adet girin.');
        return outcome;
      },
      (outcome) => ({ stockIntakeId: outcome.result.intakeId }),
    );

    revalidatePath(RECEIVING_PATH);
    // Stok ekranı da tazelenir: kabul edilen mal aynı anda satılabilir hâle geliyor.
    revalidatePath('/operations/stock');
    revalidatePath('/operations/assistant');

    return {
      data: { warnings: result.warnings, differences: result.differences, batches: result.result.stockIds.length },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
