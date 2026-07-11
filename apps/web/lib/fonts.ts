import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

export const displayFont = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const uiFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
  display: "swap",
});

export const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
