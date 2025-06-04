import "@/styles/globals.css"

import { Providers } from "./_components/providers"

import { GeistSans } from "geist/font/sans"
import { type Metadata } from "next"
import localFont from "next/font/local"

export const metadata: Metadata = {
  title: "mon",
  description: "straight to the point serivce monitoring",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
}

const clash = localFont({
  src: "../fonts/ClashDisplay-Variable.woff2",
  variable: "--font-clash-display",
})

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${clash.variable}`}>
      <body>
        <Providers>
          <div className="dark:bg-emerald-800/5">{children}</div>
        </Providers>
      </body>
    </html>
  )
}
