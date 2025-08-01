import { DuotoneHoverIcon } from "@/components/duotone-hover-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import Link from "next/link"
import {
  PiBook,
  PiBookDuotone,
  PiBracketsAngle,
  PiBracketsAngleDuotone,
  PiPlay,
  PiPlayDuotone,
} from "react-icons/pi"

export default function HomePage() {
  return (
    <div className="relative flex min-h-[calc(100vh-180px)] flex-col items-center justify-center">
      <div className="absolute inset-0 bg-radial from-green-500 to-neutral-100 opacity-20 blur-3xl dark:from-green-500 dark:to-neutral-950"></div>
      <h1 className="z-10 pt-10 font-display text-4xl font-black md:pt-20 md:text-6xl lg:text-8xl">
        MON
      </h1>
      <h2 className="px-8 py-4 text-center text-xl font-bold md:text-2xl lg:px-16 lg:text-3xl">
        A monitor wall thats straight to the point.
      </h2>
      <div className="z-10 flex flex-wrap items-center justify-center gap-4 pt-4 pb-8 md:gap-8">
        <Link href="https://demo.mon.guneet.dev" target="_blank">
          <Button className="group cursor-pointer">
            <DuotoneHoverIcon
              className="mr-2 ml-1"
              regular={<PiPlay />}
              hover={<PiPlayDuotone />}
            />
            Live Demo
          </Button>
        </Link>
        <Link href="https://github.com/guneet-xyz/mon">
          <Button className="group cursor-pointer">
            <DuotoneHoverIcon
              className="mr-2 ml-1"
              regular={<PiBracketsAngle />}
              hover={<PiBracketsAngleDuotone />}
            />
            Demo Code
          </Button>
        </Link>
        <Link href="/docs">
          <Button className="group cursor-pointer">
            <DuotoneHoverIcon
              className="mr-2 ml-1"
              regular={<PiBook />}
              hover={<PiBookDuotone />}
            />
            Read The Friendly Manual
          </Button>
        </Link>
      </div>
      <div className="text-2xl font-bold">Why Mon?</div>
      <div className="px-8 text-center">{`First, it's a cool name. But if that doesn't convince you, here are some features.`}</div>
      <div className="z-10 flex flex-wrap gap-4 px-8 py-8 *:flex-1 md:gap-8 md:px-20">
        <Card className="min-w-50">
          <CardHeader>
            <CardTitle>One Config File</CardTitle>
          </CardHeader>
          <CardContent>
            Only one config file for everything. No need to navigate through
            clunky interfaces to set up your monitors.
          </CardContent>
        </Card>
        <Card className="min-w-50">
          <CardHeader>
            <CardTitle>Wide Support</CardTitle>
          </CardHeader>
          <CardContent>
            Supports all the protocols and services you might need to monitor.
          </CardContent>
        </Card>
        <Card className="min-w-50">
          <CardHeader>
            <CardTitle>And its beautiful</CardTitle>
          </CardHeader>
          <CardContent>
            {`A minimalistic, open-source, and self-hosted monitoring solution. And it's responsive too!`}
          </CardContent>
        </Card>
      </div>
      <div className="z-10 pb-8">
        <Link href="/docs">
          <Button
            className="cursor-pointer"
            variant="ghost"
          >{`Okay. I've heard enough. Let's Start!`}</Button>
        </Link>
      </div>
    </div>
  )
}
