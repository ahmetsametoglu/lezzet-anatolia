import { useCallback, useEffect, useRef, useState } from 'react';

import type { StaffWarehouse } from '@lezzet/types';

import { fetchMe } from '@/lib/api/me';
import { fetchStaffScope } from '@/lib/api/operations';
import { getSupabase } from '@/lib/auth/supabase';
import { operationsSectionsOf, type OperationsSection } from '@/lib/operations/sections';
import { loadWarehouseChoice } from '@/lib/operations/warehouse-choice';

/*
  OPERASYON KAPISI — `/me`yi okur, rolleri bölümlere çevirir, kabuğun hangi hâli çizeceğini söyler.

  DÖRT HÂL, ÜÇÜ DEĞİL. "Erişemiyor" ile "ÖĞRENEMEDİK" ayrı tutuluyor (CLAUDE §1 — ölçülemeyen değer
  sıfır değildir):
  · `401` KESİN bir cevaptır — oturum yok. Karar hazır: oturumsuz kullanım müşteri gezinmesidir
    (02-mimari §4), kullanıcı müşteri kabuğuna yönlendirilir.
  · Ağ yok · 500 · `profile_not_found` (404) · bozuk gövde → rol bilgisi OKUNAMADI. Bu hâlde
    "yetkin yok" demek, wifi'si düşen kuryeyi vitrine düşürmek olurdu; ekran hatayı söyler ve
    tekrar denemeyi teklif eder.

  Rol kararı motorun değil, SAF kuralın işi (`lib/operations/sections.ts`) — bu hook yalnız
  getirir ve o kurala sorar.
*/

type OperationsAccess =
  | { status: 'loading' }
  /**
   * `userName` de kapıdan gelir, ekranların ikinci bir `/me` uçuşundan değil: kurye üstbaşlığı
   * (v2:38 "KURYE · 8 AĞUSTOS · MUSA K.") personelin adını istiyor ve o ad ZATEN bu cevabın
   * içinde. Ayrıca okunsaydı ekran başına bir uçuş ve iki cevap arasında ayrışma riski doğardı
   * (`sections-context.ts` künyesi: tek okuma, tek doğruluk).
   */
  /**
   * **Depo kapsamı da kapıdan gelir** (30.08) ama `/me`den DEĞİL, kendi ucundan
   * (`/operations/scope`): `/me` müşteriye bakan alanların kümesidir ve personel kapsamını bilerek
   * taşımaz (`me-api.schema.ts` künyesi). İkinci uçuş yine de KAPIDA, ekranlarda değil — beş
   * üstbaşlık aynı adı ister ve beş ayrı okuma, ayrışabilen beş cevap demekti.
   *
   * `warehouses` = personelin çalışabileceği tesisler (kapsam seçicisinin kaynağı),
   * `resolvedId` = kapsamın TEK BAŞINA çözdüğü depo (`null` → seçim gerekiyor). İkisinin de
   * anlamı sözleşmede (`operations-api.schema.ts`); kural sunucuda, burada yalnız taşınıyor.
   *
   * **Kapsam OKUNAMAZSA boş küme + `null` taşınır ve kapı yine açılır**: yetki kararı `/me`nin
   * işidir, kapsam yalnız üstbaşlığın kuyruğunu ve seçiciyi besler. Bir ad okunamadı diye
   * depocuyu vitrine düşürmek, `error` dalının bütün gerekçesine ters olurdu.
   */
  | {
      status: 'granted';
      sections: OperationsSection[];
      userName: string;
      userEmail: string | null;
      warehouses: StaffWarehouse[];
      resolvedWarehouseId: string | null;
    }
  /** Oturum yok ya da yalnız müşteri — kabuk açılmaz, müşteri yüzeyine dönülür. */
  | { status: 'denied' }
  /** Rol bilgisi okunamadı; yetki hakkında hiçbir şey İDDİA EDİLMİYOR. */
  | { status: 'error'; retry: () => void };

/** `authorizedFetch`in oturumsuz kısa devresi ve uçtaki Bearer guard'ı AYNI durumu döndürür. */
const UNAUTHORIZED_STATUS = 401;

export function useOperationsAccess(): OperationsAccess {
  const [state, setState] = useState<Exclude<OperationsAccess, { status: 'error' }> | { status: 'error' }>({
    status: 'loading',
  });

  /* Sökülmüş ekranın durumunu güncellemek React'te sessiz bir sızıntıdır; kapı ekranı da
     yönlendirmeyle hızlıca sökülebiliyor (izin verilmeyen kullanıcı). */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const result = await fetchMe();
    if (!alive.current) return;

    if (result.error !== null) {
      setState({ status: result.status === UNAUTHORIZED_STATUS ? 'denied' : 'error' });
      return;
    }

    const sections = operationsSectionsOf(result.data.roles);
    if (sections.length === 0) {
      setState({ status: 'denied' });
      return;
    }

    /* DEPO KAPSAMI — `/me`den SONRA, ve yalnız kapı geçildiyse (30.08).
       Paralel okunmadı, çünkü iki karar ayrı cinsten: erişim `/me`nin işi ve kapsam ucu personel
       kapısının arkasında (müşteriye 403). Paralel çağrı, kabuğa hiç giremeyecek bir kullanıcı
       için boşa bir istek ve — ikisi de 401'de oturum tazeleyip yeniden denediği için — aynı anda
       iki tazeleme demekti.
       KAPSAM OKUNAMAZSA KAPI KAPANMAZ: yetki kararı zaten verildi; eksik olan üstbaşlığın kuyruğu
       ve seçici. Bir ad okunamadı diye depocuyu vitrine düşürmek, `error` dalının bütün
       gerekçesine ters olurdu. */
    const scope = await fetchStaffScope();
    if (!alive.current) return;

    const warehouses = scope.error === null ? scope.data.warehouses : [];

    /* CİHAZDAKİ SEÇİM KAPSAMA KARŞI DOĞRULANIR — ve doğrulanacağı tek an burası, çünkü kapsam
       ancak burada biliniyor. Yönetici personeli başka tesise aldığında cihazda kalan eski kimlik
       her isteği `403`e çevirirdi; kapı onu sessizce değil, seçimi düşürerek karşılar (ekran
       yeniden sorar). Seçim tele buradan sonra karışır — `warehouseFetch` onu senkron okur. */
    await loadWarehouseChoice(warehouses.map((warehouse) => warehouse.id));
    if (!alive.current) return;

    setState({
      status: 'granted',
      sections,
      userName: result.data.name,
      userEmail: result.data.email,
      warehouses,
      resolvedWarehouseId: scope.error === null ? scope.data.resolvedId : null,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* OTURUM DEĞİŞİNCE KAPI YENİDEN SORULUR (21.97b — cihazda ölçüldü 22.08).
     Kapı `/me`yi YALNIZ montajda okuyordu ve bir daha hiç bakmıyordu. Belirtisi menünün
     "Oturumu kapat"ıyla görünür oldu: çıkış GERÇEKTEN yapılıyordu (uygulama yeniden açıldığında
     misafir geliyordu) ama ekran kurye rotasında kalıyordu — personel çıktığını sanıp bırakıyor,
     ölü bir oturumun rotası ekranda duruyor. Paylaşılan bir cihazda bu bir güvenlik hâli.
     Düğmeye "çıkınca yönlen" yazmak PANSUMAN olurdu: aynı boşluk oturum SÜRESİ dolduğunda da
     açık kalırdı ve kurye kabuğu bütün gün açık duruyor. Kök sebep kapının sağır olmasıydı.
     Dinleyici müşteri tarafındaki desenin aynısı (`use-me.hook`); `denied` dalı zaten müşteri
     yüzeyine yönlendiriyor, yani karar zinciri değişmedi — yalnız tetiği doğdu. */
  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange(() => void load());
    return () => data.subscription.unsubscribe();
  }, [load]);

  /* `retry` hâlin İÇİNDE duruyor ki çağıran onu yalnız hata dalında bulabilsin: yüklenirken de
     erişilebilen bir "tekrar dene", ikinci bir uçuş başlatmanın davetidir. */
  return state.status === 'error' ? { status: 'error', retry: () => void load() } : state;
}
