'use client';
import { useEffect, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Play, Download, Layers, Calendar, AlertTriangle, Eye, X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface SessaoCaptura {
  id: string;
  codigo_sessao: string;
  data_inicio: string;
  status: string;
  itens_capturados: { count: number }[];
}

interface ItemFalta {
  codigo_sistema: string;
  codigo_barras: string;
  descricao: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [sessoes, setSessoes] = useState<SessaoCaptura[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para o Modal de consulta rápida no celular
  const [modalAberto, setModalAberto] = useState(false);
  const [itensFaltantes, setItensFaltantes] = useState<ItemFalta[]>([]);
  const [carregandoFaltas, setCarregandoFaltas] = useState(false);
  const [sessaoSelecionada, setSessaoSelecionada] = useState('');

  useEffect(() => {
    async function buscarSessoes() {
      const { data, error } = await supabase
        .from('sessoes_captura')
        .select(`
          id, codigo_sessao, data_inicio, status,
          itens_capturados(count)
        `)
        .eq('status', 'salvo')
        .order('data_inicio', { ascending: false });

      if (!error && data) {
        setSessoes(data as unknown as SessaoCaptura[]);
      }
      setLoading(false);
    }
    
    buscarSessoes();
  }, []);

  async function iniciarNovaCaptura() {
    const { data: codigoAleatorio } = await supabase.rpc('generar_codigo_sessao');
    const codigo = codigoAleatorio || Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase
      .from('sessoes_captura')
      .insert([{ codigo_sessao: codigo, status: 'rascunho' }])
      .select()
      .single();

    if (!error && data) {
      startTransition(() => {
        router.push(`/auditoria/${data.id}`);
      });
    }
  }

  // Consulta inteligente chamando a RPC por Sessão
  async function verItensFaltantes(sessaoId: string, codigoSessao: string) {
    setSessaoSelecionada(codigoSessao);
    setCarregandoFaltas(true);
    setModalAberto(true);

    // Executa a função RPC passando o ID da sessão atual como parâmetro
    const { data, error } = await supabase
      .rpc('obter_faltas_deposito', { p_sessao_id: sessaoId });

    if (!error && data) {
      setItensFaltantes(data as ItemFalta[]);
    } else {
      setItensFaltantes([]);
    }
    setCarregandoFaltas(false);
  }

  // Exporta a planilha contextualmente baseada apenas na categoria da contagem atual
  async function exportarFaltasXLSX(sessaoId: string, codigoSessao: string) {
    // Executa a mesma RPC para buscar os dados consolidados da planilha
    const { data, error } = await supabase
      .rpc('obter_faltas_deposito', { p_sessao_id: sessaoId });

    if (error || !data || data.length === 0) {
      return alert('Nenhum item pendente de abastecimento encontrado para esta categoria.');
    }

    const dadosPlanilha = (data as ItemFalta[]).map((item) => ({
      'Código Sistema': item.codigo_sistema,
      'Código de Barras': item.codigo_barras,
      'Descrição': item.descricao,
      'Ação Recomendada': 'Puxar do Depósito para Gôndola'
    }));

    const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faltas Deposito");
    XLSX.writeFile(wb, `Faltas_Deposito_Sessao_${codigoSessao}.xlsx`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 p-4 max-w-md mx-auto flex flex-col gap-6 relative">
      <header className="flex flex-col gap-1 pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-emerald-400 flex items-center gap-2">
          <Layers className="w-6 h-6" /> Reposição Inteligente
        </h1>
        <p className="text-sm text-zinc-400">Controle e gestão de ruptura de gôndola</p>
      </header>

      <button
        onClick={iniciarNovaCaptura}
        className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all text-zinc-950 font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 text-lg"
      >
        <Play className="w-5 h-5 fill-current" /> Nova Captura
      </button>

      <section className="flex flex-col gap-3 flex-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Histórico de Auditorias</h2>
        
        {loading ? (
          <div className="text-center text-zinc-500 py-8">Carregando histórico...</div>
        ) : sessoes.length === 0 ? (
          <div className="text-center border-2 border-dashed border-zinc-800 rounded-xl p-8 text-zinc-500">
            Nenhuma auditoria finalizada encontrada.
          </div>
        ) : (
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
            {sessoes.map((sessao) => (
              <div key={sessao.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                      {sessao.codigo_sessao}
                    </span>
                    <span className="text-xs font-medium text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-900/50">
                      {sessao.itens_capturados[0]?.count || 0} na Gôndola
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(sessao.data_inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>

                {/* Ações Inteligentes no Chão de Loja */}
                <div className="grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-2">
                  <button
                    onClick={() => verItensFaltantes(sessao.id, sessao.codigo_sessao)}
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold py-2 px-3 text-xs rounded-lg border border-amber-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ver Faltas Depósito
                  </button>
                  <button
                    onClick={() => exportarFaltasXLSX(sessao.id, sessao.codigo_sessao)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold py-2 px-3 text-xs rounded-lg border border-zinc-700 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <Download className="w-3.5 h-3.5" /> Exportar .XLSX
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL DE CONSULTA RÁPIDA NO CELULAR */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <div>
                <h3 className="text-base font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Trazer do Depósito
                </h3>
                <p className="text-xs text-zinc-400">Sessão: {sessaoSelecionada} • Teve entrada mas não está na gôndola</p>
              </div>
              <button onClick={() => setModalAberto(false)} className="bg-zinc-800 text-zinc-400 p-1.5 rounded-lg border border-zinc-700">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-zinc-950/40">
              {carregandoFaltas ? (
                <div className="text-center py-12 text-sm text-zinc-500">Calculando rupturas no estoque...</div>
              ) : itensFaltantes.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm">
                  💯 Sucesso! Tudo que entrou nos últimos 30 dias está exposto na gôndola.
                </div>
              ) : (
                itensFaltantes.map((item, idx) => (
                  <div key={idx} className="bg-zinc-900 border border-zinc-800/60 rounded-xl p-3 flex flex-col gap-1 shadow-sm">
                    <span className="text-sm font-semibold text-zinc-200 line-clamp-1">{item.descricao}</span>
                    <div className="flex justify-between items-center text-xs text-zinc-500 font-mono">
                      <span>EAN: {item.codigo_barras}</span>
                      <span>Cod: {item.codigo_sistema}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <footer className="p-4 bg-zinc-900 border-t border-zinc-800">
              <button
                onClick={() => setModalAberto(false)}
                className="w-full bg-zinc-800 hover:bg-zinc-700 font-bold py-3 rounded-xl transition-colors text-zinc-200"
              >
                Voltar ao Painel
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}