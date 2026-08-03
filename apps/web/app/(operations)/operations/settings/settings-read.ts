import { isStaff, isOperationRole } from '@lezzet/domain-core';
import type { Setting, UserProfile, UserRole } from '@lezzet/types';
import { COUNTRY_OPTIONS } from '@/components/operation/ui/labels';
import { SETTING_CATALOG, type SettingValue } from './settings-catalog';
import { formatSettingValue, scopeLabel, STAFF_ROLE_LABELS } from './settings-labels';
import type { ExceptionScope, ScopeOptions, SettingExceptionView, SettingRowView, SettingsReadInput, StaffRowView } from './settings-types';

/**
 * Ayarlar ekranının okuma katmanı (09.16) — DB satırları + sözlük → görünüm. Saf: girdi verilir,
 * çıktı alınır; testi bu yüzden DB'siz koşar.
 *
 * **Sözlük LİSTEYİ belirler, tablo değil.** Ekran katalogdaki her ayarı gösterir; tabloda satırı
 * olmayan ayar da görünür ("hiç yazılmamış, kod varsayılanıyla çalışıyor"). Tersi olsaydı — listeyi
 * tablodan üretseydik — hiç yazılmamış bir ayar ekranda YOK görünürdü, oysa sistemde çalışan bir
 * değeri var. Görünmeyen bir değer değiştirilemez.
 *
 * **Bunun bilinen bedeli:** sözlükte karşılığı olmayan bir satır (elle açılmış bir anahtar) bu
 * ekranda hiç görünmez. Okuma zaten anahtar başına yapıldığı için (`page.tsx`) böyle bir satır
 * getirilmiyor da. Kapanması "tüm ayarları getir" ucuna bağlı — arka uç şeridinden istendi
 * (`operasyon-ekranlari-arka-uc-talebi.md §7`). Sessiz bir eksik değil, yazılı bir eksik.
 */

/**
 * `accounts` İSTEĞE BAĞLI ve bu bilinçli: verilmezse kimlik taşıyan değer ham uuid olarak görünür
 * (`formatSettingValue` künyesi — uydurma bir ad, yanlış bir şeyin düzeldiğini düşündürürdü).
 * Sayfa onu daima veriyor; gevşeklik yalnız bu saf fonksiyonun kendi başına sınanabilmesi için.
 */
export function toSettingRows(
  input: Pick<SettingsReadInput, 'settings' | 'zones'> & Partial<Pick<SettingsReadInput, 'accounts' | 'warehouses'>>,
): { rows: SettingRowView[] } {
  const zoneNames = new Map(input.zones.map((z) => [z.id, z.name]));
  // Ad sözlüğü TÜM depolardan (aktif süzgeci YOK): kapalı bir depoya yazılmış eski bir istisna
  // adıyla görünmeli — görünmeyen bir istisna kaldırılamaz ve sessizce okunmaya devam eder.
  const warehouseNames = new Map((input.warehouses ?? []).map((w) => [w.id, `${w.code} · ${w.name}`]));
  // Kimlik taşıyan değerlerin ad sözlüğü — `door_cash_account_id` uuid tutuyor, ekranda "Kasa" yazar.
  const names = { accounts: new Map((input.accounts ?? []).map((a) => [a.id, a.name])) };
  const byKey = new Map<string, Setting[]>();
  for (const row of input.settings) {
    const list = byKey.get(row.key);
    if (list) list.push(row);
    else byKey.set(row.key, [row]);
  }

  const rows = SETTING_CATALOG.map((def) => {
    const all = byKey.get(def.key) ?? [];
    const global = all.find((r) => r.scopeType === 'global') ?? null;
    // Fabrika değeri OLMAYAN ayarda satır da yoksa geriye düşülecek bir şey yok: boş dize
    // "seçilmedi" diye okunur (`formatSettingValue`). Uydurma bir kimlik koymak, olmayan bir
    // hesabı seçilmiş göstermek olurdu.
    const value = (global ? (global.value as SettingValue) : def.fallback) ?? def.fallback ?? '';

    const exceptions: SettingExceptionView[] = all
      .filter((r) => r.scopeType !== 'global' && r.scopeId)
      .map((r) => ({
        id: r.id,
        scopeType: r.scopeType as ExceptionScope,
        scopeId: r.scopeId!,
        scopeLabel: scopeLabel(r.scopeType as ExceptionScope, r.scopeId!, { zones: zoneNames, warehouses: warehouseNames }),
        display: formatSettingValue(def, r.value as SettingValue, names),
      }))
      .sort((a, b) => a.scopeLabel.localeCompare(b.scopeLabel, 'tr'));

    return {
      ...def,
      exceptionScopes: def.exceptionScopes,
      value,
      display: formatSettingValue(def, value, names),
      // Fabrika değeri yoksa gösterilecek bir "varsayılan" da yok — ekran o satırda "Varsayılana
      // dön" sunmaz ve `null` bunu tek bakışta söyler (boş dize "varsayılan boşmuş" diye okunurdu).
      fallbackDisplay: def.fallback === undefined ? null : formatSettingValue(def, def.fallback, names),
      // "Değiştirilmiş" ancak KARŞILAŞTIRILACAK bir şey varken anlamlı. Fabrika değeri olmayan
      // ayarda her değer kurulumun kendi seçimidir; onu "varsayılandan farklı" diye işaretlemek,
      // olmayan bir normalden sapma uydurmak olurdu.
      changed: def.fallback !== undefined && !sameValue(value, def.fallback),
      rowId: global?.id ?? null,
      updatedAt: global?.updatedAt ?? null,
      exceptions,
    } satisfies SettingRowView;
  });

  return { rows };
}

/** Arama: ad ve açıklamada geçer — anahtarda DEĞİL (iç ad arayüzde yok, aranması da beklenmez). */
export function filterSettingRows(rows: SettingRowView[], term: string): SettingRowView[] {
  const q = term.trim().toLocaleLowerCase('tr');
  if (!q) return rows;
  return rows.filter((r) => `${r.label} ${r.help}`.toLocaleLowerCase('tr').includes(q));
}

/**
 * Personel listesi — operasyon rolü taşıyan profiller.
 *
 * Rol kümesi boş bırakılamadığı için (DB kısıtı) **pasifleştirme = operasyon rollerini kaldırmak**,
 * kişi `customer`a düşer (`domain-core/identity/roles.withoutRole`). O yüzden bu liste yalnız
 * GÖREVDEKİ personeli gösterir: eski personel burada değil, müşteri kaydında yaşamaya devam eder.
 * Tasarım listede "Pasif" satırı istiyordu; veri modelinde personel-aktiflik ekseni yok — sapma
 * `design/BACKLOG.md`'ye ve arka uç talebine yazıldı.
 */
export function toStaffRows(staff: UserProfile[], warehouses: SettingsReadInput['warehouses']): StaffRowView[] {
  const codes = new Map(warehouses.map((w) => [w.id, w.code]));
  return staff
    .filter((p) => isStaff(p.roles))
    .map((p) => {
      const roles = p.roles.filter(isOperationRole);
      return {
        id: p.id,
        name: p.name || '(adsız kayıt)',
        contact: p.email ?? p.phone ?? '—',
        email: p.email,
        phone: p.phone,
        roles,
        roleLabels: roles.map((r) => STAFF_ROLE_LABELS[r as Exclude<UserRole, 'customer'>]),
        initials: initialsOf(p.name),
        warehouseIds: p.warehouseIds,
        scopeText: scopeTextOf(roles, p.warehouseIds, codes),
        canSignIn: p.authUserId !== null,
      } satisfies StaffRowView;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/** İstisna eksenlerinin seçenekleri — kanal sabit, ülke ortak sözlükten, bölge veriden. */
export function toScopeOptions(
  zones: SettingsReadInput['zones'],
  warehouses: SettingsReadInput['warehouses'] = [],
): ScopeOptions {
  return {
    channel: [
      { value: 'b2b', label: 'B2B (toptan)' },
      { value: 'b2c', label: 'B2C (perakende)' },
    ],
    country: COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
    zone: zones.map((z) => ({ value: z.id, label: z.name })).sort((a, b) => a.label.localeCompare(b.label, 'tr')),
    // Kod ÖNDE (`STR · Strasbourg`): depo listesi operatörün kısaltmayla tanıdığı bir küme ve
    // ekranın geri kalanı da onu böyle yazıyor (`warehouseOptions`, depo süzgeci).
    warehouse: warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` })),
  };
}

/**
 * Depo kapsamı özeti. **Boş kapsam "hepsi" DEĞİL, hiçbiri** (`user_profiles.warehouse_ids` künyesi):
 * depocu/kurye kapsamsız kalırsa kapı kapanır — ekran bunu uyarı diliyle söyler, yoksa operatör
 * kaydettiği kişinin neden hiçbir şey göremediğini anlamaz.
 */
function scopeTextOf(roles: UserRole[], warehouseIds: string[], codes: Map<string, string>): string {
  const scoped = roles.some((r) => r === 'warehouse' || r === 'courier');
  if (!scoped) return 'depo-üstü';
  if (warehouseIds.length === 0) return 'kapsamsız — hiçbir depoyu göremez';
  return warehouseIds.map((id) => codes.get(id) ?? '?').join(' · ');
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts
    .slice(0, 2)
    .map((w) => w[0]!)
    .join('')
    .toLocaleUpperCase('tr');
}

/** Nesne değerli ayarlar (kanal bayrakları) için de çalışan eşitlik. */
function sameValue(a: SettingValue, b: SettingValue): boolean {
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
