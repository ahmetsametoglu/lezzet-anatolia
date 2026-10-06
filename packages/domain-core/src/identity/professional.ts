import type { CompanyInfo, CustomerType } from '@lezzet/types';

/**
 * Profesyonel müşteri: şirket tipinde ya da şirket künyesi taşıyan; iki ölçüt ayrışabildiği için hangisi şirket derse odur. Tüketici
 * promosyonları (kampanya, kupon, puan ve puana bağlı davetler) ona kapalıdır; veritabanının `customer_is_professional`ı aynı kuraldır.
 */
export function isProfessionalCustomer(customer: { type: CustomerType; companyInfo: CompanyInfo | null } | null | undefined): boolean {
  return customer != null && (customer.type === 'company' || customer.companyInfo !== null);
}
