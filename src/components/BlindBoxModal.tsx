import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shuffle } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Book } from '../types';
import { getCoverFallback } from '../utils';

const API_KEY = process.env.GEMINI_API_KEY || '';

const FALLBACK_JOKES = [
  '書已經認定你了，拒絕是沒有用的。',
  '這不是巧合，這是命運在催你讀書。',
  '算命師說你今天會有奇遇，沒想到是這本書。',
  '書不選人，但這本書……它偏偏選了你。',
  '宇宙的齒輪已轉動，這本書今天就是你的了。',
  '逃不掉的，它已在回家的路上了。',
];

type Phase = 'spinning' | 'slowing' | 'done';

interface Props {
  books: Book[];
  onClose: () => void;
  onOpenBook: (book: Book) => void;
  onReroll: () => void;
}

export default function BlindBoxModal({ books, onClose, onOpenBook, onReroll }: Props) {
  const [phase, setPhase]             = useState<Phase>('spinning');
  const [displayBook, setDisplayBook] = useState<Book>(() => books[Math.floor(Math.random() * books.length)]);
  const [chosenBook, setChosenBook]   = useState<Book | null>(null);
  const [aiMessage, setAiMessage]     = useState('');
  const [msgLoading, setMsgLoading]   = useState(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef  = useRef(false);

  const pickRandom = useCallback(
    () => books[Math.floor(Math.random() * books.length)],
    [books],
  );

  // ── 抽獎動畫 ─────────────────────────────────────────
  useEffect(() => {
    if (!books.length) return;
    const chosen = pickRandom();

    // 每個階段的 [持續ms, 間隔ms]
    const stages: [number, number][] = [
      [1200, 80],   // 快速滾動
      [800,  200],  // 減速
      [500,  400],  // 即將揭曉
    ];

    let stageIdx = 0;
    let elapsed  = 0;

    const tick = () => {
      const [duration, interval] = stages[stageIdx];
      elapsed += interval;

      if (elapsed >= duration) {
        stageIdx++;
        elapsed = 0;
        if (stageIdx === 1) setPhase('slowing');
        if (stageIdx >= stages.length) {
          setDisplayBook(chosen);
          setChosenBook(chosen);
          setPhase('done');
          return;
        }
      }

      setDisplayBook(pickRandom());
      timerRef.current = setTimeout(tick, stages[stageIdx][1]);
    };

    timerRef.current = setTimeout(tick, stages[0][1]);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI 幽默句 ─────────────────────────────────────────
  useEffect(() => {
    if (!chosenBook) return;

    if (!API_KEY) {
      setAiMessage(FALLBACK_JOKES[Math.floor(Math.random() * FALLBACK_JOKES.length)]);
      return;
    }

    abortRef.current = false;
    setMsgLoading(true);

    (async () => {
      try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { thinkingConfig: { thinkingBudget: 0 } } as never,
        });

        const prompt =
          `使用者在圖書館用「盲盒選書」功能，系統隨機抽出了《${chosenBook.title}》` +
          `${chosenBook.author ? `（作者：${chosenBook.author}）` : ''}。\n` +
          `請用一句話，用命運感或幽默語氣說「這本書選中了你」。\n` +
          `嚴格限制：純文字、不能用 Markdown、不能有 **、*、#等符號、不能換行、25字以內、繁體中文。`;

        const result = await model.generateContent(prompt);
        if (abortRef.current) return;
        // 去除任何殘留 Markdown 符號
        const text = result.response.text().trim().replace(/[*#`_~]/g, '');
        setAiMessage(text);
      } catch {
        setAiMessage(FALLBACK_JOKES[Math.floor(Math.random() * FALLBACK_JOKES.length)]);
      } finally {
        if (!abortRef.current) setMsgLoading(false);
      }
    })();

    return () => { abortRef.current = true; };
  }, [chosenBook]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.4, bounce: 0.3 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden"
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 px-6 py-5 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2 mb-0.5">
            <Shuffle size={17} />
            <span className="font-bold text-lg tracking-tight">盲盒選書</span>
          </div>
          <p className="text-white/80 text-sm">
            {phase === 'done' ? '命運已定！' : phase === 'slowing' ? '即將揭曉…' : '書海茫茫，為你抽一本…'}
          </p>
        </div>

        {/* Book cover slot machine */}
        <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-5">

          {/* Cover */}
          <div className="relative">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={displayBook.bibId ?? displayBook.title}
                initial={phase === 'done'
                  ? { scale: 0.7, opacity: 0, rotateY: 90 }
                  : { opacity: 0.6, scaleY: 0.85 }}
                animate={phase === 'done'
                  ? { scale: 1, opacity: 1, rotateY: 0 }
                  : { opacity: 1, scaleY: 1 }}
                transition={phase === 'done'
                  ? { type: 'spring', duration: 0.5, bounce: 0.4 }
                  : { duration: 0.05 }}
                className="w-32 rounded-xl overflow-hidden shadow-xl"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <img
                  src={displayBook.coverUrl || getCoverFallback(displayBook)}
                  alt={displayBook.title}
                  className="w-full object-cover"
                  style={{ aspectRatio: '2/3' }}
                  onError={e => { (e.target as HTMLImageElement).src = getCoverFallback(displayBook); }}
                />
              </motion.div>
            </AnimatePresence>

            {/* 命中光環 */}
            {phase === 'done' && (
              <motion.div
                initial={{ opacity: 0, scale: 1.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="absolute -inset-2 rounded-2xl ring-4 ring-amber-400/50 pointer-events-none"
              />
            )}
          </div>

          {/* 書名 + AI 訊息（done 後才出現） */}
          <AnimatePresence>
            {phase === 'done' && chosenBook && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="w-full space-y-3 text-center"
              >
                <div>
                  <p className="font-bold text-stone-800 text-sm leading-snug line-clamp-1">
                    {chosenBook.title}
                  </p>
                  {chosenBook.author && (
                    <p className="text-stone-400 text-xs mt-0.5">{chosenBook.author}</p>
                  )}
                </div>

                {/* AI 幽默句 */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 h-14 flex items-center justify-center">
                  {msgLoading && !aiMessage ? (
                    <span className="text-amber-400 text-xs animate-pulse">✨ 命運解讀中…</span>
                  ) : (
                    <p className="text-amber-800 text-sm leading-snug text-center line-clamp-2">✨ {aiMessage}</p>
                  )}
                </div>

                {/* 按鈕 */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onReroll}
                    className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-500 text-sm hover:bg-stone-50 transition-colors"
                  >
                    再抽一次
                  </button>
                  <button
                    onClick={() => { onOpenBook(chosenBook); onClose(); }}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 text-white text-sm font-semibold shadow hover:shadow-md transition-all active:scale-95"
                  >
                    就決定是你了！
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 滾動中提示 */}
          {phase !== 'done' && (
            <p className="text-stone-400 text-sm animate-pulse h-6">
              {phase === 'slowing' ? '即將揭曉…' : '書海尋緣中…'}
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
