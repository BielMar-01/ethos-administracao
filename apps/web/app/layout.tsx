import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "../components/providers/theme-provider";
import "./globals.css";

const nunito = localFont({
  src: "./fonts/nunito-sans.woff2",
  variable: "--font-nunito",
  weight: "400 700",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});
const playfair = localFont({
  src: "./fonts/playfair-display.woff2",
  variable: "--font-playfair",
  weight: "400 600",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: {
    default: "Ethos Administração",
    template: "%s | Ethos Administração",
  },
  description:
    "Plataforma de gestão de imóveis, locações, contratos e pagamentos.",
  applicationName: "Ethos Administração",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${nunito.variable} ${playfair.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
