import type { UserRole } from '@lezzet/types';

/**
 * Rol kuralları (04.3) — DOMAIN §2.
 *
 * **İki eksen, tek alan.** `customer` müşteri eksenidir; `admin`/`warehouse`/`courier`/`accounting`
 * operasyon rolleridir.
 * - Müşteri ↔ personel **keskin ayrım**: aynı kişi ikisi birden olamaz.
 * - Personel içinde **çoklu rol olağandır**: depo + muhasebe aynı kişide, patron aynı zamanda admin.
 *
 * Kural veritabanında da zorlanır (check kısıtı); buradaki saf hâli arayüzün **sebebi göstermesi**
 * içindir — "veremezsin" demek yetmez, neden veremediği yazmalı.
 */

export function isOperationRole(role: UserRole): boolean {
  return role !== 'customer';
}

/** Kişi personel mi — operasyon rollerinden en az biri varsa. Operasyon yüzeyinin giriş kapısı. */
export function isStaff(roles: readonly UserRole[]): boolean {
  return roles.some(isOperationRole);
}

export type RoleSetCheck =
  | { valid: true }
  /** Rol kümesi kurala aykırı — sebep arayüzde gösterilir. */
  | { valid: false; reason: 'empty' | 'customer_with_staff' };

/**
 * Rol kümesi geçerli mi. İki kural: boş olamaz (herkes en az bir eksende yaşar) ve `customer`
 * operasyon rolleriyle birlikte duramaz.
 */
export function validateRoleSet(roles: readonly UserRole[]): RoleSetCheck {
  if (roles.length === 0) return { valid: false, reason: 'empty' };
  if (roles.includes('customer') && roles.some(isOperationRole)) {
    return { valid: false, reason: 'customer_with_staff' };
  }
  return { valid: true };
}

/**
 * Role ekleme sonucu — **müşteriye operasyon rolü verilirse `customer` DÜŞER** (ve tersi).
 * Sessizce reddetmek yerine geçişi açıkça yapar: "bu kişiyi personel yaptın" niyeti nettir.
 * Tekrarlar elenir, sıra korunur.
 */
export function withRole(roles: readonly UserRole[], role: UserRole): UserRole[] {
  const next = isOperationRole(role)
    ? roles.filter((r) => r !== 'customer') // personel yapılıyor → müşteri ekseni düşer
    : []; // müşteri yapılıyor → tüm operasyon rolleri düşer
  return [...new Set([...next, role])];
}

/**
 * Rol çıkarma. Son rol çıkarılırsa kişi eksensiz kalamaz: **`customer`a düşer** — hesap silinmez,
 * müşteri olarak yaşamaya devam eder (personellikten çıkan kişinin siparişleri ortada kalmaz).
 */
export function withoutRole(roles: readonly UserRole[], role: UserRole): UserRole[] {
  const next = roles.filter((r) => r !== role);
  return next.length > 0 ? next : ['customer'];
}
