import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible,
  Alex_Brush,
  Ma_Shan_Zheng,
  Noto_Sans_SC,
} from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const uiLatin = Atkinson_Hyperlegible({
  variable: "--font-ui-latin",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const uiZh = Noto_Sans_SC({
  variable: "--font-ui-zh",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const handZh = Ma_Shan_Zheng({
  variable: "--font-hand-zh",
  subsets: ["latin"],
  weight: "400",
});

/** Brush script — pairs with 马善政’s ink calligraphy */
const handEn = Alex_Brush({
  variable: "--font-hand-en",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "墨语 inkara",
  description: "用鼠标或手写笔书写，纸会喝掉墨迹并回答你。",
  applicationName: "墨语",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "墨语",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-192.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9f6",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${uiLatin.variable} ${uiZh.variable} ${handZh.variable} ${handEn.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
