'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { signOutAction } from '@/lib/auth/actions';
import { useAccount } from './account-context';
import messages from './account-messages.json';

/**
 * Başlıktaki hesap girişi (tasarım: "Ayşe ▾").
 *
 * **Ad görünür olmalı** çünkü paylaşılan bir cihazda siparişin kime bağlandığını gösteren tek yer
 * burasıdır — checkout'taki `AccountLine` aynı işi yalnız ödeme adımında yapıyordu, oysa müşteri o
 * adıma gelmeden önce de bilmeli (29.07 kullanıcı isteği).
 *
 * Adı olmayan müşteride e-postanın kullanıcı adı kısmı gösterilir: "yamansehzade@…" için
 * *yamansehzade*. Adsız bir simge, kimin girişli olduğu sorusunu cevapsız bırakırdı.
 *
 * Menüde bugün **tek gerçek eylem var: çıkış.**
 * BEKLEYEN(08.5): "Hesabım" ekranı (`/account`) — bağ verilseydi 404'e düşerdi, o yüzden yerinde
 * durur ve neden basılamadığını söyler.
 *
 * Misafirde menü hiç yoktur — tek bir giriş bağlantısı kalır.
 */
export function AccountEntry({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Dışarı tıklayınca kapanır: açık kalan bir menü, sayfanın geri kalanını tıklanmaz gibi gösteriyor.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!account) {
    return (
      <Link href="/login" className="cursor-pointer font-sans font-semibold text-muted transition-colors hover:text-olive">
        {t.signIn}
      </Link>
    );
  }

  const label = account.name.split(' ')[0] || account.email?.split('@')[0] || t.account;

  const signOut = async () => {
    setBusy(true);
    await signOutAction();
    // Tam yenileme: oturum sunucuda çözülüyor ve istemcideki her durum (sepet, adres) sıfırdan
    // kurulmalı — yumuşak tazeleme ekranda önceki kişinin verisini bırakabilirdi.
    window.location.reload();
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex max-w-[160px] cursor-pointer items-center gap-1.5 font-sans font-semibold text-muted transition-colors hover:text-olive"
      >
        <span className="truncate">{label}</span>
        <span aria-hidden="true" className="text-micro">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 flex w-56 flex-col gap-1 rounded-card border border-sand-200 bg-card p-2 text-body-sm shadow-lg">
          {/* Kim olduğu menünün BAŞINDA: düğmede yalnız ilk ad var, tam künye burada. */}
          <span className="truncate px-2.5 pt-1 pb-2 font-sans text-micro text-muted">{account.email}</span>
          <span className="cursor-not-allowed rounded-soft px-2.5 py-2 font-sans font-semibold text-muted">
            {t.myAccount} · {t.soon}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
            className="cursor-pointer rounded-soft px-2.5 py-2 text-left font-sans font-semibold text-terracotta transition-colors hover:bg-terracotta-bg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
