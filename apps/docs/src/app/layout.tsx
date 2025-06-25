import "@/styles/globals.css"

import { type Metadata } from "next"
import localFont from "next/font/local"
import Link from "next/link"
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import "nextra-theme-docs/style.css"
import { Head } from "nextra/components"
import { getPageMap } from "nextra/page-map"

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

const Satoshi = localFont({
  src: [
    {
      path: "../fonts/Satoshi-Variable.woff2",
      style: "normal",
    },
    {
      path: "../fonts/Satoshi-VariableItalic.woff2",
      style: "italic",
    },
  ],
  variable: "--font-satoshi",
})

const navbar = <Navbar logo={<div className="font-bold">MON</div>} />
const footer = (
  <Footer>
    <p>
      <span>Made by </span>
      <Link
        href="https://github.com/guneet-xyz"
        className="underline underline-offset-4"
      >
        Guneet
      </Link>
      <span>. Source code on </span>
      <Link
        href="https://github.com/guneet-xyx/mon"
        className="underline underline-offset-4"
      >
        GitHub
      </Link>
      <span>.</span>
    </p>
  </Footer>
)

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${CabinetGrotesk.variable} ${Satoshi.variable}`}
    >
      <Head></Head>
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap("/docs")}
          docsRepositoryBase="https://github.com/shuding/nextra/tree/main/docs"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
