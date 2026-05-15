function rgbToHsl(
  rInput: number,
  gInput: number,
  bInput: number,
): { h: number; s: number; l: number } {
  const r = rInput / 255;
  const g = gInput / 255;
  const b = bInput / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === r) {
      h = (g - b) / d + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }

    h *= 60;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function parseToHSL(color: string): { h: number; s: number; l: number } {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // forces the browser to resolve the color
  ctx.fillStyle = color;
  const resolved = ctx.fillStyle; // will be a hex color like "#rrggbb"

  const hex = resolved.replace(/^#/, '');
  const normalizedHex =
    hex.length === 3
      ? hex
          .split('')
          .map(c => c + c)
          .join('')
      : hex;

  const bigint = parseInt(normalizedHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return rgbToHsl(r, g, b);
}

export function generateColorVariants(
  inputColor: string = 'royalblue',
  count: number,
  startLightness = 70,
  endLightness = 30,
): string[] {
  const { h, s } = parseToHSL(inputColor);
  const step = (startLightness - endLightness) / Math.max(count - 1, 1);

  return Array.from({ length: count }, (_, i) => {
    const l = startLightness - i * step;
    return `hsl(${h}, ${s}%, ${l}%)`;
  });
}
