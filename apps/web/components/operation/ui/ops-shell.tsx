'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { UserRole } from '@lezzet/types';
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
// Operasyon web'i masaüstü-yalnız (06.08): telefon çekmecesi/hamburger modu söküldü; mobil deneyim
// native uygulamada — `docs/uygulama`. Kabuk artık tek (masaüstü) modda, ray hep açık.
interface OpsShellValue {
  user: { email: string; roles: readonly UserRole[] };
  warehouse: WarehouseContextPickerProps;
  /** Zilin canlı kanalı (14.15) — adı sunucu sırrından türetilir, layout burada teslim eder. */
  notifications: { channel: string };
}

const OpsShellContext = createContext<OpsShellValue | null>(null);

export function OpsShellProvider({ value, children }: { value: OpsShellValue; children: ReactNode }) {
  return <OpsShellContext.Provider value={value}>{children}</OpsShellContext.Provider>;
}

export function useOpsShell(): OpsShellValue | null {
  return useContext(OpsShellContext);
}
