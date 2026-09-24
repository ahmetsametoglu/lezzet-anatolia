import type { CheckoutServicePoint, CheckoutShipping, CheckoutShippingOption } from '@lezzet/types';

/** Seçicinin satırı: nokta ve onu taşıyacak, türünü kabul eden servis (`orderServicePoints`). */
export type ServicePointEntry = { point: CheckoutServicePoint; option: CheckoutShippingOption };

/** Haritanın Google stili; işletme yerleşimleri kapalı, çünkü teslim noktaları da dükkân ve haritanın kendi dükkânlarıyla yarışmamalı. */
export const MAP_STYLE = [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }];

/**
 * Kargo seçiminin ekran hâli: eve teslim ve teslim noktası servisleri, çizilecek tür ve her türün en düşük fiyatı. Masaüstü, telefon
 * görünümü ve native uygulama aynı kuraldan çizer.
 */
export function shippingChoiceView<O extends { needsServicePoint: boolean; priceCents: number }>(
  options: readonly O[],
  requestedMode: 'home' | 'point',
): { home: O[]; point: O[]; hasModes: boolean; mode: 'home' | 'point'; homeFromCents: number | null; pointFromCents: number | null } {
  const home = options.filter((o) => !o.needsServicePoint);
  const point = options.filter((o) => o.needsServicePoint);
  const hasModes = home.length > 0 && point.length > 0;
  // Tek tür varsa seçim sorulmaz: müşterinin istediği değil, var olan tür çizilir.
  const mode = hasModes ? requestedMode : point.length > 0 ? 'point' : 'home';
  const fromCents = (list: readonly O[]) => (list.length > 0 ? Math.min(...list.map((o) => o.priceCents)) : null);
  return { home, point, hasModes, mode, homeFromCents: fromCents(home), pointFromCents: fromCents(point) };
}

/**
 * Ekran nokta istiyor mu: tür, kayıtlı seçim değil ekranın çizdiği türdür, çünkü yalnız nokta servisi kaldıysa kayıtlı seçim `home`
 * olsa da nokta istenir. Eşik üstünde nokta istenmez, seçici çizilmez ve koliyi sunucu eve gönderir.
 */
export function servicePointRequired(
  shipping: { mode: 'customer' | 'auto'; options: readonly { needsServicePoint: boolean; priceCents: number }[] } | null,
  requestedMode: 'home' | 'point',
): boolean {
  if (shipping === null || shipping.mode === 'auto') return false;
  return shippingChoiceView(shipping.options, requestedMode).mode === 'point';
}

/**
 * Servis listesi çizilemediğinde söylenecek cümle: taşıyıcıya ulaşılamadıysa geçici, ürün ya da depo verimiz eksikse "gönderilemiyor",
 * teklif geldi ama servis yoksa adresin gerçeği. Masaüstü, telefon görünümü ve native aynı kuraldan okur.
 */
export function shippingNotice(
  shipping: Pick<CheckoutShipping, 'status' | 'unshippable'> | null,
  copy: { unavailable: string; unshippable: string; unshippableOrder: string; none: string },
): string {
  if (shipping === null || shipping.status === 'off' || shipping.status === 'provider_error') return copy.unavailable;
  if (shipping.status === 'ok') return copy.none;
  return shipping.unshippable.length > 0 ? copy.unshippable.replace('{products}', shipping.unshippable.join(', ')) : copy.unshippableOrder;
}

/**
 * Taşıyıcı renkleri, fiyat sırasıyla: web ve native aynı müşteri token'larını çizer, tonca uzak seçildi ki yan yana noktalar
 * karışmasın. Zeytin seçili nokta, mürekkep adres için ayrıldığından listede yok.
 */
export const CARRIER_TONES = ['brand-google', 'terracotta', 'star', 'olive-light'] as const;
export type CarrierTone = (typeof CARRIER_TONES)[number];

/** Haritanın taşıyıcıları: her birinin en ucuz nokta servisi, fiyata göre sıralı; lejant ve renk sırası buradan gelir. */
export function pointCarriers<O extends { carrierCode: string; priceCents: number }>(pointOptions: readonly O[]): O[] {
  const byPrice = [...pointOptions].sort((a, b) => a.priceCents - b.priceCents);
  return byPrice.filter((o, i) => byPrice.findIndex((x) => x.carrierCode === o.carrierCode) === i);
}

/** Taşıyıcının renk token'ı; seçici ve seçilen noktanın kartı aynı listeden okur, renk ikisinde de aynı çıkar. */
export function carrierToneOf(pointOptions: readonly { carrierCode: string; priceCents: number }[]): (carrierCode: string) => CarrierTone {
  const tones = new Map(pointCarriers(pointOptions).map((c, i) => [c.carrierCode, CARRIER_TONES[i % CARRIER_TONES.length]!]));
  return (carrierCode) => tones.get(carrierCode) ?? CARRIER_TONES[0];
}

/** "820 m" · "1,4 km"; ondalık ayracı dile göre. */
export function distanceLabel(meters: number, locale: string): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

/**
 * Sağlayıcı nokta adını ve adresini büyük harfle gönderir; kelimelerin yalnız ilk harfi büyük kalır. Küçültme dilden bağımsız, çünkü
 * adlar Fransızca ve Almanca, Türkçe kural "I"yı noktasız ı'ya çevirirdi.
 */
export function pointText(text: string): string {
  return text.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

/** Noktanın tek satır adresi: "Rue Chevreul 61, 69007 Lyon". */
export function pointAddress(point: { street: string; houseNumber: string | null; postalCode: string; city: string }): string {
  return `${pointText([point.street, point.houseNumber].filter(Boolean).join(' '))}, ${point.postalCode} ${pointText(point.city)}`;
}
