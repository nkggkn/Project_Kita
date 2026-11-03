"use client";
import { useLanguage } from "./language-provider";
import { ArrowRight, Check, Compass } from "lucide-react";
import { starterSteps } from "@/lib/interaction";
export default function GettingStarted({ rooms, files, connected, reports, onNavigate, onTour }: {
    rooms: number;
    files: number;
    connected: boolean;
    reports: number;
    onNavigate: (view: string) => void;
    onTour: () => void;
}) {
    const { t: translate } = useLanguage();
    const steps = starterSteps(rooms, files, connected, reports), count = steps.filter(s => s.done).length, next = steps.findIndex(s => !s.done);
    return <section className="getting-started" aria-labelledby="getting-started-title"><div className="getting-started-heading"><div><span className="eyebrow">{count === 4 ? translate("YOU’VE MADE A START") : translate("YOUR NEXT SMALL STEP")}</span><h2 id="getting-started-title">{count === 4 ? translate("Keep looking a little closer.") : rooms ? translate("Pick up where you left off.") : translate("Your first room, in four small steps.")}</h2></div><button className="text-button" onClick={onTour}><Compass size={15}/>{translate("Take the guided tour")}</button></div><div className="getting-started-progress"><span style={{ width: `${count * 25}%` }}/><small>{count}{translate(" of 4 milestones")}</small></div><div className="starter-steps">{steps.map((step, i) => <button key={step.title} className={step.done ? "starter-step done" : i === next ? "starter-step next" : "starter-step"} onClick={() => onNavigate(step.view)}><span className="starter-number">{step.done ? <Check size={14}/> : i + 1}</span><span><strong>{translate(step.title)}</strong><small>{step.done ? translate("Completed in your workspace") : translate(step.detail)}</small></span><ArrowRight size={14}/></button>)}</div></section>;
}
