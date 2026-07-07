'use client';
import { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function BarcodeScanner({ onScanSuccess }: BarcodeScannerProps) {
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scannerId = "reader";
    
    // Inicializa a API direta, que pula a interface padrão e força o pedido de câmera
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

    // Dispara a inicialização usando a câmera traseira voltada para o ambiente (environment)
    html5Qrcode.start(
      { facingMode: "environment" },
      config,
      (text) => {
        onScanSuccess(text);
        if (navigator.vibrate) navigator.vibrate(100);
      },
      () => {
        // Ignora falhas de frames não lidos para manter a performance alta
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
      <div id="reader" className="w-full aspect-4/3"></div>
    </div>
  );
}