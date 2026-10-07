/**
 * Motor de Ciclo de Vida Automatizado da Agenda (WAnimeList)
 *
 * 1. Transição Automática:
 *    - Obras de "Próxima Temporada" que atingem a data de estreia migram automaticamente para "Em Exibição".
 *    - Obras em "Em Exibição" que transmitem o último episódio da temporada saem automaticamente do calendário semanal.
 *    - Novas produções cadastradas nas APIs entram automaticamente em "Próxima Temporada".
 *
 * 2. Previsão de Lançamento 100% Fiel às APIs:
 *    - Dia + Mês + Ano: "12 de Outubro de 2026"
 *    - Mês + Ano: "Outubro de 2026"
 *    - Estação + Ano: "Temporada de Outono de 2026"
 *    - Apenas Ano: "Previsão: 2026"
 *    - Sem data confirmada: "Aguardando data oficial de estreia"
 */

import type { ScheduleAnimeItem } from './jikanService';
import { formatAiringAtToBrazil } from './jikanService';
import type { Anime } from '../types';

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const SEASON_TRANSLATION_MAP: Record<string, string> = {
  WINTER: 'Inverno',
  SPRING: 'Primavera',
  SUMMER: 'Verão',
  FALL: 'Outono',
  winter: 'Inverno',
  spring: 'Primavera',
  summer: 'Verão',
  fall: 'Outono',
};

/**
 * Formata de maneira estrita a previsão de estreia com base única e exclusivamente
 * nos dados fornecidos pelas APIs oficiais, sem dedução ou especulação.
 */
export function formatUpcomingReleaseForecast(
  startDate?: { year?: number; month?: number; day?: number } | null,
  season?: string | null,
  year?: number | null,
  airingAtSeconds?: number | null
): { text: string; hasConfirmedDate: boolean; precision: 'day' | 'month' | 'season' | 'year' | 'unknown' } {
  let startYear = startDate?.year;
  let startMonth = startDate?.month;
  let startDay = startDate?.day;

  const nowMs = Date.now();
  // Se a data de início registrada for do passado (ex: lançamento original de animes contínuos como One Piece de 1999)
  const isStartDateInPast = Boolean(
    startYear &&
    (startYear < new Date().getFullYear() ||
      (startMonth && new Date(startYear, startMonth - 1, startDay || 1).getTime() < nowMs))
  );

  // Se a API disponibilizar timestamp de episódio futuro agendado (airingAtSeconds futuro):
  // Ou se a data de início for do passado, ou se startDate não tiver dia completo:
  const isAiringAtFuture = Boolean(airingAtSeconds && airingAtSeconds * 1000 > nowMs);

  if (airingAtSeconds && airingAtSeconds > 0 && (isAiringAtFuture || isStartDateInPast || !startYear || !startMonth || !startDay)) {
    try {
      const airingDate = new Date(airingAtSeconds * 1000);
      const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }).formatToParts(airingDate);

      const d = Number(parts.find((p) => p.type === 'day')?.value);
      const m = Number(parts.find((p) => p.type === 'month')?.value);
      const y = Number(parts.find((p) => p.type === 'year')?.value);

      if (d && m && y) {
        startDay = d;
        startMonth = m;
        startYear = y;
      }
    } catch {}
  }

  // 1. Data completa: Dia, Mês e Ano
  if (startYear && startMonth && startDay) {
    const monthIndex = startMonth - 1;
    const monthName = MONTHS_PT[monthIndex] || String(startMonth);
    return {
      text: `${String(startDay).padStart(2, '0')} de ${monthName} de ${startYear}`,
      hasConfirmedDate: true,
      precision: 'day',
    };
  }

  // 2. Data parcial: Mês e Ano
  if (startYear && startMonth) {
    const monthIndex = startMonth - 1;
    const monthName = MONTHS_PT[monthIndex] || String(startMonth);
    return {
      text: `${monthName} de ${startYear}`,
      hasConfirmedDate: true,
      precision: 'month',
    };
  }

  // 3. Estação do Ano e Ano (ex.: Outono de 2026)
  if (season && (year || startYear)) {
    const finalYear = year || startYear;
    const seasonPt = SEASON_TRANSLATION_MAP[season.toUpperCase()] || season;
    return {
      text: `Temporada de ${seasonPt} de ${finalYear}`,
      hasConfirmedDate: true,
      precision: 'season',
    };
  }

  // 4. Apenas o Ano
  if (year || startYear) {
    const finalYear = year || startYear;
    return {
      text: `Previsão: ${finalYear}`,
      hasConfirmedDate: true,
      precision: 'year',
    };
  }

  // 5. Sem previsão definida ainda pelas produtoras nas APIs
  return {
    text: 'Aguardando data oficial de estreia',
    hasConfirmedDate: false,
    precision: 'unknown',
  };
}

/**
 * Verifica se a transmissão atual é o último episódio previsto para a transmissão
 * (ex.: episódio 12 de 12, ou 14 de 14).
 */
export function isFinalEpisodeOfSeason(item: ScheduleAnimeItem): boolean {
  if (!item || !item.episodes || item.episodes <= 0) return false;
  if (!item.nextEpisode?.episode) return false;
  return item.nextEpisode.episode === item.episodes;
}

/**
 * Informações sobre divisão de temporada em Cours ou Partes oficiais da API
 */
export interface AnimePartInfo {
  isSplitCourOrPart: boolean;
  partLabel: string | null; // Apenas "Continuação"
}

/**
 * Detecta de forma estrita a partir do título oficial da API (romaji ou inglês)
 * se a obra se trata de uma Parte 2, Cour 2 ou divisão oficial de temporada.
 */
export function detectAnimePartInfo(title: string, englishTitle?: string): AnimePartInfo {
  const fullText = `${title || ''} ${englishTitle || ''}`.toLowerCase();

  if (
    /(?:parte\s*\d+\b|part\s*\d+\b|\d+(?:st|nd|rd|th)\s*cour\b|cour\s*\d+\b|part\s*(?:ii|iii|iv|v)\b|parte\s*(?:ii|iii|iv|v)\b|final\s*part\b|parte\s*final\b|kanketsu-hen)/i.test(
      fullText
    )
  ) {
    return { isSplitCourOrPart: true, partLabel: 'Continuação' };
  }

  return { isSplitCourOrPart: false, partLabel: null };
}

/**
 * Retorna os rótulos humanizados para o desfecho da transmissão atual,
 * utilizando estritamente "Último Episódio Programado" para não induzir o usuário
 * a achar que a temporada encerrou caso haja um 2º cour ou continuação futura.
 */
export function getFinalEpisodeLabels(item: ScheduleAnimeItem): {
  badgeLabel: string;
  modalLabel: string;
} {
  const epNumber = item.nextEpisode?.episode || item.episodes;
  const total = item.episodes;

  return {
    badgeLabel: 'Último Ep. Programado',
    modalLabel: total
      ? `Último Episódio Programado desta Transmissão (Ep. ${epNumber} de ${total})`
      : `Último Episódio Programado (Ep. ${epNumber})`,
  };
}

/**
 * Calcula a pontuação de tempo de lançamento para ordenação cronológica estrita na aba de Próxima Temporada:
 * - Menor timestamp = estreia mais próxima (aparece primeiro).
 * - Datas exatas (dia/mês/ano) têm prioridade sobre aproximações.
 * - Meses/estações têm prioridade sobre apenas ano.
 * - Sem data oficial = pontuação máxima (aparece no final).
 */
export function getUpcomingReleaseTimestamp(item: ScheduleAnimeItem): number {
  if (!item) return Number.MAX_SAFE_INTEGER;

  // 1. Se tiver timestamp direto do episódio 1 agendado
  if (item.nextEpisode?.airingAt && item.nextEpisode.airingAt > 0) {
    return item.nextEpisode.airingAt * 1000;
  }

  const startYear = item.startDate?.year;
  const startMonth = item.startDate?.month;
  const startDay = item.startDate?.day;

  // 2. Data completa: dia, mês e ano
  if (startYear && startMonth && startDay) {
    return new Date(startYear, startMonth - 1, startDay, 12, 0, 0).getTime();
  }

  // 3. Data parcial: mês e ano (coloca no final daquele mês para quem tem dia confirmado ficar na frente)
  if (startYear && startMonth) {
    return new Date(startYear, startMonth, 0, 23, 59, 59).getTime();
  }

  // 4. Estação e ano
  if (item.season && (item.year || startYear)) {
    const y = item.year || startYear!;
    const s = String(item.season).toUpperCase();
    if (s === 'WINTER') return new Date(y, 2, 31, 23, 59, 59).getTime(); // Março
    if (s === 'SPRING') return new Date(y, 5, 30, 23, 59, 59).getTime(); // Junho
    if (s === 'SUMMER') return new Date(y, 8, 30, 23, 59, 59).getTime(); // Setembro
    if (s === 'FALL') return new Date(y, 11, 31, 23, 59, 59).getTime(); // Dezembro
  }

  // 5. Apenas o ano
  if (item.year || startYear) {
    const y = item.year || startYear!;
    return new Date(y, 11, 31, 23, 59, 59).getTime();
  }

  // 6. Sem data oficial definida
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Janela máxima de exibição semanal ativa (14 dias em segundos).
 * Se o próximo episódio agendado de um anime estiver a mais de 14 dias no futuro
 * (ex: hiato de 96 dias de One Piece entre temporadas/arcos), o anime NÃO está
 * em transmissão semanal ativa nesta semana e deve ir para a aba de Próxima Temporada.
 */
export const MAX_WEEKLY_AIRING_GAP_SECONDS = 14 * 24 * 60 * 60;

/**
 * Detecta se uma obra entrou em hiato de transmissão semanal (próximo episódio a mais de 14 dias de distância).
 */
export function isAnimeInWeeklyHiatus(item: ScheduleAnimeItem): boolean {
  if (!item) return false;

  // 1. Verificação por timestamp absoluto de transmissão
  if (item.nextEpisode?.airingAt && item.nextEpisode.airingAt > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    const diffSec = item.nextEpisode.airingAt - nowSec;
    if (diffSec > MAX_WEEKLY_AIRING_GAP_SECONDS) {
      return true;
    }
  }

  // 2. Verificação por timeUntilAiring fornecido diretamente pela API
  if (
    typeof item.nextEpisode?.timeUntilAiring === 'number' &&
    item.nextEpisode.timeUntilAiring > MAX_WEEKLY_AIRING_GAP_SECONDS
  ) {
    return true;
  }

  return false;
}

/**
 * Verifica se um anime encerrou sua temporada de exibição ou entrou em hiato (deve sair do calendário semanal e de Em Exibição).
 * Regra estrita de ciclo vivo:
 * - Se for o dia de exibição do último episódio, ele PERMANECE na grade para o usuário saber que o último episódio vai ao ar hoje.
 * - Assim que o dia de exibição do último episódio passar (após a meia-noite/24h da transmissão), ele é removido automaticamente.
 * - Se a obra entrou em hiato com próximo episódio a mais de 14 dias (ex: 96 dias de One Piece), sai da grade semanal.
 */
export function hasAnimeConcludedSeason(item: ScheduleAnimeItem): boolean {
  if (!item) return false;

  // 0. Obras com hiato superior a 14 dias saem da exibição semanal ativa
  if (isAnimeInWeeklyHiatus(item)) {
    return true;
  }

  const nowMs = Date.now();
  const statusLower = (item.status || '').toLowerCase();
  const isApiFinished =
    statusLower.includes('finished') ||
    statusLower.includes('completed') ||
    statusLower === 'released';

  // 1. Se a API indicar que já passou do último episódio previsto (ex: ep 13 de 12)
  if (item.episodes && item.episodes > 0 && item.nextEpisode?.episode) {
    if (item.nextEpisode.episode > item.episodes) {
      return true;
    }
  }

  // 2. Se for o último episódio da temporada com horário definido
  if (
    item.episodes &&
    item.episodes > 0 &&
    item.nextEpisode?.episode === item.episodes &&
    item.nextEpisode.airingAt
  ) {
    const airingTimeMs = item.nextEpisode.airingAt * 1000;
    // Janela de tolerância para manter visível durante todo o dia da transmissão (24 horas após o início)
    const endOfAiringWindow = airingTimeMs + 24 * 60 * 60 * 1000;
    if (nowMs >= endOfAiringWindow) {
      return true; // Já passou o dia do último episódio: sai da grade
    }
    return false; // Ainda é o dia do último episódio: permanece na grade
  }

  // 3. Se a API marcou como finalizado
  if (isApiFinished) {
    if (item.nextEpisode?.airingAt) {
      const airingTimeMs = item.nextEpisode.airingAt * 1000;
      const endOfAiringWindow = airingTimeMs + 24 * 60 * 60 * 1000;
      if (nowMs < endOfAiringWindow) {
        return false; // Último episódio transmitido hoje: mantém
      }
    }
    return true; // Finalizado em dias anteriores: sai da grade
  }

  return false;
}

/**
 * Verifica se um anime que estava em "Próxima Temporada" já começou a ser exibido no Japão / Brasil
 * e deve migrar imediatamente para a grade semanal de "Em Exibição".
 *
 * CRÍTICO: Animes com data futura anunciada (como Shangri-La Frontier 3rd Season com estreia em 2027)
 * NÃO começaram a transmitir e DEVEM PERMANECER na aba "Próxima Temporada".
 * Apenas no dia e horário real do lançamento do episódio 1 é que ele é promovido.
 */
export function hasAnimeStartedBroadcasting(item: ScheduleAnimeItem): boolean {
  if (!item) return false;

  const nowMs = Date.now();
  const statusLower = (item.status || '').toLowerCase().trim();

  // 1. Status explícito de não lançado / futuro
  const isNotYetReleasedStatus =
    statusLower === 'not_yet_released' ||
    statusLower === 'not yet aired' ||
    statusLower === 'upcoming' ||
    statusLower === 'to be aired';

  // 2. Se tem próximo episódio agendado com timestamp
  if (item.nextEpisode?.airingAt) {
    const airingTimeMs = item.nextEpisode.airingAt * 1000;
    const episodeNum = item.nextEpisode.episode || 1;

    // Se é o episódio 2 em diante, o episódio 1 já foi exibido!
    // Mas se estiver em hiato (>14 dias), não está em exibição semanal ativa
    if (episodeNum > 1) {
      return !isAnimeInWeeklyHiatus(item);
    }

    // Se é o episódio 1 (estreia da temporada):
    // SÓ começou se o timestamp de transmissão já foi atingido no relógio real!
    if (nowMs >= airingTimeMs) {
      return true;
    }

    // Se o episódio 1 é futuro, NÃO começou a transmitir
    return false;
  }

  // 3. Se tem data de estreia com dia, mês e ano
  if (item.startDate?.year && item.startDate?.month && item.startDate?.day) {
    const premiereDate = new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day, 0, 0, 0);
    // Se a data de estreia é estritamente futura, NÃO começou a transmitir
    if (nowMs < premiereDate.getTime()) {
      return false;
    }
    // Se a data já passou e o status não é explicitamente "Not yet aired"
    if (nowMs >= premiereDate.getTime() && !isNotYetReleasedStatus) {
      return true;
    }
  }

  // 4. Se o status na API virou para em exibição ativa e não é futuro nem hiato
  if (
    !isNotYetReleasedStatus &&
    !isAnimeInWeeklyHiatus(item) &&
    (statusLower.includes('releasing') ||
      statusLower.includes('currently airing') ||
      statusLower === 'ongoing')
  ) {
    return true;
  }

  return false;
}

export interface ReconciledScheduleResult {
  activeWeekly: ScheduleAnimeItem[];
  activeSeasonNow: ScheduleAnimeItem[];
  cleanUpcoming: ScheduleAnimeItem[];
}

/**
 * Reconcilia o ciclo de vida dos animes entre as listas semanais, temporada atual e futuras:
 * - Filtra os que já encerraram temporada ou entraram em hiato (saem de Em Exibição e da grade semanal).
 * - Transfere os que estão em hiato mas têm retorno futuro confirmado (ex: One Piece 96 dias) para Próxima Temporada.
 * - Transfere os que estrearam de Próxima Temporada para Em Exibição e Grade Semanal na data/dia correto.
 * - Filtra produções chinesas (Donghuas), a menos que o usuário já tenha aquele anime específico em sua lista pessoal.
 * - Mantém novas obras detectadas pelas APIs e obras com datas futuras em Próxima Temporada.
 * - Não toca nos dados de rastreamento pessoal do usuário (minha lista).
 */
export function reconcileScheduleLifecycle(
  weeklyList: ScheduleAnimeItem[],
  upcomingList: ScheduleAnimeItem[],
  seasonNowList: ScheduleAnimeItem[] = [],
  userAnimes: Anime[] = []
): ReconciledScheduleResult {
  const activeWeeklyMap = new Map<number, ScheduleAnimeItem>();
  const activeSeasonNowMap = new Map<number, ScheduleAnimeItem>();
  const upcomingMap = new Map<number, ScheduleAnimeItem>();

  // Conjunto de IDs da lista pessoal do usuário para permitir exceção de animes que ele adicionou
  const userAnimeIds = new Set<number>();
  const userAnimeTitles = new Set<string>();
  for (const ua of userAnimes) {
    if (ua.mal_id) userAnimeIds.add(Number(ua.mal_id));
    if (Array.isArray(ua.franchiseIds)) {
      ua.franchiseIds.forEach((id) => userAnimeIds.add(Number(id)));
    }
    if (ua.title) userAnimeTitles.add(ua.title.toLowerCase().trim());
    if (ua.originalTitle) userAnimeTitles.add(ua.originalTitle.toLowerCase().trim());
  }

  // Validador de origem: descarta animes chineses (countryOfOrigin === 'CN') a menos que o usuário tenha salvo na sua lista
  const isAllowedOrigin = (item: ScheduleAnimeItem): boolean => {
    if (item.countryOfOrigin && item.countryOfOrigin.toUpperCase() === 'CN') {
      const isInUserCollection =
        userAnimeIds.has(item.id) ||
        (item.idMal ? userAnimeIds.has(item.idMal) : false) ||
        userAnimeTitles.has(item.title.toLowerCase().trim());
      return isInUserCollection;
    }
    return true;
  };

  // Helper que verifica se a obra tem próximo episódio ou retorno futuro anunciado na API
  const hasFutureScheduledEpisode = (item: ScheduleAnimeItem): boolean => {
    if (item.nextEpisode?.airingAt) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (item.nextEpisode.airingAt > nowSec) return true;
    }
    if (typeof item.nextEpisode?.timeUntilAiring === 'number' && item.nextEpisode.timeUntilAiring > 0) {
      return true;
    }
    // Obras contínuas ou de temporadas ativas que entraram em hiato semanal
    const statusLower = (item.status || '').toLowerCase();
    const isOngoingOrReleasing =
      statusLower.includes('releasing') ||
      statusLower.includes('currently airing') ||
      statusLower === 'ongoing';
    if (isOngoingOrReleasing && isAnimeInWeeklyHiatus(item)) {
      return true;
    }
    if (item.startDate?.year) {
      const now = new Date();
      if (item.startDate.year > now.getFullYear()) return true;
      if (item.startDate.month) {
        const premiere = new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day || 1);
        return premiere.getTime() > now.getTime();
      }
    }
    return false;
  };

  // 1. Processa os itens semanais atuais: remove quem encerrou temporada ou entrou em hiato
  for (const item of weeklyList) {
    if (!isAllowedOrigin(item)) continue;

    // Se está em hiato de transmissão (>14 dias, ex: One Piece):
    if (isAnimeInWeeklyHiatus(item)) {
      if (hasFutureScheduledEpisode(item)) {
        upcomingMap.set(item.id, {
          ...item,
          status: 'Not yet aired',
          broadcastDay: 'Em breve',
        });
      }
      continue;
    }

    if (hasAnimeConcludedSeason(item)) {
      if (hasFutureScheduledEpisode(item)) {
        upcomingMap.set(item.id, {
          ...item,
          status: 'Not yet aired',
          broadcastDay: 'Em breve',
        });
      }
      continue;
    }

    activeWeeklyMap.set(item.id, item);
  }

  // 2. Processa os itens da temporada atual (Em Exibição): remove quem encerrou temporada ou entrou em hiato
  for (const item of seasonNowList) {
    if (!isAllowedOrigin(item)) continue;

    if (isAnimeInWeeklyHiatus(item)) {
      if (hasFutureScheduledEpisode(item)) {
        upcomingMap.set(item.id, {
          ...item,
          status: 'Not yet aired',
          broadcastDay: 'Em breve',
        });
      }
      continue;
    }

    if (hasAnimeConcludedSeason(item)) {
      if (hasFutureScheduledEpisode(item)) {
        upcomingMap.set(item.id, {
          ...item,
          status: 'Not yet aired',
          broadcastDay: 'Em breve',
        });
      }
      continue;
    }

    activeSeasonNowMap.set(item.id, item);
  }

  // 3. Processa os itens de Próxima Temporada (upcomingList):
  for (const item of upcomingList) {
    if (!isAllowedOrigin(item)) continue;

    // Se já começou a ser transmitido e NÃO está em hiato (>14 dias):
    if (hasAnimeStartedBroadcasting(item) && !isAnimeInWeeklyHiatus(item)) {
      let broadcastDay = item.broadcastDay;
      let broadcastTime = item.broadcastTime;

      // Se tem timestamp do próximo episódio, calcula o dia do Brasil
      if (item.nextEpisode?.airingAt) {
        const formatted = formatAiringAtToBrazil(item.nextEpisode.airingAt);
        broadcastDay = formatted.day;
        broadcastTime = formatted.time || undefined;
      } else if (!broadcastDay || broadcastDay === 'Em breve' || broadcastDay === 'Outros') {
        if (item.startDate?.year && item.startDate?.month && item.startDate?.day) {
          const d = new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day);
          const daysOfWeekPt = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
          broadcastDay = daysOfWeekPt[d.getDay()] || 'Outros';
        }
      }

      const promotedItem: ScheduleAnimeItem = {
        ...item,
        status: 'Currently Airing',
        broadcastDay: broadcastDay || 'Outros',
        broadcastTime,
      };

      activeWeeklyMap.set(promotedItem.id, promotedItem);
      activeSeasonNowMap.set(promotedItem.id, promotedItem);
    } else {
      // Se não começou (data futura, indefinida ou hiato com retorno): PERMANECE em Próxima Temporada!
      const existing = upcomingMap.get(item.id);
      if (!existing) {
        upcomingMap.set(item.id, item);
      } else if (!existing.nextEpisode && item.nextEpisode) {
        upcomingMap.set(item.id, { ...existing, nextEpisode: item.nextEpisode });
      }
    }
  }

  return {
    activeWeekly: Array.from(activeWeeklyMap.values()),
    activeSeasonNow: Array.from(activeSeasonNowMap.values()),
    cleanUpcoming: Array.from(upcomingMap.values()),
  };
}
