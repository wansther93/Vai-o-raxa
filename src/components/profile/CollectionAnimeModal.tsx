import React, { useState, useEffect } from 'react';
import {
  X,
  Tv,
  Play,
  Star,
  ExternalLink,
  Calendar,
  ChevronDown,
  ChevronUp,
  Layers,
  Users,
  Music,
  Check,
  Film,
  FileText,
  Bookmark,
  Share2,
  Volume2,
  Compass,
} from 'lucide-react';
import type { Anime } from '../../types';
import { STATUS_CONFIG } from '../../types';
import type { AnimeStreamingLink, AnimeCharacterItem, AnimeRecommendationItem } from '../../services/jikanService';
import { getAnimeBanner, getHighResImageUrl } from '../../services/jikanService';
import type { AnimeThemeMedia } from '../../services/animeThemesService';
import { updateAnime } from '../../services/animeService';
import { fetchOfficialAnimeTrailer } from '../../services/animeSyncService';
import {
  getPersistedAnimeRichData,
  getOrFetchAnimeRichData,
  isAnimeRichDataIncomplete,
  isAnimeRichDataStale,
} from '../../services/animeMetadataService';

interface CollectionAnimeModalProps {
  anime: Anime;
  isOpen: boolean;
  onClose: () => void;
  isOwner?: boolean;
  onOpenInTracker?: (animeId: string) => void;
  onAddAnimeFromFriend?: (prefill: Partial<Anime>) => void;
}

export const CollectionAnimeModal: React.FC<CollectionAnimeModalProps> = ({
  anime,
  isOpen,
  onClose,
  isOwner = true,
  onOpenInTracker,
  onAddAnimeFromFriend,
}) => {
  const [streamingLinks, setStreamingLinks] = useState<AnimeStreamingLink[]>([]);
  const [loadingStreaming, setLoadingStreaming] = useState(true);

  const [characters, setCharacters] = useState<AnimeCharacterItem[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(false);

  const [themes, setThemes] = useState<AnimeThemeMedia[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);

  const [recommendations, setRecommendations] = useState<AnimeRecommendationItem[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  const [bannerUrl, setBannerUrl] = useState<string | null>(anime.bannerUrl || null);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(anime.trailerUrl || null);

  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false);
  const [isCharactersExpanded, setIsCharactersExpanded] = useState(false);
  const [isMusicExpanded, setIsMusicExpanded] = useState(false);
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [activePlayingThemeId, setActivePlayingThemeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Carrega informações ricas de forma inteligente:
  // Se já estiver salvo na coleção, lê imediatamente do armazenamento persistente (0ms de espera, 0 buscas repetidas).
  // Se for novo ou anime antigo sem dados sincronizados, busca nas APIs agregadas, auto-cura trailer e salva banner oficial.
  useEffect(() => {
    if (!isOpen || !anime) return;

    let isMounted = true;
    setActiveMediaUrl(null);
    setActivePlayingThemeId(null);
    setIsProgressExpanded(false);
    setIsCharactersExpanded(false);
    setIsMusicExpanded(false);
    setBannerUrl(anime.bannerUrl || null);
    setTrailerUrl(anime.trailerUrl || null);

    // 1. Tenta carregar os dados persistidos imediatamente do armazém compartilhado
    const persisted = getPersistedAnimeRichData(anime);

    if (persisted) {
      if (persisted.streamingLinks?.length) setStreamingLinks(persisted.streamingLinks);
      if (persisted.characters?.length) setCharacters(persisted.characters);
      if (persisted.themes?.length) setThemes(persisted.themes);
      if (persisted.recommendations?.length) setRecommendations(persisted.recommendations);
      if (persisted.bannerUrl && !anime.bannerUrl) setBannerUrl(persisted.bannerUrl);
      if (persisted.trailerUrl && !anime.trailerUrl) setTrailerUrl(persisted.trailerUrl);

      setLoadingStreaming(false);
      setLoadingCharacters(false);
      setLoadingThemes(false);
      setLoadingRecommendations(false);

      // Se já possui todos os dados ricos completos (personagens e músicas) e está fresco (<12h), entrega instantâneo em 0ms
      const isFullyLoaded = !isAnimeRichDataIncomplete(persisted);
      const isCacheFresh = !isAnimeRichDataStale(persisted);
      if (isFullyLoaded && isCacheFresh) {
        return;
      }
    }

    // Escuta atualizações de segundo plano para renovar o modal em tempo real sem travar a tela
    const handleRichDataUpdated = (e: Event) => {
      const custom = e as CustomEvent;
      const detail = custom.detail;
      if (!isMounted || !detail?.data) return;
      const matchesMalId = detail.mal_id && anime.mal_id && detail.mal_id === anime.mal_id;
      const matchesTitle = detail.title && anime.title && detail.title.toLowerCase().trim() === anime.title.toLowerCase().trim();
      if (matchesMalId || matchesTitle) {
        const d = detail.data;
        if (d.streamingLinks?.length) setStreamingLinks(d.streamingLinks);
        if (d.characters?.length) setCharacters(d.characters);
        if (d.themes?.length) setThemes(d.themes);
        if (d.recommendations?.length) setRecommendations(d.recommendations);
        if (d.bannerUrl && !anime.bannerUrl) setBannerUrl(d.bannerUrl);
        if (d.trailerUrl && !anime.trailerUrl) setTrailerUrl(d.trailerUrl);
      }
    };

    window.addEventListener('wanime_rich_data_updated', handleRichDataUpdated);

    // 2. Se for um anime novo ou com dados antigos/incompletos, busca consolidada oficial
    setLoadingStreaming(!persisted?.streamingLinks?.length);
    setLoadingCharacters(!persisted?.characters?.length);
    setLoadingThemes(!persisted?.themes?.length);
    setLoadingRecommendations(!persisted?.recommendations?.length);

    getOrFetchAnimeRichData(anime, false)
      .then((data) => {
        if (isMounted) {
          if (data.streamingLinks?.length) setStreamingLinks(data.streamingLinks);
          if (data.characters?.length) setCharacters(data.characters);
          if (data.themes?.length) setThemes(data.themes);
          if (data.recommendations?.length) setRecommendations(data.recommendations);
          if (data.bannerUrl) setBannerUrl(data.bannerUrl);
          if (data.trailerUrl) setTrailerUrl(data.trailerUrl);
          setLoadingStreaming(false);
          setLoadingCharacters(false);
          setLoadingThemes(false);
          setLoadingRecommendations(false);

          // Se ainda não descobriu o banner, busca na relação de franquia
          if (!data.bannerUrl && !anime.bannerUrl) {
            getAnimeBanner(data.mal_id || anime.mal_id || 0, anime.title).then((found) => {
              if (isMounted && found) {
                setBannerUrl(found);
                if (isOwner && anime.id) {
                  updateAnime(anime.id, { bannerUrl: found }).catch(() => {});
                }
              }
            });
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadingStreaming(false);
          setLoadingCharacters(false);
          setLoadingThemes(false);
          setLoadingRecommendations(false);
        }
      });

    return () => {
      isMounted = false;
      setActiveMediaUrl(null);
      window.removeEventListener('wanime_rich_data_updated', handleRichDataUpdated);
    };
  }, [isOpen, anime, isOwner]);

  if (!isOpen || !anime) return null;

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${anime.title} no WAnimeList: ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.warn('Erro ao copiar link:', e);
    }
  };

  // Estilização dinâmica por marca de streaming oficial
  const getStreamingBadgeStyle = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('crunchyroll')) {
      return {
        bg: 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30 text-orange-300',
        dot: 'bg-orange-400',
      };
    }
    if (lower.includes('netflix')) {
      return {
        bg: 'bg-red-600/10 hover:bg-red-600/20 border-red-600/30 text-red-300',
        dot: 'bg-red-500',
      };
    }
    if (lower.includes('prime') || lower.includes('amazon')) {
      return {
        bg: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-300',
        dot: 'bg-sky-400',
      };
    }
    if (lower.includes('disney')) {
      return {
        bg: 'bg-blue-600/10 hover:bg-blue-600/20 border-blue-600/30 text-blue-300',
        dot: 'bg-blue-400',
      };
    }
    if (lower.includes('max') || lower.includes('hbo')) {
      return {
        bg: 'bg-purple-600/10 hover:bg-purple-600/20 border-purple-600/30 text-purple-300',
        dot: 'bg-purple-500',
      };
    }
    if (lower.includes('onegai')) {
      return {
        bg: 'bg-pink-600/10 hover:bg-pink-600/20 border-pink-600/30 text-pink-300',
        dot: 'bg-pink-500',
      };
    }
    return {
      bg: 'bg-zinc-800/60 hover:bg-zinc-800 border-zinc-700 text-zinc-300',
      dot: 'bg-zinc-400',
    };
  };

  // =========================================================================
  // CÁLCULO MACRO REAL DA FRANQUIA (PROGRESSO, PORCENTAGEM REAL E CONTAGEM)
  // =========================================================================
  const seasons = anime.seasons || [];
  const hasSeasonsList = seasons.length > 0;

  // Verifica se o anime é contínuo / sem quantidade total de episódios definida (ex: One Piece, Detective Conan)
  const isContinuous =
    anime.status === 'watching' &&
    (!anime.totalEpisodes || anime.totalEpisodes <= 0) &&
    (!hasSeasonsList || seasons.every((s) => !s.totalEpisodes || s.totalEpisodes <= 0));

  // 1. Total de episódios da franquia cadastrada
  let totalFranchiseEpisodes = 0;
  if (hasSeasonsList) {
    totalFranchiseEpisodes = seasons.reduce(
      (acc, s) => acc + (s.totalEpisodes && s.totalEpisodes > 0 ? s.totalEpisodes : 0),
      0
    );
  }
  if (totalFranchiseEpisodes === 0 && anime.totalEpisodes && anime.totalEpisodes > 0) {
    totalFranchiseEpisodes = anime.totalEpisodes;
  }

  // 2. Episódios assistidos cumulativos da franquia e contagem de mídias concluídas
  let totalWatchedEpisodes = 0;
  let watchedMoviesCount = 0;
  let watchedOvasCount = 0;

  if (hasSeasonsList) {
    const curSeasonNameNorm = (anime.currentSeasonName || '').trim().toLowerCase();

    seasons.forEach((s) => {
      const isMovie =
        s.type === 'movie' ||
        /filme|movie/i.test(s.name) ||
        /filme|movie/i.test(s.canonicalTitle || '');
      const isOva =
        s.type === 'ova' ||
        s.type === 'special' ||
        /ova|special|especial/i.test(s.name) ||
        /ova|special|especial/i.test(s.canonicalTitle || '');

      if (s.isWatched) {
        if (isMovie) {
          watchedMoviesCount += 1;
        } else if (isOva) {
          watchedOvasCount += 1;
        }
        totalWatchedEpisodes += s.totalEpisodes && s.totalEpisodes > 0 ? s.totalEpisodes : 1;
      } else if (
        s.name.trim().toLowerCase() === curSeasonNameNorm ||
        (anime.activeSeasonId && s.id === anime.activeSeasonId)
      ) {
        // Temporada atualmente ativa (em progresso)
        const currentInSeason = Math.max(0, Number(anime.currentEpisode) || 0);
        const maxInSeason = s.totalEpisodes && s.totalEpisodes > 0 ? s.totalEpisodes : currentInSeason;
        totalWatchedEpisodes += Math.min(currentInSeason, maxInSeason);
      }
    });

    if (totalWatchedEpisodes === 0 && anime.currentEpisode) {
      totalWatchedEpisodes = Math.max(0, Number(anime.currentEpisode) || 0);
    }
  } else {
    totalWatchedEpisodes = Math.max(0, Number(anime.currentEpisode) || 0);
  }

  // Se o status for concluído (completed), garante que o percentual reflita 100%
  const isCompleted = anime.status === 'completed';
  const progressPercent = isCompleted
    ? 100
    : totalFranchiseEpisodes > 0
    ? Math.min(100, Math.max(0, Math.round((totalWatchedEpisodes / totalFranchiseEpisodes) * 100)))
    : 0;

  // Construção textual universal e elegante
  const progressTextSegments: string[] = [];
  if (isContinuous) {
    progressTextSegments.push(`Episódio ${anime.currentEpisode || 1}`);
    progressTextSegments.push('Em exibição contínua');
  } else {
    progressTextSegments.push(
      totalFranchiseEpisodes > 0
        ? `${totalWatchedEpisodes} de ${totalFranchiseEpisodes} eps assistidos`
        : `${totalWatchedEpisodes} episódios assistidos`
    );
    if (watchedMoviesCount > 0) {
      progressTextSegments.push(
        `${watchedMoviesCount} ${watchedMoviesCount === 1 ? 'filme concluído' : 'filmes concluídos'}`
      );
    }
    if (watchedOvasCount > 0) {
      progressTextSegments.push(
        `${watchedOvasCount} ${watchedOvasCount === 1 ? 'OVA/especial concluído' : 'OVAs/especiais concluídos'}`
      );
    }
    progressTextSegments.push(`${progressPercent}% concluído`);
  }

  // Extração do ID do YouTube se o anime possuir trailerUrl
  const extractYoutubeId = (url?: string | null): string | null => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  };
  const effectiveTrailer = trailerUrl || anime.trailerUrl;
  const youtubeVideoId = extractYoutubeId(effectiveTrailer);

  const effectiveBanner = bannerUrl || anime.bannerUrl;

  const statusConfig = STATUS_CONFIG[anime.status] || {
    label: anime.status || 'Na Lista',
    color: 'bg-zinc-700 text-zinc-300',
  };

  return (
    <div
      id="collection-anime-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/90 backdrop-blur-md overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        id="collection-anime-modal-card"
        className="relative w-full max-w-3xl my-auto bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-zinc-100 max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner Superior - Imagem 100% nítida e vibrante, sem desfoque (blur), sem opacidade ou filtros escuros */}
        <div className="relative h-48 sm:h-56 w-full bg-zinc-950 flex-shrink-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={getHighResImageUrl(effectiveBanner || anime.coverUrl)}
              alt={anime.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center brightness-100"
            />
            {/* Sombra suave apenas na base do banner para fundir suavemente com o fundo sem cobrir a imagem */}
            <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />
          </div>

          {/* Botões do Topo */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-30">
            <button
              id="collection-modal-share-btn"
              type="button"
              onClick={handleShare}
              title="Copiar link"
              className="p-2 rounded-xl bg-black/60 hover:bg-black/80 border border-white/10 text-zinc-300 hover:text-white transition-all backdrop-blur-md cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            </button>
            <button
              id="collection-modal-close-btn"
              type="button"
              onClick={onClose}
              title="Fechar"
              className="p-2 rounded-xl bg-black/60 hover:bg-rose-500/20 hover:border-rose-500/30 border border-white/10 text-zinc-300 hover:text-white transition-all backdrop-blur-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Informações sobre o Banner (Pôster + Títulos) */}
          <div className="absolute bottom-3 sm:bottom-4 left-4 right-4 flex items-end gap-3.5 sm:gap-4 z-20">
            <div className="relative w-22 sm:w-28 md:w-32 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl shadow-black/90 border border-white/20 bg-zinc-900 flex-shrink-0">
              <img
                src={anime.coverUrl}
                alt={anime.title}
                className="w-full h-full object-cover"
                loading="eager"
              />
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

              {anime.score ? (
                <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-amber-500/30 flex items-center gap-1 text-[10px] font-bold text-amber-300 shadow-sm">
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                  {anime.score}
                </div>
              ) : null}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {anime.format && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-white/10 text-zinc-300 border border-white/10">
                    {anime.format}
                  </span>
                )}
                {anime.studio && (
                  <span className="text-xs text-amber-400/90 font-medium truncate">
                    {anime.studio}
                  </span>
                )}
                {anime.year && (
                  <span className="text-xs text-zinc-400 font-medium">
                    {anime.year}
                  </span>
                )}
              </div>

              <h2 className="text-base sm:text-xl md:text-2xl font-black text-white leading-tight line-clamp-2 drop-shadow-md">
                {anime.title}
              </h2>

              {anime.title_japanese && (
                <p className="text-xs text-zinc-400 truncate mt-0.5 font-sans">
                  {anime.title_japanese}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Conteúdo Rolável */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-zinc-200">
          
          {/* ========================================================================= */}
          {/* PAINEL DE PROGRESSO REAL DO USUÁRIO (Linha Única Retrátil Inicial) */}
          {/* ========================================================================= */}
          <div className="rounded-xl bg-zinc-900/80 border border-white/10 shadow-md overflow-hidden transition-all">
            {/* Linha única principal (Sempre visível inicialmente, 100% limpa, sem nota do lado de fora) */}
            <button
              type="button"
              onClick={() => setIsProgressExpanded((prev) => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-800/50 transition-colors cursor-pointer group text-left"
            >
              <div className="flex items-center gap-2 shrink-0">
                <Bookmark className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-200 whitespace-nowrap">
                  Seu progresso
                </span>
              </div>

              <div className="flex items-center gap-1 text-zinc-400 group-hover:text-amber-400 text-xs font-semibold transition-colors shrink-0">
                <span className="whitespace-nowrap">{isProgressExpanded ? 'Minimizar' : 'Ver progresso'}</span>
                {isProgressExpanded ? (
                  <ChevronUp className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400 group-hover:text-amber-400 shrink-0" />
                )}
              </div>
            </button>

            {/* Conteúdo expandido: barra de progresso detalhada, status, anotações e mídias já diretamente visíveis */}
            {isProgressExpanded && (
              <div className="p-3 border-t border-white/5 space-y-3 bg-black/20 animate-in fade-in duration-200">
                {/* Status, Nota e Rewatch */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide ${statusConfig.color}`}>
                    {statusConfig.label}
                  </span>
                  <div className="flex items-center gap-3">
                    {anime.rating && anime.rating > 0 ? (
                      <div className="flex items-center gap-1 text-zinc-300">
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span>Sua Nota: <strong className="text-white">{anime.rating} / 10</strong></span>
                      </div>
                    ) : (
                      <span className="text-zinc-500 text-xs">Sem avaliação</span>
                    )}
                    {anime.rewatchCount && anime.rewatchCount > 0 ? (
                      <span className="text-zinc-400 text-xs">
                        Reassistido: <strong className="text-white">{anime.rewatchCount}x</strong>
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Linha de Episódio e Barra de Progresso Real da Obra */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                    <span className="text-zinc-300 font-medium text-[11px] sm:text-xs">
                      {anime.currentSeasonName && !isContinuous ? (
                        <span className="text-amber-300 font-semibold">{anime.currentSeasonName} • </span>
                      ) : anime.season && !isContinuous ? (
                        <span className="text-amber-300 font-semibold">Temporada {anime.season} • </span>
                      ) : null}
                      {progressTextSegments.join(' • ')}
                    </span>
                    {!isContinuous && totalFranchiseEpisodes > 0 && (
                      <span className="text-[11px] font-bold text-amber-400">{progressPercent}%</span>
                    )}
                  </div>
                  {!isContinuous && totalFranchiseEpisodes > 0 && (
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden border border-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Anotações Pessoais se houver */}
                {anime.notes && anime.notes.trim() && (
                  <div className="p-2 rounded-lg bg-black/30 border border-white/5 text-[11px] space-y-0.5">
                    <div className="flex items-center gap-1.5 text-zinc-400 font-semibold text-[10px]">
                      <FileText className="w-3 h-3 text-amber-400" />
                      <span>Suas Anotações</span>
                    </div>
                    <p className="text-zinc-300 italic whitespace-pre-wrap">{anime.notes}</p>
                  </div>
                )}

                {/* Lista das Temporadas & Mídias da Franquia (Diretamente visível, sem botão duplo) */}
                {hasSeasonsList && seasons.length > 0 && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Temporadas & Mídias da Franquia ({seasons.length})</span>
                      </span>
                      <span className="text-amber-300/90 font-medium text-[10px]">
                        {totalWatchedEpisodes} / {totalFranchiseEpisodes} eps assistidos
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-0.5 no-scrollbar pt-0.5">
                      {seasons.map((sec, idx) => {
                        const isCurrent =
                          sec.name.trim().toLowerCase() === (anime.currentSeasonName || '').trim().toLowerCase() ||
                          (anime.activeSeasonId && sec.id === anime.activeSeasonId);
                        return (
                          <div
                            key={sec.id || idx}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                              sec.isWatched
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-zinc-300'
                                : isCurrent
                                ? 'bg-amber-500/10 border-amber-500/30 text-white'
                                : 'bg-zinc-950/60 border-white/5 text-zinc-400'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold truncate text-zinc-200">{sec.name}</span>
                                {isCurrent && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500 text-black font-bold shrink-0">
                                    Atual
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-500">
                                {sec.totalEpisodes ? `${sec.totalEpisodes} eps` : 'Em exibição'}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                sec.isWatched
                                  ? 'text-emerald-400 bg-emerald-500/15'
                                  : isCurrent
                                  ? 'text-amber-400 bg-amber-500/15'
                                  : 'text-zinc-500'
                              }`}
                            >
                              {sec.isWatched ? 'Concluído' : isCurrent ? `Ep. ${anime.currentEpisode || 1}` : 'Pendente'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Onde Assistir Oficialmente no Brasil */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 whitespace-nowrap">
              <Tv className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Onde Assistir Oficialmente no Brasil</span>
            </h3>

            {loadingStreaming ? (
              <div className="flex items-center gap-2 py-2.5 text-xs text-zinc-400 animate-pulse">
                <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                Consultando distribuidores oficiais nas APIs...
              </div>
            ) : streamingLinks.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {streamingLinks.map((link, idx) => {
                  const style = getStreamingBadgeStyle(link.name);
                  return (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-semibold transition-all group ${style.bg}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                        <span className="truncate">{link.name}</span>
                      </div>
                      <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-1.5" />
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-white/5 text-xs text-zinc-400 flex items-center justify-between">
                <span>Nenhuma plataforma com transmissão simultânea confirmada nas APIs oficiais para o Brasil.</span>
                <a
                  href={`https://www.crunchyroll.com/pt-br/search?q=${encodeURIComponent(anime.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline flex items-center gap-1 font-medium ml-2 flex-shrink-0 text-[11px]"
                >
                  Buscar no Crunchyroll <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {/* Trailer Oficial da Produção (YouTube) */}
          {youtubeVideoId ? (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                Trailer Oficial
              </h3>
              <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-white/10 bg-black shadow-lg">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}`}
                  title={`Trailer de ${anime.title}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/40 border border-white/5 text-xs">
              <div className="flex items-center gap-2 text-zinc-300">
                <Play className="w-3.5 h-3.5 text-zinc-400" />
                <span>Trailer oficial da produção</span>
              </div>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                  `${anime.title} official trailer pv`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 text-[11px] font-medium"
              >
                Buscar no YouTube <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Sinopse Retrátil */}
          {anime.synopsis && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-amber-400" />
                  Sinopse
                </h3>
                {anime.synopsis.length > 120 && (
                  <button
                    type="button"
                    onClick={() => setIsSynopsisExpanded(!isSynopsisExpanded)}
                    className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {isSynopsisExpanded ? (
                      <>
                        <span>Minimizar sinopse</span>
                        <ChevronUp className="w-3 h-3" />
                      </>
                    ) : (
                      <>
                        <span>Ler sinopse completa</span>
                        <ChevronDown className="w-3 h-3" />
                      </>
                    )}
                  </button>
                )}
              </div>
              <div
                className={`text-xs sm:text-[13px] text-zinc-300 leading-relaxed bg-zinc-900/40 p-3 rounded-xl border border-white/5 whitespace-pre-line transition-all ${
                  isSynopsisExpanded ? '' : 'line-clamp-2'
                }`}
              >
                {anime.synopsis}
              </div>
            </div>
          )}

          {/* Gêneros */}
          {anime.genres && anime.genres.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-zinc-500" />
                Gêneros & Temas
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {anime.genres.map((g, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-zinc-900 border border-white/10 text-zinc-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Personagens & Dubladores (Seiyuus) - Carregados Dinamicamente da API */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                Personagens & Dubladores Oficiais
              </h3>
              <span className="text-[10px] text-zinc-500">Jikan / AniList</span>
            </div>

            {loadingCharacters ? (
              <div className="flex items-center gap-2 py-2 text-xs text-zinc-400 animate-pulse">
                <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                Carregando elenco de vozes e personagens...
              </div>
            ) : characters.length > 0 ? (
              <div className="space-y-2">
                {/* Grade 2x2 inicial que aproveita toda a largura, ou grade expandida */}
                <div className={`grid grid-cols-2 ${isCharactersExpanded ? 'sm:grid-cols-3 lg:grid-cols-4 max-h-96 overflow-y-auto pr-0.5 no-scrollbar' : ''} gap-2`}>
                  {(isCharactersExpanded ? characters : characters.slice(0, 4)).map((c) => (
                    <div
                      key={c.id}
                      className="p-2 rounded-xl bg-zinc-900/60 border border-white/5 flex items-center gap-2.5 hover:border-emerald-500/25 transition-colors min-w-0"
                    >
                      <img
                        src={c.imageUrl}
                        alt={c.name}
                        className="w-10 h-10 rounded-lg object-cover bg-zinc-800 shrink-0 border border-white/10"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-zinc-200 truncate" title={c.name}>{c.name}</h4>
                        <p className="text-[10px] text-zinc-400 truncate" title={c.voiceActor?.name || c.role}>
                          {c.voiceActor?.name ? `Voz: ${c.voiceActor.name}` : c.role}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {characters.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setIsCharactersExpanded((prev) => !prev)}
                    className="w-full py-1.5 px-3 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-white/5 text-[11px] font-bold text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>
                      {isCharactersExpanded
                        ? 'Mostrar menos dubladores'
                        : `Ver elenco completo (${characters.length} personagens)`}
                    </span>
                    {isCharactersExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-zinc-900/30 border border-white/5 text-xs text-zinc-400">
                Informações de elenco não disponíveis nesta ficha.
              </div>
            )}
          </div>

          {/* Temas Musicais (Openings & Endings) em Grade com Cards Clicáveis */}
          {themes && themes.length > 0 && (
            <div className="space-y-3 pt-1 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-purple-400" />
                  <span>Músicas Oficiais (Aberturas & Encerramentos)</span>
                </h3>
                {themes.some((t) => t.videoUrl || t.audioUrl) && (
                  <span className="text-[10px] text-purple-300/80 font-medium">
                    Toque para ouvir
                  </span>
                )}
              </div>

              {/* Lista de Aberturas e Encerramentos em Grade 2 Colunas (Player inline onde o usuário clicar) */}
              {(() => {
                const ops = themes.filter((t) => t.themeType === 'OP');
                const eds = themes.filter((t) => t.themeType === 'ED');
                // Inicialmente mostra 1 Abertura e 1 Encerramento lado a lado na grade de 2 colunas
                const displayedThemes = isMusicExpanded
                  ? themes
                  : [...ops.slice(0, 1), ...eds.slice(0, 1)];
                const hasMore = ops.length > 1 || eds.length > 1;

                return (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {displayedThemes.map((theme, idx) => {
                        const isOp = theme.themeType === 'OP';
                        const mediaUrl = theme.videoUrl || theme.audioUrl;
                        const hasYouTubeFallback = Boolean(!mediaUrl && theme.youtubeVideoId);
                        const hasMedia = Boolean(mediaUrl || theme.youtubeVideoId);
                        const isPlaying = activePlayingThemeId === theme.id || Boolean(mediaUrl && activeMediaUrl === mediaUrl);

                        return (
                          <div
                            key={`${theme.themeType}-${theme.sequence || idx}-${idx}`}
                            onClick={() => {
                              if (isPlaying) {
                                setActiveMediaUrl(null);
                                setActivePlayingThemeId(null);
                              } else if (mediaUrl) {
                                setActivePlayingThemeId(theme.id);
                                setActiveMediaUrl(mediaUrl);
                              } else {
                                // Reproduz diretamente dentro do projeto no player embutido, NUNCA sai do app!
                                setActiveMediaUrl(null);
                                setActivePlayingThemeId(theme.id);
                              }
                            }}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer group text-left ${
                              isPlaying
                                ? isOp
                                  ? 'col-span-2 bg-purple-950/40 border-purple-500 shadow-xl'
                                  : 'col-span-2 bg-sky-950/40 border-sky-500 shadow-xl'
                                : isOp
                                ? 'col-span-1 bg-zinc-900/60 border-white/5 hover:border-purple-500/40 hover:bg-purple-950/20'
                                : 'col-span-1 bg-zinc-900/60 border-white/5 hover:border-sky-500/40 hover:bg-sky-950/20'
                            }`}
                            title={
                              isPlaying
                                ? 'Clique para fechar o reprodutor'
                                : mediaUrl
                                ? 'Clique para reproduzir o vídeo/áudio oficial aqui'
                                : 'Clique para reproduzir o vídeo no player aqui'
                            }
                          >
                            {/* Cabeçalho da música */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Play
                                    className={`w-3 h-3 shrink-0 fill-current ${
                                      isPlaying
                                        ? isOp
                                          ? 'text-purple-400 animate-pulse'
                                          : 'text-sky-400 animate-pulse'
                                        : isOp
                                        ? 'text-purple-400 group-hover:scale-110 transition-transform'
                                        : 'text-sky-400 group-hover:scale-110 transition-transform'
                                    }`}
                                  />
                                  <span
                                    className={`text-[10px] font-bold uppercase tracking-wider block ${
                                      isOp ? 'text-purple-400' : 'text-sky-400'
                                    }`}
                                  >
                                    {isOp ? `Abertura ${theme.sequence || ''}` : `Encerramento ${theme.sequence || ''}`}
                                  </span>
                                  {hasYouTubeFallback && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-600/20 text-red-300 font-semibold border border-red-500/30">
                                      YouTube
                                    </span>
                                  )}
                                </div>

                                <p
                                  className="text-zinc-200 font-semibold truncate group-hover:text-white transition-colors"
                                  title={theme.songTitle}
                                >
                                  {theme.songTitle || 'Tema Musical'}
                                </p>

                                {theme.artistName && (
                                  <p className="text-[10px] text-zinc-400 truncate" title={theme.artistName}>
                                    {theme.artistName}
                                  </p>
                                )}
                              </div>

                              {/* Ações: Fechar Player (se ativo) ou Botão de Tocar Interno */}
                              <div className="flex items-center gap-1 shrink-0">
                                {isPlaying ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMediaUrl(null);
                                      setActivePlayingThemeId(null);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-bold transition-colors cursor-pointer"
                                  >
                                    ✕ Fechar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (mediaUrl) {
                                        setActivePlayingThemeId(theme.id);
                                        setActiveMediaUrl(mediaUrl);
                                      } else {
                                        setActiveMediaUrl(null);
                                        setActivePlayingThemeId(theme.id);
                                      }
                                    }}
                                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                      isOp
                                        ? 'bg-purple-900/30 border-purple-500/30 text-purple-300 hover:bg-purple-800/50'
                                        : 'bg-sky-900/30 border-sky-500/30 text-sky-300 hover:bg-sky-800/50'
                                    }`}
                                    title="Tocar no player interno"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Reprodutor de vídeo nativo (AnimeThemes) mantido exatamente como antes */}
                            {isPlaying && activeMediaUrl && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2.5 pt-2 border-t border-white/10 animate-in fade-in duration-200"
                              >
                                <video
                                  src={activeMediaUrl}
                                  controls
                                  autoPlay
                                  className="w-full max-h-72 rounded-xl bg-black aspect-video object-contain shadow-2xl border border-white/10"
                                />
                              </div>
                            )}

                            {/* Reprodutor do YouTube integrado diretamente no modal (NUNCA sai do app) */}
                            {isPlaying && !activeMediaUrl && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2.5 pt-2 border-t border-white/10 animate-in fade-in duration-200"
                              >
                                <div className="w-full aspect-video rounded-xl overflow-hidden bg-black shadow-2xl border border-white/10">
                                  <iframe
                                    src={
                                      theme.youtubeVideoId
                                        ? `https://www.youtube-nocookie.com/embed/${theme.youtubeVideoId}?autoplay=1&rel=0`
                                        : `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(
                                            `${anime.title} ${isOp ? 'Opening' : 'Ending'} ${theme.songTitle || ''}`.trim()
                                          )}&autoplay=1`
                                    }
                                    title={theme.songTitle || 'Player de Música'}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="w-full h-full border-0"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => setIsMusicExpanded((prev) => !prev)}
                        className="w-full py-1.5 px-3 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-white/5 text-[11px] font-bold text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{isMusicExpanded ? 'Mostrar menos músicas' : `Ver todas as músicas e temas (${themes.length})`}</span>
                        {isMusicExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-purple-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* PENÚLTIMA SEÇÃO: Quem assistiu também curtiu (Recomendações) */}
          {loadingRecommendations ? (
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>Quem assistiu também curtiu</span>
              </div>
              <div className="flex items-center gap-2 py-2 text-xs text-zinc-400 animate-pulse">
                <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                Buscando recomendações oficiais...
              </div>
            </div>
          ) : recommendations && recommendations.length > 0 ? (
            <div className="space-y-2.5 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-amber-400" />
                  <span>Quem assistiu também curtiu</span>
                </h3>
                <span className="text-[10px] text-zinc-500 font-medium">Recomendações da Comunidade</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {recommendations.slice(0, 8).map((rec) => (
                  <div
                    key={rec.id}
                    onClick={() => {
                      if (onAddAnimeFromFriend) {
                        onAddAnimeFromFriend({
                          title: rec.title,
                          mal_id: rec.id,
                          coverUrl: rec.imageUrl,
                          totalEpisodes: 12,
                        });
                      }
                    }}
                    className="p-2 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/5 hover:border-amber-500/50 transition-all cursor-pointer group flex flex-col justify-between gap-1.5 shadow-sm"
                    title={`Clique para explorar ${rec.title}`}
                  >
                    <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-black border border-white/5 shadow-inner">
                      <img
                        src={rec.imageUrl}
                        alt={rec.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-200 line-clamp-2 leading-tight group-hover:text-amber-300 transition-colors">
                      {rec.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ÚLTIMA SEÇÃO: Links Rápidos de Fichas Oficiais (Linha Compacta Otimizada) */}
          <div className="pt-2 pb-1 border-t border-white/5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mr-1">Fichas Oficiais:</span>
            {anime.mal_id ? (
              <a
                href={`https://myanimelist.net/anime/${anime.mal_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
              >
                <span>MyAnimeList</span>
                <ExternalLink className="w-2.5 h-2.5 text-zinc-400" />
              </a>
            ) : null}
            {anime.mal_id ? (
              <a
                href={`https://shikimori.one/animes/${anime.mal_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
              >
                <span>Shikimori</span>
                <ExternalLink className="w-2.5 h-2.5 text-zinc-400" />
              </a>
            ) : null}
            <a
              href={`https://anilist.co/search/anime?search=${encodeURIComponent(anime.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
            >
              <span>AniList</span>
              <ExternalLink className="w-2.5 h-2.5 text-zinc-400" />
            </a>
          </div>
        </div>

        {/* Rodapé de Ações Fixo e Compacto */}
        <div className="py-2 px-3 sm:px-4 bg-zinc-950 border-t border-white/10 flex items-center justify-between gap-2 flex-shrink-0 min-h-[42px]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-500/30 whitespace-nowrap">
              <Check className="w-3 h-3 shrink-0" />
              <span>No seu acervo</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isOwner && onOpenInTracker && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInTracker(anime.id);
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors cursor-pointer"
              >
                Ver no Rastreador
              </button>
            )}

            {!isOwner && onAddAnimeFromFriend && (
              <button
                type="button"
                onClick={() => {
                  onAddAnimeFromFriend({
                    title: anime.title,
                    mal_id: anime.mal_id,
                    coverUrl: anime.coverUrl,
                    bannerUrl: effectiveBanner || anime.bannerUrl,
                    trailerUrl: effectiveTrailer || anime.trailerUrl,
                    totalEpisodes: anime.totalEpisodes,
                    format: anime.format,
                    genres: anime.genres,
                    synopsis: anime.synopsis,
                    year: anime.year,
                    studio: anime.studio,
                  });
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors cursor-pointer"
              >
                Adicionar à Minha Lista
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium text-xs transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
