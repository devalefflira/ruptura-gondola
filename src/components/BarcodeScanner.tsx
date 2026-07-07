'use client';
import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function BarcodeScanner({ onScanSuccess }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Configuração otimizada para códigos de barras comerciais de supermercado (EAN-13, EAN-8, UPC)
    scannerRef.current = new Html5QrcodeScanner(
      'reader',
      {
        fps: 20, // FPS alto para captura rápida em movimento na gôndola
        qrbox: { width: 300, height: 150 }, // Formato retangular ideal para barras
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.CODE_128
        ],
        rememberLastUsedCamera: true,
      },
      /* verbose= */ false
    );

    scannerRef.current.render(
      (text) => {
        onScanSuccess(text);
        // Feedback tátil simples (vibração) se o dispositivo suportar
        if (navigator.vibrate) navigator.vibrate(100);
      },
      (error) => {
        // Ignora erros de frame não lidos para não travar a aplicação
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((err) => console.error('Erro ao limpar scanner', err));
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="w-full max-w-md mx-auto bg-black rounded-xl overflow-hidden shadow-lg border border-zinc-800">
      <div id="reader" className="w-full"></div>
    </div>
  );
}