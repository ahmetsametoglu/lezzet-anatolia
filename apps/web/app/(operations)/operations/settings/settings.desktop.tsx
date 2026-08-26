'use client';

import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { Tabs } from '@/components/operation/ui/tabs';
import { SETTING_GROUPS } from './settings-catalog';
import { SettingList, StaffRow } from './settings-sections';
import { SiteImagesTab } from './site-images-tab';
import { McpTab } from './mcp-tab';
import { isSettingGroup } from './settings-url';
import type { SettingsViewProps } from './settings-types';

/**
 * Ayarlar — web (09.16).
 *
 * Sekme barı ekranın omurgası: altı ayar grubu + kullanıcı/rol. Arama BAŞLIKTA duruyor, sekme
 * barında değil — çünkü kapsamı ekran çapında: yazılan terim tüm gruplarda arar ve bulduğunda
 * hangi grupta olduğu fark etmez (`PageHeader` künyesi: ekran çapındakiler barda, sekmeye bağlı
 * olanlar sekme barında).
 */
export function SettingsDesktop({ data, urlState, navPending, rows, search, onTab, onSearch, onOpenSetting, onNewStaff, onOpenStaff }: SettingsViewProps) {
  const searching = search.length > 0;
  const changed = data.rows.filter((r) => r.changed).length;

  return (
    // `bg-ops-card` — gerekçe `tickets.desktop` künyesinde: zemin çizilmezse kabuğun beji görünür.
    // Bu ekranın `loading.tsx`'i onu zaten taşıyordu, yani iskelet ile gerçek sayfa ayrışıyordu:
    // yüklenirken doğru, yüklendikten sonra yanlış zemin.
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Ayarlar"
        subtitle={`${data.rows.length} parametre · ${changed} tanesi varsayılandan farklı · ${data.staff.length} personel`}
        search={{ value: search, onChange: onSearch, placeholder: 'Ayar ara…' }}
      />

      <Tabs
        items={[
          ...SETTING_GROUPS.map((g) => ({ key: g.key, label: g.label, count: data.rows.filter((r) => r.group === g.key).length })),
          // Sayaç DOLU slotları sayıyor, slot sayısını değil: "4" yazsaydı hiç görsel yüklenmemiş
          // bir kurulumda sekme dolu görünürdü. Boş küme rozetsiz kalır (Tabs'ın kuralı).
          {
            key: 'images' as const,
            label: 'Vitrin görselleri',
            count: data.siteImages.filter((i) => i.id !== null).length,
          },
          { key: 'staff' as const, label: 'Kullanıcı & rol', count: data.staff.length },
          // Sayaç GEÇERLİ anahtarları sayıyor: iptal edilmiş ya da süresi dolmuş bir anahtar
          // listede durur (geçmişi taşır) ama bir bağlantı değildir — rozette sayılması "üç
          // kişi bağlanabiliyor" diye okunurdu.
          {
            key: 'mcp' as const,
            label: 'MCP anahtarları',
            count: data.mcp.keys.filter((k) => k.status === 'active').length,
          },
        ]}
        active={urlState.tab}
        onSelect={onTab}
        action={
          urlState.tab === 'staff' ? (
            <Button variant="dark" size="sm" onClick={onNewStaff}>
              + Kullanıcı
            </Button>
          ) : undefined
        }
      />

      <div
        aria-busy={navPending || undefined}
        className={['min-h-0 flex-1 overflow-y-auto px-6 py-4', navPending ? 'pointer-events-none opacity-60' : ''].join(' ')}
      >
        {searching ? (
          <p className="mb-3 font-ops-body text-ops-xs text-ops-muted">
            “{search}” için {rows.length} ayar — arama tüm bölümlerde çalışır.
          </p>
        ) : null}

        {isSettingGroup(urlState.tab) || searching ? (
          <SettingList rows={rows} onOpen={onOpenSetting} searching={searching} />
        ) : urlState.tab === 'images' ? (
          <SiteImagesTab images={data.siteImages} />
        ) : urlState.tab === 'mcp' ? (
          <McpTab data={data.mcp} />
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="font-ops-body text-ops-xs text-ops-muted">
              Roller sabit kalıptır: depo fiyat görmez, kurye yalnız kendi teslimatını görür. Burada rol atanır, izin detayı icat edilmez.
            </p>
            {data.staff.map((s) => (
              <StaffRow key={s.id} row={s} onOpen={onOpenStaff} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
