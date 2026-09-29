import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { fetchMe, type Me } from '../api/me';
import { getSupabase } from '../auth/supabase';
import { applyProfileLocale } from '../i18n/app-locale';

/*
  Müşteri kimliği, `/me`nin ekran tarafı; tek durumda durur ki profil güncellemesi her ekranda aynı anda görünsün. Oturum yoksa
  cevap `guest`tir, `error` oturum varken profilin okunamamasıdır: ekran o hâlde misafir gibi çizer ama giriş daveti basmaz.
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
  /* Girişli kullanıcıda dilin kaynağı profildir; profilin okunduğu her yol buradan geçtiği için dil de burada uygulanır. */
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
 * Düşen okuma öne gelişte yeniden denenir, çünkü oturumu duran müşteri aksi hâlde uygulamayı çıkış yapmış gibi görür. Yalnız
 * `error` hâlinde koşar: sağlıklı durumda her öne gelişte `/me` çekmek pahalı bir yoklama olurdu.
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
 * Abone olmak ağa çıkmaktır, bu yüzden kanca yalnız kimliğin konu olduğu ekranlarda çağrılır; kök kabuğa takmak ziyaretçiye açık
 * yolları oturum altyapısına bağlardı.
 */
export function useMe(): UseMeResult {
  const current = useSyncExternalStore(subscribe, () => state);
  return { ...current, refresh: load };
}

/**
 * Onaylı kurumsal müşteri mi: oturum okundu, hesap kurumsal ve başvuru onaylı; `b2bApproved` üç değerli olduğu için `=== true`
 * okunur, yoksa reddedilen başvuru da toptan sayılırdı. Sekme çatalı ve toptan rozeti aynı soruyu sorar, ölçüt tek yerde.
 */
export function useWholesale(): boolean {
  const { status, me } = useMe();
  return status === 'ready' && me !== null && me.type === 'company' && me.b2bApproved === true;
}
