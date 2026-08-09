import { useSyncExternalStore } from 'react';

import { fetchMe, type Me } from '@/lib/api/me';
import { getSupabase } from '@/lib/auth/supabase';

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
