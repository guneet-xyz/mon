import { TriangleAlert } from "lucide-react"

import { Logo } from "@/components/logo"

// Shown over the board while the config file on disk is invalid and the last
// good config is being served. The summary names a location, never contents.
export function ConfigErrorBanner({ summary }: { summary: string }) {
  return (
    <div
      role="status"
      data-testid="config-error-banner"
      className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-3"
    >
      <div className="flex max-w-xl items-start gap-2 rounded-lg border border-amber-400 bg-amber-50/95 px-3 py-2 text-sm text-amber-950 shadow-md dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-100">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
        />
        <p>
          <span className="font-semibold">
            Config error: showing the last good config.
          </span>{" "}
          <span className="text-amber-800 dark:text-amber-300">
            {summary}. See the website log for details.
          </span>
        </p>
      </div>
    </div>
  )
}

function Notice({
  title,
  children,
  testId,
}: {
  title: string
  children: React.ReactNode
  testId: string
}) {
  return (
    <main
      data-testid={testId}
      className="flex min-h-screen items-center justify-center p-6"
    >
      <div className="w-full max-w-lg rounded-xl border-2 border-emerald-700 bg-emerald-200/70 p-6 text-emerald-950 shadow-sm shadow-emerald-600 dark:border-emerald-950/20 dark:bg-emerald-900/70 dark:text-emerald-50 dark:shadow-emerald-700">
        <div className="mb-4 text-emerald-900 dark:text-emerald-600">
          <Logo />
        </div>
        <h1 className="mb-2 font-display text-xl font-semibold">{title}</h1>
        <div className="space-y-3 text-sm text-emerald-900 dark:text-emerald-200">
          {children}
        </div>
      </div>
    </main>
  )
}

const code =
  "rounded bg-emerald-50/70 px-1 py-0.5 font-mono text-[0.8rem] text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100"

const EXAMPLE_TILE = `[[tiles]]
type = "website"
key = "example"
name = "Example"
url = "https://example.com"`

export function EmptyBoard({ configPath }: { configPath: string }) {
  return (
    <Notice title="No tiles yet" testId="empty-board">
      <p>
        This board&apos;s config has no tiles. Add them to{" "}
        <code className={code}>{configPath}</code>, then reload this page.
      </p>
      <pre
        className={`${code} block overflow-x-auto p-3 leading-relaxed whitespace-pre`}
      >
        {EXAMPLE_TILE}
      </pre>
      <p>
        Monitors are checked by agents, so also declare an agent under{" "}
        <code className={code}>[agents.default]</code> and start it.
      </p>
    </Notice>
  )
}

// Shown instead of the board when no valid config has loaded since the
// website started.
export function ConfigUnavailable({ summary }: { summary: string }) {
  return (
    <Notice title="The board's config couldn't be loaded" testId="config-error">
      <p>
        <span className="font-semibold">{summary}.</span> Fix the config file,
        then reload this page.
      </p>
      <p>The website log lists each problem.</p>
    </Notice>
  )
}
