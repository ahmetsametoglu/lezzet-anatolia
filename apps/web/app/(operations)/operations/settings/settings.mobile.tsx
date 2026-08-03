'use client';

import { Button } from '@/components/operation/ui/button';
import { PageHeader } from '@/components/operation/ui/page-header';
import { UnderlineTabs } from '@/components/operation/ui/underline-tabs';
import { SETTING_GROUPS } from './settings-catalog';
import { SettingList, StaffRow } from './settings-sections';
import { isSettingGroup } from './settings-url';
import type { SettingsViewProps } from './settings-types';

/**
 * Ayarlar — mobil (09.16).
 *
 * Tasarımın mobil notu tek cümle: *"seyrek ama bazen acil — tek ayarı arayıp değiştirmek hızlı
 * olmalı"* (`admin-ayarlar.md §7`). O yüzden bu dalda **arama önce gelir**: kutu başlığın altında,
 * tam genişlikte ve sekmelerin ÜSTÜNDE. Terim yazıldığı an sekmeler anlamını yitirir (arama tüm
 * bölümlerde çalışır) ve liste doğrudan sonucu gösterir.
 *
 * Sekmeler burada `UnderlineTabs`: yedi sekmelik kaplı bar dar ekranda iki satıra taşıyor ve
 * dikey alanın üçte birini yiyordu — alt-çizgi hâli yatay kaydırılır, kabı yoktur.
 */
export function SettingsMobile({ data, urlState, navPending, rows, search, onTab, onSearch, onOpenSetting, onNewStaff, onOpenStaff }: SettingsViewProps) {
  const searching = search.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader compact title="Ayarlar" search={{ value: search, onChange: onSearch, placeholder: 'Ayar ara…' }} />

      {/* Arama açıkken sekme çizilmez: sonuç zaten bölümler-üstü, altında duran bir sekme barı
          "bu sonuç bu bölümden" diye yanlış okunurdu. */}
      {searching ? null : (
        <div className="overflow-x-auto border-b border-ops-line px-3 py-1.5">
          <UnderlineTabs
            className="w-max"
            items={[...SETTING_GROUPS.map((g) => ({ key: g.key, label: g.label })), { key: 'staff' as const, label: 'Kullanıcı & rol' }]}
            value={urlState.tab}
            onChange={onTab}
          />
        </div>
      )}

      <div
        aria-busy={navPending || undefined}
        className={['min-h-0 flex-1 overflow-y-auto px-3 py-3', navPending ? 'pointer-events-none opacity-60' : ''].join(' ')}
      >
        {isSettingGroup(urlState.tab) || searching ? (
          <SettingList rows={rows} onOpen={onOpenSetting} searching={searching} compact />
        ) : (
          <div className="flex flex-col gap-2">
            <Button variant="dark" size="sm" fullWidth onClick={onNewStaff}>
              + Kullanıcı
            </Button>
            {data.staff.map((s) => (
              <StaffRow key={s.id} row={s} onOpen={onOpenStaff} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
