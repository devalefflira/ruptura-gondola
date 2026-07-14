'use client';
import { useEffect, useState, use, useCallback, startTransition, useRef} from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BarcodeScanner from '../../../components/BarcodeScanner';
import { Check, X, Barcode, ClipboardList, Loader2, Camera } from 'lucide-react';

interface Produto {
  codigo_sistema: string;
  codigo_barras: string;
  descricao: string;
}

interface ItemCapturado {
  id: number;
  produtos: Produto | null;
}

interface Sessao {
  id: string;
  codigo_sessao: string;
  data_inicio: string;
  status: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AuditoriaPage({ params }: PageProps) {
  const { id: sessaoId } = use(params);
  const router = useRouter();
  
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [itens, setItens] = useState<ItemCapturado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState({ tipo: '', texto: '' });

  const buscarDadosSessao = useCallback(async () => {
    const { data: sessaoData } = await supabase
      .from('sessoes_captura')
      .select('*')
      .eq('id', sessaoId)
      .single();

    if (sessaoData) {
      setSessao(sessaoData as Sessao);
      
      const { data: itensData } = await supabase
        .from('itens_capturados')
        .select('id, produtos(codigo_sistema, codigo_barras, descricao)')
        .eq('sessao_id', sessaoId)
        .order('id', { ascending: false });
      
      if (itensData) {
        setItens(itensData as unknown as ItemCapturado[]);
      }
    }
  }, [sessaoId]);

  useEffect(() => {
    buscarDadosSessao();
  }, [buscarDadosSessao]);

  // Adicione esta referência logo abaixo dos outros useState no topo do componente:
  const escaneandoRef = useRef(false);

  // Substitua a função handleBarcodeScan por esta:
  async function handleBarcodeScan(barcode: string) {
    // Se já estiver processando um bipe, ignora frames concorrentes imediatamente
    if (buscando || escaneandoRef.current) return;
    
    escaneandoRef.current = true;
    setCameraAberta(false); // Desmonta o componente da câmera primeiro

    // Validação de duplicidade na mesma sessão
    const codigoJaExiste = itens.some(item => item.produtos?.codigo_barras === barcode);
    if (codigoJaExiste) {
      setMsgFeedback({ tipo: 'erro', texto: `Código ${barcode} já capturado nesta sessão!` });
      escaneandoRef.current = false;
      return;
    }

    setBuscando(true);
    setMsgFeedback({ tipo: '', texto: '' });

    const { data: produto, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('codigo_barras', barcode)
      .maybeSingle();

    if (error || !produto) {
      setMsgFeedback({ tipo: 'erro', texto: `Produto não cadastrado: ${barcode}` });
      setBuscando(false);
      escaneandoRef.current = false;
      return;
    }

    // Vincula o item ao Supabase de forma isolada
    const { error: insertError } = await supabase
      .from('itens_capturados')
      .insert([{ sessao_id: sessaoId, produto_id: produto.id }]);

    if (!insertError) {
      setMsgFeedback({ tipo: 'sucesso', texto: `${produto.descricao} adicionado!` });
      
      const novoItem: ItemCapturado = {
        id: Date.now(),
        produtos: {
          codigo_sistema: produto.codigo_sistema,
          codigo_barras: produto.codigo_barras,
          descricao: produto.descricao
        }
      };
      
      setItens((prev) => [novoItem, ...prev]);
    } else {
      setMsgFeedback({ tipo: 'erro', texto: 'Erro ao salvar o item no banco de dados.' });
    }

    setBuscando(false);
    // Libera a trava síncrona após a conclusão do ciclo de renderização
    setTimeout(() => {
      escaneandoRef.current = false;
    }, 300);
  }

  async function finalizarSessao() {
    if (itens.length === 0) {
      alert("Capture ao menos um produto antes de salvar.");
      return;
    }
    await supabase.from('sessoes_captura').update({ status: 'salvo' }).eq('id', sessaoId);
    startTransition(() => {
      router.replace('/');
    });
  }

  async function cancelarSessao() {
    if (confirm("Deseja realmente cancelar? Todas as capturas desta sessão serão perdidas.")) {
      await supabase.from('sessoes_captura').delete().eq('id', sessaoId);
      startTransition(() => {
        router.replace('/');
      });
    }
  }

  if (!sessao) return <div className="text-center p-8 text-zinc-400">Carregando Sessão...</div>;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 p-4 max-w-md mx-auto flex flex-col gap-4">
      <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 rounded-xl p-3 shadow-inner">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Código Interno</p>
          <p className="font-mono text-xl font-bold text-emerald-400">{sessao.codigo_sessao}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Início</p>
          <p className="text-sm font-medium text-zinc-300">
            {new Date(sessao.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {cameraAberta ? (
        <div className="relative">
          <BarcodeScanner onScanSuccess={handleBarcodeScan} />
          <button 
            onClick={() => setCameraAberta(false)}
            className="absolute top-3 right-3 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md active:scale-95 transition-transform"
          >
            Fechar Câmera
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setMsgFeedback({ tipo: '', texto: '' });
            setCameraAberta(true);
          }}
          className="w-full aspect-4/3 max-w-md mx-auto bg-zinc-900/40 hover:bg-zinc-900 border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-xl flex flex-col items-center justify-center gap-3 text-zinc-400 hover:text-zinc-300 transition-colors active:scale-[0.99]"
        >
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-full shadow-md text-emerald-400">
            <Camera className="w-8 h-8" />
          </div>
          <span className="font-semibold text-sm tracking-wide">Escanear Produto</span>
        </button>
      )}

      {buscando && (
        <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm py-1 bg-zinc-900/50 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> Consultando banco...
        </div>
      )}

      {msgFeedback.texto && (
        <div className={`p-3 rounded-lg text-center font-medium text-sm transition-all shadow ${
          msgFeedback.tipo === 'sucesso' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50' : 'bg-red-950/60 text-red-400 border border-red-900/50'
        }`}>
          {msgFeedback.texto}
        </div>
      )}

      <section className="flex-1 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            <ClipboardList className="w-3.5 h-3.5" /> Itens na Gôndola
          </span>
          <span className="text-xs font-mono text-zinc-400">{itens.length} capturados</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[35vh]">
          {itens.length === 0 ? (
            <div className="text-center text-zinc-600 text-sm py-8">Clique no botão acima para iniciar a leitura.</div>
          ) : (
            itens.map((item) => (
              <div key={item.id} className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-3 flex flex-col gap-1 shadow-sm">
                <span className="text-sm font-semibold text-zinc-200 line-clamp-1">{item.produtos?.descricao}</span>
                <div className="flex justify-between items-center text-xs text-zinc-500 font-mono">
                  <span className="flex items-center gap-0.5"><Barcode className="w-3 h-3" /> {item.produtos?.codigo_barras}</span>
                  <span>Cod: {item.produtos?.codigo_sistema}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <footer className="grid grid-cols-2 gap-3 pt-2 bg-zinc-950 border-t border-zinc-900">
        <button
          onClick={cancelarSessao}
          className="bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-800 border border-zinc-800 font-semibold py-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors text-zinc-300"
        >
          <X className="w-4 h-4" /> Cancelar
        </button>
        <button
          onClick={finalizarSessao}
          className="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-600 font-bold py-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors text-zinc-950 shadow-md shadow-emerald-950/20"
        >
          <Check className="w-4 h-4 stroke-3" /> Salvar
        </button>
      </footer>
    </main>
  );
}