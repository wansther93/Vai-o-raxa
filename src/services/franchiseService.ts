/**
 * Serviço de Detecção e Gestão de Franquias & Árvore de Temporadas e Arcos (100% Gratuito)
 * Conecta todas as temporadas, arcos, filmes e OVAs de uma obra em uma linha do tempo unificada.
 * Suporta busca recursiva profunda, filtros audiovisuais estritos e presets canônicos.
 */
import type { Anime, AnimeSeasonOrArc, FranchiseTreeItem, AnimeArcPreset, FranchiseCandidate } from '../types';
import { searchAnimeMetadata } from './jikanService';

// Normalizador de título de franquia (algoritmo puramente genérico e agnóstico a títulos de animes)
// Remove sufixos universais de temporadas, partes, formatos e delimitadores comuns sem listas hardcoded.
export function getFranchiseRootTitle(title: string): string {
  if (!title) return '';
  let cleaned = title.toLowerCase().trim();

  // 1. Remove sufixos universais de temporada e partes (ex: ": Season 2", "2nd Season", "Parte 3", "Final Season")
  cleaned = cleaned
    .replace(/:\s*(?:the\s+)?final\s*season.*$/gi, '')
    .replace(/\s*(?:the\s+)?final\s*season.*$/gi, '')
    .replace(/:\s*(?:season|temporada)\s*\d+.*$/gi, '')
    .replace(/\s*(?:season|temporada)\s*\d+.*$/gi, '')
    .replace(/:\s*\d+(?:nd|rd|th|st)?\s*(?:season|temporada).*$/gi, '')
    .replace(/\s*\d+(?:nd|rd|th|st)?\s*(?:season|temporada).*$/gi, '')
    .replace(/:\s*(?:part|parte|cour)\s*\d+.*$/gi, '')
    .replace(/\s*(?:part|parte|cour)\s*\d+.*$/gi, '')
    .replace(/:\s*\d+(?:nd|rd|th|st)?\s*cour.*$/gi, '')
    .replace(/\s*\d+(?:nd|rd|th|st)?\s*cour.*$/gi, '');

  // 2. Remove numerais romanos soltos no final do título (ex: " II", " III", " IV")
  cleaned = cleaned
    .replace(/\s+(?:ii|iii|iv|v|vi)\b.*$/gi, '');

  // 3. Remove identificadores de formato de mídia universais (ex: "(TV)", ": TV")
  cleaned = cleaned
    .replace(/\(tv\)/gi, '')
    .replace(/:\s*tv\b/gi, '');

  // 4. Se o título contiver um subtítulo após dois pontos seguido de espaço e a base for substancial (>= 4 caracteres),
  // a base antes dos dois pontos é a raiz da franquia
  const colonIndex = cleaned.indexOf(':');
  if (colonIndex > 3) {
    const baseBeforeColon = cleaned.slice(0, colonIndex).trim();
    if (baseBeforeColon.length >= 4) {
      cleaned = baseBeforeColon;
    }
  }

  // 5. Limpa pontuação residual e normaliza múltiplos espaços
  cleaned = cleaned
    .replace(/[^\w\s\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Função utilitária de arcos (mantida para compatibilidade de tipos; retorna null pois arcos hardcoded foram eliminados)
 */
export function getPredefinedArcs(_animeTitle: string): AnimeArcPreset[] | null {
  return null;
}

// Formatos estritamente audiovisuais permitidos (exclui shorts, mangás e mídias estáticas)
const ALLOWED_AUDIOVISUAL_FORMATS = new Set(['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL']);

// Cache em memória para resolução instantânea (0ms) da árvore de franquia
export const franchiseTreeMemoryCache = new Map<string, any>();

// Tipos de relações válidas
const VALID_RELATION_TYPES = new Set(['SEQUEL', 'PREQUEL', 'PARENT', 'PARENT_STORY', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'ALTERNATIVE_SETTING', 'ALTERNATIVE_VERSION', 'SUMMARY']);

/**
 * Formata o título da temporada/filme de forma limpa em português a partir dos dados legítimos da API,
 * sem listas hardcoded ou substituições forçadas por nomes de animes específicos.
 */
function formatMediaTitlePT(title: string, format: string, index: number, rootTitle?: string): string {
  const t = title.trim();
  let cleaned = t;

  // Formatação inteligente genérica (remove prefixos redundantes de raiz caso o título da temporada repita a raiz completa)
  if (rootTitle && cleaned.toLowerCase().startsWith(rootTitle.toLowerCase())) {
    const withoutRoot = cleaned.slice(rootTitle.length).replace(/^[:\s-]+/, '').trim();
    // Apenas remove a raiz se o restante for de fato descritivo (não números puros como '100' de Mob Psycho 100)
    const isJustNumbersOrRoman = /^[\d\sIVXLCDM]+$/i.test(withoutRoot);
    if (withoutRoot.length >= 2 && !isJustNumbersOrRoman) {
      cleaned = withoutRoot;
    }
  }

  // Normalização e tradução universal de temporadas e partes para português
  cleaned = cleaned
    .replace(/(\d+)(?:nd|rd|th|st)?\s*season/gi, '$1ª Temporada')
    .replace(/season\s*(\d+)/gi, '$1ª Temporada')
    .replace(/the\s*final\s*season/gi, 'Temporada Final')
    .replace(/final\s*season/gi, 'Temporada Final')
    .replace(/part\s*(\d+)/gi, 'Parte $1')
    .replace(/cour\s*(\d+)/gi, 'Parte $1')
    .replace(/2nd\s*cour/gi, 'Parte 2')
    .replace(/1st\s*cour/gi, 'Parte 1');

  if (format === 'MOVIE') {
    if (!cleaned.toLowerCase().includes('filme') && !cleaned.toLowerCase().includes('movie')) {
      return `Filme: ${cleaned}`;
    }
    return cleaned.replace(/^movie:\s*/i, 'Filme: ');
  }
  
  if (format === 'OVA') {
    if (!cleaned.toLowerCase().includes('ova')) {
      return `OVA: ${cleaned}`;
    }
    return cleaned;
  }

  if (format === 'SPECIAL') {
    if (!cleaned.toLowerCase().includes('especial') && !cleaned.toLowerCase().includes('special')) {
      return `Especial: ${cleaned}`;
    }
    return cleaned;
  }

  return cleaned;
}

/**
 * Filtro de relevância de franquia para evitar poluição em buscas textuais livres
 */
function isRelevantFranchiseNode(
  nodeTitle: string,
  rootWords: string[],
  rootTitle?: string
): boolean {
  if (!nodeTitle) return false;
  const lower = nodeTitle.toLowerCase();

  // Se a raiz tem apenas 1 palavra curta (<= 4 caracteres), requer correspondência exata com limite de palavra
  if (rootWords.length === 1 && rootWords[0].length <= 4) {
    const singleWord = rootWords[0];
    const regex = new RegExp(`\\b${singleWord}\\b`, 'i');
    return regex.test(lower);
  }

  // Pelo menos 1 palavra-chave da raiz deve bater com limite de palavra
  const matchedWords = rootWords.filter(w => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(lower);
  });
  return matchedWords.length > 0;
}

/**
 * Busca Recursiva em Tempo Real da Árvore Genealógica de Franquia (AniList GraphQL Avançado)
 * Combina busca direta por nó + busca abrangente de franquia + exploração bidimensional em grafo (BFS).
 * Percorre prequels e sequels para frente e para trás sem parar em profundidade única.
 */
export async function fetchAnimeFranchiseTree(
  searchQueryOrMalId: string | number,
  exactTitle?: string
): Promise<{
  rootTitle: string;
  franchiseIds: number[];
  items: FranchiseTreeItem[];
  predefinedArcs?: AnimeArcPreset[];
  activeAiringDay?: string | null;
  candidateFranchises?: FranchiseCandidate[];
}> {
  const cacheKey = (exactTitle || String(searchQueryOrMalId)).toLowerCase().trim();
  if (franchiseTreeMemoryCache.has(cacheKey)) {
    return franchiseTreeMemoryCache.get(cacheKey);
  }

  let resolvedMalId: number | null = typeof searchQueryOrMalId === 'number' || /^\d+$/.test(String(searchQueryOrMalId))
    ? Number(searchQueryOrMalId)
    : null;
  let resolvedSearchTitle = exactTitle || String(searchQueryOrMalId);

  // Pré-resolução inteligente: se não temos mal_id direto, busca metadados tolerante a erros de digitação
  if (!resolvedMalId && resolvedSearchTitle.trim().length >= 2) {
    try {
      const candidates = await searchAnimeMetadata(resolvedSearchTitle.trim());
      if (candidates && candidates.length > 0) {
        const top = candidates[0];
        if (top.mal_id) {
          resolvedMalId = top.mal_id;
        }
        if (top.title && !exactTitle) {
          resolvedSearchTitle = top.title;
        }
      }
    } catch (e) {
      console.warn('Pré-resolução fuzzy preliminar falhou:', e);
    }
  }

  const rawSearch = resolvedSearchTitle;
  const rootTitle = getFranchiseRootTitle(rawSearch);
  const arcs = getPredefinedArcs(rawSearch);

  const rootKeywords = rootTitle
    .split(' ')
    .filter(w => w.length >= 3 && !['the', 'and', 'arc', 'hen', 'kara', 'ittara'].includes(w));

  try {
    const isId = resolvedMalId !== null;
    
    // Consulta GraphQL combinada: Busca o Nó Principal com Relações E a Página Completa da Franquia
    const combinedGraphqlQuery = `
      query ($idMal: Int, $search: String, $rootSearch: String) {
        targetMedia: Media(idMal: $idMal, search: $search, type: ANIME) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          status
          nextAiringEpisode {
            airingAt
          }
          format
          episodes
          seasonYear
          startDate {
            year
            month
            day
          }
          coverImage {
            large
            medium
          }
          relations {
            edges {
              relationType
              node {
                id
                idMal
                title {
                  romaji
                  english
                  native
                }
                status
                nextAiringEpisode {
                  airingAt
                }
                format
                episodes
                seasonYear
                startDate {
                  year
                  month
                  day
                }
                coverImage {
                  large
                  medium
                }
              }
            }
          }
        }

        franchiseSearch: Page(page: 1, perPage: 35) {
          media(search: $rootSearch, type: ANIME, sort: [START_DATE, POPULARITY_DESC]) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            status
            nextAiringEpisode {
              airingAt
            }
            format
            episodes
            seasonYear
            startDate {
              year
              month
              day
            }
            coverImage {
              large
              medium
            }
            relations {
              edges {
                relationType
                node {
                  id
                  idMal
                  title {
                    romaji
                    english
                    native
                  }
                  status
                  nextAiringEpisode {
                    airingAt
                  }
                  format
                  episodes
                  seasonYear
                  startDate {
                    year
                    month
                    day
                  }
                  coverImage {
                    large
                    medium
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables: any = {
      rootSearch: rootTitle || rawSearch,
    };

    if (isId && resolvedMalId) {
      variables.idMal = resolvedMalId;
    } else {
      variables.search = rawSearch.trim();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: combinedGraphqlQuery, variables }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      const targetMedia = json?.data?.targetMedia;
      const franchiseList: any[] = json?.data?.franchiseSearch?.media || [];

      // Mapeamento em Grafo para agrupar e desduplicar
      const nodesMap = new Map<number, any>();
      const idsSet = new Set<number>();
      let detectedAiringDay: string | null = null;

      // Função auxiliar para registrar nós válidos
      const processNode = (node: any, relationTypeHint?: string, isDirectRelation = false) => {
        if (!node) return;
        const formatUpper = (node.format || '').toUpperCase();
        
        // 1. Filtro estrito: APENAS mídias audiovisuais (exclui Mangá, Novel, One Shot, Música)
        if (!ALLOWED_AUDIOVISUAL_FORMATS.has(formatUpper)) {
          return;
        }

        const malId = node.idMal || node.id;
        if (!malId) return;

        // Detecta dia de transmissão se a temporada estiver ativamente no ar (RELEASING)
        const isCurrentlyReleasing = node.status === 'RELEASING';
        if (isCurrentlyReleasing && node.nextAiringEpisode?.airingAt && !detectedAiringDay) {
          try {
            const airingDate = new Date(node.nextAiringEpisode.airingAt * 1000);
            const formatter = new Intl.DateTimeFormat('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              weekday: 'long',
            });
            const weekdayRaw = formatter.format(airingDate).toLowerCase();
            const DAY_NAMES = [
              'Domingo',
              'Segunda-feira',
              'Terça-feira',
              'Quarta-feira',
              'Quinta-feira',
              'Sexta-feira',
              'Sábado',
            ];
            const matched = DAY_NAMES.find(
              (d) => d.toLowerCase() === weekdayRaw || weekdayRaw.includes(d.toLowerCase())
            );
            detectedAiringDay = matched || DAY_NAMES[airingDate.getDay()];
          } catch (e) {
            console.warn('Erro ao formatar dia de transmissão da franquia:', e);
          }
        }

        const romaji = node.title?.romaji || '';
        const english = node.title?.english || '';
        const bestTitle = romaji || english || node.title?.native || 'Obra';

        // Filtro contra paródias, esquetes e curtas paralelos não-canônicos
        const titleCheck = `${bestTitle} ${english} ${node.title?.native || ''}`.toLowerCase();
        if (/(?:mugiwara\s*theater|mugiwara\s*gekijou|parody|paródia|chibi|yonkoma|omake|sd\s*chara|fan\s*letter|special\s*program)/i.test(titleCheck)) {
          return;
        }

        // 2. Filtro de relevância de franquia para itens vindos de busca textual livre
        if (!isDirectRelation && rootKeywords.length > 0 && !isRelevantFranchiseNode(`${bestTitle} ${english}`, rootKeywords, rootTitle)) {
          return;
        }

        idsSet.add(malId);
        if (node.id) idsSet.add(node.id);

        const episodesCount = (typeof node.episodes === 'number' && node.episodes > 0) ? node.episodes : null;

        if (!nodesMap.has(malId)) {
          nodesMap.set(malId, {
            id: malId,
            aniListId: node.id,
            title: bestTitle,
            japaneseTitle: node.title?.native,
            englishTitle: english,
            format: formatUpper,
            episodes: episodesCount,
            seasonYear: node.seasonYear || node.startDate?.year || null,
            startDate: node.startDate ? {
              year: node.startDate.year || null,
              month: node.startDate.month || null,
              day: node.startDate.day || null,
            } : null,
            coverUrl: node.coverImage?.large || node.coverImage?.medium,
            relationType: relationTypeHint || 'main',
          });
        } else if (relationTypeHint && relationTypeHint !== 'main') {
          const existing = nodesMap.get(malId);
          if (existing && (!existing.relationType || existing.relationType === 'main')) {
            existing.relationType = relationTypeHint;
          }
        }
      };

      // Grafo de conexões canônicas para agrupamento inteligente de franquias
      const adjacencyList = new Map<number, Set<number>>();
      const addGraphEdge = (u: number, v: number) => {
        if (!u || !v || u === v) return;
        if (!adjacencyList.has(u)) adjacencyList.set(u, new Set());
        if (!adjacencyList.has(v)) adjacencyList.set(v, new Set());
        adjacencyList.get(u)!.add(v);
        adjacencyList.get(v)!.add(u);
      };

      // Fila de expansão bidimensional (BFS)
      const exploredAniListIds = new Set<number>();
      const pendingAniListIds = new Set<number>();

      const registerRelationEdges = (edges: any[], sourceMalId?: number) => {
        if (!Array.isArray(edges)) return;
        edges.forEach((edge: any) => {
          const edgeType = (edge.relationType || '').toUpperCase();
          if (VALID_RELATION_TYPES.has(edgeType) && edge.node) {
            processNode(edge.node, edgeType.toLowerCase(), true);
            const targetMalId = edge.node.idMal || edge.node.id;
            if (sourceMalId && targetMalId) {
              addGraphEdge(sourceMalId, targetMalId);
            }
            if (edge.node.id && !exploredAniListIds.has(edge.node.id)) {
              pendingAniListIds.add(edge.node.id);
            }
          }
        });
      };

      // 1. Processa o nó alvo pesquisado
      if (targetMedia) {
        if (targetMedia.id) exploredAniListIds.add(targetMedia.id);
        processNode(targetMedia, 'main', true);
        if (targetMedia.relations?.edges) {
          registerRelationEdges(targetMedia.relations.edges, targetMedia.idMal || targetMedia.id);
        }
      }

      // 2. Processa os nós encontrados na busca abrangente da franquia
      franchiseList.forEach((mediaItem) => {
        if (mediaItem.id) exploredAniListIds.add(mediaItem.id);
        processNode(mediaItem, 'main', false);
        if (mediaItem.relations?.edges) {
          registerRelationEdges(mediaItem.relations.edges, mediaItem.idMal || mediaItem.id);
        }
      });

      // 3. BUSCA BIDIMENSIONAL COMPLETA (BFS):
      // Percorre prequels (para trás) e sequels (para frente) em profundidade.
      // 1 rodada rápida é suficiente para expandir conexões indiretas sem sobrecarregar a API com 4 loops seguidos.
      let expansionRounds = 0;
      const MAX_EXPANSION_ROUNDS = 1;
      while (pendingAniListIds.size > 0 && expansionRounds < MAX_EXPANSION_ROUNDS) {
        expansionRounds++;
        const currentBatch = Array.from(pendingAniListIds).slice(0, 45);
        currentBatch.forEach((id) => {
          pendingAniListIds.delete(id);
          exploredAniListIds.add(id);
        });

        if (currentBatch.length === 0) break;

        try {
          const batchQuery = `
            query ($ids: [Int]) {
              Page(page: 1, perPage: 50) {
                media(id_in: $ids, type: ANIME) {
                  id
                  idMal
                  title {
                    romaji
                    english
                    native
                  }
                  status
                  nextAiringEpisode {
                    airingAt
                  }
                  format
                  episodes
                  seasonYear
                  startDate {
                    year
                    month
                    day
                  }
                  coverImage {
                    large
                    medium
                  }
                  relations {
                    edges {
                      relationType
                      node {
                        id
                        idMal
                        title {
                          romaji
                          english
                          native
                        }
                        status
                        format
                        episodes
                        seasonYear
                        startDate {
                          year
                          month
                          day
                        }
                        coverImage {
                          large
                          medium
                        }
                      }
                    }
                  }
                }
              }
            }
          `;

          const bController = new AbortController();
          const bTimeout = setTimeout(() => bController.abort(), 3500);
          const bRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: batchQuery, variables: { ids: currentBatch } }),
            signal: bController.signal,
          });
          clearTimeout(bTimeout);

          if (bRes.ok) {
            const bJson = await bRes.json();
            const batchMedia: any[] = bJson?.data?.Page?.media || [];
            batchMedia.forEach((m) => {
              if (m.id) exploredAniListIds.add(m.id);
              processNode(m, 'sequel', true);
              if (m.relations?.edges) {
                registerRelationEdges(m.relations.edges, m.idMal || m.id);
              }
            });
          }
        } catch (bErr) {
          console.warn('Erro na expansão bidimensional BFS da franquia:', bErr);
          break;
        }
      }

      const collectedList = Array.from(nodesMap.values());

      if (collectedList.length > 0) {
        // Função canônica para extrair peso/indicador de temporada e parte (ex: Season 2 Part 1)
        const getCanonicalSeasonWeight = (title: string, englishTitle?: string): number => {
          const full = `${title || ''} ${englishTitle || ''}`.toLowerCase();
          const sMatch = full.match(/(?:season|temporada)\s*(\d+)/i) || full.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
          const pMatch = full.match(/(?:part|parte|cour)\s*(\d+)/i) || full.match(/(\d+)(?:st|nd|rd|th)\s*cour/i);
          const seasonNum = sMatch ? parseInt(sMatch[1], 10) : 0;
          const partNum = pMatch ? parseInt(pMatch[1], 10) : 1;

          if (seasonNum > 0) return seasonNum * 10 + partNum;
          if (full.includes('final season') || full.includes('temporada final')) return 90 + partNum;
          return 0;
        };

        // Ordenação canônica estrita: ligações sequenciais, cronologia por ano/mês/dia e número de temporada
        const sortFranchiseNodesCanonically = (a: any, b: any): number => {
          const yearA = a.startDate?.year || a.seasonYear || 9999;
          const yearB = b.startDate?.year || b.seasonYear || 9999;

          const hintA = getCanonicalSeasonWeight(a.title, a.englishTitle);
          const hintB = getCanonicalSeasonWeight(b.title, b.englishTitle);

          // Se ambos forem temporadas numeradas explícitas (ex: Season 1 vs Season 2 vs Season 3)
          if (hintA > 0 && hintB > 0 && hintA !== hintB) {
            if (Math.abs(yearA - yearB) >= 1) {
              if ((hintA < hintB && yearA < yearB) || (hintA > hintB && yearA > yearB)) {
                return yearA - yearB;
              }
            }
            return hintA - hintB;
          }

          if (yearA !== yearB) return yearA - yearB;

          const monthA = a.startDate?.month || 1;
          const monthB = b.startDate?.month || 1;
          if (monthA !== monthB) return monthA - monthB;

          const dayA = a.startDate?.day || 1;
          const dayB = b.startDate?.day || 1;
          if (dayA !== dayB) return dayA - dayB;

          if (hintA !== hintB) return hintA - hintB;

          return 0;
        };

        // Ordenação canônica e cronológica estrita por ano/mês/dia e temporada
        collectedList.sort(sortFranchiseNodesCanonically);

        // Agrupamento por Franquias Conexas (Connected Components Graph Clustering)
        // Se duas mídias possuem conexões canônicas (sequels, prequels, spin-offs, movies), pertencem à mesma franquia.
        const visitedForClusters = new Set<number>();
        const rawClusters: {
          representative: any;
          nodes: any[];
        }[] = [];

        const nonGenericRoot = (rootTitle || '').trim().toLowerCase();
        // Raízes muito curtas (< 5 caracteres) são consideradas genéricas para evitar falsos positivos
        const isGenericRoot = !nonGenericRoot || nonGenericRoot.length < 5;

        // Conecta itens que compartilham o mesmo rootTitle canônico longo/específico
        if (!isGenericRoot) {
          for (let i = 0; i < collectedList.length; i++) {
            for (let j = i + 1; j < collectedList.length; j++) {
              const rootI = getFranchiseRootTitle(collectedList[i].title).toLowerCase();
              const rootJ = getFranchiseRootTitle(collectedList[j].title).toLowerCase();
              if (rootI && rootI === rootJ) {
                addGraphEdge(collectedList[i].id, collectedList[j].id);
              }
            }
          }
        }

        collectedList.forEach((node) => {
          if (visitedForClusters.has(node.id)) return;

          const clusterNodes: any[] = [];
          const queue: number[] = [node.id];
          visitedForClusters.add(node.id);

          while (queue.length > 0) {
            const currentId = queue.shift()!;
            const currentNode = nodesMap.get(currentId);
            if (currentNode) clusterNodes.push(currentNode);

            const neighbors = adjacencyList.get(currentId);
            if (neighbors) {
              neighbors.forEach((nbrId) => {
                if (!visitedForClusters.has(nbrId) && nodesMap.has(nbrId)) {
                  visitedForClusters.add(nbrId);
                  queue.push(nbrId);
                }
              });
            }
          }

          if (clusterNodes.length > 0) {
            // Eleição do nó representativo do cluster
            clusterNodes.sort((a, b) => {
              const titleA = (a.title || '').toLowerCase().trim();
              const titleB = (b.title || '').toLowerCase().trim();
              const searchLower = rawSearch.toLowerCase().trim();

              const exactA = titleA === searchLower ? 2 : titleA.startsWith(searchLower) ? 1 : 0;
              const exactB = titleB === searchLower ? 2 : titleB.startsWith(searchLower) ? 1 : 0;
              if (exactA !== exactB) return exactB - exactA;

              const tvA = a.format === 'TV' ? 1 : 0;
              const tvB = b.format === 'TV' ? 1 : 0;
              if (tvA !== tvB) return tvB - tvA;

              const yearA = a.startDate?.year || a.seasonYear || 9999;
              const yearB = b.startDate?.year || b.seasonYear || 9999;
              return yearA - yearB;
            });

            rawClusters.push({
              representative: clusterNodes[0],
              nodes: clusterNodes,
            });
          }
        });

        // Ordena os clusters pelo grau de relevância em relação ao termo pesquisado
        rawClusters.sort((cA, cB) => {
          const titleA = (cA.representative.title || '').toLowerCase().trim();
          const titleB = (cB.representative.title || '').toLowerCase().trim();
          const searchLower = rawSearch.toLowerCase().trim();

          const exactA = titleA === searchLower ? 3 : titleA.startsWith(searchLower) ? 2 : 0;
          const exactB = titleB === searchLower ? 3 : titleB.startsWith(searchLower) ? 2 : 0;
          if (exactA !== exactB) return exactB - exactA;

          const tvA = cA.representative.format === 'TV' ? 1 : 0;
          const tvB = cB.representative.format === 'TV' ? 1 : 0;
          if (tvA !== tvB) return tvB - tvA;

          return cB.nodes.length - cA.nodes.length;
        });

        // Função de formatação canônica e cronológica de itens de um cluster
        const formatClusterItems = (nodes: any[], clusterRepTitle: string): FranchiseTreeItem[] => {
          const sorted = [...nodes].sort(sortFranchiseNodesCanonically);

          return sorted.map((item, idx) => {
            let mappedFormat: FranchiseTreeItem['format'] = 'TV';
            if (item.format === 'MOVIE') mappedFormat = 'Movie';
            else if (item.format === 'OVA') mappedFormat = 'OVA';
            else if (item.format === 'ONA') mappedFormat = 'ONA';
            else if (item.format === 'SPECIAL') mappedFormat = 'Special';

            const rawRel = (item.relationType || '').toLowerCase();
            let mappedRelation: FranchiseTreeItem['relationType'] = 'sequel';
            if (rawRel.includes('spin_off')) mappedRelation = 'spin_off';
            else if (rawRel.includes('side_story')) mappedRelation = 'side_story';
            else if (rawRel.includes('alternative')) mappedRelation = 'alternative_version';
            else if (rawRel.includes('summary')) mappedRelation = 'summary';
            else if (rawRel.includes('parent')) mappedRelation = 'parent';
            else if (rawRel.includes('prequel')) mappedRelation = 'prequel';
            else if (rawRel.includes('sequel')) mappedRelation = 'sequel';
            else if (idx === 0) mappedRelation = 'main';
            else if (mappedFormat === 'Movie') mappedRelation = 'movie';
            else if (mappedFormat === 'OVA') mappedRelation = 'ova';
            else mappedRelation = (rawRel as any) || 'sequel';

            return {
              id: item.id,
              title: formatMediaTitlePT(item.title, item.format, idx, clusterRepTitle),
              japaneseTitle: item.japaneseTitle,
              englishTitle: item.englishTitle,
              format: mappedFormat,
              episodes: item.episodes,
              seasonYear: item.seasonYear,
              coverUrl: item.coverUrl,
              relationType: mappedRelation,
              order: idx + 1,
            };
          });
        };

        // Candidatos de franquia identificados se a busca retornou obras distintas
        const candidateFranchises: FranchiseCandidate[] = rawClusters.map((c) => {
          const formattedItems = formatClusterItems(c.nodes, c.representative.title);
          const cIds = c.nodes.map((n) => n.id);
          return {
            clusterId: c.representative.id,
            title: c.representative.title,
            year: c.representative.seasonYear || c.representative.startDate?.year || null,
            format: c.representative.format,
            coverUrl: c.representative.coverUrl,
            itemCount: formattedItems.length,
            items: formattedItems,
            franchiseIds: cIds,
          };
        });

        // Se houver mais de 1 cluster distinto (ex: busca por nome comum como "Another" que retornou múltiplos animes não relacionados),
        // expõe os candidatos para desambiguação e seleciona a franquia primária por padrão.
        if (candidateFranchises.length > 1) {
          const primaryCluster = candidateFranchises[0];
          const result = {
            rootTitle: primaryCluster.title || rootTitle || rawSearch,
            franchiseIds: primaryCluster.franchiseIds,
            items: primaryCluster.items,
            predefinedArcs: arcs || undefined,
            activeAiringDay: detectedAiringDay || null,
            candidateFranchises: candidateFranchises.slice(0, 8),
          };
          franchiseTreeMemoryCache.set(cacheKey, result);
          return result;
        }

        // Caso padrão (obra bem estabelecida com 1 única franquia conectada): não gera candidatos extras
        const primaryItems = formatClusterItems(collectedList, rootTitle || rawSearch);
        const result = {
          rootTitle: rootTitle || rawSearch,
          franchiseIds: Array.from(idsSet),
          items: primaryItems,
          predefinedArcs: arcs || undefined,
          activeAiringDay: detectedAiringDay || null,
          candidateFranchises: undefined,
        };
        franchiseTreeMemoryCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar árvore AniList recursiva:', err);
  }

  // Fallback 1: Fallback para arcos canônicos pré-definidos se houver
  if (arcs && arcs.length > 0) {
    const arcItems: FranchiseTreeItem[] = arcs.map((arc, idx) => ({
      id: 1000 + idx,
      title: arc.name,
      format: 'Arc',
      episodes: arc.episodesCount,
      relationType: 'arc',
      order: idx + 1,
    }));

    const result = {
      rootTitle: rootTitle || exactTitle || 'Franquia',
      franchiseIds: [typeof searchQueryOrMalId === 'number' ? searchQueryOrMalId : 1],
      items: arcItems,
      predefinedArcs: arcs,
      activeAiringDay: null,
    };
    franchiseTreeMemoryCache.set(cacheKey, result);
    return result;
  }

  const fallbackResult = {
    rootTitle: rootTitle || exactTitle || 'Franquia',
    franchiseIds: typeof searchQueryOrMalId === 'number' ? [searchQueryOrMalId] : [],
    items: [],
    activeAiringDay: null,
  };
  return fallbackResult;
}

/**
 * Converte a Árvore de Franquias ou Arcos selecionada pelo usuário em temporadas (`AnimeSeasonOrArc[]`)
 * Permite marcar tudo como assistido até a temporada/arco atual com 1 toque!
 */
export function buildSeasonsFromFranchiseSelection(
  items: FranchiseTreeItem[] | AnimeArcPreset[],
  currentSelectedId: number | string,
  markPreviousAsWatched: boolean = true
): {
  seasons: AnimeSeasonOrArc[];
  currentSeasonName: string;
  activeTotalEpisodes: number | null;
} {
  if (!items || items.length === 0) {
    return {
      seasons: [{ id: 's1', name: 'Temporada 1', order: 1, totalEpisodes: null, isWatched: false }],
      currentSeasonName: 'Temporada 1',
      activeTotalEpisodes: null,
    };
  }

  let activeIndex = -1;

  // Localiza o índice do item atual
  items.forEach((item, idx) => {
    const id = 'id' in item ? item.id : idx;
    if (String(id) === String(currentSelectedId)) {
      activeIndex = idx;
    }
  });

  if (activeIndex === -1) activeIndex = 0;

  const currentItem = items[activeIndex];
  const currentSeasonName = 'title' in currentItem ? currentItem.title : currentItem.name;
  const activeTotalEpisodes = 'episodes' in currentItem ? currentItem.episodes : currentItem.episodesCount;

  const seasons: AnimeSeasonOrArc[] = items.map((item, idx) => {
    const isPast = idx < activeIndex;
    const name = 'title' in item ? item.title : item.name;
    const epCount = 'episodes' in item ? item.episodes : item.episodesCount;
    const malId = 'id' in item && typeof item.id === 'number' ? item.id : undefined;
    const canonicalTitle = 'title' in item ? (item.japaneseTitle || item.englishTitle || item.title) : item.name;
    const type = 'format' in item ? (item.format.toLowerCase() as any) : 'arc';
    const releaseYear = 'seasonYear' in item && item.seasonYear ? item.seasonYear : null;

    const sObj: AnimeSeasonOrArc = {
      id: `sec_${idx + 1}_${malId || (idx + 1)}`,
      name,
      order: idx + 1,
      isWatched: markPreviousAsWatched ? isPast : false,
      totalEpisodes: epCount || null,
      releaseYear: releaseYear || null,
    };

    if (canonicalTitle) sObj.canonicalTitle = canonicalTitle;
    if (malId !== undefined && malId !== null) sObj.mal_id = malId;
    if (type) sObj.type = type;

    return sObj;
  });

  return {
    seasons,
    currentSeasonName,
    activeTotalEpisodes: activeTotalEpisodes || null,
  };
}

/**
 * Sincroniza e detecta automaticamente novas temporadas, filmes, OVAs ou arcos para um anime existente.
 * - Preserva estritamente o nome customizado que o usuário digitou (ex: "Temporada 3" ou "Filme").
 * - Preserva a temporada ativa e o progresso de episódios intactos.
 * - Anexa novidades canônicas inéditas no final da lista como isWatched: false.
 */
export async function syncFranchiseSeasonsForAnime(
  anime: Anime
): Promise<{
  hasNewSeasons: boolean;
  newSeasonsCount: number;
  updatedSeasons: AnimeSeasonOrArc[];
  newFranchiseIds: number[];
  latestBroadcastDay?: string | null;
}> {
  if (!anime) {
    return { hasNewSeasons: false, newSeasonsCount: 0, updatedSeasons: [], newFranchiseIds: [] };
  }

  const currentSeasons: AnimeSeasonOrArc[] = Array.isArray(anime.seasons) ? [...anime.seasons] : [];
  const searchKey = anime.mal_id || anime.franchiseTitle || anime.title;

  try {
    const tree = await fetchAnimeFranchiseTree(searchKey, anime.title);
    if (!tree.items || tree.items.length === 0) {
      return {
        hasNewSeasons: false,
        newSeasonsCount: 0,
        updatedSeasons: currentSeasons,
        newFranchiseIds: anime.franchiseIds || [],
      };
    }

    let hasNewItems = false;
    let newItemsAdded = 0;
    const updatedSeasons: AnimeSeasonOrArc[] = [...currentSeasons];

    const effectiveMode: 'seasons' | 'arcs' = anime.structureMode || (
      currentSeasons.some((s) => s.type === 'arc' || s.name.toLowerCase().includes('arco')) ? 'arcs' : 'seasons'
    );

    const excludedNorm = (anime.excludedFranchiseItems || []).map((x) => String(x).toLowerCase().trim());
    const isExcluded = (id: number | string | undefined, titles: (string | undefined | null)[]) => {
      if (!excludedNorm.length) return false;
      if (id !== undefined && id !== null) {
        const strId = String(id).toLowerCase().trim();
        if (excludedNorm.includes(strId)) return true;
        if (excludedNorm.some((ex) => ex.includes(strId) || strId.includes(ex))) return true;
      }
      return titles.some((t) => {
        if (!t) return false;
        const normT = t.toLowerCase().trim();
        return excludedNorm.some((ex) => {
          if (ex === normT) return true;
          if (ex.length >= 4 && (normT.includes(ex) || ex.includes(normT))) return true;
          return false;
        });
      });
    };

    const doesArcMatchSeason = (arc: { id: string; name: string }, s: AnimeSeasonOrArc): boolean => {
      if (s.id && s.id.includes(arc.id)) return true;
      const arcNameNorm = arc.name.toLowerCase().trim();
      const canonNorm = s.canonicalTitle ? s.canonicalTitle.toLowerCase().trim() : '';
      const sNameNorm = s.name ? s.name.toLowerCase().trim() : '';
      if (canonNorm && canonNorm === arcNameNorm) return true;
      if (sNameNorm && sNameNorm === arcNameNorm) return true;

      const arcNum = arc.name.match(/(?:temporada|season|parte|\b)(\d+)/i)?.[1];
      const sNum = (s.canonicalTitle || s.name).match(/(?:temporada|season|parte|\b)(\d+)/i)?.[1];
      if (arcNum && sNum && arcNum === sNum) {
        const arcIsOva = /ova|special|especial|spin-off|nikki/i.test(arc.name);
        const sIsOva = /ova|special|especial|spin-off|nikki/i.test(s.canonicalTitle || s.name);
        if (arcIsOva === sIsOva) return true;
      }

      if (canonNorm.length >= 6 && (arcNameNorm.includes(canonNorm) || canonNorm.includes(arcNameNorm))) return true;
      if (sNameNorm.length >= 6 && (arcNameNorm.includes(sNameNorm) || sNameNorm.includes(arcNameNorm))) return true;

      return false;
    };

    const doesItemMatchSeason = (item: { id: number; title: string; englishTitle?: string; format?: string }, s: AnimeSeasonOrArc): boolean => {
      if (s.mal_id && s.mal_id === item.id) return true;
      const itemTitleNorm = item.title.toLowerCase().trim();
      const itemEngNorm = item.englishTitle ? item.englishTitle.toLowerCase().trim() : '';
      const canonNorm = s.canonicalTitle ? s.canonicalTitle.toLowerCase().trim() : '';
      const sNameNorm = s.name ? s.name.toLowerCase().trim() : '';

      if (canonNorm && (canonNorm === itemTitleNorm || (itemEngNorm && canonNorm === itemEngNorm))) return true;
      if (sNameNorm && (sNameNorm === itemTitleNorm || (itemEngNorm && sNameNorm === itemEngNorm))) return true;

      const itemNum = (item.title + ' ' + (item.englishTitle || '')).match(/(?:temporada|season|part|\b)(\d+)/i)?.[1];
      const sNum = (s.canonicalTitle || s.name).match(/(?:temporada|season|parte|\b)(\d+)/i)?.[1];
      if (itemNum && sNum && itemNum === sNum) {
        const itemIsOva = item.format === 'OVA' || item.format === 'Special' || /ova|special/i.test(item.title);
        const sIsOva = /ova|special/i.test(s.canonicalTitle || s.name);
        if (itemIsOva === sIsOva) return true;
      }

      if (canonNorm.length >= 6 && (itemTitleNorm.includes(canonNorm) || canonNorm.includes(itemTitleNorm))) return true;
      if (sNameNorm.length >= 6 && (itemTitleNorm.includes(sNameNorm) || sNameNorm.includes(itemTitleNorm))) return true;

      return false;
    };

    if (effectiveMode === 'arcs' && tree.predefinedArcs && tree.predefinedArcs.length > 0) {
      // 1. Atualiza metadados dos arcos existentes que o usuário possui
      for (let existingIdx = 0; existingIdx < updatedSeasons.length; existingIdx++) {
        const oldSeason = updatedSeasons[existingIdx];
        const matchArc = tree.predefinedArcs.find((arc) => doesArcMatchSeason(arc, oldSeason));
        if (matchArc) {
          let hasSeasonChanges = false;
          const patchedSeason = { ...oldSeason };
          if (matchArc.episodesCount && matchArc.episodesCount !== patchedSeason.totalEpisodes) {
            patchedSeason.totalEpisodes = matchArc.episodesCount;
            hasSeasonChanges = true;
          }
          if (!patchedSeason.canonicalTitle) {
            patchedSeason.canonicalTitle = matchArc.name;
            hasSeasonChanges = true;
          }
          if (hasSeasonChanges) {
            updatedSeasons[existingIdx] = patchedSeason;
            hasNewItems = true;
          }
        }
      }

      // 2. Se o usuário já possui temporadas salvas, só adiciona temporadas estritamente FUTURAS
      if (currentSeasons.length > 0) {
        let maxMatchedArcIdx = -1;
        tree.predefinedArcs.forEach((arc, idx) => {
          if (currentSeasons.some((s) => doesArcMatchSeason(arc, s))) {
            maxMatchedArcIdx = Math.max(maxMatchedArcIdx, idx);
          }
        });

        const startIdx = maxMatchedArcIdx >= 0 ? maxMatchedArcIdx + 1 : tree.predefinedArcs.length;
        for (let i = startIdx; i < tree.predefinedArcs.length; i++) {
          const arc = tree.predefinedArcs[i];
          if (isExcluded(arc.id, [arc.name])) continue;
          if (/ova|special|especial|spin-off|nikki/i.test(arc.name)) continue;

          const nextOrder = updatedSeasons.length + 1;
          const newArc: AnimeSeasonOrArc = {
            id: `sec_${nextOrder}_${arc.id || Date.now()}`,
            name: arc.name,
            canonicalTitle: arc.name,
            type: 'arc',
            order: nextOrder,
            totalEpisodes: arc.episodesCount || null,
            isWatched: false,
          };
          updatedSeasons.push(newArc);
          hasNewItems = true;
          newItemsAdded++;
        }
      }
    } else {
      // 1. Atualiza metadados das temporadas existentes que o usuário possui
      for (let existingIdx = 0; existingIdx < updatedSeasons.length; existingIdx++) {
        const oldSeason = updatedSeasons[existingIdx];
        const matchItem = tree.items.find((item) => doesItemMatchSeason(item, oldSeason));
        if (matchItem) {
          let hasSeasonChanges = false;
          const patchedSeason = { ...oldSeason };
          if (!patchedSeason.mal_id && typeof matchItem.id === 'number') {
            patchedSeason.mal_id = matchItem.id;
            hasSeasonChanges = true;
          }
          if (!patchedSeason.canonicalTitle) {
            patchedSeason.canonicalTitle = matchItem.title;
            hasSeasonChanges = true;
          }
          if (!patchedSeason.type && matchItem.format) {
            patchedSeason.type = matchItem.format.toLowerCase() as any;
            hasSeasonChanges = true;
          }
          if (matchItem.episodes && matchItem.episodes !== patchedSeason.totalEpisodes) {
            patchedSeason.totalEpisodes = matchItem.episodes;
            hasSeasonChanges = true;
          }
          if (matchItem.seasonYear && !patchedSeason.releaseYear) {
            patchedSeason.releaseYear = matchItem.seasonYear;
            hasSeasonChanges = true;
          }
          if (hasSeasonChanges) {
            updatedSeasons[existingIdx] = patchedSeason;
            hasNewItems = true;
          }
        }
      }

      // 2. Se o usuário já possui temporadas salvas, só adiciona temporadas estritamente FUTURAS
      if (currentSeasons.length > 0) {
        let maxMatchedItemIdx = -1;
        tree.items.forEach((item, idx) => {
          if (currentSeasons.some((s) => doesItemMatchSeason(item, s))) {
            maxMatchedItemIdx = Math.max(maxMatchedItemIdx, idx);
          }
        });

        const startIdx = maxMatchedItemIdx >= 0 ? maxMatchedItemIdx + 1 : tree.items.length;
        for (let i = startIdx; i < tree.items.length; i++) {
          const item = tree.items[i];
          if (isExcluded(item.id, [item.title, item.englishTitle])) continue;
          if (item.format === 'OVA' || item.format === 'Special') continue;
          if (/ova|special|especial/i.test(item.title)) continue;

          const nextOrder = updatedSeasons.length + 1;
          const newSeason: AnimeSeasonOrArc = {
            id: `sec-${Date.now()}_${item.id}_${nextOrder}`,
            name: item.title,
            canonicalTitle: item.title,
            mal_id: item.id,
            type: item.format ? (item.format.toLowerCase() as any) : 'tv',
            releaseYear: item.seasonYear || null,
            totalEpisodes: item.episodes || null,
            order: nextOrder,
            isWatched: false,
          };
          updatedSeasons.push(newSeason);
          hasNewItems = true;
          newItemsAdded++;
        }
      }
    }

    const mergedFranchiseIds = Array.from(
      new Set([
        ...(anime.franchiseIds || []),
        ...(tree.franchiseIds || []),
        ...updatedSeasons.map((s) => s.mal_id).filter((id): id is number => typeof id === 'number' && id > 0),
      ])
    );

    return {
      hasNewSeasons: hasNewItems,
      newSeasonsCount: newItemsAdded,
      updatedSeasons,
      newFranchiseIds: mergedFranchiseIds,
      latestBroadcastDay: tree.activeAiringDay || anime.broadcastDay || null,
    };
  } catch (err) {
    console.warn('Erro ao sincronizar temporadas da franquia:', err);
    return {
      hasNewSeasons: false,
      newSeasonsCount: 0,
      updatedSeasons: currentSeasons,
      newFranchiseIds: anime.franchiseIds || [],
    };
  }
}

/**
 * Verifica se dois animes pertencem à mesma franquia (cruzamento de ID, franchiseIds ou título raiz)
 * Prioridade absoluta para IDs (mal_id, franchiseIds). Para títulos, impede falsos positivos em nomes comuns (ex: "Another").
 */
export function checkIsSameFranchise(
  userAnime: { mal_id?: number | null; franchiseIds?: number[]; franchiseTitle?: string; title: string; japaneseTitle?: string },
  candidate: { id?: number | string; mal_id?: number | string; title: string; title_japanese?: string; title_english?: string }
): boolean {
  if (!userAnime || !candidate) return false;

  const candId = Number(candidate.id || candidate.mal_id);

  // 1. Match por ID exato
  if (userAnime.mal_id && candId && userAnime.mal_id === candId) {
    return true;
  }

  // 2. Match por Franchise IDs unificados
  if (candId && userAnime.franchiseIds && userAnime.franchiseIds.includes(candId)) {
    return true;
  }

  // Helper para proteção contra palavras genéricas/curtas que jamais devem aceitar substring
  const isGenericShortWord = (r: string) => {
    if (!r || r.length <= 4) return true;
    const COMMON_WORDS = new Set(['another', 'monster', 'nana', 'free', 'orange', 'major', 'clannad', 'shiki', 'given', 'solo', 'alive', 'blood', 'reset', 'restart', 'world', 'story']);
    return COMMON_WORDS.has(r);
  };

  const isSafeTitleMatch = (u: string, c: string): boolean => {
    if (!u || !c) return false;
    if (u === c) return true;
    if (isGenericShortWord(u) || isGenericShortWord(c)) return false;
    if (u.length >= 6 && (c.startsWith(u + ':') || c.startsWith(u + ' -') || c.startsWith(u + ' –'))) return true;
    if (c.length >= 6 && (u.startsWith(c + ':') || u.startsWith(c + ' -') || u.startsWith(c + ' –'))) return true;
    return false;
  };

  // 3. Match por Raiz de Franquia (unificada pelo normalizador)
  const uRoot = (userAnime.franchiseTitle || getFranchiseRootTitle(userAnime.title)).toLowerCase().trim();
  const cRoot = getFranchiseRootTitle(candidate.title).toLowerCase().trim();
  const cEngRoot = candidate.title_english ? getFranchiseRootTitle(candidate.title_english).toLowerCase().trim() : '';

  if (uRoot && cRoot && isSafeTitleMatch(uRoot, cRoot)) {
    return true;
  }

  if (uRoot && cEngRoot && isSafeTitleMatch(uRoot, cEngRoot)) {
    return true;
  }

  // 4. Match por Título Japonês exato
  if (userAnime.japaneseTitle && candidate.title_japanese) {
    const uj = userAnime.japaneseTitle.toLowerCase().trim();
    const cj = candidate.title_japanese.toLowerCase().trim();
    if (uj === cj) {
      return true;
    }
  }

  // 5. Match cruzado entre título customizado do usuário e títulos oficiais
  const uCustomTitle = userAnime.title.toLowerCase().trim();
  if (candidate.title_english) {
    const cEng = candidate.title_english.toLowerCase().trim();
    if (uCustomTitle === cEng && !isGenericShortWord(uCustomTitle)) {
      return true;
    }
  }

  return false;
}

/**
 * Extrai todos os IDs numéricos pertencentes à franquia de um anime
 * (mal_id principal, franchiseIds agregados e IDs das temporadas/arcos)
 */
export function getAnimeFranchiseIds(anime: Anime | Partial<Anime>): Set<number> {
  const ids = new Set<number>();
  if (!anime) return ids;

  if (anime.mal_id && typeof anime.mal_id === 'number' && anime.mal_id > 0) {
    ids.add(anime.mal_id);
  }
  if (Array.isArray(anime.franchiseIds)) {
    for (const id of anime.franchiseIds) {
      const num = Number(id);
      if (num && !isNaN(num) && num > 0) {
        ids.add(num);
      }
    }
  }
  if (Array.isArray(anime.seasons)) {
    for (const s of anime.seasons) {
      if (s && s.mal_id) {
        const num = Number(s.mal_id);
        if (num && !isNaN(num) && num > 0) {
          ids.add(num);
        }
      }
    }
  }
  return ids;
}

/**
 * Compara dois animes de usuários diferentes e determina com precisão
 * se representam a mesma obra/franquia, mesmo com:
 * 1. Nomes personalizados diferentes (ex: "Slime" vs "Tensei Shitara Slime Datta Ken")
 * 2. Temporadas de entrada diferentes (um começou pela Season 1, outro pela Season 2)
 * 3. Itens excluídos / subconjuntos de arcos e filmes divergentes
 */
export function isSameAnimeCollection(a: Anime, b: Anime): boolean {
  if (!a || !b) return false;

  // 1. Intersecção de IDs de Franquia (Certeza matemática absoluta de 100%)
  const idsA = getAnimeFranchiseIds(a);
  const idsB = getAnimeFranchiseIds(b);

  if (idsA.size > 0 && idsB.size > 0) {
    for (const id of idsA) {
      if (idsB.has(id)) {
        return true;
      }
    }
  }

  // 2. Títulos Originais / Técnicos da API
  const clean = (s?: string | null) => (s ? s.trim().toLowerCase() : '');

  const origA = clean(a.originalTitle);
  const origB = clean(b.originalTitle);
  if (origA && origB && origA === origB) {
    return true;
  }

  const fTitleA = clean(a.franchiseTitle);
  const fTitleB = clean(b.franchiseTitle);
  if (fTitleA && fTitleB && fTitleA === fTitleB) {
    return true;
  }

  const japA = clean(a.japaneseTitle);
  const japB = clean(b.japaneseTitle);
  if (japA && japB && japA === japB && japA.length >= 3) {
    return true;
  }

  // 3. Título exato customizado
  const titleA = clean(a.title);
  const titleB = clean(b.title);
  if (titleA && titleB && titleA === titleB) {
    return true;
  }

  // 4. Raízes de Franquia extraídas pelo normalizador (com proteção contra palavras genéricas)
  const isGenericShortWord = (r: string) => {
    if (!r || r.length <= 4) return true;
    const COMMON_WORDS = new Set([
      'another', 'monster', 'nana', 'free', 'orange', 'major', 'clannad',
      'shiki', 'given', 'solo', 'alive', 'blood', 'reset', 'restart', 'world', 'story'
    ]);
    return COMMON_WORDS.has(r);
  };

  const isSafeTitleMatch = (u: string, c: string): boolean => {
    if (!u || !c) return false;
    if (u === c) return true;
    if (isGenericShortWord(u) || isGenericShortWord(c)) return false;
    if (u.length >= 6 && (c.startsWith(u + ':') || c.startsWith(u + ' -') || c.startsWith(u + ' –'))) return true;
    if (c.length >= 6 && (u.startsWith(c + ':') || u.startsWith(c + ' -') || u.startsWith(c + ' –'))) return true;
    return false;
  };

  const rootA = getFranchiseRootTitle(a.franchiseTitle || a.originalTitle || a.title).toLowerCase().trim();
  const rootB = getFranchiseRootTitle(b.franchiseTitle || b.originalTitle || b.title).toLowerCase().trim();

  if (rootA && rootB && isSafeTitleMatch(rootA, rootB)) {
    return true;
  }

  return false;
}

export interface AnimeCollectionPair {
  myAnime?: Anime;
  friendAnime?: Anime;
}

/**
 * Agrupa de forma ótima duas listas de coleções em pares únicos
 * (mútuos, só meus ou só do amigo) garantindo amarração de nós de franquia
 */
export function pairUserAnimeCollections(myList: Anime[], friendList: Anime[]): AnimeCollectionPair[] {
  const safeMy = Array.isArray(myList) ? myList : [];
  const safeFriend = Array.isArray(friendList) ? friendList : [];

  const pairs: AnimeCollectionPair[] = [];
  const usedFriendIndices = new Set<number>();

  // Pass 1: Busca o par de cada anime meu na lista do amigo
  for (const myAnime of safeMy) {
    let matchedFriendIndex = -1;

    // Subpass 1.1: Match por ID numérico (prioridade absoluta da franquia)
    const myIds = getAnimeFranchiseIds(myAnime);
    if (myIds.size > 0) {
      for (let j = 0; j < safeFriend.length; j++) {
        if (usedFriendIndices.has(j)) continue;
        const friendIds = getAnimeFranchiseIds(safeFriend[j]);
        let hasCommonId = false;
        for (const id of myIds) {
          if (friendIds.has(id)) {
            hasCommonId = true;
            break;
          }
        }
        if (hasCommonId) {
          matchedFriendIndex = j;
          break;
        }
      }
    }

    // Subpass 1.2: Match por títulos canônicos/originais se não achou por ID
    if (matchedFriendIndex === -1) {
      for (let j = 0; j < safeFriend.length; j++) {
        if (usedFriendIndices.has(j)) continue;
        if (isSameAnimeCollection(myAnime, safeFriend[j])) {
          matchedFriendIndex = j;
          break;
        }
      }
    }

    if (matchedFriendIndex !== -1) {
      usedFriendIndices.add(matchedFriendIndex);
      pairs.push({
        myAnime,
        friendAnime: safeFriend[matchedFriendIndex],
      });
    } else {
      pairs.push({
        myAnime,
        friendAnime: undefined,
      });
    }
  }

  // Pass 2: Animes do amigo que não deram match com nenhum meu
  for (let j = 0; j < safeFriend.length; j++) {
    if (!usedFriendIndices.has(j)) {
      pairs.push({
        myAnime: undefined,
        friendAnime: safeFriend[j],
      });
    }
  }

  return pairs;
}
