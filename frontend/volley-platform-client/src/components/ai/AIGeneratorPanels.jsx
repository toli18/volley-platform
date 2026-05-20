import AiGenDrillCard from "./AiGenDrillCard";

export function AIGeneratorSettingsPanel({
  form,
  setForm,
  options,
  PERIODS,
  INTENSITIES,
  DURATION_OPTIONS,
  PLAYERS_OPTIONS,
  AGE_OPTIONS,
  SEED_OPTIONS,
  ORIENTATION_OPTIONS,
  VARIABILITY_OPTIONS,
  toBgLabel,
}) {
  return (
    <section className="aiGenPanel">
      <p className="aiGenHint">
        Параметрите определят възраст, ниво, фокус, период, време, брой играчи, интензитет и насоченост на AI плана.
      </p>
      <div className="aiGenGrid">
        <label className="aiGenField">
          <span>Възрастов диапазон</span>
          <select value={form.ageRange} onChange={(e) => setForm((p) => ({ ...p, ageRange: e.target.value }))}>
            <option value="">По конкретна възраст</option>
            <option value="12-14">12-14</option>
            <option value="14-16">14-16</option>
            <option value="16-18">16-18</option>
            <option value="18-22">18-22</option>
          </select>
        </label>
        {!form.ageRange ? (
          <label className="aiGenField">
            <span>Възраст</span>
            <select value={form.age} onChange={(e) => setForm((p) => ({ ...p, age: Number(e.target.value) }))}>
              {AGE_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="aiGenField">
          <span>Ниво</span>
          <select value={form.level} onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}>
            {options.levels.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Основен фокус</span>
          <select value={form.mainFocus} onChange={(e) => setForm((p) => ({ ...p, mainFocus: e.target.value }))}>
            {options.skills.map((x) => (
              <option key={x} value={x}>
                {toBgLabel(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Вторичен фокус</span>
          <select value={form.secondaryFocus} onChange={(e) => setForm((p) => ({ ...p, secondaryFocus: e.target.value }))}>
            {options.skills.map((x) => (
              <option key={x} value={x}>
                {toBgLabel(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Период</span>
          <select value={form.periodPhase} onChange={(e) => setForm((p) => ({ ...p, periodPhase: e.target.value }))}>
            {PERIODS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Обща продължителност (мин)</span>
          <select value={form.durationTotalMin} onChange={(e) => setForm((p) => ({ ...p, durationTotalMin: Number(e.target.value) }))}>
            {DURATION_OPTIONS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Брой играчи</span>
          <select value={form.playersCount} onChange={(e) => setForm((p) => ({ ...p, playersCount: Number(e.target.value) }))}>
            {PLAYERS_OPTIONS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Интензитет</span>
          <select value={form.intensityTarget} onChange={(e) => setForm((p) => ({ ...p, intensityTarget: e.target.value }))}>
            {INTENSITIES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Насоченост</span>
          <select value={form.orientation} onChange={(e) => setForm((p) => ({ ...p, orientation: e.target.value }))}>
            {ORIENTATION_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Вариативност</span>
          <select value={form.variability} onChange={(e) => setForm((p) => ({ ...p, variability: e.target.value }))}>
            {VARIABILITY_OPTIONS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        {form.variability === "stable" ? (
          <label className="aiGenField">
            <span>Фиксиран seed</span>
            <select value={form.randomSeed} onChange={(e) => setForm((p) => ({ ...p, randomSeed: Number(e.target.value) }))}>
              {SEED_OPTIONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  );
}

export function AIGeneratorLibraryPanel({
  finder,
  setFinder,
  finderOptions,
  activeFinderTags,
  filteredFinderDrills,
  planBlocks,
  cardTargetByDrill,
  setCardTargetByDrill,
  targetBlockType,
  toggleInArray,
  toBgLabel,
  resetFinder,
  applyFinderToAI,
  setActiveTab,
  onPreview,
  addFilteredDrillToBlock,
}) {
  return (
    <section className="aiGenPanel">
      <p className="aiGenHint">Филтри за преглед на базата. Не променят AI директно — може да прехвърлиш ниво и умения към настройките.</p>
      <div className="aiGenGrid">
        <label className="aiGenField aiGenField--wide">
          <span>Търсене по име</span>
          <input value={finder.search} placeholder="Ключови думи" onChange={(e) => setFinder((p) => ({ ...p, search: e.target.value }))} />
        </label>
        <label className="aiGenField">
          <span>Ниво</span>
          <select value={finder.level} onChange={(e) => setFinder((p) => ({ ...p, level: e.target.value }))}>
            {finderOptions.levels.map((x) => (
              <option key={x} value={x}>
                {x === "all" ? "Всички" : x}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Локация</span>
          <select value={finder.location} onChange={(e) => setFinder((p) => ({ ...p, location: e.target.value }))}>
            {finderOptions.locations.map((x) => (
              <option key={x} value={x}>
                {x === "all" ? "Всички" : toBgLabel(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Брой играчи</span>
          <select value={finder.playersBucket} onChange={(e) => setFinder((p) => ({ ...p, playersBucket: e.target.value }))}>
            <option value="all">Всички</option>
            <option value="<=8">&lt;=8</option>
            <option value="9-12">9-12</option>
            <option value="13+">13+</option>
          </select>
        </label>
        <label className="aiGenField">
          <span>Фаза</span>
          <select value={finder.trainingPhase} onChange={(e) => setFinder((p) => ({ ...p, trainingPhase: e.target.value }))}>
            {finderOptions.phases.map((x) => (
              <option key={x} value={x}>
                {x === "all" ? "Всички" : toBgLabel(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Игрова форма</span>
          <select value={finder.gameForm} onChange={(e) => setFinder((p) => ({ ...p, gameForm: e.target.value }))}>
            {finderOptions.gameForms.map((x) => (
              <option key={x} value={x}>
                {x === "all" ? "Всички" : toBgLabel(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="aiGenField">
          <span>Сортиране</span>
          <select value={finder.sorting} onChange={(e) => setFinder((p) => ({ ...p, sorting: e.target.value }))}>
            <option value="name_asc">Име А-Я</option>
            <option value="name_desc">Име Я-А</option>
            <option value="level">Ниво</option>
            <option value="newest">Най-нови</option>
          </select>
        </label>
      </div>
      <div className="aiGenSkillsBox">
        <div className="aiGenSkillsTitle">Умения</div>
        <div className="aiGenSkillsList">
          {finderOptions.skills.map((s) => (
            <label key={s.name} className="aiGenSkillCheck">
              <input
                type="checkbox"
                checked={finder.skills.includes(s.name)}
                onChange={() => setFinder((p) => ({ ...p, skills: toggleInArray(p.skills, s.name) }))}
              />
              <span>
                {toBgLabel(s.name)} ({s.count})
              </span>
            </label>
          ))}
        </div>
      </div>
      {activeFinderTags.length > 0 ? (
        <div className="aiGenTags">
          {activeFinderTags.map((t) => (
            <span key={t.key} className="aiGenTag">
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="aiGenToolbar">
        <button type="button" className="aiGenBtn aiGenBtn--ghost" onClick={resetFinder}>
          Изчисти
        </button>
        <button type="button" className="aiGenBtn aiGenBtn--ghost" onClick={applyFinderToAI}>
          Към AI настройки
        </button>
        <button type="button" className="aiGenBtn aiGenBtn--ghost" onClick={() => setActiveTab("settings")}>
          Отвори настройки
        </button>
      </div>
      <p className="aiGenResultsMeta">
        {filteredFinderDrills.length} упражнения
        {planBlocks.length ? " · Можеш да добавяш към генерирания план" : ""}
      </p>
      <div className="aiGenDrillGrid">
        {filteredFinderDrills.slice(0, 60).map((d) => (
          <AiGenDrillCard
            key={d.id}
            drill={d}
            onPreview={onPreview}
            footer={
              <div className="aiGenCardActions">
                <button type="button" className="aiGenBtn aiGenBtn--ghost" onClick={() => onPreview(d)}>
                  Преглед
                </button>
                {planBlocks.length > 0 ? (
                  <>
                    <select
                      className="aiGenCardSelect"
                      value={cardTargetByDrill[d.id] || targetBlockType}
                      onChange={(e) =>
                        setCardTargetByDrill((prev) => ({
                          ...prev,
                          [d.id]: e.target.value,
                        }))
                      }
                    >
                      {planBlocks.map((b) => (
                        <option key={b.blockType} value={b.blockType}>
                          {b.blockType}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="aiGenBtn aiGenBtn--primary"
                      onClick={() => addFilteredDrillToBlock(d, cardTargetByDrill[d.id] || targetBlockType)}
                    >
                      Добави
                    </button>
                  </>
                ) : null}
              </div>
            }
          />
        ))}
      </div>
    </section>
  );
}

export function AIGeneratorPlanPanel({
  planRef,
  result,
  planBlocks,
  minTwoPerBlockOk,
  openDrillPreview,
  moveDrillInsideBlock,
  removeDrillFromBlock,
  moveDrillToBlock,
  onGenerate,
  loading,
  metaLoading,
}) {
  if (!planBlocks.length) {
    return (
      <section className="aiGenPanel aiGenPanel--empty" ref={planRef}>
        <p>Няма генериран план. Задай настройките и натисни „Генерирай“.</p>
        <button type="button" className="aiGenBtn aiGenBtn--primary" onClick={onGenerate} disabled={loading || metaLoading}>
          {loading ? "Генериране..." : "Генерирай план"}
        </button>
      </section>
    );
  }

  return (
    <section className="aiGenPanel" ref={planRef}>
      <p className="aiGenHint">Редактирай реда, премахвай или премести упражнения. Добавяй нови от „База упражнения“.</p>
      {result?.фокус?.основен ? (
        <p className="aiGenPlanMeta">
          <strong>Фокус:</strong> {result.фокус.основен} / {result.фокус.вторичен || "—"}
        </p>
      ) : null}
      <p className="aiGenPlanMeta">
        <strong>Общо минути:</strong> {result?.session?.totalMinutes ?? result?.totalMinutes} · <strong>Време ОК:</strong>{" "}
        {String(result?.session?.checks?.minutesOk ?? result?.checks?.minutesOk)} · <strong>Покритие:</strong>{" "}
        {String(result?.session?.checks?.primaryFocusRatio ?? "—")}
      </p>
      {!minTwoPerBlockOk ? (
        <div className="aiGenWarn">В някоя част има под 2 упражнения. Промени насочеността и генерирай отново.</div>
      ) : null}
      {planBlocks.map((b) => (
        <div key={b.blockType} className="aiGenBlock">
          <h3 className="aiGenBlockTitle">
            {b.blockType} <span>({b.targetMinutes} мин)</span>
          </h3>
          <div className="aiGenBlockDrills">
            {b.drills?.map((d, idx) => (
              <div key={`${b.blockType}-${d.drillId}`} className="aiGenPlanRow">
                <div className="aiGenPlanRowHead">
                  <strong>{d.name}</strong>
                  <span>
                    {d.minutes} мин · {d.intensity_type}
                  </span>
                </div>
                <div className="aiGenPlanRowActions">
                  <button type="button" className="aiGenBtn aiGenBtn--ghost" onClick={() => openDrillPreview(d.drillId)}>
                    Видео
                  </button>
                  <button type="button" className="aiGenBtn aiGenBtn--ghost" onClick={() => moveDrillInsideBlock(b.blockType, idx, "up")} disabled={idx === 0}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="aiGenBtn aiGenBtn--ghost"
                    onClick={() => moveDrillInsideBlock(b.blockType, idx, "down")}
                    disabled={idx === (b.drills?.length || 0) - 1}
                  >
                    ↓
                  </button>
                  <button type="button" className="aiGenBtn aiGenBtn--danger" onClick={() => removeDrillFromBlock(b.blockType, d.drillId)}>
                    Премахни
                  </button>
                  <label className="aiGenMoveLabel">
                    <span>В:</span>
                    <select defaultValue={b.blockType} onChange={(e) => moveDrillToBlock(b.blockType, e.target.value, d.drillId)}>
                      {planBlocks.map((target) => (
                        <option key={target.blockType} value={target.blockType}>
                          {target.blockType}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {(d.why || []).length > 0 ? (
                  <ul className="aiGenWhyList">
                    {(d.why || []).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function AIGeneratorSavePanel({
  form,
  setForm,
  err,
  isHeadCoachUser,
  clubCoaches,
  assignCoaches,
  toggleAssignCoach,
  assignDueDate,
  setAssignDueDate,
  assignNote,
  setAssignNote,
  savedTraining,
  planBlocks,
  setActiveTab,
}) {
  return (
    <section className="aiGenPanel">
      <p className="aiGenHint">Запиши тренировката с име. Клубният ръководител може да възложи задача на треньори.</p>
      <div className="aiGenGrid">
        <label className={`aiGenField aiGenField--wide${err && !form.trainingTitle?.trim() ? " aiGenField--invalid" : ""}`}>
          <span>Име на тренировката</span>
          <input
            value={form.trainingTitle}
            placeholder="Напр. U18 - Сервис и посрещане"
            onChange={(e) => setForm((p) => ({ ...p, trainingTitle: e.target.value }))}
          />
        </label>
      </div>
      {!planBlocks.length ? (
        <p className="aiGenWarn">Първо генерирай план от настройките, после запиши.</p>
      ) : null}
      {isHeadCoachUser ? (
        <div className="aiGenAssignBox">
          <h3 className="aiGenAssignTitle">Възлагане след запис</h3>
          <div className="aiGenCoachList">
            {clubCoaches.length === 0 ? <p className="aiGenHint">Няма налични треньори в клуба.</p> : null}
            {clubCoaches.map((c) => (
              <label key={c.id} className="aiGenCoachCheck">
                <input type="checkbox" checked={assignCoaches.includes(String(c.id))} onChange={() => toggleAssignCoach(c.id)} />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
          <div className="aiGenGrid">
            <label className="aiGenField">
              <span>Краен срок</span>
              <input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} />
            </label>
            <label className="aiGenField aiGenField--wide">
              <span>Бележка</span>
              <input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="Бележка към задачата" />
            </label>
          </div>
        </div>
      ) : null}
      {savedTraining?.id ? (
        <p className="aiGenSuccessInline">
          Последен запис: #{savedTraining.id} — {savedTraining.title}.{" "}
          <button type="button" className="aiGenLinkBtn" onClick={() => setActiveTab("plan")}>
            Виж план
          </button>
        </p>
      ) : null}
    </section>
  );
}
