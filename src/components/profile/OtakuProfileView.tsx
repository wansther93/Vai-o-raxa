import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Crown,
  Edit3,
  Share2,
  Tv,
  Film,
  Clock,
  Star,
  CheckCircle2,
  BarChart2,
  Award,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  MessageSquare,
  Users,
  Swords,
  Search,
  Camera,
  Heart,
  ExternalLink,
  ShieldCheck,
  Flame,
  UserPlus,
  UserCheck,
  ArrowRight,
  Info,
  Trash2,
  RefreshCw,
  Feather,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
  Compass,
} from 'lucide-react';
import { STATUS_CONFIG, type Anime, type AnimeStatus } from '../../types';
import type { UserProfile } from '../../services/profileService';
import {
  calculateUserAchievements,
  getAnimeWatchedEpisodes,
} from '../../services/achievementService';
import {
  followUser,
  unfollowUser,
  getFollowedUsers,
  getFollowedUserProfiles,
  getFollowerProfiles,
  searchUserProfilesByQuery,
  getUserProfileByUsername,
  getUserProfile,
  getCommunityPopularProfiles,
  isDeveloperEmail,
} from '../../services/profileService';
import { getPublicUserAnimes } from '../../services/animeService';
import { HexBadge, type BadgeTone } from './HexBadge';
import { Top5Podium } from './Top5Podium';
import { EditTop5Modal } from './EditTop5Modal';
import { EditProfileModal } from './EditProfileModal';
import { BadgesShowcaseModal } from './BadgesShowcaseModal';
import { WriteReviewModal } from './WriteReviewModal';
import { CollectionVersusModal } from '../social/CollectionVersusModal';
import { CollectionAnimeModal } from './CollectionAnimeModal';
import { prefetchUserCollectionMetadata } from '../../services/animeMetadataService';
import {
  type CommunityReview,
  deleteCommunityReview,
  getRecentReviews,
} from '../../services/communityService';
import { auth } from '../../lib/firebase';
import { copyToClipboard } from '../../lib/clipboard';

export interface OtakuProfileViewProps {
  profile: UserProfile | null;
  animes: Anime[];
  isOwner: boolean;
  currentUserId?: string;
  myAnimes?: Anime[];
  reviews: CommunityReview[];
  onOpenAnimeDetail?: (anime: Anime) => void;
  onUpdateProfile?: (updated: Partial<UserProfile>) => Promise<void>;
  onReviewCreated?: (review: CommunityReview) => void;
  onReviewDeleted?: (reviewId: string) => void;
  onOpenStatsDetail?: () => void;
  onOpenPublicProfile?: (usernameOrId: string) => void;
  onAddAnimeFromFriend?: (prefill: Partial<Anime>) => void;
  onOpenEditProfile?: () => void;
}

export const OtakuProfileView: React.FC<OtakuProfileViewProps> = ({
  profile,
  animes,
  isOwner,
  currentUserId,
  myAnimes = [],
  reviews,
  onOpenAnimeDetail,
  onUpdateProfile,
  onReviewCreated,
  onReviewDeleted,
  onOpenStatsDetail,
  onOpenPublicProfile,
  onAddAnimeFromFriend,
  onOpenEditProfile,
}) => {
  // Aba Superior: 'profile' (Meu Perfil) | 'feed' (Feed da Comunidade) | 'friends' (Amigos & Conexões)
  const [activeMainTab, setActiveMainTab] = useState<'profile' | 'feed' | 'friends'>('profile');

  // Estado de Visita a Perfil de Amigo / Terceiro
  const [visitedProfile, setVisitedProfile] = useState<UserProfile | null>(null);
  const [visitedAnimes, setVisitedAnimes] = useState<Anime[]>([]);
  const [isLoadingVisited, setIsLoadingVisited] = useState(false);
  const [visitedError, setVisitedError] = useState<string | null>(null);

  // Amigos / Conexões (Central Social Flutuante no Preto Profundo)
  const [friendsViewMode, setFriendsViewMode] = useState<'hub' | 'following_list' | 'followers_list'>('hub');
  const [followingList, setFollowingList] = useState<string[]>(() => {
    return currentUserId ? getFollowedUsers(currentUserId) : [];
  });
  const [followedProfiles, setFollowedProfiles] = useState<UserProfile[]>([]);
  const [isLoadingFollowed, setIsLoadingFollowed] = useState(false);
  const [followerProfiles, setFollowerProfiles] = useState<UserProfile[]>([]);
  const [isLoadingFollowers, setIsLoadingFollowers] = useState(false);
  const [popularMembers, setPopularMembers] = useState<UserProfile[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isSearchingMember, setIsSearchingMember] = useState(false);
  const [searchResults, setSearchResults] = useState<UserProfile[] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Modais
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isEditTop5Open, setIsEditTop5Open] = useState(false);
  const [isBadgesModalOpen, setIsBadgesModalOpen] = useState(false);
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);
  const [isVersusModalOpen, setIsVersusModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedCollectionAnime, setSelectedCollectionAnime] = useState<Anime | null>(null);

  // Feed & Resenhas (WAnime + AniList + MAL)
  const [currentReviews, setCurrentReviews] = useState<CommunityReview[]>(reviews);
  const [feedMode, setFeedMode] = useState<'all' | 'mine'>('all');
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [reviewToDelete, setReviewToDelete] = useState<CommunityReview | null>(null);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [selectedFullReview, setSelectedFullReview] = useState<CommunityReview | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});
  const [likedReviews, setLikedReviews] = useState<Record<string, boolean>>({});
  const [reviewLikesCount, setReviewLikesCount] = useState<Record<string, number>>({});

  useEffect(() => {
    setCurrentReviews(reviews);
  }, [reviews]);

  const effectiveUserId = auth.currentUser?.uid || currentUserId || profile?.userId;
  const effectiveUsername = (profile?.publicUsername || '').toLowerCase().replace(/^@/, '');

  const checkIsMyReview = useCallback(
    (rev: CommunityReview) => {
      if (effectiveUserId && rev.userId === effectiveUserId) return true;
      if (effectiveUsername && rev.userNick && rev.userNick.toLowerCase().replace(/^@/, '') === effectiveUsername) return true;
      if (effectiveUsername && rev.userDisplayName?.toLowerCase() === effectiveUsername) return true;
      return false;
    },
    [effectiveUserId, effectiveUsername]
  );

  const myReviewsCount = useMemo(() => {
    return currentReviews.filter(checkIsMyReview).length;
  }, [currentReviews, checkIsMyReview]);

  const displayedFeedReviews = useMemo(() => {
    if (feedMode === 'mine') {
      return currentReviews.filter(checkIsMyReview);
    }
    return currentReviews;
  }, [currentReviews, feedMode, checkIsMyReview]);

  const handleConfirmDeleteReview = async () => {
    if (!reviewToDelete) return;
    setIsDeletingReview(true);
    try {
      await deleteCommunityReview(reviewToDelete.id);
      setCurrentReviews((prev) => prev.filter((r) => r.id !== reviewToDelete.id));
      if (onReviewDeleted) {
        onReviewDeleted(reviewToDelete.id);
      }
      setReviewToDelete(null);
    } catch (err) {
      console.error('Erro ao excluir resenha:', err);
    } finally {
      setIsDeletingReview(false);
    }
  };

  const handleRefreshFeed = async () => {
    setIsRefreshingFeed(true);
    try {
      const fresh = await getRecentReviews(undefined, true);
      setCurrentReviews(fresh);
    } catch (err) {
      console.warn('Erro ao atualizar feed:', err);
    } finally {
      setIsRefreshingFeed(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      if (diffMinutes < 1) return 'agora';
      if (diffMinutes < 60) return `há ${diffMinutes}m`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `há ${diffHours}h`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `há ${diffDays}d`;
      return date.toLocaleDateString('pt-BR');
    } catch {
      return 'recente';
    }
  };

  const toggleSpoiler = (reviewId: string) => {
    setRevealedSpoilers((prev) => ({ ...prev, [reviewId]: !prev[reviewId] }));
  };

  const toggleExpandReview = (reviewId: string) => {
    setExpandedReviews((prev) => ({ ...prev, [reviewId]: !prev[reviewId] }));
  };

  const handleToggleLike = (reviewId: string, initialLikes = 0) => {
    setLikedReviews((prev) => {
      const currentlyLiked = Boolean(prev[reviewId]);
      const currentCount = reviewLikesCount[reviewId] ?? initialLikes;
      setReviewLikesCount((cnt) => ({
        ...cnt,
        [reviewId]: currentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1,
      }));
      return { ...prev, [reviewId]: !currentlyLiked };
    });
  };

  // Pré-carrega metadados silenciosamente em segundo plano a partir das APIs
  useEffect(() => {
    if (animes && animes.length > 0) {
      prefetchUserCollectionMetadata(animes);
    }
  }, [animes]);

  const handleOpenAnimeInfo = useCallback((targetAnime: Anime) => {
    setSelectedCollectionAnime(targetAnime);
  }, []);

  // Coleção Completa Expansível (minimizar/maximizar) e Filtro por Nome
  const [isCollectionExpanded, setIsCollectionExpanded] = useState(false);
  const collectionTopRef = useRef<HTMLDivElement>(null);
  const [collectionSearch, setCollectionSearch] = useState('');

  // Carrega lista de perfis seguidos
  const loadFollowedProfiles = useCallback(async () => {
    if (!followingList || followingList.length === 0) {
      setFollowedProfiles([]);
      return;
    }
    setIsLoadingFollowed(true);
    try {
      const data = await getFollowedUserProfiles(followingList);
      setFollowedProfiles(data);
    } catch (e) {
      console.warn('Erro ao carregar perfis seguidos:', e);
    } finally {
      setIsLoadingFollowed(false);
    }
  }, [followingList]);

  // Carrega lista de seguidores
  const loadFollowerProfilesList = useCallback(async () => {
    const targetUid = effectiveUserId;
    const targetNick = profile?.publicUsername;
    if (!targetUid && !targetNick) {
      setFollowerProfiles([]);
      return;
    }
    setIsLoadingFollowers(true);
    try {
      const followers = await getFollowerProfiles(targetUid || '', targetNick || '');
      setFollowerProfiles(followers);
    } catch (e) {
      console.warn('Erro ao carregar seguidores:', e);
    } finally {
      setIsLoadingFollowers(false);
    }
  }, [effectiveUserId, profile?.publicUsername]);

  // Carrega dados sociais ao abrir aba de amigos ou quando a lista de seguidos mudar
  useEffect(() => {
    getCommunityPopularProfiles().then(setPopularMembers).catch(console.warn);
  }, []);

  useEffect(() => {
    if (activeMainTab === 'friends') {
      loadFollowedProfiles();
      loadFollowerProfilesList();
    }
  }, [activeMainTab, loadFollowedProfiles, loadFollowerProfilesList]);

  // Seguir ou deixar de seguir a partir de qualquer card de amigo/seguidor
  const handleToggleFollowUser = async (targetUserIdOrNick: string) => {
    if (!currentUserId || !targetUserIdOrNick) return;
    const target = targetUserIdOrNick.trim().toLowerCase().replace(/^@/, '');
    const isCurrentlyFollowing = followingList.includes(target);
    if (isCurrentlyFollowing) {
      const updated = await unfollowUser(currentUserId, target);
      setFollowingList(updated);
    } else {
      const updated = await followUser(currentUserId, target);
      setFollowingList(updated);
    }
  };

  // Perfil e animes atualmente em exibição (Meu perfil ou Perfil Visitado)
  const isVisiting = Boolean(visitedProfile);
  const currentDisplayedProfile = visitedProfile || profile;
  const currentDisplayedAnimes = visitedProfile ? visitedAnimes : animes;
  const effectiveIsOwner = isOwner && !isVisiting;

  // Auto-centralização da aba "Perfil de @[amigo]" ao entrar no perfil do amigo
  const visitingTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isVisiting && visitingTabRef.current) {
      const timer = setTimeout(() => {
        visitingTabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [isVisiting, visitedProfile?.userId]);

  // Verificação de Desenvolvedor / Admin restrita estritamente à conta oficial
  const isDevAdmin = useMemo(() => {
    return isDeveloperEmail(currentDisplayedProfile?.email);
  }, [currentDisplayedProfile]);

  // Abertura unificada do modal de edição
  const handleOpenEdit = () => {
    if (onOpenEditProfile) {
      onOpenEditProfile();
    } else {
      setIsEditProfileOpen(true);
    }
  };

  // Visitar perfil de outro usuário (priorizando userId como chave primária definitiva)
  const handleVisitUser = async (targetUsernameOrId: string) => {
    if (!targetUsernameOrId) return;
    const rawTarget = targetUsernameOrId.trim();
    const clean = rawTarget.toLowerCase().replace(/^@/, '');
    const myNick = (profile?.publicUsername || '').trim().toLowerCase().replace(/^@/, '');

    // Se for o próprio usuário, apenas volta ao perfil próprio
    if (rawTarget === currentUserId || clean === myNick || clean === (currentUserId || '').toLowerCase()) {
      setVisitedProfile(null);
      setVisitedAnimes([]);
      setActiveMainTab('profile');
      return;
    }

    setIsLoadingVisited(true);
    setVisitedError(null);
    try {
      // 1. Chave primária obrigatória: tenta carregar diretamente por userId único
      let targetProf = await getUserProfile(rawTarget);

      // 2. Se não encontrar pelo UID, busca por username como fallback
      if (!targetProf) {
        targetProf = await getUserProfileByUsername(clean);
      }
      if (!targetProf && rawTarget !== clean) {
        targetProf = await getUserProfile(clean);
      }

      if (targetProf) {
        setVisitedProfile(targetProf);
        const animesData = await getPublicUserAnimes(targetProf.userId || rawTarget);
        setVisitedAnimes(animesData);
        setActiveMainTab('profile');
      } else {
        setVisitedError(`Nenhum perfil público encontrado para "${rawTarget}".`);
      }
    } catch (err) {
      console.error('Erro ao buscar perfil do usuário:', err);
      setVisitedError('Não foi possível carregar os dados deste usuário.');
    } finally {
      setIsLoadingVisited(false);
    }
  };

  const handleReturnToMyProfile = () => {
    setVisitedProfile(null);
    setVisitedAnimes([]);
    setVisitedError(null);
    setActiveMainTab('profile');
  };

  // Executa busca global flexível por nicks parecidos
  const handleExecuteSearch = async () => {
    const q = memberSearchQuery.trim();
    if (!q) {
      setSearchResults(null);
      setHasSearched(false);
      return;
    }
    setIsSearchingMember(true);
    setVisitedError(null);
    try {
      const results = await searchUserProfilesByQuery(q, effectiveUserId);
      setSearchResults(results);
      setHasSearched(true);
    } catch (err) {
      console.warn('Erro ao pesquisar membros:', err);
      setVisitedError('Erro ao consultar membros na rede.');
    } finally {
      setIsSearchingMember(false);
    }
  };

  const handleClearSearch = () => {
    setMemberSearchQuery('');
    setSearchResults(null);
    setHasSearched(false);
    setVisitedError(null);
  };

  // Seguir / Deixar de seguir
  const isFollowingCurrent = useMemo(() => {
    if (!currentDisplayedProfile) return false;
    const target = (currentDisplayedProfile.publicUsername || currentDisplayedProfile.userId || '')
      .toLowerCase()
      .replace(/^@/, '');
    return followingList.includes(target);
  }, [followingList, currentDisplayedProfile]);

  const handleToggleFollow = async () => {
    if (!currentUserId || !currentDisplayedProfile) return;
    const target = (currentDisplayedProfile.publicUsername || currentDisplayedProfile.userId || '')
      .toLowerCase()
      .replace(/^@/, '');
    if (isFollowingCurrent) {
      const updated = await unfollowUser(currentUserId, target);
      setFollowingList(updated);
    } else {
      const updated = await followUser(currentUserId, target);
      setFollowingList(updated);
    }
  };

  // Filtragem e busca da aba de amigos e conexões
  const filteredFollowedProfiles = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return followedProfiles;
    return followedProfiles.filter((p) => {
      const nick = (p.publicUsername || '').toLowerCase().replace(/^@/, '');
      const uid = (p.userId || '').toLowerCase();
      const title = (p.honoraryTitle || '').toLowerCase();
      return nick.includes(q) || uid.includes(q) || title.includes(q);
    });
  }, [followedProfiles, memberSearchQuery]);

  const filteredFollowerProfiles = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return followerProfiles;
    return followerProfiles.filter((p) => {
      const nick = (p.publicUsername || '').toLowerCase().replace(/^@/, '');
      const uid = (p.userId || '').toLowerCase();
      const title = (p.honoraryTitle || '').toLowerCase();
      return nick.includes(q) || uid.includes(q) || title.includes(q);
    });
  }, [followerProfiles, memberSearchQuery]);

  const filteredDiscoverProfiles = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) return popularMembers;
    return popularMembers.filter((p) => {
      const nick = (p.publicUsername || '').toLowerCase().replace(/^@/, '');
      const uid = (p.userId || '').toLowerCase();
      const title = (p.honoraryTitle || '').toLowerCase();
      return nick.includes(q) || uid.includes(q) || title.includes(q);
    });
  }, [popularMembers, memberSearchQuery]);

  // 1. Estatísticas Otaku Reais (Calculadas com precisão matemática absoluta)
  const stats = useMemo(() => {
    const list = currentDisplayedAnimes;
    const totalAnimes = list.length;
    let totalEps = 0;
    let ratedCount = 0;
    let scoreSum = 0;
    let completedCount = 0;
    let watchingCount = 0;

    list.forEach((a) => {
      totalEps += getAnimeWatchedEpisodes(a);
      if (typeof a.rating === 'number' && a.rating > 0) {
        scoreSum += a.rating;
        ratedCount++;
      }
      if (a.status === 'completed') completedCount++;
      if (a.status === 'watching' || a.status === 'waiting_new_episodes') watchingCount++;
    });

    const totalMinutes = Math.round(totalEps * 23.5);
    const days = Math.floor(totalMinutes / (24 * 60));
    const remainingHours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const totalHours = Math.round(totalMinutes / 60);

    const formattedTime = days > 0 
      ? `${days}d ${remainingHours}h`
      : `${totalHours}h`;

    const meanScore = ratedCount > 0 ? (scoreSum / ratedCount).toFixed(1) : '—';
    const completedPercent = totalAnimes > 0 ? ((completedCount / totalAnimes) * 100).toFixed(0) : '0';
    const watchingPercent = totalAnimes > 0 ? ((watchingCount / totalAnimes) * 100).toFixed(0) : '0';

    return {
      totalAnimes,
      totalEps,
      days,
      remainingHours,
      totalHours,
      formattedTime,
      meanScore,
      completedCount,
      completedPercent,
      watchingCount,
      watchingPercent,
    };
  }, [currentDisplayedAnimes]);

  // 2. Animes do Top 5
  const top5Animes = useMemo(() => {
    const ids =
      (currentDisplayedProfile as any)?.top5AnimeIds ||
      currentDisplayedProfile?.favoriteAnimeIds ||
      [];
    const list: (Anime | null)[] = [null, null, null, null, null];

    ids.slice(0, 5).forEach((id: string, index: number) => {
      const found = currentDisplayedAnimes.find((a) => a.id === id);
      if (found) list[index] = found;
    });

    // Se nenhum estiver preenchido, sugere os melhores da coleção
    if (list.every((item) => item === null) && currentDisplayedAnimes.length > 0) {
      const sorted = [...currentDisplayedAnimes]
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 5);
      sorted.forEach((item, index) => {
        list[index] = item;
      });
    }

    return list;
  }, [currentDisplayedProfile, currentDisplayedAnimes]);

  // 3. Conquistas & Insígnias (Estritamente 5 slots, SEM preenchimento automático)
  const { allAchievements, slotBadges } = useMemo(() => {
    const effectiveEmail = currentDisplayedProfile?.email || profile?.email;
    const result = calculateUserAchievements(currentDisplayedAnimes, effectiveEmail);
    const calculated = result.achievements;
    const featured = currentDisplayedProfile?.featuredBadges || [];

    // Mapeia EXATAMENTE 5 slots (0 a 4). Sem auto-fill!
    const slots = [0, 1, 2, 3, 4].map((index) => {
      const badgeId = featured[index];
      if (!badgeId) return null;
      const ach = calculated.find((a) => a.id === badgeId && a.isUnlocked);
      return ach || null;
    });

    return {
      allAchievements: calculated,
      slotBadges: slots,
    };
  }, [currentDisplayedAnimes, currentDisplayedProfile]);

  // 4. Resenhas Filtradas
  const myReviews = useMemo(() => {
    const nick = (currentDisplayedProfile?.publicUsername || '').toLowerCase().replace(/^@/, '');
    const uid = currentDisplayedProfile?.userId;
    return reviews.filter(
      (r) =>
        (r.userNick && r.userNick.toLowerCase().replace(/^@/, '') === nick) ||
        (uid && r.userId === uid)
    );
  }, [reviews, currentDisplayedProfile]);

  // 5. Coleção Filtrada (Apenas busca pelo nome e filtro 'Todos')
  const filteredCollection = useMemo(() => {
    if (!collectionSearch.trim()) return currentDisplayedAnimes;
    const q = collectionSearch.toLowerCase();
    return currentDisplayedAnimes.filter((a) => a.title.toLowerCase().includes(q));
  }, [currentDisplayedAnimes, collectionSearch]);

  // Função para desequipar uma insígnia dos 5 slots do perfil
  const handleUnequipBadge = async (badgeId: string) => {
    if (!effectiveIsOwner || !onUpdateProfile) return;
    const current = (currentDisplayedProfile?.featuredBadges || []).filter((id) => id !== badgeId);
    await onUpdateProfile({
      ...profile,
      featuredBadges: current,
    });
  };

  // Helper para tag de status padronizada exatamente como na aba de lista
  const getAnimeStatusMeta = (status: AnimeStatus) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.plan_to_watch;
    return {
      label: config.shortLabel || config.label,
      badgeBg: config.badgeBg,
    };
  };

  // Copiar link do perfil
  const handleShareProfile = async () => {
    const nick =
      currentDisplayedProfile?.publicUsername ||
      currentDisplayedProfile?.userId ||
      currentUserId ||
      '';
    const shareUrl = `${window.location.origin}/?share=${encodeURIComponent(nick)}`;
    await copyToClipboard(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const getBadgeTone = (tier: string): BadgeTone => {
    switch (tier) {
      case 'diamond':
        return 'cyan';
      case 'platinum':
        return 'purple';
      case 'gold':
        return 'gold';
      case 'silver':
        return 'blue';
      default:
        return 'amber';
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 pb-24 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* NAVEGAÇÃO SUPERIOR: SEPARAÇÃO MEU PERFIL vs FEED DA COMUNIDADE vs AMIGOS */}
      {/* ========================================================================= */}
      <div className="relative w-full rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 shadow-xl overflow-hidden p-1.5">
        {/* Indicadores de Rolagem com Degradê sutil nas extremidades */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-black via-black/60 to-transparent z-10 rounded-l-2xl" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-black via-black/60 to-transparent z-10 rounded-r-2xl" />

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth px-2 py-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              if (isVisiting) handleReturnToMyProfile();
              setActiveMainTab('profile');
            }}
            className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer select-none shrink-0 ${
              activeMainTab === 'profile' && !isVisiting
                ? 'bg-white/10 text-amber-300 border border-amber-400/40 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Crown className="w-4 h-4 text-amber-400" />
            <span>Meu Perfil</span>
          </button>

          {isVisiting && (
            <button
              ref={visitingTabRef}
              type="button"
              onClick={(e) => {
                e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                setActiveMainTab('profile');
              }}
              className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer select-none shrink-0 ${
                activeMainTab === 'profile'
                  ? 'bg-white/10 text-amber-300 border border-amber-400/40 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Users className="w-4 h-4 text-amber-400" />
              <span>Perfil de @{currentDisplayedProfile?.publicUsername || 'Visitante'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              if (isVisiting) handleReturnToMyProfile();
              setActiveMainTab('feed');
            }}
            className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer select-none shrink-0 ${
              activeMainTab === 'feed'
                ? 'bg-white/10 text-amber-300 border border-amber-400/40 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-amber-400" />
            <span>Feed da Comunidade</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              if (isVisiting) handleReturnToMyProfile();
              setActiveMainTab('friends');
            }}
            className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer select-none shrink-0 ${
              activeMainTab === 'friends'
                ? 'bg-white/10 text-amber-300 border border-amber-400/40 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>Amigos & Conexões</span>
          </button>
        </div>
      </div>

      {/* Erro de busca de perfil */}
      {visitedError && (
        <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>{visitedError}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 1: VISUALIZAÇÃO DO PERFIL (MEU PERFIL OU PERFIL VISITADO) */}
      {/* ========================================================================= */}
      {activeMainTab === 'profile' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* ========================================================================= */}
          {/* 1. CABEÇALHO UNIFICADO: BANNER PANORÂMICO NATURAL + IDENTIDADE INTEGRADA */}
          {/* ========================================================================= */}
          <div className="w-full bg-black border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative">
            {/* Banner com Proporção Natural (Permite ver a arte completa sem cortes forçados) */}
            <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-72 sm:max-h-80 overflow-hidden bg-black">
              {currentDisplayedProfile?.customBannerUrl ? (
                <img
                  src={currentDisplayedProfile.customBannerUrl}
                  alt="Banner do Perfil"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                  className="w-full h-full object-cover object-center brightness-100"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-neutral-950 via-black to-neutral-950 flex items-center justify-center text-slate-600 text-xs" />
              )}

              {/* Sombra suave com degradê cobrindo os 20% inferiores do banner para fundir no fundo preto sem divisão */}
              <div className="absolute bottom-0 inset-x-0 h-[20%] bg-gradient-to-b from-transparent via-black/50 to-black pointer-events-none z-10" />

              {/* Botão de Compartilhar: Apenas ícone verde neon sutil e chamativo no topo direito do banner */}
              <button
                type="button"
                id="btn-share-profile-banner"
                onClick={handleShareProfile}
                title="Compartilhar Perfil"
                className="absolute top-3.5 right-3.5 z-20 p-1.5 text-emerald-400 hover:text-emerald-300 transition-transform active:scale-90 hover:scale-110 cursor-pointer drop-shadow-[0_2px_10px_rgba(52,211,153,0.85)] select-none"
              >
                <Share2 className="w-5 h-5 stroke-[2.2]" />
              </button>

              {/* Toast de Link Copiado */}
              {copiedLink && (
                <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs shadow-2xl animate-in fade-in">
                  Link copiado com sucesso!
                </div>
              )}
            </div>

            {/* Bloco de Informações Compacto e Integrado: Clicável para edição quando dono do perfil */}
            <div
              onClick={effectiveIsOwner ? handleOpenEdit : undefined}
              role={effectiveIsOwner ? 'button' : undefined}
              tabIndex={effectiveIsOwner ? 0 : undefined}
              onKeyDown={(e) => {
                if (effectiveIsOwner && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleOpenEdit();
                }
              }}
              title={effectiveIsOwner ? 'Clique para editar seu perfil' : undefined}
              className={`px-4 sm:px-6 pb-5 pt-1 relative bg-black transition-colors ${
                effectiveIsOwner
                  ? 'cursor-pointer hover:bg-neutral-950/60 group/profileCard select-none'
                  : ''
              }`}
            >
              {/* Estrutura Compacta: Avatar Flutuante à esquerda + Informações imediatamente ao lado */}
              <div className="flex flex-row items-start gap-3.5 sm:gap-5 -mt-10 sm:-mt-12 relative z-20">
                {/* Avatar Circular Flutuante com Glow Dourado (z-20 garante nitidez total e sem corte/sombra) */}
                <div className="relative shrink-0">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-26 md:h-26 rounded-full p-1 bg-gradient-to-tr from-amber-400 via-yellow-500 to-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
                    <div className="w-full h-full rounded-full overflow-hidden bg-black relative">
                      {currentDisplayedProfile?.customAvatarUrl ? (
                        <img
                          src={currentDisplayedProfile.customAvatarUrl}
                          alt={currentDisplayedProfile.publicUsername || 'Avatar'}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 font-black text-2xl">
                          {(currentDisplayedProfile?.publicUsername || 'O').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conteúdo ao lado do Avatar: Linha 1 (@Nick + Tag), Linha 2 (Título de Honra), Linha 3 (Bio) */}
                <div className="pt-2 min-w-0 flex-1 flex flex-col justify-center">
                  {/* Linha 1: Apenas @Nick (sem duplicidade) + Slot Padronizado de Tag */}
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h1 className="text-base sm:text-xl md:text-2xl font-black text-white tracking-tight truncate">
                      @{currentDisplayedProfile?.publicUsername?.replace(/^@/, '') || 'Otaku'}
                    </h1>

                    {/* Slot de Tag Padronizado (proporção fixa h-6 para simetria com futuras tags de usuários) */}
                    {isDevAdmin && (
                      <div className="h-6 inline-flex items-center gap-1 px-2.5 rounded-full bg-purple-500/20 border border-purple-400/50 text-purple-300 text-[10px] font-black tracking-wider uppercase shadow-[0_0_10px_rgba(168,85,247,0.3)] shrink-0 select-none">
                        <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                        <span>DEV / ADMIN</span>
                      </div>
                    )}
                  </div>

                  {/* Linha 2: Título de Honra com a Coroa */}
                  <div className="mt-0.5 flex items-center gap-1.5 text-amber-400 text-xs sm:text-sm font-bold truncate">
                    <Crown className="w-3.5 h-3.5 fill-amber-400 shrink-0" />
                    <span className="truncate">{currentDisplayedProfile?.honoraryTitle || 'Viajante dos Animes'}</span>
                  </div>

                  {/* Linha 3: Biografia fluida logo abaixo */}
                  <p className="mt-1.5 text-xs text-slate-300 leading-relaxed line-clamp-3">
                    {currentDisplayedProfile?.publicBio ||
                      'Animes, boas histórias e grandes emoções. Esse é o meu mundo.'}
                  </p>

                  {/* Botões de Ação para Visitantes (Seguir e Comparar Listas) */}
                  {!effectiveIsOwner && (
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFollow();
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 shadow-md ${
                          isFollowingCurrent
                            ? 'bg-white/10 text-slate-300 border border-white/20 hover:border-red-400'
                            : 'bg-amber-400 text-slate-950 shadow-amber-400/20 hover:bg-amber-300'
                        }`}
                      >
                        {isFollowingCurrent ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                        <span>{isFollowingCurrent ? 'Seguindo' : 'Seguir'}</span>
                      </button>

                      <button
                        type="button"
                        id="btn-compare-lists-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsVersusModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-300 text-xs font-black transition-all active:scale-95 shadow-md shadow-amber-400/10"
                      >
                        <Swords className="w-3.5 h-3.5 text-amber-400" />
                        <span>Comparar Listas</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 2. ESTATÍSTICAS DO PERFIL COMPACTAS (3 INFORMAÇÕES ESSENCIAIS + LINK) */}
          {/* ========================================================================= */}
          <div
            id="container-profile-stats"
            className="w-full bg-black border border-white/10 rounded-2xl py-3 px-4 sm:px-6 shadow-2xl relative space-y-2.5 transition-all duration-300"
          >
            {/* Cabeçalho da Seção de Estatísticas: Ícone e Título Centralizados no Topo */}
            <div className="w-full flex items-center justify-center gap-2 pb-1.5 border-b border-white/5">
              <div className="w-5 h-5 rounded-md bg-amber-400/10 border border-amber-400/25 flex items-center justify-center text-amber-400 shrink-0">
                <BarChart2 className="w-3 h-3" />
              </div>
              <h3 className="text-xs font-bold text-white tracking-wide uppercase">
                Estatísticas
              </h3>
            </div>

            {/* Faixa Horizontal com 3 Métricas Essenciais */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full text-center">
              {/* 1. Tempo Assistido */}
              <div className="flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-1 text-slate-400 text-[11px] font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Tempo</span>
                </div>
                <span
                  title={`Total aproximado: ${stats.totalHours.toLocaleString('pt-BR')} horas assistidas`}
                  className="text-sm sm:text-base md:text-lg font-black text-white cursor-help"
                >
                  {stats.formattedTime}
                </span>
              </div>

              {/* 2. Quantidade de Episódios */}
              <div className="flex flex-col items-center gap-0.5 border-x border-white/5">
                <div className="flex items-center gap-1 text-slate-400 text-[11px] font-medium">
                  <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Episódios</span>
                </div>
                <span className="text-sm sm:text-base md:text-lg font-black text-white">
                  {stats.totalEps.toLocaleString('pt-BR')}
                </span>
              </div>

              {/* 3. Nota (Média) */}
              <div className="flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-1 text-slate-400 text-[11px] font-medium">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 shrink-0" />
                  <span>Nota (Média)</span>
                </div>
                <span className="text-sm sm:text-base md:text-lg font-black text-white">
                  {stats.meanScore}
                </span>
              </div>
            </div>

            {/* Link Sutil Centralizado para Estatísticas Completas */}
            {onOpenStatsDetail && (
              <div className="pt-1.5 border-t border-white/5 flex justify-center">
                <button
                  type="button"
                  id="btn-open-full-stats"
                  onClick={onOpenStatsDetail}
                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-amber-300 font-semibold transition-colors cursor-pointer py-0.5 px-3 rounded-full hover:bg-white/[0.04] group/stats-link"
                >
                  <span>Estatísticas completas</span>
                  <ArrowRight className="w-3 h-3 text-slate-400 group-hover/stats-link:text-amber-300 group-hover/stats-link:translate-x-0.5 transition-transform" />
                </button>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* 3. TOP 5 PÓDIO REFORMULADO (Cards em Aspect 2:3, sem espremer no mobile) */}
          {/* ========================================================================= */}
          <Top5Podium
            animes={top5Animes}
            isEditable={effectiveIsOwner}
            onEdit={() => setIsEditTop5Open(true)}
            onSelectAnime={handleOpenAnimeInfo}
          />

          {/* ========================================================================= */}
          {/* 4. SISTEMA DE 5 INSÍGNIAS (SEM PREENCHIMENTO AUTOMÁTICO) */}
          {/* ========================================================================= */}
          <div className="w-full bg-black/60 backdrop-blur-md border border-white/10 rounded-3xl p-4 sm:p-6 shadow-2xl relative">
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    5 INSÍGNIAS EM DESTAQUE
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Apenas as insígnias escolhidas a dedo por você ocupam estes 5 slots
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="btn-view-all-badges"
                onClick={() => setIsBadgesModalOpen(true)}
                className="text-xs text-slate-400 hover:text-amber-400 font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Ver todas as insígnias</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Grid dos 5 Slots de Insígnias Compacto e Proporcional */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-3 md:gap-4 py-2">
              {slotBadges.map((badge, slotIndex) => {
                if (badge) {
                  return (
                    <div
                      key={`slot-badge-${slotIndex}-${badge.id}`}
                      onClick={() => setIsBadgesModalOpen(true)}
                      title={`${badge.title} - Clique para gerenciar insígnias`}
                      className="flex flex-col items-center justify-start text-center p-1 sm:p-2 rounded-xl sm:rounded-2xl bg-white/[0.02] border border-white/5 hover:border-amber-400/40 transition-all group cursor-pointer min-h-[96px] sm:min-h-[110px]"
                    >
                      <HexBadge
                        badgeId={badge.id}
                        title={badge.title}
                        icon={badge.icon}
                        tone={getBadgeTone(badge.tier)}
                        isUnlocked={true}
                        size="sm"
                        showSubtitle={false}
                        onClick={() => setIsBadgesModalOpen(true)}
                      />
                    </div>
                  );
                }

                // Slot Vazio Compacto
                return (
                  <button
                    key={`slot-empty-${slotIndex}`}
                    type="button"
                    onClick={() => {
                      if (effectiveIsOwner) setIsBadgesModalOpen(true);
                    }}
                    disabled={!effectiveIsOwner}
                    title={effectiveIsOwner ? "Adicionar insígnia" : "Slot vazio"}
                    className={`h-22 sm:h-26 rounded-xl sm:rounded-2xl border-2 border-dashed border-white/10 bg-black/40 hover:bg-white/[0.03] hover:border-amber-400/50 flex flex-col items-center justify-center p-1 sm:p-2 text-center transition-all ${
                      effectiveIsOwner ? 'cursor-pointer' : 'cursor-default opacity-40'
                    }`}
                  >
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/5 flex items-center justify-center mb-1 text-slate-400">
                      <Plus className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">
                      {effectiveIsOwner ? '+ Adicionar' : 'Vazio'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 5. SEÇÃO DE CONTEÚDO: COLEÇÃO COMPLETA MINIMALISTA & EXPANSÍVEL */}
          {/* ========================================================================= */}
          <div ref={collectionTopRef} className="w-full bg-black border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
            {/* Botão Pequeno de Minimizar / Maximizar Coleção (Sem fundo cinza) */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                id="btn-toggle-collection"
                onClick={() => setIsCollectionExpanded((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black hover:bg-neutral-900 border border-white/15 hover:border-amber-400/50 text-slate-200 text-xs font-bold transition-all cursor-pointer select-none active:scale-95 shadow-sm"
              >
                <Tv className="w-4 h-4 text-amber-400" />
                <span>Coleção Completa ({currentDisplayedAnimes.length})</span>
                <span className="text-slate-400 font-normal">
                  — {isCollectionExpanded ? 'Clique para recolher' : 'Clique para expandir'}
                </span>
                {isCollectionExpanded ? (
                  <ChevronUp className="w-4 h-4 text-amber-400 ml-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
                )}
              </button>
            </div>

            {/* Conteúdo Expansível da Coleção */}
            {isCollectionExpanded && (
              <div className="space-y-4 pt-2 animate-in fade-in duration-300">
                {/* Busca Apenas pelo Nome e Filtro Todos */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar animes por nome..."
                      value={collectionSearch}
                      onChange={(e) => setCollectionSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/60 border border-white/10 text-white text-xs focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setCollectionSearch('')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        !collectionSearch.trim()
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                          : 'bg-black/60 text-slate-400 hover:text-white border border-white/10'
                      }`}
                    >
                      Todos ({currentDisplayedAnimes.length})
                    </button>
                  </div>
                </div>

                {/* Grid dos Cards de Animes */}
                {filteredCollection.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    Nenhum anime encontrado com este nome.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
                    {filteredCollection.map((anime) => {
                      const statusMeta = getAnimeStatusMeta(anime.status);

                      return (
                        <div
                          key={anime.id}
                          onClick={() => handleOpenAnimeInfo(anime)}
                          title={`${anime.title} - Ver detalhes`}
                          className="group relative rounded-2xl overflow-hidden bg-black border border-white/10 hover:border-amber-400/60 transition-all cursor-pointer shadow-lg flex flex-col"
                        >
                          <div className="relative aspect-[3/4.2] w-full overflow-hidden bg-slate-950 shrink-0">
                            {anime.coverUrl ? (
                              <img
                                src={anime.coverUrl}
                                alt={anime.title}
                                referrerPolicy="no-referrer"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">
                                Sem Capa
                              </div>
                            )}

                            {/* Gradiente escuro sutil no topo para legibilidade da nota */}
                            <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/80 via-transparent to-transparent pointer-events-none" />

                            {/* Gradiente sutil na base exatamente como nos cards da Agenda */}
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black via-black/70 to-transparent pointer-events-none" />

                            {/* Nota Pessoal no Topo Direito */}
                            {typeof anime.rating === 'number' && anime.rating > 0 && (
                              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-black/85 backdrop-blur-md border border-amber-400/50 text-amber-300 text-[10px] font-black flex items-center gap-0.5 shadow-md">
                                <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
                                <span>{Number(anime.rating).toFixed(1)}</span>
                              </div>
                            )}

                            {/* Tag Oficial de Status com Cores e Nomes Padronizados da Aba Lista */}
                            <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-md backdrop-blur-md text-[9.5px] font-bold ${statusMeta.badgeBg}`}>
                              {statusMeta.label}
                            </div>
                          </div>

                          <div className="p-2.5 flex-1 flex flex-col justify-between">
                            <span className="text-xs font-bold text-white line-clamp-1 group-hover:text-amber-300 transition-colors">
                              {anime.title}
                            </span>

                            {/* Se estiver visitando e o anime não estiver na minha lista, botão de adicionar */}
                            {!effectiveIsOwner && onAddAnimeFromFriend && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddAnimeFromFriend({
                                    title: anime.title,
                                    coverUrl: anime.coverUrl,
                                    totalEpisodes: anime.totalEpisodes,
                                    rating: anime.rating,
                                  });
                                }}
                                className="mt-2 w-full py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400 text-amber-300 hover:text-slate-950 text-[10px] font-black flex items-center justify-center gap-1 transition-all"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Salvar na Minha Lista</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Botão no Final da Coleção para Subir e Recolher */}
                <div className="pt-6 pb-2 flex justify-center border-t border-white/10">
                  <button
                    type="button"
                    id="btn-scroll-top-collapse"
                    onClick={() => {
                      collectionTopRef.current?.scrollIntoView({ behavior: 'smooth' });
                      setIsCollectionExpanded(false);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.15] border border-white/15 hover:border-amber-400 text-white text-xs font-bold transition-all cursor-pointer shadow-lg active:scale-95"
                  >
                    <ChevronUp className="w-4 h-4 text-amber-400" />
                    <span>Subir e Recolher Coleção</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: FEED DA COMUNIDADE (DIÁRIO COLETIVO DE RESENHAS) */}
      {/* ========================================================================= */}
      {activeMainTab === 'feed' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barra Superior Slim em Linha Única (Minhas Resenhas, Escrever Resenha, Recarregar) */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-[#0c0e15] border border-white/10 flex items-center justify-between gap-2 shadow-xl">
            {/* Botão Liga/Desliga: Minhas Resenhas (Compacto, discreto, sem amarelão gigante) */}
            <button
              type="button"
              onClick={() => setFeedMode((prev) => (prev === 'mine' ? 'all' : 'mine'))}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 ${
                feedMode === 'mine'
                  ? 'bg-amber-400/15 border border-amber-400/40 text-amber-300'
                  : 'bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 border border-white/10'
              }`}
            >
              <Feather className="w-3 h-3 text-amber-400" />
              <span>Minhas Resenhas</span>
              {myReviewsCount > 0 && (
                <span className="text-[10px] text-amber-400 font-bold ml-0.5">
                  ({myReviewsCount})
                </span>
              )}
            </button>

            {/* Ações da Direita: Escrever Resenha + Atualizar */}
            <div className="flex items-center gap-2 shrink-0">
              {isOwner && (
                <button
                  type="button"
                  id="btn-write-review-feed"
                  onClick={() => setIsWriteReviewOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black text-xs transition-all shadow-sm active:scale-95 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Escrever Resenha</span>
                </button>
              )}

              <button
                type="button"
                title="Recarregar análises mais recentes"
                onClick={handleRefreshFeed}
                disabled={isRefreshingFeed}
                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingFeed ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Listagem de Resenhas - Estilo Compacto e Fluido */}
          {displayedFeedReviews.length === 0 ? (
            feedMode === 'mine' ? (
              <div className="p-8 rounded-xl bg-[#0c0e15] border border-white/10 text-center space-y-2.5 shadow-md">
                <div className="w-10 h-10 rounded-xl bg-amber-400/10 border border-amber-400/20 text-amber-400 flex items-center justify-center mx-auto">
                  <Feather className="w-5 h-5" />
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  Você ainda não escreveu nenhuma resenha
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Avalie e compartilhe sua visão sobre os animes da sua lista com a comunidade!
                </p>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setIsWriteReviewOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition-all shadow-sm cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Escrever Minha Primeira Resenha</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-[#0c0e15] border border-white/10 text-center space-y-2 shadow-md">
                <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-300">
                  Nenhuma resenha disponível no momento
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Clique no botão de recarregar ou compartilhe sua própria resenha!
                </p>
              </div>
            )
          ) : (
            <div className="space-y-2.5">
              {displayedFeedReviews.map((rev) => {
                const isMine = checkIsMyReview(rev);
                const hasSpoiler = rev.hasSpoilers;
                const isSpoilerRevealed = Boolean(revealedSpoilers[rev.id]);
                const isLiked = Boolean(likedReviews[rev.id]);
                const currentLikes = reviewLikesCount[rev.id] ?? (rev.likesCount || 0);
                const hasMoreContent = rev.content.length > 120;

                // Procura anime na coleção do usuário caso queira abrir detalhes
                const matchedAnime = animes.find(
                  (a) =>
                    String(a.id) === String(rev.animeId) ||
                    a.title.toLowerCase() === rev.animeTitle.toLowerCase()
                );

                return (
                  <div
                    key={rev.id}
                    className="p-3 sm:p-3.5 rounded-2xl bg-[#0c0e15] border border-white/10 hover:border-white/20 transition-all shadow-md space-y-2.5"
                  >
                    {/* Linha 1: Autor, Origem, Data, Nota e Exclusão */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Avatar do Autor */}
                        <div
                          onClick={() => {
                            if (rev.source === 'wanime' && rev.userNick) {
                              handleVisitUser(rev.userNick);
                            }
                          }}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden bg-neutral-900 border border-white/15 shrink-0 ${
                            rev.source === 'wanime' ? 'cursor-pointer hover:border-amber-400' : ''
                          }`}
                        >
                          {rev.userAvatarUrl ? (
                            <img
                              src={rev.userAvatarUrl}
                              alt={rev.userDisplayName}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-amber-400 bg-amber-400/10">
                              {rev.userDisplayName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Nome do Autor e Selo da Origem */}
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span
                            onClick={() => {
                              if (rev.source === 'wanime' && rev.userNick) {
                                handleVisitUser(rev.userNick);
                              }
                            }}
                            className={`text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[170px] ${
                              rev.source === 'wanime' ? 'cursor-pointer hover:text-amber-300' : ''
                            }`}
                          >
                            {rev.userDisplayName}
                          </span>

                          {/* Selo de Origem Compacto */}
                          {rev.source === 'mal' ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[9px] font-black uppercase tracking-wider shrink-0">
                              MAL
                            </span>
                          ) : rev.source === 'anilist' ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[9px] font-black uppercase tracking-wider shrink-0">
                              AniList
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[9px] font-black uppercase tracking-wider shrink-0">
                              WAnime
                            </span>
                          )}

                          <span className="text-[10px] text-slate-500 shrink-0">
                            • {formatTimeAgo(rev.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Lado Direito: Nota e Lixeira se for dono */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-black">
                          <Star className="w-3 h-3 fill-amber-400" />
                          <span>{Number(rev.rating).toFixed(1)}</span>
                        </div>

                        {/* Botão de Excluir da Minha Resenha */}
                        {isMine && (
                          <button
                            type="button"
                            title="Excluir minha resenha"
                            onClick={() => setReviewToDelete(rev)}
                            className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer active:scale-95"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Linha 2: Pôster integrado com Título e Frase Curta (Clicável para abrir modal com resenha completa) */}
                    <div
                      onClick={() => {
                        if (hasMoreContent) {
                          setSelectedFullReview(rev);
                        }
                      }}
                      className={`flex items-start gap-2.5 sm:gap-3 bg-black/40 border border-white/5 rounded-xl p-2 sm:p-2.5 transition-all ${
                        hasMoreContent
                          ? 'cursor-pointer hover:border-amber-400/30 hover:bg-white/[0.02]'
                          : ''
                      }`}
                      title={hasMoreContent ? 'Clique para ler a resenha completa' : undefined}
                    >
                      {/* Pôster Miniatura Compacto */}
                      <div
                        onClick={(e) => {
                          if (matchedAnime && onOpenAnimeDetail) {
                            e.stopPropagation();
                            onOpenAnimeDetail(matchedAnime);
                          }
                        }}
                        className={`w-12 sm:w-14 h-16 sm:h-20 rounded-lg overflow-hidden bg-neutral-900 border border-white/10 shrink-0 ${
                          matchedAnime ? 'cursor-pointer hover:border-amber-400/60' : ''
                        } transition-all relative shadow-sm`}
                        title={matchedAnime ? `Ver detalhes de ${rev.animeTitle}` : rev.animeTitle}
                      >
                        {rev.animeCoverUrl ? (
                          <img
                            src={rev.animeCoverUrl}
                            alt={rev.animeTitle}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-1 text-slate-500">
                            <Film className="w-4 h-4 text-slate-600" />
                          </div>
                        )}
                      </div>

                      {/* Título do Anime e Frase Curta da Resenha */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <h4
                          onClick={(e) => {
                            if (matchedAnime && onOpenAnimeDetail) {
                              e.stopPropagation();
                              onOpenAnimeDetail(matchedAnime);
                            }
                          }}
                          className={`text-xs sm:text-sm font-black text-white ${
                            matchedAnime ? 'hover:text-amber-300 cursor-pointer' : ''
                          } transition-colors truncate leading-tight`}
                        >
                          {rev.animeTitle}
                        </h4>

                        {hasSpoiler && !isSpoilerRevealed ? (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSpoiler(rev.id);
                            }}
                            className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-between cursor-pointer hover:bg-amber-500/15 transition-all text-[11px]"
                          >
                            <span className="text-amber-300 font-medium flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                              Contém spoilers
                            </span>
                            <span className="text-[10px] text-amber-400 font-bold underline ml-1">
                              Revelar
                            </span>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs text-slate-300 leading-snug line-clamp-3">
                              {rev.content.slice(0, 120)}
                              {hasMoreContent ? '...' : ''}
                            </p>
                            {hasMoreContent && (
                              <span className="inline-block text-[10px] font-bold text-amber-400 hover:text-amber-300 mt-1">
                                Ler resenha completa →
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Linha 3: Rodapé com Ação de Curtir (Sem botão de compartilhar) */}
                    <div className="flex items-center justify-between pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleToggleLike(rev.id, rev.likesCount || 0)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer select-none ${
                          isLiked
                            ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                            : 'bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Heart className={`w-3 h-3 ${isLiked ? 'fill-rose-400 text-rose-400' : ''}`} />
                        <span>{currentLikes}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: AMIGOS & CONEXÕES (EXPERIÊNCIA SOCIAL PRETO PROFUNDO & FLUTUANTE) */}
      {/* ========================================================================= */}
      {activeMainTab === 'friends' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* BARRA DE ENTRADA / RADAR FLUTUANTE NO PRETO PURO */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-amber-400/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar membro por @nick (ex: lansky)..."
                value={memberSearchQuery}
                onChange={(e) => {
                  setMemberSearchQuery(e.target.value);
                  if (!e.target.value.trim() && hasSearched) {
                    handleClearSearch();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleExecuteSearch();
                  }
                }}
                className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-neutral-950/90 border border-white/10 hover:border-amber-400/40 focus:border-amber-400 text-white text-xs placeholder:text-neutral-500 focus:outline-none transition-all shadow-inner"
              />
              {memberSearchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 cursor-pointer transition-colors"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleExecuteSearch}
              disabled={!memberSearchQuery.trim() || isSearchingMember}
              className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-95 text-neutral-950 font-black text-xs transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-lg shadow-amber-400/20 flex items-center gap-1.5 shrink-0"
            >
              {isSearchingMember ? (
                <div className="w-3.5 h-3.5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>Encontrar</span>
            </button>
          </div>

          {/* MENSAGEM DE ERRO FLUTUANTE */}
          {visitedError && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center justify-between animate-in fade-in">
              <span>{visitedError}</span>
              <button
                type="button"
                onClick={() => setVisitedError(null)}
                className="text-red-400 hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODO 1: RESULTADOS DA BUSCA (SE O USUÁRIO CLICOU EM ENCONTRAR) */}
          {/* ========================================================================= */}
          {hasSearched ? (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs font-black text-white">
                    Perfis encontrados para "{memberSearchQuery.trim()}"
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 text-[10px] font-black border border-amber-400/25">
                    {searchResults?.length || 0}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Voltar</span>
                </button>
              </div>

              {!searchResults || searchResults.length === 0 ? (
                <div className="p-8 rounded-3xl bg-neutral-950/70 border border-white/5 text-center text-neutral-400 text-xs space-y-1.5">
                  <p className="font-bold text-white text-sm">Nenhum membro encontrado.</p>
                  <p className="text-[11px] text-neutral-500">
                    Tente digitar uma parte diferente do @nickname ou nome.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {searchResults.map((member) => {
                    const cleanNick = (member.publicUsername || '').toLowerCase().replace(/^@/, '');
                    const isFollowedByMe =
                      followingList.includes(cleanNick) ||
                      (member.userId && followingList.includes(member.userId.toLowerCase()));
                    const isFollowingMe = followerProfiles.some(
                      (f) =>
                        (f.userId && f.userId === member.userId) ||
                        (f.publicUsername &&
                          f.publicUsername.toLowerCase().replace(/^@/, '') === cleanNick)
                    );
                    const isMe =
                      member.userId === effectiveUserId ||
                      cleanNick === (profile?.publicUsername || '').toLowerCase().replace(/^@/, '');

                    return (
                      <div
                        key={member.userId || member.publicUsername}
                        className="relative overflow-hidden rounded-2xl bg-neutral-950 border border-white/10 hover:border-amber-400/40 p-3 transition-all duration-200 flex items-center justify-between gap-3 shadow-lg group"
                      >
                        {/* Mini banner de fundo idêntico à referência aprovada */}
                        {member.customBannerUrl && (
                          <div
                            className="absolute inset-0 opacity-20 bg-cover bg-center pointer-events-none"
                            style={{ backgroundImage: `url(${member.customBannerUrl})` }}
                          />
                        )}

                        <div
                          onClick={() => handleVisitUser(member.userId || member.publicUsername)}
                          className="flex items-center gap-3 min-w-0 cursor-pointer flex-1 relative z-10"
                        >
                          <div className="w-11 h-11 rounded-full overflow-hidden bg-neutral-900 border-2 border-amber-400/40 group-hover:border-amber-400 shrink-0 relative shadow-md transition-colors">
                            {member.customAvatarUrl ? (
                              <img
                                src={member.customAvatarUrl}
                                alt={member.publicUsername}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-black text-amber-400 bg-amber-400/10">
                                {(member.publicUsername || 'O').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs sm:text-sm font-black text-white group-hover:text-amber-300 truncate transition-colors">
                                {member.publicUsername}
                              </span>

                              {member.isDeveloperAdmin && (
                                <span className="px-1.5 py-0.2 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[8px] font-black uppercase tracking-wider">
                                  DEV
                                </span>
                              )}

                              {isFollowingMe && !isFollowedByMe && (
                                <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold">
                                  Segue você
                                </span>
                              )}

                              {isFollowingMe && isFollowedByMe && (
                                <span className="px-1.5 py-0.2 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[9px] font-bold">
                                  Mútuo
                                </span>
                              )}
                            </div>

                            <span className="text-[11px] text-neutral-400 truncate block">
                              @{cleanNick}
                            </span>

                            {member.honoraryTitle && (
                              <span className="text-[10px] text-amber-400/80 truncate block font-medium">
                                ✦ {member.honoraryTitle}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                          {!isMe && (
                            <button
                              type="button"
                              onClick={() => handleToggleFollowUser(member.userId || member.publicUsername)}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer select-none active:scale-95 shadow-sm ${
                                isFollowedByMe
                                  ? 'bg-neutral-900 hover:bg-red-500/20 hover:text-red-300 text-neutral-300 border border-white/10 hover:border-red-500/30'
                                  : 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-amber-400/15'
                              }`}
                            >
                              {isFollowedByMe ? 'Seguindo' : 'Seguir'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleVisitUser(member.userId || member.publicUsername)}
                            className="p-2 rounded-xl bg-neutral-900/80 hover:bg-amber-400 hover:text-neutral-950 text-neutral-300 transition-all cursor-pointer"
                            title="Ver perfil"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* MODO 2: HUB SOCIAL FLUTUANTE (OS DOIS POLOS + CARROSSEL HORIZONTAL) */
            /* ========================================================================= */
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* OS DOIS POLOS DE CONEXÃO (CARDS GÊMEOS COMPACTOS E SIMÉTRICOS) */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* POLO 1: QUEM VOCÊ SEGUE */}
                <div
                  onClick={() => setFriendsViewMode(friendsViewMode === 'following_list' ? 'hub' : 'following_list')}
                  className={`p-3 rounded-2xl cursor-pointer transition-all duration-200 relative overflow-hidden flex items-center justify-between gap-2.5 ${
                    friendsViewMode === 'following_list'
                      ? 'bg-neutral-900 border border-amber-400 shadow-lg shadow-amber-400/10'
                      : 'bg-neutral-950/90 border border-white/10 hover:border-amber-400/40 hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white truncate">Seguindo</h4>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {followingList.length === 0 ? 'Nenhum amigo' : `${followingList.length} amigos`}
                      </p>
                    </div>
                  </div>

                  <span className="text-base font-black text-amber-400 shrink-0">
                    {followingList.length}
                  </span>
                </div>

                {/* POLO 2: SEUS SEGUIDORES */}
                <div
                  onClick={() => setFriendsViewMode(friendsViewMode === 'followers_list' ? 'hub' : 'followers_list')}
                  className={`p-3 rounded-2xl cursor-pointer transition-all duration-200 relative overflow-hidden flex items-center justify-between gap-2.5 ${
                    friendsViewMode === 'followers_list'
                      ? 'bg-neutral-900 border border-emerald-400 shadow-lg shadow-emerald-400/10'
                      : 'bg-neutral-950/90 border border-white/10 hover:border-emerald-400/40 hover:bg-neutral-900/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white truncate">Seguidores</h4>
                      <p className="text-[10px] text-neutral-400 truncate">
                        {followerProfiles.length === 0 ? 'Nenhum fã' : `${followerProfiles.length} seguidores`}
                      </p>
                    </div>
                  </div>

                  <span className="text-base font-black text-emerald-400 shrink-0">
                    {followerProfiles.length}
                  </span>
                </div>
              </div>

              {/* EXPANSÃO CONDICIONAL: LISTA COMPLETA SELECIONADA */}
              {friendsViewMode === 'following_list' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4" />
                      Todos os membros que você segue ({followedProfiles.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setFriendsViewMode('hub')}
                      className="text-xs text-neutral-400 hover:text-white px-2 py-1 rounded-lg bg-white/5"
                    >
                      Fechar
                    </button>
                  </div>

                  {isLoadingFollowed ? (
                    <div className="p-8 rounded-3xl bg-neutral-950/70 border border-white/5 text-center text-neutral-400 text-xs">
                      Carregando amigos...
                    </div>
                  ) : followedProfiles.length === 0 ? (
                    <div className="p-8 rounded-3xl bg-neutral-950/70 border border-white/5 text-center text-neutral-400 text-xs">
                      Você ainda não segue ninguém. Veja os destaques recomendados abaixo!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {followedProfiles.map((member) => {
                        const cleanNick = (member.publicUsername || '').toLowerCase().replace(/^@/, '');
                        const isFollowerToo = followerProfiles.some(
                          (f) =>
                            (f.userId && f.userId === member.userId) ||
                            (f.publicUsername &&
                              f.publicUsername.toLowerCase().replace(/^@/, '') === cleanNick)
                        );

                        return (
                          <div
                            key={member.userId || member.publicUsername}
                            className="relative overflow-hidden rounded-2xl bg-neutral-950 border border-white/10 hover:border-amber-400/40 p-3 transition-all duration-200 flex items-center justify-between gap-3 shadow-lg group"
                          >
                            {member.customBannerUrl && (
                              <div
                                className="absolute inset-0 opacity-20 bg-cover bg-center pointer-events-none"
                                style={{ backgroundImage: `url(${member.customBannerUrl})` }}
                              />
                            )}

                            <div
                              onClick={() => handleVisitUser(member.userId || member.publicUsername)}
                              className="flex items-center gap-3 min-w-0 cursor-pointer flex-1 relative z-10"
                            >
                              <div className="w-11 h-11 rounded-full overflow-hidden bg-neutral-900 border-2 border-amber-400/40 group-hover:border-amber-400 shrink-0 relative shadow-md transition-colors">
                                {member.customAvatarUrl ? (
                                  <img
                                    src={member.customAvatarUrl}
                                    alt={member.publicUsername}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-black text-amber-400 bg-amber-400/10">
                                    {(member.publicUsername || 'O').slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs sm:text-sm font-black text-white group-hover:text-amber-300 truncate transition-colors">
                                    {member.publicUsername}
                                  </span>

                                  {member.isDeveloperAdmin && (
                                    <span className="px-1.5 py-0.2 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[8px] font-black uppercase tracking-wider">
                                      DEV
                                    </span>
                                  )}

                                  {isFollowerToo && (
                                    <span className="px-1.5 py-0.2 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[9px] font-black shrink-0">
                                      Mútuo
                                    </span>
                                  )}
                                </div>

                                <span className="text-[11px] text-neutral-400 truncate block">
                                  @{cleanNick}
                                </span>

                                {member.honoraryTitle && (
                                  <span className="text-[10px] text-amber-400/80 truncate block font-medium">
                                    ✦ {member.honoraryTitle}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                              <button
                                type="button"
                                onClick={() => handleToggleFollowUser(member.userId || member.publicUsername)}
                                title="Deixar de seguir"
                                className="px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-red-500/20 hover:text-red-300 text-neutral-400 border border-white/10 hover:border-red-500/30 text-[11px] font-black transition-all cursor-pointer active:scale-95"
                              >
                                Seguindo
                              </button>

                              <button
                                type="button"
                                onClick={() => handleVisitUser(member.userId || member.publicUsername)}
                                className="p-2 rounded-xl bg-neutral-900/80 hover:bg-amber-400 hover:text-neutral-950 text-neutral-300 transition-all cursor-pointer"
                                title="Ver perfil completo"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {friendsViewMode === 'followers_list' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      Membros que seguem você ({followerProfiles.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setFriendsViewMode('hub')}
                      className="text-xs text-neutral-400 hover:text-white px-2 py-1 rounded-lg bg-white/5"
                    >
                      Fechar
                    </button>
                  </div>

                  {isLoadingFollowers ? (
                    <div className="p-8 rounded-3xl bg-neutral-950/70 border border-white/5 text-center text-neutral-400 text-xs">
                      Carregando seguidores...
                    </div>
                  ) : followerProfiles.length === 0 ? (
                    <div className="p-8 rounded-3xl bg-neutral-950/70 border border-white/5 text-center text-neutral-400 text-xs">
                      Nenhum seguidor ainda. Compartilhe seu perfil para ser acompanhado!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {followerProfiles.map((member) => {
                        const cleanNick = (member.publicUsername || '').toLowerCase().replace(/^@/, '');
                        const isFollowingBack =
                          followingList.includes(cleanNick) ||
                          (member.userId && followingList.includes(member.userId.toLowerCase()));

                        return (
                          <div
                            key={member.userId || member.publicUsername}
                            className="relative overflow-hidden rounded-2xl bg-neutral-950 border border-white/10 hover:border-emerald-400/40 p-3 transition-all duration-200 flex items-center justify-between gap-3 shadow-lg group"
                          >
                            {member.customBannerUrl && (
                              <div
                                className="absolute inset-0 opacity-20 bg-cover bg-center pointer-events-none"
                                style={{ backgroundImage: `url(${member.customBannerUrl})` }}
                              />
                            )}

                            <div
                              onClick={() => handleVisitUser(member.userId || member.publicUsername)}
                              className="flex items-center gap-3 min-w-0 cursor-pointer flex-1 relative z-10"
                            >
                              <div className="w-11 h-11 rounded-full overflow-hidden bg-neutral-900 border-2 border-emerald-400/40 group-hover:border-emerald-400 shrink-0 relative shadow-md transition-colors">
                                {member.customAvatarUrl ? (
                                  <img
                                    src={member.customAvatarUrl}
                                    alt={member.publicUsername}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-black text-emerald-400 bg-emerald-400/10">
                                    {(member.publicUsername || 'O').slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs sm:text-sm font-black text-white group-hover:text-emerald-300 truncate transition-colors">
                                    {member.publicUsername}
                                  </span>

                                  {member.isDeveloperAdmin && (
                                    <span className="px-1.5 py-0.2 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[8px] font-black uppercase tracking-wider">
                                      DEV
                                    </span>
                                  )}

                                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-black shrink-0">
                                    Segue você
                                  </span>
                                </div>

                                <span className="text-[11px] text-neutral-400 truncate block">
                                  @{cleanNick}
                                </span>

                                {member.honoraryTitle && (
                                  <span className="text-[10px] text-neutral-500 truncate block font-medium">
                                    ✦ {member.honoraryTitle}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                              <button
                                type="button"
                                onClick={() => handleToggleFollowUser(member.userId || member.publicUsername)}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer active:scale-95 shadow-sm ${
                                  isFollowingBack
                                    ? 'bg-neutral-900 text-neutral-400 hover:bg-red-500/20 hover:text-red-300 border border-white/10'
                                    : 'bg-emerald-400 hover:bg-emerald-300 text-neutral-950 shadow-emerald-400/15'
                                }`}
                              >
                                {isFollowingBack ? 'Seguindo' : 'Seguir de volta'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleVisitUser(member.userId || member.publicUsername)}
                                className="p-2 rounded-xl bg-neutral-900/80 hover:bg-emerald-400 hover:text-neutral-950 text-neutral-300 transition-all cursor-pointer"
                                title="Ver perfil completo"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* RADAR HORIZONTAL DE MEMBROS RECOMENDADOS (DESLIZANTE E COMPACTO) */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-black text-white">
                      Membros em Destaque na Rede
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500">
                    Deslize para ver mais →
                  </span>
                </div>

                {popularMembers.length === 0 ? (
                  <div className="p-6 rounded-3xl bg-neutral-950/70 border border-white/5 text-center text-neutral-500 text-xs">
                    Nenhum perfil em destaque no momento.
                  </div>
                ) : (
                  <div className="flex items-stretch gap-2.5 overflow-x-auto pb-2 pt-1 px-1 scrollbar-none snap-x snap-mandatory">
                    {popularMembers.map((member) => {
                      const cleanNick = (member.publicUsername || '').toLowerCase().replace(/^@/, '');
                      const isAlreadyFollowing =
                        followingList.includes(cleanNick) ||
                        (member.userId && followingList.includes(member.userId.toLowerCase()));

                      return (
                        <div
                          key={member.userId || member.publicUsername}
                          className="w-[170px] shrink-0 snap-start relative overflow-hidden rounded-2xl bg-neutral-950 border border-white/10 hover:border-amber-400/40 p-3 transition-all duration-200 flex flex-col justify-between shadow-lg group"
                        >
                          {/* Mini banner de fundo */}
                          {member.customBannerUrl && (
                            <div
                              className="absolute inset-0 opacity-20 bg-cover bg-center pointer-events-none"
                              style={{ backgroundImage: `url(${member.customBannerUrl})` }}
                            />
                          )}

                          <div
                            onClick={() => handleVisitUser(member.userId || member.publicUsername)}
                            className="cursor-pointer space-y-2 relative z-10"
                          >
                            <div className="flex items-center justify-between">
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-900 border-2 border-amber-400/40 group-hover:border-amber-400 shadow-md transition-colors">
                                {member.customAvatarUrl ? (
                                  <img
                                    src={member.customAvatarUrl}
                                    alt={member.publicUsername}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-black text-amber-400 bg-amber-400/10">
                                    {(member.publicUsername || 'O').slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              {member.isDeveloperAdmin && (
                                <span className="px-1.5 py-0.2 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[8px] font-black uppercase tracking-wider">
                                  DEV
                                </span>
                              )}
                            </div>

                            <div>
                              <span className="text-xs font-black text-white group-hover:text-amber-300 truncate block transition-colors">
                                {member.publicUsername}
                              </span>
                              <span className="text-[10px] text-neutral-400 truncate block">
                                @{cleanNick}
                              </span>
                            </div>

                            {member.honoraryTitle ? (
                              <p className="text-[9px] text-amber-400/80 truncate font-medium">
                                ✦ {member.honoraryTitle}
                              </p>
                            ) : (
                              <p className="text-[9px] text-neutral-500 italic truncate">
                                Membro ativo
                              </p>
                            )}
                          </div>

                          {/* Ações Rápidas no Rodapé do Card */}
                          <div className="flex items-center gap-1.5 pt-2 mt-2 border-t border-white/5 relative z-10">
                            <button
                              type="button"
                              onClick={() => handleToggleFollowUser(member.userId || member.publicUsername)}
                              className={`flex-1 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer active:scale-95 shadow-sm text-center ${
                                isAlreadyFollowing
                                  ? 'bg-neutral-900 text-neutral-400 hover:bg-red-500/20 hover:text-red-300 border border-white/10'
                                  : 'bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-amber-400/15'
                              }`}
                            >
                              {isAlreadyFollowing ? 'Seguindo' : 'Seguir'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleVisitUser(member.userId || member.publicUsername)}
                              className="p-1 rounded-xl bg-neutral-900/80 hover:bg-amber-400 hover:text-neutral-950 text-neutral-300 transition-all cursor-pointer"
                              title="Visitar Perfil"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAIS INTEGRADOS (EDITAR PERFIL, TOP 5, RESENHAS, INSÍGNIAS, VERSUS) */}
      {/* ========================================================================= */}
      {effectiveIsOwner && onUpdateProfile && (
        <>
          {/* Modal Editar Perfil (Caso não seja aberto o AvatarModal do header) */}
          <EditProfileModal
            isOpen={isEditProfileOpen}
            onClose={() => setIsEditProfileOpen(false)}
            profile={profile}
            userAnimes={animes}
            onSave={onUpdateProfile}
          />

          {/* Modal Editar Top 5 */}
          <EditTop5Modal
            isOpen={isEditTop5Open}
            onClose={() => setIsEditTop5Open(false)}
            userAnimes={animes}
            currentTop5Ids={
              (profile as any)?.top5AnimeIds || profile?.favoriteAnimeIds || []
            }
            onSave={async (newIds) => {
              await onUpdateProfile({
                ...profile,
                favoriteAnimeIds: newIds,
                ...({ top5AnimeIds: newIds } as any),
              });
            }}
          />

          {/* Modal Escrever Resenha */}
          <WriteReviewModal
            isOpen={isWriteReviewOpen}
            onClose={() => setIsWriteReviewOpen(false)}
            userAnimes={animes}
            userId={profile?.userId || currentUserId || 'anon'}
            userDisplayName={profile?.publicUsername || 'Otaku'}
            userNick={profile?.publicUsername}
            userAvatarUrl={profile?.customAvatarUrl}
            onReviewCreated={(newRev) => {
              setCurrentReviews((prev) => [newRev, ...prev.filter((r) => r.id !== newRev.id)]);
              if (onReviewCreated) onReviewCreated(newRev);
            }}
          />

          {/* Modal de Confirmação de Exclusão de Resenha */}
          {reviewToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
              <div className="w-full max-w-md bg-[#0a0a0f] border border-red-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 shrink-0">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">Excluir Resenha?</h3>
                    <p className="text-xs text-slate-400">Esta ação não pode ser revertida</p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Tem certeza que deseja apagar permanentemente sua resenha sobre{' '}
                  <strong className="text-white font-bold">{reviewToDelete.animeTitle}</strong>?
                </p>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={isDeletingReview}
                    onClick={() => setReviewToDelete(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingReview}
                    onClick={handleConfirmDeleteReview}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition-all shadow-lg shadow-red-600/20 cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeletingReview ? 'Excluindo...' : 'Sim, Excluir Resenha'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Leitura Completa da Resenha */}
          {selectedFullReview && (
            <div
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
              onClick={() => setSelectedFullReview(null)}
            >
              <div
                className="w-full max-w-xl max-h-[85vh] bg-[#0c0e15] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header do Modal */}
                <div className="p-3.5 sm:p-4 border-b border-white/10 flex items-center justify-between gap-3 bg-black/40">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-14 rounded-lg overflow-hidden bg-neutral-900 border border-white/10 shrink-0 shadow-sm">
                      {selectedFullReview.animeCoverUrl ? (
                        <img
                          src={selectedFullReview.animeCoverUrl}
                          alt={selectedFullReview.animeTitle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Film className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-black text-white truncate leading-tight">
                        {selectedFullReview.animeTitle}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-300">
                          {selectedFullReview.userDisplayName}
                        </span>
                        {selectedFullReview.source === 'mal' ? (
                          <span className="px-1.5 py-0.2 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[9px] font-black uppercase">
                            MAL
                          </span>
                        ) : selectedFullReview.source === 'anilist' ? (
                          <span className="px-1.5 py-0.2 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[9px] font-black uppercase">
                            AniList
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[9px] font-black uppercase">
                            WAnime
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500">
                          • {formatTimeAgo(selectedFullReview.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-black">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span>{Number(selectedFullReview.rating).toFixed(1)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedFullReview(null)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Corpo do Texto Completo com scroll suave exclusivamente vertical */}
                <div className="p-4 sm:p-5 overflow-y-auto overflow-x-hidden space-y-3 flex-1 select-text w-full max-w-full">
                  {selectedFullReview.hasSpoilers && !revealedSpoilers[selectedFullReview.id] ? (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2 text-center">
                      <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                      <h4 className="text-xs font-bold text-amber-300">Esta resenha contém revelações do enredo (Spoilers)</h4>
                      <button
                        type="button"
                        onClick={() => toggleSpoiler(selectedFullReview.id)}
                        className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-black text-xs cursor-pointer hover:bg-amber-300"
                      >
                        Revelar Resenha Completa
                      </button>
                    </div>
                  ) : (
                    <div className="break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-pre-wrap leading-relaxed text-xs sm:text-sm text-slate-200 w-full max-w-full overflow-hidden">
                      {selectedFullReview.content}
                    </div>
                  )}
                </div>

                {/* Footer do Modal */}
                <div className="p-3 border-t border-white/10 flex items-center justify-between bg-black/40">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(selectedFullReview.id, selectedFullReview.likesCount || 0)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      likedReviews[selectedFullReview.id]
                        ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                        : 'bg-white/[0.04] hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${likedReviews[selectedFullReview.id] ? 'fill-rose-400 text-rose-400' : ''}`} />
                    <span>{reviewLikesCount[selectedFullReview.id] ?? (selectedFullReview.likesCount || 0)}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedFullReview(null)}
                    className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Ver Todas as Insígnias (5 slots de capacidade máxima) */}
      <BadgesShowcaseModal
        isOpen={isBadgesModalOpen}
        onClose={() => setIsBadgesModalOpen(false)}
        allAchievements={allAchievements}
        currentEquippedIds={currentDisplayedProfile?.featuredBadges || []}
        isEditable={effectiveIsOwner}
        onSaveEquipped={
          effectiveIsOwner && onUpdateProfile
            ? async (equippedIds) => {
                await onUpdateProfile({
                  featuredBadges: equippedIds,
                });
              }
            : undefined
        }
      />

      {/* Modal de Comparação de Listas (Disparado pelo botão 'Comparar Listas' ao visitar perfil) */}
      {isVersusModalOpen && currentDisplayedProfile && (
        <CollectionVersusModal
          isOpen={isVersusModalOpen}
          onClose={() => setIsVersusModalOpen(false)}
          myProfile={profile}
          myAnimes={animes || []}
          myUserName={profile?.publicUsername || auth.currentUser?.displayName || 'Você'}
          myAvatar={profile?.customAvatarUrl || auth.currentUser?.photoURL || ''}
          friendProfile={currentDisplayedProfile}
          friendAnimes={currentDisplayedAnimes || []}
          friendUserName={currentDisplayedProfile.publicUsername || 'Amigo Otaku'}
          friendAvatar={currentDisplayedProfile.customAvatarUrl || ''}
          targetProfile={currentDisplayedProfile}
          targetAnimes={currentDisplayedAnimes || []}
          onAddAnimeToMyList={(animeData) => {
            if (onAddAnimeFromFriend) {
              onAddAnimeFromFriend(animeData as Anime);
            }
          }}
          onAddAnimeFromFriend={onAddAnimeFromFriend}
          onOpenAnimeDetail={onOpenAnimeDetail}
        />
      )}

      {/* Modal Exclusivo e Isolado da Coleção Completa (100% Dinâmico das APIs, sem status deduzidos) */}
      {selectedCollectionAnime && (
        <CollectionAnimeModal
          anime={selectedCollectionAnime}
          isOpen={Boolean(selectedCollectionAnime)}
          onClose={() => setSelectedCollectionAnime(null)}
          isOwner={effectiveIsOwner}
          onAddAnimeFromFriend={!effectiveIsOwner ? onAddAnimeFromFriend : undefined}
          onOpenInTracker={(animeId) => {
            setSelectedCollectionAnime(null);
            const found = animes.find((a) => a.id === animeId);
            if (found && onOpenAnimeDetail) {
              onOpenAnimeDetail(found);
            }
          }}
        />
      )}
    </div>
  );
};
