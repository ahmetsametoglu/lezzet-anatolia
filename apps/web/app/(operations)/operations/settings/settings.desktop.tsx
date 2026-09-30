'use client';

import { Chip } from '@/components/operation/ui/chip';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Tabs } from '@/components/operation/ui/tabs';
import { SETTING_TABS, sectionTab } from './settings-layout';
import { CardGrid, GridCell, SectionGrid, StaffCard } from './settings-sections';
import { SiteImagesCard } from './site-images-card';
import { McpCard } from './mcp-card';
import type { SettingsViewProps } from './settings-types';

/**
 * Ayarlar — dört sekme, konu kartları. Arama ve "Değişenler" süzgeci sekmeden bağımsızdır; açıkken bütün sekmelerden eşleşen
 * satırlar kartlarıyla birlikte çizilir.
 */
export function SettingsDesktop({
  data,
  urlState,
  navPending,
  sections,
  search,
  onTab,
  onSearch,
  onToggleChanged,
  onOpenSetting,
  onNewStaff,
  onOpenStaff,
}: SettingsViewProps) {
  const filtering = search.length > 0 || urlState.changed;
  const changedCount = data.rows.filter((r) => r.changed).length;
  const matchCount = sections.reduce((sum, s) => sum + s.rows.length, 0);

  return (
    // Zemin `bg-ops-card`: çizilmezse kabuğun beji görünür ve iskeletle ayrışır.
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Ayarlar"
        subtitle={`${data.rows.length} parametre · ${data.staff.length} personel`}
        search={{ value: search, onChange: onSearch, placeholder: 'Ayar ara…' }}
      />

      <Tabs
        items={[
          ...SETTING_TABS.map((t) => ({ key: t.key, label: t.label, count: data.rows.filter((r) => sectionTab(r.section) === t.key).length })),
          { key: 'setup' as const, label: 'Kurulum' },
        ]}
        active={urlState.tab}
        onSelect={onTab}
        action={
          // Değişen ayar yoksa çip tıklanmaz ama durur: "0" da bir bilgidir, hiçbir eşiğin elle değiştirilmediğini söyler.
          <Chip active={urlState.changed} onClick={changedCount > 0 || urlState.changed ? onToggleChanged : undefined}>
            Değişenler
            <span className="font-ops-mono text-ops-micro font-medium">{changedCount}</span>
          </Chip>
        }
      />

      <div
        aria-busy={navPending || undefined}
        className={['min-h-0 flex-1 overflow-y-auto px-6 py-4', navPending ? 'pointer-events-none opacity-60' : ''].join(' ')}
      >
        {filtering ? (
          <>
            <p className="mb-3 font-ops-body text-ops-xs text-ops-muted">{filterNote(search, urlState.changed, matchCount)}</p>
            {matchCount === 0 ? (
              <EmptyState
                title={search ? 'Bu aramaya uyan ayar yok' : 'Varsayılandan farklı ayar yok'}
                description={search ? 'Ayarlar adlarına ve açıklamalarına göre aranır; iç anahtar adları aranmaz.' : undefined}
              />
            ) : (
              <SectionGrid sections={sections} flat onOpen={onOpenSetting} />
            )}
          </>
        ) : urlState.tab === 'setup' ? (
          data.setup ? (
            <CardGrid>
              <GridCell>
                <StaffCard staff={data.staff} onNew={onNewStaff} onOpen={onOpenStaff} />
              </GridCell>
              <GridCell>
                <McpCard data={data.setup.mcp} />
              </GridCell>
              <GridCell wide>
                <SiteImagesCard images={data.setup.siteImages} />
              </GridCell>
            </CardGrid>
          ) : null
        ) : (
          <SectionGrid sections={sections} flat={false} onOpen={onOpenSetting} />
        )}
      </div>
    </div>
  );
}

function filterNote(search: string, changedOnly: boolean, count: number): string {
  if (search && changedOnly) return `Varsayılandan farklı ayarlarda “${search}” için ${count} sonuç — süzgeç bütün sekmelerde çalışır.`;
  if (search) return `“${search}” için ${count} ayar — arama bütün sekmelerde çalışır.`;
  return `Varsayılandan farklı ${count} ayar — süzgeç bütün sekmelerde çalışır.`;
}
