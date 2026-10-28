/*
 * DEMO DATA. A fake Google Drive tree used before the real Drive integration is enabled.
 * Media files are generated locally by scripts/generate-demo-media.ts (FFmpeg) and are
 * clearly watermarked "DEMO".
 */
export interface DemoNode {
  id: string;
  name: string;
  kind: "folder" | "video" | "audio";
  parentId: string | null;
  durationMs?: number;
  width?: number;
  height?: number;
  palette?: [string, string];
  /** Present in the catalog but missing from "Drive" to demonstrate sync errors. */
  missing?: boolean;
}

export const DEMO_ROOT_ID = "demo-root";
export const DEMO_SOURCE_FOLDER_ID = "demo-fld-footage";
export const DEMO_OUTPUT_FOLDER_ID = "demo-fld-renders";

export const DEMO_CATALOG: DemoNode[] = [
  { id: DEMO_ROOT_ID, name: "My Drive", kind: "folder", parentId: null },
  { id: DEMO_SOURCE_FOLDER_ID, name: "Balena Footage", kind: "folder", parentId: DEMO_ROOT_ID },
  { id: DEMO_OUTPUT_FOLDER_ID, name: "Balena Reel Studio – Renders", kind: "folder", parentId: DEMO_ROOT_ID },
  { id: "demo-fld-music", name: "Music", kind: "folder", parentId: DEMO_ROOT_ID },
  { id: "demo-fld-roasting", name: "Roasting", kind: "folder", parentId: DEMO_SOURCE_FOLDER_ID },
  { id: "demo-fld-brewing", name: "Brewing", kind: "folder", parentId: DEMO_SOURCE_FOLDER_ID },
  { id: "demo-fld-iced", name: "Iced coffee", kind: "folder", parentId: DEMO_SOURCE_FOLDER_ID },

  { id: "demo-C001", name: "C001_beans_pour.mp4", kind: "video", parentId: "demo-fld-roasting", durationMs: 12000, width: 1080, height: 1920, palette: ["#3b2416", "#a8743f"] },
  { id: "demo-C002", name: "C002_roaster_drum.mp4", kind: "video", parentId: "demo-fld-roasting", durationMs: 18000, width: 1080, height: 1920, palette: ["#2a1a12", "#c0703a"] },
  { id: "demo-C003", name: "C003_cooling_tray.mp4", kind: "video", parentId: "demo-fld-roasting", durationMs: 14000, width: 1920, height: 1080, palette: ["#4a2e1c", "#d9a066"] },
  { id: "demo-C004", name: "C004_kettle_pour.mp4", kind: "video", parentId: "demo-fld-brewing", durationMs: 16000, width: 1080, height: 1920, palette: ["#1f3a3d", "#c9a27a"] },
  { id: "demo-C005", name: "C005_bloom_closeup.mp4", kind: "video", parentId: "demo-fld-brewing", durationMs: 10000, width: 1080, height: 1920, palette: ["#3d2a1e", "#e8c39e"] },
  { id: "demo-C006", name: "C006_drip_carafe.mp4", kind: "video", parentId: "demo-fld-brewing", durationMs: 15000, width: 1080, height: 1920, palette: ["#2b4b4f", "#b98559"] },
  { id: "demo-C007", name: "C007_ice_glass.mp4", kind: "video", parentId: "demo-fld-iced", durationMs: 11000, width: 1080, height: 1920, palette: ["#5a3a24", "#f1d9bd"] },
  { id: "demo-C008", name: "C008_milk_swirl.mp4", kind: "video", parentId: "demo-fld-iced", durationMs: 9000, width: 1080, height: 1920, palette: ["#6b4429", "#fbeee0"] },
  { id: "demo-C009", name: "C009_house_blend_bag.mp4", kind: "video", parentId: "demo-fld-iced", durationMs: 8000, width: 1080, height: 1080, palette: ["#2f5257", "#f3c9a8"] },
  { id: "demo-C010", name: "C010_shop_morning.mov", kind: "video", parentId: DEMO_SOURCE_FOLDER_ID, durationMs: 20000, width: 1080, height: 1920, palette: ["#333", "#999"], missing: true },

  { id: "demo-M001", name: "morning_acoustic_demo.m4a", kind: "audio", parentId: "demo-fld-music", durationMs: 40000 },
];

/** Demo media is generated at reduced resolution to keep local generation fast. */
export const DEMO_MEDIA_SCALE = 0.5;
