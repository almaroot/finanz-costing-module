import clsx from "clsx";
import { Copy, Download, FileUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ProjectTemplate } from "../../bindings/ProjectTemplate";
import { Button, Card, Field, Page, TextInput } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { TEMPLATE_LABELS, TEMPLATES } from "../../lib/labels";
import { useApp } from "../../store";

export function ProjectsPage() {
  const projects = useApp((s) => s.projects);
  const { createProject, openProject, duplicateProject, deleteProject, exportProject, importProject } =
    useApp.getState();

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [template, setTemplate] = useState<ProjectTemplate>("building_owners");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [exported, setExported] = useState<{ id: string; path: string } | null>(null);
  const [mode, setMode] = useState<"new" | "import">("new");

  return (
    <Page title="Projects" subtitle="Pick a template, enter the costs and the app works out the price per building.">
      <Card
        title={
          <span className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
            {(["new", "import"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={clsx(
                  "rounded-md px-3.5 py-1.5 font-semibold transition-colors",
                  mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
                )}
              >
                {m === "new" ? "New project" : "Import"}
              </button>
            ))}
          </span>
        }
        className="mb-7"
      >
        {mode === "import" ? (
          <DropZone onFile={(data) => void importProject(data)} onBrowse={() => void importProject()} />
        ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void createProject(name, client, template);
            setName("");
            setClient("");
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Project name">
              <TextInput value={name} placeholder="e.g. MODLE pricing 2026" onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Client">
              <TextInput value={client} placeholder="Optional" onChange={(e) => setClient(e.target.value)} />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-2.5 text-[13px] font-medium text-ink-2">Template</legend>
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {TEMPLATES.map((option) => {
                const selected = option.value === template;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTemplate(option.value)}
                    className={clsx(
                      "flex flex-col gap-2.5 rounded-lg border p-4 text-left transition-colors",
                      selected
                        ? "border-accent/40 bg-accent-soft ring-3 ring-accent/10"
                        : "border-line bg-surface hover:border-ink-2/30",
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={clsx(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-surface",
                          selected ? "border-accent" : "border-line",
                        )}
                      >
                        <span className={clsx("size-2 rounded-full", selected && "bg-accent")} />
                      </span>
                      <span className="text-[15px] font-semibold tracking-tight text-ink">{option.label}</span>
                    </span>
                    <span className="text-[13px] leading-relaxed text-ink-2">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Button type="submit" variant="primary" className="h-11 px-4.5 font-semibold">
            <Plus /> Create project
          </Button>
        </form>
        )}
      </Card>

      <div className="mb-4 flex items-baseline gap-2.5 px-0.5">
        <h2 className="text-[17px] font-semibold tracking-tight text-ink">All projects</h2>
        <span className="text-[13px] text-muted">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </span>
      </div>

      {projects.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">No projects yet. Create the first one above.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const owners = p.template === "building_owners";
            return (
              <li
                key={p.id}
                className="glass flex flex-col overflow-hidden rounded-xl border border-line shadow-sm transition-colors hover:border-accent/40"
              >
                <button
                  type="button"
                  onClick={() => void openProject(p.id)}
                  className="flex flex-1 flex-col gap-3.5 p-4.5 text-left"
                >
                  <span className="flex items-start gap-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold tracking-tight text-ink">{p.name}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-ink-2">{p.client || "No client"}</span>
                    </span>
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
                        owners ? "bg-accent-soft text-accent-ink" : "bg-teal-soft text-teal-ink",
                      )}
                    >
                      {TEMPLATE_LABELS[p.template].replace("Modle - ", "")}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                    <span className="font-medium">{p.currency}</span>
                    <span className="size-[3px] rounded-full bg-axis" />
                    <span className="text-muted">Edited {fmtDate(p.updated_at)}</span>
                  </span>
                </button>
                <div className="flex items-center justify-end gap-1 border-t border-line bg-page/60 px-3 py-2">
                  {confirmingId === p.id ? (
                    <>
                      <span className="mr-auto text-xs text-ink-2">Delete permanently?</span>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setConfirmingId(null);
                          void deleteProject(p.id);
                        }}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      {exported?.id === p.id && (
                        <span className="mr-auto truncate text-xs text-ink-2" title={exported.path}>
                          Saved to {exported.path.split(/[\\/]/).slice(-2).join("/")}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const path = await exportProject(p.id);
                          if (path) setExported({ id: p.id, path });
                        }}
                      >
                        <Download /> Export
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void duplicateProject(p.id)}>
                        <Copy /> Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${p.name}`}
                        className="hover:bg-bad/10 hover:text-bad"
                        onClick={() => setConfirmingId(p.id)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

/** Takes an exported project file, dropped on it or picked with the file dialog. */
function DropZone({ onFile, onBrowse }: { onFile: (data: string) => void; onBrowse: () => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={onBrowse}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) void file.text().then(onFile);
      }}
      className={clsx(
        "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
        over ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50",
      )}
    >
      <FileUp className="size-7 text-accent" />
      <span className="text-[15px] font-semibold text-ink">Drop a project file here</span>
      <span className="text-[13px] text-ink-2">or click to choose one · .json exported from Finanz analyzer</span>
    </button>
  );
}
