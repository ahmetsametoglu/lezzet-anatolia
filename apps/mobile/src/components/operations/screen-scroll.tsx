import type { ReactNode } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

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

  ── FLATLIST İÇİN KAPI HENÜZ YOK, BİLEREK ─────────────────────────────────
  Sanallaştırılmış listeler bu kaba SARILAMAZ (iç içe kaydırıcı sanallaştırmayı öldürür) ve onlar
  için bir bağlama kancası yazılmıştı — ama tüketicisi olmadığı için SÖKÜLDÜ (`knip`, 31.08).
  Tüketicisi olmayan yardımcı, ilk günden ölü koddur (CLAUDE §0). Kabuğa bağlanacak ilk `FlatList`
  ekranı onu yeniden açar: `useOperationsShellScroll().onScroll` zaten kamuya açık.
*/

interface OperationsScreenScrollProps extends Omit<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'> {
  /** Mikro başlıkta solda görünen ekran adı. */
  title: string;
  /** Sağdaki küçük künye — bölüm adı ya da kısa bağlam ("DEPO", "SEFER SF-26-…"). */
  caption?: string;
  children: ReactNode;
}

export function OperationsScreenScroll({ title, caption, children, ...scrollProps }: OperationsScreenScrollProps) {
  const { onScroll } = useOperationsShellScroll();

  return (
    <>
      {/* Şerit kaydırıcının KARDEŞİ, çocuğu değil: mutlak konumlu ve kaydırma alanının üstünde
          durur. İçine konsaydı sayfayla birlikte kayardı. */}
      <OperationsMicroHeader title={title} caption={caption} />
      <ScrollView {...scrollProps} onScroll={onScroll} scrollEventThrottle={SCROLL_THROTTLE_MS}>
        {children}
      </ScrollView>
    </>
  );
}

/** Olay sıklığı (ms) — 16 ≈ 60 kare/sn; kararın histerezi zaten titremeyi kesiyor. */
const SCROLL_THROTTLE_MS = 16;
