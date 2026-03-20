import { Hash, User, ChevronRight, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { Book } from '../types';
import { CATEGORIES } from '../constants';
import { getCategoryId, getCoverFallback } from '../utils';

// ── 情緒關鍵字 → Emoji 映射 ───────────────────────────
const MOOD_EMOJI: [string[], string][] = [
  [['熱血', '激情', '熱情', '燃燒', '戰鬥', '革命', '拼搏'], '🔥'],
  [['感人', '催淚', '淚', '動容', '溫情', '暖心', '眼淚'],   '🥺'],
  [['燒腦', '推理', '解謎', '懸疑', '謎題', '智力'],          '🧠'],
  [['幽默', '搞笑', '逗趣', '笑點', '爆笑', '詼諧'],          '😂'],
  [['恐怖', '驚悚', '鬼', '恐懼', '黑暗', '暗黑'],            '👻'],
  [['愛情', '戀愛', '浪漫', '情書', '心動', '告白'],          '💕'],
  [['孤獨', '寂寞', '獨處', '迷茫', '失落'],                  '🫥'],
  [['療癒', '放鬆', '舒壓', '冥想', '平靜', '安心'],          '🌿'],
  [['成功', '致富', '發財', '財富', '賺錢', '創業', '商業'],  '💰'],
  [['成長', '蛻變', '改變', '突破', '進化', '自律'],          '🌱'],
  [['冒險', '旅行', '探索', '遠方', '出走', '流浪'],          '🗺️'],
  [['科技', '未來', '人工智慧', 'AI', '數位', '機器人'],      '🤖'],
  [['歷史', '古代', '文明', '朝代', '帝王', '戰爭'],          '📜'],
  [['哲學', '人生', '思考', '存在', '意義', '覺悟'],          '🔮'],
  [['親子', '家庭', '育兒', '父母', '孩子', '兒童'],          '👨‍👩‍👧'],
  [['心情不好', '憂鬱', '焦慮', '壓力', '崩潰', '煩惱'],      '😮‍💨'],
];

function getMoodEmoji(query: string): string {
  const q = query.toLowerCase();
  for (const [keywords, emoji] of MOOD_EMOJI) {
    if (keywords.some(k => q.includes(k))) return emoji;
  }
  return '';
}

interface Props {
  book: Book;
  onClick: () => void;
  index?: number;
  glowColor?: [number, number, number] | null;
  searchQuery?: string;
  highlighted?: boolean;
}

const CAT_GRADIENT: Record<string, string> = {
  '0': 'from-slate-500 to-zinc-600',
  '1': 'from-purple-500 to-indigo-600',
  '2': 'from-amber-500 to-orange-500',
  '3': 'from-blue-500 to-cyan-500',
  '4': 'from-rose-500 to-pink-500',
  '5': 'from-violet-500 to-purple-600',
  '6': 'from-emerald-500 to-teal-500',
  '7': 'from-green-500 to-emerald-600',
  '8': 'from-pink-500 to-rose-500',
  '9': 'from-fuchsia-500 to-pink-600',
  'child': 'from-yellow-400 to-orange-400',
  'other': 'from-emerald-500 to-teal-500',
};

export default function BookCard({ book, onClick, glowColor, searchQuery = '', highlighted = false }: Props) {
  const catId   = getCategoryId(book.callNumber);
  const catName = CATEGORIES.find(c => c.id === catId)?.name ?? '其他';
  const grad    = CAT_GRADIENT[catId] ?? CAT_GRADIENT['other'];

  const glowRgb   = glowColor ? `rgb(${glowColor.join(',')})` : undefined;
  const glowRgba  = glowColor ? `rgba(${glowColor.join(',')},0.35)` : undefined;
  // 深色版：各通道 × 0.55，用於分類標籤背景
  const darkRgb   = glowColor
    ? `rgb(${glowColor.map(v => Math.round(v * 0.55)).join(',')})`
    : undefined;
  // 半透明版：用於百分比標籤背景
  const badgeBg   = glowColor ? `rgba(${glowColor.join(',')},0.8)` : undefined;

  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.96 },
        show:   { opacity: 1, y: 0,  scale: 1 },
      }}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="group relative bg-white rounded-2xl overflow-hidden
                 cursor-pointer flex flex-col
                 transition-all duration-500 ease-out
                 hover:shadow-2xl hover:-translate-y-2 hover:rotate-[0.4deg]"
      style={{
        border: highlighted
          ? '2px solid #f59e0b'
          : glowRgb ? `2px solid ${glowRgb}` : '2px solid #f5f5f4',
        boxShadow: highlighted
          ? '0 0 0 3px rgba(245,158,11,0.2), 0 4px 24px rgba(245,158,11,0.25)'
          : glowRgba ? `0 0 0 0 ${glowRgba}, 0 4px 24px ${glowRgba}` : undefined,
      }}
      onClick={onClick}
    >
      {/* 漸層光暈 border（hover 時才顯示） */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/15 via-transparent to-teal-400/15
                      opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10" />

      {/* 封面圖 */}
      <div className="relative aspect-[3/4] bg-stone-100 overflow-hidden">
        <img
          src={book.coverUrl || getCoverFallback(book)}
          alt={book.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-all duration-700 ease-out
                     group-hover:scale-110 group-hover:rotate-1"
          loading="lazy"
          onError={e => { (e.target as HTMLImageElement).src = getCoverFallback(book); }}
        />
        {/* 底部漸層遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* 推薦先讀緞帶 */}
        {highlighted && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute top-3 right-0 bg-amber-400 text-white text-[9px] font-bold
                       px-2 py-0.5 rounded-l-full shadow-md z-20 flex items-center gap-0.5"
          >
            ✨ 推薦先讀
          </motion.div>
        )}

        {/* Sparkle（hover 時浮現） */}
        <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100
                        transition-all duration-500 translate-y-2 group-hover:translate-y-0">
          <Sparkles size={16} className="text-yellow-300 drop-shadow-lg animate-pulse" />
        </div>

        {/* 搜尋分數 */}
        {book._score !== undefined && (() => {
          const q = searchQuery.trim().toLowerCase();
          // 只有書名或作者直接含有搜尋字串才算完全匹配
          const isExact = q.length > 0 && (
            book.title.toLowerCase().includes(q) ||
            (book.author?.toLowerCase().includes(q) ?? false)
          );
          let pct: number;
          if (isExact) {
            pct = 100;
          } else {
            // _score 為 cosine 相似度 (0~1) 或 Fuse 相似度 (0~1)
            // 映射至 85–94，再加 bibId deterministic 微抖動 ±2
            const normalized = Math.min(Math.max(book._score, 0), 0.99); // 確保不超過 0.99
            const base = 85 + normalized * 9; // 0→85, 0.99→93.9
            const bibHash = (book.bibId ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            const jitter = (bibHash % 5) - 2;
            pct = Math.round(Math.min(94, Math.max(85, base + jitter)));
          }
          const moodEmoji = getMoodEmoji(searchQuery);
          return (
            <div className="absolute top-2 left-2 text-white text-[10px] font-mono
                            px-1.5 py-0.5 rounded-full backdrop-blur-sm z-20 flex items-center gap-0.5"
                 style={{ background: badgeBg ?? 'rgba(0,0,0,0.55)' }}>
              ✨{pct}%
              {moodEmoji && (
                <motion.span
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
                  className="ml-0.5 text-[11px] leading-none"
                >
                  {moodEmoji}
                </motion.span>
              )}
            </div>
          );
        })()}

        {/* 封面主色圓點 */}
        {book.coverColor && (
          <div
            className="absolute bottom-2 left-2 w-3.5 h-3.5 rounded-full border-2 border-white/80 shadow z-20"
            style={{ backgroundColor: `rgb(${book.coverColor.join(',')})` }}
            title="封面主色"
          />
        )}
      </div>

      {/* 書目資訊 */}
      <div className="relative p-4 flex flex-col flex-1">
        <h3 className="font-bold text-stone-800 line-clamp-2 mb-2 leading-snug
                       transition-all duration-300 group-hover:text-emerald-700 group-hover:translate-x-0.5">
          {book.title}
        </h3>

        {book.description && (
          <p className="text-stone-400 text-xs line-clamp-2 mb-2 h-8">{book.description}</p>
        )}

        <div className="space-y-1.5 mt-auto mb-4">
          {book.author && (
            <div className="flex items-center gap-2 text-stone-500 text-[11px]
                            transition-transform duration-300 group-hover:translate-x-0.5">
              <div className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                <User size={10}/>
              </div>
              <span className="truncate">{book.author}</span>
            </div>
          )}
          {book.callNumber && (
            <div className="flex items-center gap-2 text-stone-500 text-[11px]
                            transition-transform duration-300 delay-75 group-hover:translate-x-0.5">
              <div className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                <Hash size={10}/>
              </div>
              <span className="font-mono">{book.callNumber}</span>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-stone-50 flex justify-between items-center">
          <span
            className={`text-[10px] font-bold text-white px-2.5 py-1 rounded-full shadow-md
                        transition-all duration-500 group-hover:scale-105
                        ${darkRgb ? '' : `bg-gradient-to-r ${grad}`}`}
            style={darkRgb ? { background: darkRgb } : undefined}
          >
            {catName}
          </span>
          <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1
                           group-hover:gap-2 transition-all duration-300">
            查看詳情 <ChevronRight size={11} className="transition-transform duration-300 group-hover:translate-x-0.5"/>
          </span>
        </div>
      </div>
    </motion.article>
  );
}
