import type { Metadata } from "next";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "inkara 运营后台",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
