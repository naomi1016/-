/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Search, BookOpen, Filter, Sparkles,
  X, Loader2, CalendarDays,
  AlertCircle, RefreshCw, Globe, MapPin, ChevronDown, BookText, Palette,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { Book } from './types';
import { BRANCH_MAP, LANGUAGE_LABELS, CATEGORIES, COLOR_PALETTE } from './constants';
import { getCategoryId, detectLanguage } from './utils';
import { useBooks, useFilteredBooks } from './hooks/useBooks';
import type { SortBy, SortDir } from './hooks/useBooks';
import { useNeuralSearch } from './hooks/useNeuralSearch';
import { useSearch } from './hooks/useSearch';
import { useSearchReason } from './hooks/useSearchReason';
import BookCard from './components/BookCard';
import BookModal from './components/BookModal';
import PwaInstallBanner from './components/PwaInstallBanner';

// ── 出版年份區間滑桿 ──────────────────────────────────
function YearRangeSlider({
  min, max, value, onChange,
}: {
  min: number; max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const [lo, hi] = value;
  const trackRef = useRef<HTMLDivElement>(null);

  // 本地字串 state，讓使用者可以清空後重新輸入
  const [loText, setLoText] = useState(String(lo));
  const [hiText, setHiText] = useState(String(hi));

  // 當外部 value 因拖曳滑桿而改變時，同步更新文字
  useMemo(() => { setLoText(String(lo)); }, [lo]);
  useMemo(() => { setHiText(String(hi)); }, [hi]);

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const loLeft = pct(lo);
  const hiRight = 100 - pct(hi);

  const clampLo = (v: number) => Math.max(min, Math.min(v, hi));
  const clampHi = (v: number) => Math.min(max, Math.max(v, lo));

  const commitLo = (raw: string) => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? lo : clampLo(n);
    setLoText(String(clamped));
    onChange([clamped, hi]);
  };

  const commitHi = (raw: string) => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? hi : clampHi(n);
    setHiText(String(clamped));
    onChange([lo, clamped]);
  };

  return (
    <div className="space-y-3">
      {/* 數字輸入行 */}
      <div className="flex items-center gap-2">
        <input
          type="text" inputMode="numeric" value={loText}
          onChange={e => setLoText(e.target.value)}
          onBlur={e => commitLo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commitLo(loText)}
          className="w-16 text-center text-sm font-bold font-mono bg-white border-2 border-stone-200 rounded-xl py-1.5 px-1 focus:border-emerald-400 outline-none shadow-sm transition-colors hover:border-stone-300"
        />
        <span className="flex-1 h-px bg-stone-200"/>
        <input
          type="text" inputMode="numeric" value={hiText}
          onChange={e => setHiText(e.target.value)}
          onBlur={e => commitHi(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commitHi(hiText)}
          className="w-16 text-center text-sm font-bold font-mono bg-white border-2 border-stone-200 rounded-xl py-1.5 px-1 focus:border-emerald-400 outline-none shadow-sm transition-colors hover:border-stone-300"
        />
      </div>

      {/* 滑桿軌道 */}
      <div ref={trackRef} className="relative h-5 flex items-center">
        {/* 背景軌道 */}
        <div className="absolute w-full h-1.5 rounded-full bg-stone-200"/>
        {/* 選取區間 */}
        <div
          className="absolute h-1.5 rounded-full bg-emerald-500"
          style={{ left: `${loLeft}%`, right: `${hiRight}%` }}
        />
        {/* 下限把手 */}
        <input
          type="range" min={min} max={max} value={lo}
          onChange={e => onChange([clampLo(Number(e.target.value)), hi])}
          className="absolute w-full appearance-none bg-transparent pointer-events-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:pointer-events-auto
            [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500
            [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110"
          style={{ zIndex: lo > max - (max - min) * 0.1 ? 5 : 3 }}
        />
        {/* 上限把手 */}
        <input
          type="range" min={min} max={max} value={hi}
          onChange={e => onChange([lo, clampHi(Number(e.target.value))])}
          className="absolute w-full appearance-none bg-transparent pointer-events-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:pointer-events-auto
            [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-500
            [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110"
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  );
}

// ── 左側欄篩選元件 ────────────────────────────────────
const BRANCH_COLLAPSED_COUNT = 5;

function FilterSidebar({
  yearBounds,
  availableLanguages,
  availableMaterialTypes,
  availableBranches,
  selectedLanguages,
  selectedMaterialTypes,
  selectedBranches,
  yearRange,
  setSelectedLanguages,
  setSelectedMaterialTypes,
  setSelectedBranches,
  setYearRange,
  selectedColorId,
  setSelectedColorId,
  activeFilterCount,
  clearAllFilters,
}: {
  yearBounds: [number, number];
  availableLanguages: { code: string; label: string; count: number }[];
  availableMaterialTypes: { code: string; count: number }[];
  availableBranches: { code: string; count: number }[];
  selectedLanguages: string[];
  selectedMaterialTypes: string[];
  selectedBranches: string[];
  yearRange: [number, number];
  setSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedMaterialTypes: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedBranches: React.Dispatch<React.SetStateAction<string[]>>;
  setYearRange: React.Dispatch<React.SetStateAction<[number, number]>>;
  selectedColorId: string | null;
  setSelectedColorId: React.Dispatch<React.SetStateAction<string | null>>;
  activeFilterCount: number;
  clearAllFilters: () => void;
}) {
  const [branchesExpanded, setBranchesExpanded] = useState(false);
  const visibleBranches = branchesExpanded
    ? availableBranches
    : availableBranches.slice(0, BRANCH_COLLAPSED_COUNT);

  const yearActive = yearRange[0] !== yearBounds[0] || yearRange[1] !== yearBounds[1];

  const LANG_EMOJI: Record<string, string> = { CHI:'🇹🇼', ENG:'🇺🇸', KOR:'🇰🇷', JPN:'🇯🇵', FRE:'🇫🇷' };
  const TYPE_EMOJI: Record<string, string> = { '圖書':'📚', '視聽資料':'📀', '期刊':'📰', '其他':'📦' };

  return (
    <aside className="w-60 shrink-0 space-y-6 overflow-y-auto pr-1">
      {/* 篩選標題 */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-stone-700">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow shadow-emerald-400/30">
            <Filter size={13} className="text-white"/>
          </div>
          篩選
        </h3>
        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters}
            className="text-[11px] text-stone-400 hover:text-red-500 flex items-center gap-1 transition-colors"
          >
            <X size={10}/> 清除 ({activeFilterCount})
          </button>
        )}
      </div>

      {/* 出版年份 */}
      <div className="p-3.5 rounded-2xl bg-stone-100/70 border border-stone-200/60">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-500 flex items-center gap-1.5">
            📅 出版年份
          </h4>
          {yearActive && (
            <button onClick={() => setYearRange(yearBounds)}
              className="text-[10px] text-stone-400 hover:text-red-400 transition-colors">
              重設
            </button>
          )}
        </div>
        <YearRangeSlider
          min={yearBounds[0]} max={yearBounds[1]}
          value={yearRange}
          onChange={setYearRange}
        />
      </div>

      {/* 語言 */}
      <div>
        <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-stone-500 mb-2.5">
          <div className="w-6 h-6 rounded-lg bg-teal-100 flex items-center justify-center">
            <Globe size={11} className="text-teal-600"/>
          </div>
          語言
        </h4>
        <div className="space-y-1">
          {availableLanguages.map(({ code, label, count }) => (
            <label key={code}
              className={`flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl transition-all duration-200
                          hover:bg-stone-100 hover:scale-[1.02] hover:shadow-sm
                          ${selectedLanguages.includes(code) ? 'bg-stone-100 shadow-sm' : ''}`}
            >
              <input type="checkbox"
                checked={selectedLanguages.includes(code)}
                onChange={e => {
                  if (e.target.checked) setSelectedLanguages(p => [...p, code]);
                  else setSelectedLanguages(p => p.filter(l => l !== code));
                }}
                className="rounded accent-emerald-600 w-3.5 h-3.5 shrink-0"
              />
              <span className="text-base leading-none">{LANG_EMOJI[code] ?? '🌐'}</span>
              <span className="text-sm text-stone-700 flex-1">{label}</span>
              <span className="text-[11px] font-semibold text-stone-400 bg-stone-200/70 px-2 py-0.5 rounded-full tabular-nums">{count}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 資料類型 */}
      {availableMaterialTypes.length > 0 && (
        <div>
          <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-stone-500 mb-2.5">
            <div className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center">
              <BookText size={11} className="text-violet-600"/>
            </div>
            資料類型
          </h4>
          <div className="space-y-1">
            {availableMaterialTypes.map(({ code, count }) => (
              <label key={code}
                className={`flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl transition-all duration-200
                            hover:bg-stone-100 hover:scale-[1.02] hover:shadow-sm
                            ${selectedMaterialTypes.includes(code) ? 'bg-stone-100 shadow-sm' : ''}`}
              >
                <input type="checkbox"
                  checked={selectedMaterialTypes.includes(code)}
                  onChange={e => {
                    if (e.target.checked) setSelectedMaterialTypes(p => [...p, code]);
                    else setSelectedMaterialTypes(p => p.filter(m => m !== code));
                  }}
                  className="rounded accent-emerald-600 w-3.5 h-3.5 shrink-0"
                />
                <span className="text-base leading-none">{TYPE_EMOJI[code] ?? '📄'}</span>
                <span className="text-sm text-stone-700 flex-1">{code}</span>
                <span className="text-[11px] font-semibold text-stone-400 bg-stone-200/70 px-2 py-0.5 rounded-full tabular-nums">{count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 色系 */}
      <div>
        <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-stone-500 mb-2.5">
          <div className="w-6 h-6 rounded-lg bg-pink-100 flex items-center justify-center">
            <Palette size={11} className="text-pink-500"/>
          </div>
          封面色系
        </h4>
        <div className="grid grid-cols-7 gap-2 p-3 rounded-2xl bg-stone-100/60">
          {COLOR_PALETTE.map(({ id, name, rgb }) => {
            const isSelected = selectedColorId === id;
            return (
              <button
                key={id} title={name}
                onClick={() => setSelectedColorId(isSelected ? null : id)}
                className={`w-7 h-7 rounded-full transition-all duration-300 transform
                            hover:scale-125 hover:rotate-12 hover:shadow-lg
                            ${isSelected
                              ? 'scale-125 ring-2 ring-offset-2 ring-offset-stone-100 ring-stone-600 shadow-lg'
                              : 'hover:ring-2 hover:ring-offset-1 hover:ring-stone-400'}`}
                style={{ backgroundColor: `rgb(${rgb.join(',')})`,
                         border: id === 'cream' ? '1px solid #d6d3d1' : undefined }}
              />
            );
          })}
        </div>
        {selectedColorId && (
          <p className="mt-1.5 text-[11px] text-stone-500">
            {COLOR_PALETTE.find(c => c.id === selectedColorId)?.name} 色系
            <button onClick={() => setSelectedColorId(null)} className="ml-1.5 text-stone-400 hover:text-red-400">✕</button>
          </p>
        )}
      </div>

      {/* 館別（可折疊） */}
      {availableBranches.length > 0 && (
        <div>
          <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-stone-500 mb-2.5">
            <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center">
              <MapPin size={11} className="text-rose-500"/>
            </div>
            館別
          </h4>
          <div className="space-y-1">
            {visibleBranches.map(({ code, count }) => (
              <label key={code}
                className={`flex items-center gap-2.5 cursor-pointer p-2.5 rounded-xl transition-all duration-200
                            hover:bg-stone-100 hover:scale-[1.02] hover:shadow-sm
                            ${selectedBranches.includes(code) ? 'bg-stone-100 shadow-sm' : ''}`}
              >
                <input type="checkbox"
                  checked={selectedBranches.includes(code)}
                  onChange={e => {
                    if (e.target.checked) setSelectedBranches(p => [...p, code]);
                    else setSelectedBranches(p => p.filter(b => b !== code));
                  }}
                  className="rounded accent-emerald-600 w-3.5 h-3.5 shrink-0"
                />
                <span className="text-sm text-stone-700 flex-1 leading-tight">{BRANCH_MAP[code] ?? code}</span>
                <span className="text-[11px] font-semibold text-stone-400 bg-stone-200/70 px-2 py-0.5 rounded-full tabular-nums shrink-0">{count}</span>
              </label>
            ))}
          </div>

          {availableBranches.length > BRANCH_COLLAPSED_COUNT && (
            <button
              onClick={() => setBranchesExpanded(v => !v)}
              className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
            >
              <ChevronDown size={12} className={`transition-transform duration-200 ${branchesExpanded ? 'rotate-180' : ''}`}/>
              {branchesExpanded ? '收起' : `顯示全部（${availableBranches.length} 間）`}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

// ── 主 App ────────────────────────────────────────────
export default function App() {
  const {
    books, loading, error, loadBooks,
    availableLanguages, availableMaterialTypes, availableBranches,
    yearBounds,
  } = useBooks();

  const [inputValue,   setInputValue]             = useState('');
  const [searchQuery, setSearchQuery]             = useState('');
  const [activeCategory, setActiveCategory]       = useState('all');
  const [selectedBook, setSelectedBook]           = useState<Book | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedMaterialTypes, setSelectedMaterialTypes] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches]   = useState<string[]>([]);
  const [yearRange, setYearRange]                 = useState<[number, number]>(yearBounds);
  const [sidebarOpen, setSidebarOpen]             = useState(false);
  const [selectedColorId, setSelectedColorId]     = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth]         = useState('all');
  const [sortBy,  setSortBy]                      = useState<SortBy>('date');
  const [sortDir, setSortDir]                     = useState<SortDir>('desc');

  // 搜尋 debounce：輸入後 250 ms 才真正觸發搜尋，避免每次按鍵都掃 3000+ 筆
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(inputValue), 250);
    return () => clearTimeout(t);
  }, [inputValue]);

  // 可用月份清單（最新在前）
  const availableMonths = useMemo(() => {
    const months = [...new Set(books.map(b => b.month).filter(Boolean))] as string[];
    return months.sort().reverse();
  }, [books]);

  // 書本載入後，預設顯示最新月份

  useEffect(() => {
    if (availableMonths.length > 0 && selectedMonth === 'all') {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths]);

  // 按月份預過濾
  const monthFilteredBooks = useMemo(
    () => selectedMonth === 'all' ? books : books.filter(b => b.month === selectedMonth),
    [books, selectedMonth],
  );

  // 依當月書目計算年份範圍
  const monthYearBounds = useMemo((): [number, number] => {
    const years = monthFilteredBooks
      .map(b => b.publishYear)
      .filter((y): y is number => typeof y === 'number');
    if (!years.length) return yearBounds;
    return [Math.min(...years), Math.max(...years)];
  }, [monthFilteredBooks, yearBounds]);

  // 月份切換時重設年份滑桿
  useEffect(() => {
    setYearRange(monthYearBounds);
  }, [monthYearBounds[0], monthYearBounds[1]]);

  // 以月份過濾後的書目計算語言/類型/館別數量
  const monthAvailableLanguages = useMemo(() => {
    const counts: Record<string, number> = {};
    monthFilteredBooks.forEach(b => {
      const lang = b.language || detectLanguage(b.isbn ?? '');
      if (lang) counts[lang] = (counts[lang] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([code, count]) => ({ code, label: LANGUAGE_LABELS[code] ?? code, count }))
      .sort((a, b) => b.count - a.count);
  }, [monthFilteredBooks]);

  const monthAvailableMaterialTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    monthFilteredBooks.forEach(b => { if (b.materialType) counts[b.materialType] = (counts[b.materialType] ?? 0) + 1; });
    return Object.entries(counts).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  }, [monthFilteredBooks]);

  const monthAvailableBranches = useMemo(() => {
    const counts: Record<string, number> = {};
    monthFilteredBooks.forEach(b => {
      const brs = b.branches?.length ? b.branches : (b.branch ? [b.branch] : []);
      brs.forEach(br => { counts[br] = (counts[br] ?? 0) + 1; });
    });
    return Object.entries(counts).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  }, [monthFilteredBooks]);

  // 以月份過濾後的書目計算分類數量
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: monthFilteredBooks.length };
    monthFilteredBooks.forEach(b => {
      const id = getCategoryId(b.callNumber);
      counts[id] = (counts[id] ?? 0) + 1;
    });
    return counts;
  }, [monthFilteredBooks]);

  // 語義搜尋（神經網路就緒後接管；未就緒時 scoredBooks=null）
  const { scoredBooks: neuralBooks, suggestions: neuralSuggestions, modelStatus } = useNeuralSearch(monthFilteredBooks, searchQuery);
  // Fuse.js fallback：神經網路尚未就緒時提供語義相近的模糊比對
  const { scoredBooks: fuseBooks, suggestions: fuseSuggestions } = useSearch(monthFilteredBooks, searchQuery);
  const scoredBooks = neuralBooks ?? fuseBooks;
  const suggestions = neuralBooks ? neuralSuggestions : fuseSuggestions;
  const isSearching = scoredBooks !== null;

  // AI 推薦原因（Gemini，靜默失敗）
  const { reason: searchReason, loading: reasonLoading } = useSearchReason(
    searchQuery,
    scoredBooks?.slice(0, 5) ?? [],
  );

  // 搜尋中：以排序後結果為輸入，後續只套用類別/語言等篩選
  const booksForFilter = isSearching ? scoredBooks : monthFilteredBooks;

  const { filteredBooks, pagedBooks, currentPage, setCurrentPage, totalPages } = useFilteredBooks(
    booksForFilter,
    {
      searchQuery: isSearching ? '' : searchQuery, // 神經搜尋已排序，不重複文字搜尋
      activeCategory, selectedLanguages, selectedMaterialTypes, selectedBranches,
      yearRange, sortBy, sortDir,
      selectedColorId,
      isSemantic: isSearching,
    },
  );

  // 切換月份時回到第 1 頁
  useEffect(() => { setCurrentPage(1); }, [selectedMonth]);

  const yearActive = yearRange[0] !== yearBounds[0] || yearRange[1] !== yearBounds[1];
  const activeFilterCount =
    selectedLanguages.length + selectedMaterialTypes.length +
    selectedBranches.length + (yearActive ? 1 : 0) + (selectedColorId ? 1 : 0);

  const clearAllFilters = useCallback(() => {
    setInputValue(''); setSearchQuery(''); setActiveCategory('all');
    setSelectedLanguages([]); setSelectedMaterialTypes([]);
    setSelectedBranches([]); setYearRange(monthYearBounds);
    setSelectedColorId(null);
  }, [monthYearBounds]);

  const sidebarProps = {
    yearBounds: monthYearBounds,
    availableLanguages: monthAvailableLanguages,
    availableMaterialTypes: monthAvailableMaterialTypes,
    availableBranches: monthAvailableBranches,
    selectedLanguages, selectedMaterialTypes, selectedBranches, yearRange,
    setSelectedLanguages, setSelectedMaterialTypes, setSelectedBranches, setYearRange,
    selectedColorId, setSelectedColorId,
    activeFilterCount, clearAllFilters,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-stone-50 to-emerald-50/40 text-stone-900 font-sans">
      {/* ── Header ── */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-stone-200/60 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          {/* 左：Logo + 標題 */}
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 p-2.5 rounded-xl text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-110 hover:rotate-3">
                <BookOpen size={20}/>
              </div>
              <Sparkles size={13} className="absolute -top-1 -right-1 text-yellow-400 animate-pulse"/>
            </div>
            <div>
              <h1 className="text-xl font-extrabold bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-700 bg-clip-text text-transparent leading-tight tracking-tight">
                北圖新書通報
              </h1>
              <p className="text-[11px] text-stone-400 hidden sm:block">
                免費的新書，最香 <span className="inline-block animate-bounce">🌿</span>
              </p>
            </div>
          </div>

          {/* 右：行動版篩選按鈕 */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className={`md:hidden flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all shrink-0 ${
              activeFilterCount > 0
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Filter size={14}/>
            {activeFilterCount > 0 && <span className="text-xs font-bold">{activeFilterCount}</span>}
          </button>
        </div>
      </header>


      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6 items-start">

        {/* 桌面版左側欄 */}
        <div className="hidden md:flex sticky top-[73px] self-start h-[calc(100vh-89px)] overflow-y-auto pb-4">
          <FilterSidebar {...sidebarProps}/>
        </div>

        {/* 行動版 overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-20 bg-black/40 md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.div
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed left-0 top-0 bottom-0 z-30 w-64 bg-white shadow-2xl overflow-y-auto p-5 md:hidden"
              >
                <div className="flex justify-between items-center mb-4">
                  <span className="font-bold text-stone-800">篩選條件</span>
                  <button onClick={() => setSidebarOpen(false)} className="text-stone-400 hover:text-stone-700">
                    <X size={18}/>
                  </button>
                </div>
                <FilterSidebar {...sidebarProps}/>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* 右側主內容 */}
        <div className="flex-1 min-w-0">

          {/* ── 搜尋列 ── */}
          <div className="mb-6">
            {/* 搜尋框 */}
            <div className="flex items-center gap-0 bg-white border-2 border-stone-200
                            rounded-2xl overflow-hidden shadow-sm
                            focus-within:border-emerald-400 focus-within:shadow-md
                            focus-within:shadow-emerald-500/10 transition-all duration-300">
              {/* 左側圖示 */}
              <div className="pl-1.5 shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500
                                flex items-center justify-center shadow shadow-emerald-400/30">
                  <Search size={16} className="text-white"/>
                </div>
              </div>

              {/* 輸入框 */}
              <input
                type="text"
                placeholder="輸入情緒、主題、關鍵字…例如「發大財」"
                className="flex-1 px-4 py-3 bg-transparent outline-none text-stone-800
                           placeholder:text-stone-400 text-sm"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setInputValue('')}
              />

              {/* 清除按鈕 */}
              {inputValue && (
                <button onClick={() => setInputValue('')}
                  className="px-3 text-stone-300 hover:text-stone-500 transition-colors shrink-0">
                  <X size={16}/>
                </button>
              )}

              {/* 搜尋按鈕 */}
              <div className="pr-1.5 shrink-0">
                <button
                  onClick={() => setSearchQuery(inputValue)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl
                             bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                             text-sm font-semibold shadow shadow-emerald-400/30
                             hover:shadow-md hover:shadow-emerald-500/25
                             transition-all duration-200 active:scale-95"
                >
                  <Search size={14}/>
                  搜尋
                </button>
              </div>
            </div>

            {/* 熱門標籤 / 搜尋建議 */}
            <div className="mt-2.5 flex items-center gap-2 flex-wrap justify-center">
              {isSearching && suggestions.length > 0 ? (
                <>
                  <span className="text-[11px] text-stone-400 shrink-0">也試試：</span>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { setInputValue(s); setSearchQuery(s); }}
                      className="px-3 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700
                                 hover:bg-emerald-100 border border-emerald-200 transition-colors">
                      {s}
                    </button>
                  ))}
                </>
              ) : !inputValue ? (
                <>
                  <span className="text-[11px] text-stone-400 shrink-0">試試看：</span>
                  {['發大財', '心情不好', '職場壓力', '親子關係', '自我成長'].map(tag => (
                    <button key={tag} onClick={() => setInputValue(tag)}
                      className="px-3 py-0.5 rounded-full text-xs text-stone-500
                                 bg-stone-100 hover:bg-emerald-50 hover:text-emerald-700
                                 border border-stone-200 hover:border-emerald-200 transition-all">
                      {tag}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </div>

          {/* 月份 tabs */}
          {availableMonths.length > 0 && (
            <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
              <CalendarDays size={14} className="text-stone-400 shrink-0"/>
              {availableMonths.map(m => {
                const [y, mo] = m.split('-');
                const moNum = parseInt(mo);
                const label = `${y}年${moNum}月`;
                const isActive = selectedMonth === m;
                const MONTH_EMOJI: Record<number, [string, string]> = {
                  1:  ['🎊', 'animate-bounce'],  2:  ['❄️', 'animate-spin'],
                  3:  ['🌸', 'animate-bounce'],  4:  ['🌱', 'animate-pulse'],
                  5:  ['🌻', 'animate-bounce'],  6:  ['☀️', 'animate-spin'],
                  7:  ['🌊', 'animate-pulse'],   8:  ['🌟', 'animate-pulse'],
                  9:  ['🍂', 'animate-bounce'],  10: ['🎃', 'animate-bounce'],
                  11: ['🍁', 'animate-pulse'],   12: ['🎄', 'animate-bounce'],
                };
                const [emoji, aniClass] = MONTH_EMOJI[moNum] ?? ['📅', ''];
                return (
                  <button key={m} onClick={() => setSelectedMonth(m)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium
                                transition-all duration-300 whitespace-nowrap ${
                      isActive
                        ? 'bg-gradient-to-r from-stone-800 to-stone-700 text-white shadow-md shadow-stone-400/30'
                        : 'bg-white/80 text-stone-600 hover:bg-white hover:shadow-sm border border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <span className={`text-base leading-none ${isActive ? aniClass : ''}`}>{emoji}</span>
                    {label}
                    {isActive && <span className="text-xs leading-none animate-pulse">✨</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* 分類 tabs */}
          <div className="flex flex-wrap gap-2 mb-6 pb-1 overflow-x-auto no-scrollbar">
            {CATEGORIES.filter(c => (catCounts[c.id] ?? 0) > 0 || c.id === 'all').map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25'
                    : 'bg-white/80 text-stone-600 hover:bg-white hover:shadow-sm border border-stone-200 hover:border-emerald-200'
                }`}
              >
                {cat.name}
                {catCounts[cat.id] !== undefined && (
                  <span className={`ml-1.5 text-[10px] font-bold ${activeCategory === cat.id ? 'text-emerald-200' : 'text-stone-400'}`}>
                    {catCounts[cat.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 狀態列＋排序 */}
          {!loading && !error && (
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                    <Sparkles size={14} className="text-emerald-600"/>
                  </div>
                  <p className="text-sm text-stone-500">
                    共 <span className="font-bold text-xl bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">{filteredBooks.length}</span> 本
                    {activeFilterCount > 0 && <span className="text-stone-400 ml-1 text-xs">（已篩選）</span>}
                  </p>
                </div>
                {isSearching && modelStatus === 'loading' && (
                  <span className="flex items-center gap-1.5 text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                    <Loader2 size={11} className="animate-spin"/> 語義模型載入中（首次需下載 ~100 MB）
                  </span>
                )}
                {isSearching && modelStatus === 'ready' && (
                  <span className="text-[11px] text-emerald-600 font-medium">✦ 語義搜尋</span>
                )}
                {isSearching && (modelStatus === 'error' || modelStatus === 'idle') && (
                  <span className="text-[11px] text-stone-400">模糊搜尋</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* 排序欄位按鈕 */}
                {([ ['date','展示日期'], ['year','出版年份'], ['class','分類號'] ] as [SortBy, string][]).map(([key, label]) => (
                  <button key={key}
                    onClick={() => {
                      if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                      else { setSortBy(key); setSortDir('desc'); }
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-300 ${
                      sortBy === key
                        ? 'bg-gradient-to-r from-stone-800 to-stone-700 text-white shadow-sm'
                        : 'bg-white/80 text-stone-500 border border-stone-200 hover:border-stone-400 hover:bg-white'
                    }`}
                  >
                    {label}
                    {sortBy === key && (
                      <span className="text-[10px] leading-none">{sortDir === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </button>
                ))}

                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters}
                    className="ml-1 text-xs text-stone-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                  >
                    <X size={11}/> 清除篩選
                  </button>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-stone-400">
              <Loader2 size={36} className="animate-spin text-emerald-500"/>
              <p>正在讀取書目資料…</p>
            </div>
          )}

          {!loading && error && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4 max-w-xl mt-4">
              <AlertCircle size={24} className="text-amber-500 shrink-0 mt-0.5"/>
              <div>
                <p className="font-semibold text-amber-800 mb-1">尚未取得資料</p>
                <p className="text-amber-700 text-sm leading-relaxed">{error}</p>
                <div className="bg-stone-800 text-emerald-400 font-mono text-xs rounded-lg px-4 py-3 mt-4 leading-relaxed">
                  pip install playwright beautifulsoup4<br/>
                  python -m playwright install chromium<br/>
                  python scrape_tpml.py
                </div>
                <button onClick={loadBooks}
                  className="mt-4 flex items-center gap-2 text-emerald-600 font-medium hover:underline text-sm"
                >
                  <RefreshCw size={14}/> 重新載入
                </button>
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* AI 推薦原因 */}
              {isSearching && (searchReason || reasonLoading) && (
                <div className="mb-5 flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                  <span className="text-base shrink-0 mt-px">✦</span>
                  {reasonLoading ? (
                    <span className="text-sm text-stone-400 animate-pulse">正在分析推薦原因…</span>
                  ) : (
                    <span className="text-sm text-emerald-800 leading-relaxed">{searchReason}</span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                <AnimatePresence mode="popLayout">
                  {pagedBooks.length > 0 ? (
                    pagedBooks.map(book => (
                      <BookCard
                        key={book.bibId ?? book.title}
                        book={book}
                        onClick={() => setSelectedBook(book)}
                      />
                    ))
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="col-span-full py-20 text-center"
                    >
                      <div className="bg-stone-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-300">
                        <Search size={32}/>
                      </div>
                      <p className="text-stone-500">找不到符合條件的圖書</p>
                      <button onClick={clearAllFilters} className="mt-4 text-emerald-600 font-medium hover:underline">
                        清除所有過濾條件
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-10">
                  <button
                    onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0); }}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-30 transition-all"
                  >
                    ← 上一頁
                  </button>
                  <span className="text-stone-500 text-sm px-4">
                    第 {currentPage} / {totalPages} 頁
                  </span>
                  <button
                    onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo(0, 0); }}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-30 transition-all"
                  >
                    下一頁 →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="max-w-7xl mx-auto px-4 py-10 border-t border-stone-200 mt-8 text-center">
        <p className="text-stone-400 text-sm">
          © 2026 北圖本月新書通報 ·
          資料來源：<a href="https://book.tpml.edu.tw" target="_blank" rel="noreferrer"
            className="hover:text-emerald-600 transition-colors">台北市立圖書館</a>
        </p>
      </footer>

      <AnimatePresence>
        {selectedBook && (
          <BookModal book={selectedBook} onClose={() => setSelectedBook(null)}/>
        )}
      </AnimatePresence>

      <PwaInstallBanner />
    </div>
  );
}
