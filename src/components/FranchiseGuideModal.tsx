import React from 'react';
import {
  X,
  CheckCircle2,
  MapPin,
  Check,
  Search,
  History,
  Layers,
  ArrowRight,
  EyeOff,
  Flame,
  HelpCircle
} from 'lucide-react';

interface FranchiseGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FranchiseGuideModal: React.FC<FranchiseGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="franchise-guide-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-black/95 backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div
        id="franchise-guide-modal"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl max-h-[90vh] bg-black border border-white/[0.08] rounded-3xl shadow-2xl shadow-black flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Topo / Header Minimalista All-Black Puro */}
        <div className="px-5 sm:px-6 pt-5 pb-4 flex items-start justify-between gap-3 shrink-0 border-b border-white/[0.06] bg-black">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10.5px] font-bold tracking-wide uppercase">
                Guia Prático
              </span>
              <span className="text-[11px] text-zinc-500">•</span>
              <span className="text-[11px] text-zinc-400 font-medium">Franquias e Temporadas</span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
              Como Adicionar e Organizar sua Franquia
            </h3>
            <p className="text-xs text-zinc-400">
              Passo a passo completo para cadastrar suas obras e nunca mais se perder em animes longos
            </p>
          </div>

          <button
            type="button"
            id="btn-close-franchise-guide"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-zinc-400 hover:text-white flex items-center justify-center border border-white/[0.08] transition-all cursor-pointer shrink-0 mt-0.5"
            title="Fechar tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo com Rolagem - Cards Flutuantes em Fundo Preto Absoluto */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3.5 custom-scrollbar bg-black">
          {/* Card 1: Digitar o Nome e Vincular */}
          <div className="p-4 rounded-2xl bg-[#070709] border border-white/[0.08] shadow-xl shadow-black/80 space-y-2 relative group hover:border-white/[0.15] transition-all">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 flex items-center justify-center text-xs font-black shrink-0">
                1
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>Comece pelo Nome do Anime</span>
              </h4>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed pl-10">
              Digite o nome do anime no campo de título. Você pode tocar em <strong className="text-white">Capas Oficiais HD</strong> para escolher a arte de capa oficial com a máxima qualidade.
            </p>

            <div className="ml-10 p-2.5 rounded-xl bg-black/70 border border-white/[0.05] text-[11px] text-zinc-400 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Dica: Mesmo que você digite apenas o nome geral (ex: <em>Bleach</em> ou <em>Naruto</em>), o sistema carrega tudo!</span>
            </div>
          </div>

          {/* Card 2: Carregar Franquia Completa */}
          <div className="p-4 rounded-2xl bg-[#070709] border border-white/[0.08] shadow-xl shadow-black/80 space-y-2 relative group hover:border-white/[0.15] transition-all">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-xs font-black shrink-0">
                2
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>Carregue a Franquia Completa</span>
              </h4>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed pl-10">
              Toque no botão <strong className="text-indigo-300">Carregar Franquia Completa</strong>. O sistema pesquisa automaticamente todas as temporadas de TV, filmes do cinema, especiais e OVAs em ordem cronológica canônica.
            </p>

            <div className="ml-10 p-2.5 rounded-xl bg-black/70 border border-white/[0.05] text-[11px] text-zinc-400 space-y-1">
              <div className="flex items-center gap-2 text-zinc-300 font-medium">
                <History className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Obras Clássicas ou Remakes?</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">
                Se o anime tiver versões diferentes (como <em>Fullmetal Alchemist</em> ou <em>Hunter x Hunter</em>), você pode tocar em <strong>Trocar Obra</strong> para escolher a que prefere.
              </p>
            </div>
          </div>

          {/* Card 3: Escolha Livre do que entra na lista */}
          <div className="p-4 rounded-2xl bg-[#070709] border border-white/[0.08] shadow-xl shadow-black/80 space-y-2 relative group hover:border-white/[0.15] transition-all">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center text-xs font-black shrink-0">
                3
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>Selecione Apenas o que Você Quer Acompanhar</span>
              </h4>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed pl-10">
              Navegue pelas abas (<strong>Séries TV</strong>, <strong>Filmes</strong> ou <strong>Especiais</strong>) e marque as caixas das temporadas e filmes que você já viu ou quer ver.
            </p>

            <div className="ml-10 p-2.5 rounded-xl bg-black/70 border border-white/[0.05] text-[11px] text-emerald-300/90 flex items-center gap-2">
              <EyeOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Tudo o que você deixar desmarcado fica 100% oculto, sem entulhar sua lista com filmes ou spin-offs que você não liga!</span>
            </div>
          </div>

          {/* Card 4: Marcar Onde Estou (O Ponto Atual) */}
          <div className="p-4 rounded-2xl bg-[#070709] border border-white/[0.08] shadow-xl shadow-black/80 space-y-2.5 relative group hover:border-white/[0.15] transition-all">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center text-xs font-black shrink-0">
                4
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>Defina Onde Você Está Assistindo Agora</span>
              </h4>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed pl-10">
              Na temporada em que você estiver no momento, toque no botão:
            </p>

            <div className="ml-10 flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                <span>Marcar onde estou</span>
              </span>
              <span className="text-[11px] text-zinc-500">→ Fica com destaque roxo</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed pl-10">
              O aplicativo sincroniza automaticamente o número total de episódios dessa temporada na ficha técnica do anime, para seu progresso ficar certinho.
            </p>
          </div>

          {/* Card 5: Aplicar e Avançar Facilmente */}
          <div className="p-4 rounded-2xl bg-[#070709] border border-white/[0.08] shadow-xl shadow-black/80 space-y-2 relative group hover:border-white/[0.15] transition-all">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center text-xs font-black shrink-0">
                5
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>Salve e Avance de Temporada com 1 Toque</span>
              </h4>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed pl-10">
              Ao terminar, toque em <strong className="text-white">Aplicar Franquia</strong> e depois salve o anime.
            </p>

            <div className="ml-10 p-2.5 rounded-xl bg-black/70 border border-white/[0.05] text-[11px] text-zinc-300 flex items-center gap-2">
              <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Quando você terminar o último episódio de uma temporada, o próprio app pergunta se você quer pular para a próxima sem precisar cadastrar nada de novo!</span>
            </div>
          </div>
        </div>

        {/* Rodapé All-Black com Botão Minimalista */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-white/[0.06] bg-black flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-zinc-500 hidden sm:inline">
            Pronto para organizar seus animes favoritos?
          </span>
          <button
            type="button"
            id="btn-understand-franchise-guide"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] active:scale-95 text-white font-bold text-xs sm:text-sm border border-white/[0.12] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <span>Entendi</span>
            <Check className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
