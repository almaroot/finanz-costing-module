import clsx from "clsx";
import { ChartColumn, ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Settings, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ProjectSummary } from "./bindings/ProjectSummary";
import { ProjectWizard } from "./features/project/ProjectWizard";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { Isotipo } from "./components/Isotipo";
import { flushPendingSave, useApp } from "./store";

export default function App() {
  const view = useApp((s) => s.view);
  const project = useApp((s) => s.project);
  const error = useApp((s) => s.error);
  const { init, showProjects, showSettings, dismissError } = useApp.getState();

  useEffect(() => {
    void init();
    window.addEventListener("beforeunload", flushPendingSave);
    return () => window.removeEventListener("beforeunload", flushPendingSave);
  }, [init]);

  return (
    <div className="flex h-full">
      <aside className="glass sticky top-0 flex h-full w-61 shrink-0 flex-col gap-6 border-r border-line px-3.5 py-5">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5">
          <Isotipo className="size-6.5 shrink-0 rounded-[0.42rem]" />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight text-ink">Finanz analyzer</div>
            <div className="text-xs text-ink-2">Costs &amp; pricing</div>
          </div>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5">
          <NavItem icon={<FolderOpen />} active={view === "projects"} onClick={() => void showProjects()}>
            Projects
          </NavItem>
          <ProjectTree />
          <NavItem icon={<Settings />} active={view === "settings"} onClick={() => void showSettings()}>
            Settings
          </NavItem>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {view === "projects" && <ProjectsPage />}
        {view === "project" && project && <ProjectWizard key={project.id} />}
        {view === "settings" && <SettingsPage />}
      </main>

      {error && (
        <div
          role="alert"
          className="fixed right-4 bottom-4 flex max-w-md items-start gap-3 rounded-lg border border-bad/40 bg-surface p-3 text-sm text-ink shadow-lg"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" aria-label="Close" onClick={dismissError} className="text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({
  icon,
  active,
  onClick,
  children,
}: {
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
        "[&_svg]:size-[15px] [&_svg]:shrink-0",
        active
          ? "border-line bg-surface/80 font-semibold text-ink [&_svg]:text-accent"
          : "border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink [&_svg]:text-muted",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * The projects in the sidebar, grouped in folders. A project is dragged onto a
 * folder to file it, or onto "No folder" to take it out. A folder exists while
 * a project is in it; a new one stays until the app is closed.
 */
function ProjectTree() {
  const view = useApp((s) => s.view);
  const project = useApp((s) => s.project);
  const projects = useApp((s) => s.projects);
  const { openProject, deleteProject, setProjectFolder, renameProject, updateSettings } = useApp.getState();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ folder: string; x: number; y: number } | null>(null);
  const colors = useApp((s) => s.settings?.folder_colors) ?? {};
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);

  /** Moves every project of a folder, and its colour, to another name; "" empties it. */
  const moveFolder = (from: string, to: string) => {
    for (const p of projects.filter((p) => p.folder === from)) void setProjectFolder(p.id, to);
    setCreated(created.filter((f) => f !== from).concat(to && !created.includes(to) ? [to] : []));
    const next = { ...colors };
    if (to && colors[from]) next[to] = colors[from];
    delete next[from];
    updateSettings({ folder_colors: next });
  };

  useEffect(() => {
    if (!menu && !folderMenu) return;
    const close = () => {
      setMenu(null);
      setFolderMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, folderMenu]);
  const [created, setCreated] = useState<string[]>([]);
  const [closed, setClosed] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const folders = [...new Set([...projects.map((p) => p.folder).filter(Boolean), ...created])].sort((a, b) =>
    a.localeCompare(b),
  );

  const dropProps = (folder: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setTarget(folder);
    },
    onDragLeave: () => setTarget(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setTarget(null);
      const id = e.dataTransfer.getData("text/plain");
      if (id) void setProjectFolder(id, folder);
    },
  });

  const item = (p: ProjectSummary) =>
    renaming === p.id ? (
      <form
        key={p.id}
        className="px-1 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          const name = new FormData(e.currentTarget).get("name")?.toString().trim();
          if (name && name !== p.name) void renameProject(p.id, name);
          setRenaming(null);
        }}
      >
        <input
          name="name"
          autoFocus
          defaultValue={project?.id === p.id ? project.name : p.name}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
          className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
        />
      </form>
    ) : confirming === p.id ? (
      <div key={p.id} className="flex items-center gap-1 rounded-md bg-bad/10 px-3 py-2 text-[13px]">
        <span className="mr-auto text-bad">Delete?</span>
        <button type="button" className="px-1.5 text-ink-2 hover:text-ink" onClick={() => setConfirming(null)}>
          No
        </button>
        <button
          type="button"
          className="px-1.5 font-semibold text-bad"
          onClick={() => {
            setConfirming(null);
            void deleteProject(p.id);
          }}
        >
          Yes
        </button>
      </div>
    ) : (
      <div
        key={p.id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setFolderMenu(null);
          setMenu({ id: p.id, x: e.clientX, y: e.clientY });
        }}
        className="group relative"
      >
        <NavItem
          icon={<ChartColumn />}
          active={view === "project" && project?.id === p.id}
          onClick={() => void openProject(p.id)}
        >
          <span className="truncate pr-5">{project?.id === p.id ? project.name : p.name}</span>
        </NavItem>
        <button
          type="button"
          aria-label={`Delete ${p.name}`}
          onClick={() => setConfirming(p.id)}
          className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded p-1 text-muted group-hover:block hover:text-bad"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    );

  return (
    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto select-none">
      {naming ? (
        <form
          className="px-1 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get("name")?.toString().trim();
            if (name) setCreated([...created, name]);
            setNaming(false);
          }}
        >
          <input
            name="name"
            autoFocus
            placeholder="Folder name"
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-ink"
        >
          <FolderPlus className="size-[15px]" /> New folder
        </button>
      )}
      {folders.map((folder) => {
        const open = !closed.includes(folder);
        return (
          <div key={folder} {...dropProps(folder)} className={clsx("rounded-md", target === folder && "bg-accent-soft")}>
            {renamingFolder === folder ? (
              <form
                className="px-1 py-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = new FormData(e.currentTarget).get("name")?.toString().trim();
                  if (name && name !== folder) moveFolder(folder, name);
                  setRenamingFolder(null);
                }}
              >
                <input
                  name="name"
                  autoFocus
                  defaultValue={folder}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                  onKeyDown={(e) => e.key === "Escape" && setRenamingFolder(null)}
                  className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                />
              </form>
            ) : (
            <button
              type="button"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
                setFolderMenu({ folder, x: e.clientX, y: e.clientY });
              }}
              onClick={() => setClosed(open ? [...closed, folder] : closed.filter((f) => f !== folder))}
              className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-3 py-2 text-left text-[13px] font-semibold text-ink-2 hover:bg-surface-2"
            >
              <ChevronRight className={clsx("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
              <Folder
                className="size-[15px] shrink-0 text-muted"
                style={colors[folder] ? { color: `var(--${colors[folder]})`, fill: `var(--${colors[folder]})` } : undefined}
              />
              <span className="truncate">{folder}</span>
            </button>
            )}
            {open && <div className="ml-[19px] space-y-0.5 border-l border-line pl-2.5">{projects.filter((p) => p.folder === folder).map(item)}</div>}
          </div>
        );
      })}

      <div {...dropProps("")} className={clsx("rounded-md", target === "" && "bg-accent-soft")}>
        {folders.length > 0 && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted uppercase">No folder</div>}
        {projects.filter((p) => !p.folder).map(item)}
      </div>

      {folderMenu && (
        createPortal(
        <div
          role="menu"
          style={{ left: folderMenu.x, top: folderMenu.y }}
          className="fixed z-50 w-52 rounded-lg border border-line bg-surface p-1 shadow-lg [&_[role=menuitem]]:whitespace-nowrap"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => setRenamingFolder(folderMenu.folder)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-surface-2"
          >
            <Pencil className="size-3.5 text-muted" /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            title="Its projects move to No folder"
            onClick={() => moveFolder(folderMenu.folder, "")}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-bad hover:bg-bad/10"
          >
            <Trash2 className="size-3.5" /> Delete folder
          </button>
          <div className="mx-1 my-1 border-t border-line" />
          <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-muted uppercase">Colour</div>
          <div className="flex justify-between px-2.5 pb-2">
            {[null, ...Array.from({ length: 8 }, (_, i) => `cat-${i + 1}`)].map((c) => (
              <button
                key={c ?? "none"}
                type="button"
                role="menuitem"
                aria-label={c ?? "No colour"}
                onClick={() => {
                  const next = { ...colors };
                  if (c) next[folderMenu.folder] = c;
                  else delete next[folderMenu.folder];
                  updateSettings({ folder_colors: next });
                }}
                className={clsx(
                  "size-4 rounded-full border border-line transition-transform hover:scale-125",
                  (colors[folderMenu.folder] ?? null) === c && "ring-2 ring-ink-2 ring-offset-2 ring-offset-surface",
                )}
                style={{ background: c ? `var(--${c})` : "transparent" }}
              />
            ))}
          </div>
        </div>,
        document.body,
        )
      )}

      {menu && (
        createPortal(
        <div
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          className="fixed z-50 min-w-36 rounded-lg border border-line bg-surface p-1 text-[13px] shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => setRenaming(menu.id)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-ink hover:bg-surface-2"
          >
            <Pencil className="size-3.5 text-muted" /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setConfirming(menu.id)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-bad hover:bg-bad/10"
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
        </div>,
        document.body,
        )
      )}

    </div>
  );
}
