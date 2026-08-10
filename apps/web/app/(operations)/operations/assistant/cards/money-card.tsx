'use client';

import type { MoneyMovementPayload } from '@lezzet/types';
import { money, shortDate } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import { BandBox, BandLabel, BandNote, CardLead, Facts } from './shared';

/** Para hareketinin türü — dilekçedeki kapalı küme, operatörün diliyle. */
const MONEY_TYPE: Record<MoneyMovementPayload['type'], string> = {
  expense: 'Gider',
  transfer: 'Transfer',
  capital: 'Sermaye',
  misc: 'Diğer',
};

/**
 * PARA HAREKETİ — görseli OLMAYAN ilk tip (22.11).
 *
 * ── GÖRSELİN YERİNİ TUTAR ALIYOR ────────────────────────────────────────────
 * Bugüne kadar kurulan kart dili fotoğraf üzerineydi: fırsat ürünü, paket kalemlerini gösteriyor.
 * Defter satırının fotoğrafı yok ve olamaz — ama bandın YÜKSEKLİĞİ standart (`MEDIA_H`, kullanıcı
 * kararı 10.08) ve ızgarada hizayı o tutuyor. Bandı boş bırakmak kartı ötekilerden 128 piksel kısa
 * yapardı; onun yerine bandı **kararın kendisi** dolduruyor: tür, tutar, paranın yolu. Bir para
 * hareketinde tanımayı sağlayan şey zaten fotoğraf değil bu üçlü.
 *
 * ── TUTAR RENKLİ: GİDER KIRMIZI, GELİR YEŞİL (kullanıcı kararı 10.08) ───────
 * Bir tur yalnız işaret vardı (`−`/`+`) ve gerekçesi "kira ödemek arıza değil, alarm rengi gereksiz
 * korku yaratır"dı. Kullanıcı düzeltti: *"gider ve gelir kavramı dolayısıyla rakamı
 * renklendirebilirsin."* Doğrusu bu — burada renk bir UYARI değil bir SINIFLANDIRMA: muhasebenin
 * kendi dili kırmızıyı "çıkan", yeşili "giren" için kullanır ve operatör o dili zaten biliyor.
 * Zarar satırındaki amber ile karışmıyorlar, çünkü o gerçekten bir uyarıdır (beklenmeyen sonuç),
 * bu ise hareketin türü.
 *
 * ── TRANSFERDE PARANIN YOLU GÖRÜNÜR ─────────────────────────────────────────
 * `Kasa → Crédit Mutuel`. Hedef hesabın ADI dilekçeye 22.11'de eklendi; öncesinde yalnız kimlik
 * yazılıyordu ve transfer önerisi "Kasa → uuid" diye okunuyordu, yani onaylanamazdı.
 *
 * ── AÇIKLAMA CÜMLESİ KALIYOR ────────────────────────────────────────────────
 * Öteki tiplerde cümle kalktı, burada kalıyor ve sebebi tipin kendisi: "Ağustos ayı depo kirası —
 * STR deposu" bilgisinin sayıya çevrilebilir bir karşılığı yok. Kategori (`kira`) neyin ödendiğini
 * söyler, açıklama HANGİSİNİN ödendiğini.
 *
 * ── BOŞ ALAN DA GÖSTERİLİR ──────────────────────────────────────────────────
 * Kategori/karşı taraf/değer tarihi yoksa satır "—" ile duruyor, gizlenmiyor (22.10 ilkesi).
 * Defterde bu daha da ağır basıyor: kategorisiz bir gider ay sonunda hiçbir raporda görünmez.
 */
export function MoneyCard({ payload }: { payload: MoneyMovementPayload }) {
  const out = payload.direction === 'out';
  // Paranın yolu: transferde iki hesap, ötekilerde tek. Ok işareti yönü kelimeye gerek bırakmıyor.
  const route = payload.counterAccountName
    ? `${payload.accountName} → ${payload.counterAccountName}`
    : payload.accountName;

  return (
    <>
      <BandBox>
        <BandLabel>{MONEY_TYPE[payload.type]}</BandLabel>
        <span
          className={`font-ops-mono text-ops-title font-semibold leading-none ${out ? 'text-ops-red' : 'text-ops-olive-dark'}`}
        >
          {out ? '−' : '+'}
          {money(payload.amountCents)}
        </span>
        {/* Hesap tutarın ALTINDA ve sönük: "ne kadar" ile "nereden" ardışık iki soru. Künyeye
            indirilseydi kararın yarısı ayraçın altında kalırdı — aynı tutar kasadan çıkmakla
            bankadan çıkmak ayrı şeylerdir. */}
        <BandNote>{route}</BandNote>
      </BandBox>

      {payload.description ? <CardLead muted>{payload.description}</CardLead> : null}

      <Facts>
        <CardFact label="Kategori" value={payload.category ?? '—'} />
        <CardFact label="Karşı taraf" value={payload.counterpartyName ?? '—'} />
        <CardFact label="Değer tarihi" value={payload.valueDate ? shortDate(payload.valueDate) : '—'} />
      </Facts>
    </>
  );
}
