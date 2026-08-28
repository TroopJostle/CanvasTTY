import { useEffect, useRef, useState } from "react";
import type { LocaleId, Point, SessionBounds, StickyNote } from "../../../../shared/contracts";
import { UiIcon } from "../../components/UiIcon";
import { t } from "../../lib/i18n";
import { snapMove, type ResizeDirection } from "../workspace/snap";
import { constrainStickyNoteResize } from "./stickyNoteBounds";

interface StickyNoteCardProps {
  note: StickyNote;
  locale: LocaleId;
  zoom: number;
  snapEnabled: boolean;
  snapTargets: readonly SessionBounds[];
  onBoundsChange(id: string, bounds: SessionBounds): void;
  onTextChange(id: string, text: string): void;
  onDispose(id: string): void;
}

interface DragState {
  pointerId: number;
  startClient: Point;
  startBounds: SessionBounds;
}

interface ResizeState extends DragState {
  direction: ResizeDirection;
}

const RESIZE_DIRECTIONS: ResizeDirection[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

export function StickyNoteCard({
  note,
  locale,
  zoom,
  snapEnabled,
  snapTargets,
  onBoundsChange,
  onTextChange,
  onDispose
}: StickyNoteCardProps): React.JSX.Element {
  const dragState = useRef<DragState | null>(null);
  const resizeState = useRef<ResizeState | null>(null);
  const textSaveTimer = useRef<number | null>(null);
  const initialBounds = { position: note.position, size: note.size };
  const liveBounds = useRef<SessionBounds>(initialBounds);
  const [position, setPosition] = useState(note.position);
  const [size, setSize] = useState(note.size);
  const [text, setText] = useState(note.text);

  useEffect(() => {
    const bounds = { position: note.position, size: note.size };
    liveBounds.current = bounds;
    setPosition(bounds.position);
    setSize(bounds.size);
  }, [note.position, note.size]);

  useEffect(() => setText(note.text), [note.text]);

  useEffect(() => () => {
    if (textSaveTimer.current !== null) window.clearTimeout(textSaveTimer.current);
  }, []);

  const saveText = (nextText: string): void => {
    if (textSaveTimer.current !== null) window.clearTimeout(textSaveTimer.current);
    textSaveTimer.current = null;
    if (nextText !== note.text) onTextChange(note.id, nextText);
  };

  const changeText = (nextText: string): void => {
    setText(nextText);
    if (textSaveTimer.current !== null) window.clearTimeout(textSaveTimer.current);
    textSaveTimer.current = window.setTimeout(() => saveText(nextText), 400);
  };

  const applyBounds = (bounds: SessionBounds): void => {
    liveBounds.current = bounds;
    setPosition(bounds.position);
    setSize(bounds.size);
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>): void => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startBounds: liveBounds.current
    };
  };

  const drag = (event: React.PointerEvent<HTMLElement>): void => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const rawPosition = {
      x: state.startBounds.position.x + (event.clientX - state.startClient.x) / zoom,
      y: state.startBounds.position.y + (event.clientY - state.startClient.y) / zoom
    };
    applyBounds({
      position: snapEnabled ? snapMove(rawPosition, state.startBounds.size, snapTargets) : rawPosition,
      size: state.startBounds.size
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>): void => {
    if (dragState.current?.pointerId !== event.pointerId) return;
    dragState.current = null;
    onBoundsChange(note.id, liveBounds.current);
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>, direction: ResizeDirection): void => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeState.current = {
      pointerId: event.pointerId,
      direction,
      startClient: { x: event.clientX, y: event.clientY },
      startBounds: liveBounds.current
    };
  };

  const resize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = resizeState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = (event.clientX - state.startClient.x) / zoom;
    const deltaY = (event.clientY - state.startClient.y) / zoom;
    applyBounds(constrainStickyNoteResize({
      position: {
        x: state.startBounds.position.x + (state.direction.includes("w") ? deltaX : 0),
        y: state.startBounds.position.y + (state.direction.includes("n") ? deltaY : 0)
      },
      size: {
        width: state.startBounds.size.width
          + (state.direction.includes("e") ? deltaX : 0)
          - (state.direction.includes("w") ? deltaX : 0),
        height: state.startBounds.size.height
          + (state.direction.includes("s") ? deltaY : 0)
          - (state.direction.includes("n") ? deltaY : 0)
      }
    }, state.direction));
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (resizeState.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resizeState.current = null;
    onBoundsChange(note.id, liveBounds.current);
  };

  return (
    <article
      className="sticky-note-card"
      data-interactive="true"
      data-canvas-widget-id={`sticky-note:${note.id}`}
      data-wheel-owner="local"
      style={{
        width: size.width,
        height: size.height,
        transform: `translate(${position.x}px, ${position.y}px)`
      }}
    >
      <header
        className="sticky-note-card__header"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span>{t(locale, "stickyNote")}</span>
        <button type="button" onClick={() => onDispose(note.id)} title={t(locale, "removeStickyNote")} aria-label={t(locale, "removeStickyNote")}>
          <UiIcon name="close" size={15} />
        </button>
      </header>
      <textarea
        className="sticky-note-card__editor"
        value={text}
        maxLength={20_000}
        placeholder={t(locale, "stickyNotePlaceholder")}
        aria-label={t(locale, "stickyNote")}
        onChange={(event) => changeText(event.target.value)}
        onBlur={() => saveText(text)}
      />
      {RESIZE_DIRECTIONS.map((direction) => (
        <div
          key={direction}
          className={`terminal-card__resize-handle terminal-card__resize-handle--${direction}`}
          aria-hidden="true"
          onPointerDown={(event) => startResize(event, direction)}
          onPointerMove={resize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
        />
      ))}
    </article>
  );
}
