import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import localFont from "next/font/local";
import { CommandMenu } from "@/components/command-menu";
import { MobileNav } from "@/components/mobile-nav";
import { Sidebar } from "@/components/sidebar";
import { CleanAnchors } from "@/components/clean-anchors";
import { SoundEffects } from "@/components/sound-effects";
import { ThemeProvider } from "@/components/theme-provider";
import { CursorTour } from "@/components/cursor-tour";
import { TypingTest } from "@/components/typing-test";
import { site } from "@/data/site";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap" });
// Vercel's Geist Pixel (Square), self-hosted
const geistPixel = localFont({ src: "./fonts/GeistPixel-Square.woff2", variable: "--font-geist-pixel", display: "swap" });

export const metadata: Metadata = {
  title: site.title,
  description: site.description,
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0f" },
  ],
};

// Resolve light / dark / system before first paint so there is no flash.
const themeScript = `(function(){try{var c=localStorage.getItem("theme")||"system";}catch(e){var c="system"}var d=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themeChoice=c;try{if(localStorage.getItem("sidebar")==="collapsed")r.dataset.sidebar="collapsed"}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${sourceSerif.variable} ${geistPixel.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Without JS nothing can reveal the entrance animation — show everything */}
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body suppressHydrationWarning>
        <a
          href="#main"
          className="fixed left-4 top-[-3rem] z-[100] rounded-md bg-ink px-3 py-2 font-mono text-xs font-medium text-bg focus:top-4"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <MobileNav />
          <Sidebar />
          <CommandMenu />
          <TypingTest />
          <CursorTour />
          <SoundEffects />
          <CleanAnchors />
          <main
            id="main"
            className="overflow-x-clip transition-[margin] duration-300 ease-expo lg:ml-56 collapsed:lg:ml-14"
          >
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
