import { useState, useEffect, useCallback, useRef } from 'react';
import { BOOKS_URL } from './useBooks';

// 兩次檢查之間至少間隔 5 分鐘，避免切換前景時頻繁打 API
const MIN_INTERVAL = 5 * 60 * 1000;

/**
 * 偵測伺服器上的書目是否比目前這份新。
 *
 * 用 HEAD 請求比對 ETag —— 只拿標頭、不下載 92MB 的內容，
 * 因此可以安心在每次回到前景時檢查。
 *
 * @param loadedEtag 目前顯示中的書目版本（來自 useBooks）
 * @param reload     套用更新時呼叫，需清快取並重新載入
 */
export function useDataUpdate(
  loadedEtag: string | null,
  reload: (force?: boolean) => Promise<void>,
) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [applying, setApplying]   = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (!loadedEtag) return;                       // 還沒載入完，無從比對
    const now = Date.now();
    if (now - lastCheck.current < MIN_INTERVAL) return;
    lastCheck.current = now;

    try {
      // Workbox 的 runtimeCaching 只攔 GET，HEAD 會直接走網路拿到最新標頭
      const res = await fetch(BOOKS_URL, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) return;
      const remoteEtag = res.headers.get('etag');
      if (remoteEtag && remoteEtag !== loadedEtag) {
        const len = res.headers.get('content-length');
        setSizeBytes(len ? Number(len) : null);
        setHasUpdate(true);
        setDismissed(false);                       // 有新版本就重新提示
      }
    } catch {
      // 離線或請求失敗：靜默略過，不打擾使用者
    }
  }, [loadedEtag]);

  // 載入完成後檢查一次
  useEffect(() => { void check(); }, [check]);

  // PWA 從背景回到前景時再檢查（手機常見情境：App 沒有重新掛載）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      await reload(true);                          // 清 SW 快取後重新抓
      setHasUpdate(false);
    } finally {
      setApplying(false);
    }
  }, [reload]);

  return {
    visible: hasUpdate && !dismissed,
    sizeBytes,
    applying,
    apply,
    dismiss: () => setDismissed(true),
  };
}
