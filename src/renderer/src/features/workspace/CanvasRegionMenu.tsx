import { useEffect, useState } from "react";
import type { LocaleId, Point } from "../../../../shared/contracts";
import { t } from "../../lib/i18n";
import { CANVAS_REGION_COLORS } from "./canvasRegions";

interface CanvasRegionMenuProps {
  mode: "create" | "edit";
  position: Point;
  initialTitle: string;
  initialColor: string;
  locale: LocaleId;
  onSubmit(title: string, color: string): void;
  onDelete?(): void;
  onClose(): void;
}

export function CanvasRegionMenu({
  mode,
  position,
  initialTitle,
  initialColor,
  locale,
  onSubmit,
  onDelete,
  onClose
}: CanvasRegionMenuProps): React.JSX.Element {
  const [title, setTitle] = useState(initialTitle);
  const [color, setColor] = useState(initialColor);

  useEffect(() => {
    setTitle(initialTitle);
    setColor(initialColor);
  }, [initialColor, initialTitle, mode]);

  return (
    <form
      className="canvas-region-menu"
      data-interactive="true"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim().length === 0) return;
        onSubmit(title.trim(), color);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
    >
      <strong>{t(locale, mode === "create" ? "createCanvasRegion" : "editCanvasRegion")}</strong>
      <input
        autoFocus
        maxLength={80}
        value={title}
        aria-label={t(locale, "canvasRegionName")}
        placeholder={t(locale, "canvasRegionName")}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />
      <div className="canvas-region-menu__colors" aria-label={t(locale, "canvasRegionColor")}>
        {CANVAS_REGION_COLORS.map((value) => (
          <button
            className={value === color ? "canvas-region-menu__color canvas-region-menu__color--selected" : "canvas-region-menu__color"}
            type="button"
            key={value}
            style={{ background: value }}
            aria-label={value}
            aria-pressed={value === color}
            onClick={() => setColor(value)}
          />
        ))}
      </div>
      <div className="canvas-region-menu__actions">
        {mode === "edit" && onDelete && (
          <button className="canvas-region-menu__delete" type="button" onClick={onDelete}>
            {t(locale, "deleteCanvasRegion")}
          </button>
        )}
        <button type="button" onClick={onClose}>{t(locale, "cancel")}</button>
        <button className="canvas-region-menu__primary" type="submit" disabled={title.trim().length === 0}>
          {t(locale, mode === "create" ? "create" : "save")}
        </button>
      </div>
    </form>
  );
}
