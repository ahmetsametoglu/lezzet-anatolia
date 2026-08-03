import 'server-only';
import { UserProfileService, serviceDb } from '@lezzet/database';

/**
 * MÜŞTERİ SEÇİCİSİNİN kaynağı — operasyon yüzeyinin ortak arama parçası.
 *
 * İki ekran aynı seçiciyi kuruyor: fiyat ekranı müşteriye özel iskonto açarken, talepler ekranı
 * elle talep açarken. İkisi de "kim" sorusunu soruyor ve cevabı aynı biçimde göstermek zorunda —
 * ikinci bir kopya yazılsaydı bir gün biri telefonu, öteki e-postayı ikinci satıra koyardı ve aynı
 * müşteri iki ekranda farklı görünürdü (CLAUDE.md §1).
 *
 * **Action DEĞİL, okuma.** Guard ve `{ data, error }` sarmalı çağıran ekranın kendi `actions.ts`'inde
 * kalır (CLAUDE.md §2: server action'lar sayfa klasöründe kolokasyon); paylaşılan şey yalnız sorgu
 * ve satırın seçicideki hâli.
 */

/** Müşteri arama sonucu — seçicide gösterilen asgari kimlik. */
export interface CustomerOption {
  id: string;
  name: string;
  hint: string;
  isCompany: boolean;
}

export async function searchCustomerOptions(term: string): Promise<CustomerOption[]> {
  const rows = await new UserProfileService(serviceDb()).search(term);
  return rows.map((r) => ({
    id: r.id,
    // Adsız kayıt da bulunabilmeli: telefonla açılmış bir müşteri profilinin adı boş olabilir.
    name: r.name || r.phone || r.email || r.id.slice(0, 8),
    // İkinci satır KİMLİĞİ ayırt eder: aynı adlı iki müşteri telefonuyla ayrılır.
    hint: [r.phone, r.email].filter(Boolean).join(' · ') || 'iletişim bilgisi yok',
    isCompany: Boolean(r.companyInfo),
  }));
}
