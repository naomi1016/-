export interface Book {
  id?: number;
  title: string;
  author: string;
  callNumber: string;
  isbn?: string;
  publisher?: string;
  publishYear?: number;
  publishDate?: string;
  description?: string;
  authorDesc?: string;
  coverUrl?: string;
  bibId?: string;
  language?: string;     // 'CHI' | 'ENG' | 'KOR' | 'JPN' | 'FRE' | ''
  materialType?: string; // '圖書' | '視聽資料' | '期刊' | '其他'
  branch?: string;       // primary branch code
  branches?: string[];   // all branch codes
  month?: string;        // "2026-03"
  coverColor?: [number, number, number]; // 封面主色 [r, g, b]
  _score?: number;       // 搜尋相似度分數（0–1）
  _matchedFields?: string[]; // 命中欄位（書名、作者…）
}
