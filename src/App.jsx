import { useState, useEffect, useMemo, useCallback } from "react";

const API_URL = "https://script.google.com/macros/s/AKfycbzptEH4P5vRRp2ZV0HZINeCG5i5bqZ5GLW7k487WUHcpsbQlTJBDkS1QAlyCqfC7kxRBw/exec";

async function apiGet() {
  const r = await fetch(`${API_URL}?action=getAll`);
  const d = await r.json();
  return d.chips || [];
}
async function apiSave(chip) {
  await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "save", chip }) });
}
async function apiDelete(id) {
  await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "delete", id }) });
}

const WA = {
  bg:        "#111B21",
  surface:   "#1F2C34",
  surface2:  "#2A3942",
  border:    "#2A3942",
  green:     "#00A884",
  greenLight:"#25D366",
  teal:      "#00696D",
  tealDark:  "#004D51",
  text:      "#E9EDEF",
  textSub:   "#8696A0",
  textMuted: "#546E7A",
};

const STATUS_CONFIG = {
  virgem:      { label: "Virgem",      color: WA.textSub,  bg: WA.surface2,    border: WA.border,       icon: "◯" },
  aquecimento: { label: "Aquecimento", color: "#F0A500",   bg: "#F0A50018",    border: "#F0A50040",     icon: "🔥" },
  cadastrado:  { label: "Cadastrado",  color: WA.green,    bg: `${WA.green}18`, border: `${WA.green}44`, icon: "✓" },
  banido:      { label: "Banido",      color: "#E53935",   bg: "#E5393518",    border: "#E5393544",     icon: "✕" },
  pausado:     { label: "Pausado",     color: "#8696A0",   bg: "#86A0961A",    border: "#86969044",     icon: "⏸" },
};

const CAMPANHAS_DEFAULT = ["Campanha Previdenciária", "Campanha Auxílio-Acidente", "Campanha Maternidade", "X1", "X1 Low Ticket"];
const RECARGA_DIAS     = 60;
const AQUECIMENTO_DIAS = 7;

const calcProgress    = (d) => !d ? 0 : Math.min(Math.max((new Date() - new Date(d)) / (86400000 * AQUECIMENTO_DIAS), 0), 1);
const diasRestantes   = (d) => !d ? AQUECIMENTO_DIAS : Math.max(AQUECIMENTO_DIAS - Math.floor((new Date() - new Date(d)) / 86400000), 0);
const fmt             = (d) => !d ? "-" : new Date(d).toLocaleDateString("pt-BR");
const todayISO        = ()  => new Date().toISOString().split("T")[0];
const nowISO          = ()  => new Date().toLocaleString("pt-BR");
const diasParaRecarga = (d) => { if (!d) return null; const diff = Math.floor((new Date() - new Date(d)) / 86400000); return RECARGA_DIAS - (diff % RECARGA_DIAS); };
const precisaRecarga  = (d) => { const dias = diasParaRecarga(d); return dias !== null && dias <= 10; };
const recarjaUrgente  = (d) => { const dias = diasParaRecarga(d); return dias !== null && dias <= 3; };

const EMPTY_FORM = { barcode: "", numero: "", status: "virgem", campanha: "", aparelho: "", dataCadastro: todayISO(), dataAquecimento: "", obs: "" };

function exportCSV(chips) {
  const headers = ["Código de Barras","Número","Status","Campanha","Aparelho","Data Cadastro","Início Aquecimento","Observações"];
  const rows = chips.map(c => [
    c.barcode, c.numero, STATUS_CONFIG[c.status]?.label || c.status,
    c.campanha || "", c.aparelho || "", fmt(c.dataCadastro), fmt(c.dataAquecimento), c.obs || ""
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","));
  const csv  = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: `chips_${todayISO()}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
export default function ChipControl() {
  const [chips,     setChips]    = useState([]);
  const [campanhas, setCamp]     = useState(() => { try { const s = localStorage.getItem("chip_campanhas"); return s ? JSON.parse(s) : CAMPANHAS_DEFAULT; } catch { return CAMPANHAS_DEFAULT; } });
  const [filter,    setFilter]   = useState("todos");
  const [campFilter,setCampF]    = useState("todas");
  const [modal,     setModal]    = useState(false);
  const [editId,    setEditId]   = useState(null);
  const [form,      setForm]     = useState(EMPTY_FORM);
  const [search,    setSearch]   = useState("");
  const [confirm,   setConfirm]  = useState(null);
  const [histChip,  setHistChip] = useState(null);
  const [tab,       setTab]      = useState("chips");
  const [newCamp,   setNewCamp]  = useState("");
  const [syncStatus, setSyncStatus] = useState("idle");
  const [lastSync,   setLastSync]   = useState(null);

  const loadFromSheets = useCallback(async () => {
    setSyncStatus("loading");
    try {
      const data = await apiGet();
      if (data.length > 0) {
        setChips(data);
        localStorage.setItem("chip_control_v3", JSON.stringify(data));
      } else {
        const local = localStorage.getItem("chip_control_v3");
        if (local) setChips(JSON.parse(local));
      }
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
      setSyncStatus("ok");
    } catch {
      setSyncStatus("error");
      const local = localStorage.getItem("chip_control_v3");
      if (local) setChips(JSON.parse(local));
    }
  }, []);

  useEffect(() => { loadFromSheets(); }, []);
  useEffect(() => { localStorage.setItem("chip_campanhas", JSON.stringify(campanhas)); }, [campanhas]);

  async function persistChip(updatedChip) {
    setSyncStatus("saving");
    try {
      await apiSave(updatedChip);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
      setSyncStatus("ok");
    } catch { setSyncStatus("error"); }
  }

  async function removeChip(id) {
    setSyncStatus("saving");
    try {
      await apiDelete(id);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
      setSyncStatus("ok");
    } catch { setSyncStatus("error"); }
  }

  const prontos  = chips.filter(c => c.status === "aquecimento" && diasRestantes(c.dataAquecimento) === 0);
  const recargas = chips.filter(c => c.status !== "banido" && precisaRecarga(c.dataCadastro));

  const filtered = chips.filter(c => {
    const okS = filter    === "todos" || c.status   === filter;
    const okC = campFilter === "todas" || c.campanha === campFilter;
    const q   = search.toLowerCase();
    const okQ = !q || c.numero.includes(q) || c.barcode.includes(q) || (c.aparelho||"").toLowerCase().includes(q) || (c.campanha||"").toLowerCase().includes(q);
    return okS && okC && okQ;
  });

  const counts = Object.fromEntries(Object.keys(STATUS_CONFIG).map(s => [s, chips.filter(c => c.status === s).length]));

  const stats = useMemo(() => {
    const total = chips.length;
    const taxaBan = total ? ((counts.banido||0) / total * 100).toFixed(1) : 0;
    const porAparelho = {}, porCampanha = {};
    chips.forEach(c => {
      if (c.aparelho) porAparelho[c.aparelho] = (porAparelho[c.aparelho]||0)+1;
      const k = c.campanha||"Sem campanha";
      porCampanha[k] = (porCampanha[k]||0)+1;
    });
    const risco = chips.filter(c => (c.historico||[]).filter(h => h.evento?.includes("Banido")).length >= 2);
    return { total, taxaBan, porAparelho, porCampanha, risco };
  }, [chips]);

  function openAdd()    { setEditId(null); setForm({ ...EMPTY_FORM, dataCadastro: todayISO() }); setModal("form"); }
  function openEdit(ch) { setEditId(ch.id); setForm({ barcode: ch.barcode, numero: ch.numero, status: ch.status, campanha: ch.campanha||"", aparelho: ch.aparelho||"", dataCadastro: ch.dataCadastro, dataAquecimento: ch.dataAquecimento||"", obs: ch.obs||"" }); setModal("form"); }

  async function saveForm() {
    if (!form.barcode.trim() || !form.numero.trim()) return;
    let saved;
    if (editId !== null) {
      const old = chips.find(c => c.id === editId);
      const changes = [];
      if (old.status   !== form.status)   changes.push(`Status: ${STATUS_CONFIG[form.status]?.label}`);
      if (old.campanha !== form.campanha) changes.push(`Campanha: ${form.campanha||"nenhuma"}`);
      if (old.aparelho !== form.aparelho) changes.push(`Aparelho: ${form.aparelho||"nenhum"}`);
      saved = { ...old, ...form, dataAquecimento: form.dataAquecimento||null, historico: [...(old.historico||[]), ...(changes.map(ev => ({ data: nowISO(), evento: ev })))] };
      setChips(p => p.map(c => c.id === editId ? saved : c));
    } else {
      saved = { id: Date.now(), ...form, dataAquecimento: form.dataAquecimento||null, historico: [{ data: nowISO(), evento: "Chip cadastrado" }] };
      setChips(p => [...p, saved]);
    }
    setModal(false);
    await persistChip(saved);
  }

  async function deleteChip(id) {
    setChips(p => p.filter(c => c.id !== id));
    setConfirm(null);
    await removeChip(id);
  }

  async function changeStatus(id, newSt) {
    let saved;
    setChips(p => p.map(c => {
      if (c.id !== id) return c;
      const u = { status: newSt };
      if (newSt === "aquecimento" && !c.dataAquecimento) u.dataAquecimento = todayISO();
      const log = { data: nowISO(), evento: newSt === "aquecimento" ? "Aquecimento iniciado" : newSt === "cadastrado" ? "Marcado como Pronto" : newSt === "banido" ? "Banido" : newSt === "pausado" ? "Pausado" : `Status: ${newSt}` };
      saved = { ...c, ...u, historico: [...(c.historico||[]), log] };
      return saved;
    }));
    if (saved) await persistChip(saved);
  }

  function addCampanha() {
    const t = newCamp.trim();
    if (t && !campanhas.includes(t)) setCamp(p => [...p, t]);
    setNewCamp("");
  }

  const syncColor = { idle: WA.textMuted, loading: "#F0A500", saving: "#F0A500", ok: WA.green, error: "#E53935" }[syncStatus];
  const syncLabel = { idle: "", loading: "Carregando...", saving: "Salvando...", ok: `Sincronizado ${lastSync}`, error: "Erro de conexão" }[syncStatus];
  const syncIcon  = { idle: "", loading: "⟳", saving: "⟳", ok: "✓", error: "⚠️" }[syncStatus];
  const S = {
    root:     { minHeight: "100vh", background: WA.bg, color: WA.text, fontFamily: "'Segoe UI', system-ui, sans-serif" },
    header:   { background: WA.teal, padding: "12px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, boxShadow: "0 2px 8px #0005" },
    logoWrap: { display: "flex", alignItems: "center", gap: 10 },
    logoIcon: { width: 38, height: 38, background: WA.greenLight, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
    logoText: { fontSize: 17, fontWeight: 700, color: "#fff" },
    logoSub:  { fontSize: 10, color: "#ffffff99", letterSpacing: "0.05em" },
    hBtns:    { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
    syncBadge:{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: syncColor, background: `${syncColor}18`, border: `1px solid ${syncColor}44`, borderRadius: 20, padding: "4px 10px" },
    btnGreen: { background: WA.greenLight, color: "#111", border: "none", borderRadius: 20, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
    btnOutline:{ background: "transparent", color: "#fff", border: "1px solid #ffffff44", borderRadius: 20, padding: "7px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
    btnRefresh:{ background: "transparent", color: "#fff", border: "1px solid #ffffff44", borderRadius: 20, padding: "7px 12px", fontWeight: 600, fontSize: 14, cursor: "pointer", lineHeight: 1 },
    alertBar: { background: `${WA.green}22`, borderBottom: `2px solid ${WA.green}`, padding: "10px 22px", display: "flex", alignItems: "center", gap: 10 },
    alertText:{ fontSize: 13, color: WA.greenLight, fontWeight: 600 },
    tabs:     { display: "flex", borderBottom: `1px solid ${WA.border}`, background: WA.surface },
    tab:      (a) => ({ padding: "12px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: a ? WA.greenLight : WA.textSub, borderBottom: a ? `2px solid ${WA.green}` : "2px solid transparent", background: "transparent", border: "none", fontFamily: "inherit" }),
    statsRow: { display: "flex", gap: 8, padding: "12px 22px", overflowX: "auto", flexWrap: "wrap", borderBottom: `1px solid ${WA.border}` },
    statCard: { background: WA.surface, border: `1px solid ${WA.border}`, borderRadius: 10, padding: "10px 16px", minWidth: 95, cursor: "pointer" },
    statCardA:{ background: `${WA.green}22`, border: `1px solid ${WA.green}`, borderRadius: 10, padding: "10px 16px", minWidth: 95, cursor: "pointer" },
    statN:    (c) => ({ fontSize: 22, fontWeight: 800, color: c, lineHeight: 1 }),
    statLbl:  { fontSize: 10, color: WA.textSub, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 },
    controls: { display: "flex", gap: 8, padding: "10px 22px", alignItems: "center", flexWrap: "wrap" },
    searchBox:{ background: WA.surface, border: `1px solid ${WA.border}`, borderRadius: 8, padding: "8px 13px", color: WA.text, fontFamily: "inherit", fontSize: 13, outline: "none", flex: 1, minWidth: 180 },
    filterBtn:(a) => ({ background: a ? `${WA.green}22` : "transparent", border: `1px solid ${a ? WA.green : WA.border}`, borderRadius: 16, padding: "5px 12px", color: a ? WA.greenLight : WA.textSub, fontFamily: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }),
    grid:     { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12, padding: "12px 22px 40px" },
    card:     (r) => ({ background: WA.surface, border: `1px solid ${r ? "#E5393566" : WA.border}`, borderRadius: 10, overflow: "hidden" }),
    cardTop:  (s) => ({ background: STATUS_CONFIG[s].bg, borderBottom: `1px solid ${STATUS_CONFIG[s].border}`, padding: "9px 13px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }),
    badge:    (s) => ({ background: STATUS_CONFIG[s].bg, border: `1px solid ${STATUS_CONFIG[s].border}`, color: STATUS_CONFIG[s].color, borderRadius: 12, padding: "2px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }),
    cardBody: { padding: "11px 13px" },
    barcode:  { fontFamily: "'Courier New', monospace", fontSize: 10, color: WA.textMuted, letterSpacing: "0.12em", marginBottom: 3 },
    numero:   { fontFamily: "'Courier New', monospace", fontSize: 16, fontWeight: 700, color: WA.text, marginBottom: 9 },
    row:      { display: "flex", gap: 8, marginBottom: 4 },
    lbl:      { fontSize: 10, color: WA.textSub, textTransform: "uppercase", letterSpacing: "0.07em", minWidth: 65, paddingTop: 1 },
    val:      { fontSize: 12, color: "#C8D0D6" },
    campPill: { display: "inline-block", background: `${WA.teal}44`, border: `1px solid ${WA.teal}`, borderRadius: 10, color: "#7ECEC4", fontSize: 10, fontWeight: 600, padding: "1px 8px", marginBottom: 6 },
    progWrap: { marginTop: 9 },
    progLbl:  { display: "flex", justifyContent: "space-between", fontSize: 10, color: WA.textSub, marginBottom: 4 },
    progTrk:  { height: 5, background: WA.surface2, borderRadius: 99, overflow: "hidden" },
    progFill: (p) => ({ height: "100%", width: `${p*100}%`, background: p>=1 ? `linear-gradient(90deg,${WA.green},${WA.greenLight})` : "linear-gradient(90deg,#F0A500,#FFD54F)", borderRadius: 99, transition: "width 0.4s" }),
    obs:      { fontSize: 11, color: WA.textSub, fontStyle: "italic", marginTop: 7, borderTop: `1px solid ${WA.border}`, paddingTop: 7 },
    riscoBadge:{ fontSize: 11, color: "#E53935", fontWeight: 700, marginTop: 5 },
    actions:  { padding: "8px 13px", borderTop: `1px solid ${WA.border}`, display: "flex", gap: 5, flexWrap: "wrap" },
    aBtn:     { background: WA.surface2, border: `1px solid ${WA.border}`, borderRadius: 6, color: WA.textSub, fontSize: 10, fontFamily: "inherit", fontWeight: 600, padding: "4px 9px", cursor: "pointer" },
    aBtnG:    { background: `${WA.green}20`, border: `1px solid ${WA.green}44`, borderRadius: 6, color: WA.greenLight, fontSize: 10, fontFamily: "inherit", fontWeight: 600, padding: "4px 9px", cursor: "pointer" },
    aBtnO:    { background: "#F0A50020", border: "1px solid #F0A50044", borderRadius: 6, color: "#F0A500", fontSize: 10, fontFamily: "inherit", fontWeight: 600, padding: "4px 9px", cursor: "pointer" },
    aBtnR:    { background: "#E5393520", border: "1px solid #E5393544", borderRadius: 6, color: "#E53935", fontSize: 10, fontFamily: "inherit", fontWeight: 600, padding: "4px 9px", cursor: "pointer" },
    overlay:   { position: "fixed", inset: 0, background: "#000000BB", backdropFilter: "blur(3px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
    mBox:      { background: WA.surface, border: `1px solid ${WA.border}`, borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" },
    mHead:     { background: WA.teal, padding: "13px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "12px 12px 0 0" },
    mTitle:    { fontSize: 14, fontWeight: 700, color: "#fff" },
    mClose:    { background: "transparent", border: "none", color: "#ffffffAA", fontSize: 22, cursor: "pointer", lineHeight: 1 },
    mBody:     { padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 },
    fLabel:    { fontSize: 10, color: WA.textSub, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, display: "block" },
    inp:       { width: "100%", background: WA.surface2, border: `1px solid ${WA.border}`, borderRadius: 8, padding: "8px 11px", color: WA.text, fontFamily: "inherit", fontSize: 13, outline: "none", boxSizing: "border-box" },
    sel:       { width: "100%", background: WA.surface2, border: `1px solid ${WA.border}`, borderRadius: 8, padding: "8px 11px", color: WA.text, fontFamily: "inherit", fontSize: 13, outline: "none", boxSizing: "border-box" },
    row2:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
    mFoot:     { padding: "12px 20px", borderTop: `1px solid ${WA.border}`, display: "flex", justifyContent: "flex-end", gap: 8 },
    btnCancel: { background: "transparent", border: `1px solid ${WA.border}`, borderRadius: 8, color: WA.textSub, fontFamily: "inherit", fontWeight: 600, fontSize: 12, padding: "7px 14px", cursor: "pointer" },
    btnSave:   { background: WA.green, border: "none", borderRadius: 8, color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: 12, padding: "7px 18px", cursor: "pointer" },
    statsPanel:{ padding: "20px 22px" },
    statGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 20 },
    bigStat:   { background: WA.surface, border: `1px solid ${WA.border}`, borderRadius: 12, padding: "16px", textAlign: "center" },
    secTitle:  { fontSize: 12, color: WA.textSub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, marginTop: 4 },
    barRow:    { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
    barLbl:    { fontSize: 12, color: WA.text, minWidth: 140, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    barTrack:  { flex: 1, height: 8, background: WA.surface2, borderRadius: 99, overflow: "hidden" },
    barFill:   (p, c) => ({ height: "100%", width: `${p}%`, background: c, borderRadius: 99 }),
    barCount:  { fontSize: 11, color: WA.textSub, minWidth: 24, textAlign: "right" },
    riscoBox:  { background: "#E5393510", border: "1px solid #E5393533", borderRadius: 10, padding: "12px 14px", marginTop: 8 },
    hItem:     { display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${WA.border}` },
    hDot:      { width: 8, height: 8, borderRadius: "50%", background: WA.green, marginTop: 5, flexShrink: 0 },
    empty:     { textAlign: "center", color: WA.textSub, padding: "60px 20px", fontSize: 14, gridColumn: "1/-1" },
    confirmOv: { position: "fixed", inset: 0, background: "#000000BB", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
    confirmBox:{ background: WA.surface, border: "1px solid #E5393544", borderRadius: 12, padding: 24, maxWidth: 320, textAlign: "center" },
    loadingOv: { position: "fixed", inset: 0, background: WA.bg, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 },
  };
  if (syncStatus === "loading" && chips.length === 0) return (
    <div style={S.loadingOv}>
      <div style={{ fontSize: 48 }}>📶</div>
      <div style={{ fontSize: 16, color: WA.text, fontFamily: "'Segoe UI', sans-serif", fontWeight: 600 }}>Carregando ChipControl...</div>
      <div style={{ fontSize: 13, color: WA.textSub, fontFamily: "'Segoe UI', sans-serif" }}>Sincronizando com Google Sheets</div>
    </div>
  );

  return (
    <>
      <div style={S.root}>
        <header style={S.header}>
          <div style={S.logoWrap}>
            <div style={S.logoIcon}>📶</div>
            <div>
              <div style={S.logoText}>ChipControl</div>
              <div style={S.logoSub}>Gestão de chips de campanha</div>
            </div>
          </div>
          <div style={S.hBtns}>
            {syncLabel && <div style={S.syncBadge}>{syncIcon} {syncLabel}</div>}
            <button style={S.btnRefresh} onClick={loadFromSheets} title="Sincronizar agora">⟳</button>
            <button style={S.btnOutline} onClick={() => exportCSV(chips)}>⬇ CSV</button>
            <button style={S.btnGreen}   onClick={openAdd}>+ Novo Chip</button>
          </div>
        </header>

        {prontos.length > 0 && (
          <div style={S.alertBar}>
            <span style={{ fontSize: 18 }}>✅</span>
            <span style={S.alertText}>{prontos.length} chip{prontos.length > 1 ? "s" : ""} pronto{prontos.length > 1 ? "s" : ""} para uso: {prontos.map(c => c.numero).join(", ")}</span>
            <button style={{ ...S.aBtnG, marginLeft: "auto" }} onClick={() => setFilter("aquecimento")}>Ver</button>
          </div>
        )}

        {recargas.length > 0 && (
          <div style={{ background: recargas.some(c => recarjaUrgente(c.dataCadastro)) ? "#E5393518" : "#F0A50018", borderBottom: `2px solid ${recargas.some(c => recarjaUrgente(c.dataCadastro)) ? "#E53935" : "#F0A500"}`, padding: "10px 22px", display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: recargas.some(c => recarjaUrgente(c.dataCadastro)) ? "#E57373" : "#F0A500", fontWeight: 700, marginBottom: 4 }}>
                {recargas.length} chip{recargas.length > 1 ? "s" : ""} precisam de recarga para não perder a linha!
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {recargas.map(c => {
                  const dias = diasParaRecarga(c.dataCadastro);
                  const urg  = recarjaUrgente(c.dataCadastro);
                  return (
                    <span key={c.id} style={{ background: urg ? "#E5393530" : "#F0A50025", border: `1px solid ${urg ? "#E5393566" : "#F0A50066"}`, borderRadius: 8, padding: "2px 9px", fontSize: 11, color: urg ? "#E57373" : "#F0A500", fontWeight: 600 }}>
                      {c.numero} — {dias === 0 ? "⚠️ hoje!" : `${dias} dia${dias !== 1 ? "s" : ""}`}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={S.tabs}>
          <button style={S.tab(tab === "chips")}     onClick={() => setTab("chips")}>📶 Chips ({chips.length})</button>
          <button style={S.tab(tab === "stats")}     onClick={() => setTab("stats")}>📊 Estatísticas</button>
          <button style={S.tab(tab === "campanhas")} onClick={() => setTab("campanhas")}>📣 Campanhas</button>
        </div>

        {tab === "chips" && (<>
          <div style={S.statsRow}>
            <div style={filter === "todos" ? S.statCardA : S.statCard} onClick={() => setFilter("todos")}>
              <div style={S.statN(WA.greenLight)}>{chips.length}</div>
              <div style={S.statLbl}>Total</div>
            </div>
            <div style={{ background: prontos.length > 0 ? `${WA.green}22` : WA.surface, border: `1px solid ${prontos.length > 0 ? WA.green : WA.border}`, borderRadius: 10, padding: "10px 16px", minWidth: 95, cursor: "pointer" }} onClick={() => setFilter("aquecimento")}>
              <div style={{ ...S.statN(WA.greenLight), display: "flex", alignItems: "center", gap: 5 }}>
                {prontos.length > 0 && <span style={{ fontSize: 14 }}>✅</span>}{prontos.length}
              </div>
              <div style={S.statLbl}>Prontos</div>
            </div>
            {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
              <div key={s} style={filter === s ? S.statCardA : S.statCard} onClick={() => setFilter(s)}>
                <div style={S.statN(cfg.color)}>{counts[s]||0}</div>
                <div style={S.statLbl}>{cfg.label}</div>
              </div>
            ))}
          </div>
          <div style={S.controls}>
            <input style={S.searchBox} placeholder="Buscar número, código, aparelho ou campanha..." value={search} onChange={e => setSearch(e.target.value)} />
            <button style={S.filterBtn(campFilter === "todas")} onClick={() => setCampF("todas")}>Todas</button>
            {campanhas.map(cp => <button key={cp} style={S.filterBtn(campFilter === cp)} onClick={() => setCampF(cp)}>{cp}</button>)}
          </div>
          <div style={S.grid}>
            {filtered.length === 0 && <div style={S.empty}>{chips.length === 0 ? "Nenhum chip cadastrado ainda." : "Nenhum chip encontrado."}</div>}
            {filtered.map(chip => {
              const cfg       = STATUS_CONFIG[chip.status];
              const isAq      = chip.status === "aquecimento";
              const pct       = isAq ? calcProgress(chip.dataAquecimento) : null;
              const dias      = isAq ? diasRestantes(chip.dataAquecimento) : null;
              const pronto    = isAq && dias === 0;
              const bans      = (chip.historico||[]).filter(h => h.evento === "Banido").length;
              const emRisco   = bans >= 2;
              const diasRec   = chip.status !== "banido" ? diasParaRecarga(chip.dataCadastro) : null;
              const alertaRec = diasRec !== null && diasRec <= 10;
              const urgenteRec= diasRec !== null && diasRec <= 3;
              return (
                <div key={chip.id} style={S.card(emRisco)}>
                  <div style={S.cardTop(chip.status)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={S.badge(chip.status)}>{cfg.icon} {cfg.label}</span>
                      {pronto && <span style={S.badge("cadastrado")}>✅ Pronto!</span>}
                    </div>
                    <span style={{ fontSize: 10, color: WA.textMuted, whiteSpace: "nowrap" }}>{fmt(chip.dataCadastro)}</span>
                  </div>
                  <div style={S.cardBody}>
                    {chip.campanha && <div style={S.campPill}>📣 {chip.campanha}</div>}
                    <div style={S.barcode}>▌ {chip.barcode} ▌</div>
                    <div style={S.numero}>{chip.numero}</div>
                    <div style={S.row}><span style={S.lbl}>Aparelho</span><span style={S.val}>{chip.aparelho || <span style={{ color: WA.textMuted }}>não definido</span>}</span></div>
                    <div style={S.row}><span style={S.lbl}>Cadastro</span><span style={S.val}>{fmt(chip.dataCadastro)}</span></div>
                    {chip.dataAquecimento && <div style={S.row}><span style={S.lbl}>Início aq.</span><span style={S.val}>{fmt(chip.dataAquecimento)}</span></div>}
                    {isAq && (
                      <div style={S.progWrap}>
                        <div style={S.progLbl}>
                          <span>Aquecimento {Math.round(pct*100)}%</span>
                          <span style={{ color: pct>=1 ? WA.green : "#F0A500" }}>{dias === 0 ? "✓ Pronto!" : `${dias} dia${dias!==1?"s":""} restante${dias!==1?"s":""}`}</span>
                        </div>
                        <div style={S.progTrk}><div style={S.progFill(pct)} /></div>
                      </div>
                    )}
                    {emRisco && <div style={S.riscoBadge}>⚠️ Chip de risco ({bans}x banido)</div>}
                    {alertaRec && (
                      <div style={{ fontSize: 11, color: urgenteRec ? "#E57373" : "#F0A500", fontWeight: 700, marginTop: 6, background: urgenteRec ? "#E5393518" : "#F0A50015", border: `1px solid ${urgenteRec ? "#E5393544" : "#F0A50044"}`, borderRadius: 6, padding: "4px 8px" }}>
                        🔋 {diasRec === 0 ? "Recarregar hoje!" : `Recarregar em ${diasRec} dia${diasRec!==1?"s":""}`}
                      </div>
                    )}
                    {chip.obs && <div style={S.obs}>{chip.obs}</div>}
                  </div>
                  <div style={S.actions}>
                    <button style={S.aBtn} onClick={() => openEdit(chip)}>✎ Editar</button>
                    <button style={S.aBtn} onClick={() => { setHistChip(chip); setModal("historico"); }}>📋 Histórico</button>
                    {chip.status !== "aquecimento" && chip.status !== "cadastrado" && <button style={S.aBtnO} onClick={() => changeStatus(chip.id, "aquecimento")}>🔥 Aquecer</button>}
                    {pronto && <button style={S.aBtnG} onClick={() => changeStatus(chip.id, "cadastrado")}>✓ Pronto</button>}
                    {chip.status !== "banido" && chip.status !== "pausado" && <button style={S.aBtnO} onClick={() => changeStatus(chip.id, "pausado")}>⏸ Pausar</button>}
                    {chip.status !== "banido" && <button style={S.aBtnR} onClick={() => changeStatus(chip.id, "banido")}>✕ Banido</button>}
                    {chip.status === "banido" && <button style={S.aBtnO} onClick={() => changeStatus(chip.id, "virgem")}>↩ Virgem</button>}
                    <button style={S.aBtnR} onClick={() => setConfirm(chip.id)}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>)}
        {tab === "stats" && (
          <div style={S.statsPanel}>
            <div style={S.statGrid}>
              {[
                { n: chips.length,        c: WA.greenLight, l: "Total de chips" },
                { n: counts.cadastrado||0, c: WA.green,     l: "Cadastrados" },
                { n: counts.aquecimento||0,c: "#F0A500",    l: "Aquecimento" },
                { n: counts.banido||0,     c: "#E53935",    l: "Banidos" },
                { n: `${stats.taxaBan}%`,  c: "#E53935",    l: "Taxa banimento" },
                { n: prontos.length,       c: WA.green,     l: "Prontos p/ uso" },
              ].map((it, i) => (
                <div key={i} style={S.bigStat}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: it.c, lineHeight: 1 }}>{it.n}</div>
                  <div style={{ fontSize: 10, color: WA.textSub, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4 }}>{it.l}</div>
                </div>
              ))}
            </div>
            <div style={S.secTitle}>Por aparelho</div>
            {Object.entries(stats.porAparelho).length === 0
              ? <div style={{ color: WA.textSub, fontSize: 13, marginBottom: 16 }}>Nenhum aparelho cadastrado.</div>
              : Object.entries(stats.porAparelho).sort((a,b)=>b[1]-a[1]).map(([ap,n]) => (
                <div key={ap} style={S.barRow}>
                  <div style={S.barLbl}>{ap}</div>
                  <div style={S.barTrack}><div style={S.barFill(n/chips.length*100, WA.green)} /></div>
                  <div style={S.barCount}>{n}</div>
                </div>
              ))}
            <div style={{ ...S.secTitle, marginTop: 20 }}>Por campanha</div>
            {Object.entries(stats.porCampanha).sort((a,b)=>b[1]-a[1]).map(([cp,n]) => (
              <div key={cp} style={S.barRow}>
                <div style={S.barLbl}>{cp}</div>
                <div style={S.barTrack}><div style={S.barFill(n/chips.length*100, WA.teal)} /></div>
                <div style={S.barCount}>{n}</div>
              </div>
            ))}
            {stats.risco.length > 0 && (<>
              <div style={{ ...S.secTitle, marginTop: 20, color: "#E53935" }}>⚠️ Chips em risco</div>
              <div style={S.riscoBox}>
                {stats.risco.map(c => <div key={c.id} style={{ fontSize: 13, color: "#E57373", marginBottom: 4 }}>{c.numero} {c.aparelho ? `— ${c.aparelho}` : ""} {c.campanha ? `(${c.campanha})` : ""}</div>)}
              </div>
            </>)}
          </div>
        )}

        {tab === "campanhas" && (
          <div style={{ padding: "20px 22px" }}>
            <div style={S.secTitle}>Campanhas cadastradas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {campanhas.map(cp => (
                <div key={cp} style={{ background: WA.surface, border: `1px solid ${WA.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, color: WA.text, fontWeight: 600 }}>📣 {cp}</div>
                    <div style={{ fontSize: 11, color: WA.textSub, marginTop: 2 }}>{chips.filter(c => c.campanha === cp).length} chip(s) vinculado(s)</div>
                  </div>
                  <button style={S.aBtnR} onClick={() => setCamp(p => p.filter(c => c !== cp))}>Remover</button>
                </div>
              ))}
            </div>
            <div style={S.secTitle}>Nova campanha</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...S.inp, maxWidth: 320 }} placeholder="Nome da campanha..." value={newCamp} onChange={e => setNewCamp(e.target.value)} onKeyDown={e => e.key === "Enter" && addCampanha()} />
              <button style={S.btnSave} onClick={addCampanha}>Adicionar</button>
            </div>
          </div>
        )}
      </div>

      {modal === "form" && (
        <div style={S.overlay} onClick={() => setModal(false)}>
          <div style={S.mBox} onClick={e => e.stopPropagation()}>
            <div style={S.mHead}>
              <span style={S.mTitle}>{editId !== null ? "Editar Chip" : "Cadastrar Novo Chip"}</span>
              <button style={S.mClose} onClick={() => setModal(false)}>×</button>
            </div>
            <div style={S.mBody}>
              <div>
                <label style={S.fLabel}>Código de Barras</label>
                <input style={{ ...S.inp, fontFamily: "'Courier New', monospace", letterSpacing: "0.1em" }} placeholder="ex: 8955900001234" value={form.barcode} onChange={e => setForm({...form, barcode: e.target.value})} />
              </div>
              <div>
                <label style={S.fLabel}>Número do Chip</label>
                <input style={{ ...S.inp, fontFamily: "'Courier New', monospace" }} placeholder="ex: (96) 99000-0001" value={form.numero} onChange={e => setForm({...form, numero: e.target.value})} />
              </div>
              <div>
                <label style={S.fLabel}>Status</label>
                <select style={S.sel} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                  {Object.entries(STATUS_CONFIG).map(([s, c]) => <option key={s} value={s}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={S.fLabel}>Campanha</label>
                <select style={{ ...S.sel, appearance: "auto" }} value={form.campanha} onChange={e => setForm({...form, campanha: e.target.value})}>
                  <option value="">— Sem campanha —</option>
                  {campanhas.map(cp => <option key={cp} value={cp}>{cp}</option>)}
                </select>
              </div>
              <div>
                <label style={S.fLabel}>Aparelho com WhatsApp instalado</label>
                <input style={S.inp} placeholder="ex: Samsung A14, Moto G32..." value={form.aparelho} onChange={e => setForm({...form, aparelho: e.target.value})} />
              </div>
              <div style={S.row2}>
                <div>
                  <label style={S.fLabel}>Data de Cadastro</label>
                  <input type="date" style={S.inp} value={form.dataCadastro} onChange={e => setForm({...form, dataCadastro: e.target.value})} />
                </div>
                <div>
                  <label style={S.fLabel}>Início Aquecimento</label>
                  <input type="date" style={S.inp} value={form.dataAquecimento} onChange={e => setForm({...form, dataAquecimento: e.target.value})} />
                </div>
              </div>
              <div>
                <label style={S.fLabel}>Observações</label>
                <input style={S.inp} placeholder="Notas sobre este chip..." value={form.obs} onChange={e => setForm({...form, obs: e.target.value})} />
              </div>
            </div>
            <div style={S.mFoot}>
              <button style={S.btnCancel} onClick={() => setModal(false)}>Cancelar</button>
              <button style={S.btnSave} onClick={saveForm} disabled={!form.barcode.trim() || !form.numero.trim()}>
                {syncStatus === "saving" ? "Salvando..." : "Salvar Chip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "historico" && histChip && (
        <div style={S.overlay} onClick={() => setModal(false)}>
          <div style={{ ...S.mBox, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div style={S.mHead}>
              <span style={S.mTitle}>📋 Histórico — {histChip.numero}</span>
              <button style={S.mClose} onClick={() => setModal(false)}>×</button>
            </div>
            <div style={{ padding: "14px 20px" }}>
              {(histChip.historico||[]).length === 0
                ? <div style={{ color: WA.textSub, fontSize: 13 }}>Nenhum evento registrado.</div>
                : [...(histChip.historico||[])].reverse().map((h, i) => (
                  <div key={i} style={S.hItem}>
                    <div style={S.hDot} />
                    <div>
                      <div style={{ fontSize: 13, color: WA.text }}>{h.evento}</div>
                      <div style={{ fontSize: 10, color: WA.textMuted, marginTop: 2 }}>{h.data}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div style={S.confirmOv}>
          <div style={S.confirmBox}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🗑️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: WA.text, marginBottom: 8 }}>Remover este chip?</div>
            <div style={{ fontSize: 12, color: WA.textSub, marginBottom: 20 }}>O chip será removido do sistema e da planilha.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={S.btnCancel} onClick={() => setConfirm(null)}>Cancelar</button>
              <button style={{ ...S.btnSave, background: "#E53935" }} onClick={() => deleteChip(confirm)}>Remover</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
