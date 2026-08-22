import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

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

/**
 * DÜŞEN OKUMA TEK BAŞINA TOPARLANMAZDI (21.98 — cihazda ölçüldü 22.08).
 *
 * Ağ düşünce `status` `error`a geçiyor ve ekran misafir GİBİ çiziliyor (yukarıdaki künye: misafir
 * DEMİYOR, ama selamlama, sipariş bantları ve toptan rozeti kayboluyor). Sorun o karar değil,
 * ondan ÇIKIŞ yolunun olmamasıydı: `load` yalnız ilk abonede ve oturum değişiminde koşuyordu.
 * Ölçülen dört yol — hesap sekmesindeki "Tekrar dene" ✓ · vitrini aşağı çekmek ✓ · sekme
 * değiştirmek ✗ · **ağ geri gelince kendiliğinden ✗**. Yani oturumu yerli yerinde duran müşteri,
 * doğru düğmeyi bulana kadar uygulamayı çıkış yapmış gibi görüyordu.
 *
 * Tetik ÖNE GELME, çünkü sahadaki toparlanma böyle oluyor: bağlantısı olmadığını fark eden kişi
 * uygulamadan çıkıp wifi'yi/uçak kipini düzeltiyor ve geri dönüyor. Bağlantı dinleyicisi
 * (`netinfo`) daha doğrudan bir sinyal olurdu ama projede o bağımlılık YOK ve bir kütüphaneyi
 * tek bir tazeleme için almak, taşıdığı bakımdan pahalı.
 *
 * YALNIZ `error` HÂLİNDE koşar: sağlıklı durumda her öne gelişte `/me` çekmek, düzeltmeye
 * çalıştığı arızadan pahalı bir yoklama olurdu. `guest` de tazelenmez — o KESİN bir cevaptır
 * (401), eksik bir okuma değil; oturum açılırsa zaten `onAuthStateChange` duyar.
 */
function retryOnForeground(appState: AppStateStatus): void {
  if (appState === 'active' && state.status === 'error') load();
}

let appStateSubscription: { remove: () => void } | null = null;

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    load();
    const { data } = getSupabase().auth.onAuthStateChange(() => load());
    authSubscription = data.subscription;
    appStateSubscription = AppState.addEventListener('change', retryOnForeground);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      authSubscription?.unsubscribe();
      authSubscription = null;
      appStateSubscription?.remove();
      appStateSubscription = null;
    }
  };
}

interface UseMeResult extends MeState {
  refresh: () => void;
}

/**
 * ABONE OLMAK AĞA ÇIKMAKTIR — `subscribe` ilk abonede `getSupabase()` çağırır ve o çağrı env
 * ister. Bu yüzden kanca YALNIZ kimliğin gerçekten konu olduğu ekranlarda çağrılır; kök kabuğa
 * takmak bağı uygulamanın tamamına yayar ve ziyaretçiye açık yolları (davet linkiyle gelen geri
 * bildirim — kimlik token'ın KENDİSİDİR) oturum altyapısına bağlardı (ölçüldü 10.08, künye
 * kapısı kökten sökülerek çözüldü). Aynı ders `cart-store`un künyesinde de yazılı.
 */
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
