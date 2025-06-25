import "@/styles/globals.css"

import { type Metadata } from "next"
import localFont from "next/font/local"

export const metadata: Metadata = {
  title: "mon",
  description:
    "mon is a minimalistic, open-source, and self-hosted monitoring solution.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
}

const CabinetGrotesk = localFont({
  src: "../fonts/CabinetGrotesk-Variable.woff2",
  variable: "--font-cabinet-grotesk",
})

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${CabinetGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  )
}
