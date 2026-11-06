// How big the main window is, in device-independent pixels (DIPs: what Windows display scaling leaves). Pure, so it is unit-tested without Electron (desktop/test/windowSize.test.mjs).
//
// The school laptop (owner, 2026-11-05) is a 14-inch Full HD screen (1920x1080): that is 1920x1080 DIPs at 100 % scaling, 1536x864 at 125 % and 1280x720 at 150 %, less the taskbar.
// The owner asked for comfortable use at 1366x768 and smaller logical workspaces and no sideways scrolling, so:
//  * the window never starts bigger than the screen's work area (it used to start at 1366x768 whatever the screen, which is larger than a 150 % Full HD work area);
//  * a laptop-sized screen starts MAXIMISED (the whole work area), a big monitor starts at the usual 1366x768;
//  * the smallest window the user can drag it to is 880x440 (it used to be 1200x650, which made every page scroll sideways at 125 % and 150 % on a 1366x768 laptop).

export const USUAL_WIDTH = 1366;
export const USUAL_HEIGHT = 768;
export const MIN_WIDTH = 880;
export const MIN_HEIGHT = 440;
/** Screens whose work area is narrower or shorter than this start maximised. */
export const MAXIMISE_BELOW_WIDTH = 1600;
export const MAXIMISE_BELOW_HEIGHT = 860;

export interface WorkArea { width: number; height: number }
export interface WindowPlan { width: number; height: number; minWidth: number; minHeight: number; maximize: boolean }

export function planMainWindow(work: WorkArea): WindowPlan {
  const width = Math.max(1, Math.min(USUAL_WIDTH, Math.floor(work.width)));
  const height = Math.max(1, Math.min(USUAL_HEIGHT, Math.floor(work.height)));
  return {
    width,
    height,
    minWidth: Math.min(MIN_WIDTH, width),
    minHeight: Math.min(MIN_HEIGHT, height),
    maximize: work.width < MAXIMISE_BELOW_WIDTH || work.height < MAXIMISE_BELOW_HEIGHT,
  };
}
