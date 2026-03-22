import type { Book } from './types';

export function detectLanguage(isbn: string): string {
  if (!isbn) return '';
  const first = isbn.split(/[;,]/)[0].trim();
  const clean = first.replace(/[^0-9]/g, '');
  if (!clean) return '';
  const full = clean.length >= 13 ? clean : '978' + clean;
  if (full.startsWith('9780') || full.startsWith('9781') || full.startsWith('9798')) return 'ENG';
  if (full.startsWith('978957') || full.startsWith('978986') || full.startsWith('978626')) return 'CHI';
  if (full.startsWith('9787')) return 'CHI'; // 中國大陸
  if (full.startsWith('97889') || full.startsWith('9791')) return 'KOR';
  if (full.startsWith('9784')) return 'JPN';
  if (full.startsWith('9782')) return 'FRE';
  if (full.startsWith('97886')) return 'CHI';
  return '';
}

export function getCategoryId(callNumber: string): string {
  if (!callNumber) return 'other';
  if (callNumber.startsWith('C') || callNumber.startsWith('c')) return 'child';
  const first = callNumber.trim().charAt(0);
  return '0123456789'.includes(first) ? first : 'other';
}

export const getCoverFallback = (_book: Book): string => '/no-cover.svg';

/** Redmean 色彩感知距離（比純 Euclidean 更接近人眼感受） */
export function colorDistance(
  [r1, g1, b1]: [number, number, number],
  [r2, g2, b2]: [number, number, number],
): number {
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rMean) / 256) * db * db,
  );
}

/** 回傳與 coverColor 最接近的色板 ID */
export function nearestPaletteId(
  coverColor: [number, number, number],
  palette: ReadonlyArray<{ id: string; rgb: [number, number, number] }>,
): string {
  let best = palette[0].id;
  let bestDist = Infinity;
  for (const { id, rgb } of palette) {
    const d = colorDistance(coverColor, rgb);
    if (d < bestDist) { bestDist = d; best = id; }
  }
  return best;
}
