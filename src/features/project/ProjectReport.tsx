import clsx from "clsx";
import { FileSpreadsheet, Printer, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Logo } from "../../components/Logo";
import type { Project } from "../../bindings/Project";
import type { ProjectResult } from "../../bindings/ProjectResult";
import { api } from "../../lib/api";
import { useApp } from "../../store";
import { fmtDate, fmtMoney, fmtNum, fmtPct, perMonth } from "../../lib/format";
import { BASIS_LABELS, TEMPLATE_LABELS } from "../../lib/labels";
import { offered } from "./shared";

/**
 * The whole project as one document: what it costs us, what we charge, every
 * scenario and what the model said about the price. It is what leaves the app
 * for a client, so printing is the point — the screen chrome carries the
 * `report-hide` class and the print rules in index.css drop it.
 */
export function ProjectReport({
  project,
  result,
  onClose,
}: {
  project: Project;
  result: ProjectResult | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const exportExcel = useApp((s) => s.exportExcel);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const money = (value: number | null | undefined) => fmtMoney(value ?? null, project.currency);
  const suggestion = project.last_suggestion;
  const plansOnly = project.template === "contractors";
  const platform = project.structure.shared.filter((cost) => !cost.removed);
  const platformMonthly = platform.reduce((sum, cost) => sum + cost.monthly, 0);
  const clientMonthly = platform.reduce((sum, cost) => sum + cost.monthly * cost.share, 0);
  const yearlyExtras = result?.bands.some((b) => b.yearly_extras.price > 0 || b.yearly_extras.cost > 0) ?? false;
  const nameById = new Map(result?.onboarding_lines.map((line) => [line.id, line.name]));
  // Only what some scenario or plan actually charges: the catalogue's other elements aren't in any price.
  const used = new Set([...(result?.bands ?? []), ...(result?.plans ?? [])].flatMap((x) => x.onboarding_ids));
  const items = offered(project.onboarding).filter((item) => used.has(item.id));
  const lines = result?.onboarding_lines.filter((line) => used.has(line.id)) ?? [];

  return createPortal(
    <div className="report fixed inset-0 z-50 overflow-y-auto bg-page">
      <div className="report-hide sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
        <div className="text-sm text-ink-2">
          Report · <span className="text-ink">{project.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {savedTo && (
            <span className="truncate text-xs text-ink-2" title={savedTo}>
              Saved to {savedTo.split(/[\\/]/).slice(-2).join("/")}
            </span>
          )}
          <button
            type="button"
            onClick={async () => setSavedTo((await exportExcel(project.id)) ?? null)}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink [&_svg]:size-4"
          >
            <FileSpreadsheet />
            Excel
          </button>
          <button
            type="button"
            onClick={() => void api.printPage()}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white [&_svg]:size-4"
          >
            <Printer />
            Print / Save as PDF
          </button>
          <button
            type="button"
            aria-label="Close report"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink [&_svg]:size-4"
          >
            <X />
            Close
          </button>
        </div>
      </div>

      <article className="report-sheet mx-auto max-w-[820px] px-10 py-8">
        <header className="report-section mb-8 border-b border-line pb-4">
          <Logo className="mb-5 h-5 w-auto text-ink" />
          <h1 className="text-2xl font-semibold text-ink">{project.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {project.client ? `${project.client} · ` : ""}
            {TEMPLATE_LABELS[project.template]} · all figures in {project.currency}
          </p>
          <p className="mt-0.5 text-xs text-muted">Generated {fmtDate(new Date().toISOString())}</p>
          {project.notes.trim() && <p className="mt-3 text-sm text-ink-2">{project.notes}</p>}
        </header>

        <Section
          title="1 · What it costs us"
          intro="What we pay to run the platform, and what each onboarding service costs us, before any margin."
        >
          {plansOnly && (
            <>
              <Row label="Platform per account" value={`${money(project.usage.per_account_monthly)} / month`} />
              <Row
                label="Platform per active project / work record"
                value={`${money(project.usage.per_project_monthly)} / month`}
              />
              <Row
                label="Platform fixed cost, not carried by any account"
                value={`${money(project.usage.platform_fixed_monthly)} / month`}
              />
              <Row
                label="Storage, with its backup copy"
                value={`${money(project.usage.storage_per_gb_month)} / GB / month`}
              />
              <Row label="Downloads" value={`${money(project.usage.download_per_gb)} / GB`} />
              <Row label="Downloaded each month vs uploaded" value={fmtPct(project.usage.download_share)} />
              {project.plans.map((plan) => (
                <Row
                  key={plan.id}
                  label={`Storage after a year · ${plan.name}`}
                  value={`${fmtNum(plan.contractor_storage_gb)} GB contractor · ${fmtNum(plan.consultant_storage_gb)} GB consultant`}
                />
              ))}
            </>
          )}

          {platform.length > 0 && (
            <Table
              caption="Platform"
              head={["Service", "Per month", "Per year"]}
              rows={platform.map((cost) => [cost.name, money(cost.monthly), money(cost.monthly * 12)])}
              total={["Total", money(platformMonthly), money(platformMonthly * 12)]}
            />
          )}

          {items.length > 0 && (
            <Table
              caption="Onboarding"
              head={["Service", "Billed", "Counted per", "Cost"]}
              rows={items.map((item) => [
                item.name,
                item.recurrence === "one_off" ? "Once" : "Every year",
                BASIS_LABELS[item.basis],
                money(item.internal_unit_cost),
              ])}
            />
          )}
        </Section>

        <Section
          page
          title="2 · What we charge"
          intro={
            plansOnly
              ? "Each plan's subscription covers its share of the platform with a markup on top. Onboarding is billed once, apart from it."
              : "The platform is passed on at cost, for the share this client pays. Each onboarding service has its own price. The subscription price per building is set per scenario, on the next page."
          }
        >
          {plansOnly && <Row label="Subscription markup" value={fmtPct(project.subscription_markup)} />}

          {platform.length > 0 && (
            <Table
              caption="Platform passed on to the client, at cost"
              head={["Service", "Client pays", "Per month"]}
              rows={platform.map((cost) => [cost.name, fmtPct(cost.share), money(cost.monthly * cost.share)])}
              total={["Total", "", money(clientMonthly)]}
            />
          )}

          {lines.length > 0 && (
            <Table
              caption="Onboarding prices"
              head={["Service", "Cost", "We charge", "Profit", "Margin"]}
              rows={lines.map((line) => [
                line.name,
                money(line.unit_cost),
                money(line.unit_price),
                money(line.unit_price - line.unit_cost),
                fmtPct(line.margin),
              ])}
            />
          )}
        </Section>

        {result && plansOnly && (
          <Section page title="3 · Plans">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-right text-xs text-muted">
                  <th className="py-2 pr-4 text-left font-medium">Plan</th>
                  <th className="py-2 pr-4 text-left font-medium">Account</th>
                  <th className="py-2 pr-4 font-medium">
                    Quote
                    <span className="block font-normal">per account / month</span>
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    Onboarding
                    <span className="block font-normal">billed once</span>
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    Subscription
                    <span className="block font-normal">year 1</span>
                  </th>
                  <th className="py-2 font-medium">
                    Profit
                    <span className="block font-normal">year 1</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-right tabular-nums">
                {result.plans.flatMap((plan) =>
                  (["contractor", "consultant"] as const).map((kind, i) => {
                    const row = plan[kind];
                    const losing = row.subscription.profit < 0;
                    return (
                      <tr key={`${plan.plan_id}-${kind}`} className={i === 1 ? "border-b border-line last:border-0" : ""}>
                        <td className="py-2 pr-4 text-left font-medium text-ink">
                          {i === 0 && (
                            <>
                              {plan.name}
                              <span className="block text-xs font-normal text-muted">
                                {fmtNum(plan.projects)} projects · {fmtNum(plan.users)}{" "}
                                {plan.users === 1 ? "user" : "users"}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-left text-ink-2 capitalize">{kind}</td>
                        <td className="py-2 pr-4 font-medium text-income">
                          {money(perMonth(row.subscription.price))}
                          {plan.users !== 1 && (
                            <span className="block text-xs font-normal">
                              {money(perMonth(row.all_users.price))} for {fmtNum(plan.users)} users
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-income">
                          {money(row.onboarding.price)}
                          <span className="block text-xs text-bad">costs {money(row.onboarding.cost)}</span>
                        </td>
                        <td className="py-2 pr-4 text-income">
                          {money(row.subscription.price)}
                          <span className="block text-xs text-bad">
                            costs {money(row.subscription.cost)} ({money(row.cost_first_month)} →{" "}
                            {money(row.cost_last_month)} a month)
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={losing ? "font-semibold text-bad" : "font-semibold text-good"}>
                            {money(row.subscription.profit)}
                          </span>
                          <span className="block text-xs text-muted">margin {fmtPct(row.subscription.margin)}</span>
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">
              Figures are for one account over its first year; a plan sold to several users is that many times the
              subscription. Storage keeps every month's evidence, so each month
              costs a little more than the one before.
            </p>

            <h3 className="mt-6 mb-2 text-xs font-medium text-ink-2">What each plan includes</h3>
            <ul className="space-y-1 text-sm text-ink-2">
              {result.plans.map((plan) => (
                <li key={plan.plan_id}>
                  <span className="font-medium text-ink">{plan.name}</span> · {fmtNum(plan.projects)} active projects / work records ·{" "}
                  {fmtNum(plan.users)} {plan.users === 1 ? "user" : "users"} —{" "}
                  {plan.onboarding_ids.length === 0
                    ? "subscription only, no onboarding"
                    : plan.onboarding_ids.map((id) => nameById.get(id) ?? id).join(", ")}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {result && !plansOnly && (
          <Section
            page
            title="3 · Scenarios"
            intro="Each scenario is a number of buildings, and its amounts are for all of them. Year 1 adds the onboarding, 12 months of subscription and the yearly services."
          >
            <Table
              head={[
                "Scenario",
                "Buildings",
                "Price per building / month",
                "Onboarding, once",
                "Subscription, per year",
                ...(yearlyExtras ? ["Yearly services, per year"] : []),
                "Year 1 profit",
              ]}
              rows={result.bands.map((band) => {
                const discount = project.bands.find((b) => b.id === band.band_id)?.discount ?? 0;
                const year1 = band.years[0];
                return [
                  `Band ${band.position}`,
                  fmtNum(band.buildings),
                  `${money(perMonth(band.subscription.price_per_building))}${discount > 0 ? ` (${fmtPct(discount)} off)` : ""}`,
                  money(band.onboarding.price),
                  money(band.subscription.price),
                  ...(yearlyExtras ? [money(band.yearly_extras.price)] : []),
                  `${money(year1?.profit)} · ${fmtPct(year1?.margin)}`,
                ];
              })}
            />

            <h3 className="mt-6 mb-2 text-xs font-medium text-ink-2">What each scenario includes</h3>
            <ul className="space-y-1 text-sm text-ink-2">
              {result.bands.map((band) => (
                <li key={band.band_id}>
                  <span className="font-medium text-ink">Band {band.position}</span> · {fmtNum(band.buildings)} buildings
                  —{" "}
                  {band.onboarding_ids.length === 0
                    ? "subscription only, no onboarding"
                    : band.onboarding_ids.map((id) => nameById.get(id) ?? id).join(", ")}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {suggestion && (
          <Section page title="4 · What the AI suggests">
            <div className="mb-4 flex flex-wrap gap-8">
              <div>
                <div className="text-xs text-muted">Subscription</div>
                <div className="text-lg font-semibold text-ink">
                  {money(perMonth(suggestion.subscription_price_per_building))}
                </div>
                <div className="text-xs text-muted">per building / month</div>
              </div>
              <div>
                <div className="text-xs text-muted">Onboarding</div>
                <div className="text-lg font-semibold text-ink">
                  {money(suggestion.onboarding_price_per_building)}
                </div>
                <div className="text-xs text-muted">per building, billed once</div>
              </div>
            </div>

            <p className="text-sm font-medium text-ink">{suggestion.positioning}</p>
            <p className="mt-1 text-sm text-ink-2">{suggestion.rationale}</p>

            {suggestion.risks.length > 0 && (
              <>
                <h3 className="mt-4 mb-1 text-xs font-medium text-ink-2">Risks</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                  {suggestion.risks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </>
            )}

            {suggestion.bands.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-4 font-medium">Buildings</th>
                    <th className="py-2 pr-4 text-right font-medium">Suggested / building / month</th>
                    <th className="py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestion.bands.map((band) => (
                    <tr key={`${band.buildings}`} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 tabular-nums text-ink">{fmtNum(band.buildings)}</td>
                      <td className="py-2 pr-4 text-right font-medium tabular-nums text-ink">
                        {money(perMonth(band.subscription_price_per_building))}
                      </td>
                      <td className="py-2 text-ink-2">{band.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p className="mt-4 text-xs text-muted">
              Answered by {suggestion.model} on {fmtDate(suggestion.created_at)}
              {project.market.industry.trim() && `, told the industry is ${project.market.industry.trim()}`}. A
              suggestion, not a decision: the arithmetic above is the app's own.
            </p>
          </Section>
        )}
      </article>
    </div>,
    document.body,
  );
}

/** One part of the report; `page` starts it on a new printed page. */
function Section({
  title,
  intro,
  page,
  children,
}: {
  title: string;
  intro?: string;
  page?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={clsx("report-section mb-10", page && "report-page")}>
      <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">{title}</h2>
      {intro && <p className="mt-1 text-sm text-ink-2">{intro}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A plain table: text on the left, figures on the right, and an optional bold total. */
function Table({
  caption,
  head,
  rows,
  total,
}: {
  caption?: string;
  head: string[];
  rows: string[][];
  total?: string[];
}) {
  const cell = (i: number) => clsx("py-2", i < head.length - 1 && "pr-4", i > 0 && "text-right tabular-nums");
  return (
    <div className="mt-4 first:mt-0">
      {caption && <h3 className="mb-1 text-xs font-medium text-ink-2">{caption}</h3>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {head.map((h, i) => (
              <th key={h} className={clsx(cell(i), "text-left font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-line last:border-0">
              {row.map((v, i) => (
                <td key={i} className={clsx(cell(i), i === 0 ? "text-ink" : "text-ink-2")}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="border-t border-ink/20 font-semibold text-ink">
              {total.map((v, i) => (
                <td key={i} className={cell(i)}>
                  {v}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <span className="text-ink-2">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}
