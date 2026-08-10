'use client';

import type { ReactNode } from 'react';
import {
  PROPOSAL_PAYLOAD_SCHEMAS,
  type AssistantProposalKind,
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type FeaturedFlagPayload,
  type MoneyMovementPayload,
  type ProductCreatePayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type ZoneExtendPayload,
} from '@lezzet/types';
import { BatchOfferCard } from './cards/batch-offer-card';
import { BundleCard } from './cards/bundle-card';
import { DiscountCard } from './cards/discount-card';
import { FeaturedCard } from './cards/featured-card';
import { MoneyCard } from './cards/money-card';
import { ProductCreateCard } from './cards/product-create-card';
import { ProductDraftCard } from './cards/product-draft-card';
import { PurchaseOrderCard } from './cards/purchase-order-card';
import { RecipeCard } from './cards/recipe-card';
import { SummaryLine } from './cards/shared';
import { StockIntakeCard } from './cards/stock-intake-card';
import { ZoneCard } from './cards/zone-card';
import type { AssistantRowView } from './assistant-types';

/**
 * KART GÖVDELERİNİN DAĞITICISI — hangi tip hangi karta gider (22.11).
 *
 * ── NEDEN `assistant-body` DEĞİL, AYRI BİR KAYIT ────────────────────────────
 * O dosya "kind'a göre dallanan tek yer" diye yazılmıştı ve artık iki yer var. Ayrım keyfi değil,
 * iki sözleşme İKİ AYRI SORUYA cevap veriyor:
 *
 * · `assistant-body` → **kararın** gövdesi: düzenlenebilir form, engel, kaydeden kapı. Diyalogda.
 * · burası → **özetin** gövdesi: okunur, düzenlenemez, tıklanmayı hak edip etmediğini söyler. Kartta.
 *
 * Tek kayıtta birleştirilseydi kart bir gün form taşımaya başlardı — ızgaranın tek gerekçesi olan
 * "bir bakışta tara" yeteneği de o gün biterdi.
 *
 * ── KART BİR ÖZETTİR ────────────────────────────────────────────────────────
 * Kartta okunacak şey "bu öneri acil mi, konusu ne, ne kadar para" — ayrıntının yeri diyalog.
 * Künye satırı sayısı tipin ihtiyacına göre değişir ama sınırın amacı kartı KISA tutmak değil
 * OKUNUR tutmak: yer varken değerleri birbirine yaslamak (bir tur `STR · 14 kalem · 411 ad.`)
 * tam tersini yapıyordu.
 *
 * ── ŞEKLİ TUTMAYAN DİLEKÇEYE GÖVDE ÇİZİLMEZ ─────────────────────────────────
 * Payload `safeParse`ten geçmezse kart asistanın cümlesine düşüyor: uydurma bir özet, bozuk bir
 * dilekçeyi sağlam gibi gösterirdi.
 *
 * ── TİP BAŞINA DOSYA (kullanıcı ölçümü 11.08) ───────────────────────────────
 * Gövdeler bu dosyadaydı ve 926 satıra çıkmıştı; tek bir kartı düzeltmek için ajanın bütün dosyayı
 * bağlama alması gerekiyordu. Artık her tip kendi dosyasında (`cards/`), ortak yapı taşları
 * `cards/shared`ta. Burada yalnız dallanma kaldı — dallanmanın tek yerde olması, bir tipin sessizce
 * kartsız kalmasını engelleyen şeyin ta kendisi.
 */
export function cardBodyOf(row: AssistantRowView): ReactNode {
  switch (row.kind) {
    case 'batch_offer':
      return renderWith<BatchOfferPayload>(row, 'batch_offer', (p) => <BatchOfferCard payload={p} row={row} />);
    case 'discount_draft':
      return renderWith<DiscountDraftPayload>(row, 'discount_draft', (p) => <DiscountCard payload={p} />);
    case 'zone_extend':
      return renderWith<ZoneExtendPayload>(row, 'zone_extend', (p) => <ZoneCard payload={p} />);
    case 'bundle_draft':
      return renderWith<BundleDraftPayload>(row, 'bundle_draft', (p) => <BundleCard payload={p} row={row} />);
    case 'money_movement':
      return renderWith<MoneyMovementPayload>(row, 'money_movement', (p) => <MoneyCard payload={p} />);
    case 'purchase_order':
      return renderWith<PurchaseOrderPayload>(row, 'purchase_order', (p) => <PurchaseOrderCard payload={p} row={row} />);
    case 'stock_intake':
      return renderWith<StockIntakePayload>(row, 'stock_intake', (p) => <StockIntakeCard payload={p} row={row} />);
    case 'product_draft':
      return renderWith<ProductDraftPayload>(row, 'product_draft', (p) => <ProductDraftCard payload={p} row={row} />);
    case 'product_create':
      return renderWith<ProductCreatePayload>(row, 'product_create', (p) => <ProductCreateCard payload={p} />);
    case 'recipe_draft':
      return renderWith<RecipeDraftPayload>(row, 'recipe_draft', (p) => <RecipeCard payload={p} row={row} />);
    case 'featured_flag':
      return renderWith<FeaturedFlagPayload>(row, 'featured_flag', (p) => <FeaturedCard payload={p} row={row} />);
    default:
      // Tanımadığı tip: asistanın CÜMLESİ. On bir tipin hepsinin kartı var, yani bu dal bugün
      // ulaşılamaz — ama şema büyüdüğünde kartsız kalan tip boş bir kutu değil, okunur bir özet
      // gösterecek.
      return <SummaryLine summary={row.summary} amountCents={row.amountCents} />;
  }
}

/** Dilekçeyi kendi şemasıyla çözer; tutmuyorsa kart asistanın cümlesine düşer — uydurma özet yok. */
function renderWith<P>(row: AssistantRowView, kind: AssistantProposalKind, draw: (payload: P) => ReactNode): ReactNode {
  const schema = (PROPOSAL_PAYLOAD_SCHEMAS as Partial<Record<AssistantProposalKind, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>>)[kind];
  const parsed = schema?.safeParse(row.payload);
  return parsed?.success ? draw(parsed.data as P) : <SummaryLine summary={row.summary} amountCents={row.amountCents} />;
}
