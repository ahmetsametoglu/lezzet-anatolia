import type { Href } from 'expo-router';

import type { OperationsSection } from '@/lib/operations/sections';

/*
  GİRİŞTEN SONRA NEREYE — personelin indiği bölümün ADRESİ (21.32; operasyon uygulamasına 21.310'da taşındı).

  Web'in modeli tek `/connexion`dur ve girişte `staff_role`e göre yönlendirir (CLAUDE §2). Mobilde
  bu karar hiç yazılmamıştı: personel giriş yapıyor, müşteri sekmesine dönüyor ve operasyon kabuğuna
  giden hiçbir bağlantı olmadığı için oraya ASLA ulaşamıyordu. Kabuğun kendi künyesi de bunu
  `BEKLEYEN(21.13)` diye kaydetmişti — bu dosya o borcun giriş yarısıydı.

  ── TEK DURUM MAKİNESİ (21.312) ─────────────────────────────────────────────
  Kod girişi ve Google dönüşü artık aynı ekranın durum makinesinde (`use-operations-login.hook.ts`): iki tetik
  noktası tek yerde birleşti, "Google ile girince neden başka yere gidiyor" farkı doğamaz. İniş bölümü
  `operationsSectionsOf`un İLK bölümüdür — tasarımın sırası, rollerin dizideki sırası değil (kural ve testi
  `lib/operations/sections.ts`te); kökün yönlendirmesi (`app/(operations)/index.tsx`) aynı adresi sorar.
  `operationsHomeRoute` bu yüzden kalktı: çağıranları eski giriş ve dönüş rotalarıydı.

  ── ROL KARARINI KENDİ HESAPLAMAZ ───────────────────────────────────────────
  `operationsSectionsOf` zaten var ve kabuğun kapısı da onu okuyor. İkinci bir "personel mi" kuralı yazmak
  (`roles.includes('admin') || …`) iki kaynağın ayrışması demekti: yeni bir personel rolü eklendiği gün kapı
  açılır ama yönlendirme çalışmazdı.

  ── KÜNYE SORUSU MÜŞTERİNİNDİR ──────────────────────────────────────────────
  Ad/telefon eksikliği personele SORULMAZ: künye akışı müşterinin sipariş yolunun ön şartıdır (posta
  etiketi, kurye telefonu) ve o yol bu uygulamada hiç yok.
*/

/**
 * Bir bölümün adresi. Desen tek yerde durur (`/${section}`): ikinci bir çağıran doğduğunda
 * (kapsam belirsizken depo hub'ının sunduğu çıkış yolları, 30.08) aynı şablonu elle yazmak,
 * adres düzeni değiştiği gün birinin geride kalması demekti (CLAUDE §1).
 *
 * Rota tipi `Href`e sabitlenir: bölüm adresleri `(operations)/(sections)` altında doğuyor ve
 * typedRoutes ilk `expo start`ta üretiliyor.
 */
export function operationsSectionRoute(section: OperationsSection): Href {
  return `/${section}` as Href;
}
