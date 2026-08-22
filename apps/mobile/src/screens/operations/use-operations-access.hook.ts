import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMe } from '@/lib/api/me';
import { getSupabase } from '@/lib/auth/supabase';
import { operationsSectionsOf, type OperationsSection } from '@/lib/operations/sections';

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
  | { status: 'granted'; sections: OperationsSection[]; userName: string; userEmail: string | null }
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
    setState(
      sections.length === 0
        ? { status: 'denied' }
        : { status: 'granted', sections, userName: result.data.name, userEmail: result.data.email },
    );
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
