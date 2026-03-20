import { useMemo } from 'react';
import Fuse from 'fuse.js';
import type { Book } from '../types';
import { CATEGORIES } from '../constants';
import { getCategoryId } from '../utils';

const FIELD_LABEL: Record<string, string> = {
  title: '書名', author: '作者', description: '簡介', publisher: '出版社',
};

export function useSearch(books: Book[], query: string) {
  const fuse = useMemo(
    () => new Fuse(books, {
      includeScore:    true,
      includeMatches:  true,
      minMatchCharLength: 1,
      threshold:       0.45,
      ignoreLocation:  true,
      keys: [
        { name: 'title',       weight: 3   },
        { name: 'author',      weight: 2   },
        { name: 'description', weight: 1   },
        { name: 'publisher',   weight: 0.3 },
      ],
    }),
    [books],
  );

  return useMemo(() => {
    const q = query.trim();
    if (!q) return { scoredBooks: null as Book[] | null, suggestions: [] as string[] };

    const results = fuse.search(q);

    // 把 Fuse score 和命中欄位寫回書目物件（optional fields）
    const scoredBooks: Book[] = results.map(r => ({
      ...r.item,
      _score: 1 - (r.score ?? 1),
      _matchedFields: [
        ...new Set(
          (r.matches ?? [])
            .map(m => FIELD_LABEL[m.key ?? ''] ?? '')
            .filter(Boolean),
        ),
      ],
    }));

    // ── 建議氣泡：高頻作者 + 高頻分類 ──────────────
    const seen = new Set<string>([q]);
    const suggs: string[] = [];

    // 前 15 筆中出現最多的作者
    const authorCount: Record<string, number> = {};
    for (const r of results.slice(0, 15)) {
      const name = (r.item.author ?? '').split(/[,，/、（(]/)[0].trim();
      if (name.length >= 2 && name.length <= 10)
        authorCount[name] = (authorCount[name] ?? 0) + 1;
    }
    Object.entries(authorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([name]) => {
        if (!seen.has(name)) { suggs.push(name); seen.add(name); }
      });

    // 前 25 筆中出現最多的分類
    const catCount: Record<string, number> = {};
    for (const r of results.slice(0, 25)) {
      const id = getCategoryId(r.item.callNumber);
      if (id && id !== 'all') catCount[id] = (catCount[id] ?? 0) + 1;
    }
    Object.entries(catCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([id]) => {
        const name = CATEGORIES.find(c => c.id === id)?.name ?? '';
        if (name && !seen.has(name)) { suggs.push(name); seen.add(name); }
      });

    return { scoredBooks, suggestions: suggs.slice(0, 7) };
  }, [fuse, query]);
}
