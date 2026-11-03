"use client";
import { useLanguage, LanguagePicker } from "./language-provider";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Coffee, Film, FolderOpen, HeartHandshake, ScanLine, ShieldCheck, Sparkles, X, type LucideIcon } from "lucide-react";
import { placeTour, type TourRect } from "@/lib/interaction";
type Step = {
    view: string;
    target?: string;
    label: string;
    title: string;
    body: string;
    tip: string;
    icon: LucideIcon;
};
const steps: Step[] = [
    { view: "home", label: "1", title: "Keep the room clear", body: "Choose one. We will guide you.", tip: "You can skip this help.", icon: HeartHandshake },
    { view: "vision", target: "vision", label: "2", title: "Take a photo", body: "Please take a photo or choose from gallery", tip: "Tap Next when you are ready.", icon: ScanLine },
    { view: "watch", target: "watch", label: "3", title: "Record a video", body: "Please record a video or choose from gallery", tip: "Tap Next when you are ready.", icon: Film },
    { view: "library", target: "room-create", label: "4", title: "My rooms", body: "Your photos and tasks are saved here.", tip: "Before shows your photo. After is an AI clean-room idea.", icon: FolderOpen },
    { view: "home", label: "5", title: "Done", body: "Open My tasks. Move an item, then tap Done.", tip: "Use Undo if you tap by mistake.", icon: Check },
];
export default function GuidedTour({ onNavigate, onClose }: {
    onNavigate: (view: string) => void;
    onClose: (status: "done" | "skipped", destination?: string) => void;
}) {
    const { t: translate } = useLanguage();
    const [index, setIndex] = useState(0), [rect, setRect] = useState<TourRect | null>(null), [position, setPosition] = useState<{
        left: number;
        top: number;
    } | null>(null);
    const dialog = useRef<HTMLDialogElement>(null), card = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
    const step = steps[index], first = index === 0, last = index === steps.length - 1;
    useEffect(() => {
        const element = dialog.current, overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        element?.showModal();
        return () => { element?.close(); document.body.style.overflow = overflow; };
    }, []);
    useEffect(() => {
        onNavigate(step.view);
        setPosition(null);
        setRect(null);
        let frame = 0, observer: ResizeObserver | null = null;
        const measure = () => {
            const target = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
            const r = target?.getBoundingClientRect();
            const box = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
            setRect(box);
            const size = card.current?.getBoundingClientRect();
            setPosition(placeTour({ width: window.innerWidth, height: window.innerHeight }, box, { width: size?.width || 390, height: size?.height || 340 }));
        };
        const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
        frame = requestAnimationFrame(() => {
            const target = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
            if (target)
                target.scrollIntoView({ block: "center", behavior: "auto" });
            else
                window.scrollTo({ top: 0, behavior: "auto" });
            observer = new ResizeObserver(schedule);
            if (target)
                observer.observe(target);
            if (card.current)
                observer.observe(card.current);
            heading.current?.focus({ preventScroll: true });
            measure();
        });
        window.addEventListener("resize", schedule);
        window.addEventListener("scroll", schedule, true);
        return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
    }, [index, step, onNavigate]);
    const Icon = step.icon;
    const safeRect = rect ? { left: Math.max(8, rect.left - 8), top: Math.max(8, rect.top - 8), width: Math.max(0, Math.min(rect.width + 16, window.innerWidth - Math.max(8, rect.left - 8) - 8)), height: Math.max(0, Math.min(rect.height + 16, window.innerHeight - Math.max(8, rect.top - 8) - 8)) } : null;
    return <dialog ref={dialog} className="guided-tour" aria-labelledby="tour-title" aria-describedby="tour-description" onCancel={e => { e.preventDefault(); onClose("skipped"); }} onKeyDown={e => { if (e.key === "ArrowRight" && !last) {
        e.preventDefault();
        setIndex(index + 1);
    } if (e.key === "ArrowLeft" && !first) {
        e.preventDefault();
        setIndex(index - 1);
    } }}>
    <div className={safeRect ? "tour-shade spotlight-mode" : "tour-shade"} aria-hidden="true"/>
    {safeRect && <div className="tour-spotlight" aria-hidden="true" style={safeRect}/>}
    <div ref={card} className={`tour-card ${first || last ? "tour-intro" : ""}`} style={position ? { left: position.left, top: position.top } : undefined}>
      <div className="tour-top"><LanguagePicker /><span className="tour-count">{translate("Help")}</span><button className="icon-button" aria-label={translate("Close guided tour")} onClick={() => onClose("skipped")}><X size={18}/></button></div>
      {(first || last) && <div className="tour-scene" aria-hidden="true"><div className="tour-scene-grid"/><span className="tour-orbit orbit-one"><ScanLine size={20}/></span><span className="tour-orbit orbit-two"><Coffee size={19}/></span><span className="tour-orbit orbit-three"><ShieldCheck size={18}/></span><div className="tour-scene-center"><Icon size={35}/></div><span className="tour-scene-label">{translate("A little awareness. A lot of care.")}</span></div>}
      <div className="tour-body"><div className="tour-step-label"><Icon size={15}/>{translate(step.label)}</div><h2 id="tour-title" ref={heading} tabIndex={-1}>{translate(step.title)}</h2><p id="tour-description">{translate(step.body)}</p><p className="tour-tip">{translate(step.tip)}</p></div>
      <div className="tour-progress"><span>{translate("Step ")}{index + 1}{translate(" of ")}{steps.length}</span><div aria-label={translate("Tour progress")}>{steps.map((s, i) => <button key={s.title} className={i === index ? "current" : i < index ? "visited" : ""} aria-label={translate(`Go to tour step ${i + 1}`)} aria-current={i === index ? "step" : undefined} onClick={() => setIndex(i)}/>)}</div></div>
      <div className="tour-actions">{first ? <button className="text-button" onClick={() => onClose("skipped")}>{translate("Skip")}</button> : <button className="text-button" onClick={() => setIndex(index - 1)}><ArrowLeft size={14}/>{translate("Back")}</button>}<button className="button primary" onClick={() => last ? onClose("done", "home") : setIndex(index + 1)}>{first ? translate("Show me") : last ? translate("Done") : translate("Next")}{last ? <Check size={15}/> : <ArrowRight size={15}/>}</button></div>
      {last && <button className="tour-alternative" onClick={() => onClose("done", "kopi")}>{translate("I\u2019d like to find community support first ")}<ArrowRight size={13}/></button>}
    </div>
  </dialog>;
}
