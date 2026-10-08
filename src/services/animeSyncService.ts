import type { Anime } from '../types';
import { updateAnime } from './animeService';
import { syncFranchiseSeasonsForAnime } from './franchiseService';
import { resolveAnimeAggregatedStatus, type AnimeAggregatedStatus } from './aggregatorStatusService';

export interface AnimeSyncUpdateResult {
  animeId: string;
  title: string;
  previousEpisode: number;
  latestAiredEpisode?: number | null;
  hasNewEpisode: boolean;
  newEpisodesCount: number;
  statusChanged: boolean;
  previousStatus: string;
  newStatus?: string;
  totalEpisodesUpdated?: number | null;
  detailsMessage?: string;
}

export interface FreshAnimeDetailsResult {
  mal_id: number;
  totalEpisodes: number | null;
  status: string; // 'RELEASING', 'FINISHED', 'NOT_YET_RELEASED'
  latestAiredEpisode: number | null;
  studio: string | null;
  coverUrl: string | null;
  bannerUrl: string | null;
  synopsis: string | null;
  trailerUrl: string | null;
  nextEpisode: { airingAt: number; episode: number } | null;
  broadcastDay?: string | null;
  broadcastTime?: string | null;
  aggregatedStatus: AnimeAggregatedStatus;
}

/**
 * Extrai URL canônica do YouTube de qualquer formato da API (youtube_id, url, embed_url ou id simples)
 */
export function extractYoutubeUrl(trailerObj: any): string | null {
  if (!trailerObj) return null;
  if (typeof trailerObj === 'string') {
    const raw = trailerObj.trim();
    if (!raw) return null;
    if (raw.length === 11 && !raw.includes('/') && !raw.includes('.')) {
      return `https://www.youtube.com/watch?v=${raw}`;
    }
    const m = raw.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|youtube-nocookie\.com\/embed\/)([\w-]{11})/
    );
    return m ? `https://www.youtube.com/watch?v=${m[1]}` : raw.startsWith('http') ? raw : null;
  }

  if (trailerObj.youtube_id) {
    return `https://www.youtube.com/watch?v=${trailerObj.youtube_id}`;
  }
  if (trailerObj.url) {
    const m = trailerObj.url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|youtube-nocookie\.com\/embed\/)([\w-]{11})/
    );
    if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
    return trailerObj.url;
  }
  if (trailerObj.embed_url) {
    const m = trailerObj.embed_url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|youtube-nocookie\.com\/embed\/)([\w-]{11})/
    );
    if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
  }
  return null;
}

/**
 * Utilitário de pausa assíncrona para garantir espaçamento seguro entre requisições
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Consulta a API AniList GraphQL e Jikan para obter metadados frescos e status de episódios lançados
 */
export const fetchFreshAnimeDetails = async (
  title: string,
  malId?: number | null,
  userStatus?: string | null
): Promise<FreshAnimeDetailsResult | null> => {
  // 1. Tentar AniList GraphQL (com relações de franquia completas para agregação)
  try {
    const graphqlQuery = `
      query ($search: String, $idMal: Int) {
        Media(search: $search, idMal: $idMal, type: ANIME) {
          id
          idMal
          title { romaji english native }
          coverImage { extraLarge large }
          bannerImage
          episodes
          status
          description
          genres
          averageScore
          seasonYear
          season
          startDate { year month day }
          studios(isMain: true) { nodes { name } }
          nextAiringEpisode {
            airingAt
            episode
          }
          trailer { id site }
          relations {
            edges {
              relationType
              node {
                id
                idMal
                title { romaji english native }
                status
                format
                episodes
                seasonYear
                season
                startDate { year month day }
                nextAiringEpisode {
                  airingAt
                  episode
                }
                bannerImage
              }
            }
          }
        }
      }
    `;

    const variables: any = {};
    if (malId) {
      variables.idMal = malId;
    } else {
      variables.search = title.trim();
    }

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: graphqlQuery, variables }),
    });

    if (res.ok) {
      const json = await res.json();
      const media = json?.data?.Media;
      if (media) {
        let latestAired: number | null = null;
        if (media.nextAiringEpisode?.episode) {
          latestAired = Math.max(1, media.nextAiringEpisode.episode - 1);
        } else if (media.status === 'FINISHED' && media.episodes) {
          latestAired = media.episodes;
        }

        let trailerUrl: string | null = null;
        if (media.trailer?.site === 'youtube' && media.trailer?.id) {
          trailerUrl = `https://www.youtube.com/watch?v=${media.trailer.id}`;
        } else if (Array.isArray(media.relations?.edges)) {
          // Busca trailer nas relações canônicas da própria AniList (zero chamadas extras)
          for (const edge of media.relations.edges) {
            const relNode = edge?.node;
            if (relNode?.trailer?.site === 'youtube' && relNode?.trailer?.id) {
              trailerUrl = `https://www.youtube.com/watch?v=${relNode.trailer.id}`;
              break;
            }
          }
        }

        // Determina o status agregador da obra através de suas relações e sequências
        const aggregated = resolveAnimeAggregatedStatus({
          title,
          rawApiStatus: media.status,
          userTrackerStatus: userStatus,
          nextEpisode: media.nextAiringEpisode || null,
          apiRelations: media.relations?.edges || null,
          totalEpisodes: media.episodes || null,
          bannerUrl: media.bannerImage || null,
          startDate: media.startDate || null,
          season: media.season || null,
          seasonYear: media.seasonYear || null,
        });

        return {
          mal_id: media.idMal || media.id,
          totalEpisodes: media.episodes || null,
          status: media.status,
          latestAiredEpisode: latestAired,
          studio: media.studios?.nodes?.[0]?.name || null,
          coverUrl: media.coverImage?.extraLarge || media.coverImage?.large || null,
          bannerUrl: aggregated.bannerUrl || media.bannerImage || null,
          synopsis: media.description ? media.description.replace(/<[^>]*>/g, '').trim() : null,
          trailerUrl,
          nextEpisode: media.nextAiringEpisode || null,
          broadcastDay: aggregated.broadcastDay || null,
          broadcastTime: aggregated.broadcastTime || null,
          aggregatedStatus: aggregated,
        };
      }
    }
  } catch (err) {
    console.warn('AniList fetch details error, tentando Jikan...', err);
  }

  // 2. Fallback Jikan API (respeitando rate limit de no máximo 3 req/s)
  try {
    await sleep(350);
    const url = malId
      ? `https://api.jikan.moe/v4/anime/${malId}/full`
      : `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title.trim())}&limit=1&sfw=true`;

    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const item = malId ? json.data : json.data?.[0];
      if (item) {
        const aggregated = resolveAnimeAggregatedStatus({
          title,
          rawApiStatus: item.status,
          broadcastDay: item.broadcast?.day || null,
          broadcastTime: item.broadcast?.time || null,
          userTrackerStatus: userStatus,
          totalEpisodes: item.episodes || null,
          startDate: item.aired?.prop?.from
            ? {
                year: item.aired.prop.from.year,
                month: item.aired.prop.from.month,
                day: item.aired.prop.from.day,
              }
            : null,
          season: item.season || null,
          seasonYear: item.year || null,
        });

        return {
          mal_id: item.mal_id,
          totalEpisodes: item.episodes || null,
          status: item.status,
          latestAiredEpisode: item.status === 'Finished Airing' ? item.episodes || null : null,
          studio: item.studios?.[0]?.name || null,
          coverUrl: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || null,
          bannerUrl: aggregated.bannerUrl || null,
          broadcastDay: aggregated.broadcastDay || null,
          broadcastTime: aggregated.broadcastTime || null,
          synopsis: item.synopsis || null,
          trailerUrl:
            item.trailer?.url ||
            (item.trailer?.youtube_id ? `https://www.youtube.com/watch?v=${item.trailer.youtube_id}` : null),
          nextEpisode: null,
          aggregatedStatus: aggregated,
        };
      }
    }
  } catch (err) {
    console.warn('Jikan fetch details error, tentando Shikimori...', err);
  }

  // 3. Fallback Shikimori API (resiliência final caso AniList e Jikan estejam fora do ar)
  try {
    await sleep(350);
    const shikimoriUrl = malId
      ? `https://shikimori.io/api/animes/${malId}`
      : `https://shikimori.io/api/animes?search=${encodeURIComponent(title.trim())}&limit=1`;

    const sRes = await fetch(shikimoriUrl, {
      headers: { 'User-Agent': 'WAnimeList/2.0', Accept: 'application/json' },
    });
    if (sRes.ok) {
      const sJson = await sRes.json();
      const sItem = malId ? sJson : (Array.isArray(sJson) ? sJson[0] : null);
      if (sItem && sItem.id) {
        let cover: string | null = null;
        if (sItem.image?.original) {
          cover = sItem.image.original.startsWith('http')
            ? sItem.image.original
            : `https://shikimori.one${sItem.image.original}`;
        }
        const aggregated = resolveAnimeAggregatedStatus({
          title,
          rawApiStatus: sItem.status === 'released' ? 'Finished Airing' : sItem.status === 'ongoing' ? 'Currently Airing' : 'Not yet aired',
          userTrackerStatus: userStatus,
          totalEpisodes: sItem.episodes || null,
        });

        return {
          mal_id: sItem.id,
          totalEpisodes: sItem.episodes || null,
          status: sItem.status === 'released' ? 'Finished Airing' : sItem.status === 'ongoing' ? 'Currently Airing' : 'Not yet aired',
          latestAiredEpisode: sItem.status === 'released' ? sItem.episodes || null : (sItem.episodes_aired || null),
          studio: null,
          coverUrl: cover,
          bannerUrl: aggregated.bannerUrl || null,
          broadcastDay: aggregated.broadcastDay || null,
          broadcastTime: aggregated.broadcastTime || null,
          synopsis: sItem.description ? sItem.description.replace(/<[^>]*>/g, '').trim() : null,
          trailerUrl: null,
          nextEpisode: null,
          aggregatedStatus: aggregated,
        };
      }
    }
  } catch (err) {
    console.warn('Shikimori fetch details error:', err);
  }

  return null;
};

/**
 * Busca direta e confiável de Trailer Oficial (YouTube) nas APIs oficiais (Jikan/MAL + AniList)
 */
export async function fetchOfficialAnimeTrailer(
  title: string,
  malId?: number | null
): Promise<string | null> {
  const cleanTitle = (title || '').trim();

  // 1. Tenta via Jikan com ID do MAL (suporta embed_url, youtube_id e url)
  if (malId) {
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/full`);
      if (res.ok) {
        const json = await res.json();
        const extracted = extractYoutubeUrl(json.data?.trailer);
        if (extracted) return extracted;
      }
    } catch {
      // Silencioso
    }

    try {
      const resBase = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
      if (resBase.ok) {
        const json = await resBase.json();
        const extracted = extractYoutubeUrl(json.data?.trailer);
        if (extracted) return extracted;
      }
    } catch {
      // Silencioso
    }
  }

  // 2. Tenta via AniList GraphQL (busca por ID ou título canônico)
  if (cleanTitle || malId) {
    try {
      const gqlQuery = `
        query ($idMal: Int, $search: String) {
          Page(page: 1, perPage: 2) {
            media(idMal: $idMal, search: $search, type: ANIME, sort: SEARCH_MATCH) {
              trailer {
                id
                site
              }
            }
          }
        }
      `;
      const variables: Record<string, any> = {};
      if (malId) variables.idMal = malId;
      if (cleanTitle) variables.search = cleanTitle;

      const alRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: gqlQuery, variables }),
      });

      if (alRes.ok) {
        const alJson = await alRes.json();
        const list = alJson.data?.Page?.media || [];
        for (const m of list) {
          if (m.trailer?.site === 'youtube' && m.trailer?.id) {
            return `https://www.youtube.com/watch?v=${m.trailer.id}`;
          }
        }
      }
    } catch {
      // Silencioso
    }
  }

  // 3. Fallback de busca textual no Jikan
  if (cleanTitle) {
    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanTitle)}&limit=4&sfw=true`
      );
      if (res.ok) {
        const json = await res.json();
        const list = json.data || [];
        for (const it of list) {
          const extracted = extractYoutubeUrl(it.trailer);
          if (extracted) return extracted;
        }
      }
    } catch {
      // Silencioso
    }
  }

  return null;
}

/**
 * Sincroniza metadados de um único anime, atualizando status (ex: para Finalizado) e episódios
 */
export const syncSingleAnimeMetadata = async (
  userId: string,
  anime: Anime
): Promise<AnimeSyncUpdateResult> => {
  const freshData = await fetchFreshAnimeDetails(anime.title, anime.mal_id);
  if (!freshData) {
    return {
      animeId: anime.id,
      title: anime.title,
      previousEpisode: anime.currentEpisode,
      hasNewEpisode: false,
      newEpisodesCount: 0,
      statusChanged: false,
      previousStatus: anime.status,
      detailsMessage: 'Não foi possível encontrar metadados atualizados para este anime.',
    };
  }

  const updates: Partial<Anime> = {
    lastSyncTimestamp: new Date().toISOString(),
  };

  let statusChanged = false;
  let newStatus: string | undefined;

  // Atualização dinâmica de airingStatus e broadcastDay com base no status agregado da obra
  if (freshData.aggregatedStatus) {
    if (freshData.aggregatedStatus.state === 'releasing') {
      updates.airingStatus = 'Currently Airing';
      if (freshData.aggregatedStatus.broadcastDay) {
        updates.broadcastDay = freshData.aggregatedStatus.broadcastDay;
      }
    } else if (freshData.aggregatedStatus.state === 'upcoming') {
      updates.airingStatus = 'Not yet aired';
      updates.broadcastDay = null;
    } else if (freshData.aggregatedStatus.state === 'finished') {
      updates.airingStatus = 'Finished Airing';
      updates.broadcastDay = null;
    }
  }

  // O status da obra (ex: watching, waiting_new_episodes, etc.) é soberano e escolhido pelo usuário; não é forçado para 'completed' automaticamente.

  if (freshData.mal_id && !anime.mal_id) {
    updates.mal_id = freshData.mal_id;
  }

  // Preserva totalEpisodes da ficha unificada se o usuário possui múltiplas temporadas
  const hasMultipleSeasons = Boolean(anime.seasons && anime.seasons.length > 1);
  if (!hasMultipleSeasons && freshData.totalEpisodes && freshData.totalEpisodes !== anime.totalEpisodes) {
    updates.totalEpisodes = freshData.totalEpisodes;
  }

  // Não salva latestAiredEpisode no Firebase e limpa resquícios anteriores para evitar qualquer alerta indesejado
  if (anime.latestAiredEpisode) {
    updates.latestAiredEpisode = null;
  }

  if (freshData.studio && !anime.studio) {
    updates.studio = freshData.studio;
  }

  if (freshData.trailerUrl && !anime.trailerUrl) {
    updates.trailerUrl = freshData.trailerUrl;
  }

  // Sincronização automática profunda da árvore da franquia (novas temporadas, filmes e OVAs no mesmo card)
  let franchiseSyncResult: {
    hasNewSeasons: boolean;
    newSeasonsCount: number;
    updatedSeasons: any[];
    newFranchiseIds: number[];
    latestBroadcastDay?: string | null;
  } | null = null;

  try {
    franchiseSyncResult = await syncFranchiseSeasonsForAnime({ ...anime, ...updates } as Anime);
    if (franchiseSyncResult.hasNewSeasons) {
      updates.seasons = franchiseSyncResult.updatedSeasons;
      updates.franchiseIds = franchiseSyncResult.newFranchiseIds;
      if (franchiseSyncResult.latestBroadcastDay && !updates.broadcastDay) {
        updates.broadcastDay = franchiseSyncResult.latestBroadcastDay;
      }
    }
  } catch (fe) {
    console.warn('Erro ao sincronizar árvore de franquia em background:', fe);
  }

  // Persistir no Firestore
  await updateAnime(anime.id, updates as any);

  const latestAired = updates.latestAiredEpisode || anime.latestAiredEpisode || 0;
  const hasNewEp = latestAired > anime.currentEpisode;
  const diff = Math.max(0, latestAired - anime.currentEpisode);
  const newSeasonsCount = franchiseSyncResult?.newSeasonsCount || 0;

  let detailsMessage = 'Metadados sincronizados com sucesso!';
  if (newSeasonsCount > 0) {
    detailsMessage = `${newSeasonsCount} nova(s) temporada(s)/mídia(s) adicionada(s) à sua ficha!`;
  } else if (hasNewEp) {
    detailsMessage = `Novos episódios disponíveis! (Lançado até o ep ${latestAired})`;
  }

  return {
    animeId: anime.id,
    title: anime.title,
    previousEpisode: anime.currentEpisode,
    latestAiredEpisode: latestAired,
    hasNewEpisode: hasNewEp || newSeasonsCount > 0,
    newEpisodesCount: diff,
    statusChanged,
    previousStatus: anime.status,
    newStatus,
    totalEpisodesUpdated: updates.totalEpisodes,
    detailsMessage,
  };
};

/**
 * Determina se um anime está elegível para atualização de metadados:
 * - Se 'force = true' (ex: clique manual no botão): sempre elegível.
 * - Animes ativos ('watching', 'waiting_new_episodes'): elegíveis se nunca sincronizados ou se passaram > 6h.
 * - Animes de longo prazo ('completed', 'paused', 'dropped', 'cancelled', 'plan_to_watch'):
 *   Ciclo de 30 dias (720 horas) para verificar novas temporadas, sequências ou continuações canônicas.
 */
export function shouldSyncAnime(anime: Anime, force = false): boolean {
  if (force) return true;
  if (!anime.lastSyncTimestamp) return true;

  const lastSyncTime = new Date(anime.lastSyncTimestamp).getTime();
  if (isNaN(lastSyncTime)) return true;

  const now = Date.now();
  const diffHours = (now - lastSyncTime) / (1000 * 60 * 60);

  const isActive = anime.status === 'watching' || anime.status === 'waiting_new_episodes';
  if (isActive) {
    return diffHours >= 6;
  }

  // Ciclo de 30 dias para animes de longo prazo
  return diffHours >= 24 * 30;
}

let isCollectionSyncRunning = false;

/**
 * Executa a sincronização inteligente da coleção do usuário em segundo plano:
 * 1. Prioriza animes ativos em exibição (watching / waiting_new_episodes).
 * 2. Verifica animes concluídos/em pausa que atingiram o ciclo de 30 dias para descobrir surpresas/novas temporadas.
 * 3. Utiliza AniList como motor primário com cadência segura de 750ms por obra (limite de 90 req/min).
 * 4. Utiliza Jikan e Shikimori exclusivamente como fallbacks de contingência caso a AniList não retorne dados.
 */
export const runBackgroundCollectionSync = async (
  userId: string,
  animes: Anime[],
  force = false
): Promise<AnimeSyncUpdateResult[]> => {
  if (!userId || !animes || animes.length === 0) return [];
  if (isCollectionSyncRunning) {
    return [];
  }

  isCollectionSyncRunning = true;
  const results: AnimeSyncUpdateResult[] = [];

  try {
    // 1. Animes ativos (alta prioridade)
    const activeAnimes = animes.filter(
      (a) => a.status === 'watching' || a.status === 'waiting_new_episodes'
    );
    const activeToSync = activeAnimes.filter((a) => shouldSyncAnime(a, force));

    // 2. Animes de longo prazo (ciclo de 30 dias)
    const longTermAnimes = animes.filter(
      (a) => a.status !== 'watching' && a.status !== 'waiting_new_episodes'
    );
    // Em execução de background automática, pega lote moderado para poupar recursos
    const longTermToSync = longTermAnimes
      .filter((a) => shouldSyncAnime(a, force))
      .slice(0, force ? 12 : 6);

    const queue = [...activeToSync, ...longTermToSync];

    for (const anime of queue) {
      try {
        const res = await syncSingleAnimeMetadata(userId, anime);
        results.push(res);
      } catch (e) {
        console.warn(`[AnimeSync] Erro ao sincronizar anime ${anime.title}:`, e);
      }
      // Intervalo de segurança: AniList suporta 90 req/min (1 req a cada ~667ms).
      // Usamos 750ms para garantir 100% de margem sem risco de rate limit.
      await sleep(750);
    }
  } finally {
    isCollectionSyncRunning = false;
  }

  return results;
};

/**
 * Verifica novos episódios em lote para todos os animes que o usuário está assistindo
 * (Compatibilidade total com chamadas existentes no aplicativo)
 */
export const checkAllAiringAnimesUpdates = async (
  userId: string,
  animes: Anime[]
): Promise<AnimeSyncUpdateResult[]> => {
  return runBackgroundCollectionSync(userId, animes, true);
};
