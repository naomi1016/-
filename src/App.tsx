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
import { BRANCH_MAP, LANGUAGE_LABELS, CATEGORIES, COLOR_PALETTE, COLOR_SEMANTIC_TAGS } from './constants';
import { getCategoryId, detectLanguage } from './utils';
import { useBooks, useFilteredBooks } from './hooks/useBooks';
import type { SortBy, SortDir } from './hooks/useBooks';
import { useNeuralSearch } from './hooks/useNeuralSearch';
import { useSearch } from './hooks/useSearch';
import { useSearchReason } from './hooks/useSearchReason';
import { useIntentSuggestions } from './hooks/useIntentSuggestions';
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

// ── 分類閱讀冷知識 & 幽默備案 ─────────────────────────
const CATEGORY_FACTS: Record<string, string[]> = {
  '0': [
    '你知道嗎？人類每天產生的資料量足夠填滿 1000 座圖書館，資訊爆炸時代更需要篩選力！',
    '全球最大圖書館是美國國會圖書館，書架加起來長達 1600 公里——比台灣南北長 10 倍。',
  ],
  '1': [
    '你知道嗎？拖延症的英文 Procrastination 源自拉丁文「推到明天」——哲學家兩千年前就在煩惱這件事了。',
    '蘇格拉底一輩子沒有親筆寫過任何一本書，他的思想全靠學生柏拉圖記錄下來。',
  ],
  '2': [
    '你知道嗎？世界上有 4200 多種宗教，人類對「意義」的追尋從未停止過。',
    '《聖經》是全球翻譯語言最多的書，已被譯成超過 700 種語言，幾乎覆蓋地球所有語系。',
  ],
  '3': [
    '你知道嗎？全球 80% 的財富掌握在 20% 的人手中，這就是著名的帕累托法則。',
    '根據研究，每天閱讀 6 分鐘就能降低 68% 的壓力，比聽音樂或散步效果還要好！',
  ],
  '4': [
    '你知道嗎？全球有超過 500 種程式語言，但最熱門的前 5 種就佔了開發者日常工作的 80%。',
    '人類大腦處理圖像的速度比文字快 6 萬倍，所以「一圖勝千言」真的有科學根據！',
  ],
  '5': [
    '你知道嗎？哈佛追蹤 80 年的研究發現，決定幸福感的最重要因素是人際關係品質，不是錢。',
    '社會學研究指出，平均只需 6 個人際連結，你就能認識地球上的任何一個人。',
  ],
  '6': [
    '你知道嗎？台灣曾是全球書店密度最高的地方之一，每 10 萬人約有 20 家書店。',
    '故宮典藏超過 69 萬件文物，若每件看 1 分鐘，需要連續不睡地看上整整 1.3 年！',
  ],
  '7': [
    '你知道嗎？世界上最古老的地圖距今已有 2600 年，刻在一塊巴比倫泥板上。',
    '地球有 195 個國家，但全球護照只有紅、藍、綠、黑、酒紅 5 種顏色。',
  ],
  '8': [
    '你知道嗎？村上春樹每天固定跑 10 公里，他說跑步賦予他寫長篇小說所需的體力與專注力。',
    '《哈利波特》系列全球銷量超過 5 億本，疊起來的高度足以繞地球赤道 20 圈。',
  ],
  '9': [
    '你知道嗎？欣賞藝術品 10 秒鐘就能降低焦慮感，博物館正在成為「處方療癒」的新場所。',
    '音樂能同時啟動大腦的語言、記憶、情感、運動四個區域，是最全面的腦部鍛鍊！',
  ],
  'child': [
    '你知道嗎？兒童平均每天會問 300 個問題！保持好奇心，是所有偉大發現的起點。',
    '研究顯示，從小養成閱讀習慣的孩子，長大後的詞彙量是同齡人的 3 倍！',
  ],
};

// ── 情緒主題色映射（搜尋詞 → 色系） ──────────────────────
const MOOD_THEME_COLORS: [string[], [number, number, number]][] = [
  [['熱血', '激情', '熱情', '燃燒', '戰鬥', '革命', '拼搏'], [220,  50,  50]],
  [['感人', '催淚', '淚', '動容', '溫情', '暖心', '眼淚'],   [230, 110, 170]],
  [['燒腦', '推理', '解謎', '懸疑', '謎題', '智力'],          [140,  80, 210]],
  [['幽默', '搞笑', '逗趣', '笑點', '爆笑', '詼諧'],          [230, 120,  40]],
  [['恐怖', '驚悚', '鬼', '恐懼', '黑暗', '暗黑'],            [100,  40, 100]],
  [['愛情', '戀愛', '浪漫', '情書', '心動', '告白'],          [230,  80, 140]],
  [['孤獨', '寂寞', '獨處', '迷茫', '失落'],                  [ 80, 100, 200]],
  [['療癒', '放鬆', '舒壓', '冥想', '平靜', '安心'],          [ 60, 170,  80]],
  [['成功', '致富', '發財', '財富', '賺錢', '創業', '商業'],  [220, 160,  30]],
  [['成長', '蛻變', '改變', '突破', '進化', '自律'],          [ 50, 170, 100]],
  [['冒險', '旅行', '探索', '遠方', '出走', '流浪'],          [ 40, 170, 160]],
  [['科技', '未來', '人工智慧', 'AI', '數位', '機器人'],      [ 40, 160, 210]],
  [['歷史', '古代', '文明', '朝代', '帝王', '戰爭'],          [140,  85,  45]],
  [['哲學', '人生', '思考', '存在', '意義', '覺悟'],          [110,  60, 190]],
  [['親子', '家庭', '育兒', '父母', '孩子', '兒童'],          [220, 180,  40]],
  [['心情不好', '憂鬱', '焦慮', '壓力', '崩潰', '煩惱'],      [100, 120, 180]],
];

function getMoodThemeColor(query: string): [number, number, number] | null {
  const q = query.toLowerCase();
  for (const [keywords, color] of MOOD_THEME_COLORS) {
    if (keywords.some(k => q.includes(k))) return color;
  }
  return null;
}

// ── 情緒主題趣聞/金句庫 ──────────────────────────────────
const MOOD_FACTS: [string[], string[]][] = [
  [['熱血', '激情', '熱情', '燃燒', '戰鬥', '革命', '拼搏'], [
    '研究顯示，閱讀英雄故事能讓讀者的腎上腺素短暫上升，達到類似運動的「燃」感！✨',
    '馬拉松選手說：最後5公里不是腳跑的，是信念跑的。閱讀熱血故事能強化意志力神經迴路。✨',
    '《老人與海》只有27,000字，卻讓海明威拿下諾貝爾文學獎——熱血不需要用字數衡量。✨',
  ]],
  [['感人', '催淚', '淚', '動容', '溫情', '暖心', '眼淚'], [
    '科學家發現，看感人故事流下的淚水含有特殊的「情緒蛋白質」，有助於舒緩壓力。✨',
    '人在閱讀時產生的同理心，與現實生活中的同理心使用相同的神經迴路——讀越多，心越暖。✨',
    '《小王子》初版於1943年，至今被譯成300多種語言，是史上最多人一起流淚的故事。✨',
  ]],
  [['燒腦', '推理', '解謎', '懸疑', '謎題', '智力'], [
    '世界上最早的偵探小說通常被認為是愛倫·坡的《莫格街謀殺案》，它開啟了理性演繹的時代。✨',
    '閱讀推理小說能訓練大腦的「前額葉皮質」——那正是邏輯思考與問題解決的核心區域。✨',
    '福爾摩斯的原型是愛丁堡大學外科醫生約瑟夫·貝爾，柯南·道爾曾是他的學生。✨',
    '阿嘉莎·克莉絲蒂是全球最暢銷的推理作家，作品累積銷售超過20億本，僅次於莎士比亞。✨',
  ]],
  [['幽默', '搞笑', '逗趣', '笑點', '爆笑', '詼諧'], [
    '笑一分鐘相當於十分鐘的划船運動。所以讀幽默書，也是在健身！✨',
    '研究發現，幽默感強的人平均壽命比悲觀者長7年，笑聲能降低皮質醇（壓力荷爾蒙）。✨',
    '馬克·吐溫說：「禁書是最值得一讀的書，因為禁書有趣。」幽默永遠是最好的護身符。✨',
  ]],
  [['恐怖', '驚悚', '鬼', '恐懼', '黑暗', '暗黑'], [
    '閱讀恐怖故事時的恐懼感，能讓大腦釋放腎上腺素，這種「安全的驚嚇」其實是一種享受。✨',
    '史蒂芬·金每天寫2000字，雷打不動——包括生日和節假日。他說：「天才是勤奮的。」✨',
    '愛倫·坡在世時幾乎一無所有，死後卻成為影響柯南·道爾、波特萊爾和博爾赫斯的精神源頭。✨',
  ]],
  [['愛情', '戀愛', '浪漫', '情書', '心動', '告白'], [
    '閱讀羅曼史小說的人，在現實關係中的溝通能力普遍更好——因為他們練習了更多換位思考。✨',
    '「我愛你」在全球700種語言中都存在，但沒有任何一種語言能完整翻譯另一種語言的愛意。✨',
    '《傲慢與偏見》中達西先生的第一次求婚被拒，後來成為文學史上最精彩的逆轉告白。✨',
  ]],
  [['孤獨', '寂寞', '獨處', '迷茫', '失落'], [
    '讀書是世界上最划算的「陪伴」——作者花了幾年寫的智慧，你用幾小時就能全部收下。✨',
    '卡夫卡說：「書必須是一把鑿破我們心中冰封海洋的斧子。」孤獨時，書是最好的破冰者。✨',
    '卡繆說：「在隆冬，我終於發現，在我心中有一個不可征服的夏天。」✨',
  ]],
  [['療癒', '放鬆', '舒壓', '冥想', '平靜', '安心'], [
    '閱讀6分鐘能降低68%的壓力——比散步、喝茶或聽音樂效果都更顯著。✨',
    '「書療法」（Bibliotherapy）已在英國NHS中被正式採用，醫生可以直接開立書單作為處方。✨',
    '森林浴的療癒效果有8小時，閱讀的療癒效果則沒有期限——書可以一讀再讀。✨',
  ]],
  [['成功', '致富', '發財', '財富', '賺錢', '創業', '商業'], [
    '比爾·蓋茲每年讀50本書，巴菲特每天80%的時間在閱讀。財富從閱讀開始。✨',
    '研究顯示，年收入較高的人平均每月讀2本書，而一般人每月讀不到1本。知識就是複利。✨',
    '蒙格說：「我這輩子遇到的聰明人，沒有一個不大量閱讀的。」✨',
  ]],
  [['成長', '蛻變', '改變', '突破', '進化', '自律'], [
    '大腦每學一項新技能，神經元之間就會形成新的突觸連接——成長真的是看得見的物理變化。✨',
    '「今天的你比昨天進步一點點，一年後的你就是365個版本的升級。」閱讀是最小的進步單位。✨',
    '《原子習慣》作者詹姆斯·克利爾說：每天進步1%，一年後你會好到360倍。✨',
  ]],
  [['冒險', '旅行', '探索', '遠方', '出走', '流浪'], [
    '閱讀遊記時，大腦啟動的區域與真實旅行幾乎相同——一本書能帶你去地球的任何角落。✨',
    '世界上最早的旅遊文學是《馬可·波羅遊記》，它讓哥倫布相信西航可到達亞洲，間接「發現」了美洲。✨',
    '人均閱讀量最高的國家是芬蘭，巧合的是他們的旅遊幸福感也長年排名全球第一。✨',
  ]],
  [['科技', '未來', '人工智慧', 'AI', '數位', '機器人'], [
    '科幻小說預言了智慧型手機、網際網路和人工智慧——它不是幻想，是工程師的藍圖。✨',
    '第一個提出「機器人」概念的是1920年捷克劇作家卡雷爾·恰佩克，他的劇本《R.U.R.》讓世界認識了這個詞。✨',
    '1968年，亞瑟·克拉克在《2001太空漫遊》中描述的HAL 9000，被認為是最早影響AI研究方向的文學形象。✨',
  ]],
  [['歷史', '古代', '文明', '朝代', '帝王', '戰爭'], [
    '閱讀歷史能讓你「免費穿越」——每讀一本史書，就是站在巨人肩膀上看世界的機會。✨',
    '克麗奧佩托拉距離我們的時代，比距離吉薩金字塔建成的時代更近——歷史比你想的更長。✨',
    '成吉思汗的帝國佔地球陸地面積的22%，至今仍是人類歷史上最大的連續帝國。✨',
  ]],
  [['哲學', '人生', '思考', '存在', '意義', '覺悟'], [
    '蘇格拉底從未寫過任何東西，他所有的思想都透過學生柏拉圖的記錄流傳至今。✨',
    '「我思故我在」——笛卡兒用一句話，奠定了近代哲學的基礎。哲學就是用語言對抗虛無。✨',
    '維根斯坦說：「凡是能說的，都能說清楚；凡是不能說的，就應該保持沉默。」✨',
  ]],
  [['親子', '家庭', '育兒', '父母', '孩子', '兒童'], [
    '兒童平均每天提問300個問題！保持好奇心，是所有偉大發現的起點。✨',
    '研究顯示，從小每天被父母朗讀15分鐘的孩子，入學時詞彙量比同齡人多出1萬個單字。✨',
    '哈利·波特系列讓全球數百萬不愛閱讀的孩子第一次主動拿起書——一個故事真的能改變一代人。✨',
  ]],
  [['心情不好', '憂鬱', '焦慮', '壓力', '崩潰', '煩惱'], [
    '閱讀6分鐘能降低68%的壓力，效果超過散步和聽音樂。翻開書，就是最快的喘息。✨',
    '情緒低落時，大腦需要「被理解」的感覺。閱讀他人的困境與療癒，能讓你的杏仁核真正平靜下來。✨',
    '村上春樹說：「今天的痛苦，是明天的力量。」每次翻書，都是在給自己充電。✨',
  ]],
];

function getMoodFacts(query: string): string[] | null {
  const q = query.toLowerCase();
  for (const [keywords, facts] of MOOD_FACTS) {
    if (keywords.some(k => q.includes(k))) return facts;
  }
  return null;
}

const FUNNY_MESSAGES = [
  '🤖 AI 思考過度，正在喝機油充電中… 但它剛才悄悄告訴我，這幾本你一定會喜歡！',
  '🤖 AI 正在宇宙某處搜索靈感，請稍候… 總之這幾本書評價很高，先翻翻看！',
  '📚 據不可靠消息指出，讀完這幾本書的人，都過上了他們想要的生活。（樣本數：1）',
  '🔮 AI 水晶球正在校準中… 但直覺告訴我，你會喜歡這幾本的！',
  '🤖 偵測到使用者品味極佳，正在為您挑選最優質書單中… 其實就是這幾本，快看！',
];

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

  // AI 意圖預測（輸入時即時產生補全建議）
  const { suggestions: intentSuggestions, loading: intentLoading } = useIntentSuggestions(inputValue);

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

  // 無 AI 推薦理由時的備案訊息（情緒趣聞 > 分類冷知識 > 幽默語）
  const fallbackMessage = useMemo(() => {
    if (!isSearching || reasonLoading || searchReason || filteredBooks.length === 0) return '';
    const hash = searchQuery.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

    // 1️⃣ 優先：情緒/主題相關趣聞
    const moodFacts = getMoodFacts(searchQuery);
    if (moodFacts) return moodFacts[hash % moodFacts.length];

    // 2️⃣ 次之：分類冷知識
    let catId = activeCategory !== 'all' ? activeCategory : null;
    if (!catId) {
      const freq: Record<string, number> = {};
      filteredBooks.slice(0, 10).forEach(b => {
        const id = getCategoryId(b.callNumber);
        freq[id] = (freq[id] ?? 0) + 1;
      });
      catId = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
    const facts = catId ? CATEGORY_FACTS[catId] : null;
    if (facts && hash % 3 !== 0) return facts[hash % facts.length];

    // 3️⃣ 兜底：幽默語
    return FUNNY_MESSAGES[hash % FUNNY_MESSAGES.length];
  }, [isSearching, reasonLoading, searchReason, filteredBooks, activeCategory, searchQuery]);

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

  // 情緒主題色：色系篩選 > 搜尋情緒色 > null
  const selectedColorRgb = selectedColorId
    ? (COLOR_PALETTE.find(c => c.id === selectedColorId)?.rgb ?? null)
    : null;
  const moodThemeColor = useMemo(() => getMoodThemeColor(searchQuery), [searchQuery]);
  const activeThemeColor: [number, number, number] | null = selectedColorRgb ?? moodThemeColor;

  // 同步 CSS 變數到 :root，讓外部 CSS 也可引用
  useEffect(() => {
    const root = document.documentElement;
    if (activeThemeColor) {
      root.style.setProperty('--theme-color', `rgb(${activeThemeColor.join(',')})`);
      root.style.setProperty('--theme-color-raw', activeThemeColor.join(','));
    } else {
      root.style.removeProperty('--theme-color');
      root.style.removeProperty('--theme-color-raw');
    }
  }, [activeThemeColor]);

  // 搜尋框/按鈕的主題色 style helpers
  const themeRgb  = activeThemeColor ? `rgb(${activeThemeColor.join(',')})` : null;
  const themeGrad = activeThemeColor
    ? `linear-gradient(135deg, rgb(${activeThemeColor.join(',')}), rgb(${activeThemeColor.map(v => Math.round(v * 0.72)).join(',')}))`
    : null;
  const themeBorder = themeRgb ? `2px solid ${themeRgb}` : undefined;
  const themeGlow   = activeThemeColor
    ? `0 0 0 3px rgba(${activeThemeColor.join(',')},0.12), 0 4px 20px rgba(${activeThemeColor.join(',')},0.18)`
    : undefined;

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
            <div
              className={`flex items-center gap-0 bg-white rounded-2xl overflow-hidden shadow-sm transition-all duration-500
                          ${!activeThemeColor ? 'border-2 border-stone-200 focus-within:border-emerald-400 focus-within:shadow-md focus-within:shadow-emerald-500/10' : ''}`}
              style={activeThemeColor ? { border: themeBorder, boxShadow: themeGlow } : undefined}
            >
              {/* 左側圖示 */}
              <div className="pl-1.5 shrink-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shadow transition-all duration-500"
                  style={{ background: themeGrad ?? 'linear-gradient(135deg,#10b981,#14b8a6)' }}
                >
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
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white
                             text-sm font-semibold shadow hover:shadow-md
                             transition-all duration-500 active:scale-95"
                  style={{ background: themeGrad ?? 'linear-gradient(135deg,#10b981,#14b8a6)' }}
                >
                  <Search size={14}/>
                  ✨ AI 搜尋
                </button>
              </div>
            </div>

            {/* AI 意圖預測氣泡（輸入中即時顯示） */}
            <AnimatePresence>
              {inputValue && (intentSuggestions.length > 0 || intentLoading) && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
                  className="mt-2.5 flex items-center gap-2 flex-wrap"
                >
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold shrink-0">
                    ✨ AI 猜你想找
                  </span>
                  {intentLoading && intentSuggestions.length === 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-stone-400">
                      <Loader2 size={11} className="animate-spin"/> 思考中…
                    </span>
                  )}
                  {intentSuggestions.map(s => (
                    <motion.button
                      key={s}
                      initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => { setInputValue(s); setSearchQuery(s); }}
                      className="px-3 py-1 rounded-full text-xs font-medium
                                 bg-gradient-to-r from-emerald-50 to-teal-50
                                 text-emerald-700 border border-emerald-200
                                 hover:from-emerald-100 hover:to-teal-100
                                 hover:shadow-sm hover:border-emerald-300
                                 transition-all duration-200 active:scale-95"
                    >
                      #{s}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* 熱門標籤 / 語義搜尋建議 / 色系聯想標籤 */}
            <AnimatePresence mode="wait">
              {isSearching && suggestions.length > 0 ? (
                /* 搜尋後：也試試 */
                <motion.div key="also-try"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-2 flex items-center gap-2 flex-wrap justify-center"
                >
                  <span className="text-[11px] text-stone-400 shrink-0">也試試：</span>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { setInputValue(s); setSearchQuery(s); }}
                      className="px-3 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700
                                 hover:bg-emerald-100 border border-emerald-200 transition-colors">
                      {s}
                    </button>
                  ))}
                </motion.div>

              ) : !inputValue && selectedColorId && COLOR_SEMANTIC_TAGS[selectedColorId] ? (() => {
                /* 選擇色系：顯示對應語義標籤 */
                const palette = COLOR_PALETTE.find(c => c.id === selectedColorId)!;
                const rgb = palette.rgb;
                const colorRgba = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.15)`;
                const colorBorder = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`;
                const colorText = `rgb(${Math.round(rgb[0]*0.6)},${Math.round(rgb[1]*0.6)},${Math.round(rgb[2]*0.6)})`;
                return (
                  <motion.div key={`color-${selectedColorId}`}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="mt-2 flex items-center gap-2 flex-wrap justify-center"
                  >
                    <span className="text-[11px] font-semibold shrink-0" style={{ color: colorText }}>
                      ✨ {palette.name}系聯想：
                    </span>
                    {COLOR_SEMANTIC_TAGS[selectedColorId].map((tag, i) => (
                      <motion.button
                        key={tag}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.06, duration: 0.18 }}
                        onClick={() => { setInputValue(tag); setSearchQuery(tag); }}
                        className="px-3 py-1 rounded-full text-xs font-medium transition-all duration-200
                                   hover:shadow-md active:scale-95"
                        style={{
                          background: colorRgba,
                          border: `1px solid ${colorBorder}`,
                          color: colorText,
                        }}
                      >
                        #{tag}
                      </motion.button>
                    ))}
                  </motion.div>
                );
              })() : !inputValue ? (
                /* 預設：熱門標籤 */
                <motion.div key="default-tags"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="mt-2 flex items-center gap-2 flex-wrap justify-center"
                >
                  <span className="text-[11px] text-stone-400 shrink-0">✨ AI 推薦試試看：</span>
                  {['發大財', '心情不好', '職場壓力', '親子關係', '自我成長'].map(tag => (
                    <button key={tag} onClick={() => setInputValue(tag)}
                      className="px-3 py-0.5 rounded-full text-xs text-stone-500
                                 bg-stone-100 hover:bg-emerald-50 hover:text-emerald-700
                                 border border-stone-200 hover:border-emerald-200 transition-all">
                      {tag}
                    </button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
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
                    <Loader2 size={11} className="animate-spin"/> ✨ AI 語義模型載入中…
                  </span>
                )}
                {isSearching && modelStatus === 'ready' && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-0.5 rounded-full shadow-sm">
                    ✨ AI 語義搜尋
                  </span>
                )}
                {isSearching && (modelStatus === 'error' || modelStatus === 'idle') && (
                  <span className="text-[11px] text-stone-400 border border-stone-200 px-2 py-0.5 rounded-full">模糊搜尋</span>
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
              {/* AI 推薦原因 / 備案訊息 / 零結果提示 */}
              <AnimatePresence mode="wait">
                {isSearching && (() => {
                  const isZero = filteredBooks.length === 0 && !reasonLoading;
                  const hasContent = searchReason || reasonLoading || fallbackMessage || isZero;
                  if (!hasContent) return null;

                  const isGreen = searchReason || reasonLoading;
                  const key = isZero ? 'zero' : searchReason ? 'reason' : reasonLoading ? 'loading' : 'fallback';

                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className={`mb-5 flex items-start gap-2.5 rounded-xl px-4 py-3 border w-full ${
                        isGreen
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-amber-50 border-amber-100'
                      }`}
                      style={{
                        boxShadow: isGreen
                          ? '0 2px 12px rgba(16,185,129,0.10), 0 1px 4px rgba(16,185,129,0.08)'
                          : '0 2px 12px rgba(245,158,11,0.12), 0 1px 4px rgba(245,158,11,0.08)',
                      }}
                    >
                      <span className="text-base shrink-0 mt-px">
                        {isZero ? '🔍' : reasonLoading ? '✨' : searchReason ? '✨' : '💡'}
                      </span>
                      {reasonLoading ? (
                        <span className="text-sm text-stone-400 animate-pulse">正在分析推薦原因…</span>
                      ) : isZero ? (
                        <span className="text-sm text-amber-800 leading-relaxed">
                          看來這區的書都被借光了，要不要點擊{' '}
                          <button
                            onClick={() => { setInputValue('發大財'); setSearchQuery('發大財'); }}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold
                                       bg-amber-200 text-amber-900 hover:bg-amber-300 transition-colors mx-0.5"
                          >
                            #發大財
                          </button>
                          {' '}標籤試試看別的領域？
                        </span>
                      ) : searchReason ? (
                        <span className="text-sm text-emerald-800 leading-relaxed">{searchReason}</span>
                      ) : (
                        <span className="text-sm text-amber-800 leading-relaxed">{fallbackMessage}</span>
                      )}
                    </motion.div>
                  );
                })()}
              </AnimatePresence>

              <motion.div
                key={`${selectedColorId ?? ''}-${currentPage}`}
                variants={{ show: { transition: { staggerChildren: 0.04, delayChildren: 0 } } }}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
              >
                <AnimatePresence mode="popLayout">
                  {pagedBooks.length > 0 ? (
                    pagedBooks.map((book, i) => (
                      <BookCard
                        key={book.bibId ?? book.title}
                        book={book}
                        index={i}
                        searchQuery={searchQuery}
                        glowColor={activeThemeColor}
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
              </motion.div>

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
