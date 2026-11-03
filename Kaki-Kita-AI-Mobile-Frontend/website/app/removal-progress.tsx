"use client";
import { useLanguage } from "./language-provider";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCheck, LoaderCircle } from "lucide-react";
import { callApi } from "@/lib/client-api";
import type { RemovalList } from "@/lib/removal-checklist";
export default function RemovalProgress({ mediaId, analyzed }: {
    mediaId: string;
    analyzed: boolean;
}) {
    const { t: translate } = useLanguage();
    const [list, setList] = useState<RemovalList | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        const load = () => {
            callApi<RemovalList | null>(`/media/${mediaId}/checklist`).then(next => { if (active) {
                setList(next);
                setError("");
            } }).catch(e => { if (active)
                setError(e.message); }).finally(() => { if (active)
                setLoading(false); });
        };
        setList(null);
        setLoading(true);
        setError("");
        load();
        const refresh = () => { if (!document.hidden)
            load(); };
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () => { active = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
    }, [mediaId]);
    const total = list?.items.length || 0, done = list?.items.filter(item => item.done).length || 0;
    return <section className="panel shared-removal-panel"><div className="panel-heading"><h2><CheckCheck size={19}/>{translate(" Kita Clear progress")}</h2><a className="text-button" href={list || analyzed ? `/checklist?media=${encodeURIComponent(mediaId)}` : "/checklist"}>{translate("Open Kita Clear ")}<ArrowRight size={15}/></a></div>
    {loading ? <p className="muted"><LoaderCircle className="spin" size={15}/>{translate(" Loading checklist\u2026")}</p> : error ? <p className="inline-error" role="alert">{error}</p> : list ? <><strong>{done}{translate(" of ")}{total}{translate(" items cleared")}</strong><div className="shared-removal-track" role="progressbar" aria-label={translate("Removal checklist progress")} aria-valuemin={0} aria-valuemax={Math.max(total, 1)} aria-valuenow={done}><span style={{ width: `${total ? done / total * 100 : 0}%` }}/></div><p>{total - done}{translate(" left to clear. Updates in Kita Clear are saved with this file in your shared workspace.")}</p></> : <p>{translate("This file is already shared with Kita Clear. Create its removal checklist there to track what you\u2019ve cleared.")}</p>}
  </section>;
}
