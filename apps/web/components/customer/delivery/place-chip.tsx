'use client';

import type { Locale } from '@lezzet/i18n';
import { focusRingClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { Skeleton } from '@/components/customer/ui/skeleton';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

/**
 * K30 · Teslimat Yeri Göstergesi — başlıkta duran kalıcı hap.
 *
 * ── MASAÜSTÜ v1'İN BİREBİR AYNISI (13.09, kullanıcı kararı) ────────────────────
 * Hap her durumda yeşil (`olive-bg` zemin, `olive-edge` çerçeve, iğne `olive-dark`) ve yerin yanında
 * teslim şeklini yazar: "67000 Strasbourg · kapıya teslim" / "· kargoyla". Önce (28.07) hap yalnız
 * yeri söylüyor, teslim şeklini RENKTEN veriyordu (bölge dışında kum rengi); v1 o karardan sonra
 * çizildi ve onun yerine geçti.
 *
 * Tek veri farkı: v1 bölge dışındaki kodda yer adı yazmıyor ("67380 · kargoyla"), çünkü taslak
 * yalnız "Strasbourg"u biliyor. Biz adı referanstan biliyoruz ve yazıyoruz (aşağıda, 19.8).
 *
 * ── ŞEHİR ADI HER KODDA YAZILIR (19.8) ───────────────────────────────────────
 * Ad `postal_code_place`tan gelir (16.878 satır, FR+DE), tahminden değil; kodun birden çok yerleşimi
 * varsa ad yazılmaz, yalnız kod. **Yazılan ad BÖLGEMİZİN adı değil, YERİN adı** (`placeName`,
 * `zoneName` değil): müşterinin zihninde "Strasbourg" var, "Strasbourg Merkez" bizim iç adımız.
 *
 * Hap **yalan söylememelidir**: başlık hiçbir zaman siparişten farklı bir yer göstermez.
 *
 * ── GİRİŞLİ VE ADRESLİ MÜŞTERİDE HAP ADRESİ GÖSTERİR (kullanıcı kararı 13.09) ──
 * Yerin kaynağı o müşteride kod değil seçili adres (`PlaceProvider` künyesi): hap adresin adını ve
 * kodunu yazar (v1: "Ev · 67000").
 *
 * ── MASAÜSTÜNDE HAP + PANEL, MOBİLDE KONUM SATIRI + ÇEKMECE (13.09 · 14.09) ────────
 * Masaüstünde hap başlığın ALTINDAKİ paneli açıp kapatır (`PlacePanel`). Mobil webde aynı bilgi
 * vitrin başlığında native'in konum satırı olarak durur (turuncu, harf aralıklı "67000 Strasbourg ▾")
 * ve basınca çekmece açılır (`PlaceSheet`). İki cihaz aynı açık/kapalı durumu (`panelOpen`) okuyor,
 * yalnız çizimleri ayrı.
 *
 * Odak halkası kitin (`focusRingClass`): yazılmayınca tarayıcının mavi halkası çiziliyordu.
 */
interface PlaceChipProps {
  locale: Locale;
  /** Mobil vitrin başlığının KONUM SATIRI (native vitrin: turuncu, harf aralıklı küçük metin + ▾). */
  line?: boolean;
}

export function PlaceChip({ locale, line = false }: PlaceChipProps) {
  const t = messages[locale];
  const { place, address, updating, panelOpen, setPanelOpen } = useDeliveryPlace();

  // `placeName` → `zoneName` → yalnız kod. İkinci basamak bir emniyet ağı: referansta olmayan ama
  // kendi bölgemizde duran bir kodda (bkz. `19.16`) hap yine bir ad gösterebilsin.
  const placeLabel = place?.placeName ?? place?.zoneName ?? null;
  const label = address
    ? `${address.label || address.city} · ${address.postalCode}`
    : place
      ? placeLabel
        ? `${place.postalCode} ${placeLabel}`
        : place.postalCode
      : t.empty;
  // Teslim şekli yalnız yer biliniyorken yazılır — boş hapta söylenecek bir şey yok.
  const channel = place ? (place.inRoute ? t.channelDoor : t.channelShip) : null;

  if (line) {
    // Satır ilk kareden çizilir (yer sunucudan geliyor); yer DEĞİŞİRKEN iskelet — hapın kuralı
    // (kullanıcı isteği 13.09): eski yeri göstermek cevabın alınmadığı izlenimini veriyordu.
    return (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={`w-max max-w-full cursor-pointer truncate text-left font-sans text-micro leading-normal font-bold tracking-[0.08em] text-terracotta transition-colors hover:text-terracotta-bright ${focusRingClass}`}
      >
        {updating ? <Skeleton className="inline-block h-3 w-32 rounded-full align-middle" /> : `${label} ▾`}
      </button>
    );
  }

  // Masaüstü hapı da ilk kareden çizilir (yer sunucudan geliyor — satırın gerekçesiyle aynı); önce
  // `ready`yi bekliyor ve başlıkta bir boşluk bırakıp sonradan beliriyordu. Yer DEĞİŞİRKEN (kod
  // gönderilirken, adres seçilirken, sayfa tazelenirken) iskelet durur — kullanıcı isteği 13.09:
  // eski yeri göstermek cevabın alınmadığı izlenimini veriyordu. Kabuk hapın boyunda, satır zıplamaz.
  if (updating) {
    return (
      <span aria-hidden className="block h-10.5 w-[200px] flex-none overflow-hidden rounded-pill">
        <Skeleton className="h-full w-full" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPanelOpen(!panelOpen)}
      aria-expanded={panelOpen}
      className={[
        'flex max-w-full flex-none cursor-pointer items-center gap-2 rounded-pill border border-olive-edge bg-olive-bg px-3.75 py-2.5 font-sans text-note font-bold transition-colors hover:border-olive',
        focusRingClass,
      ].join(' ')}
    >
      <Icon name="pin" size={16} className="flex-none text-olive-dark" />
      <span className={['truncate', place || address ? 'text-ink' : 'text-muted'].join(' ')}>{label}</span>
      {channel && <span className="flex-none font-sans text-field-label font-semibold whitespace-nowrap text-olive">· {channel}</span>}
      <span aria-hidden className="text-micro font-semibold text-muted">
        ▾
      </span>
    </button>
  );
}
