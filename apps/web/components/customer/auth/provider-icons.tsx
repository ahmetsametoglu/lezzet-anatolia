import { GOOGLE_MARK } from '@lezzet/design-tokens/icons';

// Sağlayıcı butonu ikonları — masaüstü ve mobil varyantların paylaştığı sunum parçaları.

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      {GOOGLE_MARK.map((part) => (
        <path key={part.fill} fill={part.fill} d={part.d} />
      ))}
    </svg>
  );
}
