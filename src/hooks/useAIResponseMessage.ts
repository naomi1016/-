import { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Book } from '../types';

const API_KEY = process.env.GEMINI_API_KEY || '';
const cache = new Map<string, string>();

export function useAIResponseMessage(query: string, resultCount: number, topBooks: Book[] = []) {
  const [aiMessage, setAiMessage] = useState('');
  const abortRef = useRef(false);

  useEffect(() => {
    const q = query.trim();
    setAiMessage('');

    if (!q || resultCount === 0 || !API_KEY) return;

    const cacheKey = `${q}::${topBooks.slice(0, 3).map(b => b.bibId).join(',')}`;

    if (cache.has(cacheKey)) {
      setAiMessage(cache.get(cacheKey)!);
      return;
    }

    abortRef.current = false;

    (async () => {
      try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const top3 = topBooks.slice(0, 3);
        const bookHint = top3.length > 0
          ? `\n以下是搜尋結果中相關度最高的書（只能從這裡選）：\n${top3.map((b, i) => `${i + 1}.《${b.title}》`).join('\n')}`
          : '';

        const prompt =
          `使用者在圖書館 App 搜尋：「${q}」，共找到 ${resultCount} 本相關書籍。${bookHint}\n\n` +
          `請用 2 句話，像朋友一樣個人化地回應：\n` +
          `第一句：呼應搜尋關鍵字，表達理解（不列書名）。\n` +
          `第二句：從上方書單中選一本，給出行動引導，例如「建議先從《xxx》開始」。\n` +
          `嚴格限制：只能推薦上方書單內的書，不得自行編造書名。\n` +
          `要求：語氣活潑真誠、繁體中文、全文 50 字以內、不加標題或編號。`;

        const result = await model.generateContent(prompt);
        if (abortRef.current) return;

        const text = result.response.text().trim();
        if (text) {
          cache.set(cacheKey, text);
          setAiMessage(text);
        }
      } catch (err) {
        console.error('[useAIResponseMessage] Gemini error:', err);
      }
    })();

    return () => { abortRef.current = true; };
  }, [query, resultCount, topBooks]);

  return aiMessage;
}
