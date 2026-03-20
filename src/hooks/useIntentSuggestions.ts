import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

const API_KEY = process.env.GEMINI_API_KEY || '';
const cache = new Map<string, string[]>();

// ── 本地意圖字庫（Gemini 配額用完時的兜底） ──────────────
const INTENT_BANK: [string, string[]][] = [
  ['發',   ['發大財', '發現自我', '發揮潛力', '發展事業']],
  ['我想', ['我想改變自己', '我想發財致富', '我想學習新技能', '我想找到人生方向']],
  ['心情', ['心情不好', '心情低落', '心情焦慮', '心情管理']],
  ['職場', ['職場壓力', '職場溝通', '職場人際', '職場領導力']],
  ['親子', ['親子關係', '親子溝通', '親子教育', '親子共讀']],
  ['學習', ['學習效率', '學習動力', '學習方法', '自學技巧']],
  ['投資', ['投資理財', '投資股票', '投資入門', '投資策略']],
  ['健康', ['健康飲食', '心理健康', '健康生活', '健康管理']],
  ['愛情', ['愛情關係', '愛情挫折', '走出分手', '愛的技巧']],
  ['成功', ['成功習慣', '成功心態', '成功秘訣', '高效能人士']],
  ['壓力', ['壓力管理', '壓力釋放', '職場壓力', '放鬆身心']],
  ['人際', ['人際關係', '人際溝通', '人際技巧', '社交障礙']],
  ['自我', ['自我成長', '自我認識', '自我管理', '自我療癒']],
  ['創業', ['創業心態', '創業故事', '創業失敗', '斜槓副業']],
  ['孤獨', ['孤獨感', '孤獨與自我', '走出孤獨', '獨處的力量']],
  ['焦慮', ['焦慮管理', '克服焦慮', '焦慮與壓力', '放鬆技巧']],
  ['憂鬱', ['走出憂鬱', '憂鬱療癒', '情緒低潮', '心理重建']],
  ['時間', ['時間管理', '時間效率', '高效規劃', '減少拖延']],
  ['溝通', ['溝通技巧', '溝通障礙', '職場溝通', '家庭溝通']],
  ['理財', ['理財入門', '理財觀念', '個人財務', '存錢方法']],
  ['歷史', ['台灣歷史', '世界歷史', '歷史人物', '近代史']],
  ['哲學', ['人生哲學', '生活哲學', '哲學入門', '東方哲學']],
  ['科技', ['科技未來', '人工智慧', '數位轉型', '科技趨勢']],
  ['領導', ['領導力', '團隊領導', '自我領導', '主管管理']],
  ['習慣', ['好習慣養成', '改變習慣', '高效習慣', '晨間習慣']],
  ['幸福', ['幸福感', '追求幸福', '幸福人生', '快樂秘訣']],
  ['失敗', ['從失敗學習', '克服失敗', '失敗重生', '韌性培養']],
  ['夢想', ['追求夢想', '夢想實現', '夢想與現實', '人生目標']],
  ['家庭', ['家庭關係', '家庭教育', '親子家庭', '婚姻關係']],
  ['讀書', ['讀書方法', '閱讀習慣', '讀書效率', '閱讀推薦']],
  ['金錢', ['金錢觀念', '理財規劃', '財富自由', '省錢技巧']],
  ['工作', ['工作效率', '工作意義', '換工作', '工作與生活平衡']],
  ['睡眠', ['睡眠品質', '失眠改善', '睡眠科學', '好好睡覺']],
  ['飲食', ['健康飲食', '飲食習慣', '減重飲食', '飲食心理']],
  ['運動', ['運動習慣', '運動心理', '跑步', '健身入門']],
];

function localSuggest(input: string): string[] {
  const q = input.trim();
  if (!q) return [];
  const seen = new Set<string>();
  const results: string[] = [];
  for (const [key, suggestions] of INTENT_BANK) {
    if (key.includes(q) || q.includes(key) || suggestions.some(s => s.includes(q))) {
      for (const s of suggestions) {
        if (!seen.has(s)) { seen.add(s); results.push(s); }
      }
    }
  }
  return results.slice(0, 4);
}

export function useIntentSuggestions(input: string) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = input.trim();
    if (!q) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // 快取命中
    if (cache.has(q)) {
      setSuggestions(cache.get(q)!);
      setLoading(false);
      return;
    }

    // 無 API key → 直接用本地字庫
    if (!API_KEY) {
      setSuggestions(localSuggest(q));
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const prompt =
          `使用者正在輸入圖書搜尋關鍵字：「${q}」\n` +
          `請根據這個輸入，預測 4 個使用者可能想搜尋的完整意圖短句（繁體中文，10 字以內）。\n` +
          `這些短句應貼近讀者的真實閱讀需求，例如情緒、目標、人際、職場等情境。\n` +
          `只回傳 4 個短句，每行一個，不加編號、標點或任何說明。`;

        const resp = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: prompt,
        });

        if (cancelled) return;

        const items = (resp.text ?? '')
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .slice(0, 4);

        // Gemini 成功但回傳空 → 落回本地字庫
        const final = items.length > 0 ? items : localSuggest(q);
        cache.set(q, final);
        setSuggestions(final);
      } catch {
        // Gemini 失敗（配額用完等）→ 落回本地字庫
        if (!cancelled) {
          const local = localSuggest(q);
          cache.set(q, local);
          setSuggestions(local);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input]);

  return { suggestions, loading };
}
