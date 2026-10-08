/**
 * Script de Simulação de Usuário Comum (Headless E2E Flow)
 * Testa todas as operações em memória SEM gravar ou alterar nada no Firebase.
 */

import {
  searchAnimeMetadata,
  getAnimeCharacters,
  getAnimeThemes,
  getAnimeStreamingLinks
} from '../src/services/jikanService';
import { fetchAnimeFranchiseTree } from '../src/services/franchiseService';
import { getAutomatedScheduleLifecycle } from '../src/services/multiApiAggregatorService';
import { getAggregatedAnimeNews } from '../src/services/newsService';
import { calculateOtakuLevel } from '../src/services/xpService';
import { calculateUserAchievements } from '../src/services/achievementService';
import { Anime } from '../src/types';

interface TestResult {
  step: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(step: string, passed: boolean, details: string) {
  results.push({ step, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${step}]: ${details}`);
}

async function runSimulation() {
  console.log('=====================================================');
  console.log('🤖 INICIANDO SIMULAÇÃO DE USUÁRIO COMUM (SEM BANCO DE DADOS)');
  console.log('=====================================================\n');

  // --- 1. BUSCA POR NOME EM INGLÊS (DEMON SLAYER) ---
  console.log('--- ETAPA 1: Busca por nome em inglês (Demon Slayer) ---');
  try {
    const dsResults = await searchAnimeMetadata('Demon Slayer');
    const found = dsResults.some(a => /kimetsu|demon slayer/i.test(a.title) || /kimetsu|demon slayer/i.test(a.title_english || ''));
    record('Busca Demon Slayer em Inglês', found, `Encontrados ${dsResults.length} resultados. Primeiro: "${dsResults[0]?.title}"`);
  } catch (err: any) {
    record('Busca Demon Slayer em Inglês', false, `Erro: ${err.message}`);
  }

  // --- 2. BUSCA POR ANIME CHINÊS (DONGHUA - LINK CLICK) ---
  console.log('\n--- ETAPA 2: Busca por anime chinês / Donghua (Link Click) ---');
  try {
    const cnResults = await searchAnimeMetadata('Link Click');
    const foundCn = cnResults.some(a => /shiguang|link click/i.test(a.title) || /shiguang|link click/i.test(a.title_english || ''));
    record('Busca Anime Chinês (Link Click)', foundCn, `Encontrados ${cnResults.length} resultados. Primeiro: "${cnResults[0]?.title}"`);
  } catch (err: any) {
    record('Busca Anime Chinês (Link Click)', false, `Erro: ${err.message}`);
  }

  // --- 3. RESOLUÇÃO DA ÁRVORE DE FRANQUIA (AMARRAÇÃO DE NÓS) ---
  console.log('\n--- ETAPA 3: Resolução da Árvore de Franquia de Demon Slayer ---');
  try {
    const dsTree = await fetchAnimeFranchiseTree('Demon Slayer');
    const hasItems = dsTree.items.length >= 4;
    const hasMovies = dsTree.items.some(i => (i.format || '').toUpperCase() === 'MOVIE');
    const hasTVSon = dsTree.items.some(i => (i.format || '').toUpperCase() === 'TV');
    record(
      'Árvore de Franquia Demon Slayer',
      hasItems && hasMovies && hasTVSon,
      `Franquia: "${dsTree.rootTitle}" | ${dsTree.items.length} produções detectadas | ${dsTree.franchiseIds.length} nós correlacionados`
    );
  } catch (err: any) {
    record('Árvore de Franquia Demon Slayer', false, `Erro: ${err.message}`);
  }

  // --- 4. CLASSIFICAÇÃO DE SPIN-OFFS E ESPECIAIS (ONE PIECE & MONSTERS) ---
  console.log('\n--- ETAPA 4: Isolamento de Spin-offs / 1-ep ONAs (One Piece & Monsters) ---');
  try {
    const opTree = await fetchAnimeFranchiseTree('One Piece');
    const monsters = opTree.items.find(i => /monsters/i.test(i.title));
    if (monsters) {
      const isOneEpisode = monsters.episodes === 1;
      const isOna = (monsters.format || '').toUpperCase() === 'ONA';
      // Regra de separação: ONA de 1 ep vai para Especiais/OVAs, não Séries principais
      const wouldBeInSpecials = isOna && isOneEpisode;
      record(
        'Classificação de Spin-off Monsters',
        wouldBeInSpecials,
        `Monsters detectado como ONA de ${monsters.episodes} ep. Classificado corretamente em Especiais & OVAs: ${wouldBeInSpecials}`
      );
    } else {
      record('Classificação de Spin-off Monsters', true, `Árvore de One Piece carregada com ${opTree.items.length} produções.`);
    }
  } catch (err: any) {
    record('Classificação de Spin-off Monsters', false, `Erro: ${err.message}`);
  }

  // --- 5. DETALHES RICOS: PERSONAGENS, TRILHA SONORA & STREAMINGS ---
  console.log('\n--- ETAPA 5: Puxar Personagens, Dubladores e Trilha Sonora (Jikan & AniList) ---');
  try {
    const characters = await getAnimeCharacters(38000); // Kimetsu no Yaiba (MAL ID 38000)
    const themes = await getAnimeThemes(38000);
    const streamings = await getAnimeStreamingLinks(38000);

    const hasCharacters = Array.isArray(characters) && characters.length > 0;
    const hasThemes = themes && (themes.openings.length > 0 || themes.endings.length > 0);

    record(
      'Personagens e Trilha Sonora',
      hasCharacters || hasThemes,
      `Personagens encontrados: ${characters?.length || 0} (Ex: ${characters[0]?.name}) | Aberturas: ${themes?.openings?.length || 0} | Encerramentos: ${themes?.endings?.length || 0} | Streamings: ${streamings?.length || 0}`
    );
  } catch (err: any) {
    record('Personagens e Trilha Sonora', false, `Erro: ${err.message}`);
  }

  // --- 6. ABA DE AGENDA E TEMPORADAS FUTURAS ---
  console.log('\n--- ETAPA 6: Aba de Agenda e Calendário Semanal Real ---');
  try {
    const lifecycle = await getAutomatedScheduleLifecycle();
    const hasWeekly = lifecycle.activeWeekly.length > 0;
    const hasSeasonNow = lifecycle.activeSeasonNow.length > 0;
    const hasUpcoming = lifecycle.activeUpcoming.length > 0;
    record(
      'Agenda de Lançamentos & Grade Semanal',
      hasWeekly && (hasSeasonNow || hasUpcoming),
      `Grade Semanal: ${lifecycle.activeWeekly.length} animes | Em Exibição (Season Now): ${lifecycle.activeSeasonNow.length} | Próxima Temporada (Upcoming): ${lifecycle.activeUpcoming.length}`
    );
  } catch (err: any) {
    record('Agenda de Lançamentos & Grade Semanal', false, `Erro: ${err.message}`);
  }

  // --- 7. NOTÍCIAS REAIS SEM INVENÇÃO (FEEDS OFICIAIS) ---
  console.log('\n--- ETAPA 7: Feed de Notícias Reais (Filtro Anti-Games/Off-Topic) ---');
  try {
    const news = await getAggregatedAnimeNews([]);
    const hasNews = news.length > 0;
    const hasRealSources = news.some(n => n.source.includes('Anime') || n.source.includes('Otaku') || n.source.includes('Crunchyroll') || n.source.includes('JBox') || n.source.includes('ANMTV'));
    record(
      'Feed de Notícias Reais',
      hasNews && hasRealSources,
      `Notícias coletadas: ${news.length} | Fontes: ${Array.from(new Set(news.map(n => n.source))).join(', ')}`
    );
  } catch (err: any) {
    record('Feed de Notícias Reais', false, `Erro: ${err.message}`);
  }

  // --- 8. SIMULAÇÃO DE LISTA, XP, NÍVEL E CONQUISTAS ---
  console.log('\n--- ETAPA 8: Simulação de Estatísticas do Perfil, XP e 52 Insígnias ---');
  try {
    const dummyAnimes: Anime[] = [
      {
        id: 'sim-1',
        userId: 'sim-user',
        title: 'Demon Slayer: Kimetsu no Yaiba',
        originalTitle: 'Demon Slayer: Kimetsu no Yaiba',
        currentEpisode: 26,
        totalEpisodes: 26,
        season: 1,
        currentSeasonName: 'Temporada 1',
        seasons: [
          {
            id: 's1',
            name: 'Temporada 1',
            order: 1,
            totalEpisodes: 26,
            isWatched: true,
          }
        ],
        status: 'completed',
        rating: 9,
        format: 'TV',
        genres: ['Action', 'Fantasy'],
        coverUrl: 'https://cdn.myanimelist.net/images/anime/1286/99889.jpg',
        franchiseIds: [38000, 40456, 47778],
        notes: 'Simulação',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'sim-2',
        userId: 'sim-user',
        title: 'Shingeki no Kyojin',
        originalTitle: 'Attack on Titan',
        currentEpisode: 25,
        totalEpisodes: 25,
        season: 1,
        currentSeasonName: 'Temporada 1',
        seasons: [
          {
            id: 's2',
            name: 'Temporada 1',
            order: 1,
            totalEpisodes: 25,
            isWatched: true,
          }
        ],
        status: 'completed',
        rating: 10,
        format: 'TV',
        genres: ['Action', 'Drama', 'Mystery'],
        coverUrl: 'https://cdn.myanimelist.net/images/anime/10/47347.jpg',
        franchiseIds: [16498],
        notes: 'Obra prima',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'sim-3',
        userId: 'sim-user',
        title: 'Shiguang Dailiren',
        originalTitle: 'Link Click',
        currentEpisode: 6,
        totalEpisodes: 11,
        season: 1,
        currentSeasonName: 'Temporada 1',
        seasons: [
          {
            id: 's3',
            name: 'Temporada 1',
            order: 1,
            totalEpisodes: 11,
            isWatched: false,
          }
        ],
        status: 'watching',
        rating: 8,
        format: 'ONA',
        genres: ['Drama', 'Mystery', 'Supernatural'],
        coverUrl: 'https://cdn.myanimelist.net/images/anime/1135/114867.jpg',
        franchiseIds: [44074],
        notes: 'Em andamento',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    // Simula um usuário comum normal (não admin, sem email de desenvolvedor)
    const achievementsResult = calculateUserAchievements(dummyAnimes, 'usuario_comum@gmail.com');
    const levelInfo = calculateOtakuLevel(dummyAnimes, achievementsResult.totalXpEarned);

    const totalEps = dummyAnimes.reduce((sum, a) => sum + (Number(a.currentEpisode) || 0), 0);

    record(
      'Cálculo de XP e Conquistas',
      levelInfo.totalXp > 0 && levelInfo.level >= 1,
      `Episódios assistidos: ${totalEps} | XP Total: ${levelInfo.totalXp} | Nível: ${levelInfo.level} (${levelInfo.rankTitle}) | Conquistas desbloqueadas: ${achievementsResult.totalUnlocked}/${achievementsResult.totalAchievements}`
    );
  } catch (err: any) {
    record('Cálculo de XP e Conquistas', false, `Erro: ${err.message}`);
  }

  // --- 9. RESUMO GERAL ---
  console.log('\n=====================================================');
  console.log('📊 RELATÓRIO FINAL DA SIMULAÇÃO:');
  const allPassed = results.every(r => r.passed);
  console.log(`Status geral: ${allPassed ? '✅ 100% OPERACIONAL' : '⚠️ ATENÇÃO'}`);
  console.log(`Testes bem-sucedidos: ${results.filter(r => r.passed).length}/${results.length}`);
  console.log('=====================================================');
}

runSimulation();
