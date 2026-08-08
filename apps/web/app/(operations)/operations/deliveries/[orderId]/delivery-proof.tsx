'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Input } from '@/components/operation/form/input';
import { NOTES } from '../deliveries-labels';
import { requestProofUploadAction } from './actions';
import type { ProofDraft } from './delivery-types';

/**
 * **Teslim kanıtı — yakalama** (11.2). Tasarım: *"Teslim kanıtı · [İmza al] [Foto çek]"*,
 * *"Kanıtsız 'tamamla' pasiftir"* (`Operasyon - Kurye Teslimat.dc.html`).
 *
 * ── DOSYA SUNUCUDAN GEÇMEZ ──────────────────────────────────────────────────
 * Üç adım: kapıdan kısa ömürlü izin al → tarayıcı **doğrudan R2'ye** yükler → dönen anahtar
 * teslim onayına girer. Sunucu üzerinden geçirmek fotoğrafı iki kez taşımak ve Next'in gövde
 * sınırıyla boğuşmak olurdu (kapının kendi künyesi, `lib/courier/proof.ts`).
 *
 * ── ANAHTAR ANCAK YÜKLEME BİTİNCE DOĞAR ─────────────────────────────────────
 * `onProof` yalnız `PUT` başarılı dönerse çağrılır. İzin alınır alınmaz anahtarı kaydetmek daha
 * kolaydı ve yanlıştı: izin "yazabilirsin" demektir, "yazdın" demez. Şebekesi zayıf bir sokakta
 * yarıda kalan yükleme, kanıtı VAR gösteren bir teslimat bırakırdı.
 *
 * ── İMZA DA BİR GÖRSELDİR ───────────────────────────────────────────────────
 * Ayrı bir "imza" saklama biçimi yok (`DeliveryProofInput.imageKey` künyesi: *"imza çizimi de
 * görsel olarak saklanır"*). Tuval PNG'ye çevrilip aynı yoldan gider; ihtilafta açılan şey iki
 * halde de bir resimdir.
 */
interface ProofCaptureProps {
  orderId: string;
  proofs: ProofDraft[];
  onProof: (proof: ProofDraft) => void;
  onRemove: (imageKey: string) => void;
  receivedBy: string;
  onReceivedBy: (name: string) => void;
  disabled: boolean;
}

export function ProofCapture({ orderId, proofs, onProof, onRemove, receivedBy, onReceivedBy, disabled }: ProofCaptureProps) {
  const [mode, setMode] = useState<'idle' | 'signature'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Ortak yükleme yolu — imza da fotoğraf da buradan geçer.
   *
   * İçerik türü `blob.type`'tan gelir ve kapının imzaladığıyla örtüşmek ZORUNDA: kapı dosya
   * uzantısından `image/<uzantı>` kuruyor, tarayıcı da aynı türü veriyor. Uyuşmazlarsa R2 yüklemeyi
   * reddeder — sessiz kalmaz, hata buraya düşer.
   */
  const upload = async (blob: Blob, filename: string, kind: ProofDraft['kind']) => {
    setError(null);
    setBusy(true);
    try {
      const { data, error: refused } = await requestProofUploadAction(orderId, filename, proofs.length);
      if (refused || !data) {
        setError(refused ?? 'Yükleme izni alınamadı.');
        return;
      }

      const response = await fetch(data.uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'content-type': blob.type },
      });
      // Yükleme BAŞARISIZSA anahtar kaydedilmez: yazılmamış bir dosyanın anahtarı, açıldığında
      // boş çıkan bir kanıttır.
      if (!response.ok) {
        setError(`Kanıt yüklenemedi (${response.status}). Bağlantınızı kontrol edip tekrar deneyin.`);
        return;
      }

      onProof({ kind, imageKey: data.key, previewUrl: URL.createObjectURL(blob) });
      setMode('idle');
    } catch {
      // Ağ hatası: `fetch` burada fırlatır. Kuryenin görmesi gereken şey teknik ad değil, ne
      // yapacağı — kanıt yüklenmedi ve teslim kapanmayacak.
      setError('Kanıt yüklenemedi — bağlantı kurulamadı. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    void upload(file, file.name, 'photo');
  };

  return (
    <section className="flex flex-col gap-2.5 border-b border-ops-line-soft px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          Teslim kanıtı
        </h2>
        <span className="font-ops-body text-ops-micro text-ops-faint">{NOTES.proofAside}</span>
      </div>

      {proofs.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {proofs.map((proof) => (
            <li key={proof.imageKey} className="relative">
              {/* Ham `<img>`: adres tarayıcının kendi ürettiği geçici nesne adresi, `next/image`
                  onu iyileştiremez (emsal, sipariş detayındaki kanıt görseli). */}
              <img
                src={proof.previewUrl}
                alt={proof.kind === 'signature' ? 'Alınan imza' : 'Teslim fotoğrafı'}
                className="size-20 rounded-ops-card border border-ops-line object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(proof.imageKey)}
                disabled={disabled || busy}
                aria-label="Kanıtı çıkar"
                className="absolute -right-1.5 -top-1.5 grid size-5 cursor-pointer place-items-center rounded-full border border-ops-line bg-ops-white font-ops-body text-ops-micro text-ops-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {mode === 'signature' ? (
        <SignaturePad busy={busy} onCancel={() => setMode('idle')} onDone={(blob) => upload(blob, 'imza.png', 'signature')} />
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth disabled={disabled || busy} onClick={() => setMode('signature')}>
            İmza al
          </Button>
          <Button variant="secondary" fullWidth disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
            Foto çek
          </Button>
          {/* `capture`: masaüstünde dosya seçici, telefonda doğrudan kamera. Tek girdi iki bağlamı
              da karşılıyor — ekranın masaüstü olması fotoğrafın telefondan gelmeyeceği anlamına
              gelmiyor (sevkiyatçı omuz üstünden bakabilir, `docs/uygulama` yüzey formülü). */}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              onFile(event.target.files?.[0]);
              // Aynı dosya ikinci kez seçilebilsin: girdi temizlenmezse `change` hiç tetiklenmez.
              event.target.value = '';
            }}
          />
        </div>
      )}

      {/* Teslim ALAN kişi — kanıtın kendisi kadar önemli: B2B'de ihtilafın sorusu "imza var mı"
          değil, "kim imzaladı"dır. Zorunlu değil; kurye adı öğrenemediği için teslimi
          kapatamamak, adsız bir kanıttan pahalıdır. */}
      <Input
        value={receivedBy}
        onChange={(event) => onReceivedBy(event.target.value)}
        disabled={disabled || busy}
        placeholder="Teslim alan kişi (opsiyonel)"
      />

      {error ? (
        <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-xs leading-[1.5] text-ops-red">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Tuvalin çizim yüzeyi — ekranda göründüğü boyutla aynı, ölçekleme yok. */
const PAD_WIDTH = 512;
const PAD_HEIGHT = 160;

/**
 * İmza tuvali — fare ya da dokunmatik, tek çizgi seti.
 *
 * **Boş tuval yüklenmez** (`drawn` bayrağı): imza almadan "kaydet"e basmak beyaz bir dikdörtgeni
 * kanıt diye yazardı ve o da kanıtı VAR göstermenin bir başka biçimi olurdu.
 */
function SignaturePad({ busy, onCancel, onDone }: { busy: boolean; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);

  const contextOf = (): CanvasRenderingContext2D | null => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    if (context) {
      context.lineWidth = 2.5;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      // Çizgi rengi SABİT siyah, token değil: bu bir arayüz öğesi değil, saklanacak GÖRSELİN
      // içeriği. Karanlık modda beyaza dönseydi kanıt beyaz zeminde görünmez olurdu.
      context.strokeStyle = '#000000';
    }
    return context;
  };

  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const clear = () => {
    const context = contextOf();
    if (!context) return;
    context.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    setDrawn(false);
  };

  const save = () => {
    // Şeffaf PNG: imza beyaz bir zemine gömülmez, açıldığı yerin zemininde okunur.
    canvasRef.current?.toBlob((blob) => {
      if (blob) onDone(blob);
    }, 'image/png');
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={PAD_WIDTH}
        height={PAD_HEIGHT}
        // `touch-none`: dokunmatikte parmak hareketi sayfayı kaydırmasın, çizgi olsun.
        className="w-full cursor-crosshair touch-none rounded-ops-card border border-ops-line-strong bg-ops-white"
        onPointerDown={(event) => {
          const context = contextOf();
          if (!context) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const { x, y } = pointOf(event);
          context.beginPath();
          context.moveTo(x, y);
          drawing.current = true;
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const context = contextOf();
          if (!context) return;
          const { x, y } = pointOf(event);
          context.lineTo(x, y);
          context.stroke();
          setDrawn(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerLeave={() => {
          drawing.current = false;
        }}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Vazgeç
        </Button>
        <Button variant="secondary" size="sm" onClick={clear} disabled={busy || !drawn}>
          Temizle
        </Button>
        <Button variant="primary" size="sm" className="ml-auto" onClick={save} disabled={busy || !drawn}>
          {busy ? 'Yükleniyor…' : 'İmzayı kaydet'}
        </Button>
      </div>
    </div>
  );
}
