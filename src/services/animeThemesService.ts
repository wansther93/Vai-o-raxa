/**
 * Serviço de Músicas, Temas de Abertura (OP) e Encerramento (ED) via AnimeThemes.moe API (100% Grátis)
 * Permite reproduzir prévias de áudio/vídeo oficiais das músicas lendárias de animes.
 */

import { getAnimeThemes } from './jikanService';
import { fetchShikimoriVideos } from './shikimoriService';

export interface AnimeThemeMedia {
  id: string;
  themeType: 'OP' | 'ED';
  sequence: number; // ex: OP1, OP2, ED1
  songTitle: string;
  artistName: string;
  episodes?: string;
  videoUrl?: string;
  audioUrl?: string;
  youtubeVideoId?: string;
  resolution?: number; // 720, 1080
}

/**
 * Converte strings brutas de tema do MyAnimeList/Jikan em objetos estruturados de AnimeThemeMedia
 */
function parseJikanThemeString(rawStr: string, type: 'OP' | 'ED', index: number): AnimeThemeMedia {
  const cleaned = rawStr.trim();
  // Padrão: 1: "Song Title" by Artist Name (eps 1-12)
  const regex = /^(?:#?(\d+):\s*)?["“]?([^"”]+)["”]?\s*(?:by\s+([^(\n]+))?(?:\s*\(([^)]+)\))?/i;
  const match = cleaned.match(regex);

  let sequence = index + 1;
  let songTitle = cleaned;
  let artistName = 'Artista Oficial';
  let episodes: string | undefined;

  if (match) {
    if (match[1]) sequence = parseInt(match[1], 10) || sequence;
    if (match[2]) songTitle = match[2].trim();
    if (match[3]) artistName = match[3].trim();
    if (match[4]) episodes = match[4].trim();
  }

  return {
    id: `mal_theme_${type.toLowerCase()}_${sequence}_${index}`,
    themeType: type,
    sequence,
    songTitle,
    artistName,
    episodes,
    resolution: 720,
  };
}

function cleanAnimeTitle(raw: string): string {
  return raw
    .replace(/:\s*season\s*\d+/gi, '')
    .replace(/\s*\d+(?:nd|rd|th|st)?\s*season/gi, '')
    .replace(/:\s*part\s*\d+/gi, '')
    .replace(/\s*temporada\s*\d+/gi, '')
    .replace(/\s*2nd\s*season/gi, '')
    .replace(/\s*3rd\s*season/gi, '')
    .replace(/\s*4th\s*season/gi, '')
    .replace(/\s*the\s*final\s*season/gi, '')
    .trim();
}

async function queryAnimeThemes(searchName: string): Promise<AnimeThemeMedia[]> {
  try {
    const url = `https://api.animethemes.moe/anime?filter[name]=${encodeURIComponent(
      searchName
    )}&include=animethemes.animethemeentries.videos.audio,animethemes.song.artists`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const json = await res.json();
    const animeList = json?.anime;
    if (!Array.isArray(animeList) || animeList.length === 0) return [];

    const exactMatch = animeList.find(
      (a: any) => a.name?.toLowerCase().trim() === searchName.toLowerCase().trim()
    );
    const animeObj = exactMatch || animeList[0];
    const themes = animeObj?.animethemes;
    if (!Array.isArray(themes) || themes.length === 0) return [];

    const list: AnimeThemeMedia[] = [];

    themes.forEach((th: any) => {
      const type = th.type === 'OP' ? 'OP' : 'ED';
      const sequence = th.sequence || 1;
      const songTitle = th.song?.title || `${type} ${sequence}`;

      let artistName = 'Artista Oficial';
      if (Array.isArray(th.song?.artists) && th.song.artists.length > 0) {
        artistName = th.song.artists
          .map((a: any) => a.name)
          .filter(Boolean)
          .join(', ') || 'Artista Oficial';
      }

      let videoUrl: string | undefined;
      let audioUrl: string | undefined;
      let resolution = 720;
      let episodes: string | undefined;

      if (Array.isArray(th.animethemeentries)) {
        for (const entry of th.animethemeentries) {
          if (!episodes && entry.episodes) episodes = entry.episodes;
          if (Array.isArray(entry.videos)) {
            for (const vid of entry.videos) {
              if (vid.link) {
                videoUrl = vid.link;
                if (vid.resolution) resolution = vid.resolution;
                if (vid.audio?.link) audioUrl = vid.audio.link;
                break;
              }
            }
          }
          if (videoUrl) break;
        }
      }

      list.push({
        id: `at_${th.slug || `${type}_${sequence}`}_${th.id || sequence}`,
        themeType: type,
        sequence,
        songTitle,
        artistName,
        episodes,
        videoUrl,
        audioUrl,
        resolution,
      });
    });

    return list;
  } catch (err) {
    console.debug('AnimeThemes query aviso:', err);
    return [];
  }
}

export async function fetchAnimeThemesMedia(animeTitle: string, malId?: number): Promise<AnimeThemeMedia[]> {
  if (!animeTitle && !malId) return [];

  let results: AnimeThemeMedia[] = [];
  const cleanTitle = cleanAnimeTitle(animeTitle || '');

  // 1. Tenta AnimeThemes com o título limpo
  if (cleanTitle) {
    results = await queryAnimeThemes(cleanTitle);
  }

  // 2. Se não achou e o título tem separador de arco/subtítulo (ex: "Shingeki no Kyojin: The Final Season" -> "Shingeki no Kyojin")
  if (results.length === 0 && cleanTitle.includes(':')) {
    const baseTitle = cleanTitle.split(':')[0].trim();
    if (baseTitle && baseTitle !== cleanTitle) {
      results = await queryAnimeThemes(baseTitle);
    }
  }

  // 3. Se ainda não achou e o título tem hífen (ex: "Bleach - Sennen Kessen-hen")
  if (results.length === 0 && cleanTitle.includes(' - ')) {
    const baseTitle = cleanTitle.split(' - ')[0].trim();
    if (baseTitle && baseTitle !== cleanTitle) {
      results = await queryAnimeThemes(baseTitle);
    }
  }

  // 4. Se AnimeThemes.moe não encontrou ou retornou vazio, fallback no Jikan/MAL Themes
  if (results.length === 0 && (malId || animeTitle)) {
    try {
      const jikanThemes = await getAnimeThemes(malId || 0, animeTitle);
      const opList = (jikanThemes.openings || []).map((op, idx) => parseJikanThemeString(op, 'OP', idx));
      const edList = (jikanThemes.endings || []).map((ed, idx) => parseJikanThemeString(ed, 'ED', idx));
      results = [...opList, ...edList];
    } catch (jErr) {
      console.warn('Jikan themes fallback falhou:', jErr);
    }
  }

  // 5. Fallback via Shikimori Videos: Para animes e músicas que não possuem vídeo no AnimeThemes
  // Traz os links e IDs do YouTube em lote de uma única vez para preencher o player
  if (malId && (results.length === 0 || results.some((r) => !r.videoUrl))) {
    try {
      const shikiVideos = await fetchShikimoriVideos(malId);
      const shikiOps = shikiVideos.filter((v) => v.kind === 'op' && Boolean(v.youtubeId));
      const shikiEds = shikiVideos.filter((v) => v.kind === 'ed' && Boolean(v.youtubeId));

      if (results.length === 0) {
        // Se nenhuma música veio das fontes anteriores, monta a lista diretamente dos vídeos do Shikimori
        shikiOps.forEach((op, idx) => {
          const seq = op.sequence || idx + 1;
          results.push({
            id: `shiki_op_${seq}_${op.id}`,
            themeType: 'OP',
            sequence: seq,
            songTitle: op.name || `Abertura ${seq}`,
            artistName: 'Artista Oficial',
            youtubeVideoId: op.youtubeId,
            resolution: 720,
          });
        });

        shikiEds.forEach((ed, idx) => {
          const seq = ed.sequence || idx + 1;
          results.push({
            id: `shiki_ed_${seq}_${ed.id}`,
            themeType: 'ED',
            sequence: seq,
            songTitle: ed.name || `Encerramento ${seq}`,
            artistName: 'Artista Oficial',
            youtubeVideoId: ed.youtubeId,
            resolution: 720,
          });
        });
      } else {
        // Se já temos as faixas (via Jikan ou AnimeThemes), associa o ID do YouTube exclusivamente nas que não têm vídeo direto
        results.forEach((theme) => {
          if (theme.videoUrl) return; // Mantém intacto o player oficial do AnimeThemes!

          const pool = theme.themeType === 'OP' ? shikiOps : shikiEds;
          // Tenta correspondência pela sequência exata (ex: OP1 com seq 1)
          let matched = pool.find((v) => v.sequence === theme.sequence);
          // Se não encontrou por sequência exata, tenta por índice relativo
          if (!matched && pool.length > 0) {
            const sameTypeIndex = results
              .filter((t) => t.themeType === theme.themeType)
              .indexOf(theme);
            if (sameTypeIndex >= 0 && sameTypeIndex < pool.length) {
              matched = pool[sameTypeIndex];
            }
          }

          if (matched?.youtubeId) {
            theme.youtubeVideoId = matched.youtubeId;
          }
        });
      }
    } catch (shikiErr) {
      console.warn('Fallback Shikimori vídeos aviso:', shikiErr);
    }
  }

  return results;
}
