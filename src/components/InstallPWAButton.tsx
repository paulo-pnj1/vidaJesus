import { useEffect, useState } from 'react';
import { Download, Share, X, PlusSquare } from 'lucide-react';

// Evento disparado pelo Chrome/Edge/Android quando a app pode ser instalada.
// Não existe tipagem oficial no lib.dom, por isso declaramos o mínimo necessário.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error: propriedade específica do Safari/iOS
    window.navigator.standalone === true
  );
}

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  // No iOS/Safari não existe beforeinstallprompt: mostramos sempre o botão
  // (se ainda não estiver instalado) e explicamos o passo manual "Partilhar > Adicionar ao Ecrã Principal".
  const canShowButton = isIos() || deferredPrompt;
  if (!canShowButton) return null;

  const handleClick = async () => {
    if (isIos()) {
      setShowIosHelp(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <>
      <button
        id="install-pwa-btn"
        onClick={handleClick}
        className="group inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-full shadow-lg shadow-amber-500/20 transition-all duration-300 hover:scale-105"
      >
        <Download className="w-3.5 h-3.5" />
        Instalar App
      </button>

      {showIosHelp && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-900 border border-slate-700/60 rounded-3xl p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-black text-display text-white uppercase tracking-wide">
                Instalar no iPhone/iPad
              </h3>
              <button
                onClick={() => setShowIosHelp(false)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-4 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">1</span>
                <span className="flex items-center gap-1.5">
                  Toque no ícone de <Share className="w-4 h-4 text-blue-400 inline" /> <strong>Partilhar</strong> na barra do Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">2</span>
                <span className="flex items-center gap-1.5">
                  Escolha <strong>"Adicionar ao Ecrã Principal"</strong> <PlusSquare className="w-4 h-4 text-slate-400 inline" />.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center">3</span>
                <span>Toque em <strong>"Adicionar"</strong> no canto superior direito. Pronto!</span>
              </li>
            </ol>

            <p className="text-xs text-slate-500 italic">
              Nota: este passo só funciona no navegador Safari, não no Chrome do iPhone.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
