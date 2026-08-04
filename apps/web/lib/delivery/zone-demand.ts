import 'server-only';
import { DeliveryZoneService, PostalCodeDemandService, ZoneNoticeService, serviceDb } from '@lezzet/database';
import { isInRoute } from '@lezzet/domain-core';
import type { Country } from '@lezzet/types';

/**
 * **Bölge dışı talep tablosunun okuma kapısı** (19.21 · operasyon şeridinin talebi 04.08).
 *
 * Cevapladığı soru bir davranış sorusu değil bir OPERASYON kararı: *"burayı açmalı mıyım."* Bu
 * yüzden tablo Depolar ekranında yaşıyor (`ANALYTICS §6`: karar orada veriliyor), analitikte
 * yalnız işaret + köprü duruyor.
 *
 * ── İKİ SAYI, VE TOPLANMAZLAR ────────────────────────────────────────────────
 * `requestCount` **anonim** bir sayaçtır (kaç kez soruldu — aynı ziyaretçinin tekrarı ayrı sayılır,
 * çünkü tekilleştirmek kimlik tutmayı gerektirirdi); `waitingCount` **kimlikli** bekleyişlerdir
 * (`zone_notice`, izinli). İkisini tek bir "ilgi" sayısına indirmek anonim sayacı geriye dönük
 * kimliklendirmek olurdu — `DATA_MODEL`'in kendi emsali bu ikiliyi ayrı tutuyor.
 *
 * ── RPC YOK, ÜÇ SINIRLI SORGU VAR ────────────────────────────────────────────
 * `STACK §13`'ün RPC eşiği burada karşılanmıyor: üç kümenin üçü de sınırlı — talep listesi bir
 * liderlik tablosu (tavanı çağrıda), bölgeler operatörün elle kurduğu küme, bekleyenler ise zaten
 * az. N+1 yok, toplama yok; birleştirme uygulamada ucuz.
 */

export interface ZoneDemandRow {
  postalCode: string;
  /** Kaç kez soruldu — anonim yoğunluk, "kaç kişi" DEĞİL. */
  requestCount: number;
  /** Kaç kişi haber bekliyor — kimlikli ve izinli; `requestCount` ile TOPLANMAZ. */
  waitingCount: number;
  /**
   * Kod bugün AKTİF bir rotanın içinde mi. Kapsananlar listeden düşürülmüyor: operatör "buraya
   * zaten gidiyoruz ama talep yoğun" bilgisini de görmek isteyebilir (talebin kendi isteği).
   */
  covered: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Ülke bilgisi talep sayacında YOK (tablo yalnız kodu tutuyor, `0023`). Kapsama kontrolü ülke
 * ister; iki ülke de denenir ve biri tutarsa kapsanmış sayılır.
 *
 * **Neden tabloya ülke eklenmedi:** sayaç ziyaretçi kodu yazarken artıyor ve o anda ülke henüz
 * ÇÖZÜLMEMİŞ olabilir (ülke koddan türetiliyor). Kaydedilmemiş bir bilgiyi kaydediyormuş gibi
 * yapmak yerine, okuma tarafı iki ihtimali de sorar — küme küçük, maliyet yok.
 */
const COUNTRIES: readonly Country[] = ['FR', 'DE'];

export async function readZoneDemand(limit = 50): Promise<ZoneDemandRow[]> {
  const db = serviceDb();
  const [demands, zones, waiting] = await Promise.all([
    new PostalCodeDemandService(db).listTop(limit),
    // Bölgeler operatörün elle kurduğu, doğal tavanı olan bir küme → tek turda (`CLAUDE §1`).
    new DeliveryZoneService(db).listWithCodes({ activeOnly: true }),
    new ZoneNoticeService(db).pendingCountByPostalCode(),
  ]);

  return demands.map((d) => ({
    postalCode: d.postalCode,
    requestCount: d.requestCount,
    waitingCount: waiting.get(d.postalCode) ?? 0,
    // Eşleştirme MOTORUN işi (`domain-core/delivery`): kendi karşılaştırmamızı yazsaydık üçüncü bir
    // kopya olurdu ve kopyalar bir gün ayrışır (aynı gerekçe `b2b-check.ts`'te de yazılı).
    covered: COUNTRIES.some((country) => isInRoute({ country, postalCode: d.postalCode }, zones)),
    firstSeenAt: d.firstSeenAt,
    lastSeenAt: d.lastSeenAt,
  }));
}
