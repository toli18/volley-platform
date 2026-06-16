/** Plan section keys (Training.plan JSON) ↔ BVF session phases. */
export const PLAN_SECTION_DEFS = [
  { key: "warmup", label: "Загрявка", bvfBlock: "Активиране" },
  { key: "technique", label: "Техника", bvfBlock: "Изграждане" },
  { key: "serve_receive", label: "Сервис / Посрещане", bvfBlock: "Интеграция" },
  { key: "attack_block", label: "Атака / Блок", bvfBlock: "Интеграция" },
  { key: "game", label: "Игрова част", bvfBlock: "Състезателност" },
  { key: "conditioning", label: "Физическа подготовка", bvfBlock: "Изграждане" },
  { key: "cooldown", label: "Разпускане", bvfBlock: "Активиране" },
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
