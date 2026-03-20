import { useState, useEffect, useRef, useMemo } from 'react';
import type { Book } from '../types';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

// ── 模組層級單例快取 ─────────────────────────────────────────────
let _embeddingsPromise: Promise<Map<string, Float32Array>> | null = null;
let _pipelinePromise: Promise<unknown> | null = null;

function getEmbeddings(): Promise<Map<string, Float32Array>> {
  if (!_embeddingsPromise) {
    _embeddingsPromise = fetch('/neural_embeddings.json')
      .then(r => {
        if (!r.ok) throw new Error('neural_embeddings.json 不存在');
        return r.json();
      })
      .then((data: { books: { bibId: string; vec: number[] }[] }) => {
        const map = new Map<string, Float32Array>();
        for (const { bibId, vec } of data.books) {
          map.set(bibId, new Float32Array(vec));
        }
        return map;
      });
  }
  return _embeddingsPromise;
}

function getPipeline(): Promise<unknown> {
  if (!_pipelinePromise) {
    _pipelinePromise = import('@xenova/transformers').then(({ pipeline }) =>
      pipeline('feature-extraction', MODEL),
    );
  }
  return _pipelinePromise;
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function buildSuggestions(topBooks: Book[], q: string): string[] {
  const confident = topBooks.filter(b => (b._score ?? 0) > 0.6);
  if (confident.length < 3) return [];

  const seen = new Set([q]);
  const suggs: string[] = [];

  const authorCount: Record<string, number> = {};
  for (const book of confident.slice(0, 15)) {
    const name = (book.author ?? '').split(/[,，/、（(]/)[0].trim();
    if (name.length >= 2 && name.length <= 10)
      authorCount[name] = (authorCount[name] ?? 0) + 1;
  }
  Object.entries(authorCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .forEach(([name]) => { if (!seen.has(name)) { suggs.push(name); seen.add(name); } });

  return suggs.slice(0, 5);
}

// ── Hook ──────────────────────────────────────────────────────────
export function useNeuralSearch(books: Book[], query: string) {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle');
  const [neuralScores, setNeuralScores] = useState<Map<string, number>>(new Map());
  const statusRef = useRef<ModelStatus>('idle');

  const setStatus = (s: ModelStatus) => { statusRef.current = s; setModelStatus(s); };

  // 啟動時預載 embeddings JSON（背景靜默）
  useEffect(() => { getEmbeddings().catch(() => {}); }, []);

  // query 變更時，延遲觸發神經搜尋
  useEffect(() => {
    const q = query.trim();
    if (!q) { setNeuralScores(new Map()); return; }

    let cancelled = false;

    const timer = setTimeout(async () => {
      if (statusRef.current === 'idle') setStatus('loading');
      try {
        const [pipe, embedMap] = await Promise.all([getPipeline(), getEmbeddings()]);
        if (cancelled) return;
        if (statusRef.current !== 'ready') setStatus('ready');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const output = await (pipe as any)(q, { pooling: 'mean', normalize: true });
        if (cancelled) return;

        const queryVec = new Float32Array(output.data as number[]);
        const scores = new Map<string, number>();
        for (const [bibId, bookVec] of embedMap as Map<string, Float32Array>) {
          scores.set(bibId, dotProduct(queryVec, bookVec));
        }
        setNeuralScores(scores);
      } catch (e) {
        if (!cancelled) { setStatus('error'); console.error('[useNeuralSearch]', e); }
      }
    }, 400);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const q = query.trim();

    // 沒有查詢 → 不接管，讓正常瀏覽模式運作
    if (!q) return { scoredBooks: null as Book[] | null, suggestions: [] as string[], modelStatus };

    // 神經搜尋就緒 → 回傳語義排序結果
    if (neuralScores.size > 0) {
      const THRESHOLD = 0.10;
      const scored = books
        .filter(b => b.bibId && (neuralScores.get(b.bibId) ?? 0) > THRESHOLD)
        .map(b => ({ ...b, _score: neuralScores.get(b.bibId)! }))
        .sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

      return { scoredBooks: scored, suggestions: buildSuggestions(scored, q), modelStatus };
    }

    // 模型載入中 → 回傳 null，讓 useFilteredBooks 的文字搜尋接管
    // （不用 Fuse.js：中文字符級模糊比對品質差，會混入不相關結果）
    return { scoredBooks: null, suggestions: [], modelStatus };
  }, [books, query, modelStatus, neuralScores]);
}
