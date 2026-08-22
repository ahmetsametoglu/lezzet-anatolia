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
 * Mod anahtarının seçenekleri. Sözlük şemadan (`TICKET_HANDLER_LABELS`) — yeni bir mod eklendiğinde
 * burası kendiliğinden genişler.
 *
 * Mod bir İZİN değil operatörün kararıdır; ama karar verilebilmesi için **arkasında bir motor
 * olmalı**. `unavailable`, o motorun henüz olmadığı modu kapatır ve SEBEBİNİ taşır: seçenek görünür
 * kalır (`MultiToggle.disabled` künyesi — gizlemek kontrolün genişliğini ekrandan ekrana oynatır),
 * ipucu neden olmadığını söyler.
 *
 * İhtiyaç sohbetten geldi (15.13 · 22.08): sohbette `ai` seçilebiliyordu, rozet takılıyordu, başlık
 * sayıyordu — ve hiçbir şey koşmuyordu (özerk sohbet motoru 15.8, gönderim kanalı 15.11). Kapalı
 * seçenek, çalışmayan bir seçenekten dürüsttür.
 */
export function handlerOptions(busy: boolean, unavailable?: Partial<Record<TicketHandler, string>>): MultiToggleOption<TicketHandler>[] {
  return (Object.keys(TICKET_HANDLER_LABELS) as TicketHandler[]).map((key) => ({
    key,
    label: TICKET_HANDLER_LABELS[key],
    disabled: busy || unavailable?.[key] !== undefined,
    title: unavailable?.[key],
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
