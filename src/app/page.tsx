'use client';
import { useEffect, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Play, Download, Layers, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

interface SessaoCaptura {
  id: string;
  codigo_sessao: string;
  data_inicio: string;
  status: string;
  itens_capturados: { count: number }[];
}

interface ItemExportacao {
  capturado_em: string;
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
    const { data: codigoAleatorio } = await supabase.rpc('gerar_codigo_sessao');
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

  async function exportarXLSX(sessaoId: string, codigoSessao: string) {
    const { data, error } = await supabase
      .from('itens_capturados')
      .select(`
        capturado_em,
        produtos(codigo_sistema, codigo_barras, descricao)
      `)
      .eq('sessao_id', sessaoId);

    if (error || !data) return alert('Erro ao buscar dados para exportação');

    const itens = data as unknown as ItemExportacao[];

    const dadosPlanilha = itens.map((item) => ({
      'Código Sistema': item.produtos?.codigo_sistema || '',
      'Código de Barras': item.produtos?.codigo_barras || '',
      'Descrição': item.produtos?.descricao || '',
      'Data/Hora Captura': new Date(item.capturado_em).toLocaleString('pt-BR')
    }));

    const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ruptura");
    XLSX.writeFile(wb, `Ruptura_Gondola_${codigoSessao}.xlsx`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 p-4 max-w-md mx-auto flex flex-col gap-6">
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
              <div key={sessao.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                      {sessao.codigo_sessao}
                    </span>
                    <span className="text-xs font-medium text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-900/50">
                      {sessao.itens_capturados[0]?.count || 0} itens
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 flex items-center gap-1 mt-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(sessao.data_inicio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
                <button
                  onClick={() => exportarXLSX(sessao.id, sessao.codigo_sessao)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 p-3 rounded-lg border border-zinc-700 active:scale-95 transition-transform"
                  title="Exportar Planilha"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}