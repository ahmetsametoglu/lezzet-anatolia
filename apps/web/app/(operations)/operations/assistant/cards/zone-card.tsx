'use client';

import type { ZoneExtendPayload } from '@lezzet/types';
import { num } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import { BandBox, BandLabel, BandNote, CardLead, Facts } from './shared';

/** Bantta gösterilen posta kodu sayısı — dörtten fazlası "+N" olur, bant iki satırı aşmasın. */
const ZONE_CODES = 4;

/**
 * BÖLGE GENİŞLETME — kararın konusu coğrafya ama kartın konusu TALEP.
 *
 * ── ÜÇ SORUN BİRDEN DÜZELTİLDİ (kullanıcı 11.08: "büyük bir problem var") ───
 * ① **Bandı yoktu:** asistanın cümlesi + üç künye satırı, yani ızgarada yarı boş bir kutu.
 * ② **Kodlar tek bir künye DEĞERİNE diziliydi** (`67500 · 67380 · …`) ve beş kodda o satır sarıp
 *   kartın boyunu tek başına belirliyordu — dar sütunda sağa yaslı uzun değer, en kırılgan yerleşim.
 * ③ **En güçlü sinyal künyeye gömülüydü:** kırk yedi kişinin adres girip "buraya gelmiyor musunuz"
 *   demesi, bölge açmanın tek gerçek gerekçesi.
 *
 * Kodlar artık bandın kendisi (mono, iri, yan yana), talep bandın altında cümle. Harita kartta
 * çizilmez — diyaloğun işi.
 *
 * ── SIFIR TALEP DE BİLGİDİR ─────────────────────────────────────────────────
 * "0 istek" gören patron öneriyi rota verimliliği gerekçesiyle değerlendirir; satırı saklamak o
 * kararı elinden alırdı. Bekleyen kişi sayısı ayrı ve amber: onlara haber GİDECEK ve bu geri
 * alınamaz — bölge sonradan kapatılsa bile mesaj gitmiş olur (`ZoneExtendPayloadSchema` künyesi).
 */
export function ZoneCard({ payload }: { payload: ZoneExtendPayload }) {
  const codes = payload.postalCodes;
  const requests = codes.reduce((sum, c) => sum + (c.requestCount ?? 0), 0);
  const waiting = codes.reduce((sum, c) => sum + (c.waitingCount ?? 0), 0);
  const places = codes.map((c) => c.placeName).filter(Boolean);
  const shown = codes.slice(0, ZONE_CODES);
  const rest = codes.length - shown.length;

  return (
    <>
      <BandBox>
        <BandLabel>
          {payload.country} · {codes.length === 1 ? 'posta kodu' : `${num(codes.length)} posta kodu`}
        </BandLabel>
        <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {shown.map((code) => (
            <span key={code.postalCode} className="font-ops-mono text-ops-title font-semibold leading-none text-ops-ink">
              {code.postalCode}
            </span>
          ))}
          {rest > 0 ? <span className="font-ops-body text-ops-sm text-ops-muted">+{num(rest)}</span> : null}
        </span>
        <BandNote>{payload.zoneName}</BandNote>
      </BandBox>

      <CardLead>
        {requests === 0 ? 'Henüz talep yok — rota kararı' : `${num(requests)} kişi bu bölgeyi istedi`}
      </CardLead>

      <Facts>
        <CardFact
          label="Bekleyen"
          value={waiting > 0 ? `${num(waiting)} kişi haber bekliyor` : 'yok'}
          tone={waiting > 0 ? 'text-ops-amber' : undefined}
        />
        <CardFact label="Yer" value={places.length > 0 ? places.join(' · ') : '—'} />
        <CardFact label="Bölge" value={payload.zoneName} />
      </Facts>
    </>
  );
}
