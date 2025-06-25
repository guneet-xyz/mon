import { useMDXComponents as getMDXComponents } from "@/mdx-components"

import type { Metadata } from "next"
import type { $NextraMetadata, Heading } from "nextra"
import { generateStaticParamsFor, importPage } from "nextra/pages"

export const generateStaticParams = generateStaticParamsFor("mdxPath")

export async function generateMetadata(props: {
  params: Promise<{ mdxPath: Array<string> }>
}) {
  const params = await props.params
  const { metadata } = (await importPage(params.mdxPath)) as {
    metadata: Metadata
  }
  return metadata
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props: {
  params: Promise<{ mdxPath: Array<string> }>
}) {
  const params = await props.params
  const result = (await importPage(params.mdxPath)) as {
    default: React.ComponentType<{ params: { mdxPath: Array<string> } }>
    toc: Array<Heading>
    metadata: $NextraMetadata
  }
  const { default: MDXContent, toc, metadata } = result
  return (
    <Wrapper toc={toc} metadata={metadata}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
