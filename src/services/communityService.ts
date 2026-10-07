/**
 * Serviço Comunitário:
 * 1. Mini-Reviews e Avaliações Comunitárias (Persistência no Firestore + Local Cache)
 * 2. Calculador de Compatibilidade / Afinidade de Gosto entre 2 listas
 */
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import type { Anime } from '../types';
import { translateSynopsisToPT } from './translationService';
import { pairUserAnimeCollections } from './franchiseService';

export interface CommunityReview {
  id: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl?: string;
  userNick?: string;
  animeId: string | number;
  animeTitle: string;
  animeCoverUrl?: string;
  rating: number; // 1-10
  content: string;
  hasSpoilers: boolean;
  createdAt: string; // ISO string ou timestamp
  likesCount?: number;
  likedBy?: string[];
  source?: 'wanime' | 'anilist' | 'mal';
}

export interface CompatibilityResult {
  scorePercent: number; // 0 - 100%
  levelDescription: string; // ex: "Almas Gêmeas Otaku", "Alta Afinidade", "Gostos Distintos"
  mutualCount: number;
  sharedFavorites: {
    title: string;
    coverUrl?: string;
    userScore: number;
    targetScore: number;
  }[];
  epicDivergences: {
    title: string;
    coverUrl?: string;
    userScore: number;
    targetScore: number;
    diff: number;
  }[];
  crossRecommendations: Anime[];
  commonGenres: {
    genre: string;
    count: number;
  }[];
}

const LOCAL_REVIEWS_KEY = 'wanime_community_reviews_cache';

/**
 * Salva uma nova review ou atualiza existente
 */
export async function submitAnimeReview(reviewData: Omit<CommunityReview, 'id' | 'createdAt'>): Promise<CommunityReview> {
  const currentUid = auth.currentUser?.uid || reviewData.userId || 'wanime_user';
  const timestampSuffix = Date.now().toString(36);
  const safeAnimeId = String(reviewData.animeId || 'custom').replace(/[^a-zA-Z0-9_-]/g, '_');
  const reviewId = `review_${currentUid}_${safeAnimeId}_${timestampSuffix}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const nowIso = new Date().toISOString();

  const newReview: CommunityReview = {
    ...reviewData,
    userId: currentUid,
    id: reviewId,
    createdAt: nowIso,
    likesCount: 0,
    likedBy: [],
    source: 'wanime',
  };

  // Salva no Firestore se o usuário estiver autenticado
  if (db && auth.currentUser) {
    try {
      const reviewDocRef = doc(db, 'anime_reviews', reviewId);
      const firestorePayload: Record<string, any> = {
        userId: currentUid,
        userDisplayName: newReview.userDisplayName || 'Otaku',
        animeId: String(newReview.animeId),
        animeTitle: newReview.animeTitle,
        rating: Number(newReview.rating) || 10,
        content: newReview.content,
        hasSpoilers: Boolean(newReview.hasSpoilers),
        likesCount: 0,
        likedBy: [],
        source: 'wanime',
        createdAt: Timestamp.now(),
      };
      if (newReview.userNick) firestorePayload.userNick = newReview.userNick;
      if (newReview.userAvatarUrl) firestorePayload.userAvatarUrl = newReview.userAvatarUrl;
      if (newReview.animeCoverUrl) firestorePayload.animeCoverUrl = newReview.animeCoverUrl;

      await setDoc(reviewDocRef, firestorePayload, { merge: true });
    } catch (err) {
      console.warn('Falha ao salvar review no Firestore, salvando localmente:', err);
    }
  }

  // Atualiza cache local
  try {
    const cached = getLocalReviews();
    const filtered = cached.filter((r) => r.id !== reviewId);
    const updated = [newReview, ...filtered];
    localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(updated.slice(0, 50)));
  } catch (e) {
    console.error('Erro ao gravar cache local de reviews:', e);
  }

  return newReview;
}

/**
 * Exclui uma review comunitária do usuário
 */
export async function deleteCommunityReview(reviewId: string, _userId?: string): Promise<boolean> {
  // Remove do Firestore
  if (db && auth.currentUser) {
    try {
      const reviewDocRef = doc(db, 'anime_reviews', reviewId);
      await deleteDoc(reviewDocRef);
    } catch (err) {
      console.warn('Falha ao excluir review do Firestore:', err);
    }
  }

  // Remove do cache local
  try {
    const cached = getLocalReviews();
    const filtered = cached.filter((r) => r.id !== reviewId);
    localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Erro ao atualizar cache local após exclusão:', e);
  }

  return true;
}

// Cache em memória para resenhas públicas do AniList e MyAnimeList (apenas memória temporária, NUNCA gravado no Firestore)
let cachedAniListReviews: CommunityReview[] = [];
let lastAniListFetchTime = 0;
let cachedMalReviews: CommunityReview[] = [];
let lastMalFetchTime = 0;

/**
 * Busca resenhas reais e públicas diretamente da API GraphQL do AniList
 * Filtra estritamente por produções ANIME (exclui mangás e light novels)
 * (Executado apenas em memória/cache, NUNCA gravado no banco de dados Firestore do projeto)
 */
export async function fetchAniListRecentReviews(forceRefresh = false): Promise<CommunityReview[]> {
  const now = Date.now();
  if (!forceRefresh && cachedAniListReviews.length > 0 && now - lastAniListFetchTime < 1000 * 60 * 5) {
    return cachedAniListReviews;
  }

  const query = `
    query {
      Page(page: 1, perPage: 40) {
        reviews(sort: CREATED_AT_DESC) {
          id
          score
          rating
          ratingAmount
          summary
          body
          createdAt
          user {
            id
            name
            avatar {
              medium
              large
            }
          }
          media {
            id
            type
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              medium
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      console.warn('AniList reviews fetch status:', res.status);
      return cachedAniListReviews;
    }

    const json = await res.json();
    const list = json?.data?.Page?.reviews || [];

    // Filtra estritamente por produções ANIME e GARANTE DIVERSIDADE (máximo 1 resenha por anime)
    const seenAnimes = new Set<string>();
    const animeOnlyList: any[] = [];
    for (const item of list) {
      if (item.media?.type !== 'ANIME') continue;
      const animeKey = String(item.media?.id || item.media?.title?.romaji || item.media?.title?.english || '');
      if (!animeKey || seenAnimes.has(animeKey)) continue;
      seenAnimes.add(animeKey);
      animeOnlyList.push(item);
      if (animeOnlyList.length >= 15) break;
    }

    const mapped: CommunityReview[] = await Promise.all(
      animeOnlyList.map(async (item: any) => {
        // Prioriza a resenha completa (body) e usa summary apenas se body não existir
        let rawText = item.body || item.summary || '';
        rawText = rawText
          .replace(/<[^>]*>?/gm, '')
          .replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi, '')
          .trim();

        // Tradução automática integral para Português (pt-BR)
        let translatedText = rawText;
        if (rawText && rawText.length > 5) {
          try {
            const pt = await translateSynopsisToPT(rawText);
            if (pt && pt.trim().length > 0) {
              translatedText = pt.trim();
            }
          } catch {
            // fallback gracefully
          }
        }

        const rawScore = typeof item.score === 'number' ? item.score : 80;
        const rating = Math.min(10, Math.max(1, Math.round((rawScore / 10) * 10) / 10));

        const title =
          item.media?.title?.romaji ||
          item.media?.title?.english ||
          item.media?.title?.native ||
          'Anime';

        const officialAniListLikes = typeof item.rating === 'number'
          ? Math.max(0, item.rating)
          : (typeof item.ratingAmount === 'number' ? Math.max(0, item.ratingAmount) : 0);

        return {
          id: `anilist_${item.id}`,
          userId: `anilist_user_${item.user?.id || 'anon'}`,
          userDisplayName: item.user?.name || 'AniList Member',
          userNick: item.user?.name ? `@${item.user.name}` : undefined,
          userAvatarUrl: item.user?.avatar?.large || item.user?.avatar?.medium || '',
          animeId: String(item.media?.id || ''),
          animeTitle: title,
          animeCoverUrl: item.media?.coverImage?.large || item.media?.coverImage?.medium || '',
          rating,
          content: translatedText || 'Resenha compartilhada na comunidade global.',
          hasSpoilers: false,
          createdAt: item.createdAt ? new Date(item.createdAt * 1000).toISOString() : new Date().toISOString(),
          likesCount: officialAniListLikes,
          likedBy: [],
          source: 'anilist' as const,
        };
      })
    );

    if (mapped.length > 0) {
      cachedAniListReviews = mapped;
      lastAniListFetchTime = now;
    }

    return cachedAniListReviews;
  } catch (err) {
    console.warn('Erro ao consultar resenhas públicas do AniList:', err);
    return cachedAniListReviews;
  }
}

/**
 * Busca resenhas reais diretamente da API do MyAnimeList (via Jikan REST API v4)
 * (Executado apenas em memória/cache se responder a tempo, NUNCA gravado no Firestore)
 */
export async function fetchMyAnimeListRecentReviews(forceRefresh = false): Promise<CommunityReview[]> {
  const now = Date.now();
  if (!forceRefresh && cachedMalReviews.length > 0 && now - lastMalFetchTime < 1000 * 60 * 5) {
    return cachedMalReviews;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://api.jikan.moe/v4/reviews/anime?limit=25', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return cachedMalReviews;
    }

    const json = await res.json();
    const list = json?.data || [];

    // Garante diversidade: 1 resenha por anime no MAL
    const seenMalAnimes = new Set<string>();
    const diverseMalList: any[] = [];
    for (const item of list) {
      const entryId = String(item.entry?.mal_id || item.entry?.title || '');
      if (!entryId || seenMalAnimes.has(entryId)) continue;
      seenMalAnimes.add(entryId);
      diverseMalList.push(item);
      if (diverseMalList.length >= 10) break;
    }

    const mapped: CommunityReview[] = await Promise.all(
      diverseMalList.map(async (item: any) => {
        let rawText = item.review || '';
        rawText = rawText.replace(/<[^>]*>?/gm, '').trim();

        let translatedText = rawText;
        if (rawText && rawText.length > 5) {
          try {
            const pt = await translateSynopsisToPT(rawText);
            if (pt && pt.trim().length > 0) {
              translatedText = pt.trim();
            }
          } catch {}
        }

        const score = typeof item.score === 'number' ? item.score : 8;
        const entry = item.entry || {};
        const title = entry.title || 'Anime';
        const coverUrl = entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url || '';

        return {
          id: `mal_${item.mal_id || Math.random().toString(36).substring(2, 9)}`,
          userId: `mal_user_${item.user?.username || 'anon'}`,
          userDisplayName: item.user?.username || 'MAL Reviewer',
          userNick: item.user?.username ? `@${item.user.username}` : undefined,
          userAvatarUrl: item.user?.images?.jpg?.image_url || '',
          animeId: String(entry.mal_id || ''),
          animeTitle: title,
          animeCoverUrl: coverUrl,
          rating: Math.min(10, Math.max(1, score)),
          content: translatedText || 'Resenha compartilhada no MyAnimeList.',
          hasSpoilers: Boolean(item.is_spoiler),
          createdAt: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
          likesCount: item.reactions?.overall || 0,
          likedBy: [],
          source: 'mal' as const,
        };
      })
    );

    if (mapped.length > 0) {
      cachedMalReviews = mapped;
      lastMalFetchTime = now;
    }

    return cachedMalReviews;
  } catch {
    return cachedMalReviews;
  }
}

/**
 * Busca reviews comunitárias recentes (do anime ou globais)
 * Combina resenhas do projeto (Firestore e locais) com resenhas reais do AniList e MyAnimeList em tempo real
 */
export async function getRecentReviews(animeId?: string | number, forceRefresh = false): Promise<CommunityReview[]> {
  if (forceRefresh) {
    lastAniListFetchTime = 0;
    lastMalFetchTime = 0;
    cachedAniListReviews = [];
    cachedMalReviews = [];
  }

  const localList = getLocalReviews();
  let firestoreList: CommunityReview[] = [];

  if (db) {
    try {
      const reviewsCol = collection(db, 'anime_reviews');
      let q = query(reviewsCol, orderBy('createdAt', 'desc'), limit(50));

      if (animeId) {
        q = query(reviewsCol, where('animeId', '==', animeId), limit(30));
      }

      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        firestoreList = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString();

          return {
            id: docSnap.id,
            userId: data.userId || '',
            userDisplayName: data.userDisplayName || 'Usuário',
            userAvatarUrl: data.userAvatarUrl || '',
            userNick: data.userNick || '',
            animeId: data.animeId || '',
            animeTitle: data.animeTitle || '',
            animeCoverUrl: data.animeCoverUrl || '',
            rating: data.rating || 0,
            content: data.content || '',
            hasSpoilers: data.hasSpoilers || false,
            createdAt,
            likesCount: data.likesCount || 0,
            likedBy: data.likedBy || [],
            source: 'wanime' as const,
          };
        });
      }
    } catch (err) {
      console.warn('Erro ao ler reviews do Firestore, usando locais:', err);
    }
  }

  // Busca resenhas externas de AniList e MyAnimeList em tempo real (NÃO gravadas no Firestore)
  let anilistReviews: CommunityReview[] = [];
  let malReviews: CommunityReview[] = [];
  try {
    const [ani, mal] = await Promise.allSettled([
      fetchAniListRecentReviews(forceRefresh),
      fetchMyAnimeListRecentReviews(forceRefresh),
    ]);
    if (ani.status === 'fulfilled') anilistReviews = ani.value;
    if (mal.status === 'fulfilled') malReviews = mal.value;
  } catch (e) {
    console.warn('Falha ao obter resenhas externas:', e);
  }

  // Mescla sem fakes: Firestore (projeto) + Local (projeto) + AniList (tempo real) + MAL (tempo real)
  // Garante que animes não se repitam excessivamente no feed
  const combinedMap = new Map<string, CommunityReview>();
  const seenAnimeTitles = new Set<string>();

  // 1. Resenhas da nossa própria comunidade WAnime têm prioridade máxima
  firestoreList.forEach((r) => {
    combinedMap.set(r.id, { ...r, source: 'wanime' });
  });
  localList.forEach((r) => {
    combinedMap.set(r.id, { ...r, source: 'wanime' });
  });

  // Registra animes já avaliados pela comunidade
  combinedMap.forEach((r) => {
    seenAnimeTitles.add(r.animeTitle.toLowerCase().trim());
  });

  // 2. Mescla AniList e MAL garantindo diversidade total (sem animes repetidos)
  const externalReviews = [...anilistReviews, ...malReviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const ext of externalReviews) {
    const normalizedTitle = ext.animeTitle.toLowerCase().trim();
    if (!seenAnimeTitles.has(normalizedTitle)) {
      seenAnimeTitles.add(normalizedTitle);
      combinedMap.set(ext.id, ext);
    }
    if (combinedMap.size >= 25) break;
  }

  const merged = Array.from(combinedMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (animeId) {
    return merged.filter((r) => String(r.animeId) === String(animeId));
  }

  return merged.slice(0, 20);
}

/**
 * Lê reviews salvas em cache local do próprio usuário
 */
function getLocalReviews(): CommunityReview[] {
  try {
    const raw = localStorage.getItem(LOCAL_REVIEWS_KEY);
    if (raw) {
      const parsed: CommunityReview[] = JSON.parse(raw);
      return parsed
        .map((p) => ({ ...p, source: 'wanime' as const }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  } catch (e) {
    // fallback
  }

  return [];
}

/**
 * Calcula a Afinidade / Compatibilidade entre duas listas de animes
 */
export function calculateCompatibilityScore(
  myList: Anime[] = [],
  friendList: Anime[] = []
): CompatibilityResult {
  const safeMyList = Array.isArray(myList) ? myList : [];
  const safeFriendList = Array.isArray(friendList) ? friendList : [];

  if (!safeMyList.length || !safeFriendList.length) {
    return {
      scorePercent: 50,
      levelDescription: 'Sem dados suficientes para cálculo exato',
      mutualCount: 0,
      sharedFavorites: [],
      epicDivergences: [],
      crossRecommendations: safeFriendList.slice(0, 6),
      commonGenres: [],
    };
  }

  // Pareia coleções com intersecção inteligente de nós de franquia e títulos
  const pairs = pairUserAnimeCollections(safeMyList, safeFriendList);

  const mutuals: { myAnime: Anime; friendAnime: Anime }[] = [];
  const sharedFavorites: CompatibilityResult['sharedFavorites'] = [];
  const epicDivergences: CompatibilityResult['epicDivergences'] = [];
  let scoreDiffSum = 0;
  let scorePairsCount = 0;

  for (const pair of pairs) {
    if (pair.myAnime && pair.friendAnime) {
      const myAnime = pair.myAnime;
      const matched = pair.friendAnime;
      mutuals.push({ myAnime, friendAnime: matched });

      if (myAnime.rating && matched.rating) {
        const diff = Math.abs(myAnime.rating - matched.rating);
        scoreDiffSum += diff;
        scorePairsCount++;

        if (myAnime.rating >= 8 && matched.rating >= 8) {
          sharedFavorites.push({
            title: myAnime.title,
            coverUrl: myAnime.coverUrl || matched.coverUrl,
            userScore: myAnime.rating,
            targetScore: matched.rating,
          });
        }

        // Divergências Épicas: diferença de 3 ou mais pontos nas notas!
        if (diff >= 3) {
          epicDivergences.push({
            title: myAnime.title,
            coverUrl: myAnime.coverUrl || matched.coverUrl,
            userScore: myAnime.rating,
            targetScore: matched.rating,
            diff,
          });
        }
      }
    }
  }

  // Recomendações Cruzadas: Animes do amigo com nota alta (>= 8) que NÃO estão na lista do usuário
  // (Usa os pares identificados para ter certeza absoluta de que o usuário NÃO tem esse anime nem com outro nome/temporada)
  const crossRecommendations = pairs
    .filter((p) => !p.myAnime && p.friendAnime)
    .map((p) => p.friendAnime!)
    .filter((a) => (a.rating || 0) >= 8 || a.status === 'completed')
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 6);

  // Cálculo de afinidade de gêneros
  const myGenreCounts = new Map<string, number>();
  for (const a of safeMyList) {
    for (const g of a.genres || []) {
      myGenreCounts.set(g, (myGenreCounts.get(g) || 0) + 1);
    }
  }

  const commonGenresMap = new Map<string, number>();
  for (const a of safeFriendList) {
    for (const g of a.genres || []) {
      if (myGenreCounts.has(g)) {
        commonGenresMap.set(g, (commonGenresMap.get(g) || 0) + 1);
      }
    }
  }

  const commonGenres = Array.from(commonGenresMap.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Score base: overlap proporcional + concordância de notas
  const overlapRatio = Math.min(1, mutuals.length / Math.max(5, Math.min(safeMyList.length, safeFriendList.length)));
  let ratingHarmony = 0.8;
  if (scorePairsCount > 0) {
    const avgDiff = scoreDiffSum / scorePairsCount; // ex: 0 a 10
    ratingHarmony = Math.max(0.2, 1 - avgDiff / 10);
  }

  let finalScore = Math.round((overlapRatio * 0.5 + ratingHarmony * 0.5) * 100);
  finalScore = Math.max(15, Math.min(99, finalScore));

  let levelDescription = 'Gostos Ecléticos e Distintos';
  if (finalScore >= 85) levelDescription = '🔥 Almas Gêmeas Otaku!';
  else if (finalScore >= 70) levelDescription = '✨ Alta Afinidade de Gosto';
  else if (finalScore >= 50) levelDescription = '⚡ Boa Conexão de Interesses';

  return {
    scorePercent: finalScore,
    levelDescription,
    mutualCount: mutuals.length,
    sharedFavorites: sharedFavorites.slice(0, 6),
    epicDivergences: epicDivergences.slice(0, 6),
    crossRecommendations,
    commonGenres,
  };
}
