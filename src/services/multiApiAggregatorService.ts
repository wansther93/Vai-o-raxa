/**
 * Serviço Agregador Multi-API (AniList + MyAnimeList/Jikan + Shikimori)
 * Orquestra as 3 APIs em cascata completa e redundante, garantindo que
 * nenhuma informação dependa de listas fixas e que falhas sejam contornadas em milissegundos.
 */

import type { ScheduleAnimeItem, AnimeCharacterItem, AnimeStreamingLink } from './jikanService';
import {
  getWeeklySchedule as fetchJikanOrAniListSchedule,
  getSeasonUpcomingAnimes as fetchJikanOrAniListUpcoming,
  getSeasonNowAnimes as fetchJikanOrAniListSeasonNow,
  getAnimeCharacters as fetchJikanOrAniListCharacters,
  getAnimeStreamingLinks as fetchJikanOrAniListStreaming,
  normalizeBrazilStreaming,
  purgeLegacyScheduleCaches,
  getCachedSeasonNow,
  getCachedSeasonUpcoming,
  getCachedWeeklySchedule,
  setUnifiedSeasonCache,
  setUnifiedScheduleCache,
} from './jikanService';
import {
  fetchShikimoriSchedule,
  fetchShikimoriUpcoming,
  fetchShikimoriSeasonNow,
  fetchShikimoriCharacters,
  fetchShikimoriExternalLinks,
} from './shikimoriService';
import { reconcileScheduleLifecycle, hasAnimeConcludedSeason, isAnimeInWeeklyHiatus } from './scheduleLifecycleService';
import type { Anime } from '../types';

const LOCAL_SEASON_NOW_KEY = 'wanime_season_now_v7';
const LOCAL_SEASON_UPCOMING_KEY = 'wanime_season_upcoming_v7';
const LOCAL_SCHEDULE_KEY_PREFIX = 'wanime_schedule_v7_';
const SCHEDULE_BACKGROUND_SYNC_TS = 'wanime_bg_schedule_sync_ts';
const KNOWN_SCHEDULE_IDS_KEY = 'wanime_known_schedule_ids_v1';

// Caches em memória para resposta instantânea
const multiScheduleCache = new Map<string, { data: ScheduleAnimeItem[]; timestamp: number }>();
const multiUpcomingCache = new Map<string, { data: ScheduleAnimeItem[]; timestamp: number }>();
const multiSeasonNowCache = new Map<string, { data: ScheduleAnimeItem[]; timestamp: number }>();
const multiCharCache = new Map<string, { data: AnimeCharacterItem[]; timestamp: number }>();
const multiStreamCache = new Map<string, { data: AnimeStreamingLink[]; timestamp: number }>();

const CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const BG_SYNC_INTERVAL = 30 * 1000; // 30 segundos
const MANUAL_SYNC_COOLDOWN = 35 * 1000; // 35 segundos para proteger cota de 90 req/min da AniList

/**
 * 1. Calendário Semanal Agregado (AniList -> Jikan -> Shikimori)
 * Filtra automaticamente animes que já concluíram a temporada após o dia do último episódio.
 */
export async function getAggregatedWeeklySchedule(dayPt?: string, force = false): Promise<ScheduleAnimeItem[]> {
  const cacheKey = dayPt || 'all';
  if (!force) {
    const cached = multiScheduleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data.filter((item) => !hasAnimeConcludedSeason(item));
    }
  }

  // 1 & 2. Tenta AniList e Jikan
  let items: ScheduleAnimeItem[] = [];
  try {
    items = await fetchJikanOrAniListSchedule(dayPt);
  } catch (err) {
    console.warn('Falha em AniList/Jikan schedule, acionando Shikimori...', err);
  }

  // 3. Se retornar vazio, aciona a 3ª API (Shikimori Calendar)
  if (!items || items.length === 0) {
    try {
      const shikiItems = await fetchShikimoriSchedule();
      if (shikiItems.length > 0) {
        items = dayPt
          ? shikiItems.filter((a) => a.broadcastDay === dayPt || a.broadcastDay.startsWith(dayPt))
          : shikiItems;
      }
    } catch (e) {
      console.warn('Falha no fallback do Shikimori schedule:', e);
    }
  }

  // Filtra animes que já concluíram sua temporada (não aparecem mais na grade semanal)
  const activeItems = (items || []).filter((item) => !hasAnimeConcludedSeason(item));

  if (activeItems.length > 0) {
    multiScheduleCache.set(cacheKey, { data: activeItems, timestamp: Date.now() });
    setUnifiedScheduleCache(cacheKey, activeItems);
  }
  return activeItems;
}

/**
 * 2. Próxima Temporada e Futuros Agregados (AniList -> Jikan -> Shikimori)
 * - Puxa até 250 obras futuras confirmadas (TV, Movie, ONA, OVA).
 * - Identifica animes contínuos em hiato (>14 dias) que possuem episódio futuro agendado (ex: One Piece 95 dias) e mescla automaticamente.
 * - Animes finalizados ou em hiato sem previsão futura (ex: Hunter x Hunter) não são incluídos.
 * - Proteção Anti-Degradação: NUNCA substitui catálogo saudável por lista parcial se houver throttling.
 */
export async function getAggregatedUpcomingAnimes(
  force = false,
  preloadedSeasonNow?: ScheduleAnimeItem[]
): Promise<ScheduleAnimeItem[]> {
  const cacheKey = 'upcoming_all';
  if (!force) {
    const cached = multiUpcomingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  let items: ScheduleAnimeItem[] = [];
  try {
    items = await fetchJikanOrAniListUpcoming(force);
  } catch (err) {
    console.warn('Falha em AniList/Jikan upcoming, acionando Shikimori...', err);
  }

  // 3. Fallback no Shikimori se necessário
  if (!items || items.length === 0) {
    try {
      const shikiUpcoming = await fetchShikimoriUpcoming();
      if (shikiUpcoming.length > 0) {
        items = shikiUpcoming;
      }
    } catch (e) {
      console.warn('Falha no fallback Shikimori upcoming:', e);
    }
  }

  // PROTEÇÃO ANTI-DEGRADAÇÃO:
  // Se a consulta de rede falhou ou retornou pouquíssimos itens (< 15) por limite de cota,
  // preserva o catálogo saudável prévio em vez de esvaziar a tela do usuário
  const previousHealthy = getCachedSeasonUpcoming() || multiUpcomingCache.get(cacheKey)?.data || [];
  if (items.length < 15 && previousHealthy.length > 50) {
    console.warn(`[Anti-Degradação] Consulta retornou ${items.length} itens. Preservando catálogo confiável de ${previousHealthy.length} itens.`);
    items = [...previousHealthy];
  }

  // Mescla animes contínuos ativos que entraram em hiato (>14 dias), mas que possuem retorno/episódio futuro confirmado (ex: One Piece)
  try {
    let seasonNowRaw = preloadedSeasonNow;
    if (!seasonNowRaw || seasonNowRaw.length === 0) {
      seasonNowRaw = await fetchJikanOrAniListSeasonNow(force).catch(() => []);
    }
    if (!seasonNowRaw || seasonNowRaw.length === 0) {
      seasonNowRaw = getCachedSeasonNow() || multiSeasonNowCache.get('season_now_all')?.data || [];
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const existingIds = new Set(items.map((i) => i.id));

    const hiatusWithFutureEpisodes = (seasonNowRaw || []).filter((item) => {
      if (!isAnimeInWeeklyHiatus(item)) return false;
      // Validação estrita: somente obras que possuem próximo episódio agendado com timestamp futuro
      if (item.nextEpisode?.airingAt && item.nextEpisode.airingAt > nowSec) return true;
      if (typeof item.nextEpisode?.timeUntilAiring === 'number' && item.nextEpisode.timeUntilAiring > 0) return true;
      if (item.startDate?.year && item.startDate.year >= new Date().getFullYear()) return true;
      return false;
    });

    for (const hItem of hiatusWithFutureEpisodes) {
      if (!existingIds.has(hItem.id)) {
        items.unshift({
          ...hItem,
          status: 'Not yet aired',
          broadcastDay: 'Em breve',
        });
        existingIds.add(hItem.id);
      }
    }
  } catch (err) {
    console.warn('Erro ao mesclar animes em hiato com episódios futuros em Próxima Temporada:', err);
  }

  if (items.length > 0) {
    multiUpcomingCache.set(cacheKey, { data: items, timestamp: Date.now() });
    setUnifiedSeasonCache('season_upcoming', items);
  }
  return items;
}

/**
 * 3. Temporada Atual Agregada (AniList -> Jikan -> Shikimori)
 * Filtra automaticamente animes que já concluíram a temporada após o dia do último episódio.
 */
export async function getAggregatedSeasonNowAnimes(force = false): Promise<ScheduleAnimeItem[]> {
  const cacheKey = 'season_now_all';
  if (!force) {
    const cached = multiSeasonNowCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data.filter((item) => !hasAnimeConcludedSeason(item));
    }
  }

  let items: ScheduleAnimeItem[] = [];
  try {
    items = await fetchJikanOrAniListSeasonNow(force);
  } catch (err) {
    console.warn('Falha em AniList/Jikan season now, acionando Shikimori...', err);
  }

  if (!items || items.length === 0) {
    try {
      const shikiSeason = await fetchShikimoriSeasonNow();
      if (shikiSeason.length > 0) {
        items = shikiSeason;
      }
    } catch (e) {
      console.warn('Falha no fallback Shikimori season now:', e);
    }
  }

  const activeItems = (items || []).filter((item) => !hasAnimeConcludedSeason(item));

  if (activeItems.length > 0) {
    multiSeasonNowCache.set(cacheKey, { data: activeItems, timestamp: Date.now() });
    setUnifiedSeasonCache('season_now', activeItems);
  }
  return activeItems;
}

/**
 * 4. Ciclo de Vida Completo da Agenda:
 * Executa as 3 APIs, reconcilia as transições automáticas e entrega dados 100% atualizados.
 */
export async function getAutomatedScheduleLifecycle(dayPt?: string, force = false, userAnimes: Anime[] = []): Promise<{
  activeWeekly: ScheduleAnimeItem[];
  activeSeasonNow: ScheduleAnimeItem[];
  activeUpcoming: ScheduleAnimeItem[];
}> {
  const [weekly, upcoming, seasonNow] = await Promise.all([
    getAggregatedWeeklySchedule(dayPt, force),
    getAggregatedUpcomingAnimes(force),
    getAggregatedSeasonNowAnimes(force),
  ]);

  const reconciled = reconcileScheduleLifecycle(weekly, upcoming, seasonNow, userAnimes);
  return {
    activeWeekly: reconciled.activeWeekly,
    activeSeasonNow: reconciled.activeSeasonNow,
    activeUpcoming: reconciled.cleanUpcoming,
  };
}

/**
 * Evento disparado no window quando o ciclo em segundo plano descobre animes novos,
 * transições de estreia ou mudanças de data.
 */
export const SCHEDULE_UPDATED_EVENT = 'wanime_schedule_updated';

let isBgSyncRunning = false;

export interface BackgroundSyncResult {
  success: boolean;
  isThrottled?: boolean;
  newAnimesCount: number;
  totalAnimesCount: number;
  activeWeekly: ScheduleAnimeItem[];
  activeSeasonNow: ScheduleAnimeItem[];
  cleanUpcoming: ScheduleAnimeItem[];
}

/**
 * Worker Silencioso e Manual de Sincronização da Agenda:
 * - Varre as 3 APIs (AniList -> Jikan -> Shikimori).
 * - Identifica novas produções cadastradas pelas produtoras japonesas em Próxima Temporada.
 * - Migra animes que estrearam para a grade de Em Exibição na semana e horário brasileiro.
 * - Remove do calendário semanal animes que concluíram sua temporada ou entraram em hiato (>14 dias).
 * - Transfere animes em hiato (como One Piece 96 dias) para Próxima Temporada.
 * - Proteção Anti-Degradação: NUNCA aceita sobrescrever uma lista completa por uma lista parcial ou vazia de erro 429.
 * - Cooldown inteligente de 35s contra múltiplos cliques rápidos em sequência.
 */
export async function runBackgroundScheduleSync(force = false, userAnimes: Anime[] = []): Promise<BackgroundSyncResult> {
  if (typeof window === 'undefined') {
    return { success: false, newAnimesCount: 0, totalAnimesCount: 0, activeWeekly: [], activeSeasonNow: [], cleanUpcoming: [] };
  }

  // Limpa caches obsoletos de versões antigas do app
  purgeLegacyScheduleCaches();

  if (isBgSyncRunning) {
    return { success: false, newAnimesCount: 0, totalAnimesCount: 0, activeWeekly: [], activeSeasonNow: [], cleanUpcoming: [] };
  }

  const lastSync = Number(localStorage.getItem(SCHEDULE_BACKGROUND_SYNC_TS) || '0');
  const now = Date.now();

  // Cooldown inteligente para proteger a cota da API (AniList 90 req/min):
  // Se uma sincronização completa com a rede já ocorreu há menos de 35 segundos,
  // evita disparar outra onda de requisições que causaria erro HTTP 429
  if (now - lastSync < MANUAL_SYNC_COOLDOWN) {
    const activeWeekly = multiScheduleCache.get('all')?.data || getCachedWeeklySchedule('all') || [];
    const activeSeasonNow = multiSeasonNowCache.get('season_now_all')?.data || getCachedSeasonNow() || [];
    const cleanUpcoming = multiUpcomingCache.get('upcoming_all')?.data || getCachedSeasonUpcoming() || [];

    if (activeWeekly.length > 0 || activeSeasonNow.length > 0 || cleanUpcoming.length > 0) {
      return {
        success: true,
        isThrottled: true,
        newAnimesCount: 0,
        totalAnimesCount: activeWeekly.length + activeSeasonNow.length + cleanUpcoming.length,
        activeWeekly,
        activeSeasonNow,
        cleanUpcoming,
      };
    }
  }

  isBgSyncRunning = true;
  try {
    // Lê IDs já conhecidos para identificar novos animes adicionados
    let previousKnownIds = new Set<number>();
    try {
      const storedIds = localStorage.getItem(KNOWN_SCHEDULE_IDS_KEY);
      if (storedIds) {
        const parsed = JSON.parse(storedIds);
        if (Array.isArray(parsed)) {
          previousKnownIds = new Set<number>(parsed);
        }
      }
    } catch {}

    // 1. Busca calendário semanal e animes em transmissão (passando a lista completa para identificação de hiatos pelo Juiz)
    let rawSeasonNow: ScheduleAnimeItem[] = [];
    try {
      rawSeasonNow = await fetchJikanOrAniListSeasonNow(force);
    } catch {
      rawSeasonNow = getCachedSeasonNow() || [];
    }

    const [weeklyRaw, upcomingRaw] = await Promise.all([
      getAggregatedWeeklySchedule(undefined, force).catch(() => []),
      getAggregatedUpcomingAnimes(force, rawSeasonNow).catch(() => []),
    ]);

    // 2. Reconciliação estrita do ciclo de vida: promove estreias, transfere hiatos e remove finalizados
    const { activeWeekly, activeSeasonNow, cleanUpcoming } = reconcileScheduleLifecycle(
      weeklyRaw,
      upcomingRaw,
      rawSeasonNow,
      userAnimes
    );

    // 4. Proteção Anti-Degradação do Juiz no salvamento da Próxima Temporada
    const previousUpcoming = getCachedSeasonUpcoming() || multiUpcomingCache.get('upcoming_all')?.data || [];
    let finalUpcoming = cleanUpcoming;
    if (finalUpcoming.length < 15 && previousUpcoming.length > 50) {
      console.warn(`[Juiz] Protegendo cache contra degradação: preservando ${previousUpcoming.length} animes futuros.`);
      const mergedMap = new Map<number, ScheduleAnimeItem>();
      previousUpcoming.forEach((item) => mergedMap.set(item.id, item));
      finalUpcoming.forEach((item) => mergedMap.set(item.id, item));
      finalUpcoming = Array.from(mergedMap.values());
    }

    // 5. Atualiza cache em memória e persistente local (FONTE ÚNICA DA VERDADE - JUIZ ÚNICO)
    if (activeWeekly.length > 0) {
      multiScheduleCache.set('all', { data: activeWeekly, timestamp: now });
      setUnifiedScheduleCache('all', activeWeekly);

      // Particiona a grade reconciliada por dia da semana para resposta imediata de 0ms
      const weekdays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
      for (const wDay of weekdays) {
        const dayItems = activeWeekly.filter(
          (item) => item.broadcastDay === wDay || item.broadcastDay?.startsWith(wDay)
        );
        if (dayItems.length > 0) {
          setUnifiedScheduleCache(wDay, dayItems);
        }
      }
    }

    if (finalUpcoming.length > 0) {
      multiUpcomingCache.set('upcoming_all', { data: finalUpcoming, timestamp: now });
      setUnifiedSeasonCache('season_upcoming', finalUpcoming);
    }

    if (activeSeasonNow.length > 0) {
      multiSeasonNowCache.set('season_now_all', { data: activeSeasonNow, timestamp: now });
      setUnifiedSeasonCache('season_now', activeSeasonNow);
    }

    // Calcula novos animes encontrados
    const allCombined = [...activeWeekly, ...activeSeasonNow, ...finalUpcoming];
    const currentIds = new Set<number>(allCombined.map((item) => item.id));
    let newAnimesCount = 0;

    if (previousKnownIds.size > 0) {
      for (const id of currentIds) {
        if (!previousKnownIds.has(id)) {
          newAnimesCount++;
        }
      }
    }

    // Salva o catálogo consolidado de IDs
    try {
      localStorage.setItem(KNOWN_SCHEDULE_IDS_KEY, JSON.stringify(Array.from(currentIds)));
    } catch {}

    // Grava timestamp da última sincronização bem-sucedida
    localStorage.setItem(SCHEDULE_BACKGROUND_SYNC_TS, String(now));

    // 6. Notifica componentes da aplicação sobre dados frescos com arrays reconciliados
    try {
      window.dispatchEvent(
        new CustomEvent(SCHEDULE_UPDATED_EVENT, {
          detail: {
            weeklyCount: activeWeekly.length,
            upcomingCount: finalUpcoming.length,
            seasonNowCount: activeSeasonNow.length,
            activeWeekly,
            activeSeasonNow,
            cleanUpcoming: finalUpcoming,
            newAnimesCount,
            isManual: force,
            timestamp: now,
          },
        })
      );
    } catch {}

    return {
      success: true,
      newAnimesCount,
      totalAnimesCount: allCombined.length,
      activeWeekly,
      activeSeasonNow,
      cleanUpcoming: finalUpcoming,
    };
  } catch (err) {
    console.warn('Sincronização da Agenda falhou:', err);
    return {
      success: false,
      newAnimesCount: 0,
      totalAnimesCount: 0,
      activeWeekly: [],
      activeSeasonNow: [],
      cleanUpcoming: [],
    };
  } finally {
    isBgSyncRunning = false;
  }
}

/**
 * 5. Personagens e Dubladores Agregados (Jikan -> AniList -> Shikimori)
 */
export async function getAggregatedCharacters(malId: number, animeTitle?: string): Promise<AnimeCharacterItem[]> {
  const cacheKey = `${malId || 0}_${animeTitle || ''}`;
  const cached = multiCharCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  let chars: AnimeCharacterItem[] = [];
  try {
    chars = await fetchJikanOrAniListCharacters(malId, animeTitle);
  } catch (err) {
    console.warn('Falha ao buscar personagens em Jikan/AniList:', err);
  }

  // Se Jikan e AniList não entregarem e tivermos malId, consulta Shikimori
  if ((!chars || chars.length === 0) && malId) {
    try {
      const shikiChars = await fetchShikimoriCharacters(malId);
      if (shikiChars.length > 0) {
        chars = shikiChars;
      }
    } catch (e) {
      console.warn('Falha ao buscar personagens no Shikimori:', e);
    }
  }

  if (chars && chars.length > 0) {
    multiCharCache.set(cacheKey, { data: chars, timestamp: Date.now() });
  }
  return chars || [];
}

/**
 * 6. Plataformas de Streaming Oficiais no Brasil Agregadas (Jikan + AniList + Shikimori)
 */
export async function getAggregatedStreamingLinks(malId: number, animeTitle?: string): Promise<AnimeStreamingLink[]> {
  const cacheKey = `${malId || 0}_${animeTitle || ''}`;
  const cached = multiStreamCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const linkMap = new Map<string, AnimeStreamingLink>();

  // 1 & 2. Jikan e AniList
  try {
    const jikanLinks = await fetchJikanOrAniListStreaming(malId, animeTitle);
    jikanLinks.forEach((l) => {
      if (l.name && l.url && !linkMap.has(l.name)) {
        linkMap.set(l.name, l);
      }
    });
  } catch (e) {
    console.warn('Falha ao buscar streaming em Jikan/AniList:', e);
  }

  // 3. Shikimori External Links
  if (malId) {
    try {
      const shikiLinks = await fetchShikimoriExternalLinks(malId);
      shikiLinks.forEach((l) => {
        const norm = normalizeBrazilStreaming(l.site, l.url);
        if (norm && !linkMap.has(norm.name)) {
          linkMap.set(norm.name, norm);
        }
      });
    } catch (e) {
      console.warn('Falha ao buscar links no Shikimori:', e);
    }
  }

  const results = Array.from(linkMap.values());
  if (results.length > 0) {
    multiStreamCache.set(cacheKey, { data: results, timestamp: Date.now() });
  }
  return results;
}
