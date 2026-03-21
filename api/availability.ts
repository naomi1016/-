/**
 * Vercel Serverless Function：代理北圖館藏查詢
 *
 * 流程：
 * 1. GET 書目頁取得 HYSESSION cookie + CSRF token
 * 2. POST GraphQL 取得各館在架/借出數
 *
 * 呼叫方式：GET /api/availability?bibId=797660
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GQL_URL  = 'https://book.tpml.edu.tw/api/HyLibWS/graphql';
const BASE_URL = 'https://book.tpml.edu.tw';

const GQL_QUERY = `
query getByMarcId($marcId: Int, $skip: Int, $take: Int, $isPM: Boolean) {
  callVolHoldSummaries: getCallVolHoldSummariesByMarcId(
    marcId: $marcId, skip: $skip, take: $take, isPM: $isPM
  ) {
    items {
      holdNum
      onShelveNum
      checkoutNum
      otherNum
      recentDueDate
      onShelveHolds {
        siteCode
        statusCode
        __typename
      }
      __typename
    }
    __typename
  }
}`;

async function getSession(bibId: string): Promise<{ cookie: string; csrf: string } | null> {
  try {
    const res = await fetch(`${BASE_URL}/bookDetail/${bibId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;

    // 從 Set-Cookie 取 session
    const setCookie = res.headers.get('set-cookie') ?? '';
    const sessionMatch = setCookie.match(/HYSESSION=([^;]+)/);
    const tsMatch      = setCookie.match(/TS[^=]+=([^;]+)/);
    const cookie = [
      sessionMatch ? `HYSESSION=${sessionMatch[1]}` : '',
      tsMatch      ? `TS013f009f=${tsMatch[1]}`      : '',
    ].filter(Boolean).join('; ');

    // 從 HTML 取 CSRF token
    const html  = await res.text();
    const match = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i)
                ?? html.match(/csrf[_-]token["']?\s*[:=]\s*["']([a-f0-9-]{20,})["']/i);
    const csrf  = match?.[1] ?? '';

    return { cookie, csrf };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS：允許來自任何 origin（前端可呼叫）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const bibId = String(req.query.bibId ?? '').trim();
  const marcId = parseInt(bibId, 10);
  if (!bibId || isNaN(marcId)) {
    return res.status(400).json({ error: 'bibId 必填' });
  }

  // 1. 取 session
  const session = await getSession(bibId);
  if (!session) {
    return res.status(502).json({ error: '無法取得 library session' });
  }

  // 2. 呼叫 GraphQL
  try {
    const gqlRes = await fetch(GQL_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer':      `${BASE_URL}/bookDetail/${bibId}`,
        'Origin':        BASE_URL,
        'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Cookie':        session.cookie,
        ...(session.csrf ? { 'x-csrf-token': session.csrf } : {}),
      },
      body: JSON.stringify({
        operationName: 'getByMarcId',
        variables:     { marcId, skip: 0, take: 200, isPM: false },
        query:          GQL_QUERY,
      }),
    });

    if (!gqlRes.ok) {
      return res.status(502).json({ error: `GraphQL ${gqlRes.status}` });
    }

    const data = await gqlRes.json();
    const item = data?.data?.callVolHoldSummaries?.items?.[0];
    if (!item) {
      return res.status(404).json({ error: '查無館藏資料' });
    }

    // 整理成前端好用的格式
    const branchCount: Record<string, number> = {};
    for (const h of item.onShelveHolds ?? []) {
      if (h.siteCode) {
        branchCount[h.siteCode] = (branchCount[h.siteCode] ?? 0) + 1;
      }
    }

    return res.status(200).json({
      total:         item.holdNum      ?? 0,
      onShelf:       item.onShelveNum  ?? 0,
      checkedOut:    item.checkoutNum  ?? 0,
      other:         item.otherNum     ?? 0,
      recentDueDate: item.recentDueDate ?? '',
      branches:      branchCount, // { "A14": 1, "H15": 2, ... }
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
