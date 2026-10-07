/**
 * Serviço de Metadados Ricos e Carregamento Consolidado de Animes
 * Utiliza o "Super-Pacote Único" do AniList GraphQL (1 requisição traz 90% dos dados:
 * banner, trailer, streamers oficiais e os 25 personagens com dubladores japoneses).
 * Chamada paralela dedicada ao AnimeThemes para as músicas com áudio.
 * NUNCA salva cache vazio ou incompleto por erro de rede/rate limit.
 */

import type { Anime } from '../types';
import { auth } from '../lib/firebase';
import { getAggregatedStreamingLinks, getAggregatedCharacters } from './multiApiAggregatorService';
import { searchAnimeMetadata, getAnimeRecommendations, type AnimeStreamingLink, type AnimeCharacterItem, type AnimeRecommendationItem } from './jikanService';
import { fetchAnimeThemesMedia, type AnimeThemeMedia } from './animeThemesService';
import { fetchFreshAnimeDetails, fetchOfficialAnimeTrailer } from './animeSyncService';
import { updateAnime } from './animeService';
import { isDeveloperEmail } from './profileService';

export interface DynamicAnimeRichData {
  streamingLinks: AnimeStreamingLink[];
  characters: AnimeCharacterItem[];
  themes: AnimeThemeMedia[];
  recommendations?: AnimeRecommendationItem[];
  trailerUrl?: string | null;
  bannerUrl?: string | null;
  mal_id?: number | null;
  synopsis?: string | null;
  cachedAt?: number;
}

const STORAGE_PREFIX = 'wanime_rich_meta_v2_';
const RICH_DATA_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias para expiração completa
export const STALE_REVALIDATE_TTL = 12 * 60 * 60 * 1000; // 12 horas para frescor (após 12h, revalida em segundo plano sem travar 0ms)

/**
 * Normaliza chave de identificação do anime para armazenamento local seguro
 */
export function getAnimeStorageKey(animeIdOrTitle: number | string): string {
  const clean = String(animeIdOrTitle).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${STORAGE_PREFIX}${clean}`;
}

/**
 * Verifica se os dados em cache são elegíveis para revalidação suave em segundo plano
 */
export function isAnimeRichDataStale(data: DynamicAnimeRichData | null): boolean {
  if (!data || !data.cachedAt) return true;
  return Date.now() - data.cachedAt > STALE_REVALIDATE_TTL;
}

/**
 * Lê metadados ricos salvos no armazenamento persistente local com verificação de integridade real.
 * Se o cache estiver vazio (sem personagens, streamers ou músicas), invalida e retorna null.
 */
export function getPersistedAnimeRichData(anime: { mal_id?: number; id?: string; title: string }): DynamicAnimeRichData | null {
  if (typeof window === 'undefined' || !anime) return null;

  try {
    let raw: string | null = null;
    let usedKey: string | null = null;

    if (anime.mal_id) {
      usedKey = getAnimeStorageKey(anime.mal_id);
      raw = localStorage.getItem(usedKey);
    }

    if (!raw && anime.title) {
      usedKey = getAnimeStorageKey(anime.title);
      raw = localStorage.getItem(usedKey);
    }

    if (raw && usedKey) {
      const parsed: DynamicAnimeRichData = JSON.parse(raw);
      if (parsed) {
        const hasCharacters = Array.isArray(parsed.characters) && parsed.characters.length > 0;
        const hasThemes = Array.isArray(parsed.themes) && parsed.themes.length > 0;
        const hasStreaming = Array.isArray(parsed.streamingLinks) && parsed.streamingLinks.length > 0;

        // Se estiver gravado vazio (sem personagens, sem streaming e sem músicas), expurga o cache corrompido!
        if (!hasCharacters && !hasThemes && !hasStreaming) {
          localStorage.removeItem(usedKey);
          return null;
        }

        const cachedTime = parsed.cachedAt || 0;
        const age = Date.now() - cachedTime;

        // Se o cache tiver mais de 7 dias, expira para buscar novidades
        if (age > RICH_DATA_TTL) {
          return null;
        }

        return parsed;
      }
    }
  } catch (err) {
    console.debug('Erro ao ler cache persistente do anime:', err);
  }

  return null;
}

/**
 * Salva os metadados ricos no armazenamento local persistente.
 * REGRA DE OURO: NUNCA salva no localStorage se não tiver conteúdo real
 * (evita envenenamento de cache por timeout ou rate limit das APIs).
 */
export function savePersistedAnimeRichData(
  anime: { mal_id?: number; id?: string; title: string },
  data: DynamicAnimeRichData
): void {
  if (typeof window === 'undefined' || !anime || !data) return;

  const hasCharacters = Array.isArray(data.characters) && data.characters.length > 0;
  const hasThemes = Array.isArray(data.themes) && data.themes.length > 0;
  const hasStreaming = Array.isArray(data.streamingLinks) && data.streamingLinks.length > 0;

  // Se não houver NENHUM dado real (por falha de rede temporária), NÃO PERSISTE!
  if (!hasCharacters && !hasThemes && !hasStreaming) {
    return;
  }

  const toSave: DynamicAnimeRichData = {
    ...data,
    cachedAt: Date.now(),
  };

  try {
    const raw = JSON.stringify(toSave);
    if (anime.mal_id) {
      localStorage.setItem(getAnimeStorageKey(anime.mal_id), raw);
    }
    if (anime.title) {
      localStorage.setItem(getAnimeStorageKey(anime.title), raw);
    }
  } catch (err) {
    console.debug('Erro ao persistir metadados do anime:', err);
  }
}

/**
 * Verifica se os metadados ricos estão incompletos ou precisam de busca na API.
 */
export function isAnimeRichDataIncomplete(data: DynamicAnimeRichData | null): boolean {
  if (!data) return true;
  const hasCharacters = Array.isArray(data.characters) && data.characters.length > 0;
  const hasThemes = Array.isArray(data.themes) && data.themes.length > 0;
  const hasPlayableThemes = hasThemes && data.themes.some((t) => Boolean(t.videoUrl || t.audioUrl || t.youtubeVideoId));
  const hasStreaming = Array.isArray(data.streamingLinks) && data.streamingLinks.length > 0;

  // Se não tem absolutamente nenhum dado rico, está incompleto
  if (!hasCharacters && !hasThemes && !hasStreaming) {
    return true;
  }

  // Se os temas foram gravados sem mídias de vídeo/áudio ou YouTube ID, marca como incompleto para auto-recuperar a reprodução
  if (hasThemes && (!hasPlayableThemes || data.themes.some((t) => !t.videoUrl && !t.youtubeVideoId))) {
    return true;
  }

  // Se tem mais de 7 dias, está desatualizado
  if (data.cachedAt && Date.now() - data.cachedAt > RICH_DATA_TTL) {
    return true;
  }

  return false;
}

/**
 * 1. O "SUPER-PACOTE ÚNICO" VIA ANILIST GRAPHQL
 * Em UMA ÚNICA requisição HTTP (tempo de resposta ~250-400ms):
 * - Banner HD oficial
 * - Trailer oficial do YouTube
 * - Estúdios e Gêneros
 * - Streamers oficiais disponíveis (Crunchyroll, Netflix, Disney+, Prime Video, Max, etc.)
 * - 25 personagens com seus respectivos Dubladores Japoneses (Seiyuu) e fotos HD
 */
async function fetchConsolidatedAniListAnimeData(
  malId: number | null,
  title: string
): Promise<{
  characters: AnimeCharacterItem[];
  streamingLinks: AnimeStreamingLink[];
  trailerUrl: string | null;
  bannerUrl: string | null;
  mal_id: number | null;
} | null> {
  const query = `
    query ($idMal: Int, $search: String) {
      Media(idMal: $idMal, search: $search, type: ANIME) {
        id
        idMal
        bannerImage
        trailer { id site }
        studios(isMain: true) { nodes { name } }
        externalLinks { site url icon }
        characters(sort: [ROLE, ID], perPage: 25) {
          edges {
            role
            node {
              id
              name { full native }
              image { large }
            }
            voiceActors(language: JAPANESE) {
              id
              name { full }
              image { large }
            }
          }
        }
      }
    }
  `;

  const variables: Record<string, unknown> = {};
  if (malId && malId > 0) {
    variables.idMal = malId;
  } else if (title && title.trim()) {
    variables.search = title.trim();
  } else {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000); // 9 segundos tolerantes

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const media = json.data?.Media;
    if (!media) return null;

    // 1. Mapeia Personagens com Dubladores (Seiyuu)
    const characters: AnimeCharacterItem[] = (media.characters?.edges || []).map((edge: any) => {
      const va = edge.voiceActors?.[0];
      return {
        id: edge.node?.id || Math.random(),
        name: edge.node?.name?.full || edge.node?.name?.native || 'Personagem',
        role: edge.role === 'MAIN' ? 'Principal' : 'Coadjuvante',
        imageUrl: edge.node?.image?.large || '',
        voiceActor: va
          ? {
              id: va.id || 0,
              name: va.name?.full || 'Dublador Oficial',
              language: 'Japonês',
              imageUrl: va.image?.large || undefined,
            }
          : undefined,
      };
    });

    // 2. Mapeia Streaming Oficial (Filtra canais irrelevantes, mantém plataformas de exibição)
    const streamingLinks: AnimeStreamingLink[] = [];
    const validPlatforms = [
      { key: 'crunchyroll', name: 'Crunchyroll', icon: 'https://www.crunchyroll.com/favicon.ico' },
      { key: 'netflix', name: 'Netflix', icon: 'https://assets.nflxext.com/us/ffe/siteui/common/icons/nficon2016.ico' },
      { key: 'prime', name: 'Prime Video', icon: 'https://m.media-amazon.com/images/G/01/digital/video/web/favicon-32x32.png' },
      { key: 'amazon', name: 'Prime Video', icon: 'https://m.media-amazon.com/images/G/01/digital/video/web/favicon-32x32.png' },
      { key: 'disney', name: 'Disney+', icon: 'https://static-assets.bamgrid.com/product/disneyplus/favicons/favicon.ico' },
      { key: 'max', name: 'Max', icon: 'https://www.max.com/favicon.ico' },
      { key: 'hbo', name: 'Max', icon: 'https://www.max.com/favicon.ico' },
      { key: 'hidive', name: 'HIDIVE', icon: 'https://www.hidive.com/favicon.ico' },
      { key: 'bilibili', name: 'Bilibili', icon: 'https://www.bilibili.tv/favicon.ico' },
    ];

    const seenSites = new Set<string>();
    for (const link of media.externalLinks || []) {
      const siteLower = (link.site || '').toLowerCase();
      const urlLower = (link.url || '').toLowerCase();

      // Ignora redes sociais ou plataformas de vídeo livre
      if (siteLower.includes('twitter') || siteLower.includes('youtube') || siteLower.includes('tiktok') || siteLower.includes('official site')) {
        continue;
      }

      for (const plat of validPlatforms) {
        if ((siteLower.includes(plat.key) || urlLower.includes(plat.key)) && !seenSites.has(plat.name)) {
          streamingLinks.push({
            name: plat.name,
            url: link.url,
          });
          seenSites.add(plat.name);
          break;
        }
      }
    }

    // 3. Trailer oficial
    let trailerUrl: string | null = null;
    if (media.trailer?.id && media.trailer?.site === 'youtube') {
      trailerUrl = `https://www.youtube.com/watch?v=${media.trailer.id}`;
    }

    return {
      characters,
      streamingLinks,
      trailerUrl,
      bannerUrl: media.bannerImage || null,
      mal_id: media.idMal || null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

// Controle de revalidações em andamento para não disparar chamadas duplicadas
const pendingRevalidations = new Set<string>();

/**
 * Revalida metadados ricos em segundo plano e notifica modais abertos
 */
function triggerBackgroundRichDataRevalidation(
  anime: { mal_id?: number; id?: string; title: string; trailerUrl?: string | null; bannerUrl?: string | null }
): void {
  const key = String(anime.mal_id || anime.title || '').trim().toLowerCase();
  if (!key || pendingRevalidations.has(key)) return;

  pendingRevalidations.add(key);

  setTimeout(async () => {
    try {
      await getOrFetchAnimeRichData(anime, true);
    } catch (e) {
      console.debug('Revalidação em segundo plano ignorada:', e);
    } finally {
      pendingRevalidations.delete(key);
    }
  }, 100);
}

/**
 * Obtém os metadados ricos de um anime:
 * 1. Se já existir no armazém e for válido, retorna instantaneamente em 0ms.
 * 2. Se for antigo (>12h), dispara revalidação silenciosa em segundo plano sem travar a tela.
 * 3. Se for novo ou incompleto, dispara a busca unificada:
 *    - Pacote Consolidado AniList GraphQL (Personagens, Dubladores, Streaming, Trailer e Banner)
 *    - Pacote Dedicado AnimeThemes (Músicas completas com áudio)
 *    - Fallback inteligente com Jikan/Shikimori apenas para o que faltar
 * 4. Salva no armazém compartilhado apenas se contiver dados reais e emite evento de sincronização.
 */
export async function getOrFetchAnimeRichData(
  anime: { mal_id?: number; id?: string; title: string; trailerUrl?: string | null; bannerUrl?: string | null; userId?: string },
  forceRefresh = false
): Promise<DynamicAnimeRichData> {
  const existing = getPersistedAnimeRichData(anime);

  // Se já existir dados completos e não for forçado, entrega instantâneo em 0ms
  if (!forceRefresh && existing && !isAnimeRichDataIncomplete(existing)) {
    // Se o dado tiver mais de 12 horas, dispara a revalidação em segundo plano sem prender o usuário
    if (isAnimeRichDataStale(existing)) {
      triggerBackgroundRichDataRevalidation(anime);
    }
    return existing;
  }

  let malId = anime.mal_id || (existing?.mal_id ?? 0);
  const title = anime.title || '';
  let resolvedTrailerUrl: string | null = anime.trailerUrl || existing?.trailerUrl || null;
  let resolvedBannerUrl: string | null = anime.bannerUrl || existing?.bannerUrl || null;

  // 1. DISPARA EM PARALELO: Super-Pacote AniList + Músicas AnimeThemes
  const [aniListResult, themesMediaResult, recommendationsResult] = await Promise.allSettled([
    fetchConsolidatedAniListAnimeData(malId || null, title),
    title || malId ? fetchAnimeThemesMedia(title, malId || undefined) : Promise.resolve([]),
    malId || title ? getAnimeRecommendations(malId, title) : Promise.resolve([]),
  ]);

  let finalCharacters: AnimeCharacterItem[] = [];
  let finalStreaming: AnimeStreamingLink[] = [];

  const aniData = aniListResult.status === 'fulfilled' ? aniListResult.value : null;

  if (aniData) {
    if (aniData.characters.length > 0) finalCharacters = aniData.characters;
    if (aniData.streamingLinks.length > 0) finalStreaming = aniData.streamingLinks;
    if (!resolvedTrailerUrl && aniData.trailerUrl) resolvedTrailerUrl = aniData.trailerUrl;
    if (!resolvedBannerUrl && aniData.bannerUrl) resolvedBannerUrl = aniData.bannerUrl;
    if (!malId && aniData.mal_id) malId = aniData.mal_id;
  }

  const fetchedThemes = themesMediaResult.status === 'fulfilled' ? themesMediaResult.value : [];
  const fetchedRecs = recommendationsResult.status === 'fulfilled' ? recommendationsResult.value : [];
  let finalThemes = fetchedThemes;

  // Se o malId foi identificado agora e os temas não possuem vídeo ou YouTube ID, enriquece com o fallback
  if (malId && (finalThemes.length === 0 || finalThemes.some((t) => !t.videoUrl && !t.youtubeVideoId))) {
    try {
      const enriched = await fetchAnimeThemesMedia(title, malId);
      if (enriched.length > 0) {
        finalThemes = enriched;
      }
    } catch {}
  }

  // 2. CASCATA INTELIGENTE DE FALLBACK (Acionada APENAS se o AniList não tiver personagens ou streaming)
  if (finalCharacters.length === 0 || finalStreaming.length === 0) {
    try {
      const fallbackTasks: Promise<any>[] = [];
      if (finalCharacters.length === 0 && (malId || title)) {
        fallbackTasks.push(getAggregatedCharacters(malId, title).catch(() => []));
      } else {
        fallbackTasks.push(Promise.resolve([]));
      }

      if (finalStreaming.length === 0 && (malId || title)) {
        fallbackTasks.push(getAggregatedStreamingLinks(malId, title).catch(() => []));
      } else {
        fallbackTasks.push(Promise.resolve([]));
      }

      const [fallbackChars, fallbackStreams] = await Promise.all(fallbackTasks);

      if (finalCharacters.length === 0 && Array.isArray(fallbackChars) && fallbackChars.length > 0) {
        finalCharacters = fallbackChars;
      }
      if (finalStreaming.length === 0 && Array.isArray(fallbackStreams) && fallbackStreams.length > 0) {
        finalStreaming = fallbackStreams.filter(
          (l) => !l.name.toLowerCase().includes('youtube') && !l.url.toLowerCase().includes('youtube')
        );
      }
    } catch (e) {
      console.debug('Fallback em cascata silencioso:', e);
    }
  }

  // 3. Auto-cura de trailer e banner se ainda não existirem
  if (!resolvedTrailerUrl && (malId || title)) {
    try {
      const foundTrailer = await fetchOfficialAnimeTrailer(title, malId || null);
      if (foundTrailer) resolvedTrailerUrl = foundTrailer;
    } catch {}
  }

  if (!resolvedBannerUrl && (malId || title)) {
    try {
      const fresh = await fetchFreshAnimeDetails(title, malId || null);
      if (fresh) {
        if (!malId && fresh.mal_id) malId = fresh.mal_id;
        if (!resolvedTrailerUrl && fresh.trailerUrl) resolvedTrailerUrl = fresh.trailerUrl;
        if (fresh.bannerUrl) resolvedBannerUrl = fresh.bannerUrl;
      }
    } catch {}
  }

  const richData: DynamicAnimeRichData = {
    streamingLinks: finalStreaming.length > 0 ? finalStreaming : existing?.streamingLinks || [],
    characters: finalCharacters.length > 0 ? finalCharacters : existing?.characters || [],
    themes: finalThemes.length > 0 ? finalThemes : existing?.themes || [],
    recommendations: fetchedRecs.length > 0 ? fetchedRecs : existing?.recommendations || [],
    trailerUrl: resolvedTrailerUrl,
    bannerUrl: resolvedBannerUrl,
    mal_id: malId || null,
  };

  // Salva no armazenamento persistente APENAS se houver dados reais
  savePersistedAnimeRichData(
    { mal_id: malId || anime.mal_id, id: anime.id, title: anime.title },
    richData
  );

  // Notifica imediatamente qualquer modal que esteja aberto na tela com os dados atualizados
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('wanime_rich_data_updated', {
        detail: {
          mal_id: malId || anime.mal_id,
          title: anime.title,
          data: richData,
        },
      })
    );
  }

  // Sincroniza campos essenciais no Firestore caso o anime possua ID registrado
  if (anime.id) {
    const currentUid = auth.currentUser?.uid;
    const currentEmail = auth.currentUser?.email;
    const isOwner =
      !anime.userId ||
      (currentUid && anime.userId === currentUid) ||
      (currentEmail && isDeveloperEmail(currentEmail));

    if (isOwner) {
      const updates: Record<string, unknown> = {};
      if (!anime.mal_id && malId) updates.mal_id = malId;
      if (!anime.trailerUrl && resolvedTrailerUrl) updates.trailerUrl = resolvedTrailerUrl;
      if (!anime.bannerUrl && resolvedBannerUrl) updates.bannerUrl = resolvedBannerUrl;
      if (Object.keys(updates).length > 0) {
        updateAnime(anime.id, updates as any).catch((err) => {
          console.debug('Atualização de metadados em segundo plano ignorada:', err);
        });
      }
    }
  }

  return richData;
}

// Controle de fila em segundo plano para não sobrecarregar as APIs
let isPrefetching = false;

/**
 * Pré-carregador silencioso em segundo plano para a coleção do usuário
 */
export async function prefetchUserCollectionMetadata(animes: Anime[]): Promise<void> {
  if (isPrefetching || !animes || animes.length === 0) return;
  isPrefetching = true;

  try {
    const missingMetadataList = animes.filter((a) => {
      const hasCached = getPersistedAnimeRichData(a);
      return !hasCached;
    });

    if (missingMetadataList.length === 0) {
      return;
    }

    const queue = missingMetadataList.slice(0, 25);

    for (const anime of queue) {
      try {
        await getOrFetchAnimeRichData(anime, false);
      } catch (err) {
        console.debug('Prefetch silencioso individual falhou:', err);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    isPrefetching = false;
  }
}

