import { distributeMinutesForSection, normalizePlan } from "./trainingPlanNormalize";

/** Plan section keys (Training.plan JSON) ↔ BVF session phases. */
export const PLAN_SECTION_DEFS = [
  { key: "warmup", label: "Загрявка", bvfBlock: "Активиране" },
  { key: "technique", label: "Техника", bvfBlock: "Изграждане" },
  { key: "serve_receive", label: "Сервис / Посрещане", bvfBlock: "Интеграция" },
  { key: "attack_block", label: "Атака / Блок", bvfBlock: "Интеграция" },
  { key: "game", label: "Игрова част", bvfBlock: "Състезателност" },
  { key: "conditioning", label: "Физическа подготовка", bvfBlock: "Изграждане" },
  { key: "cooldown", label: "Разпускане", bvfBlock: "Състезателност" },
];

/** 4 BVF фази за режим зала. */
export const BVF_FIELD_PHASES = [
  { block: "Активиране", sectionKeys: ["warmup"] },
  { block: "Изграждане", sectionKeys: ["technique", "conditioning"] },
  { block: "Интеграция", sectionKeys: ["serve_receive", "attack_block"] },
  { block: "Състезателност", sectionKeys: ["game", "cooldown"] },
];

export function sectionDef(planKey) {
  return PLAN_SECTION_DEFS.find((s) => s.key === planKey) || null;
}

export function sectionGuide(sessionReview, planKey) {
  const def = sectionDef(planKey);
  if (!def || !sessionReview?.blockGuide?.length) return null;
  return sessionReview.blockGuide.find((g) => g.blockType === def.bvfBlock) || null;
}

export function bvfBlockForPlanKey(planKey) {
  return sectionDef(planKey)?.bvfBlock || null;
}

export function blockGuideForPhase(sessionReview, bvfBlock) {
  return (sessionReview?.blockGuide || []).find((g) => g.blockType === bvfBlock) || null;
}

export function buildBvfFieldSteps(plan, sessionReview) {
  const normalized = normalizePlan(plan);
  const steps = [];
  let globalIdx = 0;

  BVF_FIELD_PHASES.forEach((phase) => {
    const guide = blockGuideForPhase(sessionReview, phase.block);
    const phaseMinutes = guide?.targetMinutes || 0;
    let phaseItems = [];

    phase.sectionKeys.forEach((sectionKey) => {
      const def = PLAN_SECTION_DEFS.find((s) => s.key === sectionKey);
      const items = [...(normalized[sectionKey] || [])];
      if (!items.length) return;
      const withMins = distributeMinutesForSection(items, phaseMinutes / Math.max(1, phase.sectionKeys.length));
      withMins.forEach((item, orderInSection) => {
        phaseItems.push({
          sectionKey,
          sectionLabel: def?.label || sectionKey,
          bvfBlock: phase.block,
          drillId: item.drillId,
          minutes: item.minutes,
          coachNote: item.coachNote || "",
          orderInSection: orderInSection + 1,
          globalIndex: globalIdx,
          phaseGuide: guide,
        });
        globalIdx += 1;
      });
    });

    if (phaseItems.length && phaseMinutes > 0) {
      phaseItems = distributeMinutesForSection(phaseItems, phaseMinutes);
    }

    steps.push(...phaseItems);
  });

  return steps;
}

export function buildBvfPhaseMeta(steps) {
  const meta = [];
  let offset = 0;
  BVF_FIELD_PHASES.forEach((phase) => {
    const count = steps.filter((s) => s.bvfBlock === phase.block).length;
    if (!count) return;
    meta.push({
      block: phase.block,
      label: phase.block,
      count,
      start: offset,
      end: offset + count - 1,
    });
    offset += count;
  });
  return meta;
}

export function replaceStepDrill(plan, step, newDrillId) {
  const normalized = normalizePlan(plan);
  const section = [...(normalized[step.sectionKey] || [])];
  const idx = section.findIndex((x) => x.drillId === step.drillId);
  if (idx < 0) return normalized;
  section[idx] = { ...section[idx], drillId: Number(newDrillId) };
  return { ...normalized, [step.sectionKey]: section };
}
