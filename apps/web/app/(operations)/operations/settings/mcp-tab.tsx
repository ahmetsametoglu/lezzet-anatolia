'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { McpScope } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { CopyButton } from '@/components/operation/ui/copy-text';
import { Dialog } from '@/components/operation/ui/dialog';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { shortDate, shortDateTime } from '@/components/operation/ui/format';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { createMcpKeyAction, revokeMcpKeyAction } from './mcp-actions';
import type { McpCallView, McpKeyView, McpPanelData } from './mcp-read';

/**
 * MCP sekmesi (22.4) — asistanın kapısının anahtarları ve çağrı izi.
 *
 * ── NEDEN AYARLARDA ─────────────────────────────────────────────────────────
 * Personel ve vitrin görselleriyle aynı gerekçe: bir AYAR değil ama bir KURULUM işi. Nadiren
 * bakılır, yerini bilmek gerekir, yalnız yöneticiye açıktır.
 *
 * ── EKRANIN SÖYLEDİĞİ ÜÇ ŞEY ────────────────────────────────────────────────
 * 1. Kim bağlanabiliyor (anahtar listesi, kapsamıyla).
 * 2. Anahtar ne yapabiliyor — `read` yalnız okur, `propose` kuyruğa da yazar. **Hiçbir anahtar
 *    doğrudan yazamaz**; kuyruk onayı bu ekranın vaadi değil, kurgunun kendisi.
 * 3. Ne oldu — son çağrılar, süresi ve hatasıyla.
 *
 * ── DÜZ ANAHTAR BİR KEZ GÖRÜNÜR ─────────────────────────────────────────────
 * Üretim diyaloğu kapanınca anahtar bir daha gösterilemez (veritabanında yalnız hash var). Ekran
 * bunu ÜRETMEDEN ÖNCE söylüyor, sonra değil: kaybedilen anahtar bir arıza değil, yeni anahtar
 * üretme sebebidir — ama bunu sonradan öğrenmek sürpriz olur.
 */
interface McpTabProps {
  data: McpPanelData;
}

const SCOPE_LABEL: Record<McpScope, string> = {
  read: 'Yalnız okuma',
  propose: 'Okuma + öneri',
};

const SCOPE_HINT: Record<McpScope, string> = {
  read: 'Rapor, stok, katalog ve talep araçları. Kuyruğa hiçbir şey yazamaz.',
  propose: 'Okumanın hepsi + onay kuyruğuna öneri yazma. Öneriyi yine sen onaylarsın.',
};

export function McpTab({ data }: McpTabProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Asistanın bağlandığı kapının anahtarları. Anahtar <strong>tek başına hiçbir şey yazamaz</strong>: öneri
        kapsamlı bir anahtar bile yalnız onay kuyruğuna satır düşer, uygulamayı sen yaparsın. Anahtar üretilirken
        bir kez gösterilir — kaybolursa yenisi üretilir, eskisi iptal edilir.
      </p>

      {/* ── ENV ANAHTARI: ÖLÇÜLEMEYENİ ÖLÇÜLMÜŞ GİBİ YAZMA (26.08) ──────────────
          Burada "ortam anahtarı açık mı" diye koşullu bir uyarı vardı ve panel bunu asla
          bilemez: o değer backend sürecinin ortamında yaşıyor, web sunucusunun değil. Koşul
          her zaman "kapalı" derdi — yani kapı o anahtarla açıkken panel "kapalı" yazardı.
          Uyarı koşulsuz ve ölçüm iddiasız: operatöre ne yapması gerektiğini söylüyor, neyin
          doğru olduğunu iddia etmiyor. */}
      <div className="rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-4 py-3">
        <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-ink">
          <strong>Sunucudaki ortam anahtarı bu listede görünmez.</strong> Backend'in{' '}
          <code className="font-ops-mono">MCP_CONNECTION_KEY</code> değeri doluysa o da geçerlidir ve{' '}
          <strong>öneri kapsamlı</strong> sayılır — ama buradan ne görülebilir ne iptal edilebilir (başka bir sürecin
          ortamında yaşıyor). Aşağıdan bir anahtar üretip bağlantını ona taşı, sonra o satırı sunucudan sil.
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">Bağlantı anahtarları</span>
        <Button variant="dark" size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          + Anahtar üret
        </Button>
      </div>

      {data.keys.length === 0 ? (
        <EmptyState
          title="Henüz anahtar üretilmedi"
          description="Asistanı bağlamak için bir anahtar üret ve MCP istemcisine Authorization başlığı olarak yaz."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {data.keys.map((key) => (
            <KeyRow key={key.id} row={key} />
          ))}
        </div>
      )}

      <span className="mt-2 font-ops-display text-ops-base font-semibold text-ops-ink">Son çağrılar</span>
      {data.calls.length === 0 ? (
        <EmptyState
          title="Çağrı izi boş"
          description="Asistan bir araç çağırdığında burada görünür: hangi araç, ne kadar sürdü, hata verdi mi. Araç argümanları kaydedilmez."
        />
      ) : (
        <div className="flex flex-col gap-1">
          {data.calls.map((call) => (
            <CallRow key={call.id} row={call} />
          ))}
        </div>
      )}

      <CreateKeyDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function KeyRow({ row }: { row: McpKeyView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoke = async () => {
    setBusy(true);
    setError(null);
    const result = await revokeMcpKeyAction(row.id);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">{row.label}</span>
        <Badge tone={row.scope === 'propose' ? 'violet' : 'slate'}>{SCOPE_LABEL[row.scope]}</Badge>
        {row.status === 'active' ? (
          <Badge tone="olive" dot>
            Geçerli
          </Badge>
        ) : row.status === 'revoked' ? (
          <Badge tone="red">İptal edildi</Badge>
        ) : (
          <Badge tone="neutral">Süresi doldu</Badge>
        )}
        {/* İptal yalnız GEÇERLİ anahtarda: süresi dolmuş bir anahtarı iptal etmek, kapalı bir kapıyı
            kilitlemektir — düğme iş yapıyormuş gibi görünür, hiçbir şeyi değiştirmez. */}
        {row.status === 'active' ? (
          <Button variant="secondary" size="sm" className="ml-auto" disabled={busy} onClick={() => void revoke()}>
            İptal et
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-ops-body text-ops-xs text-ops-muted">
        <span>
          Geçerlilik: <span className="font-ops-mono text-ops-ink">{shortDate(row.expiresAt)}</span>
        </span>
        <span>
          {/* `null` = HİÇ kullanılmadı. "0 gün önce" yazmak, ölçülmemiş bir şeyi ölçülmüş göstermek olurdu. */}
          Son kullanım: <span className="font-ops-mono text-ops-ink">{row.lastUsedAt ? shortDateTime(row.lastUsedAt) : 'hiç kullanılmadı'}</span>
        </span>
        <span>
          Son çağrılarda: <span className="font-ops-mono text-ops-ink">{row.callCount}</span>
        </span>
        <span className="text-ops-faint">
          {shortDate(row.createdAt)} · {row.createdByName ?? 'üreten bilinmiyor'}
        </span>
      </div>

      {error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
    </div>
  );
}

function CallRow({ row }: { row: McpCallView }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-ops-card px-3 py-1.5 odd:bg-ops-tint">
      <span className={`font-ops-mono text-ops-xs ${row.ok ? 'text-ops-ink' : 'text-ops-red'}`}>{row.tool}</span>
      <span className="font-ops-mono text-ops-micro text-ops-faint">{row.durationMs} ms</span>
      <span className="font-ops-body text-ops-micro text-ops-muted">{row.keyLabel ?? 'ortam anahtarı'}</span>
      {row.error ? <span className="font-ops-body text-ops-micro text-ops-red">{row.error}</span> : null}
      <span className="ml-auto font-ops-mono text-ops-micro text-ops-faint">{shortDateTime(row.createdAt)}</span>
    </div>
  );
}

/**
 * Üretim diyaloğu — iki hâl: FORM ve SONUÇ.
 *
 * Sonuç hâli ayrı çizilir çünkü o an ekranda duran şey bir daha üretilemez: form geri gelirse
 * anahtar kaybolur. Kapatma da bu yüzden tek düğme ("Kapat") — "İptal" demek, üretilmiş bir
 * anahtarı geri alıyormuş gibi okunurdu.
 */
function CreateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<McpScope>('read');
  const [ttlDays, setTtlDays] = useState('90');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const close = () => {
    onClose();
    // Sıfırlama KAPANIRKEN: diyalog açıkken sıfırlamak, sonuç hâlini kullanıcının gözü önünde silerdi.
    setLabel('');
    setScope('read');
    setTtlDays('90');
    setError(null);
    setToken(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await createMcpKeyAction({ label, scope, ttlDays: Number(ttlDays) });
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Anahtar üretilemedi.');
      return;
    }
    setToken(result.data.token);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={token ? 'Anahtar üretildi' : 'Yeni bağlantı anahtarı'}
      subtitle={
        token
          ? 'Şimdi kopyala — bu pencere kapandıktan sonra bir daha gösterilemez.'
          : 'Anahtar üretildikten sonra bir kez gösterilir; veritabanında yalnız özeti saklanır.'
      }
      footer={
        token ? (
          <Button variant="dark" onClick={close}>
            Kapat
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="dark" onClick={() => void submit()} disabled={busy || label.trim().length === 0}>
              Üret
            </Button>
          </>
        )
      }
    >
      {token ? (
        <div className="flex flex-col gap-3">
          <code className="break-all rounded-ops-card border border-ops-line bg-ops-tint px-3 py-2.5 font-ops-mono text-ops-xs text-ops-ink">
            {token}
          </code>
          <CopyButton text={token} label="Anahtarı kopyala" fullWidth />
          <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
            İstemciye <code className="font-ops-mono">Authorization: Bearer &lt;anahtar&gt;</code> başlığı olarak yazılır.
            Kaybolursa sorun değil: bu satırı iptal edip yenisini üret.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* Ham `<input>` DEĞİL: form kiti (`FieldShell` + `Input`) kullanılıyor — RHF'li
              `FormInput` bu diyalogda fazla olurdu (üç alan, doğrulama sunucuda). */}
          <FieldShell fieldId="mcp-key-label" label="Ad" required>
            <Input
              id="mcp-key-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ahmet · Claude Desktop"
            />
          </FieldShell>
          <span className="-mt-2 font-ops-body text-ops-xs text-ops-faint">
            Listede anahtarı bundan tanıyacaksın — anahtarın kendisi bir daha görünmeyecek.
          </span>

          <FieldShell label="Kapsam">
            <MultiToggle
              label="Kapsam"
              options={[
                { key: 'read' as const, label: SCOPE_LABEL.read, tone: 'slate' },
                { key: 'propose' as const, label: SCOPE_LABEL.propose, tone: 'violet' },
              ]}
              value={scope}
              onChange={setScope}
            />
          </FieldShell>
          {/* İpucu SEÇİME göre değişiyor: iki kapsamın farkı adlarından okunmuyor ve fark
              önemli — biri kuyruğa yazabiliyor. */}
          <span className="-mt-2 font-ops-body text-ops-xs text-ops-muted">{SCOPE_HINT[scope]}</span>

          <FieldShell fieldId="mcp-key-ttl" label="Geçerlilik (gün)">
            <Input id="mcp-key-ttl" type="number" min={1} max={365} value={ttlDays} onChange={(e) => setTtlDays(e.target.value)} />
          </FieldShell>
          <span className="-mt-2 font-ops-body text-ops-xs text-ops-faint">
            Süresiz anahtar yok. Varsayılan 90 gün; dolduğunda bağlantı kendiliğinden kapanır.
          </span>

          {error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
        </div>
      )}
    </Dialog>
  );
}
