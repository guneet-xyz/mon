# apps/docs

Next.js 15 + Nextra v4 MDX documentation site. Built with Pagefind for static search.

## STRUCTURE

```
src/
├── app/
│   ├── layout.tsx                       # root layout (Nextra theme)
│   ├── page.tsx                         # landing
│   └── docs/[[...mdxPath]]/page.tsx     # catch-all → MDX content router
├── content/                             # ALL MDX docs live here, mirrors URL
│   └── configuration/tiles/...
├── components/                          # local UI (own shadcn ui/, separate from website)
├── mdx-components.ts                    # Nextra MDX component overrides
└── styles/globals.css                   # Tailwind v4 entry
```

## CONVENTIONS

- **Content = filesystem.** Every `.mdx` under `src/content/` becomes a route via the `[[...mdxPath]]` catch-all. Adding a doc page = drop in a file; no router config.
- **`contentDirBasePath: "/docs"`** ([next.config.js](file:///Users/guneet/projects/mon/apps/docs/next.config.js#L8-L10)) — URLs are prefixed with `/docs`. Don't change without auditing links.
- **Pagefind index is built post-build** (`postbuild` script) into `public/_pagefind`. Search will be empty in `dev` — that's expected.
- **Next 15 here**, Next 14 in `apps/website`. They are intentionally divergent; eslint configs differ accordingly (`eslint-config-next@15.1.4`).
- **Own `components/ui/`** copied from shadcn — do NOT import from `apps/website`. The docs site is independently deployable.

## ANTI-PATTERNS

- **No `@/*` alias here.** Docs uses its own `tsconfig.json`; if you need internal imports, configure them per-app.
- **Do not import workspace `@mon/db`** — docs is a pure static site, must build without a Postgres connection or env secrets.
- **Do not put product code under `src/content/`** — Nextra will try to render it as MDX.

## NOTES

- **Standalone Docker output** with `outputFileTracingRoot` to monorepo root — same Docker contract as website.
- **README.md is the create-t3-app template** and unrelated. Ignore.
- **Nextra theme (`nextra-theme-docs`) drives the chrome** — sidebar/TOC come from `_meta.{ts,js,json}` files if added; currently none exist, so ordering is alphabetical.
