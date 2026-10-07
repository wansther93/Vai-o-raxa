import React, { useState, useEffect, useRef } from 'react';
import { 
  GitBranch, 
  Layers, 
  CheckCircle2, 
  Circle, 
  Loader2, 
  Tv, 
  ListTree, 
  ChevronRight, 
  ChevronLeft,
  Check, 
  RefreshCw, 
  Plus, 
  Trash2,
  SlidersHorizontal,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Film,
  Search,
  CheckCircle,
  Play,
  Edit3,
  X,
  CheckSquare,
  Square,
  MapPin,
  Clapperboard,
  Lightbulb
} from 'lucide-react';
import type { AnimeSeasonOrArc, FranchiseTreeItem, FranchiseCandidate } from '../types';
import { 
  fetchAnimeFranchiseTree, 
  buildSeasonsFromFranchiseSelection, 
  getFranchiseRootTitle 
} from '../services/franchiseService';
import { FranchiseGuideModal } from './FranchiseGuideModal';

interface FranchiseTreeSelectorProps {
  animeTitle: string;
  malId?: number | null;
  currentSeasonName: string;
  currentTotalEpisodes?: number | null;
  existingSeasons: AnimeSeasonOrArc[];
  initialStructureMode?: 'seasons' | 'arcs' | null;
  initialExcludedItems?: (number | string)[];
  onExcludedItemsChange?: (excluded: (number | string)[]) => void;
  onApplyFranchiseTree: (
    seasons: AnimeSeasonOrArc[],
    currentSeasonName: string,
    totalEpisodes: number | null,
    franchiseIds: number[],
    rootTitle: string,
    activeAiringDay?: string | null,
    structureMode?: 'seasons' | 'arcs',
    excludedFranchiseItems?: (number | string)[]
  ) => void;
  onToggleSeasonWatched?: (seasonId: string) => void;
  onUpdateSeasonName?: (seasonId: string, name: string) => void;
  onUpdateSeasonEpisodes?: (seasonId: string, episodesStr: string) => void;
  onRemoveCustomArc?: (seasonId: string) => void;
  onSelectCurrentSeason?: (seasonName: string, totalEp: number | null, seasonId?: string) => void;
  onTriggerLoadMetadata?: (query: string) => void;
  onOpenGuide?: () => void;
}

export const FranchiseTreeSelector: React.FC<FranchiseTreeSelectorProps> = ({
  animeTitle,
  malId,
  currentSeasonName,
  currentTotalEpisodes,
  existingSeasons,
  initialStructureMode,
  initialExcludedItems,
  onExcludedItemsChange,
  onApplyFranchiseTree,
  onToggleSeasonWatched,
  onUpdateSeasonName,
  onUpdateSeasonEpisodes,
  onRemoveCustomArc,
  onSelectCurrentSeason,
  onTriggerLoadMetadata,
  onOpenGuide,
}) => {
  const [loading, setLoading] = useState(false);
  const [franchiseItems, setFranchiseItems] = useState<FranchiseTreeItem[]>([]);
  const [candidateFranchises, setCandidateFranchises] = useState<FranchiseCandidate[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [franchiseIds, setFranchiseIds] = useState<number[]>([]);
  const [rootTitle, setRootTitle] = useState<string>('');
  const [excludedItemIds, setExcludedItemIds] = useState<(number | string)[]>(() => initialExcludedItems || []);
  const [selectedItemId, setSelectedItemId] = useState<string | number>('');
  const [activeAiringDay, setActiveAiringDay] = useState<string | null>(null);
  const [autoMarkPrevious, setAutoMarkPrevious] = useState(true);
  const [isTreeSelectorOpen, setIsTreeSelectorOpen] = useState(false);
  const [hasLoadedTree, setHasLoadedTree] = useState(false);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [isDisambiguationModalOpen, setIsDisambiguationModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

  // Estados para Filtros de Formato e Seleção da Linha do Tempo
  const [formatFilter, setFormatFilter] = useState<'tv' | 'movie' | 'special'>('tv');
  const [includedItemIds, setIncludedItemIds] = useState<(string | number)[]>([]);

  // Contadores dinâmicos por formato/categoria
  const totalCount = franchiseItems.length;
  const tvCount = franchiseItems.filter((it) => !it.format || it.format === 'TV').length;
  const movieCount = franchiseItems.filter(
    (it) => it.format === 'Movie' || /filme|movie/i.test(it.title) || /filme|movie/i.test(it.englishTitle || '')
  ).length;
  const specialCount = franchiseItems.filter(
    (it) =>
      it.format === 'OVA' ||
      it.format === 'Special' ||
      it.format === 'ONA' ||
      /ova|special|especial/i.test(it.title) ||
      /ova|special|especial/i.test(it.englishTitle || '')
  ).length;

  // Itens filtrados para visualização nas abas de formato (TV, Filmes, Especiais & OVAs)
  const displayedFranchiseItems = franchiseItems.filter((it) => {
    if (formatFilter === 'tv') return !it.format || it.format === 'TV';
    if (formatFilter === 'movie') {
      return it.format === 'Movie' || /filme|movie/i.test(it.title) || /filme|movie/i.test(it.englishTitle || '');
    }
    if (formatFilter === 'special') {
      return (
        it.format === 'OVA' ||
        it.format === 'Special' ||
        it.format === 'ONA' ||
        /ova|special|especial/i.test(it.title) ||
        /ova|special|especial/i.test(it.englishTitle || '')
      );
    }
    return true;
  });

  // Lógica do Botão Duplo Inteligente e Independente por Aba (Marcar/Desmarcar Todos)
  const currentTabItems = displayedFranchiseItems;
  const currentTabSelectedItems = currentTabItems.filter((it) => includedItemIds.includes(it.id));
  const isCurrentTabDeselect =
    (currentTabItems.length === 1 && currentTabSelectedItems.length === 1) ||
    currentTabSelectedItems.length >= 2;

  const handleToggleCurrentTabSelection = () => {
    const currentTabIds = new Set(currentTabItems.map((it) => it.id));
    if (isCurrentTabDeselect) {
      // Remove da seleção apenas os itens da aba atual, mantendo as outras abas 100% intactas
      if (currentTabIds.has(selectedItemId)) {
        setSelectedItemId('');
      }
      setIncludedItemIds((prev) => prev.filter((id) => !currentTabIds.has(id)));
    } else {
      // Adiciona todos os itens da aba atual à seleção, sem alterar as escolhas das outras abas
      setIncludedItemIds((prev) => Array.from(new Set([...prev, ...currentTabItems.map((it) => it.id)])));
    }
  };

  // Ações de Inclusão com 1 Toque (Sem travar ou forçar onde o usuário está assistindo)
  const handleToggleInclude = (id: string | number) => {
    setIncludedItemIds((prev) => {
      const isCurrentlyIncluded = prev.includes(id);
      if (isCurrentlyIncluded) {
        if (String(selectedItemId) === String(id)) {
          setSelectedItemId('');
        }
        return prev.filter((x) => x !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleDeselectAll = () => {
    setIncludedItemIds([]);
    setSelectedItemId('');
  };

  // Carrega a árvore de franquia automaticamente ou ao acionar
  const handleLoadTree = async (overrideQuery?: string, resetExclusions = false) => {
    const query = (overrideQuery || animeTitle).trim();
    if (!query) return;
    setLoading(true);
    // Limpa obras e itens anteriores para evitar herdar candidatos antigos
    setCandidateFranchises([]);
    setSelectedClusterId(null);
    setFranchiseItems([]);
    setIncludedItemIds([]);
    setSelectedItemId('');
    if (resetExclusions) {
      setExcludedItemIds([]);
      if (onExcludedItemsChange) onExcludedItemsChange([]);
    }
    try {
      // Sempre busca a árvore completa da franquia pelo título da obra (query)
      const res = await fetchAnimeFranchiseTree(query, query);

      const rawItems = res.items || [];
      setFranchiseItems(rawItems);
      setFranchiseIds(res.franchiseIds);
      setRootTitle(res.rootTitle);
      setActiveAiringDay(res.activeAiringDay || null);

      const cands = res.candidateFranchises || [];
      setCandidateFranchises(cands);
      if (cands.length > 1) {
        setSelectedClusterId(cands[0].clusterId);
        setIsDisambiguationModalOpen(true);
      } else {
        setSelectedClusterId(null);
        setIsDisambiguationModalOpen(false);
      }

      // Regra de Ouro: NUNCA pré-seleciona nada automaticamente. O usuário escolhe livremente o que deseja incluir.
      setIncludedItemIds([]);
      // Não trava nem força a primeira temporada como assistida!
      setSelectedItemId('');

      setHasLoadedTree(true);
      setIsTreeSelectorOpen(true);
    } catch (err) {
      console.warn('Erro ao carregar árvore de franquia:', err);
    } finally {
      setLoading(false);
    }
  };

  // Alterna entre candidatos de franquia quando a busca encontrou múltiplas obras distintas
  const handleSelectCandidateFranchise = (cand: FranchiseCandidate) => {
    setSelectedClusterId(cand.clusterId);
    setRootTitle(cand.title);
    setFranchiseIds(cand.franchiseIds);
    setFranchiseItems(cand.items);

    // Começa sempre sem nada selecionado para que o usuário escolha os itens
    setIncludedItemIds([]);
    setSelectedItemId('');

    // Fecha o modal de desambiguação imediatamente ao escolher a obra
    setIsDisambiguationModalOpen(false);
  };

  const handleApply = () => {
    if (!franchiseItems || franchiseItems.length === 0) return;

    setIsApplying(true);
    
    // Filtra estritamente os itens que o usuário escolheu incluir no checklist
    let itemsToApply = franchiseItems.filter((it) => includedItemIds.includes(it.id));
    if (itemsToApply.length === 0) {
      const fallback = franchiseItems.find((it) => String(it.id) === String(selectedItemId)) || franchiseItems[0];
      if (fallback) itemsToApply = [fallback];
    }

    // Identifica itens não inclusos para persistência limpa (IDs, títulos e referências para nunca reaparecerem se descartados)
    const excludedEntities: (string | number)[] = [];
    franchiseItems
      .filter((it) => !itemsToApply.some((app) => String(app.id) === String(it.id)))
      .forEach((it) => {
        if (it.id) {
          excludedEntities.push(it.id);
          excludedEntities.push(String(it.id));
        }
        if ((it as any).aniListId) {
          excludedEntities.push((it as any).aniListId);
          excludedEntities.push(String((it as any).aniListId));
        }
        if (it.title) excludedEntities.push(it.title);
        if (it.englishTitle) excludedEntities.push(it.englishTitle);
        if (it.japaneseTitle) excludedEntities.push(it.japaneseTitle);
      });

    const newExcluded = Array.from(new Set([...excludedItemIds, ...excludedEntities]));
    setExcludedItemIds(newExcluded);
    if (onExcludedItemsChange) onExcludedItemsChange(newExcluded);

    // Garante que o selectedItemId é válido dentro de itemsToApply
    let finalActiveId = selectedItemId;
    if (!itemsToApply.some((it) => String(it.id) === String(selectedItemId))) {
      finalActiveId = itemsToApply[0].id;
      setSelectedItemId(finalActiveId);
    }

    // Executa a montagem e aplicação da estrutura legítima da API
    const result = buildSeasonsFromFranchiseSelection(itemsToApply, finalActiveId, autoMarkPrevious);
    onApplyFranchiseTree(
      result.seasons,
      result.currentSeasonName,
      result.activeTotalEpisodes,
      franchiseIds,
      rootTitle || getFranchiseRootTitle(animeTitle),
      activeAiringDay,
      'seasons',
      newExcluded
    );

    // Feedback tátil imediato e fechamento suave do seletor
    setTimeout(() => {
      setIsApplying(false);
      setIsTreeSelectorOpen(false);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 5000);
    }, 400);
  };

  const hasSeasons = existingSeasons && existingSeasons.length > 0;

  return (
    <div className="space-y-4">
      {/* Cabeçalho do Bloco */}
      <div className="space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-indigo-400 shrink-0 shadow-sm mt-0.5">
            <GitBranch className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs sm:text-sm font-black text-white">
              Temporadas & Franquia
            </h4>
            <p className="text-[11px] sm:text-xs text-zinc-400 leading-snug break-words mt-0.5">
              Detecte Toda a franquia automaticamente.
            </p>
          </div>
        </div>

        {/* Linha do Botão: Carregar Franquia Completa (centralizado no meio) */}
        <div className="flex items-center justify-center w-full pt-0.5">
          <button
            type="button"
            id="btn-load-franchise-tree"
            onClick={() => {
              if (!animeTitle.trim()) {
                if (onOpenGuide) {
                  onOpenGuide();
                } else {
                  setIsGuideModalOpen(true);
                }
                return;
              }
              setIsTreeSelectorOpen(true);
              handleLoadTree(undefined, true);
              if (onTriggerLoadMetadata) {
                onTriggerLoadMetadata(animeTitle);
              }
            }}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer"
            title={animeTitle.trim() ? "Detectar todas as temporadas e filmes da obra oficial" : "Digite o nome do anime ou veja como funciona"}
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Carregando...</span>
              </>
            ) : (
              <>
                <GitBranch className="w-3.5 h-3.5 text-indigo-200" />
                <span>Carregar Franquia Completa</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Banner de Feedback de Sucesso */}
      {showSuccessToast && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between gap-2 text-emerald-300 text-xs font-medium animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Estrutura aplicada com sucesso! Todas as temporadas da obra foram conectadas.</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSuccessToast(false)}
            className="text-emerald-400 hover:text-emerald-200 text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ============================================================
          PAINEL DE SELEÇÃO DA ÁRVORE (QUANDO ABERTO) - ESTRUTURA PLANA
         ============================================================ */}
      {hasLoadedTree && isTreeSelectorOpen && (
        <div className="space-y-3 pt-3 border-t border-white/[0.06] animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Indicador Sutil de Obra Selecionada de Linha Única com Botão para Trocar Obra */}
          {candidateFranchises.length > 1 && (() => {
            const selectedCandidate = candidateFranchises.find((c) => c.clusterId === selectedClusterId);
            return (
              <div className="flex items-center justify-between gap-2.5 p-2 px-3 rounded-xl bg-zinc-950/80 border border-white/[0.08] text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-zinc-400 text-[11px] font-medium shrink-0">Obra Selecionada:</span>
                  <span className="font-bold text-white truncate">
                    {selectedCandidate?.title || rootTitle}
                  </span>
                  {selectedCandidate?.year && (
                    <span className="text-zinc-500 text-[10px] shrink-0">
                      ({selectedCandidate.year})
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30 shrink-0 hidden sm:inline-block">
                    {franchiseItems.length} temporada(s)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDisambiguationModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-bold border border-indigo-500/30 hover:border-indigo-400 transition-all cursor-pointer shrink-0 active:scale-95 flex items-center gap-1.5"
                  title="Trocar para outra obra encontrada com nome semelhante"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Trocar Obra</span>
                </button>
              </div>
            );
          })()}

          {/* Abas de Formato (Séries TV, Filmes, Especiais & OVAs) com Botão Duplo Inteligente por Aba */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-white/[0.06]">
            {/* Abas de Formato - Sem a aba 'Todos' */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setFormatFilter('tv')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  formatFilter === 'tv'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                <Tv className="w-3 h-3 text-indigo-400" />
                <span>Séries TV ({tvCount})</span>
              </button>

              {movieCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFormatFilter('movie')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    formatFilter === 'movie'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06]'
                  }`}
                >
                  <Film className="w-3 h-3 text-purple-400" />
                  <span>Filmes ({movieCount})</span>
                </button>
              )}

              {specialCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFormatFilter('special')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    formatFilter === 'special'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06]'
                  }`}
                >
                  <Clapperboard className="w-3 h-3 text-amber-400" />
                  <span>Especiais & OVAs ({specialCount})</span>
                </button>
              )}
            </div>

            {/* Contador de Itens Selecionados e Botão Duplo Inteligente e Independente por Aba */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] font-semibold text-zinc-400">
                <strong className="text-white font-bold">{includedItemIds.length}</strong> selecionados
              </span>

              {currentTabItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleToggleCurrentTabSelection}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 border ${
                    isCurrentTabDeselect
                      ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                      : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/30'
                  }`}
                  title={
                    isCurrentTabDeselect
                      ? 'Desmarcar todos os itens desta aba'
                      : 'Selecionar todos os itens desta aba'
                  }
                >
                  {isCurrentTabDeselect ? (
                    <>
                      <Square className="w-3 h-3 text-rose-400" />
                      <span>Desmarcar todos</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-3 h-3 text-indigo-400" />
                      <span>Selecionar todos</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Lista de Itens com Seleção por Checklist */}
          <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 no-scrollbar overscroll-auto">
            {displayedFranchiseItems.length > 0 ? (
              displayedFranchiseItems.map((item, index) => {
                const isIncluded = includedItemIds.includes(item.id);
                const isSelected = String(selectedItemId) === String(item.id);
                const isMovie = item.format === 'Movie' || /filme|movie/i.test(item.title);
                const isOva = item.format === 'OVA';
                const isSpecial = item.format === 'Special' || item.format === 'ONA';

                // Determina se este item é uma temporada de TV anterior à ativa
                const activeItemIdx = franchiseItems.findIndex((it) => String(it.id) === String(selectedItemId));
                const currentItemIdx = franchiseItems.findIndex((it) => String(it.id) === String(item.id));
                const isPriorTvSeason =
                  autoMarkPrevious &&
                  activeItemIdx !== -1 &&
                  currentItemIdx < activeItemIdx &&
                  (!item.format || item.format === 'TV');

                return (
                  <div
                    key={`franchise_item_${item.id}_${index}`}
                    onClick={() => handleToggleInclude(item.id)}
                    className={`p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                      isIncluded
                        ? isSelected
                          ? 'bg-indigo-600/20 border-indigo-400/80 text-white ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-950/50'
                          : 'bg-zinc-950/90 border-white/[0.12] text-zinc-200 hover:border-white/[0.25] hover:bg-zinc-900/60'
                        : 'bg-zinc-950/40 border-white/[0.04] text-zinc-500 opacity-60 hover:opacity-85 hover:bg-zinc-900/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Checkbox de Inclusão com 1 Toque */}
                      <div className="shrink-0">
                        {isIncluded ? (
                          <div className="w-5 h-5 rounded-lg bg-indigo-600 border border-indigo-400 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-lg bg-black/40 border border-white/20 hover:border-white/40 transition-colors" />
                        )}
                      </div>

                      {/* Poster / Thumbnail com numeração */}
                      <div className="w-10 h-14 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/[0.08] shadow-xs relative">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-500">
                            {index + 1}
                          </div>
                        )}
                        <div className="absolute top-0.5 left-0.5 bg-black/80 px-1 rounded text-[8px] font-black text-zinc-300">
                          #{index + 1}
                        </div>
                      </div>

                      {/* Informações da Temporada / Filme */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-bold break-words leading-tight ${
                            isIncluded ? 'text-white' : 'text-zinc-400'
                          }`}
                        >
                          {item.title}
                        </p>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] text-zinc-400">
                          {/* Badge de Formato */}
                          <span
                            className={`px-1.5 py-0.2 rounded font-bold uppercase tracking-wider text-[9px] border ${
                              isMovie
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                : isOva || isSpecial
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                            }`}
                          >
                            {item.format || 'TV'}
                          </span>

                          {item.episodes ? (
                            <span className="font-medium text-zinc-300">{item.episodes} eps</span>
                          ) : (
                            <span className="text-cyan-300 font-medium">Em exibição</span>
                          )}

                          {item.seasonYear && (
                            <span className="text-zinc-500">• {item.seasonYear}</span>
                          )}

                          {/* Status de Assistida se aplicável */}
                          {isIncluded && isPriorTvSeason && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Assistida</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Lado Direito: Ação de Definir "Estou aqui" ou Status de Inclusão */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isIncluded ? (
                        isSelected ? (
                          <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black flex items-center gap-1.5 shadow-md shadow-indigo-600/40 border border-indigo-400/40 animate-in fade-in zoom-in-95">
                            <MapPin className="w-3.5 h-3.5 fill-white" />
                            <span>Estou aqui</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItemId(item.id);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-400 text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-xs"
                            title="Definir esta temporada como seu ponto atual de exibição"
                          >
                            <MapPin className="w-3 h-3 text-indigo-400 group-hover:text-white" />
                            <span>Marcar onde estou</span>
                          </button>
                        )
                      ) : (
                        <span className="text-[10px] font-semibold text-zinc-500 px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                          Omitido
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-zinc-400 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                {franchiseItems.length === 0
                  ? 'Nenhuma temporada adicional encontrada. Você pode adicionar manualmente abaixo.'
                  : 'Nenhum item corresponde ao filtro de formato selecionado.'}
              </div>
            )}
          </div>

          {/* Opções e Botão de Aplicar com Efeito Tátil */}
          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoMarkPrevious}
                onChange={(e) => setAutoMarkPrevious(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-black text-indigo-600 focus:ring-0 cursor-pointer"
              />
              <span>Marcar temporadas de TV anteriores como assistidas</span>
            </label>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-zinc-400 hidden sm:inline">
                {includedItemIds.length} item(ns) na ficha
              </span>
              <button
                type="button"
                id="btn-apply-franchise-structure"
                onClick={handleApply}
                disabled={isApplying}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 border ${
                  isApplying
                    ? 'bg-emerald-500 text-black shadow-emerald-500/40 scale-105 border-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 border-emerald-400/30'
                }`}
              >
                {isApplying ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 animate-bounce" />
                    <span>✓ Aplicando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Aplicar Franquia</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          ESTRUTURA APLICADA NO ANIME (LISTA LIMPA E CONFIGURÁVEL)
         ============================================================ */}
      {hasSeasons && (
        <div className="space-y-3 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Linha do Tempo Ativa:</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-open-manual-season-editor"
                onClick={() => setShowManualEditor(true)}
                className="text-[11px] text-indigo-300 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 cursor-pointer font-bold transition-all active:scale-95 shadow-sm"
              >
                <Edit3 className="w-3 h-3 text-indigo-400" />
                <span>Editar Manualmente</span>
              </button>
            </div>
          </div>

          {/* Cards Rápidos de Temporadas Ativas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto no-scrollbar pr-0.5 overscroll-auto">
            {existingSeasons.map((sec, idx) => {
              const isCurrent = sec.name === currentSeasonName;
              return (
                <div
                  key={`quick_season_${sec.id || idx}_${idx}`}
                  className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    isCurrent
                      ? 'bg-indigo-600/25 border-indigo-400 text-white ring-1 ring-indigo-500/50 shadow-sm'
                      : 'bg-zinc-950/80 border-white/[0.06] text-zinc-300 hover:border-white/15'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold break-words text-white leading-snug">{sec.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-indigo-500 text-white font-black shrink-0">
                          Atual
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      {sec.totalEpisodes ? `${sec.totalEpisodes} episódios` : 'Em exibição'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onToggleSeasonWatched && (
                      <button
                        type="button"
                        onClick={() => onToggleSeasonWatched(sec.id)}
                        className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-bold transition-all cursor-pointer border ${
                          sec.isWatched
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-white'
                        }`}
                        title={sec.isWatched ? 'Marcar como pendente' : 'Marcar como assistido'}
                      >
                        {sec.isWatched ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Visto</span>
                          </>
                        ) : (
                          <>
                            <Circle className="w-3 h-3 opacity-60" />
                            <span>Pendente</span>
                          </>
                        )}
                      </button>
                    )}

                    {onSelectCurrentSeason && (
                      isCurrent ? (
                        <button
                          type="button"
                          onClick={() => onSelectCurrentSeason('', null)}
                          className="text-[10px] px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1 shadow-sm"
                          title="Clique para desmarcar esta temporada como atual"
                        >
                          <Check className="w-3 h-3" />
                          <span>Desmarcar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectCurrentSeason(sec.name, sec.totalEpisodes || null, sec.id)}
                          className="text-[10px] px-2 py-1 rounded-lg bg-indigo-600/40 hover:bg-indigo-600 text-indigo-100 font-bold transition-all cursor-pointer active:scale-95"
                          title="Tornar esta temporada a atual"
                        >
                          Definir Atual
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-Modal Focado de Edição Manual de Temporadas & Arcos */}
      {showManualEditor && (
        <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-black border border-white/[0.08] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 ring-1 ring-white/[0.05]">
            {/* Topo do Modal */}
            <div className="p-4 sm:p-5 bg-black/90 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-indigo-400 shrink-0">
                  <Layers className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">Editar Temporadas & Arcos</h3>
                  <p className="text-[11px] text-zinc-400">Personalize os nomes e episódios como preferir</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualEditor(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de temporadas e arcos com scroll responsivo */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 flex-1">
              {existingSeasons.length === 0 ? (
                <div className="p-6 text-center text-zinc-400 text-xs">
                  Nenhuma temporada ou arco adicionado. Clique abaixo para criar o primeiro.
                </div>
              ) : (
                existingSeasons.map((sec, idx) => (
                  <div
                    key={`manual_editor_card_${sec.id || idx}_${idx}`}
                    className="p-2.5 rounded-xl bg-zinc-950/80 border border-white/[0.06] flex items-center gap-2.5 hover:border-white/15 transition-colors"
                  >
                    <span className="text-[11px] font-bold text-zinc-500 w-5 text-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="Nome da temporada / arco"
                        value={sec.name}
                        onChange={(e) => onUpdateSeasonName?.(sec.id, e.target.value)}
                        className="w-full bg-black/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                      />
                    </div>
                    <div className="w-20 shrink-0">
                      <input
                        type="number"
                        min="1"
                        placeholder="Eps"
                        value={sec.totalEpisodes ?? ''}
                        onChange={(e) => onUpdateSeasonEpisodes?.(sec.id, e.target.value)}
                        className="w-full bg-black/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-2 py-1.5 text-xs text-white text-center outline-none"
                      />
                    </div>
                    {onRemoveCustomArc && (
                      <button
                        type="button"
                        onClick={() => onRemoveCustomArc(sec.id)}
                        className="p-2 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors shrink-0"
                        title="Remover esta temporada"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Rodapé com Concluir */}
            <div className="p-4 bg-black/90 border-t border-white/[0.06] flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowManualEditor(false)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Concluir Edição</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Compacto de Desambiguação de Obras Encontradas */}
      {isDisambiguationModalOpen && candidateFranchises.length > 1 && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsDisambiguationModalOpen(false)}
        >
          <div 
            className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div className="p-4 bg-zinc-950 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">Escolha a Obra Desejada</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Foram encontradas {candidateFranchises.length} obras com títulos semelhantes. Clique na obra correta:
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDisambiguationModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de Obras Compacta e Focada */}
            <div className="p-3 overflow-y-auto space-y-2 max-h-[60vh]">
              {candidateFranchises.map((cand) => {
                const isCurrentActive = selectedClusterId === cand.clusterId;
                return (
                  <button
                    key={`disambiguation_modal_cand_${cand.clusterId}`}
                    type="button"
                    onClick={() => handleSelectCandidateFranchise(cand)}
                    className={`w-full p-2.5 rounded-xl text-left transition-all border cursor-pointer flex items-center gap-3 group ${
                      isCurrentActive
                        ? 'bg-indigo-600/20 text-white border-indigo-500/50 shadow-sm'
                        : 'bg-zinc-950/60 text-zinc-300 border-white/[0.06] hover:border-indigo-500/30 hover:bg-white/[0.04]'
                    }`}
                  >
                    {cand.coverUrl ? (
                      <img
                        src={cand.coverUrl}
                        alt={cand.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-lg shadow-md shrink-0 bg-zinc-950 border border-white/10"
                      />
                    ) : (
                      <div className="w-12 h-16 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 border border-white/10">
                        <Tv className="w-5 h-5 text-zinc-500" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors truncate block">
                          {cand.title}
                        </span>
                        {isCurrentActive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 shrink-0">
                            Selecionada
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                        {cand.year && <span>Ano {cand.year}</span>}
                        {cand.year && <span>•</span>}
                        <span className="text-zinc-300 font-medium">
                          {cand.itemCount} {cand.itemCount === 1 ? 'temporada/mídia' : 'temporadas/mídias'}
                        </span>
                      </div>
                      {cand.format && (
                        <div className="mt-1">
                          <span className="text-[10px] uppercase font-bold text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                            Formato: {cand.format}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.04] group-hover:bg-indigo-600 group-hover:text-white text-zinc-400 transition-colors border border-white/10">
                      <Check className="w-4 h-4" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-3 bg-zinc-950 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
              <span>Selecione a obra para carregar suas temporadas oficiais.</span>
              <button
                type="button"
                onClick={() => setIsDisambiguationModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Tutorial Explicativo (Apenas ativado ao clicar em 'Como funciona?') */}
      <FranchiseGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </div>
  );
};
