import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  getAiNativeTemplateVariables,
  getPlanTier,
  isCorePlan,
  loadPlanMap,
} from "../scripts/assemble-template";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Plan map consistency", () => {
  test("plan-map should define canonical A..K plans", () => {
    const planMap = loadPlanMap();
    const planCodes = Object.keys(planMap.plans).sort();
    expect(planCodes).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
  });

  test("AI-native profiles stay as overlays, not plan codes", () => {
    const planMap = loadPlanMap();
    const planCodes = Object.keys(planMap.plans).sort();
    const overlayDefaults = Object.fromEntries(
      planCodes.map((code) => [code, planMap.plans[code].aiNativeOverlayDefaults])
    );

    expect(planCodes).not.toContain("L");
    expect(overlayDefaults.C?.defaultProfile).toBe("none");
    expect(overlayDefaults.C?.recommendedProfiles).toContain("runtime-console");
    expect(overlayDefaults.C?.recommendedProfiles).toContain("collaborative-editor");
    expect(overlayDefaults.D?.recommendedProfiles).toContain("sidecar-kernel");
    expect(overlayDefaults.E?.recommendedProfiles).toContain("product-copilot");
  });

  test("AI-native template variables only activate when explicitly selected", () => {
    const defaultOverlay = getAiNativeTemplateVariables("C", {
      PROJECT_STRUCTURE: "base structure",
    });
    expect(defaultOverlay.enabled).toBe(false);
    expect(defaultOverlay.variables.AI_NATIVE_TECH_STACK_SECTION).toBe("");

    const runtimeConsoleOverlay = getAiNativeTemplateVariables("C", {
      PROJECT_STRUCTURE: "base structure",
      AI_NATIVE_PROFILE: "runtime-console",
    });
    expect(runtimeConsoleOverlay.enabled).toBe(true);
    expect(runtimeConsoleOverlay.variables.PROJECT_STRUCTURE).toContain(
      "AI-native Runtime Console Overlay"
    );
    expect(runtimeConsoleOverlay.variables.AI_NATIVE_TECH_STACK_TABLE).toContain("AG-UI");
    expect(runtimeConsoleOverlay.variables.AI_NATIVE_TECH_STACK_SECTION).toContain(
      "assistant-ui"
    );
  });

  test("plan tiers should enforce core A-F and preset/custom G-K model", () => {
    const planMap = loadPlanMap();

    expect(planMap.planTiers?.core).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(planMap.planTiers?.presets).toEqual(["G", "H", "I", "J"]);
    expect(planMap.planTiers?.custom).toEqual(["K"]);

    expect(getPlanTier("A", planMap)).toBe("core");
    expect(getPlanTier("F", planMap)).toBe("core");
    expect(getPlanTier("G", planMap)).toBe("preset");
    expect(getPlanTier("J", planMap)).toBe("preset");
    expect(getPlanTier("K", planMap)).toBe("custom");
    expect(isCorePlan("C", planMap)).toBe(true);
    expect(isCorePlan("H", planMap)).toBe(false);
  });

  test("docs should not reference deprecated plan labels", () => {
    const skill = read("SKILL.md");
    const techStacks = read("references/tech-stacks.md");
    const planMap = read("assets/plan-map.json");

    expect(planMap).not.toContain("Remix + React");
    expect(planMap).not.toContain("UmiJS");
    expect(planMap).not.toContain("Web3 DApp");
    expect(planMap).not.toContain("Financial Trading");
    expect(skill).not.toContain("Plan C+");
    expect(skill).not.toContain("Plan L");
    expect(techStacks).not.toContain("Plan C+");
    expect(techStacks).not.toContain("Plan L");
  });

  test("plan-map routes codes as stack families", () => {
    const planMap = loadPlanMap();

    expect(planMap.plans.A.name).toBe("Astro-first SSR/content shell");
    expect(planMap.plans.B.name).toBe("Vite 8 client app shell");
    expect(planMap.plans.C.stack).toContain("TanStack Start");
    expect(planMap.plans.D.stack).toContain("Bun Workspaces");
    expect(planMap.plans.E.stack).toContain("Cloudflare");
    expect(planMap.plans.E.defaultTemplateVariables?.TECH_STACK_TABLE).toContain("D1 is opt-in only");
    expect(planMap.plans.H.defaultLsp).toBe("gopls-lsp");
    expect(planMap.plans.J.defaultLsp).toBe("rust-analyzer-lsp");
  });

  test("canonical plan labels should appear in docs", () => {
    const skill = read("SKILL.md");
    const techStacks = read("references/tech-stacks.md");

    for (const plan of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]) {
      expect(skill).toContain(`Plan ${plan}`);
      expect(techStacks).toContain(`Plan ${plan}`);
    }

    expect(skill).toContain("Core Plans (A-F)");
    expect(skill).toContain("Custom Presets (G-K)");
    expect(techStacks).toContain("Core Plans (A-F)");
    expect(techStacks).toContain("Custom Presets (G-K)");
  });
});
