'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import type { Address, Business, CheckoutPickup, Country } from '@lezzet/types';
import { usePathname, useRouter } from '@/i18n/navigation';
import { resolvePlaceAction } from '@/lib/delivery/actions';
import { saveMyAddressAction, selectMyAddressAction, selectMyPickupAction, type SaveAddressInput } from '@/lib/address/actions';
import { writePlaceAnswer } from '@/lib/delivery/place-store';
import type { DeliveryPlace, DeliveryZoneSummary, PlaceAddress, PlaceLookup, PlaceSnapshot, PlaceUnresolved } from '@/lib/delivery/place-types';

/**
 * Teslimat yeri bağlamı, "nereye getirelim" cevabının tek sahibi: aynı cevap başlık hapında, detaydaki teslimat satırında, sepette ve
 * katalog çipinde görünür ve yer bir sözdür, filtre değildir. Girişli ve adresli müşteride yer seçili adrestir, öteki hâlde çerezdeki
 * posta kodu; sırayı ve ilk kareyi sunucu kurar, `address` doluyken `setPostalCode` yeri değiştirmez.
 */
interface PlaceContextValue {
  /** null = henüz sorulmadı ya da temizlendi; hap "Teslimat yerinizi seçin" der. */
  place: DeliveryPlace | null;
  /** Seçili teslimat adresi — yalnız girişli ve adresli müşteride; yerin kaynağı o zaman budur. */
  address: PlaceAddress | null;
  /**
   * Seçili adres neden yer vermiyor: kod tanınıyor ama ne rota ne kargo karşılıyor (`no_shipping_warehouse` ayar eksiğimiz,
   * `ambiguous_zone` veri çakışması, `outside_zones` kargo göndermeyen işin bölgesi dışı). Sepet bunu teslim şeridinde, satır notunda ve
   * pasif "Ödemeye geç"te söyler.
   */
  unresolved: PlaceUnresolved | null;
  /**
   * İstemcide ilk kare tamamlandı mı: sunucuyla aynı çizilip sonra açılan parçalar (satın alma kapısı, sepet okuması) bunu bekler. Yerin
   * kendisi beklemez, ilk kareyle sunucudan gelir.
   */
  ready: boolean;
  /**
   * Yer değişiyor mu: yeri değiştiren istek ya da ardından gelen tazeleme sürerken başlık hapı iskelet çizer, eski yeri göstermek cevabın
   * alınmadığı izlenimini verirdi.
   */
  updating: boolean;
  /**
   * Kodu çözer ve sonucu ayrık döndürür, hata metni değil: `resolved` dışındaki hâller ekranın kendi cümlesini kurabilmesi için tip olarak
   * gelir. `null` yalnız gerçek arızada döner; yer yalnız `resolved` hâlinde ve adres yokken değişir.
   */
  setPostalCode: (postalCode: string, country?: Country) => Promise<PlaceLookup | null>;
  clear: () => void;
  /** Kayıtlı adreslerden birini teslimat adresi yapar; yer ona göre yeniden kurulur. */
  selectAddress: (addressId: string) => Promise<boolean>;
  /** Gel-al teklifi (izinli müşteride) ve seçili depo; adres seçicideki depo kartı buradan çizilir. */
  pickup: CheckoutPickup | null;
  /** Depo kartına dokunmak: gel-al seçer, `null` adrese döner; sepet ve checkout aynı seçimi okur. */
  selectPickup: (warehouseId: string | null) => Promise<boolean>;
  /** Adres ekler ya da düzenler; kaydedilen adres seçiliyse yer ona göre yeniden kurulur. */
  saveAddress: (input: SaveAddressInput) => Promise<{ ok: true; address: Address } | { ok: false; errorKey: string | null }>;
  /**
   * Kapıya teslim ettiğimiz yerler, sayfa açılırken sunucuda okunmuş hâlde gelir: panel kendi açılışında çekseydi liste gecikmeyle
   * belirirdi. Küme operatörün kurduğu ve veriyle büyümeyen bir listedir, bir kez okunur.
   */
  zones: DeliveryZoneSummary[];
  /** Görüntüleyenin işi; rozet ve teslim satırı yalnız bu işin bölgesini ve kargosunu söyler. */
  business: Business;
  /**
   * Masaüstü başlığının yer paneli açık mı: hap başlığın içinde, panel başlık satırının altında çizilir ve ikisi aynı durumu okur.
   */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

const PlaceContext = createContext<PlaceContextValue | null>(null);

export function useDeliveryPlace(): PlaceContextValue {
  const ctx = useContext(PlaceContext);
  if (!ctx) throw new Error('useDeliveryPlace yalnız PlaceProvider içinde kullanılır');
  return ctx;
}

interface PlaceProviderProps {
  children: ReactNode;
  /** Sunucuda okunmuş bölge listesi; istemci bunu bir daha sormaz. */
  zones: DeliveryZoneSummary[];
  /** Yerin sunucudaki ilk karesi (`readPlaceSnapshot`) — adres ya da çerezden çözülmüş. */
  initialPlace: DeliveryPlace | null;
  initialAddress: PlaceAddress | null;
  /** Adres karşılanamıyorsa sebebi (`readPlaceSnapshot`) — sepet onu söyler. */
  initialUnresolved: PlaceUnresolved | null;
  initialPickup: CheckoutPickup | null;
  /** Görüntüleyenin işi (`readPlaceSnapshot`); oturum boyunca değişmez. */
  business: Business;
}

export function PlaceProvider({
  children,
  zones,
  initialPlace,
  initialAddress,
  initialUnresolved,
  initialPickup,
  business,
}: PlaceProviderProps) {
  const router = useRouter();
  const [place, setPlace] = useState<DeliveryPlace | null>(initialPlace);
  const [address, setAddress] = useState<PlaceAddress | null>(initialAddress);
  const [unresolved, setUnresolved] = useState<PlaceUnresolved | null>(initialUnresolved);
  const [pickup, setPickup] = useState<CheckoutPickup | null>(initialPickup);
  const [ready, setReady] = useState(false);
  /** Yeri değiştiren kaç istek havada — sayı, bayrak değil: iki istek üst üste binebilir. */
  const [inflight, setInflight] = useState(0);
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => setReady(true), []);

  // Sunucu yeni bir kare verdiyse (yenileme, gezinme) state ona uyar: kaynak sunucudur, istemci
  // kopyası yalnız ara kareleri taşır.
  useEffect(() => {
    setPlace(initialPlace);
    setAddress(initialAddress);
    setUnresolved(initialUnresolved);
    setPickup(initialPickup);
  }, [initialPlace, initialAddress, initialUnresolved, initialPickup]);

  /**
   * Sunucu tarafını tazeler — GEÇİŞ (`transition`) içinde: tazeleme bitene dek `refreshing` açık
   * kalır ve hap iskelette durur; yeni kare gelince yeni yeri yazar.
   */
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  /** Yeri değiştiren isteği sayar — sonuç ne olursa olsun (istek düşse bile) sayaç geri iner. */
  const track = useCallback(async <T,>(work: Promise<T>): Promise<T> => {
    setInflight((n) => n + 1);
    try {
      return await work;
    } finally {
      setInflight((n) => n - 1);
    }
  }, []);

  /** Yazan bir eylemin döndürdüğü kareyi benimser ve sunucu tarafını tazeler. */
  const adopt = useCallback(
    (snapshot: PlaceSnapshot) => {
      setPlace(snapshot.place);
      setAddress(snapshot.address);
      setUnresolved(snapshot.unresolved);
      setPickup(snapshot.pickup);
      // Sunucu da tazelenir ki katalog kartlarının işaretleri ve sepetin grupları RSC'de yeni yere göre çizilsin.
      refresh();
    },
    [refresh],
  );

  // `country` yalnız belirsizlik hâlinde geçilir: kod iki hizmet ülkesinde geçerliyse cevap müşterinindir, öteki çağrılarda kod ülkeyi
  // belirler. Masaüstü yer paneli ülkeyi önce sorar ve her çağrıda geçirir.
  const setPostalCode = useCallback(
    async (postalCode: string, country?: Country): Promise<PlaceLookup | null> => {
      // Yalnız yeri DEĞİŞTİREBİLECEK soru sayılır: adres varken cevap yalnız çağırana döner ve sitenin
      // yeri adres kalır — hap o soruda iskelete dönmemeli.
      const request = resolvePlaceAction(postalCode, country);
      const { data } = await (address === null ? track(request) : request);
      if (!data) return null;
      // Yer YALNIZ çözülmüş hâlde değişir: belirsiz ya da tanınmayan bir cevabı saklamak, müşterinin
      // vermediği bir kararı vermiş gibi göstermek olurdu.
      // Adres varken de değişmez (künye): cevap çağırana döner, sitenin yeri adres kalır.
      if (data.kind === 'resolved' && address === null) {
        setPlace(data.place);
        // Saklanan tek şey CEVAP: çözümü (bölge, gün, depo) her istekte sunucu yeniden üretir.
        writePlaceAnswer({ country: data.place.country, postalCode: data.place.postalCode });
        setUnresolved(null);
        // Sunucu da tazelenir: çerezi istemci yazar ve ekrandaki RSC çıktısı eski yerle çizilmiştir, tazeleme olmadan katalog kartlarının
        // stok işaretleri bir sonraki gezinmeye kadar eski kalırdı.
        refresh();
      }
      return data;
    },
    [refresh, track, address],
  );

  const selectAddress = useCallback(
    async (addressId: string): Promise<boolean> => {
      const { data } = await track(selectMyAddressAction(addressId));
      if (!data) return false;
      adopt(data);
      return true;
    },
    [adopt, track],
  );

  const selectPickup = useCallback(
    async (warehouseId: string | null): Promise<boolean> => {
      const { data } = await track(selectMyPickupAction(warehouseId));
      if (!data) return false;
      adopt(data);
      return true;
    },
    [adopt, track],
  );

  const saveAddress = useCallback(
    async (input: SaveAddressInput) => {
      const { data, errorKey } = await track(saveMyAddressAction(input));
      if (!data) return { ok: false as const, errorKey };
      adopt(data.snapshot);
      return { ok: true as const, address: data.address };
    },
    [adopt, track],
  );

  const [panelOpen, setPanelOpen] = useState(false);
  // Sayfa değişince panel kapanır (v1 `go()` → `yerPanel:false`): açık panel yeni sayfanın üstünde
  // sorulmamış bir soru gibi durmasın.
  const pathname = usePathname();
  useEffect(() => setPanelOpen(false), [pathname]);

  const updating = inflight > 0 || refreshing;

  const value = useMemo<PlaceContextValue>(
    () => ({
      place,
      address,
      unresolved,
      ready,
      updating,
      panelOpen,
      setPanelOpen,
      setPostalCode,
      clear: () => {
        setPlace(null);
        setUnresolved(null);
        writePlaceAnswer(null);
        // Temizleme de bir cevap değişimidir: okumalar depo-üstüne dönmeli, yoksa ekranda yerin
        // silindiği ama işaretlerin hâlâ o yeri anlattığı bir ara hâl kalır.
        refresh();
      },
      selectAddress,
      pickup,
      selectPickup,
      saveAddress,
      zones,
      business,
    }),
    [
      place,
      address,
      unresolved,
      ready,
      updating,
      panelOpen,
      refresh,
      setPostalCode,
      selectAddress,
      pickup,
      selectPickup,
      saveAddress,
      zones,
      business,
    ],
  );

  return <PlaceContext.Provider value={value}>{children}</PlaceContext.Provider>;
}
