"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type UserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  status: string;
  role: string;
  created_at: string;
};

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setError(null);
    const url = query
      ? `/api/users?q=${encodeURIComponent(query)}`
      : "/api/users";
    const res = await fetch(url);
    if (!res.ok) {
      setError("加载失败");
      return;
    }
    const data = (await res.json()) as { users: UserRow[] };
    setUsers(data.users);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load("");
    });
  }, [load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load(q.trim());
  }

  return (
    <div>
      <h1 className="admin-h1">用户</h1>
      <p className="admin-lead">搜索邮箱 / 手机 / ID</p>
      <form className="admin-toolbar" onSubmit={onSearch}>
        <input
          className="admin-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索…"
          style={{ minWidth: 220 }}
        />
        <button className="admin-btn" type="submit">
          搜索
        </button>
      </form>
      {error ? <p className="admin-muted">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>标识</th>
              <th>状态</th>
              <th>角色</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/users/${u.id}`}>
                    {u.email || u.phone || u.name || u.id.slice(0, 8)}
                  </Link>
                  <div className="admin-muted">{u.id}</div>
                </td>
                <td>
                  <span
                    className={`admin-badge${u.status === "banned" ? " is-danger" : ""}`}
                  >
                    {u.status}
                  </span>
                </td>
                <td>{u.role}</td>
                <td>{u.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
