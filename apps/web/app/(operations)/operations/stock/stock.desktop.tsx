'use client';

import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { PageHeader } from '@/components/operation/ui/page-header';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Select } from '@/components/operation/form/select';
import { Tabs } from '@/components/operation/ui/tabs';
import { SearchIcon } from '@/components/operation/ui/icons';
import { LevelsTab } from './tabs/levels-tab';
import { LossesTab } from './tabs/losses-tab';
import { AttentionTab } from './tabs/attention-tab';
import { STOCK_SCOPES, type StockScope, type StockTab } from './stock-url';
import type { StockViewProps } from './stock-types';

// Stok — web KABUĞU: ortak üst bar + sekmeler + süzgeç şeridi; sekme içerikleri kendi dosyalarında.
// Kabuk veriyi bilmez, yalnız yönlendirir (ürünler ekranının deseni).

const TABS: Array<{ key: StockTab; label: string }> = [
  { key: 'levels', label: 'Stok seviyeleri' },
  { key: 'attention', label: 'Yaklaşan tarihli' },
  { key: 'losses', label: 'İmha geçmişi' },
];

// Süzgeç çipleri PARTİ ölçütüdür ama SATIR süzer (bkz. stock-url). Sıra aciliyete göre: önce karar
// bekleyen, sonra verilmiş karar, sonra tedarik sorunu.
const SCOPE_LABEL: Record<StockScope, string> = {
  all: 'Tümü',
  expiry: 'Yaklaşan tarihli',
  offer: 'Teklif açık',
  low: 'Eşik altı',
};

const SEARCH_PLACEHOLDER: Record<StockTab, string> = {
  levels: 'Ürün / boy ara…',
  attention: 'Ürün / boy ara…',
  losses: 'Ürün ara…',
};

export function StockDesktop(props: StockViewProps) {
  const { data, tab, onTab, search, onSearch, catFilter, onCatFilter, scope, onScope, onOpenRecall } = props;
  const { inStock, attention, blocked } = data.counts;

  // Alt başlık sekmeye ait: her sekmede aynı üç sayıyı yazmak, imha geçmişine bakarken stok
  // sayaçlarını okutmaktı.
  const SUBTITLE: Record<StockTab, string> = {
    levels: `${inStock} boyda stok var · ${attention} parti karar bekliyor${blocked > 0 ? ` · ${blocked} DLC geçti` : ''}`,
    attention: `${attention} parti karar bekliyor${blocked > 0 ? ` · ${blocked} yalnız imha` : ''}`,
    losses: 'Stoktan düşen ve stoğa dönen kayıtlar — en yeni önce',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Stok" subtitle={SUBTITLE[tab]}>
        {/* Geri çağırma her sekmeden erişilebilir: acil bir iştir, sekme aramaz. */}
        <Button variant="secondary" size="sm" onClick={onOpenRecall}>
          <SearchIcon />
          Lot / geri çağırma
        </Button>
      </PageHeader>

      <Tabs
        items={TABS}
        active={tab}
        onSelect={onTab}
        action={<SearchInput value={search} onChange={onSearch} placeholder={SEARCH_PLACEHOLDER[tab]} className="w-56" />}
      />

      {/* Süzgeç şeridi YALNIZ seviyeler sekmesinde: "yaklaşan tarihli" sekmesi zaten süzülmüş bir
          listedir, üstüne aynı çipi koymak aynı soruyu iki kez sormak olurdu. */}
      {tab === 'levels' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-ops-line px-6 py-2.5">
          {STOCK_SCOPES.map((s) => (
            <Chip
              key={s}
              active={scope === s}
              tone={s === 'expiry' || s === 'low' ? 'amber' : 'olive'}
              onClick={() => onScope(s)}
            >
              {SCOPE_LABEL[s]}
            </Chip>
          ))}
          <span className="ml-1 h-4 w-px bg-ops-line" />
          <Select
            value={catFilter}
            onChange={onCatFilter}
            className="w-44"
            options={[
              { value: 'all', label: 'Tüm kategoriler' },
              ...data.categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
      ) : null}

      {tab === 'levels' && <LevelsTab {...props} />}
      {tab === 'attention' && <AttentionTab {...props} />}
      {tab === 'losses' && <LossesTab {...props} />}
    </div>
  );
}
