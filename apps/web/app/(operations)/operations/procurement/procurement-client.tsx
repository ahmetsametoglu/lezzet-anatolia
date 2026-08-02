'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { createDraftFromSuggestionAction, loadMorePurchaseOrdersAction } from './actions';
import { OrderSendDialog } from './order-send-dialog';
import { ProcurementDesktop } from './procurement.desktop';
import { ProcurementMobile } from './procurement.mobile';
import { SupplierDialog } from './supplier-dialog';
import { procurementUrl, type ProcurementTab, type ProcurementUrlState } from './procurement-url';
import type { ProcurementData, PurchaseOrderRowView, SupplierCardView } from './procurement-types';

// Tedarik ekranı client kökü (Sapma 3): durum burada, sunum web/mobil olarak çatallanır.
// SEKME GERÇEK gezinmedir: okuma sunucuda sekmeye bağlı — sığ yazsaydık öteki sekme boş açılırdı.

interface ProcurementClientProps {
  data: ProcurementData;
  device: Device;
  urlState: ProcurementUrlState;
  /** İptal yalnız yöneticinin — muhasebeci zinciri okur, akışı durdurmaz (kapı action'da da var). */
  canCancelOrders: boolean;
}

export function ProcurementClient({ data, device, urlState, canCancelOrders }: ProcurementClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  // Sekme turu sürerken ekran karşılık vermeli (09.2 navPending dersi): içerik soluklaşır.
  const [pending, startNav] = useTransition();

  const onTab = (tab: ProcurementTab) => {
    startNav(() => router.replace(procurementUrl({ tab }), { scroll: false }));
  };

  // ── Sipariş listesi: ilk sayfa sunucudan, devamı action ile EKLENİR ──
  // Sunucu verisi değişince (sekme dönüşü/revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski
  // okumanın satırları yeni listede kalır (fiyat ekranının deseni).
  const [extraOrders, setExtraOrders] = useState<PurchaseOrderRowView[]>([]);
  const [ordersCursor, setOrdersCursor] = useState(data.ordersCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtraOrders([]);
    setOrdersCursor(data.ordersCursor);
  }, [data.orders, data.ordersCursor]);

  const onLoadMoreOrders = () => {
    if (!ordersCursor || loadingMore) return;
    setLoadingMore(true);
    void loadMorePurchaseOrdersAction(ordersCursor)
      .then(({ data: page }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (!page) return;
        setExtraOrders((prev) => [...prev, ...page.rows]);
        setOrdersCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  // ── Aksiyonlar ──
  // Tedarikçi formu üç hâlli: kapalı · yeni (`'new'`) · düzenleme (kart kimliği). Tek durumda
  // tutuluyor ki "hem yeni hem düzenleme açık" gibi imkânsız bir hâl doğmasın (fiyat ekranı deseni).
  const [supplierState, setSupplierState] = useState<'closed' | 'new' | string>('closed');
  const editingSupplier =
    supplierState === 'closed' || supplierState === 'new'
      ? null
      : ((data.suppliers ?? []).find((s) => s.id === supplierState) ?? null);
  useEffect(() => {
    if (supplierState !== 'closed' && supplierState !== 'new' && !editingSupplier) setSupplierState('closed');
  }, [supplierState, editingSupplier]);

  // Gönderim penceresi bir SİPARİŞE bağlı; kimlikle tutulur ki sunucu tazelendiğinde pencere eski
  // satırın kopyasını göstermesin. Sipariş listeden düşerse pencere kendiliğinden kapanır.
  const orders = [...(data.orders ?? []), ...extraOrders];
  const [sendingOrderId, setSendingOrderId] = useState<string | null>(null);
  const sendingOrder = orders.find((o) => o.id === sendingOrderId) ?? null;
  useEffect(() => {
    if (sendingOrderId && !sendingOrder) setSendingOrderId(null);
  }, [sendingOrderId, sendingOrder]);

  // Taslak açma — hangi tedarikçinin düğmesinin sürdüğünü kimlikle tutuyoruz: tek bayrak olsaydı
  // bir gruba basmak bütün kartların düğmesini kilitlerdi.
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const onCreateDraft = (supplierId: string) => {
    if (creatingFor) return;
    setCreatingFor(supplierId);
    setActionError(null);
    void createDraftFromSuggestionAction(supplierId)
      .then((result) => {
        if (result.error) setActionError(result.error);
        // Taslak açıldı: operatör onu GÖNDERMELİ, yoksa sipariş yalnız bizde kalır. Bu yüzden
        // ekran Siparişler sekmesine geçer — taslağın yaşadığı ve gönderim penceresinin açıldığı yer.
        else if (result.data) {
          setSendingOrderId(result.data.orderId);
          onTab('orders');
        }
      })
      .finally(() => setCreatingFor(null));
  };

  const view = {
    data,
    tab: urlState.tab,
    onTab,
    navPending: pending,
    orders,
    hasMoreOrders: ordersCursor !== null,
    loadingMoreOrders: loadingMore,
    onLoadMoreOrders,
    onCreateDraft,
    creatingFor,
    actionError,
    onEditSupplier: (supplier: SupplierCardView | null) => setSupplierState(supplier ? supplier.id : 'new'),
    onOpenOrder: setSendingOrderId,
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <ProcurementMobile {...view} /> : <ProcurementDesktop {...view} />}
      {supplierState !== 'closed' ? (
        <SupplierDialog key={supplierState} editing={editingSupplier} onClose={() => setSupplierState('closed')} />
      ) : null}
      {sendingOrder ? (
        <OrderSendDialog
          key={sendingOrder.id}
          order={sendingOrder}
          supplierPhone={phoneOf(data, sendingOrder.supplierName)}
          canCancel={canCancelOrders}
          onClose={() => setSendingOrderId(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Siparişin tedarikçi telefonu — WhatsApp yolunun anahtarı.
 *
 * Kartlar yalnız kendi sekmesinde okunduğu için ADLA eşleştiriliyor; eşleşme bulunamazsa WhatsApp
 * düğmesi çizilmez ve pencere sebebini söyler. Doğrusu satırın `supplierId` taşıması — sipariş
 * detayı ekranıyla birlikte gelecek (`BEKLEYEN(09.14)`).
 */
function phoneOf(data: ProcurementData, supplierName: string): string | null {
  return (data.suppliers ?? []).find((s) => s.name === supplierName)?.phone ?? null;
}
