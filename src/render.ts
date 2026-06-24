import type { HandoverItem, HandoverReport } from "./types";

const SECTION_META: Record<
  string,
  { label: string; icon: string; color: string; border: string }
> = {
  urgent: { label: "URGENT — Act Before 09:00", icon: "🔴", color: "#fff0f0", border: "#e53e3e" },
  pending: { label: "STILL OPEN — Carried From Previous Nights", icon: "🟡", color: "#fffbf0", border: "#d97706" },
  resolvedOvernight: { label: "RESOLVED OVERNIGHT", icon: "🟢", color: "#f0fff4", border: "#38a169" },
  newTonight: { label: "NEW TONIGHT — Still Open", icon: "🔵", color: "#ebf8ff", border: "#3182ce" },
  fyi: { label: "FYI — No Action Needed", icon: "⚪", color: "#f7f7f7", border: "#a0aec0" },
  dataQualityFlags: { label: "DATA QUALITY FLAGS", icon: "⚠️", color: "#fffbeb", border: "#f59e0b" },
};

function renderItem(item: HandoverItem): string {
  return `
    <div style="margin-bottom:12px; padding:12px; background:#fff; border-radius:6px; border:1px solid #e2e8f0;">
      <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${escapeHtml(item.title)}</div>
      <div style="color:#4a5568; font-size:13px; margin-bottom:6px;">${escapeHtml(item.detail)}</div>
      ${item.actionRequired ? `<div style="color:#c53030; font-size:12px; font-weight:500;">→ ${escapeHtml(item.actionRequired)}</div>` : ""}
      ${item.dataQualityFlag ? `<div style="color:#b7791f; font-size:11px; margin-top:4px;">⚠ ${escapeHtml(item.dataQualityFlag)}</div>` : ""}
      <div style="color:#a0aec0; font-size:10px; margin-top:6px;">Source: ${item.sourceEventIds.join(", ")}</div>
    </div>`;
}

function renderSection(key: string, items: HandoverItem[]): string {
  const meta = SECTION_META[key] || { label: key, icon: "•", color: "#fff", border: "#ccc" };
  if (items.length === 0 && key !== "urgent" && key !== "dataQualityFlags") return "";

  return `
  <div style="margin-bottom:24px; padding:16px; background:${meta.color}; border-left:4px solid ${meta.border}; border-radius:4px;">
    <h2 style="font-size:13px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#2d3748; margin:0 0 12px 0;">
      ${meta.icon} ${meta.label} ${items.length > 0 ? `(${items.length})` : ""}
    </h2>
    ${items.length === 0 ? '<p style="color:#718096; font-size:13px; margin:0;">None</p>' : items.map(renderItem).join("")}
  </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHtml(report: HandoverReport): string {
  const { hotel, morningDate, generatedAt, sections, generationMeta } = report;

  const sectionOrder = [
    "urgent",
    "pending",
    "newTonight",
    "resolvedOvernight",
    "fyi",
    "dataQualityFlags",
  ] as const;

  const meta = generationMeta;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Morning Handover — ${escapeHtml(hotel.name)} — ${morningDate}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f0f4f8; color: #2d3748; }
    .container { max-width: 780px; margin: 0 auto; }
    .header { background: #1a202c; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0 0 4px; font-size: 20px; }
    .header .sub { color: #a0aec0; font-size: 13px; }
    .meta-bar { background: #2d3748; color: #cbd5e0; padding: 8px 24px; font-size: 11px; display: flex; gap: 24px; }
    .meta-bar span { display: flex; align-items: center; gap: 4px; }
    .body { background: #fff; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .footer { margin-top: 12px; color: #a0aec0; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Morning Handover — ${escapeHtml(hotel.name)}</h1>
      <div class="sub">${morningDate} · Generated ${new Date(generatedAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</div>
    </div>
    <div class="meta-bar">
      <span>📋 ${meta.eventsIngested} events</span>
      ${meta.freetextEventsParsed > 0 ? `<span>📝 ${meta.freetextEventsParsed} from free-text log</span>` : ""}
      ${meta.promptInjectionDetected ? `<span style="color:#fc8181;">⚠ Prompt injection detected</span>` : ""}
      ${meta.contradictionsFound > 0 ? `<span style="color:#f6ad55;">⚠ ${meta.contradictionsFound} contradiction(s)</span>` : ""}
    </div>
    <div class="body">
      ${sectionOrder.map((key) => renderSection(key, sections[key])).join("")}
    </div>
    <div class="footer">
      Every item above is grounded in a source event. Source IDs shown per item. Generated automatically — verify flagged items with night staff if needed.
    </div>
  </div>
</body>
</html>`;
}
