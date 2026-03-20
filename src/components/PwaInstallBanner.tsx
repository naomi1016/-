import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const install = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-white/95 backdrop-blur-xl border border-emerald-200 rounded-2xl shadow-2xl shadow-emerald-500/20 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0 shadow shadow-emerald-400/40">
          <Download size={18} className="text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-stone-800">加入主畫面</p>
          <p className="text-xs text-stone-500 truncate">離線也能瀏覽書目</p>
        </div>
        <button
          onClick={install}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold
                     bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                     shadow shadow-emerald-400/40 hover:shadow-md transition-all"
        >
          安裝
        </button>
        <button onClick={() => setDismissed(true)} className="text-stone-300 hover:text-stone-500 transition-colors">
          <X size={16}/>
        </button>
      </div>
    </div>
  );
}
