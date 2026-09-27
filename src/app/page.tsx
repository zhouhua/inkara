"use client";

import dynamic from "next/dynamic";

/** Paper app is fully client-side (IndexedDB, canvas, pen) — SSR adds no value. */
const InkPage = dynamic(
  () => import("@/components/InkPage").then((m) => m.InkPage),
  {
    ssr: false,
    loading: () => <div className="paper-page" aria-busy="true" />,
  }
);

export default function Home() {
  return <InkPage />;
}
