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

export const getCoverFallback = (book: Book) =>
  `https://picsum.photos/seed/${encodeURIComponent(book.title)}/300/400`;
