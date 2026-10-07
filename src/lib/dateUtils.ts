import { getAnimeWatchedEpisodes } from '../services/achievementService';
import { getCachedWeeklySchedule, type ScheduleAnimeItem } from '../services/jikanService';
import { getFranchiseRootTitle } from '../services/franchiseService';

/**
 * Utilitários para detecção de dia de transmissão de animes
 */

export const getBrazilCurrentDayIndex = (): number => {
  try {
    const weekdayStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
    }).format(new Date());
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[weekdayStr] ?? new Date().getDay();
  } catch {
    return new Date().getDay();
  }
};

export const getTodayBroadcastName = (): string => {
  const daysMap: { [key: number]: string } = {
    0: 'Domingo',
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
    6: 'Sábado',
  };
  return daysMap[getBrazilCurrentDayIndex()];
};

export const isAiringToday = (broadcastDay?: string | null): boolean => {
  if (!broadcastDay) return false;
  const daysMap: { [key: number]: string } = {
    0: 'Domingo',
    1: 'Segunda',
    2: 'Terça',
    3: 'Quarta',
    4: 'Quinta',
    5: 'Sexta',
    6: 'Sábado',
  };
  const todayIndex = getBrazilCurrentDayIndex();
  const todayName = daysMap[todayIndex];
  return broadcastDay.toLowerCase().includes(todayName.toLowerCase());
};

export interface AnimeAiringCheckable {
  id?: string | number;
  title?: string;
  originalTitle?: string;
  japaneseTitle?: string;
  franchiseTitle?: string;
  broadcastDay?: string | null;
  status?: string;
  airingStatus?: string | null;
  currentEpisode?: number;
  totalEpisodes?: number | null;
  mal_id?: number | null;
  franchiseIds?: number[];
  seasons?: Array<{
    name?: string;
    canonicalTitle?: string;
    mal_id?: number | null;
  }>;
}

/**
 * Cruza o anime do usuário com a grade de exibição oficial da API de hoje.
 * Garante que:
 * 1. O anime realmente tem episódio transmitido hoje na API (nextAiringEpisode)
 * 2. Em semanas de hiato (ex.: One Piece em pausa da Toei), não dispara falso positivo
 * 3. Animes com títulos curtos (ex.: "Another") não dêem falso match em animes com "Another" no nome
 */
export function matchAnimeWithSchedule(
  anime: AnimeAiringCheckable,
  scheduleList: ScheduleAnimeItem[]
): boolean {
  if (!scheduleList || scheduleList.length === 0) return false;

  const animeMalId = anime.mal_id ? Number(anime.mal_id) : null;
  const animeFranchiseIds = new Set<number>();
  if (animeMalId) animeFranchiseIds.add(animeMalId);
  if (Array.isArray(anime.franchiseIds)) {
    for (const fid of anime.franchiseIds) {
      if (fid) animeFranchiseIds.add(Number(fid));
    }
  }
  if (Array.isArray(anime.seasons)) {
    for (const s of anime.seasons) {
      if (s.mal_id) animeFranchiseIds.add(Number(s.mal_id));
    }
  }

  // 1. Match direto por ID em O(1) (cobre mal_id, franchiseIds e todas as temporadas associadas)
  for (const item of scheduleList) {
    const itemMalId = item.idMal ? Number(item.idMal) : null;
    const itemId = item.id ? Number(item.id) : null;
    const itemAniListId = item.idAniList ? Number(item.idAniList) : null;

    if (itemMalId && animeFranchiseIds.has(itemMalId)) return true;
    if (itemId && animeFranchiseIds.has(itemId)) return true;
    if (itemAniListId && animeFranchiseIds.has(itemAniListId)) return true;
  }

  // 2. Match por título exato normalizado
  const normalize = (t?: string) => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetTitles = [
    normalize(anime.title),
    normalize(anime.originalTitle),
    normalize(anime.japaneseTitle),
    normalize(anime.franchiseTitle),
  ].filter(Boolean);

  if (Array.isArray(anime.seasons)) {
    for (const s of anime.seasons) {
      if (s.canonicalTitle) targetTitles.push(normalize(s.canonicalTitle));
      if (s.name) targetTitles.push(normalize(s.name));
    }
  }

  for (const item of scheduleList) {
    const itemTitles = [
      normalize(item.title),
      normalize(item.title_english),
      normalize(item.title_japanese),
    ].filter(Boolean);

    for (const t of targetTitles) {
      if (t.length >= 3 && itemTitles.some((it) => it === t)) {
        return true;
      }
    }
  }

  // 3. Match de raiz de franquia com proteção estrita para títulos curtos/genéricos
  const COMMON_WORDS = new Set([
    'another',
    'monster',
    'nana',
    'free',
    'orange',
    'major',
    'clannad',
    'shiki',
    'given',
    'solo',
    'alive',
    'blood',
    'reset',
    'restart',
    'world',
    'story',
  ]);

  const rawAnimeTitle = (anime.title || anime.originalTitle || '').toLowerCase().trim();
  if (COMMON_WORDS.has(rawAnimeTitle)) {
    // Para títulos curtos e ambíguos como "Another", EXIGE match exato de ID ou título idêntico!
    return false;
  }

  const animeRoot = (getFranchiseRootTitle(anime.franchiseTitle || anime.originalTitle || anime.title || '') || '').toLowerCase().trim();
  if (!animeRoot || animeRoot.length < 5 || COMMON_WORDS.has(animeRoot)) {
    return false;
  }

  for (const item of scheduleList) {
    const itemRoot = (getFranchiseRootTitle(item.title) || '').toLowerCase().trim();
    const itemEngRoot = (getFranchiseRootTitle(item.title_english || '') || '').toLowerCase().trim();

    if (itemRoot && !COMMON_WORDS.has(itemRoot)) {
      if (itemRoot === animeRoot || itemRoot.startsWith(animeRoot + ':') || animeRoot.startsWith(itemRoot + ':')) {
        return true;
      }
    }
    if (itemEngRoot && !COMMON_WORDS.has(itemEngRoot)) {
      if (itemEngRoot === animeRoot || itemEngRoot.startsWith(animeRoot + ':') || animeRoot.startsWith(itemEngRoot + ':')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Verifica com rigor absoluto se o anime realmente lança episódio hoje na rotina do usuário:
 * - O anime NÃO foi finalizado/completado nem dropado/pausado pelo usuário
 * - A série oficial não está marcada como Finished Airing/Finalizado
 * - Se os episódios totais já foram todos vistos e não está em espera de novos episódios
 * - O dia da semana de transmissão corresponde a hoje
 * - Confirmação via API: Se a grade de hoje estiver carregada, valida se a obra realmente tem episódio ativo hoje (evitando semanas de hiato)
 */
export const isAnimeActiveAndAiringToday = (
  anime?: AnimeAiringCheckable | null,
  scheduleToday?: ScheduleAnimeItem[] | null
): boolean => {
  if (!anime) return false;

  // 1. Status do usuário no app (exclui 100% de concluídos, abandonados, pausados e cancelados)
  const rawStatus = (anime.status || '').toLowerCase().trim();
  const isInactiveUserStatus =
    rawStatus === 'completed' ||
    rawStatus === 'dropped' ||
    rawStatus === 'paused' ||
    rawStatus === 'on_hold' ||
    rawStatus === 'cancelled' ||
    rawStatus.includes('termin') ||
    rawStatus.includes('conclu') ||
    rawStatus.includes('finaliz') ||
    rawStatus.includes('abandon') ||
    rawStatus.includes('paus') ||
    rawStatus.includes('cancel');

  if (isInactiveUserStatus) {
    return false;
  }

  // 2. Status oficial da obra nas APIs (Finished Airing / Finalizado)
  if (anime.airingStatus) {
    const s = anime.airingStatus.toLowerCase();
    if (
      s.includes('finish') ||
      s.includes('finaliz') ||
      s.includes('complete') ||
      s.includes('ended') ||
      s.includes('conclu')
    ) {
      return false;
    }
  }

  // 3. Se o usuário já assistiu a todos os episódios e o anime não está aguardando nova temporada/episódios
  if (
    typeof anime.totalEpisodes === 'number' &&
    anime.totalEpisodes > 0 &&
    typeof anime.currentEpisode === 'number' &&
    anime.currentEpisode >= anime.totalEpisodes &&
    rawStatus !== 'waiting_new_episodes'
  ) {
    return false;
  }

  // 4. O dia da semana de transmissão deve corresponder ao dia de hoje no fuso brasileiro
  if (!anime.broadcastDay || !isAiringToday(anime.broadcastDay)) {
    return false;
  }

  // 5. Validação rigorosa com a agenda oficial em tempo real da API (se disponível)
  // Tenta usar a lista passada como parâmetro ou a grade de hoje armazenada no cache local
  const effectiveSchedule =
    Array.isArray(scheduleToday) && scheduleToday.length > 0
      ? scheduleToday
      : getCachedWeeklySchedule(getTodayBroadcastName()) || [];

  if (effectiveSchedule.length > 0) {
    // Se a grade oficial da API de hoje está carregada, o anime PRECISA estar nela
    // Isso elimina 100% de falsos positivos (ex.: animes antigos e semanas de hiato como One Piece)
    return matchAnimeWithSchedule(anime, effectiveSchedule);
  }

  // Se a grade ainda não carregou (primeiros milissegundos de boot),
  // como proteção extra rejeitamos títulos curtos de catálogo finalizados conhecidos
  const titleNorm = (anime.title || '').toLowerCase().trim();
  if (titleNorm === 'another' || titleNorm === 'monster' || titleNorm === 'clannad') {
    return false;
  }

  return true;
};

export interface AirCountdown {
  isToday: boolean;
  isSoon: boolean; // Menos de 6 horas
  formattedCountdown: string; // Ex: "em 02h 45m", "em 2d 04h", "Disponível Hoje"
  label: string;
}

const DAY_INDEX_MAP: Record<string, number> = {
  domingo: 0,
  sunday: 0,
  segunda: 1,
  monday: 1,
  terça: 2,
  terca: 2,
  tuesday: 2,
  quarta: 3,
  wednesday: 3,
  quinta: 4,
  thursday: 4,
  sexta: 5,
  friday: 5,
  sábado: 6,
  sabado: 6,
  saturday: 6,
};

/**
 * Calcula uma contagem regressiva discreta em tempo real para o próximo episódio
 * Baseado estritamente no fuso horário de Brasília (America/Sao_Paulo).
 */
export const getAnimeAirCountdown = (
  broadcastDay?: string | null,
  broadcastTime?: string | null
): AirCountdown | null => {
  if (!broadcastDay) return null;

  const cleanDay = broadcastDay.toLowerCase().trim();
  let targetDayIndex: number | undefined;

  for (const [key, idx] of Object.entries(DAY_INDEX_MAP)) {
    if (cleanDay.includes(key)) {
      targetDayIndex = idx;
      break;
    }
  }

  if (targetDayIndex === undefined) return null;

  const now = new Date();
  const currentDayIndex = getBrazilCurrentDayIndex();
  const isToday = currentDayIndex === targetDayIndex;

  // Extrai horas e minutos se informados (ex: "23:00 (JST)" ou "14:30")
  let targetHour = 14; // Default para início da tarde / início de exibição ocidental
  let targetMinute = 0;

  if (broadcastTime) {
    const match = broadcastTime.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      // Se for JST (UTC+9), converte aproximadamente para Horário de Brasília (UTC-3: -12h)
      if (broadcastTime.toLowerCase().includes('jst')) {
        targetHour = (h - 12 + 24) % 24;
      } else {
        targetHour = h;
      }
      targetMinute = m;
    }
  }

  // Cria a data-alvo do próximo episódio
  const targetDate = new Date(now);
  let daysDiff = (targetDayIndex - currentDayIndex + 7) % 7;

  targetDate.setHours(targetHour, targetMinute, 0, 0);

  // Se for hoje mas o horário já passou há mais de 3 horas, o próximo é na semana que vem
  if (daysDiff === 0 && now.getTime() > targetDate.getTime() + 1000 * 60 * 60 * 3) {
    daysDiff = 7;
  }

  targetDate.setDate(targetDate.getDate() + daysDiff);

  const diffMs = targetDate.getTime() - now.getTime();

  if (diffMs <= 0 && isToday) {
    return {
      isToday: true,
      isSoon: false,
      formattedCountdown: 'Disponível Hoje',
      label: 'Novo Episódio',
    };
  }

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const isSoon = days === 0 && hours < 6;

  let countdownStr = '';
  if (days > 0) {
    countdownStr = `em ${days}d ${hours > 0 ? `${hours}h` : ''}`.trim();
  } else if (hours > 0) {
    countdownStr = `em ${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim();
  } else {
    countdownStr = `em ${Math.max(1, minutes)}m`;
  }

  return {
    isToday,
    isSoon,
    formattedCountdown: countdownStr,
    label: isToday ? 'Hoje' : broadcastDay.split('-')[0],
  };
};

export interface ViewingStats {
  days: number;
  hours: number;
  minutes: number;
  totalMinutes: number;
  totalEpisodesWatched: number;
}

/**
 * Calcula tempo assistido baseado em 23.5 minutos médios por episódio assistido
 */
export const calculateViewingStats = (animes: any[]): ViewingStats => {
  let totalEpisodesWatched = 0;

  animes.forEach((anime) => {
    totalEpisodesWatched += getAnimeWatchedEpisodes(anime);
  });

  const totalMinutes = Math.round(totalEpisodesWatched * 23.5);
  const days = Math.floor(totalMinutes / (24 * 60));
  const remainingHoursMinutes = totalMinutes % (24 * 60);
  const hours = Math.floor(remainingHoursMinutes / 60);
  const minutes = remainingHoursMinutes % 60;

  return {
    days,
    hours,
    minutes,
    totalMinutes,
    totalEpisodesWatched,
  };
};

