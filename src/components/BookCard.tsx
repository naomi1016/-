import { Hash, User, ChevronRight, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { Book } from '../types';
import { CATEGORIES } from '../constants';
import { getCategoryId, getCoverFallback } from '../utils';

interface Props {
  book: Book;
  onClick: () => void;
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

export default function BookCard({ book, onClick }: Props) {
  const catId   = getCategoryId(book.callNumber);
  const catName = CATEGORIES.find(c => c.id === catId)?.name ?? '其他';
  const grad    = CAT_GRADIENT[catId] ?? CAT_GRADIENT['other'];

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
      className="group relative bg-white rounded-2xl border-2 border-stone-100 overflow-hidden
                 cursor-pointer flex flex-col
                 transition-all duration-500 ease-out
                 hover:shadow-2xl hover:shadow-emerald-500/10
                 hover:-translate-y-2 hover:border-emerald-200/60 hover:rotate-[0.4deg]"
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

        {/* Sparkle（hover 時浮現） */}
        <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100
                        transition-all duration-500 translate-y-2 group-hover:translate-y-0">
          <Sparkles size={16} className="text-yellow-300 drop-shadow-lg animate-pulse" />
        </div>

        {/* 搜尋分數 */}
        {book._score !== undefined && (
          <div className="absolute top-2 left-2 bg-black/55 text-white text-[10px] font-mono
                          px-1.5 py-0.5 rounded-full backdrop-blur-sm z-20">
            {Math.round(book._score * 100)}%
          </div>
        )}

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
          <p className="text-stone-400 text-xs line-clamp-2 mb-3 h-8">{book.description}</p>
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
          <span className={`text-[10px] font-bold text-white px-2.5 py-1 rounded-full
                           bg-gradient-to-r ${grad} shadow-md
                           transition-transform duration-300 group-hover:scale-105`}>
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
