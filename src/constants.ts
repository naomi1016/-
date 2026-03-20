export const BRANCH_MAP: Record<string, string> = {
  // ── 主要分館 ──
  C01: '總館',       E11: '王貫英分館', L13: '石牌分館',
  K12: '天母分館',   A13: '三民分館',   H15: '文山分館',
  J13: '西湖分館',   D13: '大直分館',   B14: '廣慈分館',
  H16: '力行分館',   I11: '南港分館',   A12: '民生分館',
  F13: '建成分館',   B11: '永春分館',   G14: '萬華分館',
  L14: '清江分館',   K14: '李科永紀念館', D12: '長安分館',
  H11: '景美分館',   J11: '內湖分館',   J12: '東湖分館',
  H17: '景新分館',   I12: '舊莊分館',   F12: '大同分館',
  B12: '三興分館',   F11: '延平分館',   L11: '北投分館',
  K11: '葫蘆堵分館', H12: '木柵分館',   E12: '城中分館',
  L12: '稻香分館',   G13: '西園分館',   C11: '道藩分館',
  D11: '中山分館',   J14: '西中分館',   A14: '中崙分館',
  B13: '六合分館',   L15: '吉利分館',   H14: '萬興分館',
  F21: '蘭州分館',   C22: '成功分館',   G11: '龍山分館',
  I21: '龍華分館',   C23: '龍安分館',   A15: '啟明分館',
  H23: '萬芳分館',   D21: '恒安分館',   G12: '東園分館',
  C21: '延吉分館',   L23: '秀山分館',   L21: '永明分館',
  H22: '安康分館',   C02: '總館參考室',
  // ── 智慧圖書館 ──
  EOB2: '古亭智慧圖書館', GOB: '太陽圖書館',    COB: '東區地下街智慧圖書館',
  KOB2: '社子島智慧圖書館', KOB: '百齡智慧圖書館', AOB: '松山機場智慧圖書館',
  EOB:  '西門智慧圖書館',
  // ── 借書站 ──
  DFB: '行天宮站借書站', BFB: '臺北市政府借書站', EFB2: '小南門站借書站',
  CFB: '信義安和借書站', AFB: '松山車站借書站',   IFB: '南港車站借書站',
  EFB: '臺北車站借書站', AFB2: '小巨蛋借書站',   ABS: '總館借書站',
  // ── 其他 ──
  G21: '柳鄉兒童圖書館', MIC: '多元文化中心',
  I41: '龍華書閣',       D41: '大直書閣',       L41: '秀山書閣',
  K41: '葫蘆堵書閣',     I22: '親子美育數位館',
  NRRC: '北區資源中心',  H31: '公訓處',
};

export const LANGUAGE_LABELS: Record<string, string> = {
  CHI: '中文', ENG: '英語', KOR: '韓語', JPN: '日語',
  FRE: '法語', HIN: '印地語',
};

export const CATEGORIES = [
  { id: 'all',   name: '全部',           prefix: null },
  { id: '0',     name: '000 總類',       prefix: '0'  },
  { id: '1',     name: '100 哲學類',     prefix: '1'  },
  { id: '2',     name: '200 宗教類',     prefix: '2'  },
  { id: '3',     name: '300 自然科學類', prefix: '3'  },
  { id: '4',     name: '400 應用科學類', prefix: '4'  },
  { id: '5',     name: '500 社會科學類', prefix: '5'  },
  { id: '6',     name: '600 史地類 (中)',prefix: '6'  },
  { id: '7',     name: '700 史地類 (世)',prefix: '7'  },
  { id: '8',     name: '800 文學類',     prefix: '8'  },
  { id: '9',     name: '900 藝術類',     prefix: '9'  },
  { id: 'child', name: '兒童書',         prefix: 'C'  },
];

export const PAGE_SIZE = 60;

export const COLOR_PALETTE = [
  { id: 'red',     name: '紅',   rgb: [220,  50,  50] as [number,number,number] },
  { id: 'orange',  name: '橙',   rgb: [230, 120,  40] as [number,number,number] },
  { id: 'yellow',  name: '黃',   rgb: [220, 190,  50] as [number,number,number] },
  { id: 'green',   name: '綠',   rgb: [ 60, 170,  80] as [number,number,number] },
  { id: 'teal',    name: '青',   rgb: [ 40, 170, 160] as [number,number,number] },
  { id: 'blue',    name: '藍',   rgb: [ 60, 130, 220] as [number,number,number] },
  { id: 'navy',    name: '深藍', rgb: [ 30,  60, 140] as [number,number,number] },
  { id: 'purple',  name: '紫',   rgb: [140,  80, 210] as [number,number,number] },
  { id: 'pink',    name: '粉',   rgb: [230, 110, 170] as [number,number,number] },
  { id: 'brown',   name: '棕',   rgb: [140,  85,  45] as [number,number,number] },
  { id: 'cream',   name: '米白', rgb: [240, 230, 210] as [number,number,number] },
  { id: 'gray',    name: '灰',   rgb: [150, 155, 160] as [number,number,number] },
  { id: 'black',   name: '黑',   rgb: [ 40,  40,  45] as [number,number,number] },
] as const;

// 顏色 → 語義搜尋標籤映射（點擊色系時同步出現於 AI 猜你想找）
export const COLOR_SEMANTIC_TAGS: Record<string, string[]> = {
  'red':    ['熱血激情', '勇氣挑戰', '愛情故事', '革命精神'],
  'orange': ['創意能量', '積極樂觀', '成功動力', '活力人生'],
  'yellow': ['幸福時光', '陽光心態', '兒童成長', '知識啟蒙'],
  'green':  ['自然生態', '心靈成長', '健康生活', '永續未來'],
  'teal':   ['冷靜沉著', '療癒身心', '平靜冥想', '藍綠清新'],
  'blue':   ['理性思考', '海洋探索', '科技未來', '憂鬱療癒'],
  'navy':   ['深度知識', '歷史文化', '領導管理', '沉穩智慧'],
  'purple': ['神秘哲學', '藝術創作', '靈性探索', '夢想追求'],
  'pink':   ['溫柔關懷', '女性力量', '親子關係', '浪漫情懷'],
  'brown':  ['大地情懷', '歷史人文', '咖啡文化', '沉穩踏實'],
  'cream':  ['純粹生活', '簡約美學', '文學經典', '生活哲學'],
  'gray':   ['都市生活', '理性分析', '現代文學', '職場觀察'],
  'black':  ['深邃智慧', '黑色幽默', '心理探索', '暗黑美學'],
};
