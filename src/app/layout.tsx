import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Controle Financeiro",
  description:
    "Organização financeira pessoal — orçamentos, cartões, reembolsos e projeção de sobra mensal.",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2a78d6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js')); }",
          }}
        />
      </body>
    </html>
  );
}
