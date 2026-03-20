/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Search, BookOpen, Filter,
  X, Loader2, CalendarDays,
  AlertCircle, RefreshCw, Globe, Layers, MapPin, ChevronDown,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { Book } from './types';
import { BRANCH_MAP, LANGUAGE_LABELS, CATEGORIES } from './constants';
import { getCategoryId } from './utils';
import { useBooks, useFilteredBooks } from './hooks/useBooks';
import type { SortBy, SortDir } from './hooks/useBooks';
import { useNeuralSearch } from './hooks/useNeuralSearch';
import { useSearch } from './hooks/useSearch';
import { useSearchReason } from './hooks/useSearchReason';
import BookCard from './components/BookCard';
import BookModal from './components/BookModal';

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
          className="w-16 text-center text-sm font-mono bg-stone-50 border border-stone-200 rounded-lg py-1 px-1 focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
        />
        <span className="flex-1 h-px bg-stone-200"/>
        <input
          type="text" inputMode="numeric" value={hiText}
          onChange={e => setHiText(e.target.value)}
          onBlur={e => commitHi(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commitHi(hiText)}
          className="w-16 text-center text-sm font-mono bg-stone-50 border border-stone-200 rounded-lg py-1 px-1 focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
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
  activeFilterCount: number;
  clearAllFilters: () => void;
}) {
  const [branchesExpanded, setBranchesExpanded] = useState(false);
  const visibleBranches = branchesExpanded
    ? availableBranches
    : availableBranches.slice(0, BRANCH_COLLAPSED_COUNT);

  const yearActive = yearRange[0] !== yearBounds[0] || yearRange[1] !== yearBounds[1];

  return (
    <aside className="w-56 shrink-0 space-y-6 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-stone-700">
          <Filter size={14}/> 篩選
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
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">
            出版年份
          </h4>
          {yearActive && (
            <button
              onClick={() => setYearRange(yearBounds)}
              className="text-[10px] text-stone-400 hover:text-red-400 transition-colors"
            >
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
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2.5">
          <Globe size={11}/> 語言
        </h4>
        <div className="space-y-1.5">
          {availableLanguages.map(({ code, label, count }) => (
            <label key={code} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox"
                checked={selectedLanguages.includes(code)}
                onChange={e => {
                  if (e.target.checked) setSelectedLanguages(p => [...p, code]);
                  else setSelectedLanguages(p => p.filter(l => l !== code));
                }}
                className="rounded accent-emerald-600 w-3.5 h-3.5 shrink-0"
              />
              <span className="text-sm text-stone-700 group-hover:text-stone-900 flex-1">{label}</span>
              <span className="text-[11px] text-stone-400">{count}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 資料類型 */}
      {availableMaterialTypes.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2.5">
            <Layers size={11}/> 資料類型
          </h4>
          <div className="space-y-1.5">
            {availableMaterialTypes.map(({ code, count }) => (
              <label key={code} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox"
                  checked={selectedMaterialTypes.includes(code)}
                  onChange={e => {
                    if (e.target.checked) setSelectedMaterialTypes(p => [...p, code]);
                    else setSelectedMaterialTypes(p => p.filter(m => m !== code));
                  }}
                  className="rounded accent-emerald-600 w-3.5 h-3.5 shrink-0"
                />
                <span className="text-sm text-stone-700 group-hover:text-stone-900 flex-1">{code}</span>
                <span className="text-[11px] text-stone-400">{count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 館別（可折疊） */}
      {availableBranches.length > 0 && (
        <div>
          <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2.5">
            <MapPin size={11}/> 館別
          </h4>
          <div className="space-y-1.5">
            {visibleBranches.map(({ code, count }) => (
              <label key={code} className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox"
                  checked={selectedBranches.includes(code)}
                  onChange={e => {
                    if (e.target.checked) setSelectedBranches(p => [...p, code]);
                    else setSelectedBranches(p => p.filter(b => b !== code));
                  }}
                  className="rounded accent-emerald-600 w-3.5 h-3.5 shrink-0"
                />
                <span className="text-sm text-stone-700 group-hover:text-stone-900 flex-1 leading-tight">
                  {BRANCH_MAP[code] ?? code}
                </span>
                <span className="text-[11px] text-stone-400 shrink-0">{count}</span>
              </label>
            ))}
          </div>

          {availableBranches.length > BRANCH_COLLAPSED_COUNT && (
            <button
              onClick={() => setBranchesExpanded(v => !v)}
              className="mt-2.5 flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
            >
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 ${branchesExpanded ? 'rotate-180' : ''}`}
              />
              {branchesExpanded
                ? '收起'
                : `顯示全部（${availableBranches.length} 間）`}
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

  // 書本載入後，以實際年份範圍初始化 yearRange，並預設顯示最新月份
  useEffect(() => {
    if (yearBounds[0] !== yearBounds[1]) setYearRange(yearBounds);
  }, [yearBounds[0], yearBounds[1]]);

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
      isSemantic: isSearching,
    },
  );

  // 切換月份時回到第 1 頁
  useEffect(() => { setCurrentPage(1); }, [selectedMonth]);

  const yearActive = yearRange[0] !== yearBounds[0] || yearRange[1] !== yearBounds[1];
  const activeFilterCount =
    selectedLanguages.length + selectedMaterialTypes.length +
    selectedBranches.length + (yearActive ? 1 : 0);

  const clearAllFilters = useCallback(() => {
    setInputValue(''); setSearchQuery(''); setActiveCategory('all');
    setSelectedLanguages([]); setSelectedMaterialTypes([]);
    setSelectedBranches([]); setYearRange(yearBounds);
  }, [yearBounds]);

  const sidebarProps = {
    yearBounds, availableLanguages, availableMaterialTypes, availableBranches,
    selectedLanguages, selectedMaterialTypes, selectedBranches, yearRange,
    setSelectedLanguages, setSelectedMaterialTypes, setSelectedBranches, setYearRange,
    activeFilterCount, clearAllFilters,
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      {/* ── Header ── */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-lg text-white"><BookOpen size={22}/></div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-stone-800">北圖本月新書通報</h1>
              <p className="text-[11px] text-stone-400">免費的新書，最香 🌿</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-sm ml-auto">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className={`md:hidden flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all shrink-0 ${
                activeFilterCount > 0 ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              <Filter size={14}/>
              {activeFilterCount > 0 && <span className="text-xs font-bold">{activeFilterCount}</span>}
            </button>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16}/>
              <input
                type="text"
                placeholder="搜尋書名、作者..."
                className="w-full pl-9 pr-4 py-2 bg-stone-100 border-none rounded-full focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-sm"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* 語義搜尋建議氣泡 */}
      {isSearching && suggestions.length > 0 && (
        <div className="bg-white border-b border-stone-100">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-stone-400 shrink-0">也試試：</span>
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => { setInputValue(s); setSearchQuery(s); }}
                className="px-3 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

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

          {/* 月份 tabs */}
          {availableMonths.length > 0 && (
            <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
              <CalendarDays size={14} className="text-stone-400 shrink-0"/>
              {availableMonths.map(m => {
                const [y, mo] = m.split('-');
                const label = `${y}年${parseInt(mo)}月`;
                return (
                  <button key={m} onClick={() => setSelectedMonth(m)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                      selectedMonth === m
                        ? 'bg-stone-800 text-white shadow-md'
                        : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* 分類 tabs */}
          <div className="flex flex-wrap gap-2 mb-6 pb-1 overflow-x-auto no-scrollbar">
            {CATEGORIES.filter(c => (catCounts[c.id] ?? 0) > 0 || c.id === 'all').map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
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
                <p className="text-sm text-stone-500">
                  共 <span className="font-semibold text-stone-700">{filteredBooks.length}</span> 本
                  {activeFilterCount > 0 && <span className="text-stone-400 ml-1">（已篩選）</span>}
                </p>
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
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      sortBy === key
                        ? 'bg-stone-800 text-white'
                        : 'bg-white text-stone-500 border border-stone-200 hover:border-stone-400'
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
    </div>
  );
}
