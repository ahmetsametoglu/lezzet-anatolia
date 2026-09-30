'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { McpScope } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { CopyButton } from '@/components/operation/ui/copy-text';
import { Dialog } from '@/components/operation/ui/dialog';
import { shortDate, shortDateTime } from '@/components/operation/ui/format';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { createMcpKeyAction, revokeMcpKeyAction } from './mcp-actions';
import type { McpCallView, McpKeyView, McpPanelData } from './mcp-read';
import { SettingsCard } from './settings-sections';

/**
 * MCP anahtarları: kim bağlanabiliyor, ne yapabiliyor, son çağrılarda ne oldu. Hiçbir anahtar doğrudan yazamaz; öneri kapsamlı
 * anahtar bile yalnız onay kuyruğuna satır düşer.
 */
interface McpCardProps {
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

export function McpCard({ data }: McpCardProps) {
  const [creating, setCreating] = useState(false);

  return (
    <SettingsCard
      title="MCP anahtarları"
      count={data.keys.filter((k) => k.status === 'active').length}
      hint="Asistanın bağlandığı kapının anahtarları. Anahtar tek başına hiçbir şey yazamaz; öneri kapsamlı anahtar yalnız onay kuyruğuna satır düşer."
      action={
        <Button variant="dark" size="sm" onClick={() => setCreating(true)}>
          + Anahtar üret
        </Button>
      }
    >
      {data.keys.length === 0 ? (
        <p className="border-t border-ops-line-soft px-4 py-3 font-ops-body text-ops-xs text-ops-body">
          Henüz anahtar üretilmedi. Asistanı bağlamak için bir anahtar üret ve MCP istemcisine Authorization başlığı olarak yaz.
        </p>
      ) : (
        data.keys.map((key) => <KeyRow key={key.id} row={key} />)
      )}

      {/* Uyarı koşulsuz: ortam anahtarı backend sürecinin ortamında yaşar ve bu panel onun dolu olup olmadığını ölçemez. */}
      <p className="border-t border-ops-amber-line bg-ops-amber-bg px-4 py-2.5 font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
        Sunucudaki ortam anahtarı (<code className="font-ops-mono">MCP_CONNECTION_KEY</code>) bu listede görünmez: doluysa öneri kapsamlı
        sayılır ve buradan iptal edilemez.
      </p>

      <span className="border-t border-ops-line-soft px-4 pb-1.5 pt-2.5 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-body">
        Son çağrılar
      </span>
      {data.calls.length === 0 ? (
        <p className="px-4 pb-3 font-ops-body text-ops-xs text-ops-body">
          Çağrı izi boş. Asistan bir araç çağırdığında burada görünür; araç argümanları kaydedilmez.
        </p>
      ) : (
        <div className="max-h-[220px] overflow-y-auto pb-2">
          {data.calls.map((call) => (
            <CallRow key={call.id} row={call} />
          ))}
        </div>
      )}

      <CreateKeyDialog open={creating} onClose={() => setCreating(false)} />
    </SettingsCard>
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
    <div className="flex items-center gap-3 border-t border-ops-line-soft px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-ops-body text-ops-base font-semibold text-ops-ink">{row.label}</span>
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
        </div>
        <span className="font-ops-body text-ops-xs text-ops-body">
          Geçerlilik {shortDate(row.expiresAt)} · Son kullanım{' '}
          {/* `null` hiç kullanılmadı demek; "0 gün önce" yazmak ölçülmemiş bir şeyi ölçülmüş gösterirdi. */}
          {row.lastUsedAt ? shortDateTime(row.lastUsedAt) : 'hiç kullanılmadı'} · Son çağrılarda {row.callCount} ·{' '}
          <span className="text-ops-faint">{row.createdByName ?? 'üreten bilinmiyor'}</span>
        </span>
        {error ? <span className="font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span> : null}
      </div>
      {/* İptal yalnız geçerli anahtarda: süresi dolmuş anahtarı iptal etmek hiçbir şeyi değiştirmeyen bir düğme olurdu. */}
      {row.status === 'active' ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void revoke()}>
          İptal et
        </Button>
      ) : null}
    </div>
  );
}

function CallRow({ row }: { row: McpCallView }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-1">
      <span className={`font-ops-mono text-ops-xs ${row.ok ? 'text-ops-ink' : 'text-ops-red'}`}>{row.tool}</span>
      <span className="font-ops-mono text-ops-micro text-ops-faint">{row.durationMs} ms</span>
      <span className="font-ops-body text-ops-micro text-ops-muted">{row.keyLabel ?? 'ortam anahtarı'}</span>
      {row.error ? <span className="font-ops-body text-ops-micro text-ops-red">{row.error}</span> : null}
      <span className="ml-auto font-ops-mono text-ops-micro text-ops-faint">{shortDateTime(row.createdAt)}</span>
    </div>
  );
}

/**
 * Üretim penceresinin iki hâli var, form ve sonuç: sonuçtaki anahtar bir daha gösterilemez, form geri gelirse kaybolur. Kapatma
 * bu yüzden tek düğme; "İptal" üretilmiş anahtarı geri alıyormuş gibi okunurdu.
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
    // Sıfırlama kapanırken: pencere açıkken sıfırlamak sonucu kullanıcının gözü önünde silerdi.
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
          {/* İpucu seçime göre değişir: iki kapsamın farkı adlarından okunmuyor ve biri kuyruğa yazabiliyor. */}
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
