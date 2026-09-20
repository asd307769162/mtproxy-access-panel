"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

type TokenRow = { id: number; token: string; status: string; plan_days: number; quota_bytes: number; proxy_port: number | null; created_at: number };

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [generated, setGenerated] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [generateFeedback, setGenerateFeedback] = useState("");
  const [secretFeedback, setSecretFeedback] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<"generate" | "secret" | "copy" | "">("");

  async function load() {
    const response = await fetch("/api/admin/tokens", { cache: "no-store" });
    if (!response.ok) return setLoggedIn(false);
    setTokens(await response.json() as TokenRow[]); setLoggedIn(true);
    const settings = await fetch("/api/admin/settings", { cache: "no-store" });
    if (settings.ok) setSecret(((await settings.json()) as { mtproxySecret: string }).mtproxySecret || "");
  }
  useEffect(() => {
    const start = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(start);
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) return setMessage("管理员密码错误");
    setPassword(""); setMessage(""); await load();
  }

  async function generate() {
    setBusyAction("generate"); setGenerateFeedback("");
    try {
      const response = await fetch("/api/admin/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count, days: 30, quotaGb: 200 }) });
      const data = await response.json() as { tokens?: string[]; error?: string };
      if (!response.ok) return setGenerateFeedback(`生成失败：${data.error || "请稍后重试"}`);
      const nextTokens = data.tokens || [];
      setGenerated(nextTokens); setGenerateFeedback(`生成成功：已创建 ${nextTokens.length} 个 Token`); await load();
    } catch {
      setGenerateFeedback("生成失败：网络连接异常，请重试");
    } finally {
      setBusyAction("");
    }
  }

  async function saveSecret() {
    setBusyAction("secret"); setSecretFeedback("");
    try {
      const response = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mtproxySecret: secret }) });
      const data = await response.json() as { error?: string };
      setSecretFeedback(response.ok ? "保存成功：新的公共 Secret 已生效" : `保存失败：${data.error || "请稍后重试"}`);
    } catch {
      setSecretFeedback("保存失败：网络连接异常，请重试");
    } finally {
      setBusyAction("");
    }
  }

  async function copyText(value: string) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("copy failed");
  }

  async function copyExport() {
    setBusyAction("copy"); setCopyFeedback("");
    try {
      await copyText(exportText);
      setCopyFeedback(`复制成功：共 ${generated.length} 个卡密`);
    } catch {
      setCopyFeedback("复制失败：请选中下方内容后手动复制");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteToken(row: TokenRow) {
    const warning = row.proxy_port
      ? `确定删除这个 Token 吗？删除前将立即关闭 V2 端口 ${row.proxy_port}，用户将无法继续使用。此操作不可恢复。`
      : "确定删除这个未启用的 Token 吗？此操作不可恢复。";
    if (!window.confirm(warning)) return;
    setDeletingId(row.id); setDeleteFeedback("");
    try {
      const response = await fetch("/api/admin/tokens", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id }) });
      const data = await response.json() as { error?: string; portClosed?: boolean; port?: number | null };
      if (!response.ok) return setDeleteFeedback(`删除失败：${data.error || "请稍后重试"}`);
      setTokens((current) => current.filter((item) => item.id !== row.id));
      setGenerated((current) => current.filter((token) => token !== row.token));
      setDeleteFeedback(data.portClosed ? `删除成功：端口 ${data.port} 已确认关闭` : "删除成功：未启用 Token 已移除");
    } catch {
      setDeleteFeedback("删除失败：网络连接异常，Token和端口均未改动");
    } finally {
      setDeletingId(null);
    }
  }

  if (!loggedIn) return <main className="grid min-h-screen place-items-center bg-[#07111d] px-5 text-white"><form onSubmit={login} className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0c1927] p-7"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-300"><ShieldCheck /></div><h1 className="text-2xl font-semibold">管理后台</h1><p className="mt-2 text-sm text-slate-500">请输入管理员密码</p><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-6 h-13 w-full rounded-xl border border-white/10 bg-[#07131f] px-4 outline-none focus:border-cyan-300/50" /><button className="mt-3 h-13 w-full rounded-xl bg-cyan-400 font-semibold text-cyan-950">登录</button>{message && <p className="mt-3 text-sm text-rose-300">{message}</p>}</form></main>;

  const exportText = generated.map((token) => `http://103.118.245.108:8790{NL}Token：${token}`).join("\n");
  return <main className="min-h-screen bg-[#07111d] px-5 py-8 text-slate-100 sm:px-8"><div className="mx-auto max-w-6xl"><header className="mb-7 flex items-center justify-between"><div><p className="text-sm text-cyan-300">MTProxy Access</p><h1 className="text-3xl font-semibold">Token与套餐管理</h1></div><button onClick={load} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-slate-400"><RefreshCw size={18} /></button></header>
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-white/10 bg-[#0c1927] p-6"><h2 className="text-lg font-semibold">批量生成卡密</h2><p className="mt-1 text-sm text-slate-500">默认套餐：激活后30天 / 200GB / 设备限制2</p><label className="mt-5 block text-sm text-slate-400">生成数量</label><input type="number" min="1" max="500" value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#07131f] px-4" /><button disabled={busyAction === "generate"} onClick={generate} className="mt-3 h-12 w-full rounded-xl bg-cyan-400 font-semibold text-cyan-950 disabled:cursor-wait disabled:opacity-60">{busyAction === "generate" ? "正在生成…" : "生成Token"}</button>{generateFeedback && <p role="status" className={`mt-3 rounded-xl border px-4 py-3 text-sm ${generateFeedback.startsWith("生成成功") ? "border-emerald-300/20 bg-emerald-300/8 text-emerald-200" : "border-rose-300/20 bg-rose-300/8 text-rose-200"}`}>{generateFeedback}</p>}</section>
      <section className="rounded-3xl border border-white/10 bg-[#0c1927] p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound size={19} className="text-cyan-300" />公共MTProxy Secret</h2><p className="mt-1 text-sm text-slate-500">所有自动创建端口共用，明文保存在本机数据库</p><input value={secret} onChange={(e) => setSecret(e.target.value)} spellCheck="false" className="mt-5 h-12 w-full rounded-xl border border-white/10 bg-[#07131f] px-4 font-mono" placeholder="32到64位十六进制字符" /><button disabled={busyAction === "secret"} onClick={saveSecret} className="mt-3 h-12 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/8 text-cyan-200 disabled:cursor-wait disabled:opacity-60">{busyAction === "secret" ? "正在保存…" : "保存Secret"}</button>{secretFeedback && <p role="status" className={`mt-3 rounded-xl border px-4 py-3 text-sm ${secretFeedback.startsWith("保存成功") ? "border-emerald-300/20 bg-emerald-300/8 text-emerald-200" : "border-rose-300/20 bg-rose-300/8 text-rose-200"}`}>{secretFeedback}</p>}</section></div>
    {generated.length > 0 && <section className="mt-5 rounded-3xl border border-white/10 bg-[#0c1927] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">本次生成结果</h2><button disabled={busyAction === "copy"} onClick={copyExport} className="flex items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 text-sm text-cyan-300 disabled:opacity-60"><Copy size={16} />{busyAction === "copy" ? "正在复制…" : "复制独角数卡格式"}</button></div>{copyFeedback && <p role="status" className={`mt-3 text-sm ${copyFeedback.startsWith("复制成功") ? "text-emerald-300" : "text-rose-300"}`}>{copyFeedback}</p>}<textarea readOnly value={exportText} rows={Math.min(12, generated.length * 2)} className="mt-4 w-full rounded-xl border border-white/10 bg-[#07131f] p-4 font-mono text-sm text-slate-300" /></section>}
    <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0c1927]"><div className="border-b border-white/8 px-6 py-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">最近Token</h2>{deleteFeedback && <p role="status" className={`text-sm ${deleteFeedback.startsWith("删除成功") ? "text-emerald-300" : "text-rose-300"}`}>{deleteFeedback}</p>}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-slate-500"><tr><th className="px-6 py-3">Token</th><th>状态</th><th>套餐</th><th>端口</th><th>创建时间</th><th className="pr-6 text-right">操作</th></tr></thead><tbody>{tokens.map((row) => <tr key={row.id} className="border-t border-white/6"><td className="px-6 py-3 font-mono text-xs text-slate-300">{row.token}</td><td>{row.status}</td><td>{row.plan_days}天 / {(row.quota_bytes / 1024 ** 3).toFixed(0)}GB</td><td>{row.proxy_port || "—"}</td><td>{new Date(row.created_at).toLocaleString("zh-CN")}</td><td className="pr-6 text-right"><button disabled={deletingId !== null} onClick={() => deleteToken(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/15 bg-rose-300/5 px-3 py-2 text-xs text-rose-300 hover:bg-rose-300/10 disabled:cursor-wait disabled:opacity-50"><Trash2 size={14} />{deletingId === row.id ? "正在删除…" : "删除"}</button></td></tr>)}</tbody></table></div></section>
  </div></main>;
}
