import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Book } from '../types';
import { LANGUAGE_LABELS, PAGE_SIZE } from '../constants';
import { detectLanguage, getCategoryId, nearestPaletteId } from '../utils';
import { COLOR_PALETTE } from '../constants';

export type SortBy  = 'date' | 'year' | 'class';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  searchQuery: string;
  activeCategory: string;
  selectedLanguages: string[];
  selectedMaterialTypes: string[];
  selectedBranches: string[];
  yearRange: [number, number];
  sortBy:  SortBy;
  sortDir: SortDir;
  selectedColorId: string | null; // 色系篩選
  isSemantic?: boolean; // 語義搜尋模式：輸入已排序，跳過文字搜尋與重新排序
}

export function useBooks() {
  const [books, setBooks]     = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/books.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Book[] = await res.json();
      setBooks(data.map((b, i) => ({ ...b, id: i + 1 })));
    } catch {
      setError('無法讀取 books.json，請先執行爬蟲腳本（scrape_tpml.py）產生資料檔。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  const availableLanguages = useMemo(() => {
    const counts: Record<string, number> = {};
    books.forEach(b => {
      const lang = b.language || detectLanguage(b.isbn ?? '');
      if (lang) counts[lang] = (counts[lang] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([code, count]) => ({ code, label: LANGUAGE_LABELS[code] ?? code, count }))
      .sort((a, b) => b.count - a.count);
  }, [books]);

  const availableMaterialTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    books.forEach(b => { if (b.materialType) counts[b.materialType] = (counts[b.materialType] ?? 0) + 1; });
    return Object.entries(counts).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  }, [books]);

  const availableBranches = useMemo(() => {
    const counts: Record<string, number> = {};
    books.forEach(b => {
      const brs = b.branches?.length ? b.branches : (b.branch ? [b.branch] : []);
      brs.forEach(br => { counts[br] = (counts[br] ?? 0) + 1; });
    });
    return Object.entries(counts).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  }, [books]);

  const yearBounds = useMemo((): [number, number] => {
    const years = books.map(b => b.publishYear).filter((y): y is number => typeof y === 'number');
    if (!years.length) return [2000, new Date().getFullYear()];
    return [Math.min(...years), Math.max(...years)];
  }, [books]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: books.length };
    books.forEach(b => {
      const id = getCategoryId(b.callNumber);
      counts[id] = (counts[id] ?? 0) + 1;
    });
    return counts;
  }, [books]);

  return {
    books, loading, error, loadBooks,
    availableLanguages, availableMaterialTypes, availableBranches, catCounts,
    yearBounds,
  };
}

export function useFilteredBooks(books: Book[], filters: FilterState) {
  const [currentPage, setCurrentPage] = useState(1);

  const { searchQuery, activeCategory, selectedLanguages, selectedMaterialTypes,
          selectedBranches, yearRange, sortBy, sortDir, selectedColorId, isSemantic } = filters;

  useEffect(() => {
    setCurrentPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeCategory,
      selectedLanguages.join(','), selectedMaterialTypes.join(','), selectedBranches.join(','),
      yearRange[0], yearRange[1], sortBy, sortDir]);

  const filteredBooks = useMemo(() => {
    const filtered = books.filter(book => {
      // 語義搜尋模式：輸入已由神經網路排序，跳過文字比對
      if (!isSemantic) {
        const q = searchQuery.toLowerCase();
        const matchSearch = !q ||
          book.title.toLowerCase().includes(q) ||
          (book.author?.toLowerCase().includes(q) ?? false) ||
          (book.description?.toLowerCase().includes(q) ?? false);
        if (!matchSearch) return false;
      }

      const matchCat = activeCategory === 'all' || getCategoryId(book.callNumber) === activeCategory;

      const lang = book.language || detectLanguage(book.isbn ?? '');
      const matchLang = selectedLanguages.length === 0 || selectedLanguages.includes(lang);

      const matchMat = selectedMaterialTypes.length === 0 ||
        (book.materialType ? selectedMaterialTypes.includes(book.materialType) : false);

      const bookBranches = book.branches?.length ? book.branches : (book.branch ? [book.branch] : []);
      const matchBranch = selectedBranches.length === 0 ||
        selectedBranches.some(br => bookBranches.includes(br));

      const y = book.publishYear;
      const matchYear = !y || (y >= yearRange[0] && y <= yearRange[1]);

      const matchColor = !selectedColorId || (
        book.coverColor
          ? nearestPaletteId(book.coverColor, COLOR_PALETTE) === selectedColorId
          : false
      );

      return matchCat && matchLang && matchMat && matchBranch && matchYear && matchColor;
    });

    // 語義搜尋模式：輸入已依相似度排序，不重新排列
    if (!isSemantic) {
      const q = searchQuery.toLowerCase();

      // 文字搜尋時：先依相關度分層（書名 > 作者 > 描述），再依使用者選擇的欄位排序
      const relevance = (b: typeof filtered[0]) => {
        if (!q) return 0;
        if (b.title.toLowerCase().includes(q)) return 2;
        if (b.author?.toLowerCase().includes(q)) return 1;
        return 0; // 僅在描述中命中
      };

      const dir = sortDir === 'asc' ? 1 : -1;
      filtered.sort((a, b) => {
        // 相關度優先（只在有查詢時）
        const relDiff = relevance(b) - relevance(a);
        if (q && relDiff !== 0) return relDiff;

        // 同層內再依使用者選擇的欄位排序
        if (sortBy === 'year') {
          const ya = a.publishYear ?? 0;
          const yb = b.publishYear ?? 0;
          return (ya - yb) * dir;
        }
        if (sortBy === 'class') {
          return (a.callNumber ?? '').localeCompare(b.callNumber ?? '', 'zh-TW') * dir;
        }
        // 'date'：以 bibId（數字）排序
        const da = parseInt(a.bibId ?? '0', 10);
        const db = parseInt(b.bibId ?? '0', 10);
        return (da - db) * dir;
      });
    }

    return filtered;
  }, [books, searchQuery, activeCategory, selectedLanguages, selectedMaterialTypes,
      selectedBranches, yearRange, sortBy, sortDir, selectedColorId, isSemantic]);

  const totalPages = Math.ceil(filteredBooks.length / PAGE_SIZE);
  const pagedBooks = useMemo(
    () => filteredBooks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredBooks, currentPage],
  );

  return { filteredBooks, pagedBooks, currentPage, setCurrentPage, totalPages };
}
