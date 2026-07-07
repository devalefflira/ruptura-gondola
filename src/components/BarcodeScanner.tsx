'use client';
import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function BarcodeScanner({ onScanSuccess }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      'reader',
      {
        fps: 20,
        qrbox: { width: 300, height: 150 },
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
        if (navigator.vibrate) navigator.vibrate(100);
      },
      () => {
        // Callback de erro de leitura de frame vazia para não poluir o console ou estourar a regra do ESLint
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