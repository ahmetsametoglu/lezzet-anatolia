'use client';

import { Button } from '@/components/operation/ui/button';
import { Chip } from '@/components/operation/ui/chip';
import { HandoffNote } from '@/components/operation/ui/handoff-note';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Select } from '@/components/operation/form/select';
import { SearchInput } from '@/components/operation/ui/search-input';
import { Tabs } from '@/components/operation/ui/tabs';
import { SearchIcon } from '@/components/operation/ui/icons';
import { WarehouseFilterChip, WarehouseFilterNotice } from '@/components/operation/ui/warehouse-filter-bar';
import { LevelsTab } from './tabs/levels-tab';
import { IntakeTab } from './tabs/intake-tab';
import { OutgoingTab } from './tabs/outgoing-tab';
import { AttentionTab } from './tabs/attention-tab';
import { STOCK_SCOPES, STOCK_TABS, STOCK_TAB_LABEL, type StockScope, type StockTab } from './stock-url';
import type { StockViewProps } from './stock-types';

// Stok — web KABUĞU: ortak üst bar + sekmeler + süzgeç şeridi; sekme içerikleri kendi dosyalarında.
// Kabuk veriyi bilmez, yalnız yönlendirir (ürünler ekranının deseni).

/**
 * Sekmeler — malın üç anı, soldan sağa: NE VAR · NE KARAR BEKLİYOR · NE GİRDİ · NE ÇIKTI (22.26).
 *
 * İkisi rozet taşır ve ikisi de bir İŞ YÜKÜ göstergesidir: karar bekleyen parti ve kabul bekleyen
 * sipariş. Sayılar runtime'da bağlanır.
 */
// Sıra ve ad `stock-url.ts`ten (15.08): `loading.tsx` de aynı kaynağı okur — liste burada
// yazılıyken iskelet 3 çubukta kalmıştı, "Çıkışlar" gelince bar genişliyordu.
const TABS = STOCK_TABS.map((key) => ({ key, label: STOCK_TAB_LABEL[key] }));

// Süzgeç çipleri PARTİ ölçütüdür ama SATIR süzer (bkz. stock-url). Sıra aciliyete göre: önce karar
// bekleyen, sonra verilmiş karar, sonra tedarik sorunu.
/**
 * Çip TONU anlam taşır (tasarım): yaklaşan tarihli ve eşik altı birer UYARIDIR (amber), açık teklif
 * ise izlenmesi gereken bir taahhüttür (kırmızı) — verilmiş bir karar, ama süresi olan bir karar.
 */
const SCOPE_TONE: Record<StockScope, 'olive' | 'amber' | 'red'> = {
  all: 'olive',
  expiry: 'amber',
  offer: 'red',
};

const SCOPE_LABEL: Record<StockScope, string> = {
  all: 'Tümü',
  expiry: 'Yaklaşan tarihli',
  offer: 'Teklif açık',
};

export function StockDesktop(props: StockViewProps) {
  const { data, tab, onTab, catFilter, onCatFilter, scope, onScope, onOpenRecall, warehouseFilter, onWarehouseFilter } = props;
  const { inStock, attention, blocked, pendingIntake } = data.counts;
  const { warehouse } = data;

  // Alt başlık sekmeye ait: her sekmede aynı üç sayıyı yazmak, imha geçmişine bakarken stok
  // sayaçlarını okutmaktı. Evren adı BAŞTA: sayılar hangi depolara ait, ilk okunan o olsun —
  // ve o evren BAĞLAMDIR, tablo süzgeci değil (sayaçlar süzgeçle daralmıyor, kural 5).
  const scopeLine = warehouse.scopeLabel ? `${warehouse.scopeLabel} · ` : '';
  const SUBTITLE: Record<StockTab, string> = {
    levels: `${scopeLine}${inStock} boyda stok var · ${attention} parti karar bekliyor${blocked > 0 ? ` · ${blocked} DLC geçti` : ''}`,
    attention: `${attention} parti karar bekliyor${blocked > 0 ? ` · ${blocked} yalnız imha` : ''}`,
    intake: `${scopeLine}${pendingIntake} sipariş kabul bekliyor`,
    outgoing: 'Stoktan düşen ve stoğa dönen kayıtlar — en yeni önce',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader title="Stok" subtitle={SUBTITLE[tab]}>
        {/* Geri çağırma her sekmeden erişilebilir: acil bir iştir, sekme aramaz. */}
        <Button variant="secondary" size="sm" onClick={() => onOpenRecall()}>
          <SearchIcon />
          Lot / geri çağırma
        </Button>
      </PageHeader>

      {/* Sekme çubuğunda EYLEM YOK (tasarım): arama ekran çapında bir süzgeç değil, imha geçmişinin
          kendi şeridinde yaşayan bir daraltma. Seviyeler kategori süzgeciyle, karar kuyruğu zaten
          kısa olduğu için süzgeçsiz çalışır. */}
      <Tabs
        items={TABS.map((t) => {
          if (t.key === 'attention') return { ...t, badge: attention };
          // Rozet SIFIRKEN yazılmaz: "0 sipariş bekliyor" bir iş yükü değil, gürültüdür.
          if (t.key === 'intake' && pendingIntake > 0) return { ...t, badge: pendingIntake };
          return t;
        })}
        active={tab}
        onSelect={onTab}
      />

      {/* **Devredilen parti bulunamadı** (22.5) — künye YALNIZ bu hâlde sayfada durur; bulunan
          hâlde diyaloğun içinde, kararın verildiği yerde. Sessiz geçilemez: operatör kuyruktan
          "bu teklife bak" diye geldi ve karşısına sıradan bir stok listesi çıktı. */}
      {props.handoffMissing ? (
        <HandoffNote
          blocked
          className="mx-6 mt-3"
          summary={props.handoffMissing.summary}
          reason={props.handoffMissing.reason}
        >
          <strong className="font-semibold">
            {props.handoffMissing.productName} ({props.handoffMissing.expiryDate}) partisi listede yok
          </strong>{' '}
          — satılıp tükenmiş, imha edilmiş ya da {props.handoffMissing.warehouseCode} deposu sizin kapsamınızın dışında
          olabilir. Teklif açılamaz; öneri kuyrukta durur, oradan reddedebilirsiniz.
        </HandoffNote>
      ) : null}

      {/* Süzgeç şeridi YALNIZ seviyeler sekmesinde: "yaklaşan tarihli" sekmesi zaten süzülmüş bir
          listedir, üstüne aynı çipi koymak aynı soruyu iki kez sormak olurdu. */}
      {tab === 'levels' ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-ops-line px-6 py-2.5">
          {STOCK_SCOPES.map((s) => (
            <Chip key={s} active={scope === s} tone={SCOPE_TONE[s]} onClick={() => onScope(s)}>
              {SCOPE_LABEL[s]}
            </Chip>
          ))}
          <span className="ml-1 h-4 w-px bg-ops-line" />
          {/* Kategori ÇİP biçiminde (tasarım): süzgeç şeridinde form alanı gibi bir kutu, çiplerin
              yanında yabancı duruyordu. Seçim yapılınca çip dolu hâle gelir. */}
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
          {/* Depo — bir bakış daraltması (mavi), karar süzgeci değil. Yalnız bağlam "tüm depolar"
              iken çizilir; tek depolu evrende daraltacak bir şey yoktur (kural 2). */}
          {warehouse.available ? (
            <WarehouseFilterChip value={warehouseFilter} onChange={onWarehouseFilter} options={warehouse.options} />
          ) : null}

          {/* **ARAMA AYNI ŞERİTTE AMA EN SAĞDA** (22.31, kullanıcı kararı 14.08). Çiplerin arasında
              değil: çipler kapalı bir kümeden SEÇİM yaptırır (kategori, durum, depo), arama ise açık
              uçlu bir daraltmadır — yan yana dizilince ikisi aynı türden şeymiş gibi okunuyordu.
              Şerit yine tek: ikisi de "bu listede neye bakıyorum" sorusunun parçası. */}
          <SearchInput
            value={props.search}
            onChange={props.onSearch}
            placeholder="Ürün veya boy ara"
            className="ml-auto w-[220px]"
          />
        </div>
      ) : null}

      {/* Şerit YALNIZ seviyeler sekmesinde: süzgeç de orada. Karar kuyruğunda her parti zaten
          deposunu tam adıyla söylüyor. */}
      {tab === 'levels' ? (
        <WarehouseFilterNotice
          active={warehouse.active}
          dropped={warehouse.dropped}
          detail="sekme sayıları ve özet bağlamın gerçeğidir; tablodaki adetler bu deponundur, satır listesi katalogun tamamıdır."
          onClear={() => onWarehouseFilter('')}
        />
      ) : null}

      {tab === 'levels' && <LevelsTab {...props} />}
      {tab === 'attention' && <AttentionTab {...props} />}
      {tab === 'intake' && <IntakeTab {...props} />}
      {tab === 'outgoing' && <OutgoingTab {...props} />}
    </div>
  );
}
