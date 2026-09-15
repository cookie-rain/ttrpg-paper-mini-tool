import { useEffect, useRef, useState } from 'react';
import { parseProject, useStore, type View } from './store';
import type { Unit } from './types';
import { downloadBlob } from './lib/output';
import { ConfirmButton, Segmented } from './components/controls';
import { Editor } from './components/Editor';
import { Lineup } from './components/Lineup';
import { PrintView } from './components/PrintView';
import { Sidebar } from './components/Sidebar';

const VIEWS: { value: View; label: string }[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'lineup', label: 'Lineup' },
  { value: 'print', label: 'Print' },
];

export function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const unit = useStore((s) => s.settings.unit);
  const updateSettings = useStore((s) => s.updateSettings);
  const loaded = useStore((s) => s.loaded);
  const [notice, setNotice] = useState<string | null>(null);
  const dragging = useFileDrop();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <span aria-hidden="true">🧙</span> TTRPG Paper-Mini Tool
        </h1>
        <nav>
          <Segmented<View> ariaLabel="View" value={view} options={VIEWS} onChange={setView} />
        </nav>
        <div className="header-actions">
          <Segmented<Unit>
            ariaLabel="Units"
            value={unit}
            options={[
              { value: 'mm', label: 'mm' },
              { value: 'in', label: 'in' },
            ]}
            onChange={(value) => updateSettings({ unit: value })}
          />
          <ProjectMenu onNotice={setNotice} />
        </div>
      </header>

      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}

      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          {!loaded ? null : view === 'editor' ? <Editor /> : view === 'lineup' ? <Lineup /> : <PrintView />}
        </main>
      </div>

      {dragging && (
        <div className="drop-overlay">
          <div>Drop images to add figures</div>
        </div>
      )}
    </div>
  );
}

function ProjectMenu({ onNotice }: { onNotice: (message: string) => void }) {
  const toProject = useStore((s) => s.toProject);
  const loadProject = useStore((s) => s.loadProject);
  const clearProject = useStore((s) => s.clearProject);
  const hasFigures = useStore((s) => s.figures.length > 0);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="button-row">
      <button
        type="button"
        disabled={!hasFigures}
        title="Download the project including all images"
        onClick={() => {
          const json = JSON.stringify(toProject());
          downloadBlob(new Blob([json], { type: 'application/json' }), 'paper-minis.papermini.json');
        }}
      >
        Save project
      </button>
      <button type="button" onClick={() => fileInput.current?.click()}>
        Open project
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            loadProject(parseProject(await file.text()));
            onNotice(`Opened “${file.name}”.`);
          } catch (error) {
            onNotice(error instanceof Error ? error.message : 'Could not open the project file.');
          }
        }}
      />
      <ConfirmButton confirmLabel="Discard all figures?" onConfirm={clearProject} title="Start a new, empty project">
        New
      </ConfirmButton>
    </div>
  );
}

/** Accepts image files dropped anywhere on the page. Returns whether files are currently dragged over the window. */
function useFileDrop(): boolean {
  const addImageFiles = useStore((s) => s.addImageFiles);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      addImageFiles(Array.from(e.dataTransfer?.files ?? []));
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [addImageFiles]);

  return dragging;
}
