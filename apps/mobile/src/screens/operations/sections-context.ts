import { createContext, useContext } from 'react';

import type { OperationsSection } from '@/lib/operations/sections';

/*
  Kullanıcının bölümleri, kabuğun ALTINDAKİ her ekrana. `/me` YALNIZ BİR KEZ okunur (kapı
  `(operations)/_layout.tsx`'te); sekme kabuğu ve bildirim ekranı aynı kararı bağlamdan alır.

  Neden bağlam, neden hook'u tekrar çağırmak DEĞİL: `useOperationsAccess`i her ekranda yeniden
  çağırmak ekran başına bir `/me` uçuşu demekti — üstelik iki uçuş farklı cevap verirse (rol yeni
  verilmiş) kabuk ile ekran ayrışırdı. Tek okuma, tek doğruluk.

  Neden rota parametresi DEĞİL: bölüm listesi bir adres bilgisi değil oturum bilgisidir; URL'e
  yazılırsa elle değiştirilebilir bir "yetki" gibi görünür.
*/

/** `null` = sağlayıcı yok; kapı geçilmeden bu bağlam okunmamalı. */
const OperationsSectionsContext = createContext<OperationsSection[] | null>(null);

export const OperationsSectionsProvider = OperationsSectionsContext.Provider;

/**
 * Kullanıcının açabildiği bölümler. Sağlayıcısız çağrı SESSİZCE boş dizi DÖNMEZ, fırlatır: boş
 * dizi "hiç yetkisi yok" demektir ve kapıyı hiç geçmemiş bir ekranı yetkisiz kullanıcı gibi
 * göstermek, arızayı doğru bir davranış gibi okutur (CLAUDE §1).
 */
export function useOperationsSections(): OperationsSection[] {
  const sections = useContext(OperationsSectionsContext);
  if (sections === null) {
    throw new Error('useOperationsSections yalnız operasyon kabuğunun (kapıdan geçmiş) altında çağrılabilir');
  }
  return sections;
}
