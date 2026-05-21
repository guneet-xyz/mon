import { useMDXComponents as getMDXComponents } from "@/mdx-components"

import type { Metadata } from "next"
import { generateStaticParamsFor, importPage } from "nextra/pages"

export const generateStaticParams = generateStaticParamsFor("mdxPath")

export async function generateMetadata(props: {
  params: Promise<{ mdxPath: Array<string> }>
}) {
  const params = await props.params
  const { metadata } = await importPage(params.mdxPath)
  return metadata as Metadata
}

const Wrapper = getMDXComponents().wrapper

export default async function Page(props: {
  params: Promise<{ mdxPath: Array<string> }>
}) {
  const params = await props.params
  const result = await importPage(params.mdxPath)
  const { default: MDXContent, toc, metadata, sourceCode } = result
  return (
    <Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
