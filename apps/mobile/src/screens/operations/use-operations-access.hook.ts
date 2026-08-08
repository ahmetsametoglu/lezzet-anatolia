import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMe } from '@/lib/api/me';
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
  | { status: 'granted'; sections: OperationsSection[]; userName: string }
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
      sections.length === 0 ? { status: 'denied' } : { status: 'granted', sections, userName: result.data.name },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* `retry` hâlin İÇİNDE duruyor ki çağıran onu yalnız hata dalında bulabilsin: yüklenirken de
     erişilebilen bir "tekrar dene", ikinci bir uçuş başlatmanın davetidir. */
  return state.status === 'error' ? { status: 'error', retry: () => void load() } : state;
}
