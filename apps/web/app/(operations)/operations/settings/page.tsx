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
import { parseSettingsUrl } from './settings-url';
import type { SettingsData } from './settings-types';

// Ayarlar & kullanıcı/rol (09.16) — sistemin parametrelerinin ve kimin neyi göreceğinin tek yeri.
//
// ── KAPI: YALNIZ YÖNETİCİ ────────────────────────────────────────────────────
// Depo ve kurye bu ekranı hiç görmez (`admin-ayarlar.md §6`). Nav girişi de yalnız yöneticide çıkar
// ama o bir görgü kuralıdır; kapı burada.
//
// ── DEPO BAĞLAMI BU SAYFAYI DARALTMAZ ────────────────────────────────────────
// Ayar sistem-genelidir. Depo kapsamlı ayar bugün YOK ve bilerek: `0016`'nın enum'unda `warehouse`
// var ama `packages/types` şemasında yok — ekran o ekseni hiç sunmuyor (`settings-catalog.ts`).
//
// ── OKUMA: SÖZLÜK KADAR SORGU ────────────────────────────────────────────────
// `SettingsService` "tüm ayarları getir" diye bir uç sunmuyor (`getAll` korumalı), o yüzden okuma
// sözlükteki anahtar başına tek sorguya (`listByKey`) dağılıyor. Küme sabit ve küçük — sözlük
// operatörün elle büyütemediği bir listedir, veriyle büyümez (`CLAUDE.md §1`). Tek turluk bir uç
// arka uç şeridinden istendi (`operasyon-ekranlari-arka-uc-talebi.md §7`); inince burası tek satır olur.

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

  const [settings, staff, zones, warehouses, accounts, siteImages, mcp] = await Promise.all([
    readAllSettings(new SettingsService(db)),
    readStaff(new UserProfileService(db)),
    new DeliveryZoneService(db).list(),
    new WarehouseService(db).list(),
    // TÜM hesaplar (pasifler dahil): ad sözlüğü kapatılmış bir hesabın adını da bilmeli — ayar
    // bugün ona işaret ediyorsa ekran ham uuid göstermemeli. Seçenek listesi ayrı ve dar.
    new AccountService(db).list(),
    // Vitrin görselleri sekmesi TEK sorgu (`bySlot`) — dört slot da aynı ekranda; sekme açık
    // olmasa bile okunuyor çünkü sekme rozeti dolu slot sayısını yazıyor.
    readSiteImages(),
    // MCP anahtarları + son çağrılar (22.4) — sekme rozeti geçerli anahtar sayısını yazıyor,
    // yani sekme kapalıyken de okunmalı (vitrin görselleriyle aynı gerekçe).
    readMcpPanel(),
  ]);

  const { rows } = toSettingRows({ settings, zones, accounts });

  const data: SettingsData = {
    rows,
    staff: toStaffRows(staff, warehouses),
    // İstisna hedefleri YALNIZ aktif depolardan: kapalı bir tesise ayar yazmak, hiç okunmayacak
    // bir kural yazmaktır. Ad sözlüğü ayrı (`toSettingRows`) ve tam listeden — kapalı bir depoya
    // yazılmış eski bir istisna adıyla görünmeli ki kaldırılabilsin.
    scopeOptions: toScopeOptions(zones, warehouses.filter((w) => w.isActive)),
    // Kapsam seçimi YALNIZ aktif depolardan: kapalı bir tesise personel bağlamak, kişiye
    // göremeyeceği bir kapsam vermektir.
    warehouseOptions: warehouses.filter((w) => w.isActive).map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
    // Seçenekler YALNIZ aktif hesaplardan (gerekçe `settings-types.ts`); ad sözlüğü ise
    // yukarıdaki tam listeden — kapalı bir hesap seçilemez ama seçilmişse adıyla görünür.
    accountOptions: accounts.filter((a) => a.isActive).map((a) => ({ value: a.id, label: a.name })),
    propagationSeconds: Math.round(SETTINGS_CACHE_TTL_MS / 1000),
    siteImages,
    mcp,
  };

  return <SettingsClient data={data} urlState={urlState} />;
}

/** Sözlükteki her anahtarın TÜM kapsam satırları — genel değer + istisnalar tek listede. */
async function readAllSettings(svc: SettingsService): Promise<Setting[]> {
  const lists = await Promise.all(SETTING_CATALOG.map((def) => svc.listByKey(def.key)));
  return lists.flat();
}
