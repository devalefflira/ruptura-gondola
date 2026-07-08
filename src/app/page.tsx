'use client';
import { useEffect, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Play, Download, Layers, Calendar, AlertTriangle, Eye, X, ClipboardList } from 'lucide-react';
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

interface ItemCapturado {
  produtos: {
    codigo_sistema: string;
    codigo_barras: string;
    descricao: string;
  } | null;
}

export default function Dashboard() {
  const router = useRouter();
  const [sessoes, setSessoes] = useState<SessaoCaptura[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Controle do Modal 1: Faltas do Depósito
  const [modalFaltasAberto, setModalFaltasAberto] = useState(false);
  const [itensFaltantes, setItensFaltantes] = useState<ItemFalta[]>([]);
  const [carregandoFaltas, setCarregandoFaltas] = useState(false);

  // Controle do Modal 2: Listagem de Itens Capturados
  const [modalItensAberto, setModalItensAberto] = useState(false);
  const [itensCapturados, setItensCapturados] = useState<ItemCapturado[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);

  const [sessaoSelecionadaId, setSessaoSelecionadaId] = useState('');
  const [sessaoSelecionadaCodigo, setSessaoSelecionadaCodigo] = useState('');

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

  // Abre Modal 1: Busca rupturas calculadas na RPC
  async function verItensFaltantes(sessaoId: string, codigoSessao: string) {
    setSessaoSelecionadaCodigo(codigoSessao);
    setCarregandoFaltas(true);
    setModalFaltasAberto(true);

    const { data, error } = await supabase
      .rpc('obter_faltas_deposito', { p_sessao_id: sessaoId });

    if (!error && data) {
      setItensFaltantes(data as ItemFalta[]);
    } else {
      setItensFaltantes([]);
    }
    setCarregandoFaltas(false);
  }

  // Abre Modal 2: Busca os itens bipados reais salvos no banco
  async function verItensCapturados(sessaoId: string, codigoSessao: string) {
    setSessaoSelecionadaId(sessaoId);
    setSessaoSelecionadaCodigo(codigoSessao);
    setCarregandoItens(true);
    setModalItensAberto(true);

    const { data, error } = await supabase
      .from('itens_capturados')
      .select('produtos(codigo_sistema, codigo_barras, descricao)')
      .eq('sessao_id', sessaoId);

    if (!error && data) {
      setItensCapturados(data as unknown as ItemCapturado[]);
    } else {
      setItensCapturados([]);
    }
    setCarregandoItens(false);
  }

  // Baixa o XLSX de dentro do modal de capturas
  async function exportarCapturasXLSX() {
    if (itensCapturados.length === 0) return alert('Sem dados para exportar');

    const dadosPlanilha = itensCapturados.map((item) => ({
      'Código Sistema': item.produtos?.codigo_sistema || '',
      'Código de Barras': item.produtos?.codigo_barras || '',
      'Descrição': item.produtos?.descricao || '',
      'Status': 'Confirmado na Gôndola'
    }));

    const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens Auditados");
    XLSX.writeFile(wb, `Auditoria_Gondola_${sessaoSelecionadaCodigo}.xlsx`);
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

                <div className="grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-2">
                  <button
                    onClick={() => verItensFaltantes(sessao.id, sessao.codigo_sessao)}
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-semibold py-2 px-3 text-xs rounded-lg border border-amber-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Ver Faltas Depósito
                  </button>
                  <button
                    onClick={() => verItensCapturados(sessao.id, sessao.codigo_sessao)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold py-2 px-3 text-xs rounded-lg border border-zinc-700 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> Listagem de Itens
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL 1: PRODUTOS FALTANTES NO ESTOQUE */}
      {modalFaltasAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <div>
                <h3 className="text-base font-bold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Trazer do Depósito
                </h3>
                <p className="text-xs text-zinc-400">Sessão: {sessaoSelecionadaCodigo}</p>
              </div>
              <button onClick={() => setModalFaltasAberto(false)} className="bg-zinc-800 text-zinc-400 p-1.5 rounded-lg border border-zinc-700">
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
          </div>
        </div>
      )}

      {/* MODAL 2: PRODUTOS CAPTURADOS NA GÔNDOLA */}
      {modalItensAberto && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <div>
                <h3 className="text-base font-bold text-emerald-400 flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4" /> Itens Capturados
                </h3>
                <p className="text-xs text-zinc-400">Sessão: {sessaoSelecionadaCodigo}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportarCapturasXLSX}
                  disabled={itensCapturados.length === 0}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-zinc-950 font-bold p-2 rounded-lg text-xs flex items-center gap-1 shadow transition-colors"
                  title="Exportar Planilha"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" /> .XLSX
                </button>
                <button onClick={() => setModalItensAberto(false)} className="bg-zinc-800 text-zinc-400 p-1.5 rounded-lg border border-zinc-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-zinc-950/40">
              {carregandoItens ? (
                <div className="text-center py-12 text-sm text-zinc-500">Buscando itens na base...</div>
              ) : itensCapturados.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm">
                  Nenhum produto foi bipado nesta sessão.
                </div>
              ) : (
                itensCapturados.map((item, idx) => (
                  <div key={idx} className="bg-zinc-900 border border-zinc-800/60 rounded-xl p-3 flex flex-col gap-1 shadow-sm">
                    <span className="text-sm font-semibold text-zinc-200 line-clamp-1">{item.produtos?.descricao}</span>
                    <div className="flex justify-between items-center text-xs text-zinc-500 font-mono">
                      <span>EAN: {item.produtos?.codigo_barras}</span>
                      <span>Cod: {item.produtos?.codigo_sistema}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}