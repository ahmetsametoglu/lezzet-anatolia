'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resolveLocalizedText } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { setProductActiveAction } from './tabs/product/actions';
import { ProductFormDialog } from './tabs/product/product-form-dialog';
import { ProductsDesktop } from './products.desktop';
import { ProductsMobile } from './products.mobile';
import { filledContentLangs, productStatus, type ProductTab, type ProductsData, type StatusFilter } from './products-types';

// Ürünler ekranı client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil olarak çatallanır.
// İlk boya sunucu cihaz ipucuyla; mount sonrası viewport'a göre düzeltilir. Modal her iki yüzeyin üstünde.

/** İlk boya sunucu ipucuyla; mount sonrası viewport ölçüsüne göre düzeltilir (tek render ağacı). */
function useDevice(initial: Device): Device {
  const [device, setDevice] = useState<Device>(initial);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setDevice(mq.matches ? 'mobile' : 'desktop');
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return device;
}

interface ProductsClientProps {
  data: ProductsData;
  device: Device;
}

export function ProductsClient({ data, device }: ProductsClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tab, setTab] = useState<ProductTab>('products');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(data.products[0]?.id ?? null);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit' } | null>(null);

  const selected = data.products.find((p) => p.id === selectedId) ?? null;

  const q = search.trim().toLowerCase();
  const visibleProducts = data.products.filter((p) => {
    if (catFilter !== 'all' && p.categoryId !== catFilter) return false;
    if (statusFilter !== 'all' && productStatus(p) !== statusFilter) return false;
    if (onlyIncomplete && filledContentLangs(p.name).length >= 3 && p.allergens.length > 0) return false;
    if (q && !resolveLocalizedText(p.name).toLowerCase().includes(q)) return false;
    return true;
  });

  // Aktiflik geçişi kalıcı (server action) — başarınca RSC listeyi tazeler (hata sessiz; sunucu = gerçek).
  const onToggleActive = (id: string, isActive: boolean) => {
    startTransition(async () => {
      const { error } = await setProductActiveAction(id, isActive);
      if (!error) router.refresh();
    });
  };

  const view = {
    data,
    visibleProducts,
    tab,
    onTab: setTab,
    search,
    onSearch: setSearch,
    catFilter,
    onCatFilter: setCatFilter,
    statusFilter,
    onStatusFilter: setStatusFilter,
    onlyIncomplete,
    onToggleIncomplete: () => setOnlyIncomplete((v) => !v),
    selectedId,
    onSelect: setSelectedId,
    openCreate: () => setModal({ mode: 'create' }),
    openEdit: () => setModal({ mode: 'edit' }),
    onToggleActive,
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <ProductsMobile {...view} /> : <ProductsDesktop {...view} />}
      {modal ? (
        <ProductFormDialog
          key={`${modal.mode}-${selected?.id ?? 'new'}`}
          mode={modal.mode}
          product={selected}
          categories={data.categories}
          device={resolvedDevice}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}
