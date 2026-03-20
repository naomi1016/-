import { X, User, Hash, Calendar, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';
import type { Book } from '../types';
import { CATEGORIES } from '../constants';
import { getCategoryId, getCoverFallback } from '../utils';

interface Props {
  book: Book;
  onClose: () => void;
}

const NO_DESC_MESSAGES = [
  { emoji: '🤫', text: '這本書選擇用沉默說話。\n打開它，或許你會聽見。' },
  { emoji: '🌫️', text: '簡介？作者說：「讀了就知道。」\n（他不是很好說話的人。）' },
  { emoji: '🎲', text: '無簡介。這是一種神秘感的經營策略。\n圖書館深表認同。' },
  { emoji: '📦', text: '書介尚在宇宙某處漂流，\n預計不會抵達。' },
  { emoji: '🔮', text: '簡介已被省略。\n據說這樣的書，讀起來特別有緣。' },
];

function getNoDescMessage(bibId?: string) {
  const idx = bibId ? (parseInt(bibId, 10) % NO_DESC_MESSAGES.length) : 0;
  return NO_DESC_MESSAGES[idx];
}

// 將長段文字拆成自然段落（以連續空白、全形空格或 \n 為段落分隔）
function Paragraphs({ text, className = '' }: { text: string; className?: string }) {
  const paras = text.split(/\n+|(?<=。)\s{2,}/).filter(p => p.trim().length > 0);
  return (
    <div className={`space-y-3 ${className}`}>
      {paras.map((p, i) => (
        <p key={i} className="text-stone-600 text-sm leading-7">{p.trim()}</p>
      ))}
    </div>
  );
}

export default function BookModal({ book, onClose }: Props) {
  const catName = CATEGORIES.find(c => c.id === getCategoryId(book.callNumber))?.name ?? '其他';
  const noDescMsg = getNoDescMessage(book.bibId);
  const hasContent = !!(book.description || book.authorDesc);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 頂部封面橫幅 ── */}
        <div className="relative">
          <div className="h-32 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-t-3xl" />
          <div className="absolute -bottom-12 left-6 w-24 h-32 rounded-xl overflow-hidden shadow-lg border-4 border-white bg-stone-100">
            <img
              src={book.coverUrl || getCoverFallback(book)}
              alt={book.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).src = getCoverFallback(book); }}
            />
          </div>
          <button onClick={onClose}
            className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 backdrop-blur-sm text-white rounded-full p-2 transition-colors"
          >
            <X size={18}/>
          </button>
        </div>

        <div className="pt-16 px-6 pb-8 space-y-6">

          {/* ── 基本資訊 ── */}
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded mb-2 inline-block">
              {catName}
            </span>
            <h2 className="text-xl font-bold text-stone-800 leading-snug">{book.title}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-stone-500 text-sm">
              {book.author      && <span className="flex items-center gap-1.5"><User size={13}/>{book.author}</span>}
              {book.publisher   && <span className="flex items-center gap-1.5"><BookOpen size={13}/>{book.publisher}</span>}
              {book.publishYear && <span className="flex items-center gap-1.5"><Calendar size={13}/>{book.publishYear} 年</span>}
              {book.callNumber  && <span className="flex items-center gap-1.5"><Hash size={13}/><span className="font-mono text-xs">{book.callNumber}</span></span>}
            </div>
          </div>

          {/* ── 無簡介佔位 ── */}
          {!hasContent && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
              <span className="text-5xl">{noDescMsg.emoji}</span>
              <p className="text-stone-400 text-sm leading-relaxed whitespace-pre-line">{noDescMsg.text}</p>
            </div>
          )}

          {/* ── 書籍簡介 ── */}
          {book.description && (
            <div className="rounded-2xl border border-stone-100 bg-stone-50 p-5">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-3 flex items-center gap-1.5">
                <BookOpen size={11}/> 書籍簡介
              </h3>
              <Paragraphs text={book.description} />
            </div>
          )}

          {/* ── 作者簡介 ── */}
          {book.authorDesc && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 mb-3 flex items-center gap-1.5">
                <User size={11}/> 作者簡介
              </h3>
              <Paragraphs text={book.authorDesc} />
            </div>
          )}

        </div>
      </motion.div>
    </motion.div>
  );
}
