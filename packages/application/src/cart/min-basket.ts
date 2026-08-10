import type { SettingsService } from '@lezzet/database';
import type { DeliveryType, SettingScopeContext } from '@lezzet/types';
import { MIN_BASKET_DEFAULT, MIN_BASKET_KEY } from './settings-keys';

/**
 * **Asgari sepet, TESLİMAT YOLUNA göre** (kullanıcı kararı 10.08) — sepetin ve checkout'un ortak
 * kapısı. İki yerde ayrı yazılsaydı sepette yazan sayı ile kasada uygulanan sayı bir gün ayrışırdı.
 *
 * ── KURAL ───────────────────────────────────────────────────────────────────
 * **Kargoyla gidecek siparişin asgari sepeti YOKTUR.** Alt sınır bir LOJİSTİK tabandır: aracın o
 * tura çıkması anlamlı olsun diye konur. Kargoda araç çıkmaz — taşıyıcı gider ve ücretini müşteri
 * zaten öder; küçük siparişin ekonomik freni de zaten oradadır (ücretsiz kargo eşiğinin altında
 * ücret doğar). Aynı sepete iki fren koymak, müşteriden iki kez istemektir.
 *
 * **Kanal şartı bunun İSTİSNASI ve her yolda geçerli** (kullanıcı kararı 10.08): `channel: b2b`
 * satırı toptan fiyat vermenin karşılığıdır — ticari bir şarttır, mesafeyle ilgisi yoktur. Toptancı
 * kargoyla alsa da o şartı doldurur.
 *
 * ── NEDEN KAPSAM DÜŞÜRMEK YETMİYORDU ────────────────────────────────────────
 * Kargo siparişinde `zoneId` zaten `null` geçiliyor (`checkout-snapshot`), yani bölge satırı
 * konuşmuyordu. Ama **küresel satır her zaman eşleşir**: operatör küresel bir eşik yazdığı gün
 * kargo siparişleri sessizce ona takılırdı — kimsenin vermediği bir karar, kimsenin bakmadığı bir
 * yerde. `only: ['channel']` bunu yapısal olarak imkânsız kılıyor: kargo yolunda okunan tek satır
 * kanalın kendisidir, ötekiler hiç sayılmaz.
 *
 * Bu sayede lojistik taban artık **küresel satıra** yazılabiliyor (bölge bölge tekrarlanmadan) ve
 * bölge satırı yalnız gerçekten farklı bir tur için gerekiyor.
 *
 * Kargo yolunda varsayılan **0**: ayar hiç yoksa alt sınır da yok. `MIN_BASKET_DEFAULT` yalnız
 * kapıya teslim yolunun varsayılanıdır — kargoya taşınsaydı kuralın kendisi varsayılan üzerinden
 * delinirdi.
 */
export function minBasketFor(
  settings: SettingsService,
  deliveryType: DeliveryType,
  scope: SettingScopeContext,
): Promise<number> {
  if (deliveryType === 'shipping') return settings.getNumber(MIN_BASKET_KEY, 0, scope, { only: ['channel'] });
  return settings.getNumber(MIN_BASKET_KEY, MIN_BASKET_DEFAULT, scope);
}
