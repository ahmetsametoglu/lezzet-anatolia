import type { B2bQueueRow } from '@lezzet/types';
import type { OperationsStatusTone } from '@/components/operations/status-badge';
import { operationsTheme } from '@/theme/unistyles';
import { fillCopy } from '@/screens/operations/copy';
import { managementCopy } from './copy';

/*
  KURUMSAL BAŞVURU — ÇEVİRİ TABLOLARI (21.217).

  Üç çeviri de burada, iki ekranda değil: liste ve kart aynı bayrağı, aynı hâli ve aynı yaşı
  yazıyor. Ekranların içine dağılsalardı biri bir gün ötekinden farklı bir renk ya da farklı bir
  eşik kullanırdı (CLAUDE §1).
*/

const t = managementCopy;

/** Motorun üç sinyal tonu → şeridin rengi. Renk tek başına anlam TAŞIMAZ; rozet etiketi okunur. */
export function b2bFlagTone(tone: B2bQueueRow['flag']['tone']): string {
  if (tone === 'bad') return operationsTheme.colors.error;
  if (tone === 'warn') return operationsTheme.colors.terracotta;
  return operationsTheme.colors.olive;
}

/**
 * Bayrağın ROZET tonu — şeridin rengiyle aynı yargı, okunabilir hâli.
 *
 * İkisi birlikte çiziliyor ve bu bilinçli: renk tek başına anlam taşımaz. Cihaz turunda (07.09)
 * kartta yalnız şerit vardı ve kuralın kendisi çiğneniyordu — rozet o turda eklendi.
 */
export function b2bFlagBadgeTone(tone: B2bQueueRow['flag']['tone']): OperationsStatusTone {
  if (tone === 'bad') return 'error';
  if (tone === 'warn') return 'warn';
  return 'active';
}

/** Bayrak ŞERİDİNİN zemini — tonun kendi soluk yüzeyi (tasarım banttı, rozet değil). */
export function b2bFlagBg(tone: B2bQueueRow['flag']['tone']): string {
  if (tone === 'bad') return operationsTheme.colors['error-bg'];
  if (tone === 'warn') return operationsTheme.colors['warning-bg'];
  return operationsTheme.colors['success-bg'];
}

/**
 * Sinyal rozetinin SİMGESİ — renk tek başına anlam taşımaz (tasarım kuralı), rozet de taşımamalı.
 *
 * Tasarımın üç simgesi (`✓ – !`) kendi üç tonuna göreydi; motorun tonları başka bir ayrım yapıyor —
 * `warn` "eksik/doğrulanmamış", `bad` "onaya engel". İkisini aynı `!` ile çizmek, ayrımı yalnız
 * renge bırakırdı; `bad` bu yüzden `×` alıyor. Değer metni zaten yanında ve son sözü o söylüyor.
 */
export function b2bSignalGlyph(tone: B2bQueueRow['flag']['tone']): string {
  if (tone === 'bad') return '×';
  if (tone === 'warn') return '!';
  return '✓';
}

/** Başvurunun dört hâli → kitin rozet tonu. */
export function b2bStatusTone(status: B2bQueueRow['status']): OperationsStatusTone {
  if (status === 'approved') return 'active';
  if (status === 'rejected') return 'error';
  if (status === 'pending') return 'pending';
  return 'idle';
}

/**
 * BAŞVURU YAŞI — tasarımın *"en eski 3 saat önce"* cümlesinin parçası.
 *
 * Damga YOKSA "tarihi yok" denir, "az önce" DENMEZ: ölçülemeyen bir değer sıfır değildir (CLAUDE §1)
 * ve taze göstermek, unutulmuş bir başvuruyu kuyruğun en altına iterdi.
 *
 * Eşikler kaba ve bilinçli: kuyrukta gereken şey dakikanın kendisi değil "unutulmuş mu" cevabı.
 */
export function b2bAgeText(appliedAt: string | null, now: number = Date.now()): string {
  if (appliedAt === null) return t.b2b.age.unknown;
  const gecen = now - new Date(appliedAt).getTime();
  if (Number.isNaN(gecen)) return t.b2b.age.unknown;

  const dakika = Math.floor(gecen / 60_000);
  if (dakika < 1) return t.b2b.age.now;
  if (dakika < 60) return fillCopy(t.b2b.age.minutes, { n: String(dakika) });
  const saat = Math.floor(dakika / 60);
  if (saat < 24) return fillCopy(t.b2b.age.hours, { n: String(saat) });
  return fillCopy(t.b2b.age.days, { n: String(Math.floor(saat / 24)) });
}
