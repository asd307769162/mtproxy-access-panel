"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Pencil, Plus, RefreshCw, Server, ShieldCheck, Trash2, Wifi } from "lucide-react";

type TokenRow = { id: number; token: string; status: string; plan_days: number; plan_months: number; quota_bytes: number; proxy_port: number | null; server_alias: string | null; created_at: number };
type PlanCode = "monthly" | "halfYear" | "yearly";
const planOptions: { code: PlanCode; label: string; detail: string }[] = [
  { code: "monthly", label: "月付", detail: "1个自然月 / 200GB" },
  { code: "halfYear", label: "半年付", detail: "6个自然月 / 1000GB" },
  { code: "yearly", label: "年付", detail: "12个自然月 / 2000GB" },
];
type ServerRow = { id: number; alias: string; baseUrl: string; username: string; hasPassword: boolean; publicIp: string; targetAddress: string; targetPort: number; mtproxySecret: string; enabled: boolean };
type ServerForm = Omit<ServerRow, "id" | "hasPassword"> & { id?: number; password: string };
const emptyServer: ServerForm = { alias: "", baseUrl: "", username: "", password: "", publicIp: "", targetAddress: "", targetPort: 443, mtproxySecret: "", enabled: true };

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [generated, setGenerated] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [plan, setPlan] = useState<PlanCode>("monthly");
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [serverForm, setServerForm] = useState<ServerForm>(emptyServer);
  const [showServerForm, setShowServerForm] = useState(false);
  const [message, setMessage] = useState("");
  const [generateFeedback, setGenerateFeedback] = useState("");
  const [serverFeedback, setServerFeedback] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [busyAction, setBusyAction] = useState<"generate" | "server" | "copy" | "">("");

  async function load() {
    const response = await fetch("/api/admin/tokens", { cache: "no-store" });
    if (!response.ok) return setLoggedIn(false);
    const rows = await response.json() as TokenRow[];
    setTokens(rows); setSelectedIds((current) => current.filter((id) => rows.some((row) => row.id === id))); setLoggedIn(true);
    const serverResponse = await fetch("/api/admin/servers", { cache: "no-store" });
    if (serverResponse.ok) setServers(await serverResponse.json() as ServerRow[]);
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
      const response = await fetch("/api/admin/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count, plan }) });
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

  function editServer(server: ServerRow) {
    setServerForm({ id: server.id, alias: server.alias, baseUrl: server.baseUrl, username: server.username, password: "", publicIp: server.publicIp, targetAddress: server.targetAddress, targetPort: server.targetPort, mtproxySecret: server.mtproxySecret, enabled: server.enabled });
    setShowServerForm(true); setServerFeedback("");
  }

  async function saveServer() {
    setBusyAction("server"); setServerFeedback("");
    try {
      const response = await fetch("/api/admin/servers", { method: serverForm.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(serverForm) });
      const data = await response.json() as { error?: string };
      if (!response.ok) return setServerFeedback(`保存失败：${data.error || "请稍后重试"}`);
      setServerFeedback(`保存成功：${serverForm.alias} 的配置和独立 Secret 已生效`);
      setShowServerForm(false); setServerForm(emptyServer); await load();
    } catch {
      setServerFeedback("保存失败：网络连接异常，请重试");
    } finally {
      setBusyAction("");
    }
  }

  async function testServer(server: ServerRow) {
    setServerFeedback(`正在测试 ${server.alias}…`);
    const response = await fetch("/api/admin/servers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: server.id }) });
    const data = await response.json() as { error?: string; inboundCount?: number };
    setServerFeedback(response.ok ? `连接成功：${server.alias} 当前有 ${data.inboundCount} 个入站` : `连接失败：${data.error || "请检查配置"}`);
  }

  async function deleteServer(server: ServerRow) {
    if (!window.confirm(`确定删除服务器 ${server.alias} 吗？有关联Token时系统会阻止删除。`)) return;
    const response = await fetch("/api/admin/servers", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: server.id }) });
    const data = await response.json() as { error?: string };
    setServerFeedback(response.ok ? `删除成功：${server.alias}` : `删除失败：${data.error || "请稍后重试"}`);
    if (response.ok) await load();
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
      ? `确定删除这个 Token 吗？删除前将立即关闭 ${row.server_alias || "对应X-UI"} 端口 ${row.proxy_port}，用户将无法继续使用。此操作不可恢复。`
      : "确定删除这个未启用的 Token 吗？此操作不可恢复。";
    if (!window.confirm(warning)) return;
    setDeletingId(row.id); setDeleteFeedback("");
    try {
      const response = await fetch("/api/admin/tokens", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id }) });
      const data = await response.json() as { error?: string; portClosed?: boolean; port?: number | null };
      if (!response.ok) return setDeleteFeedback(`删除失败：${data.error || "请稍后重试"}`);
      setTokens((current) => current.filter((item) => item.id !== row.id));
      setSelectedIds((current) => current.filter((id) => id !== row.id));
      setGenerated((current) => current.filter((token) => token !== row.token));
      setDeleteFeedback(data.portClosed ? `删除成功：端口 ${data.port} 已确认关闭` : "删除成功：未启用 Token 已移除");
    } catch {
      setDeleteFeedback("删除失败：网络连接异常，Token和端口均未改动");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function bulkDelete() {
    const selected = tokens.filter((row) => selectedIds.includes(row.id));
    if (selected.length === 0) return;
    const activeCount = selected.filter((row) => row.proxy_port).length;
    const warning = activeCount > 0
      ? `确定删除选中的 ${selected.length} 个 Token 吗？其中 ${activeCount} 个已启用端口会先在所属X-UI上关闭。此操作不可恢复。`
      : `确定删除选中的 ${selected.length} 个未启用 Token 吗？此操作不可恢复。`;
    if (!window.confirm(warning)) return;
    setBulkDeleting(true); setDeleteFeedback("");
    try {
      const response = await fetch("/api/admin/tokens", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: selected.map((row) => row.id) }) });
      const data = await response.json() as { error?: string; deletedIds?: number[]; failures?: { id: number; error?: string }[] };
      if (!response.ok) return setDeleteFeedback(`批量删除失败：${data.error || "请稍后重试"}`);
      const deletedIds = data.deletedIds || [];
      const deletedTokens = new Set(selected.filter((row) => deletedIds.includes(row.id)).map((row) => row.token));
      setTokens((current) => current.filter((row) => !deletedIds.includes(row.id)));
      setGenerated((current) => current.filter((token) => !deletedTokens.has(token)));
      setSelectedIds((current) => current.filter((id) => !deletedIds.includes(id)));
      const failed = data.failures?.length || 0;
      setDeleteFeedback(failed === 0 ? `批量删除成功：已删除 ${deletedIds.length} 个 Token` : `批量删除完成：成功 ${deletedIds.length} 个，失败 ${failed} 个；失败项已保留`);
    } catch {
      setDeleteFeedback("批量删除失败：网络连接异常，未确认删除结果，请刷新后查看");
    } finally {
      setBulkDeleting(false);
    }
  }

  if (!loggedIn) return <main className="grid min-h-screen place-items-center bg-[#07111d] px-5 text-white"><form onSubmit={login} className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0c1927] p-7"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-300"><ShieldCheck /></div><h1 className="text-2xl font-semibold">管理后台</h1><p className="mt-2 text-sm text-slate-500">请输入管理员密码</p><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-6 h-13 w-full rounded-xl border border-white/10 bg-[#07131f] px-4 outline-none focus:border-cyan-300/50" /><button className="mt-3 h-13 w-full rounded-xl bg-cyan-400 font-semibold text-cyan-950">登录</button>{message && <p className="mt-3 text-sm text-rose-300">{message}</p>}</form></main>;

  const exportText = generated.map((token) => `http://103.118.245.108:8790{NL}Token：${token}`).join("\n");
  return <main className="min-h-screen bg-[#07111d] px-5 py-8 text-slate-100 sm:px-8"><div className="mx-auto max-w-6xl"><header className="mb-7 flex items-center justify-between"><div><p className="text-sm text-cyan-300">MTProxy Access</p><h1 className="text-3xl font-semibold">Token与套餐管理</h1></div><button onClick={load} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-slate-400"><RefreshCw size={18} /></button></header>
    <section className="rounded-3xl border border-white/10 bg-[#0c1927] p-6"><h2 className="text-lg font-semibold">批量生成卡密</h2><p className="mt-1 text-sm text-slate-500">有效期按自然月计算，设备限制统一为2；激活时在已启用服务器之间轮询分配</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{planOptions.map((option) => <button key={option.code} onClick={() => setPlan(option.code)} className={`rounded-xl border p-4 text-left transition ${plan === option.code ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/8 bg-[#07131f] hover:border-white/15"}`}><strong className={plan === option.code ? "text-cyan-200" : "text-slate-200"}>{option.label}</strong><span className="mt-1 block text-xs text-slate-500">{option.detail}</span></button>)}</div><label className="mt-5 block text-sm text-slate-400">生成数量</label><div className="mt-2 flex gap-3"><input type="number" min="1" max="500" value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#07131f] px-4" /><button disabled={busyAction === "generate"} onClick={generate} className="h-12 rounded-xl bg-cyan-400 px-8 font-semibold text-cyan-950 disabled:cursor-wait disabled:opacity-60">{busyAction === "generate" ? "正在生成…" : "生成Token"}</button></div>{generateFeedback && <p role="status" className={`mt-3 rounded-xl border px-4 py-3 text-sm ${generateFeedback.startsWith("生成成功") ? "border-emerald-300/20 bg-emerald-300/8 text-emerald-200" : "border-rose-300/20 bg-rose-300/8 text-rose-200"}`}>{generateFeedback}</p>}</section>
    <section className="mt-5 rounded-3xl border border-white/10 bg-[#0c1927] p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Server size={19} className="text-cyan-300" />X-UI服务器与独立Secret</h2><p className="mt-1 text-sm text-slate-500">可随时新增服务器；每台独立登录、独立Secret，启用的服务器自动轮询分配</p></div><button onClick={() => { setServerForm(emptyServer); setShowServerForm(true); setServerFeedback(""); }} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 font-semibold text-cyan-950"><Plus size={17} />新增服务器</button></div>
      {serverFeedback && <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm ${serverFeedback.includes("成功") ? "border-emerald-300/20 bg-emerald-300/8 text-emerald-200" : serverFeedback.startsWith("正在") ? "border-cyan-300/20 bg-cyan-300/8 text-cyan-200" : "border-rose-300/20 bg-rose-300/8 text-rose-200"}`}>{serverFeedback}</p>}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{servers.map((server) => <article key={server.id} className="rounded-2xl border border-white/8 bg-[#07131f] p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${server.enabled ? "bg-emerald-400" : "bg-slate-600"}`} /><strong>{server.alias}</strong><span className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-slate-400">{server.enabled ? "参与分配" : "已停用"}</span></div><p className="mt-2 text-sm text-slate-400">{server.publicIp} · {server.baseUrl}</p><p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-cyan-300"><KeyRound size={13} />{server.mtproxySecret}</p><p className="mt-1 text-xs text-slate-500">目标 {server.targetAddress}:{server.targetPort}</p></div><div className="flex gap-1"><button title="测试连接" onClick={() => testServer(server)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-cyan-300"><Wifi size={16} /></button><button title="编辑" onClick={() => editServer(server)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-cyan-300"><Pencil size={16} /></button><button title="删除" onClick={() => deleteServer(server)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-rose-300"><Trash2 size={16} /></button></div></div></article>)}</div>
      {servers.length === 0 && <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-200">尚未配置X-UI服务器，Token可以生成，但用户无法激活。</p>}
      {showServerForm && <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-[#07131f] p-5"><h3 className="font-semibold">{serverForm.id ? `编辑 ${serverForm.alias}` : "新增X-UI服务器"}</h3><div className="mt-4 grid gap-3 md:grid-cols-2"><Field label="别名（与控制台服务器别名一致）" value={serverForm.alias} onChange={(value) => setServerForm({ ...serverForm, alias: value })} placeholder="例如 wf3" /><Field label="X-UI面板地址" value={serverForm.baseUrl} onChange={(value) => setServerForm({ ...serverForm, baseUrl: value })} placeholder="http://服务器IP:面板端口" /><Field label="X-UI用户名" value={serverForm.username} onChange={(value) => setServerForm({ ...serverForm, username: value })} /><Field label={`X-UI密码${serverForm.id ? "（留空保持不变）" : ""}`} type="password" value={serverForm.password} onChange={(value) => setServerForm({ ...serverForm, password: value })} /><Field label="代理公网IP" value={serverForm.publicIp} onChange={(value) => setServerForm({ ...serverForm, publicIp: value })} /><Field label="转发目标地址" value={serverForm.targetAddress} onChange={(value) => setServerForm({ ...serverForm, targetAddress: value })} /><Field label="转发目标端口" type="number" value={String(serverForm.targetPort)} onChange={(value) => setServerForm({ ...serverForm, targetPort: Number(value) })} /><Field label="完整MTProxy Secret" value={serverForm.mtproxySecret} onChange={(value) => setServerForm({ ...serverForm, mtproxySecret: value })} placeholder="粘贴客户端实际使用的完整Secret（十六进制）" mono /><label className="flex items-center gap-3 rounded-xl border border-white/8 px-4 py-3 text-sm text-slate-300"><input type="checkbox" checked={serverForm.enabled} onChange={(e) => setServerForm({ ...serverForm, enabled: e.target.checked })} />参与新Token轮询分配</label></div><p className="mt-3 text-xs text-slate-500">支持基础Secret及Fake TLS完整Secret；系统将按原值用于客户端代理链接。</p><div className="mt-4 flex justify-end gap-3"><button onClick={() => setShowServerForm(false)} className="rounded-xl border border-white/10 px-5 py-2.5 text-slate-300">取消</button><button disabled={busyAction === "server"} onClick={saveServer} className="rounded-xl bg-cyan-400 px-5 py-2.5 font-semibold text-cyan-950 disabled:opacity-60">{busyAction === "server" ? "正在保存…" : "保存服务器"}</button></div></div>}
    </section>
    {generated.length > 0 && <section className="mt-5 rounded-3xl border border-white/10 bg-[#0c1927] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">本次生成结果</h2><button disabled={busyAction === "copy"} onClick={copyExport} className="flex items-center gap-2 rounded-lg border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 text-sm text-cyan-300 disabled:opacity-60"><Copy size={16} />{busyAction === "copy" ? "正在复制…" : "复制独角数卡格式"}</button></div>{copyFeedback && <p role="status" className={`mt-3 text-sm ${copyFeedback.startsWith("复制成功") ? "text-emerald-300" : "text-rose-300"}`}>{copyFeedback}</p>}<textarea readOnly value={exportText} rows={Math.min(12, generated.length * 2)} className="mt-4 w-full rounded-xl border border-white/10 bg-[#07131f] p-4 font-mono text-sm text-slate-300" /></section>}
    <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-[#0c1927]"><div className="border-b border-white/8 px-6 py-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h2 className="text-lg font-semibold">最近Token</h2>{selectedIds.length > 0 && <span className="rounded-lg bg-cyan-300/8 px-2.5 py-1 text-xs text-cyan-300">已选 {selectedIds.length} 个</span>}</div><div className="flex flex-wrap items-center gap-3">{deleteFeedback && <p role="status" className={`text-sm ${deleteFeedback.includes("成功") && !deleteFeedback.includes("失败") ? "text-emerald-300" : "text-amber-300"}`}>{deleteFeedback}</p>}{selectedIds.length > 0 && <button disabled={bulkDeleting || deletingId !== null} onClick={bulkDelete} className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/8 px-4 py-2 text-sm text-rose-300 disabled:opacity-50"><Trash2 size={15} />{bulkDeleting ? "正在批量删除…" : `删除选中（${selectedIds.length}）`}</button>}</div></div></div><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="text-slate-500"><tr><th className="w-12 px-6 py-3"><input aria-label="全选当前列表" type="checkbox" checked={tokens.length > 0 && selectedIds.length === tokens.length} ref={(input) => { if (input) input.indeterminate = selectedIds.length > 0 && selectedIds.length < tokens.length; }} onChange={(event) => setSelectedIds(event.target.checked ? tokens.map((row) => row.id) : [])} /></th><th>Token</th><th>状态</th><th>套餐</th><th>服务器/端口</th><th>创建时间</th><th className="pr-6 text-right">操作</th></tr></thead><tbody>{tokens.map((row) => <tr key={row.id} className={`border-t border-white/6 ${selectedIds.includes(row.id) ? "bg-cyan-300/[0.03]" : ""}`}><td className="px-6 py-3"><input aria-label={`选择Token ${row.token}`} type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelected(row.id)} /></td><td className="font-mono text-xs text-slate-300">{row.token}</td><td>{row.status}</td><td>{row.plan_months === 6 ? "半年付" : row.plan_months === 12 ? "年付" : "月付"} / {(row.quota_bytes / 1024 ** 3).toFixed(0)}GB</td><td>{row.proxy_port ? `${row.server_alias || "?"} / ${row.proxy_port}` : "—"}</td><td>{new Date(row.created_at).toLocaleString("zh-CN")}</td><td className="pr-6 text-right"><button disabled={deletingId !== null || bulkDeleting} onClick={() => deleteToken(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/15 bg-rose-300/5 px-3 py-2 text-xs text-rose-300 hover:bg-rose-300/10 disabled:cursor-wait disabled:opacity-50"><Trash2 size={14} />{deletingId === row.id ? "正在删除…" : "删除"}</button></td></tr>)}</tbody></table></div></section>
  </div></main>;
}

function Field({ label, value, onChange, placeholder = "", type = "text", mono = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return <label className="block text-sm text-slate-400"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} spellCheck="false" className={`mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0a1724] px-3 text-slate-100 outline-none focus:border-cyan-300/40 ${mono ? "font-mono" : ""}`} /></label>;
}
