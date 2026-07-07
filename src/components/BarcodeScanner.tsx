'use client';
import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function BarcodeScanner({ onScanSuccess }: BarcodeScannerProps) {
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const ultimoCodigoRef = useRef<string>('');
  const ultimaLeituraTimeRef = useRef<number>(0);

  useEffect(() => {
    const scannerId = "reader";
    const html5Qrcode = new Html5Qrcode(scannerId);
    html5QrcodeRef.current = html5Qrcode;

    const config = {
      fps: 20,
      qrbox: { width: 300, height: 150 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.CODE_128
      ]
    };

    html5Qrcode.start(
      { facingMode: "environment" },
      config,
      (text) => {
        const agora = Date.now();
        
        // Se for o mesmo código e fizer menos de 3 segundos (3000ms), ignora o frame
        if (text === ultimoCodigoRef.current && (agora - ultimaLeituraTimeRef.current) < 3000) {
          return;
        }

        // Atualiza as referências de controle de leitura
        ultimoCodigoRef.current = text;
        ultimaLeituraTimeRef.current = agora;

        // Dispara a função de sucesso
        onScanSuccess(text);
        if (navigator.vibrate) navigator.vibrate(100);
      },
      () => {
        // Ignora frames não lidos
      }
    ).catch((err) => {
      console.error("Erro ao iniciar a câmera automaticamente:", err);
    });

    return () => {
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        html5QrcodeRef.current.stop().catch((err) => console.error("Erro ao parar scanner", err));
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="w-full max-w-md mx-auto bg-black rounded-xl overflow-hidden shadow-lg border border-zinc-800">
      <div id="reader" className="w-full aspect-[4/3]"></div>
    </div>
  );
}