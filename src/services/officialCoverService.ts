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
 * (temporadas, filmes, OVAs, especiais) através das APIs AniList e Jikan.
 * 
 * Regra de Ouro: AniList é o motor primário ultrarrápido (retorna em 300-500ms).
 * O Jikan roda apenas como complemento/fallback e com timeout estrito de 2s para NUNCA travar a tela.
 */
export async function searchOfficialHighResCovers(
  query: string
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

  // 1. Busca Primária via AniList GraphQL (extraLarge - máxima resolução, 1000px+)
  const anilistPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

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
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        const json = await res.json();
        const list = json?.data?.Page?.media || [];

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
      console.warn('Erro ao buscar capas HD na AniList:', err);
    }
  })();

  // 2. Busca Complementar via Jikan (MyAnimeList WebP Large) com timeout estrito de 2s
  const jikanPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanQuery)}&limit=15&sfw=true`;
      const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
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
    } catch {
      // Jikan falhou ou expirou timeout - ignorado com segurança pois AniList é o motor primário
    }
  })();

  // Se AniList responder rápido com resultados, não espera Jikan travar
  await anilistPromise;
  if (coversMap.size === 0) {
    // Se AniList não retornou nada, aguarda Jikan com o timeout de 2s
    await jikanPromise;
  } else {
    // Se AniList já encontrou capas, aguarda Jikan no máximo 600ms a mais ou prossegue
    await Promise.race([
      jikanPromise,
      new Promise((resolve) => setTimeout(resolve, 600)),
    ]);
  }

  const result = Array.from(coversMap.values());
  if (result.length > 0) {
    coversCache.set(cacheKey, result);
  }
  return result;
}
