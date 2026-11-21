"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import * as React from "react"

export function ThemeProvider({
  children,
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      // next-themes renders its theme script inside the React tree, and React
      // 19 warns about script tags it renders on the client ("Encountered a
      // script tag"). The server-rendered script runs before paint as before;
      // on the client it becomes inert JSON, which React doesn't flag.
      scriptProps={
        typeof window === "undefined" ? undefined : { type: "application/json" }
      }
    >
      {children}
    </NextThemesProvider>
  )
}
