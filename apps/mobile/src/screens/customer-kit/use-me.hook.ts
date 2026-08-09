import { useSyncExternalStore } from 'react';

import { fetchMe, type Me } from '@/lib/api/me';
import { getSupabase } from '@/lib/auth/supabase';
import { applyProfileLocale } from '@/lib/i18n/app-locale';

/*
  MÜŞTERİ KİMLİĞİ — `/me`nin ekran tarafı (21.14c). Birden çok müşteri ekranı okuduğu için kit
  katmanında ve TEK durumda duruyor (sepet deposunun deseni): her ekran kendi kopyasını çekseydi
  profil güncellemesi yalnız güncelleyen ekranda görünür, vitrin eski adı selamlar dı. `publishMe`
  bu yüzden var: kaydeden ekran sonucu yayınlar, aboneler aynı anda döner.

  "OTURUMSUZ KULLANIM = MÜŞTERİ GEZİNMESİ" (02-mimari §4): oturum yokken `fetchMe` ağa hiç
  çıkmaz, yerel 401 kısa devresiyle döner — o hâl HATA DEĞİL `guest`tir. `error` yalnız oturum
  VARKEN profilin okunamamasıdır (ağ/sunucu): ekran o hâlde misafir GİBİ çizer ama misafir
  DEMEZ (giriş daveti basmak yalan olurdu).

  Oturum DEĞİŞİNCE kendiliğinden tazelenir (`onAuthStateChange`): giriş biten ekran kapanır
  kapanmaz vitrin selamlamayı alır, çıkışta ad düşer. Dinleyici İLK ABONEYLE kurulur ve aboneler
  bitince sökülür — modül yüklendi diye arka planda bir dinleyici yaşamaz.
*/

type MeStatus = 'loading' | 'guest' | 'ready' | 'error';

interface MeState {
  status: MeStatus;
  /** Yalnız `ready` hâlinde dolu. */
  me: Me | null;
}

let state: MeState = { status: 'loading', me: null };
const listeners = new Set<() => void>();
let generation = 0;
let authSubscription: { unsubscribe: () => void } | null = null;

function setState(next: MeState): void {
  state = next;
  /* MÜŞTERİNİN DİLİ TEK KAPIDAN GEÇER (09.08): dil bir arayüz ayarı değil, kartta yaşayan
     `preferred_language`tır (yazışma dili) ve GİRİŞLİ kullanıcıda kaynak odur — cihazın dili
     onu ezmez. Profilin okunduğu HER yol buradan geçtiği için (ilk yükleme, oturum değişimi,
     `publishMe`) uygulama da burada yapılıyor; ekranlara dağıtılsaydı hangi ekranın açıldığına
     göre dil değişirdi. Zincirin tamamı `lib/i18n/app-locale` künyesinde. */
  if (next.status === 'ready' && next.me !== null) applyProfileLocale(next.me.preferredLanguage);
  listeners.forEach((listener) => listener());
}

function load(): void {
  const run = ++generation;
  void fetchMe().then((result) => {
    if (run !== generation) return;
    if (result.error !== null) {
      // Yerel kısa devre 401'i (oturum yok) misafirdir; kalanı gerçek arızadır.
      setState({ status: result.status === 401 ? 'guest' : 'error', me: null });
      return;
    }
    setState({ status: 'ready', me: result.data });
  });
}

/** Kaydeden ekran sonucu yayınlar — TÜM aboneler (vitrin selamlaması dahil) aynı anda döner. */
export function publishMe(me: Me): void {
  setState({ status: 'ready', me });
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    load();
    const { data } = getSupabase().auth.onAuthStateChange(() => load());
    authSubscription = data.subscription;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      authSubscription?.unsubscribe();
      authSubscription = null;
    }
  };
}

interface UseMeResult extends MeState {
  refresh: () => void;
}

export function useMe(): UseMeResult {
  const current = useSyncExternalStore(subscribe, () => state);
  return { ...current, refresh: load };
}

/**
 * ONAYLI KURUMSAL MÜŞTERİ (B2B) Mİ — v3'ün `isB2B()`sinin karşılığı, TEK yerde.
 *
 * Ölçüt üç parçalıdır ve üçü birden şart: oturum okundu (`ready`), hesap kurumsal (`company`),
 * başvuru ONAYLANDI. `b2bApproved` üç değerlidir (`true`/`false`/`null` — `user-profile.schema`
 * künyesi: ret silmez, B2C'de zaten `null`), o yüzden `=== true` ile okunur; "boş değil" kontrolü
 * REDDEDİLMİŞ başvuruyu da toptan sayardı.
 *
 * Ölçütün burada durmasının sebebi CLAUDE §1: sekme çatalı (üçüncü sekme Paketler ⟷ Siparişler)
 * ve vitrinin TOPTAN rozeti aynı soruyu soruyor; iki kopya bir gün ayrışır ve kullanıcı rozetli
 * ama yanlış sekmeli bir uygulama görürdü.
 */
export function useWholesale(): boolean {
  const { status, me } = useMe();
  return status === 'ready' && me !== null && me.type === 'company' && me.b2bApproved === true;
}
