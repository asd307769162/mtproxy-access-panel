"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, CircleGauge, Copy, KeyRound, LockKeyhole, Network, Pause, Play, Server, ShieldCheck } from "lucide-react";

type ProxyInfo = {
  status: "available" | "provisioning" | "active" | "paused" | "expired" | "exhausted" | "revoked";
  planDays: number; planMonths: number; quotaBytes: number; usedBytes: number; activatedAt: number | null; expiresAt: number | null;
  serverIp: string | null; proxyPort: number | null; secret: string;
  ips?: Array<{ ip: string; location?: string; firstSeen?: string; lastSeen?: string; online?: boolean }>;
};

export default function Home() {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<ProxyInfo | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(path: string, body: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as ProxyInfo & { error?: string };
      if (!response.ok) throw new Error(data.error || "操作失败");
      setInfo(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally { setBusy(false); }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("已复制");
  }

  const tgLink = info?.serverIp && info.proxyPort && info.secret
    ? `tg://proxy?server=${info.serverIp}&port=${info.proxyPort}&secret=${info.secret}` : "";

  return (
    <main className="min-h-screen overflow-hidden bg-[#07111d] text-slate-100">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-300"><Network size={22} /></div><div><p className="text-[15px] font-semibold text-white">MTProxy 专属代理</p><p className="text-xs text-slate-500">激活与流量管理</p></div></div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/8 px-3 py-1.5 text-xs text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />服务正常</div>
      </header>

      {!info ? (
        <section className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-14 pt-8 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:pb-20 lg:pt-16">
          <Intro />
          <div className="relative"><div className="absolute -inset-5 rounded-[34px] bg-gradient-to-br from-cyan-400/10 via-transparent to-blue-500/10 blur-xl" />
            <div className="relative rounded-[28px] border border-white/10 bg-[#0c1927]/90 p-5 shadow-[0_30px_90px_rgba(0,0,0,.35)] sm:p-7">
              <div className="mb-6 flex items-start justify-between"><div><p className="text-sm font-medium text-cyan-300">代理激活</p><h2 className="mt-1 text-2xl font-semibold text-white">验证您的卡密</h2></div><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500/12 text-blue-300"><KeyRound size={21} /></div></div>
              <form onSubmit={(event) => { event.preventDefault(); request("/api/token/verify", { token }); }}>
                <label htmlFor="token" className="mb-2 block text-sm font-medium text-slate-300">卡密 Token</label>
                <input id="token" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" spellCheck="false" placeholder="请输入独角数卡发给您的 Token" className="h-14 w-full rounded-2xl border border-white/10 bg-[#07131f] px-4 text-base text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/55 focus:ring-4 focus:ring-cyan-300/8" />
                <button disabled={busy} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 font-semibold text-[#04101a] disabled:opacity-60">{busy ? "正在验证…" : "验证并继续"}<ArrowRight size={18} /></button>
              </form>
              {message && <Notice text={message} />}
              <div className="mt-6 space-y-3 border-t border-white/8 pt-5 text-sm text-slate-400"><SafeLine text="验证Token后自动识别您购买的套餐" /><SafeLine text="首次启用时创建专属代理端口" /><SafeLine text="代理信息支持一键复制，使用状态随时查看" /></div>
            </div>
          </div>
        </section>
      ) : (
        <section className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-16 pt-5 sm:px-8">
          <button onClick={() => { setInfo(null); setToken(""); setMessage(""); }} className="mb-5 text-sm text-slate-500 hover:text-cyan-300">← 使用其他Token</button>
          {info.status === "available" ? <Activation info={info} busy={busy} message={message} onActivate={() => request("/api/token/activate", { token })} /> :
            <Dashboard info={info} busy={busy} message={message} tgLink={tgLink} onCopy={copy} onToggle={(enabled) => request("/api/token/toggle", { token, enabled })} />}
        </section>
      )}
    </main>
  );
}

function Intro() {
  return <div className="max-w-xl"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/8 px-3 py-1.5 text-sm text-cyan-200"><ShieldCheck size={15} />一份卡密对应一个全新代理端口</div><h1 className="text-balance text-4xl font-semibold leading-[1.12] tracking-[-.035em] text-white sm:text-5xl lg:text-[3.55rem]">输入卡密，启用您的<span className="block bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">专属 MTProxy</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-slate-400 sm:text-lg">为每位用户自动分配独立代理端口，免去复杂配置。连接信息一键复制，流量、到期时间和最近接入IP随时可查，使用情况清晰透明。</p><div className="mt-8 grid max-w-lg grid-cols-3 gap-3"><BenefitCard title="专属代理" detail="独立端口，互不干扰" /><BenefitCard title="实时掌控" detail="流量、期限、接入IP清晰可查" /><BenefitCard title="灵活管理" detail="随时暂停或恢复服务" /></div><p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LockKeyhole size={14} />多节点自动调度 · 设备限制保护 · 到期及流量自动管理</p></div>;
}

function Activation({ info, busy, message, onActivate }: { info: ProxyInfo; busy: boolean; message: string; onActivate: () => void }) {
  return <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-[#0c1927]/90 p-6 sm:p-9"><p className="text-sm text-cyan-300">Token验证成功</p><h1 className="mt-2 text-3xl font-semibold">确认启用代理</h1><p className="mt-3 leading-7 text-slate-400">点击启用后将从可用服务器创建全新随机端口，有效期从此刻开始按自然月计算。此操作不可撤销，但启用后可以暂停和恢复。</p><div className="my-7 grid grid-cols-3 gap-3"><Metric icon={<CircleGauge size={17} />} value={formatBytes(info.quotaBytes)} label="总流量" /><Metric icon={<Server size={17} />} value={planDuration(info.planMonths)} label="有效期" /><Metric icon={<LockKeyhole size={17} />} value="2 台" label="设备限制" /></div><button disabled={busy} onClick={onActivate} className="h-14 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 font-semibold text-[#04101a] disabled:opacity-60">{busy ? "正在创建端口…" : "立即启用"}</button>{message && <Notice text={message} />}</div>;
}

function Dashboard({ info, busy, message, tgLink, onCopy, onToggle }: { info: ProxyInfo; busy: boolean; message: string; tgLink: string; onCopy: (value: string) => void; onToggle: (enabled: boolean) => void }) {
  const active = info.status === "active";
  const remaining = Math.max(0, info.quotaBytes - info.usedBytes);
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-4 rounded-[24px] border border-white/10 bg-[#0c1927]/90 p-6 sm:flex-row sm:items-center"><div><p className="text-sm text-slate-500">代理状态</p><h1 className="mt-1 text-3xl font-semibold text-white">{statusLabel(info.status)}</h1></div>{["active", "paused"].includes(info.status) && <button disabled={busy} onClick={() => onToggle(!active)} className={`flex h-12 items-center justify-center gap-2 rounded-xl px-5 font-medium ${active ? "border border-amber-300/20 bg-amber-300/8 text-amber-200" : "bg-emerald-400 text-emerald-950"}`}>{active ? <Pause size={18} /> : <Play size={18} />}{active ? "暂停使用" : "恢复使用"}</button>}</div>
    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-[24px] border border-white/10 bg-[#0c1927]/90 p-6"><h2 className="text-lg font-semibold">代理信息</h2><div className="mt-5 space-y-3"><InfoRow label="代理IP" value={info.serverIp || "—"} onCopy={onCopy} /><InfoRow label="端口" value={String(info.proxyPort || "—")} onCopy={onCopy} /><InfoRow label="Secret" value={info.secret || "尚未设置"} onCopy={onCopy} secret /></div>{tgLink && <button onClick={() => onCopy(tgLink)} className="mt-5 h-12 w-full rounded-xl bg-cyan-400 font-semibold text-cyan-950">复制完整Telegram代理链接</button>}</div><div className="rounded-[24px] border border-white/10 bg-[#0c1927]/90 p-6"><h2 className="text-lg font-semibold">套餐用量</h2><p className="mt-5 text-3xl font-semibold">{formatBytes(remaining)}</p><p className="mt-1 text-sm text-slate-500">剩余流量</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.min(100, (info.usedBytes / info.quotaBytes) * 100)}%` }} /></div><div className="mt-4 flex justify-between text-sm text-slate-400"><span>已用 {formatBytes(info.usedBytes)}</span><span>共 {formatBytes(info.quotaBytes)}</span></div><p className="mt-5 text-sm text-slate-400">到期：{info.expiresAt ? new Date(info.expiresAt).toLocaleString("zh-CN") : "—"}</p></div></div>
    <div className="rounded-[24px] border border-white/10 bg-[#0c1927]/90 p-6"><h2 className="text-lg font-semibold">最近24小时接入IP</h2>{info.ips?.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{info.ips.map((item) => <div key={item.ip} className="rounded-2xl border border-white/8 bg-[#07131f] p-4"><div className="flex items-center justify-between gap-3"><p className="font-mono text-white">{item.ip}</p><span className={`text-xs ${item.online ? "text-emerald-300" : "text-slate-600"}`}>{item.online ? "当前在线" : "24小时内"}</span></div><p className="mt-2 text-sm text-cyan-200">{item.location || "归属地查询中"}</p><p className="mt-2 text-xs leading-5 text-slate-500">首次 {formatTime(item.firstSeen)} · 最后 {formatTime(item.lastSeen)}</p></div>)}</div> : <p className="mt-5 rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-500">最近24小时暂无接入IP</p>}</div>{message && <Notice text={message} />}</div>;
}

function InfoRow({ label, value, onCopy, secret = false }: { label: string; value: string; onCopy: (value: string) => void; secret?: boolean }) { return <div className="flex items-center justify-between gap-3 rounded-xl bg-[#07131f] px-4 py-3"><div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 truncate font-mono text-sm text-white ${secret ? "tracking-wider" : ""}`}>{value}</p></div><button aria-label={`复制${label}`} onClick={() => onCopy(value)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/8 hover:text-cyan-300"><Copy size={16} /></button></div>; }
function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="rounded-2xl border border-white/8 bg-white/[.035] p-3.5"><div className="mb-3 text-cyan-300">{icon}</div><p className="text-base font-semibold text-white sm:text-lg">{value}</p><p className="mt-0.5 text-xs text-slate-500">{label}</p></div>; }
function BenefitCard({ title, detail }: { title: string; detail: string }) { return <div className="rounded-2xl border border-white/8 bg-white/[.035] p-3.5"><p className="text-sm font-semibold text-cyan-200">{title}</p><p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p></div>; }
function SafeLine({ text }: { text: string }) { return <div className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={15} /><span>{text}</span></div>; }
function Notice({ text }: { text: string }) { return <p aria-live="polite" className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/6 px-4 py-3 text-sm text-cyan-100">{text}</p>; }
function formatBytes(value: number) { return `${(value / 1024 ** 3).toFixed(value >= 10 * 1024 ** 3 ? 1 : 2)} GB`; }
function statusLabel(status: ProxyInfo["status"]) { return ({ available: "等待启用", provisioning: "正在创建", active: "运行中", paused: "已暂停", expired: "已到期", exhausted: "流量已用完", revoked: "已停用" })[status]; }
function formatTime(value?: string) { return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; }
function planDuration(months: number) { return months === 6 ? "6 个自然月" : months === 12 ? "12 个自然月" : "1 个自然月"; }
