import React from 'react';
import { Lock } from 'lucide-react';
import { BADGE_IMAGE_MAP, getBadgeImageUrl } from '../../assets/achievementAssets';

export type BadgeTone = 'gold' | 'purple' | 'amber' | 'blue' | 'emerald' | 'rose' | 'cyan' | 'slate';

interface HexBadgeProps {
  badgeId?: string;
  imageUrl?: string;
  title: string;
  subtitle?: string;
  icon?: string; // Emoji ou fallback
  tone?: BadgeTone;
  isUnlocked?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  showTitle?: boolean;
  onClick?: () => void;
  className?: string;
}

const TONE_STYLES: Record<
  BadgeTone,
  {
    border: string;
    bg: string;
    glow: string;
    iconColor: string;
    gradient: string;
  }
> = {
  gold: {
    border: '#EAB308',
    bg: 'rgba(234, 179, 8, 0.12)',
    glow: 'rgba(234, 179, 8, 0.45)',
    iconColor: '#FACC15',
    gradient: 'from-amber-500/20 via-yellow-500/10 to-transparent',
  },
  purple: {
    border: '#A855F7',
    bg: 'rgba(168, 85, 247, 0.12)',
    glow: 'rgba(168, 85, 247, 0.45)',
    iconColor: '#C084FC',
    gradient: 'from-purple-500/20 via-fuchsia-500/10 to-transparent',
  },
  amber: {
    border: '#F97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    glow: 'rgba(249, 115, 22, 0.45)',
    iconColor: '#FB923C',
    gradient: 'from-orange-500/20 via-amber-500/10 to-transparent',
  },
  blue: {
    border: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.12)',
    glow: 'rgba(59, 130, 246, 0.45)',
    iconColor: '#60A5FA',
    gradient: 'from-blue-500/20 via-indigo-500/10 to-transparent',
  },
  emerald: {
    border: '#22C55E',
    bg: 'rgba(34, 197, 94, 0.12)',
    glow: 'rgba(34, 197, 94, 0.45)',
    iconColor: '#4ADE80',
    gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
  },
  rose: {
    border: '#F43F5E',
    bg: 'rgba(244, 63, 94, 0.12)',
    glow: 'rgba(244, 63, 94, 0.45)',
    iconColor: '#FB7185',
    gradient: 'from-rose-500/20 via-pink-500/10 to-transparent',
  },
  cyan: {
    border: '#06B6D4',
    bg: 'rgba(6, 182, 212, 0.12)',
    glow: 'rgba(6, 182, 212, 0.45)',
    iconColor: '#38BDF8',
    gradient: 'from-cyan-500/20 via-blue-500/10 to-transparent',
  },
  slate: {
    border: '#475569',
    bg: 'rgba(71, 85, 105, 0.12)',
    glow: 'rgba(71, 85, 105, 0.25)',
    iconColor: '#94A3B8',
    gradient: 'from-slate-700/20 via-slate-800/10 to-transparent',
  },
};

export const HexBadge: React.FC<HexBadgeProps> = ({
  badgeId,
  imageUrl,
  title,
  subtitle,
  icon = '🏆',
  tone = 'gold',
  isUnlocked = true,
  size = 'md',
  showSubtitle = false,
  showTitle = true,
  onClick,
  className = '',
}) => {
  const style = isUnlocked ? TONE_STYLES[tone] : TONE_STYLES.slate;

  // Resolve imagem da insígnia oficial se existir
  const resolvedBadgeUrl = imageUrl || (badgeId && BADGE_IMAGE_MAP[badgeId] ? getBadgeImageUrl(badgeId) : null);

  // Tipografia dinâmica e proporcional para garantir que nomes longos NUNCA fiquem cortados
  const getDynamicLabelClass = (text: string, currentSize: string = 'md') => {
    const len = text.trim().length;
    if (currentSize === 'sm') {
      if (len > 24) return 'text-[7.5px] sm:text-[8px] leading-[1.08]';
      if (len > 16) return 'text-[8px] sm:text-[8.5px] leading-[1.12]';
      if (len > 11) return 'text-[8.5px] sm:text-[9px] leading-[1.15]';
      return 'text-[9.5px] sm:text-[10px] leading-[1.18]';
    }
    if (currentSize === 'md') {
      if (len > 24) return 'text-[10px] sm:text-[10.5px] leading-tight';
      if (len > 16) return 'text-[10.5px] sm:text-[11px] leading-tight';
      return 'text-[11.5px] sm:text-xs leading-tight';
    }
    if (len > 24) return 'text-xs sm:text-[13px] leading-tight';
    return 'text-xs sm:text-sm leading-tight';
  };

  // Dimensões proporcionais por tamanho
  const dimensions = {
    sm: {
      box: 'w-14 h-14 sm:w-16 sm:h-16',
      iconSize: 'text-xl',
      lockSize: 'w-4 h-4',
    },
    md: {
      box: 'w-20 h-20 sm:w-24 sm:h-24',
      iconSize: 'text-2xl',
      lockSize: 'w-5 h-5',
    },
    lg: {
      box: 'w-28 h-28 sm:w-32 sm:h-32',
      iconSize: 'text-3xl',
      lockSize: 'w-6 h-6',
    },
  }[size];

  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center text-center group select-none ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* Contêiner da Insígnia com Proporção Perfeita e Fundo Transparente */}
      <div
        className={`relative flex items-center justify-center transition-all duration-300 group-hover:scale-105 shrink-0 ${dimensions.box}`}
      >
        {resolvedBadgeUrl ? (
          <>
            {/* Halo Suave de Brilho Colorido por Trás da Insígnia */}
            {isUnlocked && (
              <div
                className="absolute inset-2 rounded-full transition-opacity duration-300 opacity-60 group-hover:opacity-100 pointer-events-none filter blur-md"
                style={{ backgroundColor: style.glow }}
              />
            )}

            {/* Imagem Oficial da Insígnia (WebP com Alpha Transparente) */}
            <img
              src={resolvedBadgeUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              className={`relative z-10 w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)] transition-all duration-300 ${
                isUnlocked
                  ? 'group-hover:scale-105'
                  : 'grayscale brightness-50 opacity-40 group-hover:opacity-60'
              }`}
            />

            {/* Cadeado de Bloqueio Sobreposto */}
            {!isUnlocked && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <div className="p-1.5 rounded-full bg-black/80 border border-white/20 shadow-lg backdrop-blur-sm">
                  <Lock className={`${dimensions.lockSize} text-white/90`} />
                </div>
              </div>
            )}
          </>
        ) : (
          /* Fallback em SVG Hexagonal caso não encontre imagem */
          <>
            <svg
              viewBox="0 0 100 115"
              className="absolute inset-0 w-full h-full drop-shadow-md"
              style={{
                filter: isUnlocked
                  ? `drop-shadow(0 0 8px ${style.glow})`
                  : 'grayscale(100%) opacity(40%)',
              }}
            >
              <polygon
                points="50,2 95,28 95,87 50,113 5,87 5,28"
                fill={style.bg}
                stroke={style.border}
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <polygon
                points="50,10 87,32 87,83 50,105 13,83 13,32"
                fill="none"
                stroke={style.border}
                strokeWidth="1.2"
                strokeOpacity="0.45"
                strokeLinejoin="round"
              />
            </svg>
            <div
              className={`relative z-10 flex items-center justify-center ${dimensions.iconSize} transition-transform duration-300 group-hover:scale-110`}
              style={{ filter: isUnlocked ? undefined : 'grayscale(100%)' }}
            >
              <span>{icon}</span>
            </div>
          </>
        )}
      </div>

      {/* Rótulo do Nome da Insígnia - Adaptação dinâmica para nunca cortar */}
      {showTitle && title && (
        <span
          className={`mt-1 font-bold text-white w-full max-w-full px-0.5 line-clamp-3 break-words text-center transition-colors ${getDynamicLabelClass(
            title,
            size
          )} ${isUnlocked ? 'group-hover:text-amber-300' : 'text-slate-500'}`}
          title={title}
        >
          {title}
        </span>
      )}

      {/* Subtítulo / Descrição se solicitado */}
      {showSubtitle && subtitle && (
        <span
          className="text-slate-400 mt-0.5 leading-tight w-full max-w-full line-clamp-2 text-[9px] text-center"
          title={subtitle}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
};

