import { useCallback, useRef, useState } from "react";
import type {
  AgentProviderId,
  AppSettings,
  BrowserCanvasState,
  BrowserSnapshot,
  CameraState,
  CanvasRegion,
  HomeGridSize,
  HomeWidgetPlacement,
  InstalledPlugin,
  LimitsSnapshot,
  Point,
  SessionBounds,
  SessionSnapshot,
  CanvasOverlayPlacement
} from "../../../../shared/contracts";
import { HomeZone } from "../home/HomeZone";
import { TerminalCard } from "../terminal/TerminalCard";
import { PluginCanvasCard } from "../plugins/PluginCanvasCard";
import { UiIcon } from "../../components/UiIcon";
import { t } from "../../lib/i18n";
import { displayCanvasNavigationBinding } from "../../lib/shortcuts";
import type { LimitsLoadState } from "../home/homeModel";
import { homeGridPixelSize, homeLayoutFitsGrid } from "../home/homeLayout";
import { BrowserCard } from "../browser/BrowserCard";
import {
  browserCanvasWidgetId,
  canvasWidgetTarget,
  pluginCanvasWidgetId,
  terminalCanvasWidgetId
} from "./canvasWidgetFocus";
import { useCanvasPointerNavigation } from "./useCanvasPointerNavigation";
import { useCanvasWheelNavigation } from "./useCanvasWheelNavigation";
import { useCanvasWidgetFocus } from "./useCanvasWidgetFocus";
import { CanvasMinimap } from "./CanvasMinimap";
import { CanvasRegionCard } from "./CanvasRegionCard";
import { CanvasRegionMenu } from "./CanvasRegionMenu";
import { CANVAS_REGION_COLORS, canvasRegionAtPoint } from "./canvasRegions";

const CANVAS_OVERLAY_PLACEMENTS: CanvasOverlayPlacement[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
];

type RegionMenuState = {
  mode: "create";
  position: Point;
  worldPoint: Point;
} | {
  mode: "edit";
  position: Point;
  regionId: string;
};

interface WorkspaceCanvasProps {
  settings: AppSettings;
  mediaData: string | null;
  sessions: SessionSnapshot[];
  limits: LimitsSnapshot | null;
  limitsLoadState: LimitsLoadState;
  plugins: InstalledPlugin[];
  browser: BrowserSnapshot;
  browserViewVisible: boolean;
  homeEditing: boolean;
  camera: CameraState;
  onCameraChange(camera: CameraState): void;
  onGoHome(): void;
  onOpenSettings(): void;
  onOpenAgent(provider: AgentProviderId): void;
  onOpenTerminal(): void;
  onOpenBrowser(): void;
  onFocusSession(session: SessionSnapshot): void;
  activeSessionId: string | null;
  browserSelected: boolean;
  renamingSessionId: string | null;
  onSelectSession(id: string): void;
  onSelectBrowser(): void;
  onClearCanvasSelection(): void;
  onRenameSession(id: string, title: string): Promise<void>;
  onRenameEnd(): void;
  onRequestMedia(): Promise<void>;
  onRemoveMedia(): Promise<void>;
  onHomeLayoutChange(layout: HomeWidgetPlacement[]): void;
  onHomeGridSizeChange(gridSize: HomeGridSize): void;
  onFinishHomeEdit(): void;
  onResetHomeLayout(): void;
  onPluginError(message: string): void;
  onPluginCanvasBoundsChange(id: string, bounds: SessionBounds): void;
  onDisposePluginCanvas(id: string): void;
  onFocusPluginCanvas(id: string): void;
  onSessionBoundsChange(id: string, bounds: SessionBounds): void;
  onRestartSession(id: string): Promise<void>;
  onDisposeSession(id: string): void;
  onBrowserBoundsChange(bounds: BrowserCanvasState): void;
  onFocusBrowser(): void;
  onCloseBrowser(): void;
  onCreateCanvasRegion(region: CanvasRegion): void;
  onChangeCanvasRegion(region: CanvasRegion): void;
  onCanvasRegionBoundsChange(id: string, bounds: SessionBounds, interaction: "move" | "resize"): void;
  onDeleteCanvasRegion(id: string): void;
}

export function WorkspaceCanvas({
  settings,
  mediaData,
  sessions,
  limits,
  limitsLoadState,
  plugins,
  browser,
  browserViewVisible,
  homeEditing,
  camera,
  onCameraChange,
  onGoHome,
  onOpenSettings,
  onOpenAgent,
  onOpenTerminal,
  onOpenBrowser,
  onFocusSession,
  activeSessionId,
  browserSelected,
  renamingSessionId,
  onSelectSession,
  onSelectBrowser,
  onClearCanvasSelection,
  onRenameSession,
  onRenameEnd,
  onRequestMedia,
  onRemoveMedia,
  onHomeLayoutChange,
  onHomeGridSizeChange,
  onFinishHomeEdit,
  onResetHomeLayout,
  onPluginError,
  onPluginCanvasBoundsChange,
  onDisposePluginCanvas,
  onFocusPluginCanvas,
  onSessionBoundsChange,
  onRestartSession,
  onDisposeSession,
  onBrowserBoundsChange,
  onFocusBrowser,
  onCloseBrowser,
  onCreateCanvasRegion,
  onChangeCanvasRegion,
  onCanvasRegionBoundsChange,
  onDeleteCanvasRegion
}: WorkspaceCanvasProps): React.JSX.Element {
  const viewport = useRef<HTMLDivElement>(null);
  const [regionMenu, setRegionMenu] = useState<RegionMenuState | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const commitCamera = useCallback((next: CameraState): void => {
    cameraRef.current = next;
    onCameraChange(next);
  }, [onCameraChange]);

  const focusController = useCanvasWidgetFocus({
    viewport,
    settings,
    activeSessionId,
    browserSelected,
    widgetTreeVersion: [
      browserViewVisible ? "browser-visible" : "browser-hidden",
      settings.browserCanvas ? "browser-card" : "no-browser-card",
      sessions.map((session) => session.id).join(","),
      plugins.map((plugin) => [
        plugin.manifest.id,
        plugin.enabled ? "enabled" : "disabled",
        plugin.manifest.contributions.map((contribution) => contribution.id).join(",")
      ].join(":")).join(";"),
      settings.pluginCanvas.map((instance) => instance.id).join(","),
      settings.homeLayout.map((placement) => placement.widgetId).join(",")
    ].join("|")
  });
  const wheelNavigation = useCanvasWheelNavigation({
    viewport,
    settings,
    cameraRef,
    widgetFocusRef: focusController.stateRef,
    commitCamera
  });
  const pointerNavigation = useCanvasPointerNavigation({
    viewport,
    settings,
    cameraRef,
    canvasOverrideActiveRef: wheelNavigation.canvasOverrideActiveRef,
    commitCamera
  });
  const widgetFocus = focusController.state;
  const routeWidgetWheelToCanvas = wheelNavigation.routeWidgetWheelToCanvas;
  const canvasOverrideActive = wheelNavigation.canvasOverrideActive;

  const homeBounds: SessionBounds = {
    position: { x: 0, y: 0 },
    size: homeGridPixelSize(settings.homeGridSize)
  };
  const homeLayoutValid = homeLayoutFitsGrid(settings.homeLayout, settings.homeGridSize);
  const menuRegion = regionMenu?.mode === "edit"
    ? settings.canvasRegions.find((region) => region.id === regionMenu.regionId) ?? null
    : null;
  const contextMenuPosition = (clientX: number, clientY: number): Point => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds) return { x: 12, y: 12 };
    return {
      x: Math.max(12, Math.min(clientX - bounds.left, Math.max(12, bounds.width - 298))),
      y: Math.max(12, Math.min(clientY - bounds.top, Math.max(12, bounds.height - 220)))
    };
  };
  const worldPoint = (clientX: number, clientY: number): Point => {
    const bounds = viewport.current?.getBoundingClientRect();
    const x = clientX - (bounds?.left ?? 0);
    const y = clientY - (bounds?.top ?? 0);
    return {
      x: (x - camera.x) / camera.zoom,
      y: (y - camera.y) / camera.zoom
    };
  };

  return (
    <div
      ref={viewport}
      className={`workspace pattern-${settings.pattern} ${pointerNavigation.panning ? "workspace--panning" : ""} ${canvasOverrideActive ? "workspace--canvas-override" : ""}`}
      onPointerDownCapture={(event) => {
        if (regionMenu && !(event.target as HTMLElement).closest(".canvas-region-menu")) setRegionMenu(null);
        if (pointerNavigation.handlePointerDownCapture(event)) return;
        const target = canvasWidgetTarget(event.target);
        if (target.focusableWidgetId !== null) {
          focusController.cancelHover();
          focusController.focus(target.focusableWidgetId, "explicit");
        }
        if (!(event.target as HTMLElement).closest(".terminal-card, .browser-card")) onClearCanvasSelection();
      }}
      onClickCapture={(event) => {
        if (!pointerNavigation.handleClickCapture(event)) focusController.handleClick(event);
      }}
      onAuxClickCapture={pointerNavigation.handleAuxClickCapture}
      onPointerOverCapture={focusController.handlePointerOver}
      onPointerOutCapture={focusController.handlePointerOut}
      onPointerDown={pointerNavigation.handlePointerDown}
      onPointerMove={pointerNavigation.handlePointerMove}
      onPointerUp={pointerNavigation.handlePointerEnd}
      onPointerCancel={pointerNavigation.handlePointerEnd}
      onPointerLeave={pointerNavigation.handlePointerLeave}
      onContextMenu={(event) => {
        if (homeEditing) return;
        const target = event.target as HTMLElement;
        if (target.closest(".home-zone, .terminal-card, .plugin-canvas-card, .browser-card, [data-interactive='true']")) {
          return;
        }
        event.preventDefault();
        setRegionMenu({
          mode: "create",
          position: contextMenuPosition(event.clientX, event.clientY),
          worldPoint: worldPoint(event.clientX, event.clientY)
        });
      }}
    >
      <div className="workspace__scene" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
        <div
          className={`workspace__regions ${homeEditing ? "workspace__windows--hidden" : ""}`}
          aria-hidden={homeEditing}
        >
          {settings.canvasRegions.map((region) => (
            <CanvasRegionCard
              key={region.id}
              region={region}
              zoom={camera.zoom}
              snapEnabled={settings.snapToGrid}
              snapTargets={[
                homeBounds,
                ...settings.canvasRegions
                  .filter((candidate) => candidate.id !== region.id)
                  .map((candidate) => ({ position: candidate.position, size: candidate.size }))
              ]}
              onBoundsChange={onCanvasRegionBoundsChange}
              onEdit={(candidate, point) => setRegionMenu({
                mode: "edit",
                regionId: candidate.id,
                position: contextMenuPosition(point.x, point.y)
              })}
            />
          ))}
        </div>
        <HomeZone
          settings={settings}
          mediaData={mediaData}
          sessions={sessions}
          limits={limits}
          limitsLoadState={limitsLoadState}
          plugins={plugins}
          editing={homeEditing}
          onOpenSettings={onOpenSettings}
          onOpenAgent={onOpenAgent}
          onOpenTerminal={onOpenTerminal}
          onOpenBrowser={() => {
            if (settings.browserCanvas) focusController.focusBrowser();
            onOpenBrowser();
          }}
          onFocusSession={(session) => {
            focusController.focus(terminalCanvasWidgetId(session.id), "explicit");
            onFocusSession(session);
          }}
          onRequestMedia={onRequestMedia}
          onRemoveMedia={onRemoveMedia}
          onLayoutChange={onHomeLayoutChange}
          onGridSizeChange={onHomeGridSizeChange}
          onPluginError={onPluginError}
          captureCanvasWheelOverWidgets={routeWidgetWheelToCanvas}
          focusedWidgetId={widgetFocus.id}
          onWidgetFocus={(id) => {
            focusController.cancelHover();
            focusController.focus(id, "explicit");
          }}
          onWidgetHoverChange={(id, active) => {
            if (active) focusController.scheduleHover(id);
            else focusController.cancelHover(id);
          }}
          onPluginCanvasWheel={wheelNavigation.applyCanvasWheel}
        />
        <div
          className={`workspace__windows ${homeEditing ? "workspace__windows--hidden" : ""}`}
          aria-hidden={homeEditing}
        >
          {sessions.map((session) => (
            <TerminalCard
              key={session.id}
              session={session}
              locale={settings.locale}
              palette={settings.palette}
              zoom={camera.zoom}
              snapEnabled={settings.snapToGrid}
              focusActivation={settings.focusActivation}
              invertTerminalWheel={settings.invertTerminalWheel}
              captureCanvasWheelOverWidgets={routeWidgetWheelToCanvas || widgetFocus.id !== terminalCanvasWidgetId(session.id)}
              focused={widgetFocus.id === terminalCanvasWidgetId(session.id)}
              focusChangeSource={widgetFocus.source}
              selected={activeSessionId === session.id}
              renaming={renamingSessionId === session.id}
              snapTargets={[
                homeBounds,
                ...settings.canvasRegions.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                ...sessions
                  .filter((candidate) => candidate.id !== session.id)
                  .map((candidate) => ({ position: candidate.position, size: candidate.size })),
                ...settings.pluginCanvas.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                ...(settings.browserCanvas ? [settings.browserCanvas] : [])
              ]}
              onActivate={(selectedSession) => {
                focusController.focus(terminalCanvasWidgetId(selectedSession.id), "explicit");
                onFocusSession(selectedSession);
              }}
              onSelect={onSelectSession}
              onRename={onRenameSession}
              onRenameEnd={onRenameEnd}
              onBoundsChange={onSessionBoundsChange}
              onRestart={onRestartSession}
              onDispose={onDisposeSession}
            />
          ))}
          {settings.pluginCanvas.map((instance) => {
            const plugin = plugins.find((candidate) => candidate.manifest.id === instance.pluginId && candidate.enabled);
            const contribution = plugin?.manifest.contributions.find((candidate) => candidate.id === instance.contributionId);
            if (!plugin || !contribution || contribution.kind !== "canvas-app") return null;
            return (
              <PluginCanvasCard
                key={instance.id}
                instance={instance}
                plugin={plugin}
                contribution={contribution}
                locale={settings.locale}
                palette={settings.palette}
                zoom={camera.zoom}
                snapEnabled={settings.snapToGrid}
                sessions={sessions}
                limits={limits}
                snapTargets={[
                  homeBounds,
                  ...settings.canvasRegions.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                  ...sessions.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                  ...settings.pluginCanvas
                    .filter((candidate) => candidate.id !== instance.id)
                    .map((candidate) => ({ position: candidate.position, size: candidate.size })),
                  ...(settings.browserCanvas ? [settings.browserCanvas] : [])
                ]}
                onActivate={() => {
                  focusController.focus(pluginCanvasWidgetId(instance.id), "explicit");
                  onFocusPluginCanvas(instance.id);
                }}
                onBoundsChange={onPluginCanvasBoundsChange}
                onDispose={onDisposePluginCanvas}
                onOpenLauncher={(provider) => provider === "terminal" ? onOpenTerminal() : onOpenAgent(provider)}
                onError={onPluginError}
                captureCanvasWheelOverWidgets={routeWidgetWheelToCanvas || widgetFocus.id !== pluginCanvasWidgetId(instance.id)}
                onWidgetFocus={() => {
                  focusController.cancelHover();
                  focusController.focus(pluginCanvasWidgetId(instance.id), "explicit");
                }}
                onWidgetHoverChange={(active) => {
                  if (active) focusController.scheduleHover(pluginCanvasWidgetId(instance.id));
                  else focusController.cancelHover(pluginCanvasWidgetId(instance.id));
                }}
                onCanvasWheel={wheelNavigation.applyCanvasWheel}
              />
            );
          })}
          {settings.browserCanvas && (
            <BrowserCard
              browser={browser}
              bounds={settings.browserCanvas}
              locale={settings.locale}
              zoom={camera.zoom}
              camera={camera}
              visible={browserViewVisible && !homeEditing && regionMenu === null}
              snapEnabled={settings.snapToGrid}
              focusActivation={settings.focusActivation}
              focused={widgetFocus.id === browserCanvasWidgetId}
              selected={browserSelected}
              showAgentPresence={settings.browserShowAgentPresence}
              snapTargets={[
                homeBounds,
                ...settings.canvasRegions.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                ...sessions.map((candidate) => ({ position: candidate.position, size: candidate.size })),
                ...settings.pluginCanvas.map((candidate) => ({ position: candidate.position, size: candidate.size }))
              ]}
              onBoundsChange={onBrowserBoundsChange}
              onActivate={() => {
                focusController.focusBrowser();
                onFocusBrowser();
              }}
              onSelect={onSelectBrowser}
              onWidgetFocus={focusController.focusBrowser}
              onWidgetHoverChange={focusController.hoverBrowser}
              onClose={onCloseBrowser}
              onError={onPluginError}
            />
          )}
        </div>
      </div>

      {homeEditing && (
        <div className="home-editor-toolbar" data-interactive="true">
          <strong>{t(settings.locale, "homeEditor")}</strong>
          <button type="button" onClick={onResetHomeLayout}>{t(settings.locale, "resetHome")}</button>
          <button
            className="home-editor-toolbar__done"
            type="button"
            disabled={!homeLayoutValid}
            title={homeLayoutValid ? undefined : t(settings.locale, "homeLayoutOutside")}
            onClick={onFinishHomeEdit}
          >{t(settings.locale, "doneEditing")}</button>
        </div>
      )}

      {regionMenu && (regionMenu.mode === "create" || menuRegion) && (
        <CanvasRegionMenu
          key={regionMenu.mode === "create" ? "create" : `edit:${regionMenu.regionId}`}
          mode={regionMenu.mode}
          position={regionMenu.position}
          initialTitle={regionMenu.mode === "create" ? t(settings.locale, "canvasRegionDefaultName") : menuRegion!.title}
          initialColor={regionMenu.mode === "create" ? CANVAS_REGION_COLORS[0] : menuRegion!.color}
          locale={settings.locale}
          onSubmit={(title, color) => {
            if (regionMenu.mode === "create") {
              onCreateCanvasRegion(canvasRegionAtPoint(title, color, regionMenu.worldPoint, crypto.randomUUID()));
            } else if (menuRegion) {
              onChangeCanvasRegion({ ...menuRegion, title, color });
            }
            setRegionMenu(null);
          }}
          onDelete={regionMenu.mode === "edit" ? () => {
            onDeleteCanvasRegion(regionMenu.regionId);
            setRegionMenu(null);
          } : undefined}
          onClose={() => setRegionMenu(null)}
        />
      )}

      <div className="canvas-overlays">
        {CANVAS_OVERLAY_PLACEMENTS.map((placement) => (
          <div className={`canvas-overlay-slot canvas-overlay-slot--${placement}`} key={placement}>
            {settings.minimapPlacement === placement && (
              <CanvasMinimap
                viewport={viewport}
                camera={camera}
                homeBounds={homeBounds}
                canvasRegions={settings.canvasRegions}
                sessions={sessions}
                pluginCanvas={settings.pluginCanvas}
                browserCanvas={settings.browserCanvas}
                locale={settings.locale}
                interactionMode={settings.minimapInteractionMode}
                onCameraChange={commitCamera}
              />
            )}
            {settings.canvasControlsPlacement === placement && (
              <div className="canvas-controls" data-interactive="true">
                <button type="button" onClick={onGoHome} title={t(settings.locale, "home")}><UiIcon name="home" size={17} /></button>
                <button type="button" onClick={() => wheelNavigation.zoomBy(0.82)} title={t(settings.locale, "zoomOut")}><UiIcon name="zoom-out" size={17} /></button>
                <button type="button" onClick={() => wheelNavigation.zoomBy(1.22)} title={t(settings.locale, "zoomIn")}><UiIcon name="zoom-in" size={17} /></button>
              </div>
            )}
            {settings.showShortcutHints && settings.shortcutHintsPlacement === placement && (
              <aside className="shortcut-hints" aria-label={t(settings.locale, "keyboardShortcuts")}>
                <div><kbd>{settings.shortcuts.home}</kbd><span>{t(settings.locale, "homeShortcut")}</span></div>
                <div><kbd>{settings.shortcuts.renameWindow}</kbd><span>{t(settings.locale, "renameWindow")}</span></div>
                {settings.canvasWheelCaptureMode === "key" && settings.canvasWheelOverride !== null && (
                  <div>
                    <kbd>{displayCanvasNavigationBinding(
                      settings.canvasWheelOverride,
                      window.canvasTTY.window.isMacOS
                    )}</kbd>
                    <span>{t(settings.locale, "canvasWheelOverrideHint")}</span>
                  </div>
                )}
                {settings.canvasNavigationOverride !== null && (
                  <div>
                    <kbd>{displayCanvasNavigationBinding(
                      settings.canvasNavigationOverride,
                      window.canvasTTY.window.isMacOS
                    )}</kbd>
                    <span>{t(settings.locale, "canvasNavigationOverrideHint")}</span>
                  </div>
                )}
              </aside>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
