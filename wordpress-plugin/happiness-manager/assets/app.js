(function () {
  const config = window.HM_CONFIG || {};
  const roots = Array.from(document.querySelectorAll("[data-hm-app]"));
  if (!roots.length) return;

  const STORAGE_FALLBACK_KEY = "hm-wp-fallback-state";
  const tabs = [
    ["goals", "目標"],
    ["board", "64分解"],
    ["journal", "日誌"],
    ["coach", "AI相談"],
    ["backup", "保存"]
  ];
  const urlParams = new URLSearchParams(window.location.search);
  const rootInitialTab = roots[0]?.dataset.initialTab || "";
  const requestedTab = urlParams.get("hm_tab") || rootInitialTab || "goals";
  const validTab = tabs.some(([key]) => key === requestedTab) ? requestedTab : "goals";

  let state = null;
  let activeTab = validTab;
  let activeDate = today();
  let selectedThemeIndex = 0;
  let saveTimer = null;
  let saveStatus = "読み込み中";
  let saveTone = "loading";
  let coachBusy = false;
  let coachText = "";

  function today() {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function blankThemes() {
    return Array.from({ length: 8 }, () => ({
      title: "",
      actions: Array.from({ length: 8 }, () => ({ text: "", routine: false }))
    }));
  }

  function blankPerspectives() {
    return {
      selfIntangible: "",
      selfTangible: "",
      othersIntangible: "",
      othersTangible: ""
    };
  }

  function blankAiMemory() {
    return {
      notes: "",
      decisions: "",
      handoff: "",
      items: [],
      history: []
    };
  }

  function createGoal(profileId) {
    return {
      id: uid("goal"),
      profileId,
      title: "新しい目標",
      target: "",
      deadline: "",
      measure: "",
      purpose: "",
      perspectives: blankPerspectives(),
      firstStep: "",
      themes: blankThemes()
    };
  }

  function defaultState() {
    const profileId = uid("profile");
    const goal = createGoal(profileId);
    goal.title = "最初の目標";
    goal.themes[0].title = "体調";
    goal.themes[0].actions[0] = { text: "睡眠時間を記録する", routine: true };
    goal.themes[1].title = "準備";
    goal.themes[1].actions[0] = { text: "明日の一手を決める", routine: true };

    return {
      profiles: [{ id: profileId, name: "じぶん" }],
      activeProfileId: profileId,
      activeGoalId: goal.id,
      boardMode: "edit",
      goals: [goal],
      daily: {},
      journals: {},
      aiMemory: { [profileId]: blankAiMemory() }
    };
  }

  function normalizeState(input) {
    const next = input && typeof input === "object" ? input : defaultState();
    next.profiles = Array.isArray(next.profiles) && next.profiles.length ? next.profiles : defaultState().profiles;
    next.activeProfileId = next.activeProfileId || next.profiles[0].id;
    next.goals = Array.isArray(next.goals) ? next.goals : [];
    next.boardMode = next.boardMode === "open" ? "open" : "edit";
    next.daily = next.daily && typeof next.daily === "object" ? next.daily : {};
    next.journals = next.journals && typeof next.journals === "object" ? next.journals : {};
    next.aiMemory = next.aiMemory && typeof next.aiMemory === "object" ? next.aiMemory : {};

    if (!next.profiles.some((profile) => profile.id === next.activeProfileId)) {
      next.activeProfileId = next.profiles[0].id;
    }

    next.profiles.forEach((profile) => {
      next.aiMemory[profile.id] = normalizeAiMemory(next.aiMemory[profile.id]);
    });

    Object.keys(next.aiMemory).forEach((profileId) => {
      if (!next.profiles.some((profile) => profile.id === profileId)) {
        delete next.aiMemory[profileId];
      }
    });

    if (!next.goals.some((goal) => goal.profileId === next.activeProfileId)) {
      next.goals.push(createGoal(next.activeProfileId));
    }

    next.goals.forEach((goal) => {
      goal.perspectives = Object.assign(blankPerspectives(), goal.perspectives || {});
      goal.themes = Array.isArray(goal.themes) ? goal.themes.slice(0, 8) : blankThemes();
      while (goal.themes.length < 8) goal.themes.push({ title: "", actions: [] });
      goal.themes.forEach((theme) => {
        theme.actions = Array.isArray(theme.actions) ? theme.actions.slice(0, 8) : [];
        while (theme.actions.length < 8) theme.actions.push({ text: "", routine: false });
        theme.actions = theme.actions.map((action) => ({
          text: action && action.text ? String(action.text) : "",
          routine: Boolean(action && action.routine)
        }));
      });
    });

    if (!next.activeGoalId || !next.goals.some((goal) => goal.id === next.activeGoalId && goal.profileId === next.activeProfileId)) {
      const goalsForProfile = next.goals.filter((goal) => goal.profileId === next.activeProfileId);
      next.activeGoalId = goalsForProfile[0]?.id || next.goals[0].id;
    }

    return next;
  }

  function normalizeAiMemory(memory) {
    const blank = blankAiMemory();
    if (!memory || typeof memory !== "object") return blank;

    const history = Array.isArray(memory.history) ? memory.history : [];
    const items = Array.isArray(memory.items) ? memory.items : [];
    return {
      notes: String(memory.notes || ""),
      decisions: String(memory.decisions || ""),
      handoff: String(memory.handoff || ""),
      items: items.slice(0, 80).map((item) => ({
        id: String(item && item.id ? item.id : uid("memory")),
        title: String(item && item.title ? item.title : ""),
        kind: String(item && item.kind ? item.kind : "memo"),
        body: String(item && item.body ? item.body : ""),
        imageUrl: String(item && item.imageUrl ? item.imageUrl : ""),
        updatedAt: String(item && item.updatedAt ? item.updatedAt : "")
      })).filter((item) => item.body.trim() || item.title.trim() || item.imageUrl.trim()),
      history: history.slice(0, 8).map((item) => ({
        id: String(item && item.id ? item.id : uid("coach")),
        at: String(item && item.at ? item.at : ""),
        mode: String(item && item.mode ? item.mode : ""),
        message: String(item && item.message ? item.message : ""),
        response: String(item && item.response ? item.response : ""),
        handoff: String(item && item.handoff ? item.handoff : "")
      }))
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activeProfile() {
    return state.profiles.find((profile) => profile.id === state.activeProfileId) || state.profiles[0];
  }

  function profileGoals() {
    return state.goals.filter((goal) => goal.profileId === state.activeProfileId);
  }

  function activeGoal() {
    let goal = state.goals.find((item) => item.id === state.activeGoalId && item.profileId === state.activeProfileId);
    if (!goal) {
      goal = profileGoals()[0] || createGoal(state.activeProfileId);
      if (!state.goals.includes(goal)) state.goals.push(goal);
      state.activeGoalId = goal.id;
    }
    return goal;
  }

  function dayKey() {
    return `${state.activeProfileId}|${activeDate}`;
  }

  function dailyRecord() {
    const key = dayKey();
    if (!state.daily[key]) {
      state.daily[key] = { mood: 3, energy: 3, load: 3, focus: 3, checks: {} };
    }
    return state.daily[key];
  }

  function journalRecord() {
    const key = dayKey();
    if (!state.journals[key]) {
      state.journals[key] = { best: "", learned: "", next: "", gratitude: "", selfTalk: "", memo: "" };
    }
    return state.journals[key];
  }

  function activeAiMemory() {
    if (!state.aiMemory || typeof state.aiMemory !== "object") {
      state.aiMemory = {};
    }
    if (!state.aiMemory[state.activeProfileId]) {
      state.aiMemory[state.activeProfileId] = blankAiMemory();
    }
    return state.aiMemory[state.activeProfileId];
  }

  function limitText(value, maxLength = 900) {
    const text = String(value || "").trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function extractHandoff(responseText) {
    const text = String(responseText || "");
    const match = text.match(/(?:^|\n)#{1,3}\s*AI引き継ぎメモ\s*\n([\s\S]*)/);
    return match ? match[1].trim() : "";
  }

  function recentJournalSummaries(limit = 5) {
    return Object.entries(state.journals || {})
      .filter(([key, journal]) => key.startsWith(`${state.activeProfileId}|`) && journal && typeof journal === "object")
      .map(([key, journal]) => ({
        date: key.split("|")[1] || "",
        best: limitText(journal.best, 220),
        learned: limitText(journal.learned, 220),
        next: limitText(journal.next, 220),
        memo: limitText(journal.memo, 220)
      }))
      .filter((item) => item.best || item.learned || item.next || item.memo)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  function recordCoachMemory(mode, message, responseText) {
    const memory = activeAiMemory();
    const handoff = extractHandoff(responseText);
    const entry = {
      id: uid("coach"),
      at: new Date().toISOString(),
      mode,
      message: limitText(message, 900),
      response: limitText(responseText, 1400),
      handoff: limitText(handoff, 900)
    };

    memory.history = [entry, ...(Array.isArray(memory.history) ? memory.history : [])].slice(0, 8);
    const summary = handoff || `相談: ${limitText(message, 220)}\nAI: ${limitText(responseText, 420)}`;
    memory.handoff = limitText(`${today()} ${mode}\n${summary}\n\n${memory.handoff || ""}`, 5000);
  }

  function memoryKindLabel(kind) {
    const labels = {
      profile: "プロフィール",
      values: "価値観",
      family: "家族情報",
      goal: "目標背景",
      story: "小説・作品",
      image: "画像",
      memo: "メモ",
      other: "その他"
    };
    return labels[kind] || labels.memo;
  }

  function memoryKindOptions(selected = "memo") {
    const options = [
      ["memo", "メモ"],
      ["story", "小説・作品"],
      ["image", "画像"],
      ["profile", "プロフィール"],
      ["values", "価値観"],
      ["family", "家族情報"],
      ["goal", "目標背景"],
      ["other", "その他"]
    ];
    return options.map(([value, label]) => (
      `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`
    )).join("");
  }

  function findMemoryItem(id) {
    const memory = activeAiMemory();
    return (Array.isArray(memory.items) ? memory.items : []).find((item) => item.id === id);
  }

  function updateMemoryItem(id, key, value) {
    const item = findMemoryItem(id);
    if (!item) return;
    item[key] = value;
    item.updatedAt = new Date().toISOString();
    queueSave();
  }

  function memoryEntries(memory) {
    const entries = [];
    if (memory.notes && memory.notes.trim()) {
      entries.push({
        id: "legacy-notes",
        kind: "memo",
        title: "AIに覚えておいてほしいこと",
        body: memory.notes,
        legacyField: "notes"
      });
    }
    if (memory.decisions && memory.decisions.trim()) {
      entries.push({
        id: "legacy-decisions",
        kind: "goal",
        title: "大事な前提・決めたこと",
        body: memory.decisions,
        legacyField: "decisions"
      });
    }
    return entries.concat(Array.isArray(memory.items) ? memory.items : []);
  }

  function renderMemoryVault(memory) {
    const entries = memoryEntries(memory);
    const list = entries.length ? entries.map((item) => {
      const title = item.title || memoryKindLabel(item.kind);
      const body = item.body || "";
      const imageUrl = item.imageUrl || "";
      const summary = imageUrl ? `画像URLあり / ${limitText(body || imageUrl, 90)}` : limitText(body, 90);
      const editor = item.legacyField
        ? `
          <label class="hm-memory-editor-field wide">
            <span>内容</span>
            <textarea data-ai-memory-field="${item.legacyField}" class="hm-memory-body">${escapeHtml(body)}</textarea>
          </label>
          <div class="hm-buttons"><button type="button" data-clear-memory-field="${item.legacyField}">削除</button></div>
        `
        : `
          <div class="hm-memory-editor">
            <label class="hm-memory-editor-field">
              <span>タイトル</span>
              <input data-memory-item-title="${escapeHtml(item.id)}" value="${escapeHtml(title)}">
            </label>
            <label class="hm-memory-editor-field">
              <span>種類</span>
              <select data-memory-item-kind="${escapeHtml(item.id)}">${memoryKindOptions(item.kind)}</select>
            </label>
            <label class="hm-memory-editor-field wide">
              <span>WordPressメディアURL（任意）</span>
              <input type="url" data-memory-item-image-url="${escapeHtml(item.id)}" value="${escapeHtml(imageUrl)}" placeholder="https://...">
            </label>
            ${imageUrl ? `<a class="hm-memory-image-link" href="${escapeHtml(imageUrl)}" target="_blank" rel="noreferrer">画像URLを開く</a><img class="hm-memory-image-preview" src="${escapeHtml(imageUrl)}" alt="">` : ""}
            <label class="hm-memory-editor-field wide">
              <span>内容</span>
              <textarea data-memory-item-body="${escapeHtml(item.id)}" class="hm-memory-body">${escapeHtml(body)}</textarea>
            </label>
          </div>
          <div class="hm-buttons"><button type="button" data-delete-memory-item="${escapeHtml(item.id)}">削除</button></div>
        `;
      return `
        <details class="hm-memory-entry">
          <summary>
            <span>
              <strong>${escapeHtml(title)}</strong>
              <small>${escapeHtml(memoryKindLabel(item.kind))}${item.updatedAt ? ` / ${escapeHtml(item.updatedAt.slice(0, 10))}` : ""}</small>
            </span>
            <em>${escapeHtml(summary)}</em>
          </summary>
          ${editor}
        </details>
      `;
    }).join("") : '<p class="hm-muted">まだ保存情報はありません。</p>';

    return `
      <div class="hm-memory-box">
        <div>
          <strong>AIに渡す保存情報</strong>
          <p class="hm-muted">小説、設定、価値観、家族情報などを項目ごとに保存できます。長文は折りたたんで確認できます。</p>
        </div>
        <div class="hm-memory-list">${list}</div>
        <details class="hm-memory-add">
          <summary>保存情報を追加</summary>
          <div class="hm-memory-new">
            <label>
              <span>タイトル</span>
              <input data-memory-new-title placeholder="例: 小説の第1章">
            </label>
            <label>
              <span>種類</span>
              <select data-memory-new-kind>${memoryKindOptions("memo")}</select>
            </label>
            <label class="wide">
              <span>WordPressメディアURL（任意）</span>
              <input type="url" data-memory-new-image-url placeholder="画像を保存した時だけURLを貼ります">
            </label>
            <label class="wide">
              <span>内容</span>
              <textarea data-memory-new-body placeholder="ここに保存したい情報を書きます。長文でも、この欄だけでスクロールできます。"></textarea>
            </label>
            <p class="hm-muted wide">画像URLは保存情報として残します。AI相談では画像そのものを自動送信しないので、画像解析ぶんのAPI料金は勝手に増えません。</p>
            <button type="button" data-add-memory-item>保存情報に追加</button>
          </div>
        </details>
      </div>
    `;
  }

  function routineItems() {
    const items = [];
    profileGoals().forEach((goal) => {
      goal.themes.forEach((theme, themeIndex) => {
        theme.actions.forEach((action, actionIndex) => {
          if (!action.routine || !action.text.trim()) return;
          items.push({
            id: `action:${goal.id}:${themeIndex}:${actionIndex}`,
            text: action.text.trim(),
            goalTitle: goal.title || "目標",
            themeTitle: theme.title || `テーマ${themeIndex + 1}`
          });
        });
      });
    });
    return items;
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${config.restUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-WP-Nonce": config.nonce,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || "WordPress request failed");
    }
    return data;
  }

  async function loadState() {
    try {
      const data = await apiFetch("/state");
      state = normalizeState(data.state);
      localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(state));
      saveStatus = "WordPressから読み込み済み";
      saveTone = "saved";
    } catch (error) {
      const fallback = localStorage.getItem(STORAGE_FALLBACK_KEY);
      state = normalizeState(fallback ? JSON.parse(fallback) : null);
      saveStatus = `一時保存で起動: ${error.message}`;
      saveTone = "error";
    }
    renderAll();
  }

  function queueSave() {
    saveStatus = "未保存の変更があります";
    saveTone = "dirty";
    renderAll(false);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }

  async function saveNow() {
    try {
      clearTimeout(saveTimer);
      saveTimer = null;
      saveStatus = "WordPressに保存中...";
      saveTone = "saving";
      renderAll(false);
      localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(state));
      const data = await apiFetch("/state", {
        method: "POST",
        body: JSON.stringify({ state })
      });
      const savedAt = data.savedAt ? data.savedAt.slice(11, 19) : new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      saveStatus = `WordPressに保存済み ${savedAt}`;
      saveTone = "saved";
    } catch (error) {
      saveStatus = `保存エラー: ${error.message}`;
      saveTone = "error";
    }
    renderAll(false);
  }

  function renderAll(full = true) {
    roots.forEach((root) => {
      if (!state) {
        root.innerHTML = '<div class="hm-loading">読み込み中...</div>';
        return;
      }
      if (full) root.innerHTML = renderApp();
      updateStatus(root);
      if (full) resizeAutosizeTextareas(root);
    });
  }

  function updateStatus(root) {
    const status = root.querySelector("[data-save-status]");
    if (status) {
      status.textContent = saveStatus;
      status.dataset.status = saveTone;
    }
  }

  function resizeAutosizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function resizeAutosizeTextareas(root) {
    root.querySelectorAll("textarea[data-autosize]").forEach(resizeAutosizeTextarea);
  }

  function renderApp() {
    return `
      <div class="hm-shell">
        <div class="hm-toolbar">
          <div>
            <strong>Happiness Manager</strong>
            <span data-save-status data-status="${escapeHtml(saveTone)}">${escapeHtml(saveStatus)}</span>
          </div>
          <div class="hm-toolbar-controls">
            <button type="button" data-save-now>今すぐ保存</button>
            <select data-profile-select>${state.profiles.map((profile) => `<option value="${profile.id}" ${profile.id === state.activeProfileId ? "selected" : ""}>${escapeHtml(profile.name)}</option>`).join("")}</select>
            <input type="date" data-active-date value="${escapeHtml(activeDate)}">
          </div>
        </div>
        <div class="hm-tabs">
          ${tabs.map(([key, label]) => `<button type="button" data-tab="${key}" class="${activeTab === key ? "active" : ""}">${label}</button>`).join("")}
        </div>
        <div class="hm-view">${renderView()}</div>
      </div>
    `;
  }

  function renderView() {
    if (activeTab === "goals") return renderGoals();
    if (activeTab === "board") return renderBoard();
    if (activeTab === "journal") return renderJournal();
    if (activeTab === "coach") return renderCoach();
    return renderBackup();
  }

  function renderGoals() {
    const goal = activeGoal();
    return `
      <div class="hm-grid hm-grid-2">
        <section class="hm-panel">
          <header>
            <h2>目標</h2>
            <button type="button" data-add-goal>追加</button>
          </header>
          <div class="hm-goal-list">
            ${profileGoals().map((item) => `<button type="button" data-goal-id="${item.id}" class="${item.id === state.activeGoalId ? "active" : ""}">${escapeHtml(item.title || "無題の目標")}</button>`).join("")}
          </div>
        </section>
        <section class="hm-panel">
          <header><h2>中心設定</h2></header>
          <div class="hm-form-grid">
            ${field("title", "目標名", goal.title, "input")}
            ${field("deadline", "期限", goal.deadline, "date")}
            ${field("target", "達成したい結果", goal.target, "textarea", "wide")}
            ${field("measure", "達成のものさし", goal.measure, "textarea")}
            ${field("purpose", "何のために", goal.purpose, "textarea")}
            ${field("firstStep", "最初の一手", goal.firstStep, "textarea", "wide")}
          </div>
        </section>
      </div>
      <section class="hm-panel">
        <header><h2>目的・目標の4観点</h2></header>
        ${renderPerspectives(goal)}
      </section>
    `;
  }

  function field(key, label, value, type, extra = "") {
    const control = type === "textarea"
      ? `<textarea data-goal-field="${key}" data-autosize>${escapeHtml(value)}</textarea>`
      : `<input type="${type}" data-goal-field="${key}" value="${escapeHtml(value)}">`;
    return `<label class="${extra}"><span>${label}</span>${control}</label>`;
  }

  function renderPerspectives(goal) {
    const items = [
      ["selfIntangible", "私・無形", "内面の変化"],
      ["selfTangible", "私・有形", "見える成果"],
      ["othersIntangible", "社会・他者・無形", "心への影響"],
      ["othersTangible", "社会・他者・有形", "具体的な貢献"]
    ];
    return `
      <div class="hm-perspectives">
        ${items.map(([key, label, hint]) => `
          <div class="hm-perspective">
            <div>
              <strong>${label}</strong>
              <span>${hint}</span>
              <button type="button" data-add-bullet="${key}">・追加</button>
            </div>
            <textarea data-perspective-field="${key}" data-autosize id="hm-${key}" placeholder="・">${escapeHtml(goal.perspectives[key])}</textarea>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderBoard() {
    const goal = activeGoal();
    return `
      <section class="hm-panel">
        <header>
          <h2>${state.boardMode === "open" ? "オープンウィンドウ64" : "64分解"}</h2>
          <div class="hm-segment">
            <button type="button" data-board-mode="edit" class="${state.boardMode === "edit" ? "active" : ""}">編集ビュー</button>
            <button type="button" data-board-mode="open" class="${state.boardMode === "open" ? "active" : ""}">一枚ビュー</button>
          </div>
        </header>
        ${state.boardMode === "open" ? renderOpenBoard(goal) : renderEditBoard(goal)}
      </section>
    `;
  }

  function renderEditBoard(goal) {
    const map = [0, 1, 2, 3, "center", 4, 5, 6, 7];
    const selected = goal.themes[selectedThemeIndex] || goal.themes[0];
    return `
      <div class="hm-board-edit">
        <div class="hm-theme-map">
          ${map.map((item) => {
            if (item === "center") return `<div class="hm-theme-card center"><b>${escapeHtml(goal.title || "目標")}</b><span>${escapeHtml(goal.deadline || "期限なし")}</span></div>`;
            const theme = goal.themes[item];
            return `<button type="button" data-theme-index="${item}" class="hm-theme-card ${selectedThemeIndex === item ? "active" : ""}"><small>テーマ ${item + 1}</small><b>${escapeHtml(theme.title || "未設定")}</b><span>${theme.actions.filter((action) => action.text.trim()).length}/8 行動</span></button>`;
          }).join("")}
        </div>
        <div class="hm-actions">
          <label><span>テーマ名</span><input data-theme-title="${selectedThemeIndex}" value="${escapeHtml(selected.title)}"></label>
          ${selected.actions.map((action, index) => `
            <div class="hm-action-row">
              <span>${index + 1}</span>
              <input data-action-theme-index="${selectedThemeIndex}" data-action-index="${index}" value="${escapeHtml(action.text)}" placeholder="行動">
              <button type="button" data-routine-theme="${selectedThemeIndex}" data-routine-action="${index}" class="${action.routine ? "active" : ""}">${action.routine ? "毎日" : "候補"}</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderOpenBoard(goal) {
    const blockOrder = [0, 1, 2, 3, "center", 4, 5, 6, 7];
    return `
      <div class="hm-open-scroll">
        <div class="hm-open-board">
          ${blockOrder.map((item) => item === "center" ? renderCenterBlock(goal) : renderActionBlock(goal, item)).join("")}
        </div>
      </div>
    `;
  }

  function renderCenterBlock(goal) {
    const order = [0, 1, 2, 3, "goal", 4, 5, 6, 7];
    return `<div class="hm-open-block center">${order.map((item) => {
      if (item === "goal") return `<div class="hm-open-cell center"><b>${escapeHtml(goal.title || "目標")}</b></div>`;
      const theme = goal.themes[item];
      return `<div class="hm-open-cell center"><small>テーマ ${item + 1}</small><input data-theme-title="${item}" value="${escapeHtml(theme.title)}" placeholder="テーマ"></div>`;
    }).join("")}</div>`;
  }

  function renderActionBlock(goal, themeIndex) {
    const theme = goal.themes[themeIndex];
    const order = [0, 1, 2, 3, "theme", 4, 5, 6, 7];
    return `<div class="hm-open-block">${order.map((item) => {
      if (item === "theme") return `<div class="hm-open-cell center"><small>テーマ ${themeIndex + 1}</small><input data-theme-title="${themeIndex}" value="${escapeHtml(theme.title)}" placeholder="テーマ"></div>`;
      const action = theme.actions[item];
      return `<div class="hm-open-cell"><small>${themeIndex + 1}-${item + 1}</small><textarea data-action-theme-index="${themeIndex}" data-action-index="${item}" placeholder="行動">${escapeHtml(action.text)}</textarea><button type="button" data-routine-theme="${themeIndex}" data-routine-action="${item}" class="${action.routine ? "active" : ""}">${action.routine ? "毎日" : "候補"}</button></div>`;
    }).join("")}</div>`;
  }

  function renderJournal() {
    const daily = dailyRecord();
    const journal = journalRecord();
    const items = routineItems();
    return `
      <div class="hm-grid hm-grid-2">
        <section class="hm-panel">
          <header><h2>コンディション</h2></header>
          ${slider("mood", "気分", daily.mood)}
          ${slider("energy", "体力", daily.energy)}
          ${slider("load", "負荷", daily.load)}
          ${slider("focus", "集中", daily.focus)}
          <h3>ルーティン</h3>
          ${items.length ? items.map((item) => `<label class="hm-check"><input type="checkbox" data-routine-check="${item.id}" ${daily.checks[item.id] ? "checked" : ""}> <span>${escapeHtml(item.text)}<small>${escapeHtml(item.goalTitle)} / ${escapeHtml(item.themeTitle)}</small></span></label>`).join("") : '<p class="hm-muted">64分解で毎日の行動を選ぶと表示されます。</p>'}
        </section>
        <section class="hm-panel">
          <header><h2>日誌</h2></header>
          <div class="hm-form-grid">
            ${journalField("best", "今日できたこと", journal.best)}
            ${journalField("learned", "気づき・学び", journal.learned)}
            ${journalField("next", "明日の一手", journal.next)}
            ${journalField("gratitude", "感謝", journal.gratitude)}
            ${journalField("selfTalk", "自分への言葉", journal.selfTalk, "wide")}
            ${journalField("memo", "メモ", journal.memo, "wide")}
          </div>
        </section>
      </div>
    `;
  }

  function slider(key, label, value) {
    return `<label class="hm-slider"><span>${label}</span><input type="range" min="1" max="5" data-daily-field="${key}" value="${value}"><b>${value}</b></label>`;
  }

  function journalField(key, label, value, extra = "") {
    return `<label class="${extra}"><span>${label}</span><textarea data-journal-field="${key}" data-autosize>${escapeHtml(value)}</textarea></label>`;
  }

  function renderCoachLegacy() {
    const memory = activeAiMemory();
    const history = Array.isArray(memory.history) ? memory.history : [];
    const historyHtml = history.length
      ? history.map((item) => `
        <div class="hm-memory-history-item">
          <strong>${escapeHtml((item.at || "").slice(0, 10) || "相談")}</strong>
          <span>${escapeHtml(item.mode || "goal")}</span>
          <p>${escapeHtml(limitText(item.message, 180))}</p>
        </div>
      `).join("")
      : '<p class="hm-muted">まだ相談履歴はありません。</p>';
    return `
      <section class="hm-panel">
        <header><h2>AI目標コーチ</h2></header>
        <div class="hm-coach">
          <div class="hm-memory-box">
            <div>
              <strong>AIメモリ</strong>
              <p class="hm-muted">相談のたびにAIへ渡す、プロフィールごとの引き継ぎ情報です。</p>
            </div>
            <div class="hm-memory-grid">
              <label>
                <span>AIに覚えておいてほしいこと</span>
                <textarea data-ai-memory-field="notes" data-autosize placeholder="例: 家族構成、性格、大事にしたい価値観、苦手なこと">${escapeHtml(memory.notes)}</textarea>
              </label>
              <label>
                <span>大事な前提・決めたこと</span>
                <textarea data-ai-memory-field="decisions" data-autosize placeholder="例: 今年は健康を最優先。朝の時間を整えたい。">${escapeHtml(memory.decisions)}</textarea>
              </label>
              <label class="wide">
                <span>AI引き継ぎメモ</span>
                <textarea data-ai-memory-field="handoff" data-autosize placeholder="AIとの相談後に自動で追記されます。必要に応じて手で直せます。">${escapeHtml(memory.handoff)}</textarea>
              </label>
            </div>
            <details class="hm-memory-history">
              <summary>最近の相談履歴</summary>
              ${historyHtml}
            </details>
          </div>
          <select data-coach-mode>
            <option value="goal">目標づくり</option>
            <option value="perspectives">4観点</option>
            <option value="board">64分解</option>
            <option value="journal">日誌の振り返り</option>
          </select>
          <textarea data-coach-message data-autosize placeholder="例: 健康の目標を作りたい。4観点と64分解を一緒に考えてほしい。"></textarea>
          <button type="button" data-ask-coach ${coachBusy ? "disabled" : ""}>${coachBusy ? "相談中..." : "AIに相談する"}</button>
          ${config.hasApiKey ? "" : '<p class="hm-muted">AIを使うには、WordPress管理画面のAI設定にOpenAI APIキーを保存してください。</p>'}
          <div class="hm-coach-result">${coachText ? escapeHtml(coachText).replaceAll("\n", "<br>") : "AIの返答がここに表示されます。"}</div>
        </div>
      </section>
    `;
  }

  function renderCoach() {
    const memory = activeAiMemory();
    const history = Array.isArray(memory.history) ? memory.history : [];
    const historyHtml = history.length
      ? history.map((item) => `
        <div class="hm-memory-history-item">
          <strong>${escapeHtml((item.at || "").slice(0, 10) || "相談")}</strong>
          <span>${escapeHtml(item.mode || "goal")}</span>
          <p>${escapeHtml(limitText(item.message, 180))}</p>
        </div>
      `).join("")
      : '<p class="hm-muted">まだ相談履歴はありません。</p>';

    return `
      <section class="hm-panel">
        <header><h2>AI目標コーチ</h2></header>
        <div class="hm-coach">
          <details class="hm-memory-history" open>
            <summary>最近の相談履歴</summary>
            ${historyHtml}
          </details>
          <label class="hm-coach-select">
            <span>相談したい項目</span>
            <select data-coach-mode>
              <option value="goal">目標づくり</option>
              <option value="perspectives">4観点</option>
              <option value="board">64分解</option>
              <option value="journal">日誌の振り返り</option>
            </select>
          </label>
          <label class="hm-coach-question">
            <span>相談したい質問内容</span>
            <textarea data-coach-message data-autosize placeholder="例: 健康の目標を作りたい。4観点と64分解を一緒に考えてほしい。"></textarea>
          </label>
          <button type="button" data-ask-coach ${coachBusy ? "disabled" : ""}>${coachBusy ? "相談中..." : "AIに相談する"}</button>
          ${config.hasApiKey ? "" : '<p class="hm-muted">AIを使うには、WordPress管理画面のAI設定にOpenAI APIキーを保存してください。</p>'}
          <div class="hm-coach-result">${coachText ? escapeHtml(coachText).replaceAll("\n", "<br>") : "AIの返答がここに表示されます。"}</div>
          <label class="hm-handoff-box">
            <span>AI引き継ぎメモ</span>
            <textarea data-ai-memory-field="handoff" placeholder="AIとの相談後に自動で追記されます。必要に応じて手で直せます。">${escapeHtml(memory.handoff)}</textarea>
          </label>
          ${renderMemoryVault(memory)}
        </div>
      </section>
    `;
  }

  function renderBackup() {
    return `
      <section class="hm-panel">
        <header><h2>バックアップ</h2></header>
        <div class="hm-buttons">
          <button type="button" data-save-now>今すぐWordPressに保存</button>
          <button type="button" data-export-json>JSONを書き出し</button>
          <label class="hm-import">JSONを読み込み<input type="file" accept="application/json" data-import-json></label>
        </div>
        <p class="hm-muted">WordPress保存に加えて、JSONを定期的に書き出すとさらに安心です。</p>
      </section>
    `;
  }

  function updateGoalField(target) {
    const goal = activeGoal();
    goal[target.dataset.goalField] = target.value;
    queueSave();
  }

  function addBullet(key) {
    const goal = activeGoal();
    const textarea = document.getElementById(`hm-${key}`);
    const current = textarea ? textarea.value : goal.perspectives[key] || "";
    const next = `${current}${current && !current.endsWith("\n") ? "\n" : ""}・`;
    goal.perspectives[key] = next;
    if (textarea) {
      textarea.value = next;
      resizeAutosizeTextarea(textarea);
      textarea.focus();
      textarea.setSelectionRange(next.length, next.length);
    }
    queueSave();
  }

  roots.forEach((root) => {
    root.addEventListener("click", async (event) => {
      const tabButton = event.target.closest("[data-tab]");
      if (tabButton) {
        activeTab = tabButton.dataset.tab;
        renderAll();
        return;
      }

      const goalButton = event.target.closest("[data-goal-id]");
      if (goalButton) {
        state.activeGoalId = goalButton.dataset.goalId;
        selectedThemeIndex = 0;
        queueSave();
        renderAll();
        return;
      }

      if (event.target.closest("[data-add-goal]")) {
        const goal = createGoal(state.activeProfileId);
        state.goals.push(goal);
        state.activeGoalId = goal.id;
        queueSave();
        renderAll();
        return;
      }

      const themeButton = event.target.closest("[data-theme-index]");
      if (themeButton) {
        selectedThemeIndex = Number(themeButton.dataset.themeIndex);
        renderAll();
        return;
      }

      const boardMode = event.target.closest("[data-board-mode]");
      if (boardMode) {
        state.boardMode = boardMode.dataset.boardMode === "open" ? "open" : "edit";
        queueSave();
        renderAll();
        return;
      }

      const routineButton = event.target.closest("[data-routine-action]");
      if (routineButton) {
        const themeIndex = Number(routineButton.dataset.routineTheme);
        const actionIndex = Number(routineButton.dataset.routineAction);
        const action = activeGoal().themes[themeIndex].actions[actionIndex];
        action.routine = !action.routine;
        selectedThemeIndex = themeIndex;
        queueSave();
        renderAll();
        return;
      }

      const bullet = event.target.closest("[data-add-bullet]");
      if (bullet) {
        addBullet(bullet.dataset.addBullet);
        return;
      }

      if (event.target.closest("[data-save-now]")) {
        await saveNow();
        return;
      }

      if (event.target.closest("[data-add-memory-item]")) {
        const kind = root.querySelector("[data-memory-new-kind]")?.value || "memo";
        const titleInput = root.querySelector("[data-memory-new-title]");
        const bodyInput = root.querySelector("[data-memory-new-body]");
        const imageUrlInput = root.querySelector("[data-memory-new-image-url]");
        const title = titleInput?.value.trim() || "";
        const body = bodyInput?.value.trim() || "";
        const imageUrl = imageUrlInput?.value.trim() || "";
        if (!title && !body && !imageUrl) return;

        const memory = activeAiMemory();
        memory.items = Array.isArray(memory.items) ? memory.items : [];
        memory.items.unshift({
          id: uid("memory"),
          kind,
          title: title || memoryKindLabel(kind),
          body,
          imageUrl,
          updatedAt: new Date().toISOString()
        });
        if (titleInput) titleInput.value = "";
        if (bodyInput) bodyInput.value = "";
        if (imageUrlInput) imageUrlInput.value = "";
        queueSave();
        renderAll();
        return;
      }

      const deleteMemoryItem = event.target.closest("[data-delete-memory-item]");
      if (deleteMemoryItem) {
        const memory = activeAiMemory();
        memory.items = (Array.isArray(memory.items) ? memory.items : []).filter((item) => item.id !== deleteMemoryItem.dataset.deleteMemoryItem);
        queueSave();
        renderAll();
        return;
      }

      const clearMemoryField = event.target.closest("[data-clear-memory-field]");
      if (clearMemoryField) {
        activeAiMemory()[clearMemoryField.dataset.clearMemoryField] = "";
        queueSave();
        renderAll();
        return;
      }

      if (event.target.closest("[data-export-json]")) {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `happiness-manager-${activeDate}.json`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      if (event.target.closest("[data-ask-coach]")) {
        const message = root.querySelector("[data-coach-message]")?.value.trim() || "";
        const mode = root.querySelector("[data-coach-mode]")?.value || "goal";
        if (!message) return;
        let memoryChanged = false;
        coachBusy = true;
        coachText = "";
        renderAll();
        try {
          const data = await apiFetch("/coach", {
            method: "POST",
            body: JSON.stringify({
              mode,
              message,
              context: {
                activeDate,
                profile: activeProfile(),
                goal: activeGoal(),
                daily: dailyRecord(),
                journal: journalRecord(),
                recentJournals: recentJournalSummaries(),
                aiMemory: activeAiMemory()
              }
            })
          });
          coachText = data.text || "返答を取得しましたが、本文が空でした。";
          recordCoachMemory(mode, message, coachText);
          memoryChanged = true;
        } catch (error) {
          coachText = `AI相談エラー: ${error.message}`;
        }
        coachBusy = false;
        renderAll();
        if (memoryChanged) queueSave();
      }
    });

    root.addEventListener("input", (event) => {
      const target = event.target;
      if (target.matches("textarea[data-autosize]")) resizeAutosizeTextarea(target);
      if (target.matches("[data-goal-field]")) updateGoalField(target);
      if (target.matches("[data-perspective-field]")) {
        activeGoal().perspectives[target.dataset.perspectiveField] = target.value;
        queueSave();
      }
      if (target.matches("[data-theme-title]")) {
        const themeIndex = Number(target.dataset.themeTitle);
        activeGoal().themes[themeIndex].title = target.value;
        selectedThemeIndex = themeIndex;
        queueSave();
      }
      if (target.matches("[data-action-index]")) {
        const themeIndex = Number(target.dataset.actionThemeIndex);
        const actionIndex = Number(target.dataset.actionIndex);
        activeGoal().themes[themeIndex].actions[actionIndex].text = target.value;
        selectedThemeIndex = themeIndex;
        queueSave();
      }
      if (target.matches("[data-daily-field]")) {
        dailyRecord()[target.dataset.dailyField] = Number(target.value);
        queueSave();
        renderAll();
      }
      if (target.matches("[data-journal-field]")) {
        journalRecord()[target.dataset.journalField] = target.value;
        queueSave();
      }
      if (target.matches("[data-ai-memory-field]")) {
        activeAiMemory()[target.dataset.aiMemoryField] = target.value;
        queueSave();
      }
      if (target.matches("[data-memory-item-title]")) {
        updateMemoryItem(target.dataset.memoryItemTitle, "title", target.value);
      }
      if (target.matches("[data-memory-item-body]")) {
        updateMemoryItem(target.dataset.memoryItemBody, "body", target.value);
      }
      if (target.matches("[data-memory-item-image-url]")) {
        updateMemoryItem(target.dataset.memoryItemImageUrl, "imageUrl", target.value);
      }
    });

    root.addEventListener("change", async (event) => {
      const target = event.target;
      if (target.matches("[data-profile-select]")) {
        state.activeProfileId = target.value;
        state.activeGoalId = profileGoals()[0]?.id || activeGoal().id;
        selectedThemeIndex = 0;
        queueSave();
        renderAll();
      }
      if (target.matches("[data-active-date]")) {
        activeDate = target.value || today();
        renderAll();
      }
      if (target.matches("[data-routine-check]")) {
        dailyRecord().checks[target.dataset.routineCheck] = target.checked;
        queueSave();
      }
      if (target.matches("[data-memory-item-kind]")) {
        updateMemoryItem(target.dataset.memoryItemKind, "kind", target.value);
      }
      if (target.matches("[data-import-json]") && target.files[0]) {
        const text = await target.files[0].text();
        state = normalizeState(JSON.parse(text));
        queueSave();
        renderAll();
      }
    });
  });

  loadState();
})();
