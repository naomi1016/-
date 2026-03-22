import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Check, Camera, Loader2 } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Book } from '../types';
import { getCoverFallback } from '../utils';

const API_KEY = process.env.GEMINI_API_KEY || '';

// ── Canvas helpers ──────────────────────────────────────────────────────────
function cRRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);    ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);        ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function cWrapText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number, maxLines = 2) {
  let line = ''; const lines: string[] = [];
  for (const ch of Array.from(text)) {
    const t = line + ch;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      if (lines.length >= maxLines) { lines[lines.length - 1] += '…'; break; }
      line = ch;
    } else { line = t; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

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
  const [copied, setCopied]           = useState(false);
  const [textCopied, setTextCopied]   = useState(false); // 行動端分享後提示文字已複製
  const [sharing, setSharing]         = useState(false);
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

  // ── 生成分享卡片（Canvas） ─────────────────────────────
  const generateShareCard = useCallback(async (): Promise<Blob | null> => {
    if (!chosenBook) return null;
    const W = 630, H = 900;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const FONT = `"PingFang TC","Noto Sans TC",system-ui,sans-serif`;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#fbbf24'); bg.addColorStop(0.55, '#f97316'); bg.addColorStop(1, '#f43f5e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // White card
    ctx.fillStyle = 'white'; cRRect(ctx, 24, 24, W - 48, H - 48, 32); ctx.fill();

    // Header gradient band
    const hg = ctx.createLinearGradient(24, 24, W - 24, 200);
    hg.addColorStop(0, '#fbbf24'); hg.addColorStop(1, '#f97316');
    ctx.fillStyle = hg; cRRect(ctx, 24, 24, W - 48, 160, 32); ctx.fill();
    ctx.fillRect(24, 140, W - 48, 44); // fill bottom of header (remove lower radius)

    // Header text
    ctx.fillStyle = 'white'; ctx.textAlign = 'center';
    ctx.font = `bold 34px ${FONT}`; ctx.fillText('✨ 抽一張 SSR 靈魂伴侶 🃏', W / 2, 94);
    ctx.font = `22px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText('命運已定！', W / 2, 138);

    // Cover area
    const covW = 230, covH = 310, covX = (W - covW) / 2, covY = 212;

    // Try CORS load; fallback to styled placeholder
    let coverOk = false;
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.crossOrigin = 'anonymous';
        i.onload = () => res(i); i.onerror = rej;
        i.src = chosenBook.coverUrl || ''; setTimeout(rej, 6000);
      });
      ctx.save(); cRRect(ctx, covX, covY, covW, covH, 14); ctx.clip();
      ctx.drawImage(img, covX, covY, covW, covH); ctx.restore();
      coverOk = true;
    } catch { /* CORS blocked → use placeholder */ }

    if (!coverOk) {
      // Stylized placeholder: gradient + title
      const pg = ctx.createLinearGradient(covX, covY, covX + covW, covY + covH);
      pg.addColorStop(0, '#065f46'); pg.addColorStop(1, '#0c4a6e');
      ctx.fillStyle = pg; cRRect(ctx, covX, covY, covW, covH, 14); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(covX + 12, covY + 12, covW - 24, 2);
      ctx.fillRect(covX + 12, covY + covH - 14, covW - 24, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.textAlign = 'center';
      ctx.font = `bold 22px ${FONT}`;
      cWrapText(ctx, chosenBook.title, W / 2, covY + covH / 2 - 22, covW - 24, 30, 3);
    }

    // Cover golden glow border
    ctx.save();
    ctx.shadowColor = 'rgba(251,191,36,0.55)'; ctx.shadowBlur = 20;
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3.5;
    cRRect(ctx, covX - 4, covY - 4, covW + 8, covH + 8, 18); ctx.stroke();
    ctx.restore();

    // Book title + author
    const infoY = covY + covH + 44;
    ctx.fillStyle = '#1c1917'; ctx.textAlign = 'center';
    ctx.font = `bold 27px ${FONT}`;
    cWrapText(ctx, chosenBook.title, W / 2, infoY, W - 96, 36, 2);
    if (chosenBook.author) {
      ctx.fillStyle = '#78716c'; ctx.font = `19px ${FONT}`;
      ctx.fillText(chosenBook.author.slice(0, 32), W / 2, infoY + 84);
    }

    // AI message box
    const msgY = infoY + 116;
    ctx.fillStyle = '#fffbeb'; cRRect(ctx, 52, msgY, W - 104, 108, 20); ctx.fill();
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2;
    cRRect(ctx, 52, msgY, W - 104, 108, 20); ctx.stroke();
    ctx.fillStyle = '#92400e'; ctx.font = `20px ${FONT}`; ctx.textAlign = 'center';
    cWrapText(ctx, `✨ ${aiMessage}`, W / 2, msgY + 36, W - 136, 30, 2);

    // Branding footer
    ctx.fillStyle = '#a8a29e'; ctx.font = `15px system-ui,sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('Serendipity · 北市圖新書導航', W / 2, H - 40);

    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
  }, [chosenBook, aiMessage]);

  // ── 分享 ───────────────────────────────────────────────
  const handleShare = useCallback(async (platform: string) => {
    if (!chosenBook) return;
    const shareText = `我在「Serendipity 北市圖新書導航」盲盒選書中抽到了《${chosenBook.title}》✨${aiMessage ? `\n${aiMessage}` : ''}\n快來試試你的命運之書！`;
    const url = window.location.href;
    const fullText = `${shareText}\n${url}`;

    const isMobileNav = navigator.maxTouchPoints > 1;
    const platformUrls: Record<string, string> = {
      // LINE：手機用 URI scheme 直接開 app；桌面用 universal link
      line:     isMobileNav
        ? `line://msg/text/?${encodeURIComponent(fullText)}`
        : `https://line.me/R/msg/text/?${encodeURIComponent(fullText)}`,
      // Facebook：無可靠 mobile deep link，維持 web 分享頁
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(shareText)}`,
      // Threads：universal link，iOS 有安裝 app 時會直接開啟
      threads:  `https://www.threads.net/intent/post?text=${encodeURIComponent(fullText)}`,
    };

    // ── Step 1：立即同步複製文字（user gesture 仍有效時）──────
    // execCommand 是同步的，不受 user gesture 視窗限制
    try {
      const ta = document.createElement('textarea');
      ta.value = fullText;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;pointer-events:none';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch { /* ok */ }
    // 同時非同步嘗試現代 API（可能覆寫上方結果，但更可靠）
    navigator.clipboard?.writeText(fullText).catch(() => {});

    // ── Step 2：生成圖片（async，不影響剪貼簿時序）────────────
    setSharing(true);
    try {
      const blob = await generateShareCard();
      if (!blob) throw new Error('canvas failed');
      const file = new File([blob], 'serendipity-book.png', { type: 'image/png' });

      const isMobile = navigator.maxTouchPoints > 1;
      let nativeShared = false;

      // 手機：直接 try navigator.share（不依賴 canShare，部分裝置 canShare 回傳 false 但 share 仍可用）
      if (isMobile && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            files: [file],
            title: chosenBook.title,
            ...(platform === 'screenshot' ? { text: fullText } : {}),
          });
          nativeShared = true;
          // 分享完成後開啟平台（平台按鈕）
          if (platform !== 'screenshot' && platformUrls[platform]) {
            window.open(platformUrls[platform], '_blank', 'noopener,noreferrer');
          }
          // 提示使用者文字已在剪貼簿
          setTextCopied(true);
          setTimeout(() => setTextCopied(false), 4000);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return; // 使用者取消
          // NotSupportedError / 其他 → 降級到下載
        }
      }

      if (!nativeShared) {
        // 桌面或 share 不支援：下載圖片
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl; a.download = 'serendipity-book.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objUrl), 1000);

        // 各平台按鈕：開啟平台（新分頁/觸發 app，不離開當前頁）
        if (platformUrls[platform]) {
          window.open(platformUrls[platform], '_blank', 'noopener,noreferrer');
        }

        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch { /* 圖片生成失敗 */ }
    finally { setSharing(false); }
  }, [chosenBook, aiMessage, generateShareCard]);

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
            <Sparkles size={17} />
            <span className="font-bold text-lg tracking-tight">抽一張 SSR 靈魂伴侶 🃏</span>
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
                  onError={e => {
                    const img = e.target as HTMLImageElement;
                    img.onerror = null;
                    img.src = getCoverFallback(displayBook);
                  }}
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

                {/* 分享 */}
                <div className="space-y-2">
                  <p className="text-stone-400 text-[11px] text-center">分享這本命運之書</p>

                  {/* 截圖分享：主要按鈕（含連結）*/}
                  <button
                    onClick={() => handleShare('screenshot')}
                    disabled={sharing}
                    className={`w-full py-2 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-60
                      ${copied ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-400 to-orange-400'}`}
                  >
                    {sharing
                      ? <><Loader2 size={13} className="animate-spin" /> 生成中…</>
                      : copied
                        ? <><Check size={13} /> 已下載並複製連結！</>
                        : <><Camera size={13} /> 截圖分享</>
                    }
                  </button>
                  {/* 行動端：分享後提示文字已在剪貼簿 */}
                  {textCopied && (
                    <p className="text-center text-[11px] text-emerald-600 font-medium animate-pulse">
                      ✅ 分享文字已複製到剪貼簿，貼到 app 即可！
                    </p>
                  )}

                  {/* 文字分享：各平台小按鈕 */}
                  <div className="flex items-center justify-center gap-2">

                    {/* LINE */}
                    <button
                      onClick={() => handleShare('line')}
                      title="分享到 LINE"
                      className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-transform active:scale-90 hover:scale-105"
                      style={{ background: '#06C755' }}
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .344-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0"/>
                      </svg>
                    </button>

                    {/* Facebook */}
                    <button
                      onClick={() => handleShare('facebook')}
                      title="分享到 Facebook"
                      className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-transform active:scale-90 hover:scale-105"
                      style={{ background: '#1877F2' }}
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.027 4.388 11.024 10.125 11.927v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.791-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.281h3.328l-.532 3.49h-2.796v8.437C19.612 23.097 24 18.1 24 12.073z"/>
                      </svg>
                    </button>

                    {/* Threads */}
                    <button
                      onClick={() => handleShare('threads')}
                      title="分享到 Threads"
                      className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-transform active:scale-90 hover:scale-105"
                      style={{ background: '#000' }}
                    >
                      <svg viewBox="0 0 192 192" className="w-5 h-5 fill-white">
                        <path d="M141.537 88.988a66.667 66.667 0 00-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.23c8.248.054 14.474 2.499 18.515 7.264 2.902 3.477 4.846 8.288 5.798 14.393-7.635-1.298-15.876-1.696-24.682-1.19-24.826 1.43-40.797 15.913-39.795 36.03.503 10.17 5.545 18.927 14.206 24.654 7.322 4.879 16.739 7.266 26.548 6.724 12.985-.705 23.199-5.596 30.368-14.54 5.447-6.844 8.895-15.712 10.464-27.073 6.273 3.782 10.928 8.661 13.442 14.542 4.208 9.927 4.448 26.228-8.683 39.361-11.503 11.503-25.319 16.463-46.22 16.615-23.167-.173-40.778-7.5-52.36-21.793C29.748 131.51 24.02 112.627 23.808 88c.212-24.627 5.94-43.51 17.157-56.13C52.52 17.717 70.13 10.39 93.297 10.218c23.343.174 41.13 7.535 52.85 21.887 5.746 7.07 10.028 15.96 12.816 26.48l16.149-4.348c-3.441-12.71-8.878-23.668-16.268-32.788C143.935 5.94 121.744-2.131 93.508 0h-.238C65.08-.132 43.1 7.851 27.85 23.725 14.397 37.773 7.442 57.61 7.208 82.712L7.2 83.2v.8c.003 25.104 6.953 44.966 20.617 59.032C43.099 158.81 65.095 166.972 93.37 167.2h.238c22.738 0 38.71-6.11 51.9-19.298 17.55-17.553 17.026-39.648 11.291-53.161-4.087-9.64-11.826-17.48-15.262-19.753z"/>
                      </svg>
                    </button>
                  </div>
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
            <div className="flex flex-col items-center gap-1">
              <p className="text-stone-400 text-sm animate-pulse">
                {phase === 'slowing' ? '即將揭曉…' : '書海尋緣中…'}
              </p>
              <p className="text-stone-300 text-[11px]">
                AI 正在讀取你的腦波…（其實只是在算數學）
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
