import { toCents, fromCents } from '@lezzet/helper';
import type { UserRole } from '@lezzet/types';
import { money, num } from '@/components/operation/ui/format';
import type { SettingDef, SettingValue } from './settings-catalog';
import type { ExceptionScope } from './settings-types';

/**
 * Ayar değerinin OKUNAN ve YAZILAN hâli (09.16) — saf, testli.
 *
 * Tür bilgisi sözlükte (`SettingDef.kind`); burada o türün iki yönü var: `formatSettingValue`
 * değeri operatörün diline çevirir, `parseSettingValue` operatörün yazdığını değere çevirir ve
 * **sınırı burada uygular.** İkisi yan yana duruyor çünkü aynı sözleşmenin iki ucu: biri "%25"
 * yazarken öteki "%25"i 25 diye okumak zorunda.
 *
 * Sınır denetimi ekranda DEĞİL burada: aynı fonksiyonu server action da çağırıyor. İstemcide
 * yazılmış bir kontrol, doğrudan çağrılan bir eylemde hiç koşmaz.
 */

const CHANNEL_LABELS: Record<string, string> = { b2b: 'B2B (toptan)', b2c: 'B2C (perakende)' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SCOPE_AXIS_LABELS: Record<ExceptionScope, string> = {
  channel: 'Kanal',
  country: 'Ülke',
  zone: 'Bölge',
  warehouse: 'Depo',
};

export const STAFF_ROLE_LABELS: Record<Exclude<UserRole, 'customer'>, string> = {
  admin: 'Yönetici',
  warehouse: 'Depo sorumlusu',
  courier: 'Kurye',
  accounting: 'Muhasebe',
};

/** Rolün ne GÖRDÜĞÜ sabittir — pencere bunu yazar ki atama bir tahmin olmasın (`admin-ayarlar.md §6`). */
export const STAFF_ROLE_HELP: Record<Exclude<UserRole, 'customer'>, string> = {
  admin: 'Her ekranı görür; ayarları ve kullanıcıları yönetir.',
  warehouse: 'Stok, mal kabul, hazırlık ve transferi görür. Fiyat ve marj görmez.',
  courier: 'Yalnız kendi teslimatını görür; müşteri listesine ve fiyata erişmez.',
  accounting: 'Para, tedarikçi borcu ve tahsilatı görür. Katalog düzenlemez.',
};

/** Kanalın ekrandaki adı — kimliği (`b2b`) değil. */
export function channelLabel(id: string): string {
  return CHANNEL_LABELS[id] ?? id.toLocaleUpperCase('tr');
}

/**
 * Kimlik taşıyan değerlerin AD sözlüğü — `scopeLabel`'daki `names` deseninin aynısı.
 *
 * Ayar tablosunda `door_cash_account_id` bir uuid tutuyor; ekranda "Kasa" yazmalı. Çeviri burada
 * yapılamaz (ad veritabanında), o yüzden dışarıdan gelir. Sözlük verilmezse ya da hesap silinmişse
 * kimliğin kendisi görünür — uydurma bir ad ("Bilinmeyen hesap") operatöre yanlış bir şeyin
 * düzeldiğini düşündürürdü; ham kimlik en azından aranabilir.
 */
interface SettingValueNames {
  accounts?: ReadonlyMap<string, string>;
}

/** Değerin operatöre gösterilen hâli. */
export function formatSettingValue(def: SettingDef, value: SettingValue, names: SettingValueNames = {}): string {
  switch (def.kind) {
    case 'account': {
      const id = String(value ?? '').trim();
      if (!id) return '— seçilmedi';
      return names.accounts?.get(id) ?? id;
    }
    case 'money':
      return money(asNumber(value));
    case 'percent':
      return `%${num(asNumber(value))}`;
    case 'integer':
      return def.unit ? `${num(asNumber(value))} ${def.unit}` : num(asNumber(value));
    case 'time':
      return String(value);
    case 'boolean':
      return value ? 'Açık' : 'Kapalı';
    case 'channelFlags': {
      const flags = (value ?? {}) as Record<string, boolean>;
      const on = Object.keys(flags).filter((k) => flags[k]);
      // Hiçbiri açık değilken "—" değil TAM cümle: boş bir tire, ayarın hiç kurulmadığını da
      // "hepsi kapalı"yı da anlatır; ikisi aynı şey değil.
      return on.length === 0 ? 'Hiçbir kanalda istenmiyor' : on.map(channelLabel).join(' · ');
    }
    case 'text':
      return String(value || '').trim() || '— tanımsız';
  }
}

/** Düzenleme kutusuna yazılacak başlangıç metni — para/yüzde kutuları SAYI ister. */
export function toEditableNumber(def: SettingDef, value: SettingValue): number | null {
  if (def.kind === 'money') return fromCents(asNumber(value));
  if (def.kind === 'percent' || def.kind === 'integer') return asNumber(value);
  return null;
}

type ParseResult = { ok: true; value: SettingValue } | { ok: false; error: string };

/**
 * Operatörün yazdığını değere çevirir; sınır ihlalini ANLAŞILIR cümleyle reddeder.
 *
 * Sınırın sebebi (`limitReason`) cümleye katılır: "30 dakikanın altına inemez" bir kural bildirir,
 * "ödeme sağlayıcısının oturum asgarisi 30 dakika" ise **neden** olduğunu söyler — ikincisini okuyan
 * kişi kuralı bir daha zorlamaz.
 */
export function parseSettingValue(def: SettingDef, raw: string | boolean | Record<string, boolean>): ParseResult {
  if (def.kind === 'boolean') return { ok: true, value: Boolean(raw) };

  if (def.kind === 'channelFlags') {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Kanal bayrakları beklenirken başka bir değer geldi.' };
    return { ok: true, value: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Boolean(v)])) };
  }

  if (typeof raw !== 'string') return { ok: false, error: 'Metin bir değer bekleniyordu.' };
  const text = raw.trim();

  if (def.kind === 'text') return { ok: true, value: text };

  /**
   * Hesap seçimi. Biçim BURADA elenir, VARLIK burada elenemez — hangi hesapların var olduğunu bu
   * saf fonksiyon bilmez. Varlık kontrolü kapıda (`saveSettingAction`), çünkü ekran bir seçici
   * sunsa da action doğrudan çağrılabilir ve o zaman uydurma bir uuid ayara yazılırdı: kapı önü
   * satış sessizce olmayan bir hesaba para yazmaya başlardı.
   */
  if (def.kind === 'account') {
    if (!UUID.test(text)) return { ok: false, error: 'Listeden bir hesap seçin.' };
    return { ok: true, value: text };
  }

  if (def.kind === 'time') {
    // Saat 24 saatlik ve iki haneli: "9:5" gibi bir yazım veride sıralanamaz ve karşılaştırılamaz.
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return { ok: false, error: 'Saat SS:DD biçiminde olmalı (örnek: 16:00).' };
    return { ok: true, value: text };
  }

  const parsed = Number(text.replace(/\s/g, '').replace(',', '.'));
  if (text === '' || !Number.isFinite(parsed)) return { ok: false, error: 'Sayısal bir değer girin.' };

  const value = def.kind === 'money' ? toCents(parsed) : Math.round(parsed);
  const check = checkBounds(def, value);
  return check ? { ok: false, error: check } : { ok: true, value };
}

/** Sınır ihlali cümlesi; sınır içindeyse `null`. */
export function checkBounds(def: SettingDef, value: number): string | null {
  const show = (n: number): string => (def.kind === 'money' ? money(n) : def.kind === 'percent' ? `%${n}` : `${n}${def.unit ? ` ${def.unit}` : ''}`);
  const because = def.limitReason ? ` ${def.limitReason}` : '';
  if (def.min !== undefined && value < def.min) return `${show(def.min)} altına inemez.${because}`;
  if (def.max !== undefined && value > def.max) return `${show(def.max)} üstüne çıkamaz.${because}`;
  return null;
}

/** Kapsam satırının ekseni + hedefi: "Kanal: B2B (toptan)". */
export function scopeLabel(
  scope: ExceptionScope,
  scopeId: string,
  names: { zones: Map<string, string>; warehouses?: Map<string, string> },
): string {
  if (scope === 'channel') return `${SCOPE_AXIS_LABELS.channel}: ${channelLabel(scopeId)}`;
  if (scope === 'country') return `${SCOPE_AXIS_LABELS.country}: ${scopeId}`;
  // Kapatılmış ya da silinmiş bir deponun istisnası ortada kalabilir — bölgede olduğu gibi kimliği
  // GÖSTERİRİZ, satırı gizlemeyiz: görünmeyen bir istisna kaldırılamaz ve sessizce okunmaya devam eder.
  if (scope === 'warehouse') return `${SCOPE_AXIS_LABELS.warehouse}: ${names.warehouses?.get(scopeId) ?? 'bilinmeyen depo'}`;
  // Silinmiş bir bölgenin istisnası ortada kalabilir: kimliği gösteririz, sessizce gizlemeyiz.
  return `${SCOPE_AXIS_LABELS.zone}: ${names.zones.get(scopeId) ?? 'bilinmeyen bölge'}`;
}

function asNumber(value: SettingValue): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
