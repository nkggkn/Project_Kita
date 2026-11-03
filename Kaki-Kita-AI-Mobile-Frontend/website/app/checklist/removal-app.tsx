"use client";
import { useLanguage } from "../language-provider";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, CheckCheck, ChevronDown, CircleCheck, ClipboardList, Film, ImagePlus, LoaderCircle, Plus, RotateCcw, ScanLine, Upload, X } from "lucide-react";
import { callApi as api } from "@/lib/client-api";
import { MIME_LIMITS } from "@/lib/validation";
import { videoFrames } from "@/lib/media-input";
import type { RemovalList } from "@/lib/removal-checklist";
import "./removal.css";
import MobileNavigation from "../mobile-navigation";
import { BuddyArt } from "../kita-buddy";
import { LanguagePicker } from "../language-provider";
type Room = {
    id: string;
    name: string;
};
type Media = {
    id: string;
    name: string;
    type: string;
    analyzed_at: string | null;
};
type Summary = {
    mediaId: string;
    name: string;
    roomName: string;
    total: number;
    done: number;
};
type SavedReport = {
    analyzedAt: string;
    samples: {
        result: {
            yolo: {
                annotated_image_base64?: string;
            };
        };
    }[];
};
export default function RemovalApp({ guest = false }: {
    guest?: boolean;
}) {
    const { t: translate } = useLanguage();
    const [rooms, setRooms] = useState<Room[]>([]), [saved, setSaved] = useState<Summary[]>([]);
    const [roomId, setRoomId] = useState(""), [roomName, setRoomName] = useState("My room");
    const [inputMode, setInputMode] = useState<"upload" | "library">("upload");
    const [media, setMedia] = useState<Media[]>([]), [mediaId, setMediaId] = useState("");
    const [file, setFile] = useState<File | null>(null), [list, setList] = useState<RemovalList | null>(null);
    const [filter, setFilter] = useState<"todo" | "done" | "all">("todo");
    const [busy, setBusy] = useState(""), [saving, setSaving] = useState(false), [loading, setLoading] = useState(true), [mediaLoading, setMediaLoading] = useState(false);
    const [error, setError] = useState(""), [notice, setNotice] = useState(""), [manual, setManual] = useState("");
    const [annotated, setAnnotated] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null), cameraInput = useRef<HTMLInputElement>(null);
    const uploaded = useRef<{
        file: File;
        roomId: string;
        mediaId: string;
        analyzed: boolean;
    } | null>(null);
    const previewSequence = useRef(0), working = useRef(false);
    const locked = loading || !!busy || saving;
    const showError = (e: unknown) => setError(e instanceof Error ? e.message : "Please try again.");
    const refreshSaved = useCallback(async () => setSaved(await api<Summary[]>("/checklists")), []);
    const preview = useCallback(async (next: RemovalList) => {
        const seq = ++previewSequence.current;
        setAnnotated(null);
        try {
            const report = await api<SavedReport | null>(`/media/${next.mediaId}/report`);
            if (seq !== previewSequence.current)
                return;
            const jpeg = report?.analyzedAt === next.analyzedAt ? report.samples[next.sampleIndex]?.result.yolo.annotated_image_base64 : null;
            if (jpeg && /^[a-zA-Z0-9+/=\r\n]+$/.test(jpeg))
                setAnnotated(`data:image/jpeg;base64,${jpeg}`);
        }
        catch { /* The original file is still available when a report preview is missing. */ }
    }, []);
    const openList = useCallback(async (id: string) => {
        if (working.current)
            return;
        working.current = true;
        setBusy("Opening your checklist…");
        setError("");
        try {
            const next = await api<RemovalList>(`/checklists/${encodeURIComponent(id)}`);
            setList(next);
            setFilter("todo");
            setManual("");
            setNotice("");
            window.history.replaceState({}, "", `/checklist?media=${encodeURIComponent(id)}`);
            void preview(next);
        }
        catch (e) {
            showError(e);
        }
        finally {
            working.current = false;
            setBusy("");
        }
    }, [preview]);
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [roomRows, lists] = await Promise.all([api<Room[]>("/rooms"), api<Summary[]>("/checklists")]);
                if (!active)
                    return;
                setRooms(roomRows);
                setSaved(lists);
                setRoomId(roomRows[0]?.id || "");
                const fromReport = new URLSearchParams(window.location.search).get("media");
                if (fromReport) {
                    setBusy("Opening detected items…");
                    working.current = true;
                    const next = await api<RemovalList>(`/media/${encodeURIComponent(fromReport)}/checklist`, { method: "POST" });
                    if (!active)
                        return;
                    setList(next);
                    void preview(next);
                    await refreshSaved();
                }
            }
            catch (e) {
                if (active)
                    showError(e);
            }
            finally {
                if (active) {
                    working.current = false;
                    setBusy("");
                    setLoading(false);
                }
            }
        })();
        return () => { active = false; ++previewSequence.current; };
    }, [preview, refreshSaved]);
    useEffect(() => {
        let active = true;
        setMedia([]);
        setMediaId("");
        if (!roomId || inputMode !== "library") {
            setMediaLoading(false);
            return;
        }
        setMediaLoading(true);
        api<{
            media: Media[];
        }>(`/rooms/${roomId}`).then(data => {
            if (active) {
                setMedia(data.media);
                setMediaId(data.media[0]?.id || "");
            }
        }).catch(e => { if (active)
            showError(e); }).finally(() => { if (active)
            setMediaLoading(false); });
        return () => { active = false; };
    }, [roomId, inputMode]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => { if (working.current) {
            event.preventDefault();
            event.returnValue = "";
        } };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, []);
    function chooseFile(next: File | undefined) {
        if (!next)
            return;
        setError("");
        const limit = MIME_LIMITS[next.type];
        if (!limit || !next.size || next.size > limit) {
            setError("Choose JPG, PNG or WebP up to 12 MB, or MP4, WebM, MOV or AVI up to 25 MB.");
            return;
        }
        if (next.name.length > 200) {
            setError("Shorten this filename to 200 characters or fewer.");
            return;
        }
        setFile(next);
        uploaded.current = null;
    }
    async function findItems(event: FormEvent) {
        event.preventDefault();
        if (working.current || locked)
            return;
        working.current = true;
        setError("");
        setNotice("");
        try {
            let id: string, type: string, analyzed: boolean;
            if (inputMode === "upload") {
                if (!file)
                    throw new Error("Choose a photo or video first.");
                let targetRoom = roomId;
                if (!targetRoom) {
                    setBusy("Creating your room…");
                    const room = await api<{
                        id: string;
                    }>("/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: roomName.trim(), type: "Other", location: "", area: "", notes: "", checklist: Array(5).fill("Not checked") }) });
                    targetRoom = room.id;
                    setRoomId(targetRoom);
                    setRooms(await api<Room[]>("/rooms"));
                }
                if (uploaded.current?.file === file && uploaded.current.roomId === targetRoom)
                    id = uploaded.current.mediaId;
                else {
                    setBusy("Saving your input…");
                    const result = await api<{
                        id: string;
                    }>(`/rooms/${targetRoom}/media?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
                    id = result.id;
                    uploaded.current = { file, roomId: targetRoom, mediaId: id, analyzed: false };
                }
                type = file.type;
                analyzed = !!uploaded.current?.analyzed;
            }
            else {
                const selected = media.find(item => item.id === mediaId);
                if (!selected)
                    throw new Error("Choose a saved photo or video first.");
                id = selected.id;
                type = selected.type;
                analyzed = !!selected.analyzed_at;
            }
            const existing = saved.find(item => item.mediaId === id);
            if (!analyzed && !existing) {
                setBusy(type.startsWith("video/") ? "Finding items in 3 video frames. This may take a few minutes…" : "Finding the objects in your photo…");
                const body = type.startsWith("video/") ? await videoFrames(id) : undefined;
                await api(`/media/${id}/analyze`, { method: "POST", body });
                if (uploaded.current?.mediaId === id)
                    uploaded.current.analyzed = true;
                setMedia(current => current.map(item => item.id === id ? { ...item, analyzed_at: new Date().toISOString() } : item));
            }
            setBusy("Preparing your checklist…");
            const next = await api<RemovalList>(`/media/${id}/checklist`, { method: "POST" });
            setList(next);
            setFilter("todo");
            setManual("");
            window.history.replaceState({}, "", `/checklist?media=${encodeURIComponent(id)}`);
            void preview(next);
            await refreshSaved();
            setNotice(existing ? "Your saved progress is ready." : `${next.items.length} ${next.items.length === 1 ? "item" : "items"} ready to review.`);
            if (inputMode === "upload") {
                setFile(null);
                uploaded.current = null;
            }
            document.getElementById("clear-items")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        catch (e) {
            showError(e);
        }
        finally {
            working.current = false;
            setBusy("");
        }
    }
    async function update(change: {
        action: "toggle";
        itemId: string;
        done: boolean;
    } | {
        action: "add";
        label: string;
    }) {
        if (!list || working.current || locked)
            return;
        const previous = list;
        working.current = true;
        setSaving(true);
        setError("");
        if (change.action === "toggle")
            setList({ ...list, items: list.items.map(item => item.id === change.itemId ? { ...item, done: change.done } : item) });
        try {
            const next = await api<RemovalList>(`/checklists/${list.mediaId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...change, version: list.version }) });
            setList(next);
            if (change.action === "add") {
                setManual("");
                setFilter("todo");
            }
            setNotice(change.action === "add" ? "Item added." : change.done ? "Marked as cleared. You can undo it in Done." : "Item moved back to To do.");
            void refreshSaved().catch(() => { });
        }
        catch (e) {
            setList(previous);
            showError(e);
            // A rejected version must reload current state instead of overwriting another tab's work.
            try {
                setList(await api<RemovalList>(`/checklists/${previous.mediaId}`));
            }
            catch { }
        }
        finally {
            working.current = false;
            setSaving(false);
        }
    }
    const done = list?.items.filter(item => item.done).length || 0;
    const total = list?.items.length || 0, remaining = total - done;
    const percent = total ? Math.round(done / total * 100) : 0;
    const visible = list?.items.filter(item => filter === "all" || (filter === "done" ? item.done : !item.done)) || [];
    const complete = total > 0 && remaining === 0;
    return <div className="clear-app"><MobileNavigation view="checklist" onNavigate={view=>window.location.assign(view==="home"?"/":`/${view}`)} disabled={locked}/>
    <header className="clear-header"><a className="clear-brand" href="/checklist"><span><BuddyArt/></span><div>Kita Clear<small>A KAKI KITA AI COMPANION</small></div></a><LanguagePicker /><a href="/" className="clear-home"><ArrowLeft size={16}/><span>{translate("Main website")}</span></a></header>
    <main className="clear-main">
      <section className="clear-intro"><div><h1>{translate("Keep the room clear")}</h1><p>{translate("Add a photo. Move items. Tap Done.")}</p></div></section>
      {(error || notice || busy) && <div className="clear-messages">{error && <div className="clear-message error" role="alert"><span>{error}</span><button aria-label={translate("Dismiss error")} onClick={() => setError("")}><X size={16}/></button></div>}{busy && <div className="clear-message" role="status"><LoaderCircle className="spin" size={18}/>{busy}</div>}{notice && !busy && <div className="clear-message success" role="status"><Check size={17}/>{notice}</div>}</div>}
      {guest && <p className="clear-guest-note"><CheckCheck size={17}/><span>{translate("Use the same browser to keep your photos and tasks together.")}</span></p>}
      <div className="clear-workspace">
        <aside className="clear-input-column">
          <section className="clear-card"><div className="clear-section-title"><span className="clear-step">{translate("01")}</span><h2>{translate("Add a photo")}</h2></div><div className="clear-source-tabs"><button type="button" onClick={() => setInputMode("upload")} aria-pressed={inputMode === "upload"} disabled={locked}>{translate("New photo")}</button><button type="button" onClick={() => setInputMode("library")} aria-pressed={inputMode === "library"} disabled={locked}>{translate("Saved photos")}</button></div>
            <form onSubmit={findItems}><label className="clear-field">{translate("Room")}<select aria-label={translate("Room for checklist")} value={roomId} onChange={e => { setRoomId(e.target.value); uploaded.current = null; }} disabled={locked}>{inputMode === "upload" && <option value="">{translate("Add a room")}</option>}{rooms.map(room => <option value={room.id} key={room.id}>{room.name}</option>)}{inputMode === "library" && !rooms.length && <option value="">{translate("No saved rooms yet")}</option>}</select></label>
              {!roomId && inputMode === "upload" && <label className="clear-field">{translate("Room name")}<input required value={roomName} onChange={e => setRoomName(e.target.value)} maxLength={100} disabled={locked}/></label>}
              {inputMode === "upload" ? <><div className="clear-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!locked)
        chooseFile(e.dataTransfer.files[0]); }}><span className="clear-upload-icon">{file?.type.startsWith("video/") ? <Film size={25}/> : <ImagePlus size={25}/>}</span><strong>{file ? file.name : translate("Choose a photo")}</strong><p>{file ? translate(`${(file.size / 1024 / 1024).toFixed(1)} MB · ready to find items`) : translate("Add a photo to start.")}</p><div><button type="button" className="clear-button secondary" onClick={() => fileInput.current?.click()} disabled={locked}><Upload size={16}/>{file ? translate("Change file") : translate("Choose a photo")}</button><button type="button" className="clear-camera" onClick={() => cameraInput.current?.click()} disabled={locked} aria-label={translate("Take a photo")}><Camera size={20}/>{translate(" Take a photo")}</button></div></div><input className="sr-only" ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-msvideo,.mov,.avi" aria-label={translate("Choose checklist photo or video")} disabled={locked} onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ""; }}/><input className="sr-only" ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label={translate("Take checklist photo")} disabled={locked} onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ""; }}/><p className="clear-hint">{translate("Photos up to 12 MB \u00B7 Videos up to 25 MB")}<br />{translate("JPG, PNG, WebP, MP4, WebM, MOV, AVI")}</p></> : <><label className="clear-field">{translate("Saved photo or video")}<select aria-label={translate("Saved checklist input")} value={mediaId} onChange={e => setMediaId(e.target.value)} disabled={locked || mediaLoading}>{!media.length && <option value="">{mediaLoading ? translate("Loading files…") : translate("No files in this room")}</option>}{media.map(item => <option key={item.id} value={item.id}>{item.name}{item.analyzed_at ? translate(" · analysed") : ""}</option>)}</select></label><p className="clear-hint">{translate("Saved analyses are reused. New photos run through your connected notebook API.")}</p></>}
              <button className="clear-button primary clear-full" disabled={locked || mediaLoading || (inputMode === "upload" ? !file : !mediaId)} type="submit">{busy ? <LoaderCircle size={18} className="spin"/> : <ScanLine size={18}/>}{translate("Find items ")}<ArrowRight size={17}/></button>
            </form><p className="clear-connection">{guest ? translate("Photos and tasks are saved together.") : <>{translate("Need to connect your notebook? ")}<a href="/settings">{translate("Open Settings ")}<ArrowRight size={12}/></a></>}</p>
          </section>
          {saved.length > 0 && <section className="clear-card clear-saved"><div className="clear-section-title"><ClipboardList size={18}/><h2>{translate("Saved photos")}</h2></div><label className="clear-field">{translate("My tasks")}<select aria-label={translate("Open saved checklist")} value={list?.mediaId || ""} onChange={e => e.target.value && openList(e.target.value)} disabled={locked}><option value="">{translate("Choose a saved checklist")}</option>{saved.map(item => <option key={item.mediaId} value={item.mediaId}>{item.roomName}{translate(" \u00B7 ")}{item.name}{translate(" (")}{item.done}{translate("/")}{item.total}{translate(")")}</option>)}</select></label><p className="clear-hint">{translate("Saved")}</p></section>}

        </aside>
        <section className="clear-card clear-list-card" id="clear-items" aria-labelledby="clear-items-heading">
          <div className="clear-section-title"><span className="clear-step">{translate("02")}</span><h2 id="clear-items-heading">{translate("Your items")}</h2><span className="clear-save-status" aria-live="polite">{saving ? translate("Saving…") : list ? translate("Saved") : ""}</span></div>
          {!list ? <div className="clear-empty"><ClipboardList size={45}/><h3>{translate("Add a photo to start.")}</h3><p>{translate("Move an item, then tap Done.")}</p></div> : <>
            <div className="clear-reference"><div className="clear-reference-picture">{annotated ? <img src={annotated} alt={translate(`Detected objects in ${list.name}`)}/> : list.mediaType.startsWith("image/") ? <img src={`/api/media/${list.mediaId}/file`} alt={list.name}/> : <video key={list.mediaId} controls preload="metadata" src={`/api/media/${list.mediaId}/file`} onLoadedMetadata={e => { if (list.seconds !== null)
            e.currentTarget.currentTime = list.seconds; }} aria-label={list.name}/>}</div><div><span className="clear-kicker">{translate("YOUR REFERENCE")}</span><h3>{list.roomName}</h3><p>{list.name}</p><a className="clear-reference-link" href={`/library?room=${encodeURIComponent(list.roomId)}&media=${encodeURIComponent(list.mediaId)}`}>{translate("View on main website ")}<ArrowRight size={12}/></a><small>{list.mediaType.startsWith("video/") ? translate(`One analysed frame${list.seconds !== null ? ` at ${list.seconds.toFixed(1)}s` : ""}. Objects across frames are not added together.`) : translate("Items found in this photo.")}</small></div></div>
            <div className={`clear-progress${complete ? " complete" : ""}`}><div className="clear-progress-ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18"/><circle cx="22" cy="22" r="18" strokeDasharray={`${percent * 1.131} 113.1`}/></svg><span>{complete ? <Check size={20}/> : translate(`${percent}%`)}</span></div><div><strong>{done}/{total} {translate("Done")}</strong><p>{remaining} {translate("To do")}</p></div></div>
            <div className="clear-list-tabs" role="group" aria-label={translate("Filter checklist items")}>{[["todo", "To do", remaining], ["done", "Done", done], ["all", "All", total]].map(([value, label, count]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value as typeof filter)}>{translate(label)}<span>{count}</span></button>)}</div>
            <div className="clear-items">{visible.map(item => <label key={item.id} className={`clear-item${item.done ? " is-done" : ""}`}><input type="checkbox" checked={item.done} onChange={e => update({ action: "toggle", itemId: item.id, done: e.target.checked })} disabled={locked} aria-label={translate(`${item.done ? "Undo clearing" : "Mark as cleared"}: ${item.label}`)}/><span className="clear-checkbox" aria-hidden="true">{item.done && <Check size={18}/>}</span><span className="clear-item-copy"><strong>{translate(item.label)}</strong><small>{item.source === "manual" ? translate("Added by you") : ""}</small></span><span className="clear-item-action">{item.done ? <><RotateCcw size={13}/>{translate("Undo")}</> : translate("Done")}</span></label>)}{!visible.length && <div className="clear-filter-empty"><CircleCheck size={27}/><strong>{!total ? translate("No items found.") : filter === "done" ? translate("No tasks done yet.") : filter === "todo" ? translate("Done") : translate("No items yet.")}</strong><p>{!total ? translate("Add item") : filter === "done" ? translate("Your finished tasks appear here.") : translate("You can undo any item in the Done tab.")}</p>{complete && filter === "todo" && <button className="clear-text-button" onClick={() => setFilter("done")}>{translate("Done ")}<ArrowRight size={14}/></button>}</div>}</div>
            <form className="clear-add" onSubmit={e => { e.preventDefault(); if (manual.trim())
            void update({ action: "add", label: manual.trim() }); }}><label htmlFor="clear-manual">{translate("Add item")}</label><div><input id="clear-manual" value={manual} onChange={e => setManual(e.target.value)} placeholder={translate("Boxes")} maxLength={100} disabled={locked || total >= 500}/><button className="clear-button secondary" type="submit" disabled={locked || !manual.trim() || total >= 500}><Plus size={17}/>{translate("Add")}</button></div></form>
            <p className="clear-footnote">{translate("Only tick Done after moving an item. ")}{new Date(list.analyzedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}{translate(" analysis.")}</p>
          </>}
        </section>
      </div>
      <footer className="clear-footer"><span><CheckCheck size={16}/>{translate(" Saved")}</span><a href="/">{translate("Main website ")}<ArrowRight size={14}/></a></footer>
    </main>
    {list && <div className="clear-mobile-progress"><span><strong>{done}{translate("/")}{total}</strong>{translate(" cleared")}</span><div><i style={{ width: `${percent}%` }}/></div><button onClick={() => document.getElementById("clear-items")?.scrollIntoView({ behavior: "smooth" })}>{translate("Checklist ")}<ChevronDown size={16}/></button></div>}
  </div>;
}
