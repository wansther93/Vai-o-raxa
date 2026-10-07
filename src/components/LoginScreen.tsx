import React, { useState } from 'react';
import { 
  AlertCircle, 
  Copy, 
  Check, 
  ExternalLink 
} from 'lucide-react';
import { loginWithGoogle } from '../lib/firebase';
import { copyToClipboard } from '../lib/clipboard';

interface LoginScreenProps {}

interface BackgroundOption {
  id: string;
  title: string;
  url: string;
}

const AVAILABLE_BACKGROUNDS: BackgroundOption[] = [
  {
    id: 'aot',
    title: 'Attack on Titan',
    url: '/backgrounds/bg_aot_916.webp',
  },
  {
    id: 'sololeveling',
    title: 'Solo Leveling',
    url: '/backgrounds/bg_sololeveling_916.webp',
  },
  {
    id: 'overlord',
    title: 'Overlord',
    url: '/backgrounds/bg_overlord_916.webp',
  },
  {
    id: 'shangrila',
    title: 'Shangri-La Frontier',
    url: '/backgrounds/bg_shangrila_916.webp',
  },
  {
    id: 'rezero',
    title: 'Re:ZERO',
    url: '/backgrounds/bg_rezero_916.webp',
  },
  {
    id: 'mushokutensei',
    title: 'Mushoku Tensei',
    url: '/backgrounds/bg_mushokutensei_916.webp',
  },
  {
    id: 'opm',
    title: 'One-Punch Man',
    url: '/backgrounds/bg_opm_916.webp',
  },
  {
    id: 'mobpsycho',
    title: 'Mob Psycho 100',
    url: '/backgrounds/bg_mobpsycho_916.webp',
  },
  {
    id: 'sxf',
    title: 'Spy x Family',
    url: '/backgrounds/bg_sxf_916.webp',
  },
  {
    id: 'sailor_moon',
    title: 'Sailor Moon',
    url: '/backgrounds/bg_sailor_916.webp',
  },
  {
    id: 'another',
    title: 'Another',
    url: '/backgrounds/bg_another_916.webp',
  },
  {
    id: 'black_clover',
    title: 'Black Clover',
    url: '/backgrounds/bg_bclover_916.webp',
  },
  {
    id: 'berserk',
    title: 'Berserk',
    url: '/backgrounds/bg_berserk_916.webp',
  },
  {
    id: 'mha',
    title: 'My Hero Academia',
    url: '/backgrounds/bg_mha_916.webp',
  },
  {
    id: 'death_note',
    title: 'Death Note',
    url: '/backgrounds/bg_dn_916.webp',
  },
  {
    id: 'jujutsu',
    title: 'Jujutsu Kaisen',
    url: '/backgrounds/bg_jujutsu_916.webp',
  },
  {
    id: 'demon_slayer',
    title: 'Demon Slayer',
    url: '/backgrounds/bg_demonslayer_916.webp',
  },
  {
    id: 'konosuba',
    title: 'Konosuba',
    url: '/backgrounds/bg_konosuba_916_1791055490732.webp',
  },
  {
    id: 'frieren',
    title: 'Frieren',
    url: '/backgrounds/bg_frieren_v2_1791052988041.webp',
  },
  {
    id: 'one_piece',
    title: 'One Piece',
    url: '/backgrounds/bg_op_goingmerry_1791051664914.webp',
  },
  {
    id: 'tensura',
    title: 'Rimuru',
    url: '/backgrounds/bg_slime_v2_1791015470709.webp',
  },
];

const RECENT_BGS_KEY = 'wanime_recent_backgrounds_v1';
const MAX_RECENT_HISTORY = 14;

function selectRandomBackground(): BackgroundOption {
  if (typeof window === 'undefined') {
    return AVAILABLE_BACKGROUNDS[0];
  }

  let recentIds: string[] = [];
  try {
    const stored = localStorage.getItem(RECENT_BGS_KEY);
    if (stored) {
      recentIds = JSON.parse(stored);
      if (!Array.isArray(recentIds)) recentIds = [];
    }
  } catch {
    recentIds = [];
  }

  // Filter out recent ones
  let eligible = AVAILABLE_BACKGROUNDS.filter(bg => !recentIds.includes(bg.id));

  // If pool is exhausted or too small, trim history to recycle older ones
  if (eligible.length === 0) {
    recentIds = recentIds.slice(-4);
    eligible = AVAILABLE_BACKGROUNDS.filter(bg => !recentIds.includes(bg.id));
  }

  if (eligible.length === 0) {
    eligible = AVAILABLE_BACKGROUNDS;
  }

  // Pick one at random
  const chosenIndex = Math.floor(Math.random() * eligible.length);
  const chosen = eligible[chosenIndex];

  // Save new choice in history
  try {
    const updatedHistory = [...recentIds.filter(id => id !== chosen.id), chosen.id].slice(-MAX_RECENT_HISTORY);
    localStorage.setItem(RECENT_BGS_KEY, JSON.stringify(updatedHistory));
  } catch {
    // Ignore storage issues
  }

  return chosen;
}

export const LoginScreen: React.FC<LoginScreenProps> = () => {
  const [currentBg] = useState<BackgroundOption>(() => selectRandomBackground());
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  const parseAuthError = (err: any): string => {
    const code = err?.code || '';
    const message = err?.message || '';

    if (code === 'auth/unauthorized-domain' || message.includes('unauthorized-domain')) {
      setIsUnauthorizedDomain(true);
      return `O domínio atual (${currentHostname}) precisa ser adicionado à lista de domínios autorizados no Firebase Console (Authentication > Configurações > Domínios autorizados).`;
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'A janela de login com o Google foi fechada antes de concluir.';
    }
    if (code === 'auth/popup-blocked') {
      return 'O navegador bloqueou a janela pop-up do Google. Por favor, permita pop-ups para este site ou abra o app em uma nova aba.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Falha na conexão do pop-up de login. Caso esteja em visualização incorporada (iframe), clique no botão abaixo para abrir em uma nova aba!';
    }
    return message || 'Não foi possível concluir o login com o Google. Tente novamente.';
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    setIsUnauthorizedDomain(false);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Erro ao fazer login com o Google:', err);
      setErrorMsg(parseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDomain = async () => {
    if (!currentHostname) return;
    const ok = await copyToClipboard(currentHostname);
    if (ok) {
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 3000);
    }
  };

  const handleOpenInNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between items-center p-4 sm:p-6 bg-black overflow-hidden select-none">
      {/* Dynamic Background Image: Native 9:16 Full Cover on Mobile, Centered Crisp Pillar on Desktop with Black Sides */}
      <div className="absolute inset-0 bg-black flex justify-center items-center overflow-hidden pointer-events-none select-none">
        <div className="relative h-full w-full sm:max-w-[56.25vh] flex justify-center items-center overflow-hidden">
          <img
            key={currentBg.id}
            src={currentBg.url}
            alt={currentBg.title}
            className="w-full h-full object-cover object-center transition-all duration-700 ease-out"
          />

          {/* Seamless Edge Feathering on Desktop: Smoothly blends the image sides into the pure black screen */}
          <div className="hidden sm:block absolute inset-y-0 left-0 w-8 md:w-16 bg-gradient-to-r from-black to-transparent pointer-events-none" />
          <div className="hidden sm:block absolute inset-y-0 right-0 w-8 md:w-16 bg-gradient-to-l from-black to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Balanced Atmospheric Shading Overlays: Soft vignette & gradient keeping art visible while balancing vibrancy */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/60 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90 pointer-events-none" />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/25 to-black/80 pointer-events-none" />

      {/* Subtle Top Red Accent Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-sm h-48 bg-red-600/10 blur-[90px] pointer-events-none rounded-full" />

      {/* Top Header Spacer (Balanced Flex-between spacing) */}
      <header className="relative z-10 w-full h-4 sm:h-6 pointer-events-none" />

      {/* Main Content Area - Compact, Integrated, Free-Floating (No Heavy Box Modal) */}
      <main className="relative z-10 w-full max-w-[270px] sm:max-w-[290px] my-auto flex flex-col items-center text-center px-1">
        {/* Brand Title - 20% Smaller with stylized anime font */}
        <h1 
          className="text-3xl sm:text-4xl font-black tracking-wide text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)]"
          style={{ fontFamily: "'Orbitron', 'Cinzel', sans-serif" }}
        >
          <span className="text-red-500 drop-shadow-[0_0_18px_rgba(239,68,68,0.85)]">W</span>
          <span className="text-white">Anime</span>{' '}
          <span className="text-red-500 drop-shadow-[0_0_18px_rgba(239,68,68,0.85)]">List</span>
        </h1>

        {/* Short, Tightly Grouped Subtitle */}
        <p className="mt-1.5 text-[11px] sm:text-xs text-slate-200/90 font-medium leading-snug max-w-[250px] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
          Registre sua jornada: rastreador de animes, agenda semanal viva, notícias e perfil Otaku.
        </p>

        {/* Unauthorized Domain Resolution Banner (only when needed) */}
        {isUnauthorizedDomain && (
          <div className="w-full mt-3 p-3 bg-amber-950/85 backdrop-blur-md border border-amber-500/40 rounded-xl text-xs space-y-2 text-left shadow-2xl">
            <div className="flex items-start gap-1.5 text-amber-300 font-semibold text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span>Domínio não autorizado no Google Auth</span>
            </div>
            <p className="text-slate-300 text-[10px] leading-relaxed">
              Adicione este domínio ao Firebase Console:
            </p>
            <div className="flex items-center justify-between gap-1.5 p-1.5 bg-black/80 border border-slate-800 rounded-lg font-mono text-[10px] text-amber-200">
              <span className="truncate">{currentHostname}</span>
              <button
                type="button"
                onClick={handleCopyDomain}
                className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded font-sans text-[10px] font-bold cursor-pointer"
              >
                {copiedDomain ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                <span>{copiedDomain ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        )}

        {/* General Error Message */}
        {errorMsg && !isUnauthorizedDomain && (
          <div className="w-full mt-3 p-2.5 bg-rose-950/85 backdrop-blur-md border border-rose-500/40 rounded-xl text-rose-200 text-[11px] flex flex-col gap-1.5 text-left shadow-2xl">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
              <span className="leading-snug">{errorMsg}</span>
            </div>
            {isInsideIframe && (
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="self-start mt-0.5 px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold text-[10px] flex items-center gap-1 cursor-pointer border border-rose-500/30"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Abrir em Nova Aba</span>
              </button>
            )}
          </div>
        )}

        {/* Action Buttons - 50% More Compact, Tightly Grouped */}
        <div className="w-full mt-4 space-y-2">
          {/* Google Sign In Button */}
          <button
            id="btn-login-google"
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-950 font-bold py-2.5 px-4 rounded-xl transition-all shadow-[0_8px_20px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_25px_rgba(255,255,255,0.12)] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer text-xs"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span className="tracking-tight">
              {loading ? 'Conectando...' : 'Entrar com Conta Google'}
            </span>
          </button>

          {/* Iframe New Tab Helper */}
          {isInsideIframe && (
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="w-full py-1.5 px-2.5 rounded-lg bg-black/55 hover:bg-black/75 text-slate-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-white/10 backdrop-blur-sm"
            >
              <ExternalLink className="w-3 h-3 text-red-400" />
              <span>Abrir em Nova Aba</span>
            </button>
          )}
        </div>
      </main>

      {/* Discreet Footer in a Single Unbroken Line */}
      <footer className="relative z-10 w-full text-center pb-2 pt-2 px-2">
        <p className="text-[10px] sm:text-[11px] text-slate-400/90 whitespace-nowrap overflow-hidden text-ellipsis drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] tracking-tight">
          <span className="text-red-500 font-bold">W</span>
          <span className="text-white font-bold">Anime</span>{' '}
          <span className="text-red-500 font-bold">List</span> • Sincronizado via AniList, Jikan, Shikimori e AnimeThemes
        </p>
      </footer>
    </div>
  );
};
