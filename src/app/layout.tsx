import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible,
  Alex_Brush,
  Ma_Shan_Zheng,
  Noto_Sans_SC,
} from "next/font/google";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { t } from "@/lib/i18n";
import { requestLocale } from "@/lib/request-locale";
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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  const title = `${t(locale, "brand")} ${t(locale, "brandEn")}`;
  return {
    title,
    description: t(locale, "metaDescription"),
    applicationName: t(locale, "brand"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: t(locale, "brand"),
    },
    icons: {
      icon: [{ url: "/icons/icon-192.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/icon-192.svg" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#faf9f6",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await requestLocale();
  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      className={`${uiLatin.variable} ${uiZh.variable} ${handZh.variable} ${handEn.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthSessionProvider>
          {children}
          <ServiceWorkerRegister />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
