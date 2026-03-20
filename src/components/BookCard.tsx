import { Hash, User, Calendar, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { Book } from '../types';
import { CATEGORIES } from '../constants';
import { getCategoryId, getCoverFallback } from '../utils';

interface Props {
  book: Book;
  onClick: () => void;
}

export default function BookCard({ book, onClick }: Props) {
  const catName = CATEGORIES.find(c => c.id === getCategoryId(book.callNumber))?.name ?? '其他';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
      className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100 hover:shadow-md transition-shadow group cursor-pointer flex flex-col"
      onClick={onClick}
    >
      <div className="aspect-[3/4] bg-stone-100 rounded-xl mb-4 overflow-hidden relative">
        <img
          src={book.coverUrl || getCoverFallback(book)}
          alt={book.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          onError={e => { (e.target as HTMLImageElement).src = getCoverFallback(book); }}
        />
        <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors"/>
        {book._score !== undefined && (
          <div className="absolute top-2 right-2 bg-black/55 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-full backdrop-blur-sm">
            {Math.round(book._score * 100)}%
          </div>
        )}
      </div>

      <h3 className="font-bold text-stone-800 line-clamp-2 mb-2 leading-tight group-hover:text-emerald-700 transition-colors">
        {book.title}
      </h3>
      {book.description && (
        <p className="text-stone-500 text-xs line-clamp-2 mb-4 h-8">{book.description}</p>
      )}

      <div className="space-y-1.5 mt-auto">
        {book.author      && <div className="flex items-center gap-2 text-stone-500 text-[10px]"><User size={12}/><span>{book.author}</span></div>}
        {book.callNumber  && <div className="flex items-center gap-2 text-stone-500 text-[10px]"><Hash size={12}/><span className="font-mono">{book.callNumber}</span></div>}
        {book.publishDate && <div className="flex items-center gap-2 text-stone-500 text-[10px]"><Calendar size={12}/><span>{book.publishDate} 年出版</span></div>}
      </div>

      <div className="mt-4 pt-4 border-t border-stone-50 flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
          {catName}
        </span>
        <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1 group-hover:gap-2 transition-all">
          查看詳情 <ChevronRight size={10}/>
        </span>
      </div>
    </motion.div>
  );
}
