"use client";
import { useLanguage } from "./language-provider";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowRight, Building2, Camera, Check, CheckCheck, CircleHelp, Coffee, Database, ExternalLink, Eye, Film, HeartHandshake, ImagePlus, LoaderCircle, MapPin, Plus, Printer, RotateCcw, ScanLine, Search, ShieldCheck, Sparkles, Upload, Users, Wifi } from "lucide-react";
import { callApi as api } from "@/lib/client-api";
import { DATA_SOURCES, type CommunityService } from "@/lib/community";
import GettingStarted from "./getting-started";
import CaregiverHome from "./caregiver-home";
import CaptureGuide from "./capture-guide";
import LiveCameraGuide from "./live-camera-guide";
import { printPage } from "@/lib/native-app";
import { emptySafety, SAFETY_CHECKS, SAFETY_STATUSES, type SafetyItem } from "@/lib/safety";
type Room = {
    id: string;
    name: string;
    location: string;
};
type Props = {
    view: string;
    rooms: Room[];
    connected: boolean;
    busy: boolean;
    onNavigate: (view: string) => void;
    onCreate: () => void;
    onUpload: (files: FileList | File[], roomId: string) => void;
    onOpen: (id: string, mediaId?: string) => void;
    onSaved: () => Promise<void>;
    onWorking: (message: string) => void;
    onDirty: (dirty: boolean) => void;
    onTour: () => void;
    fileCount: number;
    reportCount: number;
};
const features = [
    { view: "vision", icon: Eye, label: "Kita Vision", title: "See what’s around you.", text: "Upload a photo or take one on your phone. YOLO recognises objects and Claude adds context for a careful human review.", cta: "Explore photo analysis", number: "01" },
    { view: "watch", icon: Film, label: "Kita Watch", title: "A few frames. A fuller view.", text: "Choose a video, or use the Android app for live camera checks.", cta: "Review a video", number: "02" },
    { view: "safety", icon: ShieldCheck, label: "Kita Safety", title: "Awareness starts with us.", text: "Walk through a space, record six practical checks, and keep notes on anything that needs a second look.", cta: "Open safety checklist", number: "03" },
    { view: "kopi", icon: Coffee, label: "Kaki Kopi", title: "Good connections start here.", text: "Find Singapore social service agencies and eldercare services using official government open data.", cta: "Find community support", number: "04" },
];
const date = (d: string) => new Date(d).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
function Heading({ eyebrow, title, text }: {
    eyebrow: string;
    title: string;
    text: string;
}) { const { t: translate } = useLanguage(); return <div className="page-heading project-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{translate(title)}<span>{translate(".")}</span></h1><p>{translate(text)}</p></div></div>; }
export default function ProjectPages(props: Props) {
    const { t: translate } = useLanguage();
    if (props.view === "home")
        return <CaregiverHome onNavigate={props.onNavigate}/>;
    if (props.view === "vision" || props.view === "watch")
        return <CapturePage {...props}/>;
    if (props.view === "safety")
        return <SafetyPage {...props}/>;
    if (props.view === "kopi")
        return <DirectoryPage />;
    if (props.view === "about")
        return <><Heading eyebrow="ABOUT PROJECT KITA" title={translate("One team. A shared purpose")} text="Accessible AI tools and trusted public information, brought together to support environmental awareness and community connection."/><section className="about-intro panel"><HeartHandshake size={35}/><div><span className="eyebrow">{translate("KAKI KITA AI \u00B7 BY PROJECT KITA")}</span><h2>{translate("Your AI Kaki. Looking Out for All of Us.")}</h2><p>{translate("Built for the Kaplan AI for Impact Hackathon, Kaki Kita AI helps you notice what is around you, record your own observations, and discover community services. The judgement stays with people.")}</p></div></section><div className="project-section-heading"><div><span className="eyebrow">{translate("THE TEAM")}</span><h2>{translate("One Team. One Community. One Future.")}</h2></div></div><div className="team-grid">{[["Arya", "Team Leader"], ["Jonathan", "Communications"], ["Niko", "Software Engineer"], ["Adie", "Software Engineer"], ["Asami", "Website Developer"]].map(([name, role]) => <div className="team-card tilt-card" data-tilt key={name}><span>{name[0]}</span><h3>{name}</h3><p>{role}</p></div>)}</div><section className="panel responsible-panel"><h2><ShieldCheck size={21}/>{translate(" People in the loop. Always.")}</h2><div className="responsible-grid"><div><h3>{translate("AI is a prompt to look closer.")}</h3><p>{translate("Object detection can miss or misidentify objects. A detected object is not automatically a hazard. One photograph cannot establish access, measurements, or safety.")}</p></div><div><h3>{translate("Human review makes the difference.")}</h3><p>{translate("Kita Safety records your observations and follow-up. It is not a professional safety inspection, medical assessment, or certification.")}</p></div><div><h3>{translate("Handle images with care.")}</h3><p>{translate("Only upload media you have permission to share. Analysis sends the selected photo or three video frames to your configured Python API, where Claude processes them.")}</p></div><div><h3>{translate("Support starts with good information.")}</h3><p>{translate("Community listings come from MSF and MOH datasets or your uploaded notebook GeoJSON. Confirm contact details, eligibility, and availability with the provider.")}</p></div></div><p className="disclaimer">{translate("Photo and video checks start when you choose. Live camera analysis runs in the Android app while its camera screen is open.")}</p></section><DataSources /></>;
    return null;
}
function CapturePage(props: Props) {
    const {t}=useLanguage();
    const [live,setLive]=useState(props.view==="watch"),[dirty,setDirty]=useState(false);
    const onDirty=useCallback((value:boolean)=>{setDirty(value);props.onDirty(value);},[props.onDirty]);
    const isWatch=props.view==="watch";
    return <>{isWatch&&<div className="watch-mode" role="group" aria-label={t("Video source")}><button type="button" aria-pressed={live} disabled={props.busy||dirty} onClick={()=>setLive(true)}><Camera size={20}/>{t("Live camera")}</button><button type="button" aria-pressed={!live} disabled={props.busy||dirty} onClick={()=>setLive(false)}><Film size={20}/>{t("Choose a video")}</button></div>}{isWatch&&live?<LiveCameraGuide/>:<CaptureGuide video={isWatch} rooms={props.rooms} connected={props.connected} onWorking={props.onWorking} onDirty={onDirty} onSaved={props.onSaved} onOpen={props.onOpen} onNavigate={props.onNavigate}/>}</>;
}

type Review = {
    roomId: string | null;
    location: string;
    checks: SafetyItem[];
    updatedAt: string | null;
};
function SafetyPage(props: Props) {
    const { t: translate } = useLanguage();
    const [scope, setScope] = useState(""), [review, setReview] = useState<Review>({ roomId: null, location: "", checks: emptySafety(), updatedAt: null }), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [dirty, setDirty] = useState(false), [error, setError] = useState("");
    useEffect(() => { let active = true; setLoading(true); setError(""); setReview({ roomId: scope || null, location: "", checks: emptySafety(), updatedAt: null }); api<Review>(`/safety${scope ? `?room=${encodeURIComponent(scope)}` : ""}`).then(data => { if (active) {
        setReview(data);
        setDirty(false);
    } }).catch(e => { if (active)
        setError(e.message); }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, [scope]);
    useEffect(() => { props.onDirty(dirty); return () => props.onDirty(false); }, [dirty, props.onDirty]);
    useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (dirty) {
        e.preventDefault();
        e.returnValue = "";
    } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
    function update(index: number, value: Partial<SafetyItem>) { setReview({ ...review, checks: review.checks.map((c, i) => i === index ? { ...c, ...value } : c) }); setDirty(true); }
    async function save() { setSaving(true); setError(""); try {
        const data = await api<Review>("/safety", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...review, roomId: scope || null }) });
        setReview(data);
        setDirty(false);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setSaving(false);
    } }
    const counts = SAFETY_STATUSES.map(s => review.checks.filter(c => c.status === s).length);
    return <div className="safety-page"><Heading eyebrow="KITA SAFETY · HUMAN REVIEW" title={translate("Awareness starts with us")} text="Check each item. Choose a status, then tap Save review."/><div className="privacy-note safety-disclaimer"><ShieldCheck size={20}/><p>{translate("This checklist supports awareness and human review. It is not a professional safety inspection, medical assessment, or guarantee that an environment is safe.")}</p></div><div className="panel safety-controls" data-tour="safety"><label className="field-label">{translate("Review for")}<select value={scope} disabled={loading || saving} onChange={e => { if (!dirty || window.confirm("Leave this review without saving your changes?"))
        setScope(e.target.value); }}>{[<option key="general" value="">{translate("General space review")}</option>, ...props.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)]}</select></label><label className="field-label">{translate("Location reviewed")}<input disabled={loading || saving || !!error} maxLength={200} placeholder={translate("e.g. Block 123 \u00B7 Ground floor walkway")} value={review.location} onChange={e => { setReview({ ...review, location: e.target.value }); setDirty(true); }}/></label></div><div className="safety-totals"><span><CheckCheck size={19}/><strong>{counts[1]}</strong>{translate(" reviewed")}</span><span><CircleHelp size={19}/><strong>{counts[2]}</strong>{translate(" follow-up")}</span><span><Eye size={19}/><strong>{counts[0]}</strong>{translate(" not reviewed")}</span><small aria-live="polite">{dirty ? translate("Unsaved changes") : review.updatedAt ? translate(`Saved ${date(review.updatedAt)}`) : translate("New review")}</small></div>{error && <p className="alert error" role="alert">{error}</p>}{loading ? <div className="loading"><LoaderCircle className="spin" size={22}/>{translate("Loading your review\u2026")}</div> : <div className="safety-items">{SAFETY_CHECKS.map((check, index) => <section className="safety-item panel" key={check.title}><span className="safety-number">{String(index + 1).padStart(2, "0")}</span><div><h2>{translate(check.title)}</h2><p>{translate(check.question)}</p><fieldset disabled={saving}><legend className="sr-only">{translate(check.title)}{translate(" status")}</legend><div className="safety-options">{SAFETY_STATUSES.map(status => <label key={status} className={review.checks[index].status === status ? "selected" : ""}><input type="radio" name={`safety-${index}`} value={status} checked={review.checks[index].status === status} onChange={() => update(index, { status })}/>{translate(status)}</label>)}</div></fieldset><textarea disabled={saving} rows={2} maxLength={2000} aria-label={translate(`${check.title} notes`)} placeholder={translate("Your observations or follow-up notes\u2026")} value={review.checks[index].notes} onChange={e => update(index, { notes: e.target.value })}/><p className="print-only">{review.checks[index].status}{translate(" \u00B7 ")}{review.checks[index].notes || translate("No notes added.")}</p></div></section>)}</div>}<div className="safety-actions"><button className="button primary" disabled={loading || saving || !!error || !dirty} onClick={save}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}{translate("Save review")}</button><button className="button secondary" disabled={loading || saving || !!error} onClick={printPage}><Printer size={16}/>{translate("Print / Save as PDF")}</button><button className="text-button" disabled={loading || saving || !!error} onClick={() => { if (window.confirm("Clear the current checklist? Save afterward to replace your saved review.")) {
        setReview({ ...review, checks: emptySafety() });
        setDirty(true);
    } }}><RotateCcw size={14}/>{translate("Reset checklist")}</button></div></div>;
}
type DirectoryResult = {
    services: CommunityService[];
    total: number;
    loaded: number;
    totalAvailable: number;
    hasMore: boolean;
    source: string;
    retrievedAt: string | null;
};
function DirectoryPage() {
    const { t: translate } = useLanguage();
    const [query, setQuery] = useState(""), [postal, setPostal] = useState(""), [category, setCategory] = useState(""), [source, setSource] = useState("official"), [offset, setOffset] = useState(0), [data, setData] = useState<DirectoryResult | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
    useEffect(() => { const controller = new AbortController(); setLoading(true); setError(""); const timer = setTimeout(() => { const params = new URLSearchParams({ q: query, postal, category, source, offset: String(offset) }); api<DirectoryResult>(`/services?${params}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted)
        setData(result); }).catch(e => { if (!controller.signal.aborted) {
        setError(e.message);
        setData(null);
    } }).finally(() => { if (!controller.signal.aborted)
        setLoading(false); }); }, 250); return () => { clearTimeout(timer); controller.abort(); }; }, [query, postal, category, source, offset]);
    function search(e: ChangeEvent<HTMLInputElement>) { setQuery(e.target.value); setOffset(0); }
    return <><Heading eyebrow="KAKI KOPI · SINGAPORE COMMUNITY SUPPORT" title={translate("Good connections start here")} text="Find nearby help. Search by name or postal code."/><div className="directory-toolbar panel" data-tour="directory"><label className="field-label">{translate("Search by agency, service or address")}<span className="search"><Search size={17}/><input value={query} maxLength={100} placeholder={translate("Who or what are you looking for?")} onChange={search}/></span></label><label className="field-label">{translate("Postal code")}<input value={postal} inputMode="numeric" maxLength={6} placeholder={translate("e.g. 601318")} onChange={e => { setPostal(e.target.value.replace(/\D/g, "")); setOffset(0); }}/></label><label className="field-label">{translate("Data source")}<select value={source} onChange={e => { setSource(e.target.value); setOffset(0); }}><option value="official">{translate("Official data snapshot")}</option><option value="notebook">{translate("Notebook GeoJSON uploads")}</option></select></label></div><div className="directory-tabs" role="group" aria-label={translate("Service category")}>{[["", "All services"], ["social", "Social Service Agencies"], ["eldercare", "Eldercare Services"]].map(([key, label]) => <button key={key} className={category === key ? "selected" : ""} aria-pressed={category === key} onClick={() => { setCategory(key); setOffset(0); }}>{translate(label)}</button>)}</div><div className="directory-summary"><p><Database size={14}/>{loading ? translate("Searching community services…") : translate(`${data?.total || 0} matching services`)}{data?.retrievedAt && <span>{translate(" \u00B7 Snapshot retrieved ")}{date(data.retrievedAt)}</span>}</p><small>{translate("Keyword matches are not a suitability assessment. Confirm eligibility with the provider.")}</small></div>{data && data.loaded < data.totalAvailable && <p className="alert progress">{translate("The notebook returned ")}{data.loaded}{translate(" of ")}{data.totalAvailable}{translate(" records. Search applies to the returned records.")}</p>}{error && <p className="alert error" role="alert">{error}</p>}{loading ? <div className="loading"><LoaderCircle className="spin" size={23}/>{translate("Looking up services\u2026")}</div> : data && <><div className="service-grid">{data.services.map(service => { const mapQuery = service.coordinates ? `${service.coordinates[1]},${service.coordinates[0]}` : [service.address, service.postal, "Singapore"].filter(Boolean).join(" "); return <article className="service-card panel" key={service.id}><div className="service-card-top"><span className="stat-icon">{service.category === "eldercare" ? <HeartHandshake size={21}/> : <Building2 size={21}/>}</span><span className="category-label">{service.category === "eldercare" ? translate("Eldercare service") : service.category === "social" ? translate("Social service agency") : translate("Community service")}</span></div><h2>{service.name || translate("Name not provided")}</h2><p><MapPin size={15}/>{service.address || translate("Address not provided")}{service.postal && <span>{translate("Singapore ")}{service.postal}</span>}</p>{service.description && <p className="service-description">{service.description}</p>}<div className="service-card-links">{(service.coordinates || service.address) && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noreferrer">{translate("View map ")}<ExternalLink size={12}/></a>}{service.website && <a href={service.website} target="_blank" rel="noreferrer">{translate("Provider website ")}<ExternalLink size={12}/></a>}</div><div className="service-source">{service.sourceUrl ? <a href={service.sourceUrl} target="_blank" rel="noreferrer">{service.source} <ExternalLink size={10}/></a> : <span>{translate("Notebook source: ")}{service.source}</span>}</div></article>; })}</div>{!data.services.length && <div className="no-results"><Search size={30}/><h3>{translate("No matching services")}</h3><p>{translate("Try a broader name, another postal code, or all services.")}</p><button className="text-button" onClick={() => { setQuery(""); setPostal(""); setCategory(""); setOffset(0); }}>{translate("Clear search ")}<ArrowRight size={14}/></button></div>}{data.total > 24 && <div className="directory-pagination"><button className="button secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 24))}>{translate("Previous")}</button><span>{offset + 1}{translate("\u2013")}{Math.min(offset + 24, data.total)}{translate(" of ")}{data.total}</span><button className="button secondary" disabled={!data.hasMore} onClick={() => setOffset(offset + 24)}>{translate("Next ")}<ArrowRight size={14}/></button></div>}</>}<DataSources /><p className="fine-print">{translate("Information appears as supplied in the source data. Missing names, addresses, contact details, or coordinates are not guessed. The downloaded snapshot is not a live availability feed.")}</p></>;
}
function DataSources() { const { t: translate } = useLanguage(); return <section className="data-sources panel"><h2><Database size={19}/>{translate("Data sources")}</h2><div>{DATA_SOURCES.map(s => <a key={s.id} href={`https://data.gov.sg/datasets/${s.id}/view`} target="_blank" rel="noreferrer"><strong>{s.name} <ExternalLink size={13}/></strong><span>{s.agency}</span><small>{translate("View on data.gov.sg")}</small></a>)}</div></section>; }
