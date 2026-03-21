import { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
        const genAI = new GoogleGenerativeAI(API_KEY);
        // gemini-2.5-flash + thinkingBudget:0：關閉思考模式，速度與 2.0-flash 相近但免費額度更高
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { thinkingConfig: { thinkingBudget: 0 } } as never,
        });

        const bookList = topBooks
          .slice(0, 5)
          .map((b, i) => {
            const desc = b.description ? `（${b.description.slice(0, 40)}…）` : '';
            return `${i + 1}. 《${b.title}》 ${b.author ? `/ ${b.author}` : ''} ${desc}`;
          })
          .join('\n');

        const prompt =
          `使用者搜尋：「${q}」（這是使用者描述自身情境或需求的句子，請從情感/需求面理解，不要從字面解讀詞語）\n\n` +
          `以下是搜尋到的書籍（前5本）：\n${bookList}\n\n` +
          `請用一句話（35字以內）說明這些書為何能回應使用者的需求或情緒，` +
          `語氣自然親切，不要列舉書名，以「這幾本書」開頭。`;

        // 串流輸出：文字逐字出現，體感更快
        const stream = await model.generateContentStream(prompt);
        let full = '';
        for await (const chunk of stream.stream) {
          if (abortRef.current) return;
          full += chunk.text();
          setReason(full);
        }
        reasonCache.set(q, full);
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
