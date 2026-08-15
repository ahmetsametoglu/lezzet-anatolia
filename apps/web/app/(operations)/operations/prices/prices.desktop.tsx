'use client';

import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Select } from '@/components/operation/form/select';
import { Tabs } from '@/components/operation/ui/tabs';
import { AutoRepriceButton } from './auto-reprice-button';
import { ChannelsTab } from './tabs/channels-tab';
import { CustomersTab } from './tabs/customers-tab';
import { CouponsTab } from './tabs/coupons-tab';
import { OffersTab } from './tabs/offers-tab';
import { SCOPE_TONE, tabSubtitle } from './prices-labels';
import { PRICE_SCOPES, SCOPE_LABEL, TAB_LABEL, type PriceTab } from './prices-url';
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

export function PricesDesktop(props: PricesViewProps) {
  const { data, rows, counts, tab, onTab, search, onSearch, catFilter, onCatFilter, scope, onScope } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* Başlık barı sekmeye bağlı HİÇBİR kontrol taşımaz (kullanıcı kararı 15.08): en üstte duran
          düğme "tüm sekmeleri ilgilendiriyor" der ve yalan olurdu. Arama ve toplu hizalama yalnız
          kanal listesinin işidir — ikisi de o sekmenin süzgeç satırında yaşar (aşağıda). */}
      <PageHeader title="Fiyatlar" subtitle={tabSubtitle(tab, data, counts)} />

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
          {/* Sekmeye bağlı kontroller şeridin SAĞINDA (15.08): arama en sağda, hizalama yanında.
              Boy `sm` — çip şeridinin ölçeği; `md` arama kutusu şeridi tek başına yükseltiyordu. */}
          <span className="ml-auto flex items-center gap-2">
            <AutoRepriceButton />
            <SearchInput value={search} onChange={onSearch} placeholder="Ürün veya boy ara" size="sm" className="w-[210px]" />
          </span>
        </div>
      ) : null}

      {tab === 'channels' && <ChannelsTab {...props} rows={rows} />}
      {tab === 'customers' && <CustomersTab {...props} />}
      {tab === 'coupons' && <CouponsTab {...props} />}
      {tab === 'offers' && <OffersTab {...props} />}
    </div>
  );
}
