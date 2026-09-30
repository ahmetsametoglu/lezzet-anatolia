'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { SettingDialog } from './setting-dialog';
import { SettingsDesktop } from './settings.desktop';
import { StaffDialog } from './staff-dialog';
import { filterSettingRows } from './settings-read';
import { isSettingGroup, settingsUrl, type SettingsTab, type SettingsUrlState } from './settings-url';
import type { SettingRowView, SettingsData, StaffRowView } from './settings-types';

// Ayarlar ekranının client kökü; sekme ve arama gerçek gezinmedir (`?tab=…&q=…`), çünkü bir ayarın adresi paylaşılabilir olmalı.
// Süzme istemcide yapılır: küme sözlük kadar ve veriyle büyümez.

interface SettingsClientProps {
  data: SettingsData;
  urlState: SettingsUrlState;
}

/** Personel penceresinin üç hâli: kapalı · yeni · düzenlenen kişi. */
type StaffState = 'closed' | 'new' | string;

export function SettingsClient({ data, urlState }: SettingsClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [staffState, setStaffState] = useState<StaffState>('closed');

  const editing = editingKey ? (data.rows.find((r) => r.key === editingKey) ?? null) : null;
  const editingStaff = staffState === 'closed' || staffState === 'new' ? null : (data.staff.find((s) => s.id === staffState) ?? null);

  const go = (patch: Partial<SettingsUrlState>) => {
    startNav(() => router.replace(settingsUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // Kutu anında, adres gecikmeli yazılır (`useSearchDraft`): her tuşta `router.replace` anahtar başına sorgu atan bir RSC okuması
  // olurdu. Süzgeç taslaktan okunur, çünkü satırlar zaten elde.
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
      <SettingsDesktop {...view} />

      {editing ? (
        <SettingDialog
          key={editing.key}
          row={editing}
          scopeOptions={data.scopeOptions}
          accountOptions={data.accountOptions}
          propagationSeconds={data.propagationSeconds}
          onClose={() => setEditingKey(null)}
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
