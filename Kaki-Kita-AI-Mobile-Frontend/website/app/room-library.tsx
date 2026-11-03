"use client";
import { useLanguage } from "./language-provider";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleHelp, DoorOpen, FileText, Film, FolderOpen, Grid2X2, ImagePlus, Image as ImageIcon, LayoutList, LoaderCircle, MapPin, Plus, ScanLine, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, X, Home, Coffee, Users } from "lucide-react";
import { CHECKS, MIME_LIMITS, TYPES } from "@/lib/validation";
import { callApi as api } from "@/lib/client-api";
import ProjectPages from "./project-pages";
import GuidedTour from "./guided-tour";
import RemovalProgress from "./removal-progress";
import EasyRoomPoints from "./easy-room-points";
import MobileNavigation from "./mobile-navigation";
import { BuddyArt } from "./kita-buddy";
import { CalmMode } from "./playful-experience";
import { LanguagePicker } from "./language-provider";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { videoFrames } from "@/lib/media-input";
import { saveNativeReport } from "@/lib/native-app";
import { TOUR_STORAGE_KEY } from "@/lib/interaction";
type Room = {
    id: string;
    name: string;
    type: string;
    location: string;
    area: number | null;
    notes: string;
    checklist: string;
    created_at: string;
    updated_at: string;
    media_count: number;
    report_count: number;
    cover_id: string | null;
};
type Media = {
    id: string;
    name: string;
    type: string;
    size: number;
    analyzed_at: string | null;
    created_at: string;
};
type Detail = Room & {
    media: Media[];
};
type Report = {
    analyzedAt: string;
    kind: string;
    samples: {
        seconds: number | null;
        result: {
            models?: Record<string, string>;
            analysis?: Record<string, unknown>;
            claude?: Record<string, unknown>;
            yolo: {
                detections: {
                    label: string;
                    confidence: number;
                    confidence_percent?: number;
                }[];
                annotated_image_base64?: string;
            };
            gemini?: Record<string, unknown>;
            disclaimer?: string;
        };
    }[];
};
type Draft = {
    name: string;
    type: string;
    location: string;
    area: string;
    notes: string;
    checklist: string[];
};
const newDraft = (): Draft => ({ name: "", type: "Living room", location: "", area: "", notes: "", checklist: CHECKS.map(() => "Not checked") });
const fileUrl = (id: string) => `/api/media/${id}/file`;
const sizeLabel = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const dateLabel = (d: string) => new Date(d).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
function RoomArt() {
    const { t: translate } = useLanguage();
    return <svg viewBox="0 0 460 280" fill="none" aria-hidden="true" className="room-art"><ellipse cx="241" cy="248" rx="169" ry="19" fill="#173e37" opacity=".07"/><path d="M73 170L230 87L396 170L238 254Z" fill="#f3ede1" stroke="#87a699" strokeWidth="2"/><path d="M73 170V72L230 0V87Z" fill="#e1ebe2" stroke="#87a699" strokeWidth="2"/><path d="M230 0L396 81V170L230 87Z" fill="#c9dccc" stroke="#87a699" strokeWidth="2"/><path d="M112 82L177 52V112L112 145Z" fill="#f8fbef" stroke="#87a699" strokeWidth="2"/><path d="M144 67V128M112 110L177 80" stroke="#a7c1ae" strokeWidth="3"/><path d="M149 190L233 145L317 188L234 232Z" fill="#acbfa9" opacity=".6"/><path d="M257 103L299 83L361 114L319 136Z" fill="#f8f4e8" stroke="#729484" strokeWidth="2"/><path d="M257 103V139L319 171V136Z" fill="#e4d8c2" stroke="#729484" strokeWidth="2"/><path d="M319 136L361 114V150L319 171Z" fill="#c9bfa8" stroke="#729484" strokeWidth="2"/><path d="M119 157V133L148 119L207 149L232 137L260 151V178L205 207Z" fill="#809e80" stroke="#527966" strokeWidth="2"/><path d="M119 157L146 143L205 174L232 160L260 174L205 204Z" fill="#a7bda1" stroke="#527966" strokeWidth="2"/><path d="M146 120V143M207 149V174M232 137V160M205 174V204" stroke="#527966" strokeWidth="2"/><path d="M225 195L258 178L289 194L255 212Z" fill="#f8f3e6" stroke="#729484" strokeWidth="2"/><path d="M236 201V218M278 201V216" stroke="#729484" strokeWidth="3"/><path d="M348 172V145" stroke="#537c62" strokeWidth="4"/><path d="M338 170L357 170L354 188L342 188Z" fill="#ca9979"/><ellipse cx="337" cy="145" rx="9" ry="19" fill="#658c69" transform="rotate(-29 337 145)"/><ellipse cx="355" cy="134" rx="10" ry="21" fill="#769e74" transform="rotate(23 355 134)"/><path d="M100 180V205L123 217M310 227L335 213V189M85 84V63L109 52M370 83L390 93V114" stroke="#396a54" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function Modal({ title, children, onClose }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
}) {
    const { t: translate } = useLanguage();
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null, old = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        root.current?.focus();
        function key(e: KeyboardEvent) {
            if (e.key === "Escape")
                onClose();
            if (e.key === "Tab") {
                const items = root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]');
                if (!items?.length)
                    return;
                const first = items[0], last = items[items.length - 1];
                if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) {
                    e.preventDefault();
                    last.focus();
                }
                else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
        document.addEventListener("keydown", key);
        return () => { document.body.style.overflow = old; document.removeEventListener("keydown", key); previous?.focus(); };
    }, [onClose]);
    return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget)
        onClose(); }}><div className="modal" ref={root} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}><div className="modal-heading"><h2 id="modal-title">{translate(title)}</h2><button className="icon-button" onClick={onClose} aria-label={translate("Close dialog")}><X size={20}/></button></div>{children}</div></div>;
}
export default function RoomLibrary({ displayName, initialView = "home", guest = false }: {
    displayName: string;
    initialView?: string;
    guest?: boolean;
}) {
    const { t: translate } = useLanguage();
    const [view, setView] = useState(initialView), [rooms, setRooms] = useState<Room[]>([]), [loading, setLoading] = useState(true);
    const [hasUnsaved, setHasUnsaved] = useState(false);
    const [tourOpen, setTourOpen] = useState(false);
    const tourOrigin = useRef<{
        view: string;
        roomId?: string;
        mediaId?: string;
    }>({ view: initialView });
    const appScope = useRef<HTMLDivElement>(null);
    useCardTilt(appScope);
    const [detail, setDetail] = useState<Detail | null>(null), [selected, setSelected] = useState<Media | null>(null), [report, setReport] = useState<Report | null>(null);
    const [query, setQuery] = useState(""), [filter, setFilter] = useState("All rooms"), [list, setList] = useState(false);
    const [suggestedApiUrl, setSuggestedApiUrl] = useState("");
    const [apiUrl, setApiUrl] = useState(""), [urlDraft, setUrlDraft] = useState(""), [connected, setConnected] = useState(false);
    const [modal, setModal] = useState<"new" | "edit" | "help" | null>(null), [draft, setDraft] = useState<Draft>(newDraft);
    const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
    const [sample, setSample] = useState(0), [reportLoading, setReportLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null), requestSequence = useRef(0), reportSequence = useRef(0);
    const closeModal = useCallback(() => setModal(null), []);
    const showError = (e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    const refresh = useCallback(async () => setRooms(await api<Room[]>("/rooms")), []);
    const tourNavigate = useCallback((next: string) => { ++requestSequence.current; ++reportSequence.current; setDetail(null); setSelected(null); setReport(null); setView(next); window.history.replaceState({}, "", next === "home" ? "/" : `/${next}`); }, []);
    useEffect(() => { let seen = false; try {
        seen = !!localStorage.getItem(TOUR_STORAGE_KEY);
    }
    catch { } if (!seen)
        setTourOpen(true); }, []);
    useEffect(() => { Promise.all([api<Room[]>("/rooms"), api<{
            apiUrl: string;
            apiConfigured?: boolean;
            suggestedApiUrl?: string;
        }>("/settings")]).then(async ([rows, s]) => { setRooms(rows); setSuggestedApiUrl(s.suggestedApiUrl || ""); setApiUrl(s.apiUrl); setUrlDraft(s.apiUrl); setConnected(!!s.apiUrl || !!s.apiConfigured); const query = new URLSearchParams(window.location.search); const room = query.get("room"); if (room && window.location.pathname === "/library") {
        const mediaId = query.get("media") || undefined;
        tourOrigin.current = { view: "library", roomId: room, mediaId };
        await openRoom(room, mediaId);
    } }).catch(showError).finally(() => setLoading(false)); }, []);
    useEffect(() => { if (notice) {
        const t = setTimeout(() => setNotice(""), 6000);
        return () => clearTimeout(t);
    } }, [notice]);
    useEffect(() => {
        const roomId = detail?.id;
        const update = () => {
            if (document.hidden || busy || hasUnsaved)
                return;
            void refresh().catch(showError);
            if (roomId)
                void api<Detail>(`/rooms/${roomId}`).then(next => setDetail(current => current?.id === roomId ? next : current)).catch(showError);
        };
        window.addEventListener("focus", update);
        document.addEventListener("visibilitychange", update);
        return () => { window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
    }, [detail?.id, busy, hasUnsaved, refresh]);
    useEffect(() => { const back = () => { if (hasUnsaved && !window.confirm("Leave this step without saving changes?")) {
        window.history.pushState({}, "", view === "home" ? "/" : `/${view}`);
        return;
    } ++requestSequence.current; ++reportSequence.current; setDetail(null); setSelected(null); setReport(null); setView(window.location.pathname.slice(1) || "home"); setError(""); }; window.addEventListener("popstate", back); return () => window.removeEventListener("popstate", back); }, [hasUnsaved, view]);
    async function selectFile(media: Media | null) {
        const seq = ++reportSequence.current;
        setSelected(media);
        setReport(null);
        setSample(0);
        setReportLoading(!!media?.analyzed_at);
        if (media?.analyzed_at) {
            try {
                const data = await api<Report>(`/media/${media.id}/report`);
                if (seq === reportSequence.current)
                    setReport(data);
            }
            catch (e) {
                if (seq === reportSequence.current)
                    showError(e);
            }
            finally {
                if (seq === reportSequence.current)
                    setReportLoading(false);
            }
        }
    }
    async function openRoom(id: string, mediaId?: string) {
        const seq = ++requestSequence.current;
        setLoading(true);
        try {
            const room = await api<Detail>(`/rooms/${id}`);
            if (seq !== requestSequence.current)
                return;
            setDetail(room);
            setView("library");
            window.history.pushState({}, "", "/library");
            await selectFile(room.media.find(m => m.id === mediaId) || room.media[0] || null);
        }
        catch (e) {
            showError(e);
        }
        finally {
            if (seq === requestSequence.current)
                setLoading(false);
        }
    }
    function navigate(next: string) { if (hasUnsaved && !window.confirm("Leave this step without saving changes?"))
        return; if (next === "checklist") {
        window.location.assign("/checklist");
        return;
    } ++requestSequence.current; ++reportSequence.current; setLoading(false); setDetail(null); setSelected(null); setReport(null); setView(next); setError(""); window.history.pushState({}, "", next === "home" ? "/" : `/${next}`); }
    function launchTour() { if (busy || modal)
        return; if (hasUnsaved && !window.confirm("Leave your safety review without saving changes to start the tour?"))
        return; tourOrigin.current = { view, roomId: detail?.id, mediaId: selected?.id }; setTourOpen(true); }
    function closeTour(status: "done" | "skipped", destination?: string) { setTourOpen(false); try {
        localStorage.setItem(TOUR_STORAGE_KEY, status);
    }
    catch { } if (!destination && tourOrigin.current.roomId) {
        void openRoom(tourOrigin.current.roomId, tourOrigin.current.mediaId);
        return;
    } tourNavigate(destination || tourOrigin.current.view); if (status === "done" && destination === "library" && !rooms.length)
        openNew(); }
    function openNew() { setDraft(newDraft()); setModal("new"); setError(""); }
    function editRoom() { if (detail) {
        setDraft({ name: detail.name, type: detail.type, location: detail.location, area: detail.area?.toString() || "", notes: detail.notes, checklist: JSON.parse(detail.checklist) });
        setModal("edit");
    } }
    async function saveRoom(e: FormEvent) {
        e.preventDefault();
        setBusy("Saving room…");
        setError("");
        try {
            const id = modal === "edit" ? detail!.id : null;
            const result = await api<{
                id: string;
            }>(id ? `/rooms/${id}` : "/rooms", { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
            setModal(null);
            await refresh();
            await openRoom(id || result.id);
            setNotice(id ? "Room details saved." : "Take a photo");
        }
        catch (e) {
            showError(e);
        }
        finally {
            setBusy("");
        }
    }
    async function upload(files: FileList | File[], roomId = detail?.id) {
        if (!roomId || busy)
            return;
        const items = Array.from(files);
        if (!items.length)
            return;
        setError("");
        let saved = 0, lastId: string | undefined;
        try {
            for (const f of items) {
                const limit = MIME_LIMITS[f.type];
                if (!limit)
                    throw new Error(`${f.name}: choose JPG, PNG, WebP, MP4, WebM, MOV or AVI.`);
                if (!f.size || f.size > limit)
                    throw new Error(`${f.name}: photos must be under 12 MB and videos under 25 MB.`);
                setBusy(`Uploading ${saved + 1} of ${items.length}: ${f.name}`);
                const result = await api<{
                    id: string;
                }>(`/rooms/${roomId}/media?name=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": f.type }, body: f });
                lastId = result.id;
                saved++;
            }
            setNotice(`${saved} ${saved === 1 ? "file" : "files"} saved to your room.`);
        }
        catch (e) {
            showError(e);
            if (saved)
                setNotice(`${saved} files saved before upload stopped. Retry the remaining files.`);
        }
        finally {
            setBusy("");
            if (saved) {
                await refresh().catch(showError);
                await openRoom(roomId, lastId);
            }
            if (inputRef.current)
                inputRef.current.value = "";
        }
    }
    async function analyze() {
        if (!selected || !detail || busy)
            return;
        if (!connected) {
            navigate("settings");
            return;
        }
        setBusy(selected.type.startsWith("video/") ? "Capturing 3 frames and analyzing. This may take a few minutes…" : "Finding items…");
        setError("");
        try {
            const body = selected.type.startsWith("video/") ? await videoFrames(selected.id) : undefined;
            const result = await api<Report>(`/media/${selected.id}/analyze`, { method: "POST", body });
            setReport(result);
            setSample(0);
            setSelected({ ...selected, analyzed_at: result.analyzedAt });
            setDetail({ ...detail, media: detail.media.map(m => m.id === selected.id ? { ...m, analyzed_at: result.analyzedAt } : m) });
            await refresh();
            setNotice("Saved");
        }
        catch (e) {
            showError(e);
        }
        finally {
            setBusy("");
        }
    }
    async function deleteFile() {
        if (!selected || !detail || !window.confirm(`Delete “${selected.name}” and its report? This cannot be undone.`))
            return;
        setBusy("Removing file…");
        setError("");
        try {
            await api(`/media/${selected.id}`, { method: "DELETE" });
            await refresh();
            await openRoom(detail.id);
            setNotice("File removed.");
        }
        catch (e) {
            showError(e);
        }
        finally {
            setBusy("");
        }
    }
    async function saveSettings(e: FormEvent) {
        e.preventDefault();
        setBusy("Checking API connection…");
        setError("");
        try {
            const d = await api<{
                apiUrl: string;
            }>("/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiUrl: urlDraft.trim() }) });
            setApiUrl(d.apiUrl);
            setUrlDraft(d.apiUrl);
            setConnected(!!d.apiUrl);
            setNotice(d.apiUrl ? "API connected and health check passed." : "API disconnected. Your rooms and reports are still saved.");
        }
        catch (e) {
            showError(e);
        }
        finally {
            setBusy("");
        }
    }
    function downloadReport() {
        if (!report || !selected || !detail)
            return;
        const reportData = JSON.stringify({ room: { name: detail.name, type: detail.type, location: detail.location, area: detail.area, notes: detail.notes, manual_checks: JSON.parse(detail.checklist) }, filename: selected.name, ...report }, null, 2);
        const filename = `${detail.name.replace(/[^a-z0-9_-]/gi, "-")}-report.json`;
        if (saveNativeReport(filename, reportData)) return;
        const blob = new Blob([reportData], { type: "application/json" });
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url;
        a.download = `${detail.name.replace(/[^a-z0-9_-]/gi, "-")}-report.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const visible = rooms.filter(r => (filter === "All rooms" || r.type === filter) && `${r.name} ${r.location} ${r.type} ${r.notes}`.toLowerCase().includes(query.toLowerCase()));
    const fileCount = rooms.reduce((s, r) => s + r.media_count, 0), reportCount = rooms.reduce((s, r) => s + r.report_count, 0), result = report?.samples[sample]?.result;
    const analysis = result?.analysis || result?.claude || result?.gemini || {};
    const model = result?.models?.vision_reasoning || "";
    const provider = model.includes("gemini") ? "Gemini" : model.includes("claude") || result?.analysis || result?.claude ? "Claude" : "Vision model";
    return <div className="app-shell" ref={appScope}><MobileNavigation view={view} onNavigate={navigate} onHelp={launchTour} disabled={!!busy}/><aside className="sidebar"><a className="brand" href="/" aria-label={translate("Kaki Kita AI home")} onClick={e => { e.preventDefault(); navigate("home"); }}><span className="brand-mark"><ScanLine size={24}/></span><span>Kaki Kita<span className="brand-light"> AI</span><small>BY PROJECT KITA</small></span></a><div className="workspace-label">{translate("YOUR WORKSPACE")}</div><nav aria-label={translate("Main navigation")}>{[["home", "Home", Home, null], ["checklist", "My tasks", CheckCheck, null], ["library", "My rooms", FolderOpen, rooms.length], ["vision", "Check room", ScanLine, null], ["watch", "Watch", Film, null], ["safety", "Room checks", ShieldCheck, null], ["kopi", "Community help", Coffee, null], ["reports", "Reports", FileText, reportCount], ["about", "About", Users, null], ["settings", "Settings", Settings2, null]].map(([v, title, Icon, count]) => { const I = Icon as typeof FolderOpen; return <button key={String(v)} disabled={!!busy} className={view === v ? "nav-item active" : "nav-item"} onClick={() => navigate(String(v))} aria-label={translate(String(title))}><I size={19}/>{translate(String(title))}{count !== null && <span>{translate(String(count))}</span>}</button>; })}</nav><div className="sidebar-bottom"><CalmMode/><button className="nav-item" onClick={launchTour} disabled={!!busy} aria-label={translate("Help")}><CircleHelp size={18}/>{translate(" Guided tour")}</button><div className="profile"><span className="avatar">{displayName[0]?.toUpperCase()}</span><span className="profile-name">{guest ? translate("My workspace") : translate("My workspace")}<small>{guest ? translate("Photos + tasks") : translate("Private · Only you")}</small></span><ShieldCheck size={17}/></div></div></aside>
  <div className="main-wrap"><header className="topbar"><a className="mobile-brand" href="/" onClick={event=>{event.preventDefault();navigate("home");}}><BuddyArt/><span>Kaki Kita <span className="brand-ai-suffix">AI</span></span></a><div className="breadcrumb"><BuddyArt/>{translate("Workspace ")}<ChevronRight size={14}/><strong>{detail ? detail.name : ({ home: "Home", vision: "Check room", watch: "Watch", safety: "Room checks", kopi: "Community help", library: "My rooms", reports: "Reports", about: "About", settings: "Settings" } as Record<string, string>)[view]}</strong></div><div className="topbar-right"><LanguagePicker /><button className="tour-trigger" onClick={launchTour} disabled={!!busy} aria-label={translate("Start guided tour")}><CircleHelp size={15}/><span>{translate("Guided tour")}</span></button><span className="private-label"><ShieldCheck size={14}/> {guest ? translate("My workspace") : translate("My workspace")}</span><span className="avatar small">{displayName[0]?.toUpperCase()}</span></div></header><main>
  {guest && <div className="shared-workspace-note"><CheckCheck size={19}/><div><strong>{translate("Photos and tasks stay together.")}</strong><p>{translate("Use the same browser to keep your photos and tasks together.")}</p></div><a href="/checklist">{translate("Open Kita Clear ")}<ArrowRight size={15}/></a></div>}
  {error && <div className="alert error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label={translate("Dismiss error")}><X size={16}/></button></div>}{notice && <div className="alert success" role="status"><Check size={17}/><span>{notice}</span><button onClick={() => setNotice("")} aria-label={translate("Dismiss notification")}><X size={16}/></button></div>}{busy && <div className="alert progress" role="status"><LoaderCircle className="spin" size={18}/><span>{busy}</span></div>}
  {["home", "vision", "watch", "safety", "kopi", "about"].includes(view) && <ProjectPages key={view} view={view} rooms={rooms} connected={connected} busy={!!busy} onNavigate={navigate} onCreate={openNew} onUpload={upload} onOpen={openRoom} onSaved={refresh} onWorking={setBusy} onDirty={setHasUnsaved} onTour={launchTour} fileCount={fileCount} reportCount={reportCount}/>}
  {view === "library" && !detail && <><div className="page-heading"><div><div className="eyebrow">{translate("MY ROOMS")}</div><h1>{translate("My rooms")}<span>{translate(".")}</span></h1><p>{translate("Photos and tasks for each room.")}</p></div><button data-tour="room-create" className="button primary" onClick={openNew} disabled={!!busy}><Plus size={18}/>{translate(" Add a room")}</button></div><div className="stats">{[[rooms.length, "Rooms in your library", DoorOpen], [fileCount, "Photos & videos saved", ImageIcon], [reportCount, "Reports", ScanLine]].map(([n, label, Icon]) => { const I = Icon as typeof DoorOpen; return <div key={String(label)}><span className="stat-icon"><I size={21}/></span><span><strong>{String(n).padStart(2, "0")}</strong><small>{translate(String(label))}</small></span></div>; })}<div className="storage-stat"><ShieldCheck size={22}/><span><strong>{translate("Saved")}</strong><small>{translate("Stored in your private workspace")}</small></span></div></div><section><div className="section-heading"><div className="title-count"><h2>{translate("My rooms")}</h2><span>{rooms.length}</span></div><div className="view-toggle"><button className={!list ? "selected" : ""} onClick={() => setList(false)} aria-label={translate("Grid view")} aria-pressed={!list}><Grid2X2 size={17}/></button><button className={list ? "selected" : ""} onClick={() => setList(true)} aria-label={translate("List view")} aria-pressed={list}><LayoutList size={18}/></button></div></div><div className="toolbar"><label className="search"><Search size={18}/><input aria-label={translate("Search rooms")} placeholder={translate("Search rooms, locations, or notes\u2026")} value={query} onChange={e => setQuery(e.target.value)}/></label><label className="filter"><SlidersHorizontal size={16}/><select aria-label={translate("Filter by room type")} value={filter} onChange={e => setFilter(e.target.value)}>{["All rooms", ...TYPES].map(t => <option key={t} value={t}>{translate(t)}</option>)}</select></label></div>{loading ? <div className="loading"><LoaderCircle className="spin" size={24}/>{translate(" Loading\u2026")}</div> : <div className={list ? "rooms-grid list" : "rooms-grid"}>{visible.map(r => <button key={r.id} className="room-card tilt-card" data-tilt onClick={() => openRoom(r.id)}><div className="room-cover">{r.cover_id ? <img src={fileUrl(r.cover_id)} alt={translate(`Photo of ${r.name}`)} loading="lazy"/> : <RoomArt />}<span className="room-type">{r.type}</span></div><div className="room-card-body"><div className="room-card-title"><h3>{r.name}</h3><ArrowRight size={18}/></div><p><MapPin size={13}/>{r.location || translate("Location not added")}</p><div className="room-card-meta"><span><ImageIcon size={13}/>{r.media_count}{translate(" files")}</span><span><ScanLine size={13}/>{r.report_count ? translate(`${r.report_count} analyzed`) : translate("Not analyzed")}</span></div></div></button>)}{!query && filter === "All rooms" && <button className="add-room-card" onClick={openNew}><span className="add-circle"><Plus size={24}/></span><strong>{rooms.length ? translate("Add a room") : translate("Add a room")}</strong><p>{translate("Add a room, then upload photos")}<br />{translate("or a video to get the full picture.")}</p><span className="add-link">{translate("Add a new room ")}<ArrowRight size={15}/></span></button>}{!visible.length && (query || filter !== "All rooms") && <div className="no-results"><Search size={26}/><h3>{translate("No rooms match your search")}</h3><p>{translate("Try another name, location, or room type.")}</p><button className="text-button" onClick={() => { setQuery(""); setFilter("All rooms"); }}>{translate("Clear filters ")}<ArrowRight size={15}/></button></div>}</div>}</section><div className="bottom-note"><span><ShieldCheck size={16}/>{translate(" A private place for a clearer perspective.")}</span><button onClick={() => navigate("settings")}><i className={connected ? "status-dot on" : "status-dot"}/>{connected ? translate("AI API configured") : translate("Connect your AI engine")}<ChevronRight size={15}/></button></div></>}
  {view === "library" && detail && <><button className="back-button" disabled={!!busy} onClick={() => navigate("library")}><ArrowLeft size={16}/>{translate(" My rooms")}</button><div className="page-heading"><div><div className="eyebrow">{detail.type.toUpperCase()}</div><h1>{detail.name}</h1><p><MapPin size={14}/> {detail.location || translate("No location added")}{detail.area ? translate(` · ${detail.area} m²`) : ""}</p></div><button className="button secondary" disabled={!!busy} onClick={editRoom}><Settings2 size={16}/>{translate(" Edit room details")}</button></div><div className="detail-grid"><div><section className="panel"><div className="panel-heading"><h2>{translate("Photos & videos ")}<span className="count">{detail.media.length}</span></h2><button className="text-button" disabled={!!busy} onClick={() => inputRef.current?.click()}><Plus size={16}/>{translate(" Add files")}</button></div><input type="file" multiple ref={inputRef} className="sr-only" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-msvideo,.mov,.avi" aria-label={translate("Upload room photos and videos")} onChange={e => e.target.files && upload(e.target.files)} disabled={!!busy}/>{selected ? <>{selected.type.startsWith("video/") ? <div className="media-viewer"><video key={selected.id} controls preload="metadata" src={fileUrl(selected.id)} aria-label={selected.name}/></div> : <div className="media-viewer"><img src={fileUrl(selected.id)} alt={selected.name}/></div>}<div className="media-caption"><span>{selected.name}<small>{sizeLabel(selected.size)}{translate(" \u00B7 Added ")}{dateLabel(selected.created_at)}</small></span><button className="icon-button danger" aria-label={translate("Delete selected file")} onClick={deleteFile} disabled={!!busy}><Trash2 size={17}/></button></div><div className="media-strip">{detail.media.map(m => <button disabled={!!busy} key={m.id} className={selected.id === m.id ? "thumb selected" : "thumb"} onClick={() => selectFile(m)} aria-label={translate(`View ${m.name}`)} aria-pressed={selected.id === m.id}>{m.type.startsWith("image/") ? <img src={fileUrl(m.id)} alt={translate("")}/> : <Film size={24}/>}{m.analyzed_at && <span><Check size={10}/></span>}</button>)}<button className="thumb" disabled={!!busy} onClick={() => inputRef.current?.click()} aria-label={translate("Add more files")}><Plus size={22}/></button></div></> : <button className="upload-zone" disabled={!!busy} onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }}><span className="add-circle"><Upload size={27}/></span><h3>{translate("Choose a photo")}</h3><p>{translate("Drop photos or videos here, or click to browse.")}</p><small>{translate("JPG, PNG, WebP up to 12 MB \u00B7 MP4, WebM, MOV, AVI up to 25 MB")}</small><span className="button secondary">{translate("Choose files ")}<ImagePlus size={16}/></span></button>}{selected && <button className="drop-more" disabled={!!busy} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()}><Upload size={15}/>{translate(" Drop more files here, or browse")}</button>}</section>
  {selected && <RemovalProgress key={selected.id} mediaId={selected.id} analyzed={!!selected.analyzed_at}/>}
  {report && result && <EasyRoomPoints analysis={analysis} detections={result.yolo.detections}/>}<details className="ai-details"><summary>{translate("More information")}</summary>  <section className="panel"><div className="panel-heading"><h2><Sparkles size={19}/>{translate(" Room insights")}</h2>{report && selected && <a className="text-button" href={`/checklist?media=${encodeURIComponent(selected.id)}`}><CheckCheck size={16}/>{translate(" My tasks")}</a>}{report && <button className="text-button" onClick={downloadReport}><ArrowDownToLine size={16}/>{translate(" Export JSON")}</button>}</div>{!selected ? <div className="report-empty"><ScanLine size={30}/><h3>{translate("A new perspective is one upload away.")}</h3><p>{translate("Add a photo or video to create your room report.")}</p></div> : <><div className="analysis-action"><div><strong>{report ? translate("Saved report") : translate("Check room")}</strong><p>{selected.type.startsWith("video/") ? translate("Checks 3 frames at 10%, 50%, and 90% of the video.") : translate("Object detection and contextual room interpretation.")}</p></div><button className="button primary" disabled={!!busy || reportLoading} onClick={analyze}><ScanLine size={17}/>{!connected ? translate("Connect AI engine") : report ? translate("Analyze again") : selected.type.startsWith("video/") ? translate("Check video") : translate("Find items")}</button></div>{reportLoading && <div className="loading"><LoaderCircle size={20} className="spin"/>{translate(" Loading saved report\u2026")}</div>}{report && result && <><div className="report-date"><CheckCheck size={14}/>{translate("Saved ")}{dateLabel(report.analyzedAt)}{report.kind === "video" && translate(" · Sampled frames only. Audio and unsampled moments are not checked.")}</div>{report.samples.length > 1 && <div className="sample-tabs" aria-label={translate("Video frame reports")}>{report.samples.map((s, i) => <button key={i} className={sample === i ? "selected" : ""} onClick={() => setSample(i)}>{translate("Frame ")}{i + 1}{translate(" \u00B7 ")}{s.seconds?.toFixed(1)}{translate("s")}</button>)}</div>}<div className="summary-block"><span className="eyebrow">{provider.toUpperCase()}{translate(" \u00B7 ROOM UNDERSTANDING")}{model ? translate(` · ${model}`) : ""}</span><h3>{translate(String(analysis.environment || "Room interpretation"))}</h3><p>{translate(String(analysis.overall_summary || "No summary returned."))}</p></div><div className="observations">{[["visible_observations", "Visible observations"], ["potential_obstacles", "Potential obstacles"], ["accessibility_concerns", "Accessibility considerations"], ["recommendations", "Practical recommendations"], ["limitations", "What the image cannot tell us"]].map(([key, label]) => <div key={key}><h4>{translate(label)}</h4>{Array.isArray(analysis[key]) && (analysis[key] as unknown[]).length ? <ul>{(analysis[key] as unknown[]).map((item, i) => <li key={i}>{translate(String(item))}</li>)}</ul> : <p className="muted">{translate("No items reported by the model.")}</p>}</div>)}</div><div className="detection-block"><span className="eyebrow">{translate("YOLO \u00B7 OBJECT DETECTION")}</span><h3>{translate("Objects in view ")}<span className="count">{result.yolo.detections.length}</span></h3>{result.yolo.annotated_image_base64 && <img className="annotated-image" src={`data:image/jpeg;base64,${result.yolo.annotated_image_base64}`} alt={translate("Room with YOLO detected object boxes")}/>}<div className="detection-tags">{result.yolo.detections.map((d, i) => <span key={i}>{translate(d.label)} <strong>{(d.confidence_percent ?? d.confidence * 100).toFixed(1)}{translate("%")}</strong></span>)}{!result.yolo.detections.length && <p>{translate("No objects detected by YOLO.")}</p>}</div><p className="fine-print">{translate("Percentages describe YOLO object confidence. They do not measure accessibility or confidence in the vision model\u2019s conclusions.")}</p></div><p className="disclaimer"><ShieldCheck size={17}/>{result.disclaimer || translate("AI-generated visual interpretation may be incomplete or incorrect. This is not a certified accessibility audit or a guarantee of safety.")}</p></>}{!report && !reportLoading && <div className="insight-placeholder"><div><ImageIcon size={18}/>{translate("Visible observations")}</div><div><ScanLine size={18}/>{translate("Objects & possible obstacles")}</div><div><Sparkles size={18}/>{translate("Practical recommendations")}</div><p>{connected ? translate("Run an analysis to see findings from your actual file.") : translate("Your media is saved. Connect your running Kita Vision API in Settings to generate a report.")}</p></div>}</>}</section></details></div>
  <aside className="detail-side"><section className="panel"><div className="panel-heading"><h2>{translate("Room information")}</h2></div><dl><dt>{translate("Room type")}</dt><dd>{detail.type}</dd><dt>{translate("Location")}</dt><dd>{detail.location || translate("Not added")}</dd><dt>{translate("Floor area")}</dt><dd>{detail.area ? translate(`${detail.area} m²`) : translate("Not measured")}</dd><dt>{translate("Created")}</dt><dd>{dateLabel(detail.created_at)}</dd></dl><h4>{translate("Notes & description")}</h4><p className="notes">{detail.notes || translate("Add a description, measurements, or things you want to check.")}</p></section><section className="panel"><div className="panel-heading"><h2>{translate("Your room checks")}</h2></div><p className="side-description">{translate("Your own observations, kept separate from AI findings.")}</p><div className="manual-checks">{CHECKS.map((c, i) => { const status = JSON.parse(detail.checklist)[i]; return <div key={c}><span>{translate(c)}</span><small className={status === "Looks clear" ? "check-clear" : status === "Needs review" ? "check-review" : ""}>{status}</small></div>; })}</div><button className="text-button" disabled={!!busy} onClick={editRoom}>{translate("Update room checks ")}<ArrowRight size={14}/></button></section><div className="privacy-note"><ShieldCheck size={21}/><strong>{translate("Made for a careful first look.")}</strong><p>{translate("Photos cannot establish exact dimensions, full access, or safety. Confirm important findings with an on-site assessment.")}</p></div></aside></div></>}
  {view === "reports" && <><div className="page-heading"><div><div className="eyebrow">{translate("REPORTS")}</div><h1>{translate("Analysis reports")}<span>{translate(".")}</span></h1><p>{translate("Revisit the insights saved with your room photos and videos.")}</p></div></div><section className="panel" data-tour="reports">{!reportCount ? <div className="report-empty"><FileText size={38}/><h2>{translate("Your first insight is waiting.")}</h2><p>{translate("Add a room, upload a photo or video, then run an AI analysis.")}<br />{translate("Completed reports will appear here.")}</p><button className="button primary" onClick={() => navigate("library")}>{translate("Go to room library ")}<ArrowRight size={16}/></button></div> : rooms.filter(r => r.report_count).map(r => <ReportRoom key={r.id} room={r} onOpen={openRoom}/>)}</section></>}
  {view === "settings" && <><div className="page-heading"><div><div className="eyebrow">{translate("MAKE IT YOURS")}</div><h1>{translate("Workspace settings")}<span>{translate(".")}</span></h1><p>{translate("Connect the intelligence behind your room insights.")}</p></div></div><div className="settings-grid">{guest ? <section className="panel settings-form"><div className="panel-heading"><h2><CheckCheck size={20}/>{translate(" Your shared browser workspace")}</h2></div><p>{translate("Files uploaded in Kita Clear also appear in the main room library. Uploads from the main website can be selected in Kita Clear using Room library.")}</p><p>{translate("The AI connection is managed by the website owner. Your workspace uses the shared engine when it is configured and running.")}</p><p className="connection">{connected ? translate("Shared AI engine configured") : translate("Shared AI engine not configured")}</p><p className="fine-print">{translate("Keep using the same browser and keep this site\u2019s cookies. A different browser or phone starts a separate workspace.")}</p><a className="button primary" href="/checklist"><CheckCheck size={16}/>{translate(" Open Kita Clear")}</a></section> : <form className="panel settings-form" onSubmit={saveSettings}><div className="panel-heading"><h2><Sparkles size={20}/>{translate(" Kita Vision AI engine")}</h2><span className="connection">{connected ? translate("Configured") : translate("Not connected")}</span></div><p>{translate("Connect the running YOLO + Claude FastAPI service from your Kita Vision notebook. Saving runs a health check before using the address.")}</p><label>{translate("API base URL")}<input type="url" placeholder={translate("https://your-tunnel.ngrok-free.app")} value={urlDraft} onChange={e => setUrlDraft(e.target.value)} maxLength={500}/></label><p className="fine-print">{translate("Use the public API URL printed by the notebook\u2019s ngrok cell. A Lovable project link is an editor address and will not work here. Leave blank to disconnect.")}</p><button className="button primary" disabled={!!busy} type="submit"><Check size={16}/>{translate(" Test & save connection")}</button>{suggestedApiUrl && suggestedApiUrl !== urlDraft && <button type="button" className="text-button suggested-api" disabled={!!busy} onClick={() => setUrlDraft(suggestedApiUrl)}>{translate("Use the API from the Lovable website ")}<ArrowRight size={14}/></button>}{apiUrl && <p className="configured-url">{translate("Saved API: ")}{apiUrl}</p>}<div className="settings-divider"/><h3>{translate("From notebook to room insights")}</h3><ol className="setup-steps"><li><span>{translate("1")}</span><div><strong>{translate("Start your notebook")}</strong><p>{translate("Run the model, FastAPI, and ngrok cells. Keep the Colab session active.")}</p></div></li><li><span>{translate("2")}</span><div><strong>{translate("Connect the public API URL")}</strong><p>{translate("Paste the HTTPS address shown as \u201CPublic API URL\u201D above, then test the connection.")}</p></div></li><li><span>{translate("3")}</span><div><strong>{translate("Open a room and analyze a file")}</strong><p>{translate("The website sends your selected photo, or three video frames, to your API. The report is saved here.")}</p></div></li></ol></form>}<aside><section className="privacy-note"><ShieldCheck size={25}/><h3>{translate("Private by default.")}</h3><p>{guest ? translate("Rooms, files, reports and checklist progress share this browser’s private cloud workspace across Kita Clear and the main website.") : translate("Rooms, original files, and reports are saved in cloud storage and linked to your signed-in account.")}</p><p>{translate("Analysis runs when you click Analyze. Your selected photo or sampled frames are sent to your connected API, where Claude processes them.")}</p><p>{translate("Keep Anthropic and ngrok keys in your notebook\u2019s Secrets. This website only needs the API address.")}</p></section><section className="panel"><h3>{translate("Supported uploads")}</h3><p className="supported"><ImageIcon size={18}/>{translate(" JPG, PNG, WebP ")}<strong>{translate("12 MB / file")}</strong></p><p className="supported"><Film size={18}/>{translate(" MP4, WebM, MOV, AVI ")}<strong>{translate("25 MB / file")}</strong></p><p className="fine-print">{translate("Video playback depends on browser codec support. Use H.264 MP4 or WebM. Analysis checks three frames; audio and the full clip are not analyzed.")}</p></section></aside></div></>}
  <footer><span>Kaki Kita<span> AI</span></span><p>{translate("One Team. One Community. One Future.")}</p><small>{translate("PROJECT KITA \u00B7 Hackathon prototype")}</small></footer></main></div>
  {tourOpen && <GuidedTour onNavigate={tourNavigate} onClose={closeTour}/>}
  {(modal === "new" || modal === "edit") && <Modal title={modal === "new" ? translate("Add a room") : translate("Edit room details")} onClose={busy ? () => { } : closeModal}><form onSubmit={saveRoom} className="room-form"><p className="form-intro">{translate("Give the room a name.")}</p><label>{translate("Room name *")}<input autoFocus required maxLength={100} placeholder={translate("e.g. Mum\u2019s living room")} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><details className="care-details"><summary>{translate("More information")}</summary><div><div className="form-row"><label>{translate("Room type")}<select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>{TYPES.map(t => <option key={t} value={t}>{translate(t)}</option>)}</select></label><label>{translate("Floor area (m\u00B2)")}<input type="number" min="0.01" max="100000" step="any" placeholder={translate("Optional")} value={draft.area} onChange={e => setDraft({ ...draft, area: e.target.value })}/></label></div><label>{translate("Location")}<input maxLength={200} placeholder={translate("e.g. Home \u00B7 Level 1")} value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })}/></label><label>{translate("Notes & description")}<textarea rows={3} maxLength={5000} placeholder={translate("Describe the room or things you\u2019d like to check\u2026")} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })}/></label></div></details>{modal === "edit" && <fieldset><legend>{translate("Your room checks")}</legend><p className="fine-print">{translate("Your observations, separate from AI findings.")}</p>{CHECKS.map((c, i) => <label className="check-field" key={c}>{translate(c)}<select value={draft.checklist[i]} onChange={e => setDraft({ ...draft, checklist: draft.checklist.map((x, j) => i === j ? e.target.value : x) })}>{["Not checked", "Looks clear", "Needs review"].map(t => <option key={t} value={t}>{translate(t)}</option>)}</select></label>)}</fieldset>}{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={closeModal} disabled={!!busy}>{translate("Cancel")}</button><button type="submit" className="button primary" disabled={!!busy}>{busy ? <LoaderCircle size={17} className="spin"/> : <Plus size={17}/>}{modal === "new" ? translate("Save") : translate("Save changes")}</button></div></form></Modal>}
  {modal === "help" && <Modal title={translate("A clearer picture, in three steps.")} onClose={closeModal}><div className="help-content"><RoomArt /><ol className="setup-steps"><li><span>{translate("1")}</span><div><strong>{translate("Make a home for your room")}</strong><p>{translate("Add a name, location, room type, and notes or measurements.")}</p></div></li><li><span>{translate("2")}</span><div><strong>{translate("Capture a few perspectives")}</strong><p>{translate("Upload room photos or videos into your private cloud library.")}</p></div></li><li><span>{translate("3")}</span><div><strong>{translate("Look a little closer")}</strong><p>{translate("Connect the notebook API in Settings. YOLO detects objects; Claude describes the scene, possible obstacles, and practical suggestions.")}</p></div></li></ol><p className="disclaimer">{translate("AI insights support a first look. They do not certify accessibility or guarantee safety.")}</p><button className="button primary" onClick={closeModal}>{translate("Got it ")}<Check size={16}/></button></div></Modal>}</div>;
}
function ReportRoom({ room, onOpen }: {
    room: Room;
    onOpen: (id: string, mediaId?: string) => void;
}) {
    const { t: translate } = useLanguage();
    const [files, setFiles] = useState<Media[] | null>(null), [error, setError] = useState("");
    useEffect(() => { api<Detail>(`/rooms/${room.id}`).then(r => setFiles(r.media.filter(m => m.analyzed_at))).catch(e => setError(e.message)); }, [room.id]);
    return <div className="report-room"><h3>{room.name}<span className="count">{room.report_count}</span></h3>{error && <p role="alert">{error}</p>}{files ? files.map(m => <button className="report-row" key={m.id} onClick={() => onOpen(room.id, m.id)}><span className="stat-icon">{m.type.startsWith("video/") ? <Film size={20}/> : <ImageIcon size={20}/>}</span><span><strong>{m.name}</strong><small>{m.analyzed_at && dateLabel(m.analyzed_at)}{translate(" \u00B7 ")}{m.type.startsWith("video/") ? translate("3 video frames") : translate("Photo analysis")}</small></span><span className="report-ready"><CheckCheck size={15}/>{translate(" Saved report")}</span><ArrowRight size={18}/></button>) : !error && <p className="muted">{translate("Loading reports\u2026")}</p>}</div>;
}
