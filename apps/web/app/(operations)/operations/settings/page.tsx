import {
  AccountService,
  DeliveryZoneService,
  SettingsService,
  UserProfileService,
  WarehouseService,
  serviceDb,
  SETTINGS_CACHE_TTL_MS,
} from '@lezzet/database';
import type { Setting } from '@lezzet/types';
import { guarded, requireAdmin } from '@/lib/guard';
import { readStaff } from '@/lib/staff';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { SettingsClient } from './settings-client';
import { SETTING_CATALOG } from './settings-catalog';
import { toScopeOptions, toSettingRows, toStaffRows } from './settings-read';
import { readSiteImages } from './site-images-read';
import { readMcpPanel } from './mcp-read';
import { readRegisterPanel } from './register-read';
import { readPennylanePanel } from './pennylane-read';
import { parseSettingsUrl } from './settings-url';
import type { SettingsData, SetupData } from './settings-types';

// Ayarlar & kullanıcı/rol: sistem parametrelerinin ve kimin neyi göreceğinin tek yeri. Kapı yalnız yönetici; menü girişinin
// gizlenmesi bir görgü kuralıdır, kapı burada.

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Ayarlar"
        reason="Sistem parametreleri ve rol atamaları yönetime kapalıdır. Bir eşiğin değişmesi gerekiyorsa yöneticiye bildirin — hangi ekranı etkilediğini de yazın."
      />
    );
  }

  const urlState = parseSettingsUrl(await searchParams);
  const db = serviceDb();

  const [settings, staff, zones, warehouses, accounts, setup] = await Promise.all([
    readAllSettings(new SettingsService(db)),
    readStaff(new UserProfileService(db)),
    new DeliveryZoneService(db).list(),
    new WarehouseService(db).list(),
    // Pasif hesaplar dahil: ayar kapatılmış bir hesabı gösteriyorsa ekran ham uuid değil adını yazmalı.
    new AccountService(db).list(),
    // Kurulum kartları yalnız Kurulum sekmesinde çizilir; öteki sekmeler onları okumaz.
    urlState.tab === 'setup' ? readSetup() : Promise.resolve(null),
  ]);

  const { rows } = toSettingRows({ settings, zones, accounts, warehouses });

  const data: SettingsData = {
    rows,
    staff: toStaffRows(staff, warehouses),
    // İstisna hedefleri yalnız aktif depolardan: kapalı bir tesise yazılan ayar hiç okunmaz.
    scopeOptions: toScopeOptions(zones, warehouses.filter((w) => w.isActive)),
    // Araçlar da burada, çünkü kuryenin aracı kapsamından bulunur; elense kurye araç stoğunu göremezdi.
    warehouseOptions: warehouses.filter((w) => w.isActive).map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
    accountOptions: accounts.filter((a) => a.isActive).map((a) => ({ value: a.id, label: a.name })),
    propagationSeconds: Math.round(SETTINGS_CACHE_TTL_MS / 1000),
    setup,
  };

  return <SettingsClient data={data} urlState={urlState} />;
}

/** Sözlükteki her anahtarın bütün kapsam satırları; `SettingsService` toplu okuma ucu sunmadığı için anahtar başına bir sorgu. */
async function readAllSettings(svc: SettingsService): Promise<Setting[]> {
  const lists = await Promise.all(SETTING_CATALOG.map((def) => svc.listByKey(def.key)));
  return lists.flat();
}

async function readSetup(): Promise<SetupData> {
  const [siteImages, mcp, register, pennylane] = await Promise.all([
    readSiteImages(),
    readMcpPanel(),
    readRegisterPanel(),
    readPennylanePanel(),
  ]);
  return { siteImages, mcp, register, pennylane };
}
