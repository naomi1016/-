import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { Book } from '../types';

// Vite 在 build 時將 process.env.GEMINI_API_KEY 替換為實際字串值
const API_KEY = process.env.GEMINI_API_KEY || '';

// 每個 query 的結果快取（避免重複呼叫）
const reasonCache = new Map<string, string>();

export function useSearchReason(query: string, topBooks: Book[]) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<boolean>(false);

  useEffect(() => {
    const q = query.trim();
    if (!q || topBooks.length === 0 || !API_KEY) {
      setReason('');
      return;
    }

    // 快取命中
    if (reasonCache.has(q)) {
      setReason(reasonCache.get(q)!);
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setReason('');

    (async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        const bookList = topBooks
          .slice(0, 5)
          .map((b, i) => {
            const desc = b.description ? `（${b.description.slice(0, 40)}…）` : '';
            return `${i + 1}. 《${b.title}》 ${b.author ? `/ ${b.author}` : ''} ${desc}`;
          })
          .join('\n');

        const prompt =
          `使用者搜尋：「${q}」\n\n` +
          `以下是搜尋到的書籍（前5本）：\n${bookList}\n\n` +
          `請用一句話（35字以內）說明這些書為何符合使用者的搜尋意圖，` +
          `語氣自然親切，不要列舉書名，以「這幾本書」開頭。`;

        const resp = await ai.models.generateContent({
          model:    'gemini-2.0-flash',
          contents: prompt,
        });

        if (abortRef.current) return;

        const text = resp.text?.trim() ?? '';
        reasonCache.set(q, text);
        setReason(text);
      } catch {
        // 靜默失敗：API key 無效或網路問題時不顯示任何內容
      } finally {
        if (!abortRef.current) setLoading(false);
      }
    })();

    return () => { abortRef.current = true; };
  }, [query, topBooks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return { reason, loading };
}
