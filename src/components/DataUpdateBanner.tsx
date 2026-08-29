import { RefreshCw, X, Sparkles } from 'lucide-react';

interface Props {
  visible: boolean;
  sizeBytes: number | null;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `約 ${Math.round(mb)}MB` : `約 ${Math.round(bytes / 1024)}KB`;
}

export default function DataUpdateBanner({
  visible, sizeBytes, applying, onApply, onDismiss,
}: Props) {
  if (!visible) return null;

  const size = formatSize(sizeBytes);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-white/95 backdrop-blur-xl border border-emerald-200 rounded-2xl shadow-2xl shadow-emerald-500/20 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0 shadow shadow-emerald-400/40">
          <Sparkles size={18} className="text-white"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-stone-800">有新書目可更新</p>
          <p className="text-xs text-stone-500 truncate">
            {applying
              ? '更新中，請稍候…'
              : size ? `${size}，建議使用 Wi-Fi` : '點右側立即更新'}
          </p>
        </div>
        <button
          onClick={onApply}
          disabled={applying}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold
                     bg-gradient-to-r from-emerald-500 to-teal-500 text-white
                     shadow shadow-emerald-400/40 hover:shadow-md transition-all
                     disabled:opacity-60 disabled:cursor-not-allowed
                     flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={applying ? 'animate-spin' : undefined}/>
          {applying ? '更新中' : '更新'}
        </button>
        <button
          onClick={onDismiss}
          disabled={applying}
          aria-label="稍後再說"
          className="text-stone-300 hover:text-stone-500 transition-colors disabled:opacity-40"
        >
          <X size={16}/>
        </button>
      </div>
    </div>
  );
}
