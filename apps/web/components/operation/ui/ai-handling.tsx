'use client';

import type { ReactNode } from 'react';
import { TICKET_HANDLER_LABELS, type TicketHandler } from '@lezzet/types';
import type { MultiToggleOption } from '@/components/operation/form/multi-toggle';

/**
 * AI yürütme modunun ORTAK parçaları (kullanıcı kararı 16.08) — Talepler ve WhatsApp ekranı aynı
 * üçlüyü (İnsan · Hibrit · AI) ve aynı taslak kartını okur; iki kopya bir gün ayrışırdı.
 *
 * Desenin kaynağı MOBİL çizim (`Operasyon Mobil v2` YZ önerisi, v2:548): web çizimleri yalnız özerk
 * modeli (AI rozeti + Devral) çiziyordu; hibrit taslak deseni kullanıcı kararıyla mobilden taşındı.
 */

/**
 * Mod anahtarının seçenekleri — üçü de her zaman açık: mod bir İZİN değil, operatörün kararıdır ve
 * motor (16.5) hangi talebi/sohbeti nasıl yürüteceğini buradan okuyacak. Sözlük şemadan
 * (`TICKET_HANDLER_LABELS`) — yeni bir mod eklendiğinde burası kendiliğinden genişler.
 */
export function handlerOptions(busy: boolean): MultiToggleOption<TicketHandler>[] {
  return (Object.keys(TICKET_HANDLER_LABELS) as TicketHandler[]).map((key) => ({
    key,
    label: TICKET_HANDLER_LABELS[key],
    disabled: busy,
  }));
}

interface AiDraftCardProps {
  draft: string;
  /** Kartın eylem satırı — ekrana göre değişir: talepte "Cevaba çevir / Düzenleyerek gönder", WhatsApp'ta "kutuya taşı". */
  children: ReactNode;
}

/**
 * Hibrit modun taslak kartı — mobildeki YZ önerisi baloncuğunun web hâli.
 *
 * Kesikli çerçeve bilinçli: taslak olduğu ŞEKLİNDEN okunmalı — dolu bir balonla karışsaydı operatör
 * onu gönderilmiş sanırdı. Mor = makine konuştu (envanter renk sözlüğü). Başlık cümlesi güvencenin
 * kendisi: onaylanmadan hiçbir şey müşteriye gitmez.
 */
export function AiDraftCard({ draft, children }: AiDraftCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-dashed border-ops-violet-line bg-ops-violet-bg px-3.5 py-3">
      <span className="font-ops-display text-ops-micro font-bold tracking-wide text-ops-violet">
        AI TASLAĞI — onaylamadan müşteriye gitmez
      </span>
      <p className="font-ops-body text-ops-sm leading-relaxed text-ops-strong">{draft}</p>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
