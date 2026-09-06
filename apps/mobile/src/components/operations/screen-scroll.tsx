import type { ReactNode } from 'react';
import {
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

import { useOperationsShellScroll } from '@/lib/operations/shell-scroll';

import { OperationsMicroHeader } from './micro-header';

/*
  OPERASYON EKRANININ KAYDIRICISI — kabuk davranışlarının TEK KAPISI (M1b · M1c).

  ── NİÇİN VAR (kullanıcı bulgusu 30.08) ────────────────────────────────────
  Kabuk davranışı ilk turda üç ayrı parça olarak bırakılmıştı: ekran `useOperationsShellScroll()`
  çağıracak, `onScroll` + `scrollEventThrottle`i kaydırıcısına bağlayacak, ayrıca mikro başlığı
  kendisi çizecekti. Üçü de elle. Sonucu ölçüldü: kendi kaydırıcısını kuran **17 operasyon
  ekranından yalnız 1'i** bağlanmıştı — yapışkan başlık da çubuk gizlemesi de öteki 16 ekranda
  hiç çalışmıyordu. Kullanıcı bunu "daha önce çalışıyordu, şimdi bozuk" diye gördü; oysa hiç
  bağlanmamıştı.

  Bir davranışın üç parçalı elle kurulumu, kurulmayacağı anlamına gelir. Burada tek bir kap var:
  başlığı da çizer, olayı da bağlar. Ekranın yazması gereken tek şey ekran adı.

  ── SARILAMAYAN KAYDIRICILAR İÇİN İKİNCİ KAPI (21.178) ─────────────────────
  Her ekran `ScrollView` kullanmıyor: mal kabul, sayım, düşüm ve kurye formları `FormScroll`
  (klavye farkında), sosyal gelen kutusu `FlatList` (sanallaştırılmış). İkisi de bu kaba
  SARILAMAZ — iç içe kaydırıcı ya sanallaştırmayı öldürür ya klavye davranışını bozar.

  Onlar için `OperationsScreenChrome` var ve **render prop** ile çalışıyor: şeridi kendisi çizer,
  kaydırıcının bağlantı proplarını çağırana verir. Kanca döndüren bir çözüm de olabilirdi ama
  şeridi çizmeyi çağırana bırakırdı — ve 30.08'de ölçülen şey tam olarak buydu: elle kurulan üç
  parçalı bir davranış kurulmuyor. Burada ikisi tek çağrıdan geliyor, yarısını almak mümkün değil.

  `OperationsScreenScroll` de bu kapıdan besleniyor (aynı mantığın ikinci kopyası yok, CLAUDE §1).
*/

interface OperationsScreenScrollProps extends Omit<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'> {
  /** Mikro başlıkta solda görünen ekran adı. */
  title: string;
  /** Sağdaki küçük künye — bölüm adı ya da kısa bağlam ("DEPO", "SEFER SF-26-…"). */
  caption?: string;
  children: ReactNode;
}

export function OperationsScreenScroll({ title, caption, children, ...scrollProps }: OperationsScreenScrollProps) {
  return (
    <OperationsScreenChrome title={title} caption={caption}>
      {(bind) => (
        <ScrollView {...scrollProps} {...bind}>
          {children}
        </ScrollView>
      )}
    </OperationsScreenChrome>
  );
}

/** Kaydırıcıya geçirilecek bağlantı — kabuk kaydırmayı bu iki proptan duyuyor. */
export interface OperationsShellBinding {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

interface OperationsScreenChromeProps {
  /** Mikro başlıkta solda görünen ekran adı. */
  title: string;
  /** Sağdaki küçük künye — bölüm adı ya da kısa bağlam. */
  caption?: string;
  /** Kaydırıcıyı çizen fonksiyon; verilen propları KENDİ kaydırıcısına geçirmekle yükümlü. */
  children: (binding: OperationsShellBinding) => ReactNode;
}

/**
 * Kabuk kromu — şeridi çizer, bağlantıyı çağırana verir.
 *
 * `FormScroll` ve `FlatList` gibi kendi kaydırıcısını yöneten kaplar için. Doğrudan `ScrollView`
 * kullanan ekranlar `OperationsScreenScroll`u çağırır; o da buradan besleniyor.
 */
export function OperationsScreenChrome({ title, caption, children }: OperationsScreenChromeProps) {
  const { onScroll } = useOperationsShellScroll();

  return (
    <>
      {/* Şerit kaydırıcının KARDEŞİ, çocuğu değil: mutlak konumlu ve kaydırma alanının üstünde
          durur. İçine konsaydı sayfayla birlikte kayardı. */}
      <OperationsMicroHeader title={title} caption={caption} />
      {children({ onScroll, scrollEventThrottle: SCROLL_THROTTLE_MS })}
    </>
  );
}

/** Olay sıklığı (ms) — 16 ≈ 60 kare/sn; kararın histerezi zaten titremeyi kesiyor. */
const SCROLL_THROTTLE_MS = 16;
