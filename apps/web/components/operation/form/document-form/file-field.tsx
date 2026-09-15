'use client';

import { useRef } from 'react';
import { ALLOWED_DOCUMENT_EXTENSIONS } from '@lezzet/domain-core';
import { Button } from '@/components/operation/ui/button';
import { attachDocumentFileAction, requestDocumentUploadAction } from '@/lib/finance/actions';

/*
  BELGENİN DOSYASI (12.12 · 22.44) — PDF ya da fotoğraf. Para ekranının belge penceresi ve asistan
  kuyruğunun üç gövdesi (belge · mal kabul · faturalı sipariş) aynı alanı ve aynı yükleme sırasını
  kullanır: asistan faturayı OKUR ama dosyanın kendisi MCP'den geçmez (araçların girdisi yalnız
  metin); dosya onay anında burada bırakılır.

  ── DOSYA ÜÇ ADIMDA, BELGE ÖNCE ─────────────────────────────────────────────
  Belge kaydedilir → dosya için izin istenir → istemci dosyayı DOĞRUDAN özel kovaya koyar → anahtar
  belgeye bağlanır. Sıra bu, çünkü anahtar belge kimliğinden kuruluyor (talep fotoğrafının deseni).
  Yükleme düşerse BELGE YİNE KAYITLIDIR ve cevap bunu söyler: dosyasız belge, hiç girilmemiş belgeden iyidir.

  ── HAM `<input type="file">` ────────────────────────────────────────────────
  Kitin dosya seçici bileşeni yok (görsel kırpma alanı fotoğrafa özel); tarayıcının kendi seçicisi
  gizli tutulup kitin düğmesiyle tetikleniyor — CLAUDE §2'nin "ham eleman son çare" hâli.
*/

/** Seçicinin süzgeci ve ipucu MOTORUN listesinden: kabul edilen türler tek yerde yazılı. */
const ACCEPT = ALLOWED_DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',');
const ACCEPT_HINT = ALLOWED_DOCUMENT_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ');

interface DocumentFileFieldProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** Alanın başlığı — belgede "Dosya", mal kabulde "Faturanın dosyası". */
  label?: string;
  disabled?: boolean;
}

export function DocumentFileField({ file, onChange, label = 'Dosya (isteğe bağlı)', disabled = false }: DocumentFileFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">{label}</span>
      <div className="flex items-center gap-3">
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            onChange(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
          {file ? 'Dosyayı değiştir' : 'Dosya seç'}
        </Button>
        <span className="min-w-0 truncate font-ops-body text-ops-xs text-ops-muted">{file ? file.name : ACCEPT_HINT}</span>
        {file && !disabled ? (
          <button type="button" onClick={() => onChange(null)} className="cursor-pointer font-ops-body text-ops-xs text-ops-faint hover:text-ops-ink">
            Kaldır
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Kaydedilmiş belgeye dosyayı yükler — izin, doğrudan PUT, anahtarın bağlanması. Hata metni döner,
 * `null` = yüklendi. Belge her hâlde kayıtlıdır ve cümle bunu SÖYLER: "olmadı" deseydik operatör
 * belgeyi yeniden girip borcu iki kez yazardı.
 */
export async function uploadDocumentFile(documentId: string, file: File): Promise<string | null> {
  const ticket = await requestDocumentUploadAction(documentId, file.name);
  if (ticket.error || !ticket.data) return `Belge kaydedildi ama dosya yüklenemedi: ${ticket.error ?? 'izin alınamadı'}`;
  const put = await fetch(ticket.data.uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': ticket.data.contentType } });
  if (!put.ok) return 'Belge kaydedildi ama dosya depoya yazılamadı — dosyayı belgeye yeniden yükleyin.';
  const attached = await attachDocumentFileAction(documentId, ticket.data.key);
  if (attached.error) return `Belge kaydedildi ama dosya bağlanamadı: ${attached.error}`;
  return null;
}
