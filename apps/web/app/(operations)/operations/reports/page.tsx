import { ProductService, ProductVariantService, serviceDb } from '@lezzet/database';
import { toCents } from '@lezzet/helper';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { buildExport, pendingInvoices } from '@/lib/accounting/export';
import { companyPnl, productProfits } from '@/lib/accounting/profit';
import { guarded, requireAdmin, requireFinance } from '@/lib/guard';
import { ReportsClient } from './reports-client';
import { toChannelCards, toPnlRows, toProductMetrics, toVariantRows } from './reports-read';
import type { ReportsData } from './reports-types';
import { monthRange, parseReportsUrl, previousMonth, selectableMonths } from './reports-url';

// Raporlar (12.9) — **yönetici VEYA muhasebeci** sayfayı açar, ama **kâr blokları yalnız
// yöneticinin**.
//
// Tasarım §6 net: *"Depo/kurye rollerinin bu sayfaya erişimi yoktur — kâr yalnız admin görür"*.
// O metin `accounting` rolü doğmadan önce yazıldı (rol 09.2 ile geldi) ve muhasebecinin işi tam
// olarak bu sayfanın alt yarısı: export ve fatura eşleştirme. İkisini birden yöneticiye kilitlemek
// muhasebeciyi kendi işinden dışlardı; kârı ona açmak da tasarımın kararını çiğnerdi. Bu yüzden
// sayfa `requireFinance`, kâr blokları `canSeeProfit` — sipariş detayındaki rol kapılı finansal
// kartın aynı deseni.

interface ReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const access = await guarded(requireFinance);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Raporlar"
        reason="Kârlılık ve muhasebe export'u yönetim ve muhasebeye açıktır."
      />
    );
  }

  const now = new Date();
  const urlState = parseReportsUrl(await searchParams, now);
  // Kâr kapısı AYRI bir guard çağrısı, `access.user`dan okunan bir alan değil: `AuthUser` rol
  // taşımıyor, kimlik taşıyor. Rol kararı tek kapıdan (`requireAdmin`) geçsin diye — rolleri elle
  // okuyan her yer, yetki kuralının ikinci bir kopyası olurdu.
  const canSeeProfit = (await guarded(requireAdmin)).ok;
  const period = monthRange(urlState.ym);

  const [profits, pnl, prevPnl, exportData, invoicePage] = await Promise.all([
    // Kâr okumaları YALNIZ yetkisi olana yapılır — yetkisiz kullanıcıya gösterilmeyecek bir sayıyı
    // hesaplamak hem boşuna iş, hem de bir gün bir sızıntının kaynağı.
    canSeeProfit ? productProfits(period) : [],
    canSeeProfit ? companyPnl(period) : null,
    canSeeProfit && urlState.cmp ? companyPnl(monthRange(previousMonth(urlState.ym))) : null,
    buildExport(period),
    pendingInvoices({ limit: 30 }),
  ]);

  // Satır başlığı ÜRÜN ADI + BOY, yalnız boy DEĞİL — `ui:shot` ile ölçüldü (04.08): boy etiketi
  // gramajdır ("90g") ve raporda üç ayrı ürünün üç satırı birden "90g" yazıyordu, yani sayılar
  // doğruyken satırın kimliği kayboluyordu. Bir kârlılık tablosunun tek işi hangi ürünün ne
  // kazandırdığını söylemek; ürün adı olmadan tablo okunamaz.
  //
  // İki okuma da TEK turda: satır başına sorgu atsaydık yüz boyluk bir rapor iki yüz sorgu ederdi.
  const variantIds = profits.map((profit) => profit.variantId);
  const variants = variantIds.length > 0 ? await new ProductVariantService(serviceDb()).listByIds(variantIds) : [];
  const productIds = [...new Set(variants.map((variant) => variant.productId))];
  const products = productIds.length > 0 ? await new ProductService(serviceDb()).listByIds(productIds) : [];

  // Adlar ÇOK DİLLİ (`LocalizedCopy`); operasyon yüzeyi tek dilli Türkçedir (CLAUDE.md §2), o
  // yüzden `tr` önce. Yedekler var çünkü katalog kaydı üç dili birden dolu olmayabilir ve boş bir
  // başlık satırı yine kimliksiz bırakırdı.
  const pick = (copy: { tr?: string; fr?: string; de?: string }): string | null => copy.tr ?? copy.fr ?? copy.de ?? null;
  const productNames = new Map(products.map((product) => [product.id, pick(product.name)] as const));

  const titles = new Map(
    variants.map((variant) => {
      const product = productNames.get(variant.productId);
      const size = pick(variant.label);
      // Boy tek başına da yeter sayılmıyor: ürün adı okunamıyorsa satır zaten anlamını yitiriyor,
      // o yüzden ikisinden biri eksikse eldeki hangisiyse o yazılıyor.
      const title = [product, size].filter(Boolean).join(' · ');
      return [variant.id, title] as const;
    }),
  );

  const variantRows = toVariantRows(profits, titles);

  const data: ReportsData = {
    productMetrics: toProductMetrics(variantRows),
    variants: variantRows,
    pnl: pnl ? toPnlRows(pnl, prevPnl) : [],
    channels: pnl ? toChannelCards(pnl.byChannel) : [],
    export: {
      orderCount: exportData.summary.orderCount,
      grossCents: toCents(exportData.summary.gross),
      netCents: toCents(exportData.summary.net),
      vatCents: toCents(exportData.summary.vat),
      excludedGiftCount: exportData.summary.excludedGiftCount,
      excludedGiftGrossCents: toCents(exportData.summary.excludedGiftGross),
      byVatRate: exportData.summary.byVatRate.map((line) => ({
        rate: line.vatRate,
        netCents: toCents(line.net),
        vatCents: toCents(line.vat),
      })),
    },
    invoiceQueue: invoicePage.rows.map((sale) => ({
      orderId: sale.id,
      referenceNo: sale.referenceNo,
      saleDate: sale.saleDate,
      totalCents: sale.orderedTotalCents,
      channel: sale.channel,
    })),
    unpricedCount: pnl?.unpricedCount ?? 0,
    unpricedRevenueCents: pnl ? toCents(pnl.unpricedRevenue) : 0,
    // Dönemde satış var mı — export özeti herkese okunduğu için boş hâlin ölçütü de o.
    hasSales: exportData.summary.orderCount > 0 || (pnl?.orderCount ?? 0) > 0,
  };

  return (
    <ReportsClient
      data={data}
      urlState={urlState}
      months={selectableMonths(now)}
      canSeeProfit={canSeeProfit}
    />
  );
}
