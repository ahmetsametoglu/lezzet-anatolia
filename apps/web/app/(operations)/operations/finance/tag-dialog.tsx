'use client';

import { useState } from 'react';
import { isPartnerTag } from '@lezzet/domain-core';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Input } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { addTagAction, setTagActiveAction } from '@/lib/finance/actions';
import type { FinanceData } from './finance-types';

/*
  ETİKET SÖZLÜĞÜ (12.12 · kullanıcı kararı 13.09: "tek mekanizma etiket; yönetilen liste").

  Operatör buradan etiket ekler ve pasifleştirir; hareket ve belge yalnız buradaki etiketi taşır.
  Silme YOK — eski hareketler etiketi taşımaya devam eder, pasif etiket yalnız yeni kayda kapanır
  (hesabın pasifleşmesiyle aynı gerekçe).

  ORTAK ETİKETİ ayrı bir kip: ad "Ahmet" yazılır, sözlüğe `ortak:ahmet` / "Ortak Ahmet" girer.
  Ortaklar arası hesap ayrı bir varlık değil bu etikettir; ön eki kimse elle yazmaz.
*/

type TagKind = 'expense' | 'partner';

interface TagDialogProps {
  tags: FinanceData['tagList'];
  onClose: () => void;
  /** Sözlük değişti — sayfa tazelenir ki çipler ve satırlar yeni adı görsün. */
  onChanged: () => void;
}

export function TagDialog({ tags, onClose, onChanged }: TagDialogProps) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<TagKind>('expense');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    setBusy('new');
    const { error: actionError } = await addTagAction({ label, partner: kind === 'partner' });
    setBusy(null);
    if (actionError) {
      setError(actionError);
      return;
    }
    setLabel('');
    onChanged();
  };

  const toggle = async (slug: string, isActive: boolean) => {
    setError(null);
    setBusy(slug);
    const { error: actionError } = await setTagActiveAction(slug, isActive);
    setBusy(null);
    if (actionError) {
      setError(actionError);
      return;
    }
    onChanged();
  };

  // Ortak etiketleri ÖNCE ve ayrı: ortaklar arası hesabın kelimeleri gider kelimeleriyle karışmasın.
  const partners = tags.filter((tag) => isPartnerTag(tag.slug));
  const others = tags.filter((tag) => !isPartnerTag(tag.slug));

  return (
    <Dialog open onClose={onClose} title="Etiketler" subtitle="Hareket ve belgenin sınıflandırma sözlüğü — silinmez, pasifleşir" maxWidth={560}>
      <div className="flex flex-col gap-5">
        <form
          className="flex flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-surface-sunken p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <MultiToggle
            value={kind}
            onChange={setKind}
            label="Etiket türü"
            options={[
              { key: 'expense', label: 'Gider / sınıf etiketi' },
              { key: 'partner', label: 'Ortak etiketi' },
            ]}
          />
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="tag-label" className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
                {kind === 'partner' ? 'Ortağın adı' : 'Etiket adı'}
              </label>
              <Input
                id="tag-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={kind === 'partner' ? 'Ahmet' : 'Sigorta · Muhasebe ücreti · Vergi'}
              />
            </div>
            <Button type="submit" size="sm" disabled={busy !== null || label.trim().length === 0}>
              {busy === 'new' ? 'Ekleniyor…' : 'Ekle'}
            </Button>
          </div>
          {kind === 'partner' ? (
            <p className="font-ops-body text-ops-xs text-ops-faint">
              Sözlüğe <span className="font-ops-mono">ortak:{'<ad>'}</span> olarak girer; ortaklar arası hesap bu etiketle çıkar.
            </p>
          ) : null}
          {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}
        </form>

        <TagGroup title="Ortaklar" tags={partners} busy={busy} onToggle={toggle} empty="Henüz ortak etiketi yok." />
        <TagGroup title="Gider ve sınıf etiketleri" tags={others} busy={busy} onToggle={toggle} empty="Sözlük boş." />
      </div>
    </Dialog>
  );
}

function TagGroup({
  title,
  tags,
  busy,
  onToggle,
  empty,
}: {
  title: string;
  tags: FinanceData['tagList'];
  busy: string | null;
  onToggle: (slug: string, isActive: boolean) => void;
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">{title}</span>
      {tags.length === 0 ? (
        <p className="font-ops-body text-ops-xs text-ops-faint">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-ops-line-soft rounded-ops-card border border-ops-line">
          {tags.map((tag) => (
            <li key={tag.slug} className="flex items-center gap-3 px-3.5 py-2">
              <span className={`font-ops-body text-ops-sm ${tag.isActive ? 'text-ops-ink' : 'text-ops-faint line-through'}`}>{tag.label}</span>
              <span className="font-ops-mono text-ops-micro text-ops-faint">{tag.slug}</span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => onToggle(tag.slug, !tag.isActive)}
                className="ml-auto cursor-pointer font-ops-body text-ops-xs text-ops-muted underline hover:text-ops-ink disabled:cursor-wait disabled:opacity-60"
              >
                {busy === tag.slug ? '…' : tag.isActive ? 'Pasifleştir' : 'Yeniden aç'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
