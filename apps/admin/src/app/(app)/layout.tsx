import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import "./admin.css";

const NAV = [
  { href: "/", label: "看板" },
  { href: "/users", label: "用户" },
  { href: "/orders", label: "订单" },
  { href: "/ledger", label: "账本" },
  { href: "/content", label: "内容" },
] as const;

const productUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default async function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/");
  }
  if (session.user.role !== "admin") {
    redirect("/login?error=forbidden");
  }

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="admin-brand">
          <span className="admin-brand-mark">inkara</span>
          <span className="admin-brand-sub">运营后台</span>
        </div>
        <nav className="admin-nav-list">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="admin-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-nav-foot">
          <p className="admin-nav-user">
            {session.user.email || session.user.phone || session.user.id}
          </p>
          <a href={productUrl} className="admin-nav-link">
            打开产品站
          </a>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
