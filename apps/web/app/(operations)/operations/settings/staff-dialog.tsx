'use client';

import { useState, useTransition } from 'react';
import { STAFF_ROLES, type UserRole } from '@lezzet/types';
import { withRole, withoutRole } from '@lezzet/domain-core';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { InputField } from '@/components/operation/form/input';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { createStaffAction, deactivateStaffAction, saveStaffAction } from './actions';
import { STAFF_ROLE_HELP, STAFF_ROLE_LABELS } from './settings-labels';
import type { StaffRowView } from './settings-types';

/**
 * Personel & rol penceresi (09.16).
 *
 * ── ROL BİR SEÇİM DEĞİL, BİR SONUÇ ──────────────────────────────────────────
 * Her rolün altında NE GÖRDÜĞÜ yazılı. Tasarımın kuralı: izin matrisi burada düzenlenmez, roller
 * sabit kalıptır (`admin-ayarlar.md §6`) — ama sabit olması gizli olması demek değil. Yanlış rol
 * ataması veri görünürlüğünü değiştirir ve bu pencere nadiren açılır; hatırlatmayı ekranın kendisi
 * yapmalı.
 *
 * ── ROL KÜMESİNİ MOTOR KURAR ────────────────────────────────────────────────
 * Ekleme/çıkarma `domain-core`'un `withRole`/`withoutRole`'una gider: müşteri ↔ personel geçişini,
 * son rol çıkarıldığında `customer`a düşmeyi o biliyor. Buradaki kutu yalnız hangi kutunun işaretli
 * olduğunu tutsaydı, aynı kural iki yerde yaşardı.
 *
 * ── DEPO KAPSAMI KOŞULLU ────────────────────────────────────────────────────
 * Yalnız depocu/kurye rollerinde sorulur; yönetici ve muhasebe depo-üstüdür ve kapsamı hiç okunmaz
 * (`user_profiles.warehouse_ids` künyesi). Herkese sormak, okunmayan bir alanı doldurtmak olurdu.
 */

interface StaffDialogProps {
  /** `null` = yeni kayıt. */
  editing: StaffRowView | null;
  warehouseOptions: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}

const SCOPED_ROLES: readonly UserRole[] = ['warehouse', 'courier'];

export function StaffDialog({ editing, warehouseOptions, onClose, onSaved }: StaffDialogProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [roles, setRoles] = useState<UserRole[]>(editing?.roles ?? []);
  const [warehouseIds, setWarehouseIds] = useState<string[]>(editing?.warehouseIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const needsScope = roles.some((r) => SCOPED_ROLES.includes(r));

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else onSaved();
    });
  };

  const save = () => {
    const payload = { name, email, phone, roles, warehouseIds: needsScope ? warehouseIds : [] };
    run(() => (editing ? saveStaffAction({ ...payload, id: editing.id }) : createStaffAction(payload)));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Kullanıcı & rol' : 'Yeni kullanıcı'}
      subtitle={editing ? undefined : 'Kayıt açılır; kişi bu e-postayla giriş yaptığında hesabı bağlanır.'}
      maxWidth={480}
      footer={
        <div className="flex w-full items-center gap-2.5">
          {editing ? (
            <Button variant="danger" disabled={pending} onClick={() => run(() => deactivateStaffAction({ id: editing.id }))}>
              Pasifleştir
            </Button>
          ) : null}
          <Button variant="secondary" className="ml-auto" disabled={pending} onClick={onClose}>
            İptal
          </Button>
          <Button variant="primary" disabled={pending} onClick={save}>
            {pending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex gap-3">
          <InputField label="Ad" required value={name} onChange={(e) => setName(e.target.value)} fieldClassName="flex-1" />
          <InputField label="Telefon" mono value={phone} onChange={(e) => setPhone(e.target.value)} fieldClassName="flex-1" placeholder="+33 6 …" />
        </div>

        <InputField
          label="E-posta"
          required={!editing}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          labelAside={<span className="font-ops-body text-ops-micro text-ops-faint">giriş bu adresle açılır</span>}
        />

        <section className="flex flex-col gap-2">
          <span className="font-ops-body text-ops-xs font-medium text-ops-body">Roller (birden çok olabilir)</span>
          <div className="flex flex-col gap-1.5">
            {STAFF_ROLES.map((role) => {
              const on = roles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRoles(on ? withoutRole(roles, role).filter((r) => r !== 'customer') : withRole(roles, role))}
                  className={[
                    'flex cursor-pointer flex-col gap-0.5 rounded-ops-card border px-3 py-2 text-left transition-colors',
                    on ? 'border-ops-olive bg-ops-olive-bg' : 'border-ops-line bg-ops-white hover:border-ops-olive',
                  ].join(' ')}
                >
                  <span className={['font-ops-display text-ops-sm font-semibold', on ? 'text-ops-olive-dark' : 'text-ops-strong'].join(' ')}>
                    {STAFF_ROLE_LABELS[role]}
                    {on ? ' ✓' : ''}
                  </span>
                  <span className="font-ops-body text-ops-micro text-ops-muted">{STAFF_ROLE_HELP[role]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {needsScope ? (
          <section className="flex flex-col gap-1.5">
            <span className="font-ops-body text-ops-xs font-medium text-ops-body">Görevli olduğu depolar</span>
            <MultiSelect options={warehouseOptions} selected={warehouseIds} onChange={setWarehouseIds} addLabel="+ depo" />
            {/* Boş kapsam "hepsi" DEĞİL, hiçbiri — kişi hiçbir şey göremez. Kaydetmeyi engellemiyoruz
                (geçici bir hâl olabilir) ama sessiz de bırakmıyoruz. */}
            {warehouseIds.length === 0 ? (
              <span className="font-ops-body text-ops-xs text-ops-amber">Depo seçilmezse bu kişi hiçbir deponun stoğunu ve işini göremez.</span>
            ) : null}
          </section>
        ) : null}

        <p className="rounded-ops-card border border-ops-line bg-ops-subtle px-3 py-2.5 font-ops-body text-ops-xs leading-relaxed text-ops-muted">
          Rolün ne görebildiği sabittir; izin detayı burada icat edilmez. Pasifleştirilen kişi silinmez — operasyon rolleri kaldırılır, erişimi kapanır, geçmiş
          kayıtlarındaki adı yerinde kalır.
        </p>

        {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}
      </div>
    </Dialog>
  );
}
