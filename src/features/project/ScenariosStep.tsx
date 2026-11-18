import clsx from "clsx";
import { Check, ChevronDown, Plus, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Band } from "../../bindings/Band";
import type { BandResult } from "../../bindings/BandResult";
import type { OnboardingItem } from "../../bindings/OnboardingItem";
import type { OnboardingLine } from "../../bindings/OnboardingLine";
import type { Project } from "../../bindings/Project";
import type { ProjectResult } from "../../bindings/ProjectResult";
import { Callout, Card, NumberField } from "../../components/ui";
import { fmtNum, fmtPct } from "../../lib/format";
import { useApp } from "../../store";
import { defaultSelection, isDefault, offered, toggleSelection, type Money } from "./shared";

type Mode = "markup" | "amount";
type Period = "month" | "year";

const buildingsLabel = (n: number) => `${fmtNum(n)} ${n === 1 ? "building" : "buildings"}`;
const tone = (v: number) => (Math.abs(v) < 0.005 ? "text-muted" : v > 0 ? "text-good" : "text-bad");

/** How many of an element a band of `buildings` pays for. */
function quantity(item: OnboardingItem, buildings: number) {
  return item.basis === "per_building" ? buildings : Math.max(item.quantity, 0);
}

/** Why an element can't go with the others in `selection`, if it can't. */
function blockedBy(catalogue: OnboardingItem[], selection: string[], item: OnboardingItem): string | undefined {
  for (const other of catalogue) {
    if (other.id === item.id || !selection.includes(other.id)) continue;
    if (other.makes_unnecessary.includes(item.id)) return `Covered by ${other.name}`;
    if (item.exclusive_group && other.exclusive_group === item.exclusive_group) return `Alternative to ${other.name}`;
  }
  return undefined;
}

/** Step 4 — the volume scenarios: an overview of year 1, then one band at a time. */
export function StepScenarios({ project, result, money }: { project: Project; result: ProjectResult | null; money: Money }) {
  const updateProject = useApp((s) => s.updateProject);
  const [active, setActive] = useState(0);
  const [period, setPeriod] = useState<Period>("year");
  const [extrasFor, setExtrasFor] = useState<string | null>(null);

  const resultById = new Map(result?.bands.map((b) => [b.band_id, b]));
  const current = Math.min(active, project.bands.length - 1);
  const band = project.bands[current];

  const setBand = (id: string, patch: Partial<Band>) =>
    updateProject((p) => ({ ...p, bands: p.bands.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

  const addBand = () => {
    updateProject((p) => {
      const last = p.bands[p.bands.length - 1];
      return {
        ...p,
        bands: [
          ...p.bands,
          {
            id: crypto.randomUUID(),
            buildings: last ? Math.max(1, last.buildings) * 2 : 1,
            price: last?.price ?? null,
            discount: last?.discount ?? 0,
            // A new band starts from the previous one, so you don't re-tick everything.
            onboarding: [...(last?.onboarding ?? defaultSelection(p.onboarding))],
          },
        ],
      };
    });
    setActive(project.bands.length);
  };

  const removeBand = (id: string, index: number) => {
    updateProject((p) => ({ ...p, bands: p.bands.filter((b) => b.id !== id) }));
    // Removing a band before the open one keeps the same band open.
    if (index <= current) setActive(Math.max(0, current - 1));
  };

  const bands = result?.bands ?? [];
  const most = Math.max(1, ...bands.map((b) => Math.max(b.years[0]?.price ?? 0, b.years[0]?.cost ?? 0)));
  const bar = (v: number) => `${Math.max((v / most) * 78, 0.6)}%`;
  const editing = project.bands.find((b) => b.id === extrasFor);

  return (
    <div className="space-y-4">
      {result && result.warnings.length > 0 && (
        <Callout tone="warn" icon={<TriangleAlert />}>
          <ul className="space-y-1">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Card
        title="Scenario table"
        description="You type the price per building per month; this table shows what each scenario bills and costs in a whole year, all of its buildings added up."
      >
        <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[13px] text-ink-2">
          <Legend className="bg-income">What the client pays us</Legend>
          <Legend className="bg-[var(--cost-soft)]">What it costs us</Legend>
          <Legend className="bg-good">What we keep</Legend>
          <span className="text-muted">All figures in {project.currency}, all of the band's buildings added up.</span>
        </div>

        {bands.length > 0 && (
          <div className="mt-5 rounded-[14px] border border-line bg-surface px-5 pt-[18px] pb-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <div className="text-[15px] font-semibold text-ink">All scenarios · year 1</div>
              <div className="text-xs text-muted">Onboarding plus 12 months of subscription and yearly extras. Pick one to see its detail below.</div>
            </div>
            <div className="mt-3 flex flex-col gap-1 tabular-nums">
              {bands.map((b, i) => {
                const year = b.years[0];
                const on = i === current;
                return (
                  <button
                    key={b.band_id}
                    type="button"
                    onClick={() => setActive(i)}
                    className={clsx(
                      "grid w-full grid-cols-[minmax(100px,150px)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-[10px] border px-3 py-2.5 text-left",
                      on ? "border-accent/30 bg-accent-soft" : "border-transparent hover:bg-surface-2/60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className={clsx("block text-sm text-ink", on ? "font-semibold" : "font-medium")}>
                        Band {b.position}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{buildingsLabel(b.buildings)}</span>
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-3 shrink-0 rounded-[3px] bg-income" style={{ width: bar(year?.price ?? 0) }} />
                        <span className="text-xs whitespace-nowrap text-income">{money(year?.price)}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-3 shrink-0 rounded-[3px] bg-[var(--cost-soft)]"
                          style={{ width: bar(year?.cost ?? 0) }}
                        />
                        <span className="text-xs whitespace-nowrap text-bad">{money(year?.cost)}</span>
                      </span>
                    </span>
                    <span className="block min-w-[110px] text-right">
                      <span className={clsx("block text-[15px] font-bold whitespace-nowrap", tone(year?.profit ?? 0))}>
                        <Signed value={year?.profit} money={money} />
                      </span>
                      {year?.profit_per_building != null && (
                        <span className="mt-0.5 block text-xs whitespace-nowrap text-muted">
                          <Signed value={year.profit_per_building} money={money} /> per building
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div role="tablist" className="mt-[22px] flex items-end gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line">
          {project.bands.map((b, i) => {
            const on = i === current;
            const profit = resultById.get(b.id)?.years[0]?.profit;
            const removable = project.bands.length > 1;
            return (
              <div
                key={b.id}
                className={clsx(
                  "relative -mb-px shrink-0 border-b-2",
                  on ? "border-accent" : "border-transparent hover:border-ink-2/20",
                )}
              >
                <button
                  role="tab"
                  aria-selected={on}
                  type="button"
                  onClick={() => setActive(i)}
                  className={clsx(
                    "flex flex-col items-start gap-[3px] pt-2.5 pb-[11px] pl-4 whitespace-nowrap",
                    removable ? "pr-[34px]" : "pr-4",
                  )}
                >
                  <span className={clsx("text-[15px]", on ? "font-semibold text-ink" : "font-medium text-ink-2")}>
                    Band {i + 1}
                  </span>
                  <span className="flex gap-1.5 text-xs whitespace-nowrap text-muted">
                    <span>{buildingsLabel(b.buildings)}</span>
                    <span className={clsx("font-semibold", tone(profit ?? 0))}>
                      <Signed value={profit} money={money} />
                    </span>
                  </span>
                </button>
                {removable && (
                  <button
                    type="button"
                    aria-label={`Remove band ${i + 1}`}
                    title="Remove band"
                    onClick={() => removeBand(b.id, i)}
                    className="absolute top-[9px] right-1.5 flex rounded-md p-1 text-muted hover:bg-bad/10 hover:text-bad [&_svg]:size-2.5"
                  >
                    <X strokeWidth={2.2} />
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addBand}
            className="mb-2 ml-2 flex items-center gap-1.5 rounded-[9px] border border-dashed border-ink-2/30 px-[11px] py-[7px] text-[13px] font-medium whitespace-nowrap text-ink-2 hover:border-accent/50 hover:text-accent-ink [&_svg]:size-3"
          >
            <Plus /> Add band
          </button>
        </div>

        {band && (
          <BandPanel
            key={band.id}
            band={band}
            computed={resultById.get(band.id)}
            lines={new Map(result?.onboarding_lines.map((l) => [l.id, l]))}
            project={project}
            money={money}
            period={period}
            onPeriod={setPeriod}
            onChange={(patch) => setBand(band.id, patch)}
            onExtras={() => setExtrasFor(band.id)}
          />
        )}
      </Card>

      {editing && (
        <ExtrasModal
          band={editing}
          index={project.bands.indexOf(editing)}
          project={project}
          result={result}
          money={money}
          onClose={() => setExtrasFor(null)}
          onApply={(onboarding) => {
            setBand(editing.id, { onboarding });
            setExtrasFor(null);
          }}
        />
      )}
    </div>
  );
}

/** One of the band's three boxes of controls, under a small caps title. */
function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-[9px] rounded-xl border border-line bg-surface-2/30 px-[13px] pt-[11px] pb-[13px]">
      <div className="flex items-baseline gap-[7px] whitespace-nowrap">
        <span className="text-[11px] font-semibold tracking-[.06em] text-ink uppercase">{title}</span>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <span className="flex items-center gap-[7px]">
      <span className={clsx("size-2 rounded-full", className)} />
      {children}
    </span>
  );
}

/** A profit with its sign: "+1,200.00", "−300.00", or a plain zero. */
function Signed({ value, money }: { value: number | null | undefined; money: Money }) {
  if (value == null) return <>—</>;
  if (Math.abs(value) < 0.005) return <>{money(0)}</>;
  return (
    <>
      {value > 0 ? "+" : "−"}
      {money(Math.abs(value))}
    </>
  );
}

function BandPanel({
  band,
  computed,
  lines,
  project,
  money,
  period,
  onPeriod,
  onChange,
  onExtras,
}: {
  band: Band;
  computed: BandResult | undefined;
  /** Every catalogue element as the engine priced it, per unit. */
  lines: Map<string, OnboardingLine>;
  project: Project;
  money: Money;
  period: Period;
  onPeriod: (period: Period) => void;
  onChange: (patch: Partial<Band>) => void;
  onExtras: () => void;
}) {
  const rule = band.price;
  const mode: Mode = rule?.type ?? "amount";

  // Extras: what the band adds on top of the default package, priced for its buildings.
  const priced = new Set(computed?.onboarding_ids ?? []);
  const extras = offered(project.onboarding).filter((item) => priced.has(item.id) && !isDefault(item.id));
  // Only the one-off extras are part of the onboarding; the yearly ones have their own column.
  const oneOff = extras.filter((i) => i.recurrence === "one_off");
  const extrasPrice = oneOff.reduce((s, i) => s + (lines.get(i.id)?.unit_price ?? 0) * quantity(i, band.buildings), 0);
  const extrasCost = oneOff.reduce((s, i) => s + (lines.get(i.id)?.unit_cost ?? 0) * quantity(i, band.buildings), 0);

  const months = period === "year" ? 1 : 1 / 12;
  // Its own column whenever the catalogue has a yearly service, picked by this band or not.
  const yearlyNames = offered(project.onboarding)
    .filter((i) => i.recurrence === "annual")
    .map((i) => i.name);
  const yearly = yearlyNames.length > 0;
  const cols = computed
    ? [
        { price: computed.onboarding.price, cost: computed.onboarding.cost },
        { price: computed.subscription.price * months, cost: computed.subscription.cost * months },
        ...(yearly ? [{ price: computed.yearly_extras.price * months, cost: computed.yearly_extras.cost * months }] : []),
      ]
    : [];
  const grid = yearly
    ? "grid-cols-[minmax(110px,.7fr)_repeat(3,minmax(170px,1fr))]"
    : "grid-cols-[minmax(110px,.7fr)_repeat(2,minmax(200px,1fr))]";
  const margin = (price: number, cost: number) => (price <= 0 ? "—" : `${fmtPct((price - cost) / price)} margin`);

  return (
    <div className="mt-4 rounded-[14px] border border-line bg-surface">
      <div className="flex flex-wrap items-stretch gap-3 px-5 pt-4 pb-[18px]">
        <Group title="Band">
          <label className="flex flex-col gap-[5px]">
            <span className="text-xs font-medium text-ink-2">Buildings</span>
            <NumberField
              className="w-[72px]"
              value={band.buildings}
              min={0}
              integer
              onChange={(v) => onChange({ buildings: v })}
            />
          </label>
        </Group>

        <Group title="Subscription" note="every month">
          <div className="flex flex-wrap items-end gap-3">
            <ChargeAs
              mode={mode}
              onPick={(next) =>
                onChange({
                  price:
                    next === "amount"
                      ? { type: "amount", value: computed?.subscription.price_per_building ?? 0 }
                      : { type: "markup", percent: project.subscription_markup },
                })
              }
            />
            {rule?.type === "markup" && (
              <label className="flex flex-col gap-[5px]">
                <span className="text-xs font-medium text-ink-2">Markup</span>
                <NumberField
                  className="w-20"
                  value={rule.percent}
                  min={0}
                  scale={100}
                  suffix="%"
                  onChange={(v) => onChange({ price: { type: "markup", percent: v } })}
                />
              </label>
            )}
            <label className="flex flex-col gap-[5px]">
              <span className="text-xs font-medium text-ink-2">Price per building</span>
              {/* Always editable: typing a price makes it a fixed one. */}
              <NumberField
                className="w-32"
                value={rule?.type === "amount" ? rule.value : (computed?.subscription.price_per_building ?? 0)}
                min={0}
                scale={1 / 12}
                decimals={2}
                prefix={project.currency}
                onChange={(v) => onChange({ price: { type: "amount", value: v } })}
              />
            </label>
            <label className="flex flex-col gap-[5px]">
              <span className="text-xs font-medium text-ink-2">Discount</span>
              <NumberField
                className="w-20"
                value={band.discount}
                min={0}
                scale={100}
                decimals={2}
                suffix="%"
                onChange={(v) => onChange({ discount: Math.min(v, 1) })}
              />
            </label>
          </div>
        </Group>

        {project.onboarding.length > 0 && (
          <Group title="Onboarding" note="billed once">
            <div className="flex flex-col gap-[5px]">
              <span className="text-xs font-medium text-ink-2">Extra services</span>
              <button
                type="button"
                onClick={onExtras}
                className="flex h-9 items-center gap-[7px] rounded-[9px] bg-accent px-3 text-sm font-semibold whitespace-nowrap text-white hover:bg-accent-ink [&_svg]:size-3"
              >
                <Plus /> Add extras
              </button>
            </div>
          </Group>
        )}
      </div>

      {extras.length > 0 && (
        <div className="flex flex-col gap-2 px-5 pb-4">
          <span className="text-xs font-semibold text-ink">
            {extras.length} extra {extras.length === 1 ? "service" : "services"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {extras.map((item) => (
              <span
                key={item.id}
                title={item.name}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/20 bg-accent-soft py-0.5 pr-0.5 pl-[9px] text-xs font-medium text-accent-ink"
              >
                <span className="min-w-0 truncate">{item.name}</span>
                {item.recurrence === "annual" && (
                  <span className="shrink-0 rounded-full bg-accent/10 px-1.5 text-[10px] font-semibold tracking-wide uppercase">
                    yearly
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => onChange({ onboarding: band.onboarding.filter((id) => id !== item.id) })}
                  className="flex size-5 items-center justify-center rounded-full text-accent hover:bg-accent/15 [&_svg]:size-2.5"
                >
                  <X strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {computed && (
        <div className="overflow-x-auto">
          <div className={clsx("tabular-nums", yearly ? "min-w-[640px]" : "min-w-[520px]")}>
            <div className={clsx("grid border-y border-line bg-surface-2/50", grid)}>
              <div />
              <div className="px-5 py-2.5 text-right">
                <div className="text-xs font-semibold text-ink">Onboarding</div>
                <div className="mt-px text-[11px] text-muted">billed once</div>
              </div>
              <div className="border-l border-line px-5 py-2.5 text-right">
                <div className="text-xs font-semibold text-ink">Subscription</div>
                <div role="group" aria-label="Subscription period" className="mt-[5px] inline-flex gap-0.5 rounded-lg bg-ink/5 p-0.5">
                  {(["month", "year"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onPeriod(p)}
                      className={clsx(
                        "rounded-md border px-2.5 py-[3px] text-xs whitespace-nowrap",
                        period === p
                          ? "border-line bg-surface font-semibold text-ink"
                          : "border-transparent font-medium text-ink-2 hover:text-ink",
                      )}
                    >
                      {p === "month" ? "Month" : "Year"}
                    </button>
                  ))}
                </div>
              </div>
              {yearly && (
                <div className="border-l border-line px-5 py-2.5 text-right">
                  <div className="text-xs font-semibold text-ink">
                    {yearlyNames.length === 1 ? yearlyNames[0] : "Yearly extras"}
                  </div>
                  <div className="mt-px text-[11px] text-muted">
                    {computed.yearly_extras.cost > 0 ? `billed apart, per ${period}` : "not in this band · Add extras"}
                  </div>
                </div>
              )}
            </div>

            {(
              [
                { label: "Price", dot: "bg-income", value: (c: (typeof cols)[0]) => c.price, extra: extrasPrice },
                { label: "Cost", dot: "bg-[var(--cost-soft)]", value: (c: (typeof cols)[0]) => c.cost, extra: extrasCost },
                { label: "Profit", dot: "bg-good", value: (c: (typeof cols)[0]) => c.price - c.cost, extra: 0 },
              ] as const
            ).map((row, r) => (
              <div
                key={row.label}
                className={clsx(
                  "grid items-start",
                  grid,
                  r === 1 && "border-t border-line/60",
                  r === 2 && "border-t border-ink/15",
                )}
              >
                <div className={clsx("flex items-center gap-2 px-5 py-3 text-sm text-ink", r === 2 && "font-bold")}>
                  <span className={clsx("size-2 shrink-0 rounded-full", row.dot)} />
                  {row.label}
                </div>
                {cols.map((c, j) => {
                  const v = row.value(c);
                  return (
                    <div key={j} className={clsx("px-5 py-3 text-right whitespace-nowrap", j > 0 && "border-l border-line")}>
                      <div
                        className={clsx(
                          r === 2 ? clsx("text-base font-bold", tone(v)) : "text-sm",
                          r === 0 && "text-income",
                          r === 1 && "text-bad",
                        )}
                      >
                        {r === 0 ? money(v) : r === 1 ? `−${money(v)}` : <Signed value={v} money={money} />}
                      </div>
                      {r === 2 ? (
                        <div className="mt-0.5 text-xs text-muted">{margin(c.price, c.cost)}</div>
                      ) : r === 0 && j === 1 && band.discount > 0 && band.discount < 1 ? (
                        // The price before the discount, so both are in view.
                        <div className="mt-0.5 text-xs text-muted">
                          List price <span className="text-ink-2">{money(c.price / (1 - band.discount))}</span> ·{" "}
                          {fmtPct(band.discount)} off
                        </div>
                      ) : (
                        j === 0 &&
                        oneOff.length > 0 && (
                          <div className="mt-0.5 text-xs text-muted">incl. {money(row.extra)} in extras</div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-b-[13px] border-t border-line bg-surface-2/40 px-5 py-3.5">
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="text-sm font-semibold text-ink">Profit year 1</div>
          <div className="mt-0.5 text-xs text-muted">
            Onboarding plus 12 months of subscription{yearly ? " and the yearly extras" : ""}
          </div>
        </div>
        <div className={clsx("text-[22px] font-bold tracking-tight whitespace-nowrap tabular-nums", tone(computed?.years[0]?.profit ?? 0))}>
          <Signed value={computed?.years[0]?.profit} money={money} />
        </div>
      </div>
    </div>
  );
}

function ChargeAs({ mode, onPick }: { mode: Mode; onPick: (mode: Mode) => void }) {
  const [open, setOpen] = useState(false);
  const options: { value: Mode; label: string; desc: string }[] = [
    { value: "amount", label: "Fixed price", desc: "Type the price per building" },
    { value: "markup", label: "Own markup", desc: "A % on everything the subscription costs" },
  ];

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.("[data-charge-as]")) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  return (
    <div data-charge-as className="relative flex flex-col gap-[5px]">
      <span className="text-xs font-medium text-ink-2">Charge as</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex h-9 w-[196px] items-center gap-2.5 rounded-[9px] border bg-surface px-3 text-sm whitespace-nowrap text-ink",
          open ? "border-accent/45" : "border-line hover:border-ink-2/30",
        )}
      >
        <span className="flex-1 text-left">
          {options.find((o) => o.value === mode)?.label}
        </span>
        <ChevronDown className={clsx("size-3 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute top-[calc(100%+6px)] left-0 z-30 min-w-60 rounded-[11px] border border-line bg-surface p-1.5 shadow-[0_1px_2px_rgba(23,20,31,.05),0_20px_44px_-20px_rgba(23,20,31,.34)]"
        >
          {options.map((o) => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === mode}
              type="button"
              onClick={() => {
                setOpen(false);
                if (o.value !== mode) onPick(o.value);
              }}
              className={clsx(
                "block w-full rounded-lg px-[11px] py-[9px] text-left",
                o.value === mode ? "bg-accent-soft font-semibold text-accent-ink" : "font-medium text-ink hover:bg-surface-2",
              )}
            >
              <span className="block text-sm">{o.label}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted">{o.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Picks the band's onboarding: the default package and the extras on top, applied together. */
function ExtrasModal({
  band,
  index,
  project,
  result,
  money,
  onClose,
  onApply,
}: {
  band: Band;
  index: number;
  project: Project;
  result: ProjectResult | null;
  money: Money;
  onClose: () => void;
  onApply: (onboarding: string[]) => void;
}) {
  const [draft, setDraft] = useState(band.onboarding);
  const catalogue = offered(project.onboarding);
  const lines = new Map(result?.onboarding_lines.map((l) => [l.id, l]));
  const n = band.buildings;

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const chosen = catalogue.filter((item) => draft.includes(item.id) && !blockedBy(catalogue, draft, item));
  const included = chosen.filter((item) => isDefault(item.id));
  const extras = chosen.filter((item) => !isDefault(item.id));
  const sum = (items: OnboardingItem[], key: "unit_price" | "unit_cost", count: (i: OnboardingItem) => number) =>
    items.reduce((s, i) => s + (lines.get(i.id)?.[key] ?? 0) * count(i), 0);
  const perBuilding = (i: OnboardingItem) => (i.basis === "per_building" ? 1 : Math.max(i.quantity, 0));
  const forBand = (i: OnboardingItem) => quantity(i, n);
  const categories = [...new Set(catalogue.map((i) => i.category))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[3px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Extra services"
        className="relative flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[18px] bg-surface shadow-[0_30px_80px_-24px_rgba(23,20,31,.45)]"
      >
        <div className="flex items-start gap-4 border-b border-line px-6 pt-[22px] pb-4">
          <div className="min-w-0 flex-1">
            <div className="text-[19px] font-semibold tracking-tight text-ink">Extra services</div>
            <div className="mt-1 text-[13px] text-muted">
              Band {index + 1} · {buildingsLabel(n)}. Billed once, or every year when marked so, apart from the subscription.
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex rounded-lg p-[7px] text-ink-2 hover:bg-surface-2 hover:text-ink [&_svg]:size-3.5"
          >
            <X />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-5 tabular-nums">
          <div className="rounded-[10px] bg-surface-2/70 px-3.5 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-semibold text-ink">Already in the onboarding</span>
              <span className="text-xs text-muted">
                {included.length} services · {money(sum(included, "unit_price", perBuilding))} per building
              </span>
            </div>
            <div className="mt-1 text-xs leading-relaxed text-ink-2">
              {included.length ? included.map((i) => i.name).join(" · ") : "Nothing from the default package."}
            </div>
          </div>

          {categories.map((category) => (
            <div key={category} className="mt-[18px]">
              <div className="mb-2 text-[11px] font-semibold tracking-[.06em] text-muted uppercase">{category}</div>
              <div className="flex flex-col gap-1.5">
                {catalogue
                  .filter((item) => item.category === category)
                  .map((item) => {
                    const reason = blockedBy(catalogue, draft, item);
                    const off = reason !== undefined;
                    const on = !off && draft.includes(item.id);
                    const line = lines.get(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={off}
                        onClick={() => setDraft(toggleSelection(project.onboarding, draft, item.id, !on))}
                        className={clsx(
                          "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border px-3.5 py-[11px] text-left",
                          off
                            ? "cursor-not-allowed border-line/60 bg-surface-2/40"
                            : on
                              ? "border-accent/30 bg-accent-soft"
                              : "border-line bg-surface hover:border-ink-2/30",
                        )}
                      >
                        <span
                          className={clsx(
                            "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] [&_svg]:size-2.5",
                            on ? "border-accent bg-accent text-white" : off ? "border-line text-transparent" : "border-ink-2/30 text-transparent",
                          )}
                        >
                          <Check strokeWidth={3} />
                        </span>
                        <span className="min-w-0">
                          <span className={clsx("block text-sm", off ? "text-muted" : "text-ink")}>{item.name}</span>
                          {(reason || isDefault(item.id) || item.recurrence === "annual") && (
                            <span className="mt-0.5 block text-xs text-muted">{reason ?? (item.recurrence === "annual" ? "Billed every year" : "In the default package")}</span>
                          )}
                        </span>
                        <span className="text-right whitespace-nowrap">
                          <span className={clsx("block text-[13px] font-semibold", off ? "text-muted" : "text-income")}>
                            +{money(line?.unit_price)}
                          </span>
                          <span className={clsx("mt-0.5 block text-xs", off ? "text-muted" : "text-bad")}>
                            cost {money(line?.unit_cost)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3.5 border-t border-line bg-page/90 px-6 py-4">
          <div className="min-w-0 flex-[1_1_280px]">
            <div className="text-[13px] font-semibold text-ink">
              {extras.length ? `${extras.length} ${extras.length === 1 ? "extra" : "extras"} selected` : "No extras selected"}
            </div>
            <div className="mt-[3px] flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
              <span className="font-semibold text-income">
                +{money(sum(extras, "unit_price", perBuilding))} per building · +{money(sum(extras, "unit_price", forBand))}{" "}
                for {buildingsLabel(n)}
              </span>
              <span className="text-bad">Cost +{money(sum(extras, "unit_cost", forBand))}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-line bg-surface px-[15px] py-[9px] text-sm font-medium text-ink hover:border-ink-2/30"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApply(chosen.map((i) => i.id))}
              className="rounded-[10px] bg-accent px-4 py-[9px] text-sm font-semibold text-white hover:bg-accent-ink"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
