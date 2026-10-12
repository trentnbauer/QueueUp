const SAMPLE_SIZE = 48;
const HUE_BUCKETS = 12;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The accent colour of a picture, from its RGBA pixels (as `getImageData` gives them): the hue that
 * the most vivid pixels agree on, ignoring transparent, near-black, near-white and grey ones. The result
 * keeps that hue but is moved to a mid lightness so white text on it stays readable. Null when the
 * picture has no colour to speak of (greyscale, or mostly empty). */
export function pickAccentColour(pixels: ArrayLike<number>): string | null {
  const weight = new Array<number>(HUE_BUCKETS).fill(0);
  const sat = new Array<number>(HUE_BUCKETS).fill(0);
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (l < 0.15 || l > 0.9 || s < 0.25) continue;
    const w = s * (1 - Math.abs(2 * l - 1));
    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor(h / (360 / HUE_BUCKETS)));
    weight[bucket] += w;
    sat[bucket] += w * s;
  }
  const best = weight.indexOf(Math.max(...weight));
  if (weight[best] <= 0) return null;
  // The weighted mean hue of the winning bucket and its neighbours' share would be overkill: the bucket's
  // centre is accurate to 15 degrees, which reads as the same colour.
  const hue = best * (360 / HUE_BUCKETS) + 360 / HUE_BUCKETS / 2;
  const saturation = Math.min(0.85, Math.max(0.45, sat[best] / weight[best]));
  return hslToHex(hue, saturation, 0.5);
}

/** Loads a picture and returns its accent colour, or null when it cannot be read (the picture's host does
 * not allow reading its pixels, it fails to load, or it has no colour). */
export function accentColourOfPicture(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        resolve(pickAccentColour(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data));
      } catch {
        // A picture from a host that does not allow reading it taints the canvas.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
