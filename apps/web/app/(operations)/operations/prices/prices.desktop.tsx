'use client';

import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Select } from '@/components/operation/form/select';
import { Tabs } from '@/components/operation/ui/tabs';
import { ChannelsTab } from './tabs/channels-tab';
import { CustomersTab } from './tabs/customers-tab';
import { CouponsTab } from './tabs/coupons-tab';
import { OffersTab } from './tabs/offers-tab';
import { PRICE_SCOPES, SCOPE_LABEL, TAB_LABEL, type PriceScope, type PriceTab } from './prices-url';
import type { PricesViewProps } from './prices-types';

// Fiyatlar — web KABUĞU: ortak üst bar + sekmeler + süzgeç şeridi; sekme içerikleri kendi
// dosyalarında. Kabuk veriyi bilmez, yalnız yönlendirir (stok ve ürünler ekranlarının deseni).

/**
 * Sekmeler. "Yaklaşan tarihli" rozeti karar bekleyen parti SAYISINI taşır — sekmeye girmeden "bugün bir iş
 * var mı" sorusu yanıtlanabilsin. Sayı yalnız o sekme okunduğunda dolu; başka sekmedeyken rozet
 * gösterilmez, çünkü okunmamış bir sayıyı "0" diye yazmak yanlış haber olurdu.
 */
const TABS: Array<{ key: PriceTab; label: string }> = [
  { key: 'channels', label: TAB_LABEL.channels },
  { key: 'customers', label: TAB_LABEL.customers },
  { key: 'coupons', label: TAB_LABEL.coupons },
  { key: 'offers', label: TAB_LABEL.offers },
];

/**
 * Çip TONU anlam taşır: marj-altı bir KAYIP uyarısıdır (kırmızı), eksik fiyat bir eksikliktir
 * (amber), otomatik fiyat ise bir davranış işaretidir (zeytin) — hata değil.
 */
const SCOPE_TONE: Record<PriceScope, 'olive' | 'amber' | 'red'> = {
  all: 'olive',
  below: 'red',
  missing: 'amber',
  auto: 'olive',
};

export function PricesDesktop(props: PricesViewProps) {
  const { data, rows, counts, tab, onTab, search, onSearch, catFilter, onCatFilter, scope, onScope } = props;

  // Alt başlık sekmeye ait. Sayaçlar YÜKLENMİŞ sayfaya aittir ve metin bunu söyler — "3 marj-altı"
  // yazıp katalogun tamamını kastetmek, görülmemiş satırları sessizce yok saymaktı.
  const SUBTITLE: Record<PriceTab, string> = {
    channels: `${counts.rows} boy yüklendi · ${counts.below} marj-altı · ${counts.missing} fiyatı eksik`,
    customers: `${data.customerPrices.length} özel fiyat · ${data.discountCustomers.length} müşteride genel indirim oranı`,
    coupons: 'Kupon ve otomatik kampanya — indirim motoruna bağlı',
    offers: `${data.offers.length} parti karar bekliyor · teklif partiye bağlıdır, liste fiyatını değiştirmez`,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Fiyatlar" subtitle={SUBTITLE[tab]}>
        {/* Arama YALNIZ kanal listesinde: özel fiyat ve kupon listeleri kısa, süzgeç istemiyor.
            Kutunun her sekmede durması "aradığım şey burada aranıyor" yanılgısı yaratırdı. */}
        {tab === 'channels' ? (
          <SearchInput value={search} onChange={onSearch} placeholder="Ürün veya boy ara" className="w-[210px]" />
        ) : null}
      </PageHeader>

      <Tabs
        items={TABS.map((t) => (t.key === 'offers' && tab === 'offers' ? { ...t, badge: data.offers.length } : t))}
        active={tab}
        onSelect={onTab}
      />

      {tab === 'channels' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-ops-line px-6 py-2.5">
          {PRICE_SCOPES.map((s) => (
            <Chip key={s} active={scope === s} tone={SCOPE_TONE[s]} onClick={() => onScope(s)}>
              {SCOPE_LABEL[s]}
            </Chip>
          ))}
          <span className="ml-1 h-4 w-px bg-ops-line" />
          <Select
            variant="chip"
            value={catFilter === 'all' ? '' : catFilter}
            onChange={onCatFilter}
            placeholder="+ kategori"
            options={[
              { value: 'all', label: 'Tüm kategoriler' },
              ...data.categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
      ) : null}

      {tab === 'channels' && <ChannelsTab {...props} rows={rows} />}
      {tab === 'customers' && <CustomersTab {...props} />}
      {tab === 'coupons' && <CouponsTab {...props} />}
      {tab === 'offers' && <OffersTab {...props} />}
    </div>
  );
}
