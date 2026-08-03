'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { createDraftFromSuggestionAction, loadMorePurchaseOrdersAction } from './actions';
import { ManualOrderDialog } from './manual-order-dialog';
import { PurchaseOrderDialog } from './purchase-order-dialog';
import { ProcurementDesktop } from './procurement.desktop';
import { ProcurementMobile } from './procurement.mobile';
import { SupplierDialog } from './supplier-dialog';
import { procurementUrl, toOrderFilters, type ProcurementUrlState } from './procurement-url';
import type { ProcurementData, PurchaseOrderRowView, SupplierCardView } from './procurement-types';

// Tedarik ekranı client kökü (Sapma 3): durum burada, sunum web/mobil olarak çatallanır.
// SEKME GERÇEK gezinmedir: okuma sunucuda sekmeye bağlı — sığ yazsaydık öteki sekme boş açılırdı.
// Süzgeçler de öyle: sunucuda uygulanıyorlar (`listRows`), yani adres değişmeli.

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
  // Sekme/süzgeç turu sürerken ekran karşılık vermeli (09.2 navPending dersi): içerik soluklaşır.
  const [pending, startNav] = useTransition();

  const onFilter = (patch: Partial<ProcurementUrlState>) => {
    startNav(() => router.replace(procurementUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // ── Sipariş listesi: ilk sayfa sunucudan, devamı action ile EKLENİR ──
  // Sunucu verisi değişince (sekme dönüşü/süzgeç/revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski
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
    // Süzgeç imleçle BİRLİKTE gider: ikinci sayfa birincinin ölçütünü taşımazsa liste sessizce karışır.
    void loadMorePurchaseOrdersAction(ordersCursor, toOrderFilters(urlState))
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

  // Sipariş penceresi yalnız KİMLİK tutar: içeriğini kendi okur (kalemler + tedarikçiye gidecek
  // metin). Satırın kopyasını taşısaydı, pencere içinde adet değiştikten sonra ekranda eski sayı
  // kalırdı — pencere kendi gerçeğinin sahibi.
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

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
          // Öneri listesi de yeniden okunur: action `revalidatePath` yapıyor ama istemci yönlendirme
          // önbelleği eski RSC yükünü bir süre tutuyor ve sekmeye dönüldüğünde bayat liste görünürdü.
          // Satır artık DÜŞMEZ de değil: taslak gönderilene kadar eşik hâlâ delik ve motor bunu
          // "taslakta" olarak ayrı gösteriyor — gönderildiği anda satır listeden çıkar.
          router.refresh();
          setOpenOrderId(result.data.orderId);
          onFilter({ tab: 'orders' });
        }
      })
      .finally(() => setCreatingFor(null));
  };

  const orders = [...(data.orders ?? []), ...extraOrders];
  const view = {
    data,
    urlState,
    onFilter,
    navPending: pending,
    orders,
    hasMoreOrders: ordersCursor !== null,
    loadingMoreOrders: loadingMore,
    onLoadMoreOrders,
    onCreateDraft,
    creatingFor,
    actionError,
    onEditSupplier: (supplier: SupplierCardView | null) => setSupplierState(supplier ? supplier.id : 'new'),
    onOpenOrder: setOpenOrderId,
    onNewOrder: () => setManualOpen(true),
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <ProcurementMobile {...view} /> : <ProcurementDesktop {...view} />}
      {supplierState !== 'closed' ? (
        <SupplierDialog key={supplierState} editing={editingSupplier} onClose={() => setSupplierState('closed')} />
      ) : null}
      {openOrderId ? (
        <PurchaseOrderDialog
          key={openOrderId}
          orderId={openOrderId}
          today={data.today}
          canCancel={canCancelOrders}
          onClose={() => setOpenOrderId(null)}
        />
      ) : null}
      {manualOpen ? (
        <ManualOrderDialog
          suppliers={data.supplierOptions ?? []}
          warehouses={data.warehouseOptions ?? []}
          onClose={() => setManualOpen(false)}
          // Yeni sipariş doğar doğmaz penceresi açılır: açılıp gönderilmeyen sipariş yalnız bizde
          // kalır, o yüzden akış operatörü gönderime taşır (öneriden açılan taslağın aynı kuralı).
          onCreated={(orderId) => {
            setManualOpen(false);
            router.refresh();
            setOpenOrderId(orderId);
          }}
        />
      ) : null}
    </>
  );
}
