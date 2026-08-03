'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { SettingDialog } from './setting-dialog';
import { SettingsDesktop } from './settings.desktop';
import { SettingsMobile } from './settings.mobile';
import { StaffDialog } from './staff-dialog';
import { filterSettingRows } from './settings-read';
import { isSettingGroup, settingsUrl, type SettingsTab, type SettingsUrlState } from './settings-url';
import type { SettingRowView, SettingsData, StaffRowView } from './settings-types';

// Ayarlar ekranı client kökü (Sapma 3): durum burada, sunum web/mobil olarak çatallanır.
//
// SEKME ve ARAMA gerçek gezinmedir (`?tab=…&q=…`): bir ayarın adresi paylaşılabilir olmalı
// ("kesim saatini şuradan değiştir"). Süzme İSTEMCİDE yapılıyor çünkü küme sözlük kadar — sabit,
// küçük ve veriyle büyümeyen bir liste; sunucuya tur atmak gecikmeden başka bir şey getirmezdi.

interface SettingsClientProps {
  data: SettingsData;
  device: Device;
  urlState: SettingsUrlState;
}

/** Personel penceresinin üç hâli: kapalı · yeni · düzenlenen kişi. */
type StaffState = 'closed' | 'new' | string;

export function SettingsClient({ data, device, urlState }: SettingsClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [staffState, setStaffState] = useState<StaffState>('closed');

  const editing = editingKey ? (data.rows.find((r) => r.key === editingKey) ?? null) : null;
  const editingStaff = staffState === 'closed' || staffState === 'new' ? null : (data.staff.find((s) => s.id === staffState) ?? null);

  const go = (patch: Partial<SettingsUrlState>) => {
    startNav(() => router.replace(settingsUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // Arama: kutu anında yazar, adres GECİKMELİ — mekanizma ortak (`useSearchDraft`).
  //
  // Süzme İSTEMCİDE (küme sözlük kadar: sabit, küçük, veriyle büyümez) ama adres yine de yazılıyor,
  // çünkü bir ayarın bağlantısı paylaşılabilir olmalı. Gecikme o yazımın bedeli için: her tuşta
  // `router.replace` bir RSC okuması demek ve bu ekranda okuma anahtar başına sorgu atıyor.
  //
  // Süzgeç TASLAKTAN okunuyor, adresten değil: liste elde duran satırlarda süzülüyor, sonucu
  // beklemenin karşılığı yok. Adres arkadan yetişir.
  const { draft: search, onDraft: onSearch } = useSearchDraft(urlState.q, (q) => go({ q }));

  // Arama TÜM ayarlarda çalışır, yalnız açık sekmede değil: "minimum sepet nerede" sorusunun cevabı
  // sekmeyi bilmeyi gerektirmemeli (`admin-ayarlar.md §7`: ayar sayısı fazla, bulma işlevsel ihtiyaç).
  const groupRows = isSettingGroup(urlState.tab) ? data.rows.filter((r) => r.group === urlState.tab) : [];
  const visibleRows = search ? filterSettingRows(data.rows, search) : groupRows;

  const view = {
    data,
    urlState,
    navPending,
    rows: visibleRows,
    search,
    onTab: (tab: SettingsTab) => go({ tab }),
    onSearch,
    onOpenSetting: (row: SettingRowView) => setEditingKey(row.key),
    onNewStaff: () => setStaffState('new'),
    onOpenStaff: (row: StaffRowView) => setStaffState(row.id),
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <SettingsMobile {...view} /> : <SettingsDesktop {...view} />}

      {editing ? (
        <SettingDialog
          key={editing.key}
          row={editing}
          scopeOptions={data.scopeOptions}
          accountOptions={data.accountOptions}
          propagationSeconds={data.propagationSeconds}
          onClose={() => setEditingKey(null)}
          // Pencere AÇIK kalır ve veri tazelenir: bir istisna kaldırıldıktan sonra ikincisini de
          // kaldırmak olağan, pencereyi kapatmak operatörü aynı yere iki kez götürürdü.
          onSaved={() => {
            router.refresh();
            setEditingKey(null);
          }}
        />
      ) : null}

      {staffState !== 'closed' ? (
        <StaffDialog
          key={staffState}
          editing={editingStaff}
          warehouseOptions={data.warehouseOptions}
          onClose={() => setStaffState('closed')}
          onSaved={() => {
            setStaffState('closed');
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
