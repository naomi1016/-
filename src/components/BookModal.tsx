import { useState } from 'react';
import { X, User, Hash, Calendar, BookOpen, LibraryBig, Loader2, ChevronDown, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Book } from '../types';
import { CATEGORIES, BRANCH_MAP } from '../constants';
import { getCategoryId, getCoverFallback } from '../utils';
import { useAvailability } from '../hooks/useAvailability';

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

  const { data: avail, status: availStatus } = useAvailability(book.bibId, true);
  const [branchOpen, setBranchOpen] = useState(false);
  const hasBranches = avail && avail.onShelf > 0 && Object.keys(avail.branches).length > 0;
  const tpmlUrl = `https://book.tpml.edu.tw/bookDetail/${book.bibId}`;

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
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 關閉按鈕（固定在 modal 右上角，不隨捲動移動） ── */}
        <button onClick={onClose}
          className="absolute top-4 right-4 z-20 bg-stone-800/70 hover:bg-stone-800/90 backdrop-blur-sm text-white rounded-full p-2 transition-colors shadow-md"
        >
          <X size={18}/>
        </button>

        {/* ── 捲動區域 ── */}
        <div className="overflow-y-auto rounded-3xl">

        {/* ── 頂部封面橫幅 ── */}
        <div className="relative">
          <div className="h-32 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-t-3xl" />
          <div className="absolute -bottom-12 left-6 w-24 h-32 rounded-xl overflow-hidden shadow-lg border-4 border-white bg-stone-100">
            <img
              src={book.coverUrl || getCoverFallback(book)}
              alt={book.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={e => {
                const img = e.target as HTMLImageElement;
                img.onerror = null;
                img.src = getCoverFallback(book);
              }}
            />
          </div>
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

          {/* ── 館藏狀態 ── */}
          <div className="rounded-2xl border border-stone-100 overflow-hidden">
            <div className="px-5 py-3.5 bg-stone-50 flex items-center gap-2 border-b border-stone-100">
              <LibraryBig size={13} className="text-stone-400"/>
              <span className="text-[11px] font-bold uppercase tracking-widest text-stone-400">館藏狀態</span>
            </div>

            <AnimatePresence mode="wait">
              {availStatus === 'loading' && (
                <motion.div key="loading"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-2 py-6 text-stone-400 text-sm"
                >
                  <Loader2 size={15} className="animate-spin"/>
                  查詢館藏中…
                </motion.div>
              )}

              {availStatus === 'error' && (
                <motion.div key="error"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="py-5 px-5 text-stone-400 text-sm text-center"
                >
                  暫時無法取得館藏資訊
                </motion.div>
              )}

              {availStatus === 'ok' && avail && (
                <motion.div key="ok"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="px-5 py-4 space-y-3"
                >
                  {/* 數字概覽 */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* 在架可借：可點擊展開分館 */}
                    <button
                      onClick={() => hasBranches && setBranchOpen(v => !v)}
                      className={`text-center rounded-xl py-3 transition-all ${
                        hasBranches
                          ? 'bg-emerald-50 hover:bg-emerald-100 cursor-pointer active:scale-95'
                          : 'bg-emerald-50 cursor-default'
                      }`}
                    >
                      <p className="text-2xl font-bold text-emerald-600">{avail.onShelf}</p>
                      <p className="text-[11px] text-emerald-600/70 mt-0.5 flex items-center justify-center gap-0.5">
                        在架可借
                        {hasBranches && (
                          <ChevronDown size={10} className={`transition-transform ${branchOpen ? 'rotate-180' : ''}`}/>
                        )}
                      </p>
                    </button>

                    <div className="text-center rounded-xl bg-amber-50 py-3">
                      <p className="text-2xl font-bold text-amber-500">{avail.checkedOut}</p>
                      <p className="text-[11px] text-amber-500/70 mt-0.5">已借出</p>
                    </div>
                    <div className="text-center rounded-xl bg-stone-50 py-3">
                      <p className="text-2xl font-bold text-stone-500">{avail.total}</p>
                      <p className="text-[11px] text-stone-400 mt-0.5">館藏總數</p>
                    </div>
                  </div>

                  {/* 在架分館列表（展開/收合） */}
                  <AnimatePresence>
                    {branchOpen && hasBranches && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-1 pb-1">
                          <p className="text-[11px] text-stone-400 font-medium mb-2">在架分館</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(avail.branches).map(([code, count]) => (
                              <span key={code}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100"
                              >
                                {BRANCH_MAP[code] ?? code}
                                {count > 1 && (
                                  <span className="bg-emerald-500 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center">
                                    {count}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 最近還書日 */}
                  {avail.onShelf === 0 && avail.recentDueDate && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-center">
                      最近歸還日：{avail.recentDueDate}
                    </p>
                  )}

                  {/* 預約按鈕 */}
                  {book.bibId && (
                    <a
                      href={tpmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                                 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold
                                 shadow hover:shadow-md transition-all active:scale-95"
                    >
                      <ExternalLink size={14}/>
                      前往北圖預約
                    </a>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
        </div>{/* 捲動區域結束 */}
      </motion.div>
    </motion.div>
  );
}
