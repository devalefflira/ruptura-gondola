'use client';
import { useEffect, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Play, Download, Layers, Calendar, AlertTriangle, X, ClipboardList, ThumbsUp, ThumbsDown, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable, { UserOptions } from 'jspdf-autotable'; // <-- Importa a função autoTable diretamente

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
  status_conferencia: 'encontrado' | 'nao_encontrado' | null;
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

  // Modais
  const [modalFaltasAberto, setModalFaltasAberto] = useState(false);
  const [itensFaltantes, setItensFaltantes] = useState<ItemFalta[]>([]);
  const [carregandoFaltas, setCarregandoFaltas] = useState(false);

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

  async function verItensFaltantes(sessaoId: string, codigoSessao: string) {
    setSessaoSelecionadaId(sessaoId);
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

  // Grava a ação de ThumbsUp ou ThumbsDown no Supabase
  async function handleVotoDeposito(barcode: string, statusVoto: 'encontrado' | 'nao_encontrado') {
    // Atualiza o estado local imediatamente (UI reativa rápida)
    setItensFaltantes(prev =>
      prev.map(item => item.codigo_barras === barcode ? { ...item, status_conferencia: statusVoto } : item)
    );

    // Salva no banco de dados com UPSERT (insere ou atualiza se já existir)
    await supabase
      .from('conferencia_deposito')
      .upsert({
        sessao_id: sessaoSelecionadaId,
        codigo_barras: barcode,
        status_conferencia: statusVoto
      }, { onConflict: 'sessao_id,codigo_barras' });
  }

  async function exportarRelatorioConferenciaPDF() {
    if (itensFaltantes.length === 0) return alert('Sem dados para exportar');

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // 1. Configuração do Cabeçalho do Relatório
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(16, 185, 129); // Cor Esmeralda
    doc.text("REPOSIÇÃO INTELIGENTE", 14, 20);

    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139); // Cinza
    doc.setFont("helvetica", "normal");
    doc.text(`Relatório de Conferência de Depósito — Sessão: ${sessaoSelecionadaCodigo}`, 14, 26);
    doc.text(`Data de Emissão: ${new Date().toLocaleString('pt-BR')}`, 14, 31);
    
    // Linha divisória
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 35, 196, 35);

    // 2. Formatação das linhas e colunas para a tabela do PDF
    const colunas = ["Código", "Código de Barras (EAN)", "Descrição do Produto", "Situação no Depósito"];
    
    const linhas = itensFaltantes.map((item) => {
      let situacao = "Pendente";
      if (item.status_conferencia === 'encontrado') situacao = "Encontrado e Abastecido";
      if (item.status_conferencia === 'nao_encontrado') situacao = "Ruptura Real (Falta)";
      
      return [
        item.codigo_sistema,
        item.codigo_barras,
        item.descricao,
        situacao
      ];
    });

    // 3. Montagem das opções de estilo tipadas com segurança para o compilador
    const opcoesTabela: UserOptions = {
      startY: 40,
      head: [colunas],
      body: linhas,
      theme: 'striped',
      headStyles: {
        fillColor: [31, 41, 55],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 3) {
          const texto = data.cell.raw;
          if (texto === "Encontrado e Abastecido") {
            data.cell.styles.textColor = [16, 124, 65]; // Verde
            data.cell.styles.fontStyle = 'bold';
          } else if (texto === "Ruptura Real (Falta)") {
            data.cell.styles.textColor = [220, 38, 38]; // Vermelho
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 35 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 45 }
      }
    };

    // 3. Executa o plugin estendendo a interface de forma segura para o compilador do TypeScript
    autoTable(doc, opcoesTabela);

    doc.save(`Relatorio_Deposito_Sessao_${sessaoSelecionadaCodigo}.pdf`);
  }

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

      {/* MODAL 1: PRODUTOS FALTANTES NO ESTOQUE (COM CAPTURA DE VOTOS) */}
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
                  <div key={idx} className="bg-zinc-900 border border-zinc-800/60 rounded-xl p-3 flex items-center justify-between shadow-sm gap-2">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className="text-sm font-semibold text-zinc-200 line-clamp-2">{item.descricao}</span>
                      <span className="text-xs text-zinc-500 font-mono">EAN: {item.codigo_barras}</span>
                    </div>

                    {/* BOTÕES DE CONFERÊNCIA FÍSICA NO DEPÓSITO */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleVotoDeposito(item.codigo_barras, 'encontrado')}
                        className={`p-2 rounded-lg border transition-all active:scale-90 ${item.status_conferencia === 'encontrado'
                            ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-md shadow-emerald-950/40'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                          }`}
                        title="Encontrei e peguei"
                      >
                        <ThumbsUp className="w-4 h-4 stroke-[2.5]" />
                      </button>
                      <button
                        onClick={() => handleVotoDeposito(item.codigo_barras, 'nao_encontrado')}
                        className={`p-2 rounded-lg border transition-all active:scale-90 ${item.status_conferencia === 'nao_encontrado'
                            ? 'bg-red-500 text-zinc-50 border-red-400 shadow-md shadow-red-950/40'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                          }`}
                        title="Não encontrei no depósito"
                      >
                        <ThumbsDown className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Altere o botão no rodapé do modal de faltas para ficar assim: */}
            {itensFaltantes.length > 0 && (
              <footer className="p-4 bg-zinc-900 border-t border-zinc-800">
                <button
                  onClick={exportarRelatorioConferenciaPDF} // <--- Chamada do PDF atualizada aqui
                  className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold py-3 rounded-xl transition-all active:scale-[0.99] flex items-center justify-center gap-2 text-sm shadow-md shadow-amber-950/20"
                >
                  <FileSpreadsheet className="w-4 h-4 stroke-[2.5]" /> Exportar Relatório em PDF
                </button>
              </footer>
            )}
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