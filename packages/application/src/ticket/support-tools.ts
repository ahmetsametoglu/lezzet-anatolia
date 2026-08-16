// `z` de porttan geliyor ve gerekçesi teknik: SDK aracın şemasını doğrularken tek zod örneği
// bekliyor, ikinci bir kopya sessizce tutmaz (`@lezzet/ai` barrel künyesi).
import { tool, z, type ToolSet } from '@lezzet/ai';
import { AddressService, OrderService, type Db } from '@lezzet/database';
import { formatShortDate } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import { ORDER_STATUS_LABELS, type Address } from '@lezzet/types';
import { readDeliveryInputs, resolveDelivery } from '../order/delivery';

/*
  DESTEK AJANININ ARAÇLARI (16.9) — modelin veriye KENDİSİ bakabildiği dar yüzey.

  ── NEDEN MCP DEĞİL ─────────────────────────────────────────────────────────
  MCP sunucusu (`apps/backend/src/mcp`) YÖNETİCİ asistanınındır: araçları toplu iş verisi döndürür
  (satış özeti, talep sinyalleri, bölge haritası) ve kendi talimatı "sahibe konuşursun, müşteriye
  asla" der. O araçları müşteriye yazan bir ajana vermek, işletme rakamlarının bir yazışmada
  ağızdan çıkması demekti. Kapısı da tek paylaşımlı anahtarla korunuyor ve "yalnız bu müşterinin
  verisi" diye daraltılamıyor. Üstelik MCP bir TAŞIMA katmanı; destek ajanı zaten aynı süreçte
  koşuyor, araya ağ koymak yalnız gecikme ve arıza yüzeyi eklerdi.

  ── DEĞİŞMEZ: KİMLİK ARGÜMAN DEĞİL, KAPANIŞTIR ──────────────────────────────
  Hiçbir aracın girdisinde `customerId` YOKTUR ve olmayacak. Araçlar istek başına, müşteri kimliği
  kapatılmış (closure) hâlde kurulur; model yalnız "benim teslimat günlerim" diye sorabilir,
  "şu kişininki" diye soramaz — çünkü soracak alan yok. Uydurulmuş bir kimlikle başkasının verisini
  okuması böylece OLANAKSIZ olur; kural veride değil imzada durur (talep kapılarının "sahiplik
  imzada" kuralının aynısı).

  ── DEĞİŞMEZ: YALNIZ OKUR ───────────────────────────────────────────────────
  Yazan araç yok ve bu bir eksiklik değil, sınırın kendisi: siparişin gününü değiştirmek gerçek bir
  operasyon kararıdır (`dispatch-actions.ts` operatörün elinde) ve sipariş değişikliği zaten devir
  tetikleyicileri arasında. Ajan gerçeği SÖYLER, taahhüdü insan verir.

  ── DEĞİŞMEZ: TUTAR YOK ─────────────────────────────────────────────────────
  Sipariş aracı numara/durum/teslim günü döndürür, tutar döndürmez — kapalı girdinin bugünkü
  kararıyla aynı (`ticket-support.ts` künyesi): para konuşulacaksa insan konuşur.

  ── BİLİNMEYEN, SIFIR DEĞİLDİR ──────────────────────────────────────────────
  Adres yoksa ya da posta kodu hiçbir aktif bölgeye düşmüyorsa araç "gün yok" DEMEZ, `bilinmiyor`
  der ve sebebini yazar. "Teslimat günü yok" cümlesi müşteriye yanlış bir kesinlik verirdi; prompt
  da bu hâlde gün söylemeyip devretmekle yükümlü (CLAUDE §1).
*/

/** Modelin gördüğü tarih biçimi — "18 Ağustos Salı". İki bilgi tek dizede: gün adı da lazım. */
function tarihAdi(iso: string): string {
  const gun = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(new Date(iso));
  return `${formatShortDate(iso, 'tr')} ${gun}`;
}

/**
 * ISO gün numarası (1=Pazartesi … 7=Pazar) → Türkçe ad.
 *
 * Sabit bir referans haftadan türetiliyor (2024-01-01 bir Pazartesi): elle yazılmış yedi elemanlı
 * bir dizi, sıralaması bir gün kayarsa hiçbir yerde hata vermeden yanlış gün söyletirdi.
 */
function gunAdi(isoGun: number): string {
  const gun = new Date(2024, 0, isoGun); // 1 Ocak 2024 = Pazartesi
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(gun);
}

/** Varsayılan adres, yoksa ilk adres — müşterinin "benim adresim" dediği tek yer. */
function birincilAdres(adresler: Address[]): Address | null {
  return adresler.find((a) => a.isDefault) ?? adresler[0] ?? null;
}

/**
 * Bir müşteriye KAPATILMIŞ araç seti.
 *
 * Çağıran talebin sahibini geçirir; model o kimliği ne görür ne değiştirebilir. Araç gövdesinde
 * hata olursa fırlatmaz — `bilinmiyor` döner ve log'a KİMLİK düşer (içerik değil): fırlatan bir
 * araç koşuyu düşürür ve müşteri cevapsız kalırdı.
 */
export function customerSupportTools(db: Db, customerId: string): ToolSet {
  return {
    teslimat_gunleri: tool({
      description:
        'Müşterinin kendi adresine hangi günler teslimat yapıldığını ve yaklaşan somut tarihleri söyler. ' +
        'Teslimat günü, rota günü ya da "ne zaman gelirsiniz" sorularında MUTLAKA bunu çağır.',
      // Girdi BOŞ ve bilerek: sorulacak tek adres müşterinin kendi adresi (künye: kimlik kapanıştır).
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const adres = birincilAdres(await new AddressService(db).listByCustomer(customerId));
          if (!adres) return { bilinmiyor: 'Müşterinin kayıtlı adresi yok — hangi adrese sorulacağı belli değil.' };

          // Rota çözümü MOTORUN işi (`resolveDelivery`): kesim saati, bölge eşleşmesi ve yaklaşan
          // tarihler orada hesaplanıyor. Burada ikinci bir kopya yazmak, checkout ile ajanın farklı
          // gün söylemesi demekti. Bölge listesi bir kez okunup GEÇİLİYOR: haftalık günleri aynı
          // listeden alacağız, iki ayrı okuma iki farklı ana ait olabilirdi.
          const inputs = await readDeliveryInputs(db);
          const cozum = await resolveDelivery(db, {
            postalCode: adres.postalCode,
            country: adres.country,
            inputs,
          });

          if (cozum.deliveryType !== 'route') {
            return {
              bilinmiyor:
                'Bu adres rota dışında (kargo bölgesi) — haftalık teslimat günü yok, gönderi kargoyla gidiyor.',
            };
          }
          const bolge = inputs.zones.find((z) => z.id === cozum.zoneId);
          return {
            adres: `${adres.postalCode} ${adres.city}`,
            haftalikGunler: (bolge?.weekdays ?? []).map(gunAdi),
            yaklasanTarihler: cozum.availableDates.map(tarihAdi),
          };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'teslimat_gunleri', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Teslimat bilgisi şu an okunamadı.' };
        }
      },
    }),

    siparislerim: tool({
      description:
        'Müşterinin son siparişlerini listeler: sipariş numarası, durumu ve teslim günü. ' +
        'Sipariş durumu, "nerede kaldı", "ne zaman gelecek" sorularında çağır. Tutar bilgisi VERMEZ.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const sayfa = await new OrderService(db).listByCustomer(customerId, { limit: 5 });
          return {
            siparisler: sayfa.rows.map((o) => ({
              numara: o.referenceNo,
              durum: ORDER_STATUS_LABELS[o.status],
              teslimGunu: o.deliveryDate ? tarihAdi(o.deliveryDate) : 'kargo (rota günü yok)',
            })),
          };
        } catch (err) {
          logger.warn(
            { context: 'application/support-tools', tool: 'siparislerim', customerId, err: String(err) },
            'destek aracı okuyamadı',
          );
          return { bilinmiyor: 'Sipariş bilgisi şu an okunamadı.' };
        }
      },
    }),
  };
}
