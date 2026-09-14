'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import type { Address, Country } from '@lezzet/types';
import { usePathname, useRouter } from '@/i18n/navigation';
import { resolvePlaceAction } from '@/lib/delivery/actions';
import { saveMyAddressAction, selectMyAddressAction, type SaveAddressInput } from '@/lib/address/actions';
import { readSkipped, writePlaceAnswer, writeSkipped } from '@/lib/delivery/place-store';
import type { DeliveryPlace, DeliveryZoneSummary, PlaceAddress, PlaceLookup, PlaceSnapshot } from '@/lib/delivery/place-types';

/**
 * Teslimat yeri bağlamı — "nereye getirelim" cevabının TEK sahibi.
 *
 * Neden bağlam: aynı cevap dört yerde birden görünür — başlıktaki hap, ürün ve paket detayındaki
 * teslimat satırı, sepetteki kısıt bloğu, katalogdaki çip. Her biri kendi state'ini tutsaydı
 * müşteri kodu değiştirdiğinde bir kısmı eski yeri göstermeye devam ederdi.
 *
 * **Yer bir SÖZDÜR, bir FİLTRE DEĞİLDİR:** buradan hiçbir şey engellenmez. Bileşenler `place`'e
 * bakıp ne söyleyeceklerine karar verir; ne yapılabileceğine değil (tasarım §7).
 *
 * ── İKİ KAYNAK, TEK CEVAP (kullanıcı kararı 13.09) ───────────────────────────
 * Girişli ve kayıtlı adresi olan müşteride yer = **seçili (varsayılan) adres**; ziyaretçide ve
 * adressiz müşteride yer = çerezdeki posta kodu. Sırayı SUNUCU kurar (`readPlaceContext`) ve ilk
 * kareyi de o verir (`initialPlace`/`initialAddress` — 19.7'nin (b) açığı kapandı): istemci
 * artık çerezi okuyup yeniden çözmüyor. Her `router.refresh()` layout'u yeniden çizer, yeni
 * kare buraya prop olarak iner ve state ona uyar.
 *
 * `address` doluyken `setPostalCode` YERİ DEĞİŞTİRMEZ: cevap çağırana döner, sitenin cevabı adrestir.
 * Adres formu bu kapıyı hiç kullanmaz, motora yalnız sorar (`resolvePlaceAction`): adressiz müşteride
 * öneri seçmek yeri kayıttan önce değiştiriyordu (14.09).
 */
interface PlaceContextValue {
  /** null = henüz sorulmadı ya da temizlendi; hap "Teslimat yerinizi seçin" der. */
  place: DeliveryPlace | null;
  /** Seçili teslimat adresi — yalnız girişli ve adresli müşteride; yerin kaynağı o zaman budur. */
  address: PlaceAddress | null;
  /**
   * Tarayıcıdaki ilk okuma (atlama işaretleri, `localStorage`) bitti mi — "şimdi değil" denmiş bir
   * soruyu bir an gösterip saklamamak için soru şeritleri bekler. Yerin KENDİSİ bunu beklemez:
   * o sunucudan ilk kareyle geliyor.
   */
  ready: boolean;
  /**
   * Yer DEĞİŞİYOR mu — yeri değiştiren bir istek (kod, adres seçimi, adres kaydı) ya da ardından gelen
   * sayfa tazelemesi sürüyor. Başlıktaki hap bu arada iskelet çizer (kullanıcı isteği 13.09): eski
   * yeri göstermeye devam etmek, müşterinin verdiği cevabın alınmadığı izlenimini veriyordu.
   */
  updating: boolean;
  /**
   * Kodu çözer. **Sonucu ayrık döndürür (19.16b)**, hata metni değil: `resolved` dışındaki hâller
   * (`ambiguous` · `unknown` · `unresolved`) ekranın kendi cümlesini kurabilmesi için tip olarak
   * gelir — metni ayrıştırmak bir dizgi eşleştirmesi olurdu ve üç dilde çalışmazdı.
   *
   * `null` yalnız GERÇEK arızada döner (ağ/DB); o hâlde çağıran genel hata gösterir.
   * Yer yalnız `resolved` hâlinde — ve yalnız adres yokken — değişir.
   */
  setPostalCode: (postalCode: string, country?: Country) => Promise<PlaceLookup | null>;
  clear: () => void;
  /** Kayıtlı adreslerden birini teslimat adresi yapar; yer ona göre yeniden kurulur. */
  selectAddress: (addressId: string) => Promise<boolean>;
  /** Adres ekler ya da düzenler; kaydedilen adres seçiliyse yer ona göre yeniden kurulur. */
  saveAddress: (input: SaveAddressInput) => Promise<{ ok: true; address: Address } | { ok: false; errorKey: string | null }>;
  /**
   * Soru atlandı mı — şerit ikinci kez sormaz (tasarım: "şimdi değil"). KAPSAMLIDIR: anasayfadaki
   * davet ile sepetteki somut soru aynı şey değil, birini geçmek öbürünü susturmamalı.
   */
  skipped: (scope: 'home' | 'cart') => boolean;
  skip: (scope: 'home' | 'cart') => void;
  /**
   * Kapıya teslim ettiğimiz yerler — **sayfa açılırken sunucuda okunmuş** hâlde gelir
   * (`layout` → `getDeliveryZones`), burada bekletilir.
   *
   * Panel bunu kendi açılışında istemciden çekiyordu ve liste birkaç yüz milisaniye sonra alttan
   * beliriyordu: müşteri sorusunu sorarken cevabın yarısı henüz yoktu. Liste operatörün elle
   * kurduğu, veriyle büyümeyen bir küme (CLAUDE.md §1) — bir kez okunup burada durması hem
   * beklemeyi hem de her panel açılışında tekrarlanan turu ortadan kaldırıyor.
   */
  zones: DeliveryZoneSummary[];
  /**
   * Masaüstü başlığının yer paneli açık mı (v1, 13.09). Hap BAŞLIĞIN içinde, panel başlık satırının
   * ALTINDA çizilir — iki ayrı yerde duran iki bileşen aynı durumu okuyor, o yüzden durum burada.
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
}

export function PlaceProvider({ children, zones, initialPlace, initialAddress }: PlaceProviderProps) {
  const router = useRouter();
  const [place, setPlace] = useState<DeliveryPlace | null>(initialPlace);
  const [address, setAddress] = useState<PlaceAddress | null>(initialAddress);
  const [ready, setReady] = useState(false);
  const [skipped, setSkipped] = useState<Record<'home' | 'cart', boolean>>({ home: false, cart: false });
  /** Yeri değiştiren kaç istek havada — sayı, bayrak değil: iki istek üst üste binebilir. */
  const [inflight, setInflight] = useState(0);
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    // Atlama işaretleri yalnız tarayıcıda (`localStorage`); ilk kare onlar okunmadan çizilmez —
    // şerit önce belirip sonra kaybolmasın.
    setSkipped({ home: readSkipped('home'), cart: readSkipped('cart') });
    setReady(true);
  }, []);

  // Sunucu yeni bir kare verdiyse (yenileme, gezinme) state ona uyar: kaynak sunucudur, istemci
  // kopyası yalnız ara kareleri taşır.
  useEffect(() => {
    setPlace(initialPlace);
    setAddress(initialAddress);
  }, [initialPlace, initialAddress]);

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
      // Adres seçildiyse her iki soru da cevaplanmıştır; atlama işaretleri düşer.
      setSkipped({ home: false, cart: false });
      // Sunucuyu da tazele: katalog kartlarının işaretleri ve sepetin grupları RSC'de yeni yere
      // göre yeniden çizilsin (19.7'deki `setPostalCode` gerekçesinin aynısı).
      refresh();
    },
    [refresh],
  );

  // `country` YALNIZ belirsizlik hâlinde geçilir (19.7): kod iki hizmet ülkemizde birden geçerliyse
  // türetecek bir şey kalmaz ve cevap müşterinindir. Öteki her çağrıda kod ülkeyi zaten belirler.
  // Masaüstü yer paneli ülkeyi ÖNCE sorar (v1, 13.09) ve her çağrıda geçirir.
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
        // Kod girildiyse her iki soru da cevaplanmıştır; atlama işaretleri düşer.
        setSkipped({ home: false, cart: false });
        // ── SUNUCUYU DA TAZELE (19.7) ───────────────────────────────────────────
        // Çerezi İSTEMCİ yazıyor (`document.cookie`); o an ekranda duran RSC çıktısı hâlâ eski yerle
        // (çoğu zaman depo-üstü) çizilmiş. Tazeleme olmadan hap doluyor ama katalog kartlarındaki
        // stok işaretleri bir sonraki gezinmeye kadar ESKİ kalıyordu — "kargoyla gönderilir" yazması
        // gereken ürün işaretsiz duruyordu. Yer bir soru: cevaplandığı an her yüzey ona göre konuşmalı.
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
      ready,
      updating,
      panelOpen,
      setPanelOpen,
      setPostalCode,
      clear: () => {
        setPlace(null);
        writePlaceAnswer(null);
        // Temizleme de bir cevap değişimidir: okumalar depo-üstüne dönmeli, yoksa ekranda yerin
        // silindiği ama işaretlerin hâlâ o yeri anlattığı bir ara hâl kalır.
        refresh();
      },
      selectAddress,
      saveAddress,
      zones,
      skipped: (scope) => skipped[scope],
      skip: (scope) => {
        setSkipped((prev) => ({ ...prev, [scope]: true }));
        writeSkipped(scope);
      },
    }),
    [place, address, ready, updating, panelOpen, refresh, setPostalCode, selectAddress, saveAddress, skipped, zones],
  );

  return <PlaceContext.Provider value={value}>{children}</PlaceContext.Provider>;
}
