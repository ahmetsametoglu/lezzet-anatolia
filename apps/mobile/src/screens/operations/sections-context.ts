import { createContext, useContext } from 'react';

import type { OperationsSection } from '@/lib/operations/sections';

/*
  Kullanıcının OTURUM KÜNYESİ, kabuğun ALTINDAKİ her ekrana. `/me` YALNIZ BİR KEZ okunur (kapı
  `(operations)/_layout.tsx`'te); sekme kabuğu, bildirim ekranı ve kurye üstbaşlığı aynı kararı
  bağlamdan alır.

  Neden bağlam, neden hook'u tekrar çağırmak DEĞİL: `useOperationsAccess`i her ekranda yeniden
  çağırmak ekran başına bir `/me` uçuşu demekti — üstelik iki uçuş farklı cevap verirse (rol yeni
  verilmiş) kabuk ile ekran ayrışırdı. Tek okuma, tek doğruluk.

  Neden rota parametresi DEĞİL: bölüm listesi bir adres bilgisi değil oturum bilgisidir; URL'e
  yazılırsa elle değiştirilebilir bir "yetki" gibi görünür.

  ── AD DA BURADA (21.10) ────────────────────────────────────────────────────
  Bağlam bir tek alan taşıyordu (`sections`) ve kurye üstbaşlığı personelin adını isteyince
  seçenekler ölçüldü: ikinci bir bağlam açmak aynı kaynaktan (`/me`) beslenen iki sağlayıcı
  demekti — biri güncellenip öteki kalabilirdi. Bağlamın DEĞERİ genişletildi, sayısı değil;
  `useOperationsSections` imzası aynen korundu, yani sekme kabuğu ve bildirim ekranı hiç
  değişmedi.
*/

interface OperationsSession {
  sections: OperationsSection[];
  /** Personelin görünen adı (`/me.name`) — üstbaşlıkta kısaltılarak yazılır. */
  userName: string;
}

/** `null` = sağlayıcı yok; kapı geçilmeden bu bağlam okunmamalı. */
const OperationsSessionContext = createContext<OperationsSession | null>(null);

export const OperationsSessionProvider = OperationsSessionContext.Provider;

/**
 * Sağlayıcısız çağrı SESSİZCE boş değer DÖNMEZ, fırlatır: boş bölüm listesi "hiç yetkisi yok"
 * demektir ve kapıyı hiç geçmemiş bir ekranı yetkisiz kullanıcı gibi göstermek, arızayı doğru bir
 * davranış gibi okutur (CLAUDE §1).
 */
function useOperationsSession(): OperationsSession {
  const session = useContext(OperationsSessionContext);
  if (session === null) {
    throw new Error('Operasyon oturum bağlamı yalnız kabuğun (kapıdan geçmiş) altında okunabilir');
  }
  return session;
}

/** Kullanıcının açabildiği bölümler. */
export function useOperationsSections(): OperationsSection[] {
  return useOperationsSession().sections;
}

/** Personelin görünen adı — kurye üstbaşlığının kuyruğu (v2:38). */
export function useOperationsUserName(): string {
  return useOperationsSession().userName;
}
