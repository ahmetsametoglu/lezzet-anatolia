import { createContext, useContext } from 'react';

import type { StaffWarehouse } from '@lezzet/types';

import type { OperationsSection } from '@/lib/operations/sections';
import { useChosenWarehouse } from '@/lib/operations/warehouse-choice';

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
  /**
   * Personelin e-postası (`/me.email`) — kimlik menüsünün ikinci satırı (21.97).
   *
   * Ad TEK BAŞINA yetmiyor: paylaşılan bir cihazda iki depocunun adı da "Yusuf" olabilir ve
   * "yanlış hesapla çalışmak" gerçek bir hâl (webin aynı ölçümü, `page-header.tsx` künyesi).
   * E-posta hesabın kendisidir, adı değil. Değer ZATEN kapının okuduğu cevapta duruyor; ekran
   * ikinci bir uçuş yapmasın diye bağlamın DEĞERİ genişletildi, sayısı değil (21.10 emsali).
   *
   * `null` OLABİLİR ve boş dizeye ÇEVRİLMEDİ: sözleşme öyle diyor (`MeSchema.email`) ve okuyan
   * taraf "yazılmamış" ile "boş" arasındaki farkı görmeli — bilinmeyen bir değeri bilinen bir
   * boşluk gibi göstermek, CLAUDE §1'in yasakladığı şeyin ta kendisi. Menü o satırı hiç çizmez.
   */
  userEmail: string | null;
  /**
   * **Personelin çalışabileceği tesisler** (30.08) — kapsam seçicisinin ve üstbaşlık kuyruğunun
   * ("DEPO · STRASBOURG MERKEZ") ortak kaynağı.
   *
   * Kapsam `/me`den DEĞİL kendi ucundan gelir (`/operations/scope`; `/me` operasyon alanı taşımaz
   * — `me-api.schema.ts` künyesi) ama yine BU bağlamda durur, üçüncü bir sağlayıcıda değil:
   * 21.10'un kararı aynen geçerli — *bağlamın DEĞERİ genişletilir, sayısı değil.* Beş ekran aynı
   * adı istiyor; her biri kendi okumasını yapsaydı beş uçuş ve ayrışabilen beş cevap olurdu.
   *
   * Boş dizi = kapsam okunamadı ya da personelin seçebileceği tesis yok. İkisi de aynı sonucu
   * doğurur (seçici çizilmez, kuyruk yazılmaz) ve ayrımı ekranda gösterilecek bir şey değil.
   */
  warehouses: StaffWarehouse[];
  /**
   * **Kapsamın TEK BAŞINA çözdüğü depo** — kuralı sunucudaki depo kapısı veriyor
   * (`warehouseGuard`: *"kapsamda tek depo varsa o, değilse söylenmeli"*), istemci onu yeniden
   * hesaplamaz. `null` = seçim gerekiyor.
   *
   * İstemcide "listede bir tane varsa odur" diye yazılsaydı kural iki yerde yaşardı ve ayrıştığı
   * gün üstbaşlıkta yazan ad, uçların gerçekte okuduğu depo OLMAYABİLİRDİ — bir depocuya yanlış
   * tesisin adını göstermek, ekranın güvenilirliğini kökten kaybetmesidir.
   */
  resolvedWarehouseId: string | null;
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

/**
 * **Personelin BU AN çalıştığı tesis** — kapsamın çözdüğü depo ya da personelin seçtiği depo.
 *
 * Sıra bilinçli: **seçim önce.** Kapsam tek bir tesisse zaten seçim yoktur (`chosen === null`) ve
 * çözüm okunur; kapsam çoksa çözüm `null`dır ve seçim okunur. İkisinin aynı anda dolu olduğu tek
 * hâl, seçim yaptıktan sonra kapsamı tek tesise düşürülen personeldir — orada da doğru cevap
 * KAPININ çözdüğü depodur; ama o hâlde seçim `loadWarehouseChoice` tarafından zaten düşürülmüş
 * olur (kapsamda değilse silinir), yani sıra pratikte çakışmaz.
 *
 * Dönen değer bir KİMLİK değil AD: çağıranların tamamı üstbaşlık kuyruğu yazıyor. `null` = tesis
 * belli değil (seçim yok ve kapsam çözmüyor) ya da kapsam okunamadı → **kuyruk hiç yazılmaz**,
 * uydurma bir ad yazılmaz (CLAUDE §1).
 *
 * `useOperationsIdentity`e KATILMADI ve bu bilinçli: kimlik "kim olduğun"u taşır (ad · e-posta ·
 * açılabilen bölümler) ve kimlik menüsünün künyesidir; tesis "nerede çalıştığın"dır ve menüde
 * değil BAŞLIKTA yazar.
 */
export function useOperationsWorkplace(): string | null {
  const { warehouses, resolvedWarehouseId } = useOperationsSession();
  const chosen = useChosenWarehouse();
  const activeId = chosen ?? resolvedWarehouseId;
  return warehouses.find((warehouse) => warehouse.id === activeId)?.name ?? null;
}

/**
 * **Kapsam seçicisinin verisi** — hangi tesisler seçilebilir, hangisi seçili.
 *
 * ARAÇLAR SÜZÜLÜR: kuryenin kapsamında panelvanı da vardır (`seed/people.ts`) ve araç bir DEPO
 * seçicisinde seçenek olamaz — araçtan satış yapılır, ama "bugün hangi depodayım" sorusunun
 * cevabı bir araç değildir. Süzgeç burada, sunucuda değil: uç ayrımı `kind` ile bildiriyor ve
 * aracını isteyen başka bir yüzey (yerinde satış) aynı listeyi okuyabilsin diye küme kırpılmıyor
 * (`operations-api.schema.ts` künyesi).
 */
export function useWarehouseOptions(): StaffWarehouse[] {
  return useOperationsSession().warehouses.filter((warehouse) => warehouse.kind === 'facility');
}

/**
 * Kimlik menüsünün künyesi: ad · e-posta · açılabilen bölümler (21.97).
 *
 * Rol ETİKETİ değil BÖLÜM etiketi dönüyor ve bu bilinçli. Webin karşılığı rolleri yazıyor
 * (`ops-nav.roleText`) ama o sözlük web UI modülünde yaşıyor; ikinci bir kopyasını buraya yazmak
 * nüsha olurdu (CLAUDE §1) ve iki yüzey bir gün ayrışırdı. Kabuk zaten bölümleri hesaplamış
 * durumda ve bu yüzeyde daha DOĞRU olan da o: kullanıcıya "hangi şapkan var" değil, "burada
 * neyi açabiliyorsun" söyleniyor — menünün altındaki köprüler de tam olarak onun sınırı.
 */
export function useOperationsIdentity(): { name: string; email: string | null; sections: OperationsSection[] } {
  const { userName, userEmail, sections } = useOperationsSession();
  return { name: userName, email: userEmail, sections };
}
