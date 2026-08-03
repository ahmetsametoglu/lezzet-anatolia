'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { WarehouseContextPickerProps } from './warehouse-context-picker';

/**
 * Operasyon kabuğunun BAĞLAMI — her sayfada aynı olan üç şey: kim bağlandı, hangi depo evrenindeyiz,
 * gezinme kümesi ne.
 *
 * ── NEDEN CONTEXT, NEDEN PROP DEĞİL ──────────────────────────────────────────
 * Ortak başlık barı (09.19) bu üçünü taşıyor ama barı SAYFA çiziyor — başlık ve aksiyonlar sayfaya
 * ait. Yani veri layout'ta okunuyor, tüketimi sayfada. Prop olarak geçirmek her `page.tsx`'in bunu
 * yeniden okuyup her istemci komponentine indirmesi demekti: on ekranda aynı üç prop, ve biri
 * eklemeyi unutunca barın yarısı sessizce boşalırdı.
 *
 * Alternatif iki barı üst üste koymaktı (layout'ta genel bar, sayfada başlık barı) — dikey alanın
 * ikinci kez ödenmesi ve tasarımın istediğin şeyin tam tersi: kullanıcı zaten "orası çok kalabalık"
 * dediği için bu işe başladık.
 *
 * ── SAĞLAYICI YOKSA NE OLUR ──────────────────────────────────────────────────
 * `null` döner ve bar genel blokları HİÇ çizmez. Fırlatmıyor: başlık barı operasyon dışında da
 * (hata sayfası, yetkisiz ekran) kullanılabilmeli ve orada kabuk yoktur. Eksik olan bağlamdır,
 * ekranın kendisi değil.
 */
interface OpsShellValue {
  user: { email: string; roles: readonly UserRole[] };
  warehouse: WarehouseContextPickerProps;
  /**
   * TELEFONDA gezinme rayının açık olup olmadığı (04.08, denetim bildirimi).
   *
   * Ray sabit 214px çiziliyordu ve 390px'lik bir ekranda içeriğe 176px kalıyordu — yani yüzeyin
   * yarısından fazlası gezinmeye gidiyordu. Ölçüldü (`ui:shot`): ürün adları "Fıst…" diye
   * kırpılıyor, "Onayla" düğmesi ekrandan taşıyor, dört sekmenin biri sığıyordu.
   *
   * Durum BURADA çünkü iki komponent paylaşıyor: rayın kendisi (çekmece olarak açılıp kapanır) ve
   * başlık barı (hamburger düğmesi). Prop olarak geçmek her `page.tsx`'in araya girmesi demekti —
   * oysa ikisi de layout'un parçası, sayfanın değil.
   *
   * Masaüstünde `null`: orada ray hep açık ve kapatılamaz, yani "açık mı" diye bir soru yok.
   */
  nav: { open: boolean; toggle: () => void; close: () => void } | null;
}

const OpsShellContext = createContext<OpsShellValue | null>(null);

/**
 * Sağlayıcı `nav` durumunu KENDİ kuruyor — layout bir sunucu bileşeni ve `useState` tutamaz.
 * Dışarıdan yalnız cihaz ipucu geliyor; "ray açılıp kapanır mı" sorusunun cevabı odur.
 */
export function OpsShellProvider({
  value,
  device,
  children,
}: {
  value: Omit<OpsShellValue, 'nav'>;
  device: Device;
  children: ReactNode;
}) {
  const resolved = useDevice(device);
  const [open, setOpen] = useState(false);

  // Sayfa değişince çekmece KAPANIR: bir bağlantıya basıp yeni ekrana geçtiğinde rayın açık kalması,
  // gittiğin yeri örten bir menü bırakırdı.
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  const nav = useMemo(
    () => (resolved === 'mobile' ? { open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) } : null),
    [resolved, open],
  );

  return <OpsShellContext.Provider value={{ ...value, nav }}>{children}</OpsShellContext.Provider>;
}

export function useOpsShell(): OpsShellValue | null {
  return useContext(OpsShellContext);
}
