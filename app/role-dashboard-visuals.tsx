"use client";

import type { CSSProperties } from "react";
import { getRoleDashboardVisuals } from "./role-dashboard-visual-data";
import { chartToneColor } from "./role-dashboard-charts";

interface RoleDashboardVisualsProps {
  pageId: string;
  onDrill: (subject: string, targetModuleId?: string) => void;
}

// One palette, one map. This was a second tone->colour table that still
// pointed at brand and status tokens, so a chart could disagree with itself.

function titleCase(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function RoleDashboardVisuals({ pageId, onDrill }: RoleDashboardVisualsProps) {
  const visuals = getRoleDashboardVisuals(pageId);
  if (!visuals) return null;

  const gradientStops = visuals.distribution.segments.map((segment, index, segments) => {
    const start = segments.slice(0, index).reduce((total, item) => total + item.value, 0);
    const end = start + segment.value;
    return `${chartToneColor[segment.tone]} ${start}% ${end}%`;
  });
  const donutStyle = { "--nx-donut-fill": `conic-gradient(${gradientStops.join(", ")})` } as CSSProperties;

  return (
    <>
      <article className="nx-role-panel nx-role-panel--distribution" data-dashboard-chart="distribution-snapshot">
        <div className="nx-role-panel__head">
          <div><span>Composition</span><h2>{visuals.distribution.title}</h2><p>{visuals.distribution.subtitle}</p></div>
          <span className="nx-role-badge">Current snapshot</span>
        </div>
        <div className="nx-distribution-layout">
          <button className="nx-donut-chart" style={donutStyle} type="button" onClick={() => onDrill(visuals.distribution.title)} aria-label={visuals.distribution.accessibleSummary + ". Open drill-down."}>
            <div className="nx-donut-chart__center"><strong>{visuals.distribution.centerValue}</strong><span>{visuals.distribution.centerLabel}</span></div>
          </button>
          <div className="nx-donut-legend" role="group" aria-label={`${visuals.distribution.title} categories`}>
            {visuals.distribution.segments.map((segment) => (
              <button className="nx-donut-legend__item" data-tone={segment.tone} key={segment.id} onClick={() => onDrill(segment.label, segment.target.moduleId)} type="button">
                <i className="nx-donut-swatch" data-tone={segment.tone} aria-hidden="true" />
                <span><strong>{segment.label}</strong><small>{segment.display}</small></span>
                <b>{segment.value}%</b>
              </button>
            ))}
          </div>
        </div>
        <p className="nx-role-section-note"><strong>Management read-out</strong><span>{visuals.distribution.accessibleSummary}</span></p>
      </article>

      <article className="nx-role-panel nx-role-panel--drivers" data-dashboard-chart="driver-benchmark">
        <div className="nx-role-panel__head">
          <div><span>Performance drivers</span><h2>{visuals.drivers.title}</h2><p>{visuals.drivers.subtitle}</p></div>
          <span className="nx-role-badge">Snapshot · {visuals.drivers.unit}</span>
        </div>
        <div className="nx-driver-chart" role="group" aria-label={visuals.drivers.accessibleSummary}>
          {visuals.drivers.bars.map((bar) => {
            const valueWidth = Math.min(100, Math.max(0, (bar.value / bar.max) * 100));
            const benchmarkPosition = Math.min(100, Math.max(0, (bar.benchmark / bar.max) * 100));
            const barStyle = {
              "--nx-driver-value": `${valueWidth}%`,
              "--nx-driver-benchmark": `${benchmarkPosition}%`,
            } as CSSProperties;
            return (
              <button
                aria-label={`${bar.label}: ${bar.valueLabel}; benchmark ${bar.benchmarkLabel}; ${titleCase(bar.status)}. Open source detail.`}
                className="nx-driver-row"
                data-status={bar.status}
                key={bar.id}
                onClick={() => onDrill(bar.label, bar.target.moduleId)}
                style={barStyle}
                type="button"
              >
                <span className="nx-driver-row__labels"><strong>{bar.label}</strong><span><b>{bar.valueLabel}</b><small>{bar.benchmarkLabel}</small><i>{titleCase(bar.status)}</i></span></span>
                <span className="nx-driver-row__track" aria-hidden="true"><i className="nx-driver-row__fill" /><b className="nx-driver-row__benchmark" /></span>
              </button>
            );
          })}
        </div>
        <p className="nx-role-section-note"><strong>Management read-out</strong><span>{visuals.drivers.accessibleSummary}</span></p>
      </article>

      <article className="nx-role-panel nx-role-panel--insights">
        <div className="nx-role-panel__head">
          <div><span>Decision intelligence</span><h2>Management insights</h2><p>Role-specific interpretation of the mock operating signals.</p></div>
        </div>
        <div className="nx-role-insights" role="group" aria-label="Management insights">
          {visuals.insights.map((insight) => (
            <button className="nx-role-insight" data-management-insight={insight.id} data-tone={insight.tone} key={insight.id} onClick={() => onDrill(insight.title, insight.target.moduleId)} type="button">
              <i className="nx-role-insight__icon" aria-hidden="true">{insight.tone === "good" ? "✓" : insight.tone === "warn" ? "!" : "↗"}</i>
              <span><em>{insight.tone === "good" ? "Opportunity" : insight.tone === "warn" ? "Watch item" : "Recommended action"}</em><strong>{insight.title}</strong><small>{insight.detail}</small></span>
            </button>
          ))}
        </div>
      </article>
    </>
  );
}
