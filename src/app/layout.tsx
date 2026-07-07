import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruptura de Gôndola",
  description: "Sistema interno de abastecimento e prevenção de perdas",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Previne zoom acidental durante bipes rápidos
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased bg-zinc-950 selection:bg-emerald-500 selection:text-zinc-900">
        {children}
      </body>
    </html>
  );
}