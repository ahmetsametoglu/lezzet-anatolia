import type { Href } from 'expo-router';

import { operationsSectionsOf, type OperationsSection } from '@/lib/operations/sections';
import type { Me } from '@/lib/api/me';

/*
  GİRİŞTEN SONRA NEREYE — iki yüzeyin ayrıldığı tek nokta (21.32).

  Web'in modeli tek `/connexion`dur ve girişte `staff_role`e göre yönlendirir (CLAUDE §2). Mobilde
  bu karar hiç yazılmamıştı: personel giriş yapıyor, müşteri sekmesine dönüyor ve operasyon kabuğuna
  giden hiçbir bağlantı olmadığı için oraya ASLA ulaşamıyordu. Kabuğun kendi künyesi de bunu
  `BEKLEYEN(21.13)` diye kaydetmişti — bu dosya o borcun giriş yarısı.

  ── KARAR BURADA, YÖNLENDİRME ÇAĞIRANDA ─────────────────────────────────────
  İki tetik noktası var (OTP girişi ve OAuth dönüşü) ve ikisi de aynı soruyu soruyor. Kopyalansaydı
  bir gün ayrışırdı ve fark, "Google ile girince neden operasyona gitmiyor" diye aranırdı — webin
  bir süre iki OTP kopyası taşımasının aynı hikâyesi (`otp-actions.ts` künyesi).

  ── ROL KARARINI KENDİ HESAPLAMAZ ───────────────────────────────────────────
  `operationsSectionsOf` zaten var ve kabuğun kapısı da onu okuyor. Burada ikinci bir "personel mi"
  kuralı yazmak (`roles.includes('admin') || …`) iki kaynağın ayrışması demekti: yeni bir personel
  rolü eklendiği gün kapı açılır ama yönlendirme çalışmazdı.

  ── KÜNYE SORUSU MÜŞTERİNİNDİR ──────────────────────────────────────────────
  Ad/telefon eksikliği personele SORULMAZ: künye akışı sipariş yolunun ön şartıdır (posta etiketi,
  kurye telefonu — `use-profile-setup-gate.hook` künyesi) ve personel o yoldan geçmez. Bu yüzden
  çağıran önce buraya sorar; operasyon cevabı gelirse künye kapısı hiç açılmaz.
*/

/**
 * Kullanıcının bölümleri varsa kabuğun İLK bölümü, yoksa `null` (çağıran müşteri akışını sürdürür).
 *
 * İlk bölüm `OPERATIONS_SECTIONS` sırasındandır, yani tasarımın sırası (Kurye → Depo → Yönetim →
 * Para) — rollerin dizideki sırası değil. Çok rollü personel her girişte AYNI yere iner; sunucu
 * `roles`u başka sırayla döndürdüğü gün açılış bölümü değişmez.
 *
 * Rota tipi `Href`e sabitlenir: bölüm adresleri `(operations)/(sections)` altında doğuyor ve
 * typedRoutes ilk `expo start`ta üretiliyor (künye emsali: `use-profile-setup-gate.hook`).
 */
export function operationsHomeRoute(me: Pick<Me, 'roles'>): Href | null {
  const [first] = operationsSectionsOf(me.roles);
  return first === undefined ? null : operationsSectionRoute(first);
}

/**
 * Bir bölümün adresi. Desen tek yerde durur (`/${section}`): ikinci bir çağıran doğduğunda
 * (kapsam belirsizken depo hub'ının sunduğu çıkış yolları, 30.08) aynı şablonu elle yazmak,
 * adres düzeni değiştiği gün birinin geride kalması demekti (CLAUDE §1).
 */
export function operationsSectionRoute(section: OperationsSection): Href {
  return `/${section}` as Href;
}
