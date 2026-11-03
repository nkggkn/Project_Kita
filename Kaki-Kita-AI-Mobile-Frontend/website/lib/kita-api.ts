import { InputError } from "./validation";

export function networkReason(error: unknown) {
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return "The connection timed out.";
  if (!(error instanceof Error)) return "The connection failed.";
  // Keep credentials and query parameters out of errors returned to the browser.
  return `${error.name}: ${error.message}`.replace(/https?:\/\/\S+/gi, "[API address]").replace(/(bearer\s+|(?:api[_-]?key|token|secret)[=: ]+)[^\s,;]+/gi, "$1[redacted]").slice(0, 300);
}

export async function checkKitaHealth(base: string) {
  let response: Response;
  try {
    response = await fetch(base + "/health", {
      redirect: "manual", signal: AbortSignal.timeout(30000),
      headers: { "ngrok-skip-browser-warning": "1", "Accept": "application/json" },
    });
  } catch (error) {
    throw new InputError(`The website server could not reach the API /health endpoint. ${networkReason(error)} Keep the notebook and ngrok tunnel running, and check the current HTTPS tunnel address.`, 502);
  }
  const health = await response.json().catch(() => null) as { status?: string; analysis_model?: string; claude_model?: string; gemini_model?: string; yolo_model?: string; services_loaded?: number } | null;
  if (!response.ok) throw new InputError(`The API /health endpoint returned HTTP ${response.status}. Check the notebook and the current tunnel address.`, 502);
  if (health?.status !== "ok") throw new InputError("The /health endpoint did not return Kita Vision status OK. Make sure the tunnel points to the notebook's API_PORT.", 502);
  return { status: health.status, analysisModel: health.analysis_model || health.claude_model || health.gemini_model, yoloModel: health.yolo_model, servicesLoaded: health.services_loaded };
}

export function analysisFailure(status: number, detail: unknown) {
  if (typeof detail === "string" && detail.includes("Image analysis failed")) return `The API was reached, but its /detect endpoint returned HTTP ${status}: image analysis failed inside the notebook. In Colab, expand the running API cell and look for “Dual-AI analysis error:”. Your saved files and previous report are unchanged.`;
  if (status === 429) return "The AI API reached a usage limit (HTTP 429). Check your Anthropic quota and retry later.";
  if (status === 401 || status === 403) return `The API rejected the analysis request (HTTP ${status}). Check access to your notebook API.`;
  return `The API /detect endpoint returned HTTP ${status}. Check the notebook output. Your saved files and previous report are unchanged.`;
}

export type VisionAnalysis = { environment: string; overall_summary: string; visible_observations: string[]; potential_obstacles: string[]; accessibility_concerns: string[]; recommendations: string[]; limitations: string[] };
export function readAnalysis(result: Record<string, any>): VisionAnalysis {
  const data = result.analysis || result.claude || result.gemini;
  if (!data || typeof data !== "object" || typeof data.environment !== "string" || typeof data.overall_summary !== "string") throw new InputError("The API returned invalid room summary fields.", 502);
  for (const key of ["visible_observations", "potential_obstacles", "accessibility_concerns", "recommendations", "limitations"]) {
    if (!Array.isArray(data[key]) || !data[key].every((value: unknown) => typeof value === "string")) throw new InputError("The API returned invalid room observations.", 502);
  }
  return data;
}
