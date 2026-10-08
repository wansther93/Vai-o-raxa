/**
 * Serviço de Capas Oficiais em Alta Resolução (Full HD / Ultra HD)
 * 
 * Fontes oficiais:
 * 1. AniList GraphQL (coverImage.extraLarge - 1000px+)
 * 2. Jikan / MyAnimeList (images.webp.large_image_url e images.jpg.large_image_url)
 * 
 * IMPORTANTE:
 * Este serviço é ESTRITAMENTE VISUAL.
 * A escolha de capa preenche exclusivamente a imagem do card/pôster ('coverUrl').
 * NUNCA altera IDs, número de episódios, sinopses, trailers ou a árvore de temporadas.
 */

export interface OfficialCoverItem {
  id: string;
  title: string;
  imageUrl: string;
  year?: number;
  format?: string;
  source: 'AniList HD' | 'MyAnimeList HD';
}

const coversCache = new Map<string, OfficialCoverItem[]>();

/**
 * Busca capas oficiais em altíssima resolução de todas as mídias da franquia
 * (temporadas, filmes, OVAs, especiais) através da API AniList como primária.
 * 
 * Regra de Ouro:
 * 1. AniList (GraphQL) é o motor primário ultrarrápido (200-400ms).
 * 2. Jikan (MyAnimeList) roda ESTRITAMENTE como contingência se e somente se a AniList falhar ou vier vazia.
 * 3. NUNCA dispara chamadas paralelas ao Jikan para não estressar a taxa de 3 req/s.
 */
export async function searchOfficialHighResCovers(
  query: string,
  signal?: AbortSignal
): Promise<OfficialCoverItem[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length < 2) {
    return [];
  }

  const cacheKey = cleanQuery.toLowerCase();
  if (coversCache.has(cacheKey)) {
    return coversCache.get(cacheKey)!;
  }

  const coversMap = new Map<string, OfficialCoverItem>();

  // 1. Busca Primária Exclusiva via AniList GraphQL (extraLarge - máxima resolução, 1000px+)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const onParentAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onParentAbort, { once: true });
    }

    const graphqlQuery = `
      query ($search: String) {
        Page(page: 1, perPage: 25) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id
            title {
              romaji
              english
              native
            }
            format
            popularity
            seasonYear
            startDate {
              year
            }
            coverImage {
              extraLarge
              large
            }
          }
        }
      }
    `;

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: graphqlQuery,
        variables: { search: cleanQuery },
      }),
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onParentAbort);
    });

    if (res.ok) {
      const json = await res.json();
      const rawList = json?.data?.Page?.media || [];
      const qLower = cleanQuery.toLowerCase().trim();

      const getCoverScore = (item: any): number => {
        const rom = (item.title?.romaji || '').toLowerCase().trim();
        const eng = (item.title?.english || '').toLowerCase().trim();
        const nat = (item.title?.native || '').toLowerCase().trim();
        const fmt = (item.format || '').toUpperCase();
        const pop = Number(item.popularity) || 0;

        let score = 0;
        if (rom === qLower || eng === qLower || nat === qLower) score += 1000000;
        else if (rom.startsWith(qLower) || eng.startsWith(qLower)) score += 60000;
        else if (rom.includes(qLower) || eng.includes(qLower)) score += 25000;

        if (fmt === 'TV') score += 50000;
        else if (fmt === 'MOVIE') score += 40000;
        else if (fmt === 'OVA' || fmt === 'ONA') score += 30000;
        else if (fmt === 'SPECIAL') score += 10000;
        else if (fmt === 'MUSIC') score -= 500000;

        score += Math.min(pop, 500000);
        return score;
      };

      const list = [...rawList]
        .filter((item: any) => (item.format || '').toUpperCase() !== 'MUSIC')
        .sort((a: any, b: any) => getCoverScore(b) - getCoverScore(a));

      for (const item of list) {
        const img = item.coverImage?.extraLarge || item.coverImage?.large;
        if (img && !coversMap.has(img)) {
          const title = item.title?.english || item.title?.romaji || item.title?.native || cleanQuery;
          const year = item.seasonYear || item.startDate?.year;
          coversMap.set(img, {
            id: `anilist_${item.id}`,
            title,
            imageUrl: img,
            year: year || undefined,
            format: item.format || 'TV',
            source: 'AniList HD',
          });
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return [];
    console.warn('AniList capas indisponível, acionando fallback Jikan...', err);
  }

  // 2. Se a AniList já encontrou capas com sucesso, RETORNA IMEDIATAMENTE (zero chamadas secundárias)
  if (coversMap.size > 0) {
    const result = Array.from(coversMap.values());
    coversCache.set(cacheKey, result);
    return result;
  }

  // 3. Fallback estrito via Jikan (SOMENTE se AniList falhou ou retornou 0 capas)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const onParentAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onParentAbort, { once: true });
    }

    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanQuery)}&limit=12&sfw=true`;
    const res = await fetch(url, { signal: controller.signal }).finally(() => {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onParentAbort);
    });

    if (res.ok) {
      const json = await res.json();
      const list = json?.data || [];

      for (const item of list) {
        const img =
          item.images?.webp?.large_image_url ||
          item.images?.jpg?.large_image_url;
        if (img && !coversMap.has(img)) {
          const title = item.title_english || item.title || cleanQuery;
          const year = item.year || item.aired?.prop?.from?.year;
          coversMap.set(img, {
            id: `jikan_${item.mal_id}`,
            title,
            imageUrl: img,
            year: year || undefined,
            format: item.type || 'TV',
            source: 'MyAnimeList HD',
          });
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return [];
    console.warn('Fallback Jikan capas também falhou:', err);
  }

  const result = Array.from(coversMap.values());
  if (result.length > 0) {
    coversCache.set(cacheKey, result);
  }
  return result;
}
