'use client';

import { useState, useTransition } from 'react';
import { SparkleIcon } from '@/components/operation/ui/icons';
import { Input } from './input';

/**
 * Çeviri düğmeli girdi — tek satırlık çok dilli bir alanın HEDEF dilini AI ile doldurur.
 *
 * Düğme kutunun **İÇİNDE**, sağ kenarda durur (yanında değil: dışarıdaki bir düğme tabloda kolon
 * genişliği ister ve girdiyle aynı öbeğe ait olduğu okunmaz). Yalnız **hover/odakta** görünür ve
 * **ikon-only**: kalıcı bir "✦ AI çeviri" metni her satırda yer isterdi, oysa çeviri arada bir
 * kullanılan bir yardımcı. Sağ dolgu HER ZAMAN ayrılmış (`Input`'un `trailing` kipi) — düğme
 * belirip kaybolurken satır oynamaz, yazı da altına girmez.
 *
 * Erişilebilirlik: girdiye sekmeyle girildiğinde de görünür (`group-focus-within`), düğmenin kendisi
 * odaklanınca da (`focus-visible`) — yalnız fareyle keşfedilebilen bir eylem bırakmıyoruz.
 *
 * Salt kabuk: NE çevrileceğini bilmez. `onTranslate` çağırana ait (kaynak dil, hedef dil, alan) —
 * burada yalnız "yürüyor / bitti / hata" hâli yaşar.
 */
interface TranslateInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  title?: string;
  inputSize?: 'sm' | 'md';
  /**
   * Çeviriyi yürütür. Verilmezse düğme HİÇ çizilmez (ör. kaynak dilin kendisi gösteriliyor) — kilitli
   * bir ikon, hover'da belirdiği için "bu ne?" sorusundan başka bir şey söylemezdi.
   */
  onTranslate?: () => Promise<void>;
  /** Düğme ipucu: neyin nereden çevrileceği. Kaynak metin yoksa çağıran gerekçeyi buraya yazar. */
  translateTitle?: string;
  /** Kaynak metin yok / hedef dil kaynağın kendisi → düğme kilitli, ipucu sebebi söyler. */
  translateDisabled?: boolean;
}

export function TranslateInput({
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  title,
  inputSize = 'md',
  onTranslate,
  translateTitle,
  translateDisabled = false,
}: TranslateInputProps) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const run = () => {
    if (!onTranslate) return;
    setFailed(null);
    start(async () => {
      try {
        await onTranslate();
      } catch (e) {
        // Hata metni İKONDA yaşar: tablo hücresinde altına satır açacak yer yok, ama sessizce
        // yutmak da olmaz — ikon amber olur, ipucu sebebi taşır.
        setFailed(e instanceof Error ? e.message : 'AI çeviri başarısız.');
      }
    });
  };

  const disabled = translateDisabled || pending;

  const button = onTranslate ? (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      aria-label="AI ile çevir"
      title={failed ?? translateTitle ?? 'AI ile çevir'}
      className={[
        // KARE: genişlik kutunun iç yüksekliğinden gelir (`aspect-square`), elle verilen bir px
        // değerinden değil — girdi boyutu ya da satır yüksekliği değişince kare kare kalır.
        'flex h-full aspect-square cursor-pointer items-center justify-center rounded-[5px] transition-opacity',
        // Görünürlük: kutunun üstünde hover · girdiye odak · düğmenin kendisine odak · yürürken
        // (bitişini görmek gerekir). `group` sınıfı Input'un sarmalayıcısında.
        pending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
        failed ? 'bg-ops-amber-bg text-ops-amber' : 'text-ops-olive hover:bg-ops-olive-bg',
        'disabled:cursor-not-allowed disabled:text-ops-faint disabled:hover:bg-transparent',
      ].join(' ')}
    >
      {/* Yürürken nabız: ikon-only düğmede "çeviriliyor…" yazacak yer yok. Döndürme değil —
          kıvılcım dönen bir şey değil, "üretiliyor" fikrine nabız daha yakın. */}
      <span className={pending ? 'animate-pulse' : undefined}>
        <SparkleIcon size={inputSize === 'sm' ? 12 : 14} />
      </span>
    </button>
  ) : null;

  return (
    <Input
      inputSize={inputSize}
      error={error}
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      trailing={button}
    />
  );
}
