import { Icon } from '@/components/customer/ui/icons';

interface StarLabelProps {
  /** `{star}` yer tutucusu yıldız ikonuna döner; sözlük ★ karakterini taşımaz. */
  label: string;
  size?: number;
}

/** Süzgeç çipinin yıldızlı etiketi ("5★ (2)"). */
export function StarLabel({ label, size = 11 }: StarLabelProps) {
  const [head, tail] = label.split('{star}');
  if (tail === undefined) return label;
  return (
    <span className="inline-flex items-center gap-0.5">
      {head}
      <Icon name="star" size={size} />
      {tail}
    </span>
  );
}
