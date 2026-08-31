'use server';

import { revalidatePath } from 'next/cache';
import {
  openIntakeForm,
  receiveGoods,
  receivePurchase,
  type IntakeFormRow,
  type PurchaseIntakeLine,
} from '@lezzet/application';
import { ProductService, SupplierService, serviceDb } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';
import { OPERATIONS_LOCALE } from '@/components/operation/ui/labels';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { withProposal } from '@/lib/assistant/handoff';
import type { ReceiveOutcome } from './intake-types';

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
 * **STOK EKRANININ KABUL KAPISI** (22.26) — mal kabul artık Stok'un bir sekmesi ve bu sekme HEM
 * yöneticiye HEM depocuya açık.
 *
 * ── TEK EYLEM, İKİ KAPI — VE SEÇİMİ SUNUCU YAPAR ────────────────────────────
 * Rol duvarı yerinde duruyor: `receiveGoods` maliyet taşıyan satırı kabul etmiyor (`IntakeFormLine`
 * fiyatsız), `receivePurchase` ediyor (`PurchaseIntakeLine`). Değişen tek şey, hangi kapıdan
 * geçileceğine **istemcinin değil sunucunun** karar vermesi: kapsam depo-üstüyse (yönetici/muhasebe)
 * fiyat yazılır, depoya bağlı personelde satırların maliyeti sunucuda DÜŞÜRÜLÜR — göndermiş olsa
 * bile. Ekranı gizlemeye güvenmiyoruz; ekran gizlemek bir yetki kontrolü değildir.
 *
 * Öneri kuyruğunun kendi kapısıyla (`receiveIntakeFromProposalAction`) da çakışmıyor: orada
 * satırlar bir faturadan geliyor ve karar kuyrukta veriliyor; burada operatör formu kendisi
 * dolduruyor.
 */
export async function receiveIntakeAction(input: {
  warehouseId: string;
  /** Siparişli kabulde PO kimliği; irsaliyesiz/serbest kabulde `null`. */
  purchaseOrderId: string | null;
  supplierId: string | null;
  /** Belgenin tarihi — boşsa kapı BUGÜNE yazar (`StockIntakeService.receive`). */
  date: string | null;
  note: string | null;
  /** Satırlar; `unitCost` **EURO** (form birimi) — cent'e çevrim burada, sınırda. */
  lines: Array<{
    variantId: string;
    qty: number;
    expiryDate: string;
    lotNumber: string | null;
    /** Partinin konacağı alan — kimlik (19.29); boş = raf seçilmedi ve bu meşru. */
    storageAreaId: string | null;
    unitCost: number | null;
  }>;
}): Promise<ActionResult<ReceiveOutcome>> {
  try {
    // Depo kapsamı BU depo için doğrulanıyor: sekmeden gelmek yetkiyi atlatmaz.
    const { user, scope } = await requireWarehouseScope(input.warehouseId);
    if (input.lines.length === 0) throw new Error('Kabul edilecek satır yok — en az bir kaleme adet girin.');

    const base = input.lines.map((line) => ({
      variantId: line.variantId,
      qty: line.qty,
      expiryDate: line.expiryDate,
      lotNumber: line.lotNumber?.trim() || null,
      storageAreaId: line.storageAreaId || null,
      // Form EURO taşır, kapı CENT ister — çevrim tek noktada (`STACK §8`). Fiyatsız kapıya
      // giderken bu alan hiç okunmuyor; `receiveGoods`un satır tipinde karşılığı yok.
      unitCostCents: line.unitCost === null ? null : toCents(line.unitCost),
    }));

    const common = {
      warehouseId: input.warehouseId,
      purchaseOrderId: input.purchaseOrderId,
      supplierId: input.supplierId,
      note: input.note,
      // **KABULÜ KİM YAPTI** (kullanıcı kararı 31.08): kapının doğruladığı kullanıcı, belgeye ve
      // doğan her harekete yazılır. Native kapısı da aynı alanı besliyor — iki yüzeyden giren mal
      // defterde aynı soruyu aynı yerde cevaplasın diye.
      actorId: user.id,
      ...(input.date ? { date: input.date } : {}),
    };

    const result =
      scope.kind === 'all'
        ? await receivePurchase(serviceDb(), { ...common, lines: base })
        : // Depoya bağlı personelde maliyet SUNUCUDA düşürülüyor: `receiveGoods`un satır tipi onu
          // taşımıyor ve `intake` çekirdeği hepsini `null`a çeviriyor (kendi künyesi).
          await receiveGoods(serviceDb(), { ...common, lines: base });

    if (result.status === 'empty') throw new Error('Kabul edilecek satır yok — en az bir kaleme adet girin.');

    revalidatePath(RECEIVING_PATH);
    revalidatePath('/operations/stock');

    // **Kapının sonucu OLDUĞU GİBİ geçirilmiyor, süzülüyor:** `ReceiveIntakeResult` girişin parasal
    // toplamını da taşıyor. Sonucu yayarak döndürmek, depocunun ekranına para taşımanın en sessiz
    // yolu olurdu. Ekrana giden tek sayı yazılan parti ADEDİ.
    return {
      data: {
        warnings: result.warnings,
        storageMismatches: result.storageMismatches,
        differences: result.differences,
        batches: result.result.stockIds.length,
      },
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
 * ── NEDEN AYRI BİR EYLEM ────────────────────────────────────────────────────
 * Kuyruğun kaydı bir ÖNERİYİ kapatıyor (`withProposal`): satır ve kayıt birlikte yazılır, ikinci bir
 * yazma yolu açılmaz. Ekranın kendi kapısında (`receiveIntakeAction`) böyle bir öneri yok.
 *
 * ── FİYAT DİLEKÇEDEN DEĞİL FORMDAN GELİR (kullanıcı kararı 12.08) ───────────
 * Kuyruk patronun ekranı: fatura yanlış okunmuşsa maliyet
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
      data: {
        warnings: result.warnings,
        storageMismatches: result.storageMismatches,
        differences: result.differences,
        batches: result.result.stockIds.length,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
