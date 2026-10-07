import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Star,
  Plus,
  Flame,
  Tv,
  CheckCircle2,
} from 'lucide-react';
import type { Anime } from '../../types';
import type { UserProfile } from '../../services/profileService';
import { calculateCompatibilityScore } from '../../services/communityService';
import { pairUserAnimeCollections } from '../../services/franchiseService';
import { HorizontalScrollContainer } from '../HorizontalScrollContainer';

export interface CollectionVersusModalProps {
  isOpen: boolean;
  onClose: () => void;
  myAnimes: Anime[];
  myProfile?: UserProfile | null;
  myUserName?: string;
  myAvatar?: string;
  friendAnimes?: Anime[];
  friendProfile?: UserProfile | null;
  friendUserName?: string;
  friendAvatar?: string;
  targetAnimes?: Anime[];
  targetProfile?: UserProfile | null;
  onAddAnimeToMyList?: (animeData: Partial<Anime>) => void;
  onAddAnimeFromFriend?: (anime: Anime | Partial<Anime>) => void;
  onOpenAnimeDetail?: (anime: Anime) => void;
}

type TabType = 'mutual' | 'equal' | 'diff' | 'friend_only' | 'my_only' | 'all';

interface VisualComparisonCard {
  id: string;
  title: string;
  japaneseTitle?: string;
  coverUrl?: string | null;
  genres?: string[];
  format?: string | null;
  year?: number | null;
  myAnime?: Anime | null;
  friendAnime?: Anime | null;
  myRating?: number | null;
  friendRating?: number | null;
  isEqual: boolean;
  isDiff: boolean;
  diffAmount: number;
  type: 'mutual' | 'friend_only' | 'my_only';
}

export const CollectionVersusModal: React.FC<CollectionVersusModalProps> = ({
  isOpen,
  onClose,
  myAnimes = [],
  myProfile = null,
  myUserName,
  myAvatar,
  friendAnimes,
  friendProfile,
  friendUserName,
  friendAvatar,
  targetAnimes,
  targetProfile,
  onAddAnimeToMyList,
  onAddAnimeFromFriend,
  onOpenAnimeDetail,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [inspectItem, setInspectItem] = useState<VisualComparisonCard | null>(null);

  const safeMyAnimes = useMemo(() => (Array.isArray(myAnimes) ? myAnimes : []), [myAnimes]);
  const safeFriendAnimes = useMemo(() => {
    if (Array.isArray(friendAnimes) && friendAnimes.length > 0) return friendAnimes;
    if (Array.isArray(targetAnimes) && targetAnimes.length > 0) return targetAnimes;
    return [];
  }, [friendAnimes, targetAnimes]);

  const myName = myUserName || myProfile?.publicUsername || 'Você';
  const myPic = myAvatar || myProfile?.customAvatarUrl || '';

  const friendName = friendUserName || friendProfile?.publicUsername || targetProfile?.publicUsername || 'Amigo';
  const friendPic = friendAvatar || friendProfile?.customAvatarUrl || targetProfile?.customAvatarUrl || '';

  // Afinidade calculada
  const affinity = useMemo(() => {
    return calculateCompatibilityScore(safeMyAnimes, safeFriendAnimes);
  }, [safeMyAnimes, safeFriendAnimes]);

  // Animação de contagem suave da porcentagem de 0 até o valor real
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setAnimatedScore(0);
      return;
    }

    setActiveTab('all');

    const target = affinity.scorePercent || 0;
    if (target === 0) {
      setAnimatedScore(0);
      return;
    }

    let start: number | null = null;
    const duration = 900;
    let animFrame: number;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic para contagem suave
      const ease = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(ease * target));

      if (progress < 1) {
        animFrame = requestAnimationFrame(animate);
      }
    };

    animFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrame);
  }, [isOpen, affinity.scorePercent]);

  const affinityLevel = useMemo(() => {
    const s = affinity.scorePercent;
    if (s >= 90) return 'Sintonia Máxima';
    if (s >= 75) return 'Alta Afinidade';
    if (s >= 55) return 'Boa Sintonia';
    if (s >= 35) return 'Gostos Mistos';
    return 'Gostos Opostos';
  }, [affinity.scorePercent]);

  // Indexação inteligente de todos os animes para criar a Galeria Visual (amarração de nós de franquia)
  const allCards = useMemo<VisualComparisonCard[]>(() => {
    const pairs = pairUserAnimeCollections(safeMyAnimes, safeFriendAnimes);
    const cards: VisualComparisonCard[] = [];

    for (const pair of pairs) {
      const base = pair.myAnime || pair.friendAnime;
      if (!base) continue;

      const hasMy = Boolean(pair.myAnime);
      const hasFriend = Boolean(pair.friendAnime);

      const myRating = pair.myAnime?.rating ?? null;
      const friendRating = pair.friendAnime?.rating ?? null;

      let isEqual = false;
      let isDiff = false;
      let diffAmount = 0;

      if (hasMy && hasFriend) {
        if (myRating !== null && friendRating !== null) {
          diffAmount = Math.abs(myRating - friendRating);
          if (diffAmount === 0) isEqual = true;
          else isDiff = true;
        }
      }

      let type: 'mutual' | 'friend_only' | 'my_only' = 'mutual';
      if (hasMy && !hasFriend) type = 'my_only';
      else if (!hasMy && hasFriend) type = 'friend_only';

      // No card mútuo, dá preferência ao título que você definiu; se só o amigo tem, usa o dele
      const cardTitle = pair.myAnime?.title || pair.friendAnime?.title || base.title;

      cards.push({
        id: base.id || base.title,
        title: cardTitle,
        japaneseTitle: base.japaneseTitle,
        coverUrl: pair.myAnime?.coverUrl || pair.friendAnime?.coverUrl,
        genres: pair.myAnime?.genres || pair.friendAnime?.genres,
        format: pair.myAnime?.format || pair.friendAnime?.format,
        year: pair.myAnime?.releaseYear || pair.friendAnime?.releaseYear,
        myAnime: pair.myAnime || null,
        friendAnime: pair.friendAnime || null,
        myRating,
        friendRating,
        isEqual,
        isDiff,
        diffAmount,
        type,
      });
    }

    // Ordena: notas iguais primeiro, depois divergências, depois alfabético
    return cards.sort((a, b) => {
      if (a.isEqual && !b.isEqual) return -1;
      if (!a.isEqual && b.isEqual) return 1;
      if (a.type === 'mutual' && b.type !== 'mutual') return -1;
      if (a.type !== 'mutual' && b.type === 'mutual') return 1;
      return a.title.localeCompare(b.title);
    });
  }, [safeMyAnimes, safeFriendAnimes]);

  // Contadores
  const counts = useMemo(() => {
    let mutual = 0;
    let equal = 0;
    let diff = 0;
    let friendOnly = 0;
    let myOnly = 0;

    for (const c of allCards) {
      if (c.type === 'mutual') {
        mutual++;
        if (c.isEqual) equal++;
        if (c.isDiff) diff++;
      } else if (c.type === 'friend_only') {
        friendOnly++;
      } else if (c.type === 'my_only') {
        myOnly++;
      }
    }

    return {
      all: allCards.length,
      mutual,
      equal,
      diff,
      friendOnly,
      myOnly,
    };
  }, [allCards]);

  // Filtragem
  const displayedCards = useMemo(() => {
    let list = allCards;

    if (activeTab === 'mutual') {
      list = list.filter((c) => c.type === 'mutual');
    } else if (activeTab === 'equal') {
      list = list.filter((c) => c.isEqual);
    } else if (activeTab === 'diff') {
      list = list.filter((c) => c.isDiff);
    } else if (activeTab === 'friend_only') {
      list = list.filter((c) => c.type === 'friend_only');
    } else if (activeTab === 'my_only') {
      list = list.filter((c) => c.type === 'my_only');
    }

    return list;
  }, [allCards, activeTab]);

  const handleAddAnime = (card: VisualComparisonCard, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = card.friendAnime;
    if (!target) return;

    setAddedIds((prev) => new Set([...prev, card.id]));

    if (onAddAnimeFromFriend) {
      onAddAnimeFromFriend(target);
    } else if (onAddAnimeToMyList) {
      onAddAnimeToMyList({
        title: target.title,
        originalTitle: target.originalTitle,
        japaneseTitle: target.japaneseTitle,
        coverUrl: target.coverUrl,
        bannerUrl: target.bannerUrl,
        synopsis: target.synopsis,
        genres: target.genres,
        format: target.format,
        studio: target.studio,
        releaseYear: target.releaseYear,
        totalEpisodes: target.totalEpisodes,
        status: 'plan_to_watch',
        currentEpisode: 0,
        season: 1,
        currentSeasonName: 'Temporada 1',
        seasons: target.seasons || [],
        mal_id: target.mal_id,
        franchiseIds: target.franchiseIds || [],
        franchiseTitle: target.franchiseTitle,
        notes: `Adicionado da lista de ${friendName}`,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="collection-versus-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/95 backdrop-blur-2xl animate-fadeIn"
      onClick={onClose}
    >
      <div
        id="collection-versus-modal-wrapper"
        className="relative w-full max-w-5xl h-[92vh] max-h-[880px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* =====================================================================
            BOTÃO DE FECHAR COMPACTO (Ajustado no safe-zone do topo sem encavalar)
           ===================================================================== */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3.5 right-1 sm:-top-4 sm:right-1.5 z-30 w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full bg-[#0d0d14] border border-white/25 text-slate-300 hover:text-white hover:border-white/50 shadow-xl flex items-center justify-center transition-all cursor-pointer"
          title="Fechar"
          aria-label="Fechar"
        >
          <X className="w-3 h-3 stroke-[2.5]" />
        </button>

        <div
          id="collection-versus-modal-card"
          className="relative w-full h-full bg-[#050508] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col text-slate-100 overflow-hidden"
        >
          {/* =====================================================================
              1. CABEÇALHO DO MODAL (Centralização matemática rígida 3 colunas)
             ===================================================================== */}
          <header className="h-14 px-3 sm:px-4 bg-black/85 border-b border-white/10 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-2 shrink-0 z-20">
            {/* Lado Esquerdo - VOCÊ (Verde) */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 pr-1">
              <div
                className="w-8 h-8 rounded-full ring-2 ring-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] overflow-hidden bg-slate-800 shrink-0"
                title={`Você (${myName})`}
              >
                {myPic ? (
                  <img src={myPic} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-black bg-emerald-950 text-emerald-300">
                    {myName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="text-[11px] sm:text-xs font-black text-white truncate max-w-[80px] sm:max-w-[125px]" title={myName}>
                  {myName}
                </span>
                <span className="text-[9px] font-black text-emerald-400 tracking-wider uppercase">
                  VOCÊ
                </span>
              </div>
            </div>

            {/* Centro - Badge Compacto Texturizado com Neon e Animação de Afinidade */}
            <div className="flex items-center justify-center shrink-0">
              <div
                className="relative px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border border-cyan-400/50 bg-[#070b14] shadow-[0_0_12px_rgba(6,182,212,0.25)] flex flex-col items-center justify-center overflow-hidden"
                style={{
                  backgroundImage:
                    'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.2), transparent 75%), repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 0, transparent 4px)',
                }}
              >
                <div className="relative z-10 flex items-center gap-1 leading-none">
                  <Flame className="w-3 h-3 text-cyan-400 fill-cyan-400/30 animate-pulse shrink-0" />
                  <span className="text-[11.5px] sm:text-xs font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-300 tracking-tight">
                    {animatedScore}%
                  </span>
                </div>
                <span className="relative z-10 text-[7px] font-black text-cyan-300/90 tracking-widest uppercase mt-0.5 leading-none">
                  {affinityLevel}
                </span>
              </div>
            </div>

            {/* Lado Direito - AMIGO (Vermelho) totalmente alinhado à direita com espaçamento do canto */}
            <div className="flex items-center justify-end gap-1.5 sm:gap-2 min-w-0 pl-1 pr-1 text-right">
              <div className="flex flex-col items-end min-w-0 leading-tight">
                <span className="text-[11px] sm:text-xs font-black text-white truncate max-w-[80px] sm:max-w-[125px]" title={friendName}>
                  {friendName}
                </span>
                <span className="text-[9px] font-black text-rose-400 tracking-wider uppercase">
                  AMIGO
                </span>
              </div>
              <div
                className="w-8 h-8 rounded-full ring-2 ring-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)] overflow-hidden bg-slate-800 shrink-0"
                title={`Amigo (${friendName})`}
              >
                {friendPic ? (
                  <img src={friendPic} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-black bg-rose-950 text-rose-300">
                    {friendName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* =====================================================================
              2. SEGMENTED FILTER BAR (Mais compacto verticalmente)
             ===================================================================== */}
          <div className="px-2.5 sm:px-4 py-1 bg-[#09090e] border-b border-white/5 shrink-0">
            <HorizontalScrollContainer scrollStep={140} autoCenterOnClick={true}>
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  activeTab === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                Todos ({counts.all})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('mutual')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  activeTab === 'mutual'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                Em Comum ({counts.mutual})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('equal')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  activeTab === 'equal'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                    : 'bg-white/5 text-slate-400 hover:text-amber-300'
                }`}
              >
                <Star className="w-3 h-3 fill-current" />
                Notas Iguais ({counts.equal})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('diff')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  activeTab === 'diff'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white/5 text-slate-400 hover:text-purple-300'
                }`}
              >
                Notas Diferentes ({counts.diff})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('friend_only')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  activeTab === 'friend_only'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white/5 text-slate-400 hover:text-emerald-300'
                }`}
              >
                <Plus className="w-3 h-3 stroke-[3]" />
                Só Ele Tem ({counts.friendOnly})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('my_only')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  activeTab === 'my_only'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-white/5 text-slate-400 hover:text-sky-300'
                }`}
              >
                Só Você Tem ({counts.myOnly})
              </button>
            </HorizontalScrollContainer>
          </div>

          {/* =====================================================================
              3. GALERIA VISUAL DE PÔSTERES (Cards Ricos, Modernos e Focados na Arte)
             ===================================================================== */}
          <main className="flex-1 overflow-y-auto px-2.5 pt-1.5 pb-3 sm:px-4 sm:pt-2 sm:pb-4 bg-[#030305]">
            {displayedCards.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                <Tv className="w-12 h-12 opacity-20 text-indigo-400" />
                <h4 className="text-sm font-bold text-white">Nenhum anime encontrado</h4>
                <p className="text-xs text-slate-500 max-w-xs">
                  Não há títulos cadastrados nesta categoria.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
                {displayedCards.map((card) => {
                  const isAdded = addedIds.has(card.id);

                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        if (onOpenAnimeDetail) {
                          const target = card.myAnime || card.friendAnime;
                          if (target) onOpenAnimeDetail(target);
                        } else {
                          setInspectItem(card);
                        }
                      }}
                      className={`group relative rounded-xl sm:rounded-2xl overflow-hidden bg-[#0d0d14] border transition-all duration-300 flex flex-col cursor-pointer select-none hover:-translate-y-1 hover:shadow-xl ${
                        card.isEqual
                          ? 'border-amber-500/40 hover:border-amber-400 hover:shadow-amber-500/10'
                          : card.isDiff
                          ? 'border-purple-500/30 hover:border-purple-400 hover:shadow-purple-500/10'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      {/* Imagem do Pôster Vertical */}
                      <div className="relative w-full aspect-[3/4.2] overflow-hidden bg-slate-950">
                        {card.coverUrl ? (
                          <img
                            src={card.coverUrl}
                            alt={card.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-900/60 p-2">
                            <Tv className="w-6 h-6 opacity-40 mb-1" />
                            <span className="text-[9px]">Sem pôster</span>
                          </div>
                        )}

                        {/* Gradiente sutil inferior para legibilidade perfeita do texto sem cobrir a imagem */}
                        <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/75 to-transparent pointer-events-none" />
                        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

                        {/* Selo Superior de Concordância ou Divergência */}
                        <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between gap-1 z-10 pointer-events-none">
                          {card.isEqual ? (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-amber-500 text-slate-950 shadow-md flex items-center gap-0.5 uppercase tracking-wider">
                              <Star className="w-2.5 h-2.5 fill-slate-950" />
                              <span>Mesma Nota</span>
                            </span>
                          ) : card.isDiff ? (
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-purple-600/90 text-white backdrop-blur-md shadow-md uppercase tracking-wider">
                              Δ {card.diffAmount.toFixed(1)}★
                            </span>
                          ) : card.type === 'friend_only' ? (
                            <span className="px-1.5 py-0.5 rounded-md text-[8.5px] font-bold bg-emerald-600/90 text-white backdrop-blur-md shadow-md uppercase tracking-wider">
                              Só o Amigo
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-md text-[8.5px] font-bold bg-sky-600/90 text-white backdrop-blur-md shadow-md uppercase tracking-wider">
                              Só Você
                            </span>
                          )}

                          {card.format && (
                            <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase bg-black/80 text-slate-300 border border-white/10">
                              {card.format}
                            </span>
                          )}
                        </div>

                        {/* Comparação das Duas Notas no Rodapé do Pôster - Micro tags compactas com fundo preto e bordas coloridas */}
                        <div className="absolute bottom-1.5 inset-x-1.5 z-10 flex items-center justify-between gap-1 pointer-events-none">
                          {/* Tag de Você (Verde) */}
                          <div className="px-1.5 py-0.5 rounded-md bg-black/90 border border-emerald-500/60 backdrop-blur-sm flex flex-col items-center justify-center shadow-md">
                            <span className="text-[7.5px] uppercase tracking-wider font-black text-emerald-400 leading-none">
                              Você
                            </span>
                            <span className="text-[10px] font-black leading-tight text-emerald-300 flex items-center gap-0.5 mt-0.5">
                              {card.myRating !== null ? (
                                <>
                                  <span>{card.myRating}</span>
                                  <Star className="w-2.5 h-2.5 fill-emerald-400 text-emerald-400 inline" />
                                </>
                              ) : card.myAnime ? (
                                <span className="text-[7.5px] text-emerald-400/80 font-bold">Sem nota</span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </span>
                          </div>

                          {/* Tag do Amigo (Vermelha) */}
                          <div className="px-1.5 py-0.5 rounded-md bg-black/90 border border-rose-500/60 backdrop-blur-sm flex flex-col items-center justify-center shadow-md">
                            <span className="text-[7.5px] uppercase tracking-wider font-black text-rose-400 leading-none">
                              Amigo
                            </span>
                            <span className="text-[10px] font-black leading-tight text-rose-300 flex items-center gap-0.5 mt-0.5">
                              {card.friendRating !== null ? (
                                <>
                                  <span>{card.friendRating}</span>
                                  <Star className="w-2.5 h-2.5 fill-rose-400 text-rose-400 inline" />
                                </>
                              ) : card.friendAnime ? (
                                <span className="text-[7.5px] text-rose-400/80 font-bold">Sem nota</span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Rodapé do Card com Título e Ação Rápida */}
                      <div className="p-2 sm:p-2.5 flex flex-col justify-between flex-1 gap-1.5 bg-[#0a0a10]">
                        <div className="min-w-0">
                          <h4
                            className="text-xs font-bold text-white line-clamp-1 group-hover:text-indigo-400 transition-colors"
                            title={card.title}
                          >
                            {card.title}
                          </h4>
                          {card.myAnime && card.friendAnime && card.myAnime.title.trim().toLowerCase() !== card.friendAnime.title.trim().toLowerCase() && (
                            <span
                              className="text-[9px] text-slate-400 truncate block font-normal leading-tight mt-0.5"
                              title={`Título no amigo: ${card.friendAnime.title}`}
                            >
                              {friendName}: {card.friendAnime.title}
                            </span>
                          )}
                        </div>

                        {/* Botão de Adição se você não tiver */}
                        {!card.myAnime && (
                          <div className="pt-1 border-t border-white/5">
                            {isAdded ? (
                              <div className="w-full py-1 text-center text-[10px] font-bold text-emerald-400 flex items-center justify-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Na sua lista</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleAddAnime(card, e)}
                                className="w-full py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-[10.5px] font-black flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                              >
                                <Plus className="w-3 h-3 stroke-[3]" />
                                <span>Adicionar</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

        {/* =====================================================================
            4. MINI SHEET DE INSPEÇÃO (Quando clica num anime caso não use detail modal)
           ===================================================================== */}
        {inspectItem && !onOpenAnimeDetail && (
          <div
            className="absolute inset-x-0 bottom-0 bg-black/95 border-t border-white/20 p-4 sm:p-5 z-30 shadow-2xl animate-slideUp flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 min-w-0">
              {inspectItem.coverUrl && (
                <img
                  src={inspectItem.coverUrl}
                  alt=""
                  className="w-12 h-16 object-cover rounded-lg shrink-0 border border-white/10"
                />
              )}
              <div className="min-w-0">
                <h4 className="text-sm sm:text-base font-bold text-white truncate">
                  {inspectItem.title}
                </h4>
                {inspectItem.myAnime && inspectItem.friendAnime && inspectItem.myAnime.title.trim().toLowerCase() !== inspectItem.friendAnime.title.trim().toLowerCase() && (
                  <span className="text-[11px] text-slate-400 block truncate">
                    ({friendName}: {inspectItem.friendAnime.title})
                  </span>
                )}
                <div className="flex items-center gap-3 text-xs mt-1 text-slate-300">
                  <span>
                    Sua nota:{' '}
                    <b className="text-indigo-400">
                      {inspectItem.myRating ? `${inspectItem.myRating}★` : '—'}
                    </b>
                  </span>
                  <span>
                    Nota de {friendName}:{' '}
                    <b className="text-purple-400">
                      {inspectItem.friendRating ? `${inspectItem.friendRating}★` : '—'}
                    </b>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {!inspectItem.myAnime && (
                <button
                  type="button"
                  onClick={(e) => handleAddAnime(inspectItem, e)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Adicionar à minha lista</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
