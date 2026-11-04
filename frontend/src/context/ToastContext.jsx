import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const STYLES = {
  success: ['bg-acacia-50 border-acacia-600/30 text-acacia-700', CheckCircle2],
  error: ['bg-rose-50 border-rose-600/30 text-rose-700', XCircle],
  info: ['bg-jacaranda-50 border-jacaranda-600/30 text-jacaranda-700', Info],
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (type, message) => {
      const id = crypto.randomUUID();
      setToasts((t) => [...t.slice(-3), { id, type, message }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const toast = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map(({ id, type, message }) => {
          const [cls, Icon] = STYLES[type];
          return (
            <div key={id} role={type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${cls}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{message}</span>
              <button onClick={() => dismiss(id)} aria-label="Dismiss message" className="opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
