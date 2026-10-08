import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Tv, 
  Save, 
  Plus, 
  Search, 
  Layers, 
  Trash2, 
  Image as ImageIcon, 
  Loader2, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Star, 
  Calendar, 
  CheckCircle2, 
  Circle,
  Upload,
  Link2,
  FolderOpen,
  Tag,
  Languages,
  SlidersHorizontal,
  Minus,
  Film,
  Building2,
  CalendarDays,
  FileText,
  Info,
  RotateCw,
  Lightbulb
} from 'lucide-react';
import type { Anime, AnimeFormData, AnimeSeasonOrArc, AnimeStatus } from '../types';
import { STATUS_CONFIG, BROADCAST_DAYS, ALL_ANIME_GENRES } from '../types';
import { searchAnimeMetadata, type JikanAnimeResult } from '../services/jikanService';
import { translateSynopsisToPT } from '../services/translationService';
import { compressImageFile } from '../lib/imageUtils';
import { FranchiseTreeSelector } from './FranchiseTreeSelector';
import { FranchiseGuideModal } from './FranchiseGuideModal';
import { getFranchiseRootTitle, fetchAnimeFranchiseTree } from '../services/franchiseService';
import { searchOfficialHighResCovers, type OfficialCoverItem } from '../services/officialCoverService';
import { fetchOfficialAnimeTrailer } from '../services/animeSyncService';

interface AnimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AnimeFormData) => Promise<void>;
  initialData?: Anime | Partial<AnimeFormData> | null;
  existingGenres?: string[];
}

export const AnimeModal: React.FC<AnimeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  existingGenres = [],
}) => {
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [japaneseTitle, setJapaneseTitle] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [newGenreInput, setNewGenreInput] = useState('');
  const [genreFilterText, setGenreFilterText] = useState('');
  const [status, setStatus] = useState<AnimeStatus>('watching');
  const [currentEpisode, setCurrentEpisode] = useState<string>('1');
  const [currentSeasonName, setCurrentSeasonName] = useState('Temporada 1');
  const [totalEpisodes, setTotalEpisodes] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [broadcastDay, setBroadcastDay] = useState<string>('');
  const [studio, setStudio] = useState<string>('');
  const [format, setFormat] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [releaseYear, setReleaseYear] = useState<string>('');
  const [trailerUrl, setTrailerUrl] = useState<string>('');
  const [malId, setMalId] = useState<number | null>(null);
  const [franchiseIds, setFranchiseIds] = useState<number[]>([]);
  const [franchiseTitle, setFranchiseTitle] = useState<string>('');
  const [structureMode, setStructureMode] = useState<'seasons' | 'arcs' | null>(null);

  // Cover input mode: 'file' | 'url'
  const [coverSourceMode, setCoverSourceMode] = useState<'file' | 'url'>('file');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Accordion for Advanced / Optional Details
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [showCoverControls, setShowCoverControls] = useState(false);

  // Expandable Advanced Seasons Management
  const [showAdvancedSeasons, setShowAdvancedSeasons] = useState(false);
  const [seasons, setSeasons] = useState<AnimeSeasonOrArc[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState<string>('');
  const [excludedFranchiseItems, setExcludedFranchiseItems] = useState<(number | string)[]>([]);

  // Estados para Capas Oficiais em Alta Definição (AniList HD + Jikan HD)
  const [officialCovers, setOfficialCovers] = useState<OfficialCoverItem[]>([]);
  const [isSearchingCovers, setIsSearchingCovers] = useState(false);
  const [showCoversGallery, setShowCoversGallery] = useState(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Free Jikan Search & Translation State
  const [isSearchingApi, setIsSearchingApi] = useState(false);
  const [isTranslatingSynopsis, setIsTranslatingSynopsis] = useState(false);
  const [searchResults, setSearchResults] = useState<JikanAnimeResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setOriginalTitle((initialData as any).originalTitle || initialData.title || '');
      setJapaneseTitle(initialData.japaneseTitle || '');
      setCoverUrl(initialData.coverUrl || '');
      setCoverSourceMode(initialData.coverUrl?.startsWith('data:') ? 'file' : 'url');
      setSynopsis(initialData.synopsis || '');
      setGenres(initialData.genres || []);
      setStatus(initialData.status);
      setCurrentEpisode(
        initialData.currentEpisode !== undefined && initialData.currentEpisode !== null
          ? String(initialData.currentEpisode)
          : '1'
      );
      setCurrentSeasonName(initialData.currentSeasonName || 'Temporada 1');
      setTotalEpisodes(initialData.totalEpisodes ? String(initialData.totalEpisodes) : '');
      setNotes(initialData.notes || '');
      setRating(initialData.rating !== undefined ? initialData.rating : null);
      setBroadcastDay(initialData.broadcastDay || '');
      setStudio(initialData.studio || '');
      setFormat(initialData.format || '');
      setSource(initialData.source || '');
      setReleaseYear(initialData.releaseYear ? String(initialData.releaseYear) : '');
      setTrailerUrl(initialData.trailerUrl || '');
      setMalId(initialData.mal_id || null);
      setFranchiseIds(initialData.franchiseIds || []);
      setFranchiseTitle(initialData.franchiseTitle || (initialData.title ? getFranchiseRootTitle(initialData.title) : ''));
      setStructureMode(initialData.structureMode || null);
      setExcludedFranchiseItems(initialData.excludedFranchiseItems || []);

      if (initialData.seasons && initialData.seasons.length > 0) {
        setSeasons(initialData.seasons);
        const curName = (initialData.currentSeasonName || '').trim().toLowerCase();
        const matched = initialData.seasons.find((s) => s.name.trim().toLowerCase() === curName) || initialData.seasons[0];
        if (matched) setActiveSeasonId(matched.id);
        if (initialData.seasons.length > 1) {
          setShowAdvancedSeasons(true);
        }
      } else {
        const defaultId = 'sec-1';
        setActiveSeasonId(defaultId);
        setSeasons([
          {
            id: defaultId,
            name: initialData.currentSeasonName || 'Temporada 1',
            totalEpisodes: initialData.totalEpisodes || null,
            order: 1,
            isWatched: false,
          },
        ]);
      }
      setShowOptionalDetails(false);
      setShowCoverControls(false);
    } else {
      // Defaults for new anime
      setTitle('');
      setOriginalTitle('');
      setJapaneseTitle('');
      setCoverUrl('');
      setCoverSourceMode('file');
      setSynopsis('');
      setGenres([]);
      setStatus('watching');
      setCurrentEpisode('1');
      setCurrentSeasonName('Temporada 1');
      setTotalEpisodes('');
      setNotes('');
      setRating(null);
      setBroadcastDay('');
      setStudio('');
      setFormat('');
      setSource('');
      setReleaseYear('');
      setTrailerUrl('');
      setMalId(null);
      setFranchiseIds([]);
      setFranchiseTitle('');
      setStructureMode(null);
      setExcludedFranchiseItems([]);
      setActiveSeasonId('');
      setSeasons([]);
      setShowAdvancedSeasons(false);
      setShowOptionalDetails(false);
      setShowCoverControls(false);
    }
    setSearchResults([]);
    setShowSearchResults(false);
    setError(null);
  }, [initialData, isOpen]);

  // Pré-carregamento e Sincronização Automática ao Digitar:
  // Enquanto o usuário digita (O, N, E...), o timer zera a cada tecla (ZERO requisições às APIs).
  // Quando o usuário termina de digitar (passou 700ms sem teclar e tem >= 2 letras):
  // 1. Consulta silenciosamente a árvore de franquias oficial na AniList
  // 2. Pré-carrega capas em alta resolução
  // 3. Preenche automaticamente metadados essenciais (estúdio, ano, trailer) se for novo cadastro
  useEffect(() => {
    if (!isOpen) return;
    const clean = title.trim();
    if (clean.length < 2) return;

    const timer = setTimeout(() => {
      fetchAnimeFranchiseTree(clean).catch(() => {});
      searchOfficialHighResCovers(clean).catch(() => {});
      if (!initialData && !originalTitle) {
        handleAutoFetchMetadata(clean);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [title, isOpen, initialData, originalTitle]);

  if (!isOpen) return null;

  // Handle local image file upload from phone gallery / PC
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor selecione um arquivo de imagem válido (JPG, PNG, WebP).');
      return;
    }

    setIsProcessingImage(true);
    setError(null);
    try {
      const compressedDataUrl = await compressImageFile(file, 640, 0.85);
      setCoverUrl(compressedDataUrl);
      setShowCoverControls(false);
    } catch (err) {
      console.error(err);
      setError('Erro ao processar imagem. Tente outra foto ou use um link.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Busca capas oficiais em altíssima resolução (AniList extraLarge + Jikan HD)
  // ESTRITAMENTE VISUAL: Nunca contamina IDs, episódios, temporadas ou metadados
  const handleSearchOfficialCovers = async () => {
    const query = title.trim();
    if (!query || query.length < 2) {
      setError('Digite pelo menos 2 letras do nome da obra para buscar capas oficiais.');
      return;
    }
    setIsSearchingCovers(true);
    setError(null);
    try {
      const items = await searchOfficialHighResCovers(query);
      setOfficialCovers(items);
      setShowCoversGallery(true);
      if (items.length === 0) {
        setError('Nenhuma capa oficial em alta definição encontrada para este nome nas APIs.');
      }
    } catch (err) {
      console.error('Erro na busca de capas oficiais HD:', err);
      setError('Erro ao buscar capas oficiais em alta definição.');
    } finally {
      setIsSearchingCovers(false);
    }
  };

  // Aplicação da capa selecionada pelo usuário (PURAMENTE VISUAL - NUNCA ALTERA NADA ALÉM DO CARD DA CAPA)
  const handleSelectOfficialCover = (cover: OfficialCoverItem) => {
    setCoverUrl(cover.imageUrl);
    setShowCoversGallery(false);
  };

  // Busca metadados oficiais e canônicos da obra na API (estúdio, gêneros, ano, trailer e sinopse em português)
  // Acoplado diretamente ao botão "Carregar Árvore Oficial"
  const handleAutoFetchMetadata = async (overrideQuery?: string) => {
    const query = (overrideQuery || title).trim();
    if (!query || query.length < 2) {
      return;
    }
    setIsLoadingMetadata(true);
    try {
      const results = await searchAnimeMetadata(query);
      if (results && results.length > 0) {
        const best = results[0];
        if (best.title) setOriginalTitle(best.title);
        if (best.title_japanese) setJapaneseTitle(best.title_japanese);
        if (best.mal_id) setMalId(best.mal_id);
        if (best.studio) setStudio(best.studio);
        if (best.format) setFormat(best.format);
        if (best.source) setSource(best.source);
        if (best.year) setReleaseYear(String(best.year));
        if (best.broadcastDay) setBroadcastDay(best.broadcastDay);
        if (best.genres && best.genres.length > 0) setGenres(best.genres);

        // Trailer oficial da produção
        if (best.trailerUrl) {
          setTrailerUrl(best.trailerUrl);
        } else {
          fetchOfficialAnimeTrailer(best.title || query, best.mal_id).then((t) => {
            if (t) setTrailerUrl(t);
          }).catch(() => {});
        }

        // Preenche a capa apenas se o usuário ainda não tiver selecionado uma capa personalizada
        if (!coverUrl && best.imageUrl) {
          setCoverUrl(best.imageUrl);
        }

        const detectedRoot = getFranchiseRootTitle(query) || best.title;
        if (detectedRoot) setFranchiseTitle(detectedRoot);

        if (best.synopsis) {
          setSynopsis(best.synopsis);
          // Tradução suave em segundo plano para nunca bloquear a tela
          setIsTranslatingSynopsis(true);
          translateSynopsisToPT(best.synopsis)
            .then((translated) => {
              if (translated) setSynopsis(translated);
            })
            .catch((tErr) => {
              console.warn('Erro ao traduzir sinopse:', tErr);
            })
            .finally(() => {
              setIsTranslatingSynopsis(false);
            });
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar ficha técnica da obra:', err);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  // Search anime with free Jikan API (seleção de ficha técnica opcional)
  const handleSearchApi = async () => {
    if (!title.trim() || title.trim().length < 2) {
      setError('Digite pelo menos 2 letras do nome para buscar.');
      return;
    }
    setIsSearchingApi(true);
    setError(null);
    try {
      const results = await searchAnimeMetadata(title);
      setSearchResults(results);
      setShowSearchResults(true);
      if (results.length === 0) {
        setError('Nenhum resultado automático encontrado.');
      }
    } catch (err) {
      console.error(err);
      setError('Erro na busca. Tente novamente.');
    } finally {
      setIsSearchingApi(false);
    }
  };

  const handleSelectApiResult = async (item: JikanAnimeResult) => {
    const userTypedTitle = title.trim();
    if (item.title) {
      setOriginalTitle(item.title);
    }
    if (!userTypedTitle) {
      setTitle(item.title);
    }
    
    if (item.title_japanese) {
      setJapaneseTitle(item.title_japanese);
    } else if (item.title && item.title.toLowerCase() !== userTypedTitle.toLowerCase()) {
      setJapaneseTitle(item.title);
    }

    if (item.mal_id) {
      setMalId(item.mal_id);
    }
    const detectedRoot = userTypedTitle
      ? getFranchiseRootTitle(userTypedTitle)
      : (getFranchiseRootTitle(item.title) || item.title);
    if (detectedRoot) {
      setFranchiseTitle(detectedRoot);
    } else {
      setFranchiseTitle(item.title);
    }

    // Só preenche a capa se o usuário ainda não tiver capa definida
    if (!coverUrl && item.imageUrl) setCoverUrl(item.imageUrl);
    if (item.broadcastDay) setBroadcastDay(item.broadcastDay);
    if (item.studio) setStudio(item.studio);
    if (item.format) setFormat(item.format);
    if (item.source) setSource(item.source);
    if (item.year) setReleaseYear(String(item.year));
    if (item.trailerUrl) setTrailerUrl(item.trailerUrl);
    if (item.genres && item.genres.length > 0) {
      setGenres(item.genres);
    }
    setShowSearchResults(false);

    if (item.synopsis) {
      setSynopsis(item.synopsis);
      setIsTranslatingSynopsis(true);
      try {
        const translated = await translateSynopsisToPT(item.synopsis);
        if (translated) setSynopsis(translated);
      } catch (err) {
        console.warn('Erro ao traduzir sinopse:', err);
      } finally {
        setIsTranslatingSynopsis(false);
      }
    }
  };

  // Manual trigger for synopsis translation
  const handleTranslateManual = async () => {
    if (!synopsis.trim()) return;
    setIsTranslatingSynopsis(true);
    try {
      const translated = await translateSynopsisToPT(synopsis);
      if (translated) setSynopsis(translated);
    } catch (err) {
      console.warn('Erro ao traduzir sinopse:', err);
    } finally {
      setIsTranslatingSynopsis(false);
    }
  };

  const handleToggleGenre = (g: string) => {
    if (genres.includes(g)) {
      setGenres(genres.filter((x) => x !== g));
    } else {
      setGenres([...genres, g]);
    }
  };

  const handleAddNewGenre = () => {
    const trimmed = newGenreInput.trim();
    if (!trimmed) return;
    if (!genres.includes(trimmed)) {
      setGenres([...genres, trimmed]);
    }
    setNewGenreInput('');
  };

  // Quick season preset picker helper and name sync
  const handleCurrentSeasonNameChange = (newName: string) => {
    setCurrentSeasonName(newName);
    if (seasons.length > 0) {
      setSeasons((prevSeasons) => {
        const curNorm = (currentSeasonName || '').trim().toLowerCase();
        const targetId = activeSeasonId || prevSeasons.find(s => s.name.trim().toLowerCase() === curNorm)?.id || prevSeasons[0].id;
        return prevSeasons.map((s) => {
          if (s.id === targetId) {
            return {
              ...s,
              name: newName,
              canonicalTitle: s.canonicalTitle || s.name,
            };
          }
          return s;
        });
      });
    }
  };

  const handleSelectQuickSeasonPreset = (presetName: string) => {
    handleCurrentSeasonNameChange(presetName);
  };

  // Episode quick increment/decrement respeitando o limite oficial da temporada se existir
  const handleIncrementEpisode = (delta: number) => {
    const current = Math.max(0, parseInt(currentEpisode, 10) || 0);
    const maxEp = totalEpisodes && parseInt(totalEpisodes, 10) > 0 ? parseInt(totalEpisodes, 10) : null;
    let updated = Math.max(0, current + delta);
    if (maxEp !== null && updated > maxEp) {
      updated = maxEp;
    }
    setCurrentEpisode(String(updated));
  };

  const handleCurrentEpisodeChange = (val: string) => {
    if (val === '') {
      setCurrentEpisode('');
      return;
    }
    const num = parseInt(val, 10);
    if (isNaN(num)) return;
    const maxEp = totalEpisodes && parseInt(totalEpisodes, 10) > 0 ? parseInt(totalEpisodes, 10) : null;
    if (maxEp !== null && num > maxEp) {
      setCurrentEpisode(String(maxEp));
    } else {
      setCurrentEpisode(String(Math.max(0, num)));
    }
  };

  const handleToggleSeasonWatched = (id: string) => {
    setSeasons(seasons.map((s) => (s.id === id ? { ...s, isWatched: !s.isWatched } : s)));
  };

  const handleUpdateSeasonName = (id: string, name: string) => {
    if (id === activeSeasonId || (seasons.find((s) => s.id === id)?.name === currentSeasonName)) {
      setCurrentSeasonName(name);
    }
    setSeasons(
      seasons.map((s) =>
        s.id === id
          ? {
              ...s,
              name,
              canonicalTitle: s.canonicalTitle || s.name,
            }
          : s
      )
    );
  };

  const handleUpdateSeasonEpisodes = (id: string, totalStr: string) => {
    const total = totalStr && parseInt(totalStr, 10) > 0 ? parseInt(totalStr, 10) : null;
    setSeasons(seasons.map((s) => (s.id === id ? { ...s, totalEpisodes: total } : s)));
  };

  const handleRemoveCustomArc = (id: string) => {
    const target = seasons.find((s) => s.id === id);
    if (target) {
      const identifiers: (string | number)[] = [];
      if (target.mal_id) identifiers.push(target.mal_id);
      if (target.canonicalTitle) identifiers.push(target.canonicalTitle);
      if (target.name) identifiers.push(target.name);
      setExcludedFranchiseItems((prev) => Array.from(new Set([...prev, ...identifiers])));
    }
    setSeasons(seasons.filter((s) => s.id !== id));
  };

  const handleApplyFranchiseTree = (
    newSeasons: AnimeSeasonOrArc[],
    appliedSeasonName: string,
    activeTotalEp: number | null,
    newFranchiseIds: number[],
    newRootTitle: string,
    activeAiringDay?: string | null,
    appliedStructureMode?: 'seasons' | 'arcs',
    appliedExcludedItems?: (number | string)[]
  ) => {
    setSeasons(newSeasons);
    setCurrentSeasonName(appliedSeasonName);
    const activeFound = newSeasons.find((s) => s.name === appliedSeasonName) || newSeasons[0];
    if (activeFound) setActiveSeasonId(activeFound.id);
    if (appliedExcludedItems) {
      setExcludedFranchiseItems(appliedExcludedItems);
    }
    if (appliedStructureMode) {
      setStructureMode(appliedStructureMode);
    } else {
      setStructureMode(newSeasons.some((s) => s.type === 'arc' || s.name.toLowerCase().includes('arco')) ? 'arcs' : 'seasons');
    }
    if (activeTotalEp) {
      setTotalEpisodes(String(activeTotalEp));
    }
    if (newFranchiseIds.length > 0) {
      setFranchiseIds(newFranchiseIds);
    }
    if (newRootTitle) {
      setFranchiseTitle(newRootTitle);
    }
    // Sincroniza estritamente o dia semanal: apenas se houver temporada em exibição
    if (activeAiringDay) {
      setBroadcastDay(activeAiringDay);
    } else {
      setBroadcastDay('');
    }
    setShowAdvancedSeasons(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Por favor, informe o nome do anime.');
      return;
    }

    setLoading(true);
    setError(null);

    const parsedTotalEp = totalEpisodes && parseInt(totalEpisodes, 10) > 0 ? parseInt(totalEpisodes, 10) : null;
    const finalSeasonName = (currentSeasonName || 'Temporada 1').trim();

    // Prepare seasons list
    let finalSeasons: AnimeSeasonOrArc[] = [];
    if (seasons.length > 0) {
      const seenIds = new Set<string>();
      finalSeasons = seasons.map((s, idx) => {
        let sid = s.id && !seenIds.has(s.id) ? s.id : `sec_${idx + 1}_${s.mal_id || Date.now()}_${idx}`;
        seenIds.add(sid);
        const item: AnimeSeasonOrArc = {
          id: sid,
          name: (s.name || `Temporada ${idx + 1}`).trim(),
          totalEpisodes: s.totalEpisodes !== undefined && s.totalEpisodes !== null ? Number(s.totalEpisodes) : null,
          order: idx + 1,
          isWatched: Boolean(s.isWatched),
          releaseYear: s.releaseYear !== undefined && s.releaseYear !== null ? Number(s.releaseYear) : null,
          status: s.status ? String(s.status) : null,
        };
        if (s.canonicalTitle) item.canonicalTitle = s.canonicalTitle;
        if (s.mal_id !== undefined && s.mal_id !== null) item.mal_id = s.mal_id;
        if (s.type) item.type = s.type;
        return item;
      });

      // Localiza a temporada ativa existente: primeiro por activeSeasonId, depois pelo nome
      const activeIdx = activeSeasonId
        ? finalSeasons.findIndex((s) => s.id === activeSeasonId)
        : finalSeasons.findIndex((s) => s.name.toLowerCase() === finalSeasonName.toLowerCase());

      if (activeIdx >= 0) {
        // Atualiza a temporada existente em vez de criar uma duplicata
        finalSeasons[activeIdx] = {
          ...finalSeasons[activeIdx],
          name: finalSeasonName,
          totalEpisodes: parsedTotalEp !== null ? parsedTotalEp : finalSeasons[activeIdx].totalEpisodes,
          canonicalTitle: finalSeasons[activeIdx].canonicalTitle || finalSeasons[activeIdx].name,
        };
      } else {
        // Se realmente não há nenhuma temporada correspondente, adiciona
        finalSeasons.push({
          id: `sec_${finalSeasons.length + 1}_${Date.now()}`,
          name: finalSeasonName,
          totalEpisodes: parsedTotalEp,
          order: finalSeasons.length + 1,
          isWatched: false,
        });
      }
    } else {
      finalSeasons = [
        {
          id: `sec_1_${Date.now()}`,
          name: finalSeasonName,
          totalEpisodes: parsedTotalEp,
          order: 1,
          isWatched: false,
        },
      ];
    }

    try {
      const parsedYear = releaseYear && parseInt(releaseYear, 10) > 1900 ? parseInt(releaseYear, 10) : null;
      const effectiveStructureMode = structureMode || (
        finalSeasons.some((s) => s.type === 'arc' || s.name.toLowerCase().includes('arco')) ? 'arcs' : 'seasons'
      );

      await onSave({
        title: title.trim(),
        originalTitle: originalTitle.trim() || (initialData as any)?.originalTitle || undefined,
        japaneseTitle: japaneseTitle.trim() || undefined,
        coverUrl: coverUrl.trim() || null,
        synopsis: synopsis.trim() || null,
        genres: genres.length > 0 ? genres : [],
        studio: studio.trim() || null,
        format: format.trim() || null,
        source: source.trim() || null,
        releaseYear: parsedYear,
        trailerUrl: trailerUrl.trim() || null,
        season: 1,
        currentSeasonName: finalSeasonName,
        seasons: finalSeasons,
        excludedFranchiseItems: excludedFranchiseItems.length > 0 ? excludedFranchiseItems : undefined,
        currentEpisode: Math.max(0, Number(currentEpisode) || 0),
        totalEpisodes: parsedTotalEp,
        status,
        notes: notes.trim(),
        rating: rating !== null ? Number(rating) : null,
        broadcastDay: broadcastDay.trim() || null,
        structureMode: effectiveStructureMode,
        mal_id: malId || null,
        franchiseIds: franchiseIds.length > 0 ? franchiseIds : (malId ? [malId] : []),
        franchiseTitle: franchiseTitle.trim() || (title.trim() ? getFranchiseRootTitle(title.trim()) : undefined),
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError('Erro ao salvar os dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/90 backdrop-blur-xl overflow-y-auto animate-in fade-in duration-200">
      <div
        id="anime-form-modal-container"
        className="w-full max-w-2xl bg-[#0b0c10] border border-white/[0.08] rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.95)] overflow-hidden my-auto max-h-[94vh] flex flex-col text-slate-100 ring-1 ring-white/[0.05]"
      >
        {/* Header Blackout Total */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-white/[0.06] flex items-center justify-between bg-[#0b0c10]/95 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-indigo-400 shadow-inner">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                {initialData ? 'Editar Anime' : 'Adicionar Anime'}
              </h2>
              <p className="text-xs text-zinc-400">
                {initialData ? 'Atualize seu progresso, status ou capa' : 'Busque o título ou preencha rapidamente'}
              </p>
            </div>
          </div>

          <button
            id="btn-close-form-modal"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
            title="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content - Estrutura Plana Sem Caixas Pesadas Aninhadas */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-6 space-y-6 no-scrollbar">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2.5">
              <Info className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* ============================================================
              SEÇÃO 1: TÍTULO & CAPA (ESTRUTURA PLANA)
             ============================================================ */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <Search className="w-3.5 h-3.5" />
                <span>1. Título & Capa</span>
              </label>

              <div className="flex items-center gap-2">
                {coverUrl && (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold hidden sm:inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Metadados prontos
                  </span>
                )}
                <button
                  type="button"
                  id="btn-franchise-how-it-works-top"
                  onClick={() => setIsGuideModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-amber-300 hover:text-amber-200 border border-amber-500/25 text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                  title="Como funciona a seleção de temporadas e acompanhamento"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Como funciona?</span>
                </button>
              </div>
            </div>

            {/* Input de Nome + Botões de Busca Desacoplados */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <input
                  id="input-anime-form-title"
                  type="text"
                  required
                  placeholder="Ex: One Piece, Mushoku Tensei, Solo Leveling, Naruto..."
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFranchiseTitle('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchOfficialCovers();
                    }
                  }}
                  className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500/80 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 transition-all outline-none"
                />
              </div>

              {/* Ação: Buscar Capas Oficiais em Alta Definição (Desacoplada e Puramente Visual) */}
              <button
                type="button"
                id="btn-search-official-covers"
                onClick={handleSearchOfficialCovers}
                disabled={isSearchingCovers || !title.trim()}
                title="Buscar pôsteres e capas oficiais em Full HD (sem alterar dados da obra)"
                className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:bg-zinc-800 cursor-pointer shrink-0 shadow-lg shadow-indigo-600/25 active:scale-95"
              >
                {isSearchingCovers ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-amber-300" />
                )}
                <span>{isSearchingCovers ? 'Buscando HD...' : 'Capas Oficiais HD'}</span>
              </button>
            </div>

            {/* Galeria de Capas Oficiais em Altíssima Resolução (AniList HD & MyAnimeList HD) */}
            {showCoversGallery && (
              <div className="bg-zinc-950 border border-indigo-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-xl animate-in fade-in space-y-3">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-2.5">
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-indigo-300 flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Capas Oficiais em Alta Resolução</span>
                      <span className="text-[10px] text-zinc-400 font-normal">
                        ({officialCovers.length} pôsteres encontrados)
                      </span>
                    </h4>
                    <p className="text-[10.5px] text-zinc-400 mt-0.5">
                      A escolha da capa é meramente visual para seu card e não altera títulos, episódios ou temporadas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCoversGallery(false)}
                    className="text-zinc-400 hover:text-white text-xs cursor-pointer p-1 rounded-lg hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {officialCovers.length === 0 && !isSearchingCovers ? (
                  <div className="py-6 text-center text-xs text-zinc-400">
                    Nenhuma capa oficial em alta definição encontrada para "{title}".
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-80 overflow-y-auto pr-1 no-scrollbar overscroll-auto">
                    {officialCovers.map((cover, idx) => {
                      const isCurrentCover = coverUrl === cover.imageUrl;
                      return (
                        <div
                          key={`official_cover_${cover.id}_${idx}`}
                          onClick={() => handleSelectOfficialCover(cover)}
                          className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all flex flex-col bg-zinc-900 ${
                            isCurrentCover
                              ? 'border-indigo-400 ring-2 ring-indigo-500 shadow-lg'
                              : 'border-white/[0.08] hover:border-indigo-500/60 hover:scale-[1.02]'
                          }`}
                        >
                          <div className="aspect-[3/4] w-full relative overflow-hidden bg-black/60">
                            <img
                              src={cover.imageUrl}
                              alt={cover.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                            />
                            {isCurrentCover && (
                              <div className="absolute top-1.5 right-1.5 bg-indigo-600 text-white rounded-full p-1 shadow-md">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                            {cover.format && (
                              <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-zinc-300 uppercase tracking-wider">
                                {cover.format}
                              </span>
                            )}
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[8.5px] font-semibold text-amber-300 border border-amber-500/20">
                              {cover.source}
                            </span>
                          </div>
                          <div className="p-1.5 bg-zinc-950/90 flex-1 flex flex-col justify-center">
                            <p className="text-[10px] font-bold text-white truncate" title={cover.title}>
                              {cover.title}
                            </p>
                            {cover.year && (
                              <span className="text-[9px] text-zinc-400">{cover.year}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Sugestões de Resultados da Busca Jikan (Se clicou em busca clássica) */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="bg-zinc-950 border border-indigo-500/30 rounded-2xl p-2 max-h-60 overflow-y-auto space-y-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in">
                <div className="text-[11px] font-bold text-indigo-300 px-2.5 py-1.5 flex items-center justify-between border-b border-white/[0.08] mb-1">
                  <span>Selecione para preencher metadados:</span>
                  <button
                    type="button"
                    onClick={() => setShowSearchResults(false)}
                    className="text-zinc-400 hover:text-white text-xs cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
                {searchResults.map((res) => (
                  <div
                    key={res.mal_id}
                    onClick={() => handleSelectApiResult(res)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-indigo-600/20 cursor-pointer transition-colors border border-transparent hover:border-indigo-500/30"
                  >
                    {res.imageUrl && (
                      <img
                        src={res.imageUrl}
                        alt={res.title}
                        referrerPolicy="no-referrer"
                        className="w-10 h-14 rounded-lg object-cover shrink-0 bg-zinc-900 shadow-md"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{res.title}</h4>
                      <p className="text-[11px] text-zinc-400">
                        {res.year ? `${res.year} • ` : ''}
                        {res.episodes ? `${res.episodes} eps` : 'Em andamento'}
                        {res.studio ? ` • ${res.studio}` : ''}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[10px] font-bold shrink-0">
                      Usar Metadados
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Mini Card Preview da Capa e Título Selecionado */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.08] flex items-center justify-center shrink-0 shadow-md">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt="Capa"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-zinc-600" />
                  )}
                  {isProcessingImage && (
                    <div className="absolute inset-0 bg-black/85 flex items-center justify-center text-indigo-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-white truncate">
                    {title || 'Nenhum título digitado'}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {coverUrl ? 'Capa vinculada' : 'Sem foto de capa'} • {format || 'TV'} {releaseYear ? `(${releaseYear})` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCoverControls(!showCoverControls)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white border border-white/[0.08] text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{showCoverControls ? 'Ocultar Foto' : 'Trocar Foto'}</span>
                </button>
                {coverUrl && (
                  <button
                    type="button"
                    onClick={() => setCoverUrl('')}
                    title="Remover capa"
                    className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Painel Expansível de Troca Manual de Capa */}
            {showCoverControls && (
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-white/[0.08] space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCoverSourceMode('file')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      coverSourceMode === 'file'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.05]'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload da Galeria / PC</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverSourceMode('url')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      coverSourceMode === 'url'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.05]'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Colar Link de Imagem</span>
                  </button>
                </div>

                {coverSourceMode === 'file' ? (
                  <button
                    type="button"
                    id="btn-upload-anime-cover"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingImage}
                    className="w-full py-2.5 px-3.5 rounded-xl border border-dashed border-indigo-500/40 bg-indigo-950/20 text-indigo-300 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-indigo-950/40 transition-all"
                  >
                    <FolderOpen className="w-4 h-4 text-indigo-400" />
                    <span>Escolher foto do Celular ou Computador</span>
                  </button>
                ) : (
                  <input
                    id="input-anime-cover-url"
                    type="url"
                    placeholder="Cole a URL da imagem (https://...)"
                    value={coverUrl.startsWith('data:') ? '' : coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 outline-none"
                  />
                )}
              </div>
            )}
          </div>

          {/* ============================================================
              SEÇÃO 2: ÁRVORE & LINHA DO TEMPO DE TEMPORADAS / ARCOS
             ============================================================ */}
          <div className="pt-6 border-t border-white/[0.06] space-y-4 animate-in fade-in">
            <FranchiseTreeSelector
              animeTitle={title.trim()}
              malId={malId}
              currentSeasonName={currentSeasonName}
              currentTotalEpisodes={totalEpisodes ? parseInt(totalEpisodes, 10) : null}
              existingSeasons={seasons}
              initialStructureMode={structureMode}
              initialExcludedItems={excludedFranchiseItems}
              onExcludedItemsChange={(items) => setExcludedFranchiseItems(items)}
              onApplyFranchiseTree={handleApplyFranchiseTree}
              onToggleSeasonWatched={handleToggleSeasonWatched}
              onUpdateSeasonName={handleUpdateSeasonName}
              onUpdateSeasonEpisodes={handleUpdateSeasonEpisodes}
              onRemoveCustomArc={handleRemoveCustomArc}
              onSelectCurrentSeason={(sName, totalEp, sId) => {
                handleCurrentSeasonNameChange(sName);
                if (sId) setActiveSeasonId(sId);
                if (totalEp) setTotalEpisodes(String(totalEp));
              }}
              onTriggerLoadMetadata={(queryTitle) => handleAutoFetchMetadata(queryTitle)}
              onOpenGuide={() => setIsGuideModalOpen(true)}
            />
          </div>

          {/* ============================================================
              SEÇÃO 3: MEU PROGRESSO & STATUS (ESTRUTURA PLANA)
             ============================================================ */}
          <div className="pt-6 border-t border-white/[0.06] space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <Tv className="w-3.5 h-3.5" />
                <span>2. Meu Progresso & Status</span>
              </label>
              <span className="text-[11px] text-zinc-400 font-medium">Sincronizado com sua lista</span>
            </div>

            {/* Status em Pills Táteis Modernas e Compactas */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-400 block">Status da Obra:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(Object.keys(STATUS_CONFIG) as AnimeStatus[]).map((key) => {
                  const cfg = STATUS_CONFIG[key];
                  const isSelected = status === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatus(key)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border active:scale-95 ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm font-bold'
                          : 'bg-zinc-900/60 border-white/[0.06] text-zinc-400 hover:text-white hover:border-white/15 hover:bg-zinc-800/60'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]' : cfg.dotColor || 'bg-zinc-500'}`} />
                      <span className="truncate">{cfg.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Temporada Atual & Controle Compacto de Episódios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Temporada ou Arco Atual */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-300">
                  Temporada / Arco Atual
                </label>
                <input
                  id="input-anime-current-season-direct"
                  type="text"
                  placeholder="Ex: Temporada 1, Arco de Shibuya..."
                  value={currentSeasonName}
                  onChange={(e) => handleCurrentSeasonNameChange(e.target.value)}
                  className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 outline-none"
                />

                {/* Sugestões Rápidas Compactas */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                  {['Temporada 1', 'Temporada 2', 'Temporada 3', 'Temporada 4', 'Filme'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectQuickSeasonPreset(preset)}
                      className={`text-[9.5px] px-2 py-0.5 rounded-md border transition-all cursor-pointer shrink-0 font-medium ${
                        currentSeasonName === preset
                          ? 'bg-indigo-500/25 text-indigo-200 border-indigo-500/50 font-bold'
                          : 'bg-white/[0.03] text-zinc-400 border-white/[0.06] hover:text-white hover:border-white/15'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Controle Compacto e Ergonômico de Episódios */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-300">
                  Episódio Atual & Limite
                </label>

                <div className="flex items-center gap-2.5 pt-0.5 flex-wrap">
                  {/* Bloco Unificado de Contador [-] [input] [+] */}
                  <div className="inline-flex items-center bg-zinc-900 border border-white/[0.08] rounded-xl p-0.5 shadow-inner shrink-0">
                    <button
                      type="button"
                      onClick={() => handleIncrementEpisode(-1)}
                      className="w-7 h-7 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-all"
                      title="Diminuir 1 episódio"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <input
                      id="input-anime-current-ep"
                      type="number"
                      min="0"
                      required
                      value={currentEpisode}
                      onChange={(e) => handleCurrentEpisodeChange(e.target.value)}
                      className="w-14 sm:w-16 bg-transparent text-center text-sm font-black text-white outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => handleIncrementEpisode(1)}
                      disabled={Boolean(totalEpisodes && parseInt(totalEpisodes, 10) > 0 && parseInt(currentEpisode, 10) >= parseInt(totalEpisodes, 10))}
                      className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center cursor-pointer active:scale-90 transition-all shadow-sm shadow-indigo-600/30"
                      title="Avançar 1 episódio"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Total de Episódios Oficial (Preenchido pela API, Não-editável manualmente) */}
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <span>de</span>
                    <span 
                      className="px-2.5 py-1 bg-zinc-900/80 border border-white/[0.08] rounded-lg text-xs font-bold text-white min-w-[42px] text-center"
                      title="Total de episódios oficial definido pela API/Temporada"
                    >
                      {totalEpisodes && parseInt(totalEpisodes, 10) > 0 ? totalEpisodes : '—'}
                    </span>
                    <span>eps</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dia de Lançamento Semanal com design clean */}
            <div className="pt-3 border-t border-white/[0.06]">
              <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Dia de Lançamento Semanal</span>
                </span>
                <span className="text-[10px] text-zinc-400 font-normal">Horário de Brasília (BRT)</span>
              </label>
              <select
                id="select-anime-broadcast-day"
                value={broadcastDay}
                onChange={(e) => setBroadcastDay(e.target.value)}
                className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500/80 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none cursor-pointer"
              >
                <option value="">Nenhum / Não informado / Já finalizado</option>
                {BROADCAST_DAYS.map((d) => (
                  <option key={d} value={d}>
                    Toda(o) {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Onde Parei / Anotação */}
            <div className="pt-3 border-t border-white/[0.06]">
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                Onde parei / Anotação de minuto ou cena (Opcional)
              </label>
              <input
                id="input-anime-notes-modal"
                type="text"
                placeholder="Ex: minuto 14:35, começou a luta..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 outline-none"
              />
            </div>
          </div>

          {/* ============================================================
              SEÇÃO 4: INFORMAÇÕES OPCIONAIS & AVANÇADAS (ACCORDION PLANO)
             ============================================================ */}
          <div className="pt-6 border-t border-white/[0.06] space-y-4">
            <button
              type="button"
              onClick={() => setShowOptionalDetails(!showOptionalDetails)}
              className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer py-1"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
                <span>3. Informações Opcionais (Gêneros, Sinopse, Estúdio)</span>
              </span>
              <div className="flex items-center gap-1.5 text-[11px] text-indigo-400 font-semibold">
                <span>{showOptionalDetails ? 'Recolher' : 'Expandir'}</span>
                {showOptionalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showOptionalDetails && (
              <div className="pt-2 space-y-4.5 animate-in fade-in">
                {/* GÊNEROS E TAGS */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Gêneros e Categorias</span>
                    </label>
                    <span className="text-[11px] text-zinc-500">{genres.length} selecionado(s)</span>
                  </div>

                  {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2.5 bg-zinc-950 border border-white/[0.06] rounded-xl">
                      {genres.map((g) => (
                        <span
                          key={g}
                          className="inline-flex items-center gap-1.5 bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 px-2.5 py-1 rounded-lg text-xs font-medium"
                        >
                          <span>{g}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleGenre(g)}
                            className="text-indigo-300 hover:text-white cursor-pointer ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-zinc-400 font-semibold">
                        Escolha ou filtre os gêneros:
                      </span>
                      <input
                        type="text"
                        placeholder="Filtrar gêneros..."
                        value={genreFilterText}
                        onChange={(e) => setGenreFilterText(e.target.value)}
                        className="bg-zinc-900 border border-white/[0.08] focus:border-indigo-500 rounded-lg px-2.5 py-1 text-[11px] text-white placeholder:text-zinc-500 outline-none w-40"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-zinc-950 border border-white/[0.06] rounded-xl no-scrollbar">
                      {(() => {
                        const combined = Array.from(
                          new Set([...ALL_ANIME_GENRES, ...existingGenres, ...genres])
                        ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

                        const filtered = genreFilterText.trim()
                          ? combined.filter((g) =>
                              g.toLowerCase().includes(genreFilterText.toLowerCase().trim())
                            )
                          : combined;

                        return filtered.map((preset) => {
                          const isSelected = genres.includes(preset);
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleToggleGenre(preset)}
                              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-xs'
                                  : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-white hover:border-white/15'
                              }`}
                            >
                              {isSelected ? `✓ ${preset}` : preset}
                            </button>
                          );
                        });
                      })()}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Adicionar gênero personalizado..."
                        value={newGenreInput}
                        onChange={(e) => setNewGenreInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddNewGenre();
                          }
                        }}
                        className="flex-1 bg-zinc-900 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewGenre}
                        disabled={!newGenreInput.trim()}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-white cursor-pointer shrink-0 transition-all active:scale-95"
                      >
                        + Adicionar
                      </button>
                    </div>
                  </div>
                </div>

                {/* SINOPSE COM TRADUÇÃO */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Sinopse / História</span>
                    </label>

                    {synopsis && (
                      <button
                        type="button"
                        onClick={handleTranslateManual}
                        disabled={isTranslatingSynopsis}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 font-medium"
                      >
                        {isTranslatingSynopsis ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Languages className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span>{isTranslatingSynopsis ? 'Traduzindo...' : 'Traduzir p/ PT-BR'}</span>
                      </button>
                    )}
                  </div>

                  <textarea
                    id="input-anime-synopsis"
                    rows={3}
                    placeholder="Sinopse ou resumo da história..."
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                    className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-600 outline-none resize-none leading-relaxed"
                  />
                </div>

                {/* FICHA TÉCNICA EXTRA */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Detalhes de Produção</span>
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                        Estúdio de Animação
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Ufotable, Mappa, Bones..."
                        value={studio}
                        onChange={(e) => setStudio(e.target.value)}
                        className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                        Formato de Mídia
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: TV, Filme, OVA, ONA..."
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                        className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                        Origem / Fonte
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Mangá, Light Novel, Original..."
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                        Ano de Lançamento
                      </label>
                      <input
                        type="number"
                        placeholder="Ex: 2024"
                        min="1960"
                        max="2035"
                        value={releaseYear}
                        onChange={(e) => setReleaseYear(e.target.value)}
                        className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                      Link do Trailer Oficial (YouTube)
                    </label>
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={trailerUrl}
                      onChange={(e) => setTrailerUrl(e.target.value)}
                      className="w-full bg-zinc-900/60 border border-white/[0.08] focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ============================================================
              FOOTER ACTIONS (BLACKOUT TOTAL)
             ============================================================ */}
          <div className="pt-4 border-t border-white/[0.06] flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              id="btn-cancel-form-modal"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              id="btn-save-form-modal"
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : initialData ? (
                <Save className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>{initialData ? 'Salvar Alterações' : 'Cadastrar Anime'}</span>
            </button>
          </div>
        </form>
      </div>

      <FranchiseGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </div>
  );
};
