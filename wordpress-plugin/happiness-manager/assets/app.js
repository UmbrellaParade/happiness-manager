(function () {
  const config = window.HM_CONFIG || {};
  const roots = Array.from(document.querySelectorAll("[data-hm-app]"));
  if (!roots.length) return;

  const hasMobileRoot = roots.some((root) => root.dataset.mobileMode === "1");
  if (hasMobileRoot && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  const STORAGE_FALLBACK_KEY = "hm-wp-fallback-state";
  const tabs = [
    ["goals", "目標"],
    ["board", "64分解"],
    ["journal", "日誌"],
    ["coach", "AI相談"],
    ["archive", "過去目標"],
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
  let boardScope = "long";
  let boardPath = [];
  let coachArea = "goal";
  let coachTarget = "goal.long";
  let saveTimer = null;
  let saveStatus = "読み込み中";
  let saveTone = "loading";
  let saveLocked = false;
  let coachBusy = false;
  let coachText = "";
  let coachDraft = "";
  let coachSuggestions = [];
  let coachApplied = {};
  let coachApplyStatus = "";

  function today() {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function shiftDate(dateText, days) {
    const parts = String(dateText || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return today();
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() + days);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function blankAction() {
    return {
      text: "",
      note: "",
      routine: false,
      subs: [],
      childThemes: null
    };
  }

  function blankTheme() {
    return {
      title: "",
      subs: [],
      actions: Array.from({ length: 8 }, () => blankAction())
    };
  }

  function blankThemes() {
    return Array.from({ length: 8 }, () => blankTheme());
  }

  function blankPlan() {
    return {
      longTitle: "",
      longDate: "",
      recentTitle: "",
      recentDate: "",
      nextTitle: "",
      nextDate: "",
      achievedNote: ""
    };
  }

  function blankBoardVariants() {
    return {
      recent: null,
      next: null
    };
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
      plan: blankPlan(),
      perspectives: blankPerspectives(),
      firstStep: "",
      themes: blankThemes(),
      boardVariants: blankBoardVariants(),
      archives: []
    };
  }

  function normalizeLines(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 24);
    }
    if (typeof value === "string") {
      return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 24);
    }
    return [];
  }

  function linesToText(value) {
    return normalizeLines(value).join("\n");
  }

  function themeSubCount(theme) {
    return normalizeLines(theme && theme.subs).length;
  }

  function cloneThemes(themes) {
    return normalizeThemes(JSON.parse(JSON.stringify(themes || blankThemes())));
  }

  function normalizeAction(action, depth = 0) {
    const childThemes = action && Array.isArray(action.childThemes) && depth < 4
      ? normalizeThemes(action.childThemes, depth + 1)
      : null;
    return {
      text: action && action.text ? String(action.text) : "",
      note: action && action.note ? String(action.note) : "",
      routine: Boolean(action && action.routine),
      subs: normalizeLines(action && action.subs),
      childThemes
    };
  }

  function normalizeTheme(theme, depth = 0) {
    const next = {
      title: theme && theme.title ? String(theme.title) : "",
      subs: normalizeLines(theme && theme.subs),
      actions: Array.isArray(theme && theme.actions) ? theme.actions.slice(0, 8) : []
    };
    while (next.actions.length < 8) next.actions.push(blankAction());
    next.actions = next.actions.map((action) => normalizeAction(action, depth));
    return next;
  }

  function normalizeThemes(themes, depth = 0) {
    const next = Array.isArray(themes) ? themes.slice(0, 8) : blankThemes();
    while (next.length < 8) next.push(blankTheme());
    return next.map((theme) => normalizeTheme(theme, depth));
  }

  function normalizePlan(goal) {
    const plan = Object.assign(blankPlan(), goal && goal.plan ? goal.plan : {});
    if (!plan.longTitle && goal && goal.title) plan.longTitle = String(goal.title);
    if (!plan.longDate && goal && goal.deadline) plan.longDate = String(goal.deadline);
    return {
      longTitle: String(plan.longTitle || ""),
      longDate: String(plan.longDate || ""),
      recentTitle: String(plan.recentTitle || ""),
      recentDate: String(plan.recentDate || ""),
      nextTitle: String(plan.nextTitle || ""),
      nextDate: String(plan.nextDate || ""),
      achievedNote: String(plan.achievedNote || "")
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
      todayTasks: {},
      aiMemory: { [profileId]: blankAiMemory() }
    };
  }

  function normalizeState(input) {
    const next = input && typeof input === "object" ? input : defaultState();
    next.profiles = Array.isArray(next.profiles) && next.profiles.length ? next.profiles : defaultState().profiles;
    next.activeProfileId = next.activeProfileId || next.profiles[0].id;
    next.goals = Array.isArray(next.goals) ? next.goals : [];
    next.boardMode = next.boardMode === "open" ? "open" : "edit";
    next.daily = plainObject(next.daily);
    next.journals = plainObject(next.journals);
    next.aiMemory = plainObject(next.aiMemory);
    next.todayTasks = plainObject(next.todayTasks);
    Object.keys(next.daily).forEach((key) => {
      if (next.daily[key] && typeof next.daily[key] === "object") {
        next.daily[key].checks = plainObject(next.daily[key].checks);
      }
    });

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
      goal.title = String(goal.title || "新しい目標");
      goal.target = String(goal.target || "");
      goal.deadline = String(goal.deadline || "");
      goal.measure = String(goal.measure || "");
      goal.purpose = String(goal.purpose || "");
      goal.firstStep = String(goal.firstStep || "");
      goal.plan = normalizePlan(goal);
      goal.perspectives = Object.assign(blankPerspectives(), goal.perspectives || {});
      goal.themes = normalizeThemes(goal.themes);
      goal.boardVariants = goal.boardVariants && typeof goal.boardVariants === "object" ? goal.boardVariants : blankBoardVariants();
      goal.boardVariants.recent = Array.isArray(goal.boardVariants.recent) ? normalizeThemes(goal.boardVariants.recent) : null;
      goal.boardVariants.next = Array.isArray(goal.boardVariants.next) ? normalizeThemes(goal.boardVariants.next) : null;
      goal.archives = Array.isArray(goal.archives) ? goal.archives.slice(0, 80).map((item) => ({
        id: String(item && item.id ? item.id : uid("archive")),
        type: String(item && item.type ? item.type : "goal"),
        at: String(item && item.at ? item.at : new Date().toISOString()),
        title: String(item && item.title ? item.title : "履歴"),
        note: String(item && item.note ? item.note : ""),
        scope: String(item && item.scope ? item.scope : ""),
        pathLabel: String(item && item.pathLabel ? item.pathLabel : ""),
        plan: item && item.plan && typeof item.plan === "object" ? item.plan : null,
        target: String(item && item.target ? item.target : ""),
        purpose: String(item && item.purpose ? item.purpose : ""),
        perspectives: item && item.perspectives && typeof item.perspectives === "object" ? item.perspectives : null,
        themes: Array.isArray(item && item.themes) ? normalizeThemes(item.themes) : null,
        boardVariants: item && item.boardVariants && typeof item.boardVariants === "object" ? item.boardVariants : null
      })) : [];
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
        handoff: String(item && item.handoff ? item.handoff : ""),
        suggestions: normalizeBoardSuggestions({ boardSuggestions: Array.isArray(item && item.suggestions) ? item.suggestions : [] })
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

  function suspiciousText(value) {
    const text = String(value || "");
    if (/\?{3,}/.test(text)) return true;
    const markers = text.match(/[縺繧譁蜷髟逶谺菫譛螟蜍隕荳譌驕諠霆繝]/g) || [];
    return markers.length >= 3 && /[｡-ﾟ]/u.test(text);
  }

  function collectCorruptedTextPaths(value, path = "state", findings = []) {
    if (typeof value === "string") {
      if (suspiciousText(value)) findings.push(path);
      return findings;
    }
    if (!value || typeof value !== "object") return findings;
    if (Array.isArray(value)) {
      value.forEach((item, index) => collectCorruptedTextPaths(item, `${path}[${index}]`, findings));
      return findings;
    }
    Object.entries(value).forEach(([key, item]) => {
      collectCorruptedTextPaths(item, `${path}.${key}`, findings);
    });
    return findings;
  }

  function corruptedStateFindings(value) {
    return collectCorruptedTextPaths(value).slice(0, 8);
  }

  function hasCorruptedState(value) {
    return collectCorruptedTextPaths(value).length >= 3;
  }

  function cleanFallbackState() {
    const fallback = localStorage.getItem(STORAGE_FALLBACK_KEY);
    if (!fallback) return null;
    try {
      const fallbackState = normalizeState(JSON.parse(fallback));
      if (hasCorruptedState(fallbackState)) {
        localStorage.removeItem(STORAGE_FALLBACK_KEY);
        return null;
      }
      return fallbackState;
    } catch (error) {
      localStorage.removeItem(STORAGE_FALLBACK_KEY);
      return null;
    }
  }

  function shouldReturnToAppTitle(root) {
    return root.dataset.mobileMode === "1" || (window.matchMedia && window.matchMedia("(max-width: 700px)").matches);
  }

  function fixedTopOffset() {
    let offset = 12;
    const elements = document.querySelectorAll("#wpadminbar, #header, .l-header, .site-header, body > header");
    elements.forEach((element) => {
      const style = window.getComputedStyle(element);
      if (style.position !== "fixed" && style.position !== "sticky") return;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.top > 8 || rect.bottom <= 0) return;
      offset = Math.max(offset, Math.min(180, rect.bottom + 12));
    });
    return offset;
  }

  function scrollToAppTitle(root, behavior = "auto") {
    if (!shouldReturnToAppTitle(root)) return;
    const target = root.querySelector(".hm-toolbar strong") || root.querySelector(".hm-toolbar") || root;
    const top = target.getBoundingClientRect().top + window.scrollY - fixedTopOffset();
    window.scrollTo({ top: Math.max(0, top), behavior });
  }

  function scheduleScrollToAppTitle(root, behavior = "auto") {
    if (!shouldReturnToAppTitle(root)) return;
    const delays = behavior === "smooth" ? [0] : [0, 180, 520];
    window.requestAnimationFrame(() => {
      delays.forEach((delay) => {
        window.setTimeout(() => scrollToAppTitle(root, behavior), delay);
      });
    });
  }

  function scrollAllToAppTitle(behavior = "auto") {
    roots.forEach((root) => scheduleScrollToAppTitle(root, behavior));
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

  function boardScopeLabel(scope = boardScope) {
    const labels = {
      long: "長期目標の64",
      recent: "直近目標の64",
      next: "次の目標の64"
    };
    return labels[scope] || labels.long;
  }

  function boardGoalTitle(goal, scope = boardScope) {
    if (scope === "recent") return goal.plan.recentTitle || "直近の目標";
    if (scope === "next") return goal.plan.nextTitle || "次の目標";
    return goal.plan.longTitle || goal.title || "長期目標";
  }

  function boardGoalDate(goal, scope = boardScope) {
    if (scope === "recent") return goal.plan.recentDate || "";
    if (scope === "next") return goal.plan.nextDate || "";
    return goal.plan.longDate || goal.deadline || "";
  }

  function boardActionAtPath(goal) {
    let themes = baseBoardThemes(goal, false);
    let action = null;
    for (const step of boardPath) {
      action = themes[step.themeIndex]?.actions?.[step.actionIndex] || null;
      if (!action) return null;
      themes = Array.isArray(action.childThemes) ? action.childThemes : blankThemes();
    }
    return action;
  }

  function boardCenterTitle(goal) {
    const action = boardActionAtPath(goal);
    return action?.text || boardGoalTitle(goal);
  }

  function boardCenterDate(goal) {
    return boardPath.length ? "" : boardGoalDate(goal);
  }

  function ensureBoardVariant(goal, scope = boardScope) {
    goal.boardVariants = goal.boardVariants && typeof goal.boardVariants === "object" ? goal.boardVariants : blankBoardVariants();
    if (scope === "long") return goal.themes;
    if (!Array.isArray(goal.boardVariants[scope])) {
      goal.boardVariants[scope] = cloneThemes(goal.themes);
    }
    return goal.boardVariants[scope];
  }

  function baseBoardThemes(goal, forWrite = false) {
    if (boardScope === "long") return goal.themes;
    return forWrite ? ensureBoardVariant(goal, boardScope) : (Array.isArray(goal.boardVariants?.[boardScope]) ? goal.boardVariants[boardScope] : goal.themes);
  }

  function boardThemesAtPath(goal, forWrite = false) {
    let themes = baseBoardThemes(goal, forWrite);
    for (const step of boardPath) {
      const theme = themes[step.themeIndex];
      const action = theme?.actions?.[step.actionIndex];
      if (!action) return blankThemes();
      if (forWrite && !Array.isArray(action.childThemes)) {
        action.childThemes = blankThemes();
      }
      themes = Array.isArray(action.childThemes) ? action.childThemes : blankThemes();
    }
    return themes;
  }

  function baseBoardThemesForScope(goal, scope, forWrite = false) {
    if (scope === "long") return goal.themes;
    if (scope === "recent" || scope === "next") {
      return forWrite ? ensureBoardVariant(goal, scope) : (Array.isArray(goal.boardVariants?.[scope]) ? goal.boardVariants[scope] : goal.themes);
    }
    return baseBoardThemes(goal, forWrite);
  }

  function boardThemesAtSuggestionPath(goal, suggestion, forWrite = false) {
    let themes = baseBoardThemesForScope(goal, suggestion.scope || boardScope, forWrite);
    (Array.isArray(suggestion.path) ? suggestion.path : []).forEach((step) => {
      const theme = themes[step.themeIndex];
      const action = theme?.actions?.[step.actionIndex];
      if (!action) return;
      if (forWrite && !Array.isArray(action.childThemes)) action.childThemes = blankThemes();
      themes = Array.isArray(action.childThemes) ? action.childThemes : blankThemes();
    });
    return themes;
  }

  function boardPathLabel(goal) {
    if (!boardPath.length) return boardScopeLabel();
    let themes = baseBoardThemes(goal, false);
    const labels = [boardScopeLabel()];
    boardPath.forEach((step) => {
      const action = themes[step.themeIndex]?.actions?.[step.actionIndex];
      labels.push(action?.text || `${step.themeIndex + 1}-${step.actionIndex + 1}`);
      themes = Array.isArray(action?.childThemes) ? action.childThemes : blankThemes();
    });
    return labels.join(" > ");
  }

  function activeBoardTheme(goal, forWrite = false) {
    const themes = boardThemesAtPath(goal, forWrite);
    return themes[selectedThemeIndex] || themes[0];
  }

  function archiveGoal(goal) {
    goal.archives = Array.isArray(goal.archives) ? goal.archives : [];
    goal.archives.unshift({
      id: uid("archive"),
      type: "goal",
      at: new Date().toISOString(),
      title: goal.title || goal.plan.longTitle || "達成した目標",
      note: goal.plan.achievedNote || "",
      plan: Object.assign({}, goal.plan),
      target: goal.target || "",
      purpose: goal.purpose || "",
      perspectives: Object.assign({}, goal.perspectives || {}),
      themes: cloneThemes(goal.themes),
      boardVariants: JSON.parse(JSON.stringify(goal.boardVariants || blankBoardVariants()))
    });
    goal.archives = goal.archives.slice(0, 80);
  }

  function archiveBoard(goal) {
    goal.archives = Array.isArray(goal.archives) ? goal.archives : [];
    goal.archives.unshift({
      id: uid("archive"),
      type: "board",
      at: new Date().toISOString(),
      title: `${boardPathLabel(goal)} の履歴`,
      note: "",
      scope: boardScope,
      pathLabel: boardPathLabel(goal),
      themes: cloneThemes(boardThemesAtPath(goal, false))
    });
    goal.archives = goal.archives.slice(0, 80);
  }

  function dayKey(date = activeDate) {
    return `${state.activeProfileId}|${date}`;
  }

  function blankDailyRecord() {
    return { mood: 3, energy: 3, load: 3, focus: 3, checks: {} };
  }

  function dailyValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 3;
    return Math.min(5, Math.max(1, Math.round(number)));
  }

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeDailyRecord(record) {
    const source = record && typeof record === "object" ? record : {};
    return {
      mood: dailyValue(source.mood),
      energy: dailyValue(source.energy),
      load: dailyValue(source.load),
      focus: dailyValue(source.focus),
      checks: plainObject(source.checks)
    };
  }

  function dailyRecord(forWrite = false) {
    const key = dayKey();
    const record = normalizeDailyRecord(state.daily[key] || blankDailyRecord());
    if (forWrite) {
      state.daily[key] = record;
    }
    return record;
  }

  function blankJournalRecord() {
    return { best: "", learned: "", next: "", gratitude: "", selfTalk: "", memo: "" };
  }

  function normalizeJournalRecord(record) {
    return Object.assign(blankJournalRecord(), record && typeof record === "object" ? record : {});
  }

  function journalRecord(forWrite = false) {
    const key = dayKey();
    const record = normalizeJournalRecord(state.journals[key]);
    if (forWrite) {
      state.journals[key] = record;
    }
    return record;
  }

  function journalRecordForDate(date) {
    return normalizeJournalRecord(state.journals[dayKey(date)]);
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

  function recordCoachMemory(mode, message, responseText, suggestions) {
    const memory = activeAiMemory();
    const handoff = extractHandoff(responseText);
    const entry = {
      id: uid("coach"),
      at: new Date().toISOString(),
      mode,
      message: limitText(message, 6000),
      response: limitText(responseText, 30000),
      handoff: limitText(handoff, 4000),
      suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 12) : []
    };

    memory.history = [entry, ...(Array.isArray(memory.history) ? memory.history : [])].slice(0, 8);
    const summary = handoff || `相談: ${limitText(message, 220)}\nAI: ${limitText(responseText, 420)}`;
    memory.handoff = limitText(`${today()} ${mode}\n${summary}\n\n${memory.handoff || ""}`, 12000);
  }

  function normalizeSuggestionIndex(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(7, Math.max(0, Math.round(number)));
  }

  function normalizeSuggestionPath(path) {
    if (!Array.isArray(path)) return boardPath.map((step) => ({ themeIndex: step.themeIndex, actionIndex: step.actionIndex }));
    return path.slice(0, 4).map((step) => ({
      themeIndex: normalizeSuggestionIndex(step?.themeIndex),
      actionIndex: normalizeSuggestionIndex(step?.actionIndex)
    }));
  }

  function normalizeBoardSuggestions(input) {
    const rawItems = Array.isArray(input?.boardSuggestions) ? input.boardSuggestions : [];
    return rawItems.slice(0, 12).map((item) => {
      const scope = ["long", "recent", "next"].includes(item?.scope) ? item.scope : boardScope;
      const themeIndex = normalizeSuggestionIndex(item?.themeIndex);
      const actions = Array.isArray(item?.actions) ? item.actions.slice(0, 8).map((action) => ({
        index: normalizeSuggestionIndex(action?.index),
        text: String(action?.text || "").trim(),
        note: String(action?.note || "").trim(),
        routine: Boolean(action?.routine)
      })).filter((action) => action.text) : [];
      return {
        id: String(item?.id || uid("suggestion")),
        scope,
        path: normalizeSuggestionPath(item?.path),
        themeIndex,
        title: String(item?.title || "").trim(),
        reason: String(item?.reason || "").trim(),
        actions
      };
    }).filter((item) => item.title || item.actions.length);
  }

  function suggestionScopeLabel(suggestion) {
    const scopeLabel = boardScopeLabel(suggestion.scope || boardScope);
    return suggestion.path?.length ? `${scopeLabel} / 下位64` : scopeLabel;
  }

  function findCoachSuggestion(id) {
    return coachSuggestions.find((item) => item.id === id);
  }

  function coachSuggestionKey(suggestion, part = "all", actionIndex = null) {
    return `${suggestion?.id || "suggestion"}:${part}:${actionIndex === null ? "all" : actionIndex}`;
  }

  function isCoachSuggestionApplied(suggestion, part = "all", actionIndex = null) {
    return Boolean(coachApplied[coachSuggestionKey(suggestion, part, actionIndex)]);
  }

  function markCoachSuggestionApplied(suggestion, part = "all", actionIndex = null) {
    coachApplied[coachSuggestionKey(suggestion, part, actionIndex)] = true;
    if (part === "all") {
      if (suggestion.title) coachApplied[coachSuggestionKey(suggestion, "title")] = true;
      suggestion.actions.forEach((action) => {
        coachApplied[coachSuggestionKey(suggestion, "action", action.index)] = true;
      });
    }
  }

  function coachSuggestionAppliedLabel(suggestion, part = "all", actionIndex = null) {
    return isCoachSuggestionApplied(suggestion, part, actionIndex) ? "反映済み" : "反映";
  }

  function coachSuggestionDisabledAttr(suggestion, part = "all", actionIndex = null) {
    return isCoachSuggestionApplied(suggestion, part, actionIndex) ? " disabled" : "";
  }

  function applyCoachSuggestion(suggestion, part = "all", actionIndex = null) {
    const goal = activeGoal();
    const themes = boardThemesAtSuggestionPath(goal, suggestion, true);
    const theme = themes[suggestion.themeIndex];
    if (!theme) return false;

    if ((part === "all" || part === "title") && suggestion.title) {
      theme.title = suggestion.title;
    }

    if (part === "all") {
      suggestion.actions.forEach((action) => {
        theme.actions[action.index].text = action.text;
        if (action.note) theme.actions[action.index].note = action.note;
        if (action.routine) theme.actions[action.index].routine = true;
      });
    } else if (part === "action") {
      const action = suggestion.actions.find((item) => item.index === actionIndex);
      if (!action) return false;
      theme.actions[action.index].text = action.text;
      if (action.note) theme.actions[action.index].note = action.note;
      if (action.routine) theme.actions[action.index].routine = true;
    }

    boardScope = suggestion.scope || boardScope;
    boardPath = Array.isArray(suggestion.path) ? suggestion.path.map((step) => ({ themeIndex: step.themeIndex, actionIndex: step.actionIndex })) : [];
    selectedThemeIndex = suggestion.themeIndex;
    state.boardMode = "edit";
    markCoachSuggestionApplied(suggestion, part, actionIndex);
    coachApplyStatus = `${suggestionScopeLabel(suggestion)} / テーマ${suggestion.themeIndex + 1}へ反映しました。`;
    queueSave();
    renderAll();
    return true;
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

  function routineKey(text) {
    return String(text || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja-JP");
  }

  function routineItems() {
    const byText = new Map();
    function collectFromThemes(goal, themes, scope, prefix = "") {
      if (!Array.isArray(themes)) return;
      themes.forEach((theme, themeIndex) => {
        theme.actions.forEach((action, actionIndex) => {
          if (!action.routine || !action.text.trim()) return;
          const id = `${scope}:${prefix}${themeIndex}:${actionIndex}`;
          const sourceId = `action:${goal.id}:${id}`;
          const text = action.text.trim();
          const key = routineKey(text) || sourceId;
          const source = {
            id: sourceId,
            goalTitle: goal.title || "目標",
            themeTitle: `${boardScopeLabel(scope)} / ${theme.title || `テーマ${themeIndex + 1}`}`
          };
          if (byText.has(key)) {
            const item = byText.get(key);
            item.sourceIds.push(sourceId);
            item.sources.push(source);
          } else {
            byText.set(key, {
              id: sourceId,
              text,
              goalTitle: source.goalTitle,
              themeTitle: source.themeTitle,
              sourceIds: [sourceId],
              sources: [source]
            });
          }
          if (Array.isArray(action.childThemes)) {
            collectFromThemes(goal, action.childThemes, scope, `${themeIndex}-${actionIndex}>`);
          }
        });
      });
    }

    profileGoals().forEach((goal) => {
      collectFromThemes(goal, goal.themes, "long");
      collectFromThemes(goal, goal.boardVariants?.recent, "recent");
      collectFromThemes(goal, goal.boardVariants?.next, "next");
    });
    return Array.from(byText.values());
  }

  function todayTaskList(date = activeDate) {
    const list = (state.todayTasks || {})[dayKey(date)];
    return Array.isArray(list) ? list : [];
  }

  function todayActionItems() {
    const previousDate = shiftDate(activeDate, -1);
    const previousJournal = journalRecordForDate(previousDate);
    const fromJournal = normalizeLines(previousJournal.next).map((text, index) => {
      const key = routineKey(text) || `item-${index + 1}`;
      return {
        id: `today-action:${state.activeProfileId}:${activeDate}:${previousDate}:${index}:${key}`,
        text,
        goalTitle: "今日やること",
        themeTitle: `${previousDate}の明日の一手`,
        sourceIds: [`today-action:${state.activeProfileId}:${activeDate}:${previousDate}:${index}:${key}`]
      };
    });
    const manual = todayTaskList().map((item) => ({
      id: `today-extra:${item.id}`,
      text: String(item.text || ""),
      goalTitle: "今日やること",
      themeTitle: "自分で追加",
      sourceIds: [`today-extra:${item.id}`],
      removableTaskId: item.id
    }));
    return [...fromJournal, ...manual];
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
      const loadedState = normalizeState(data.state);
      const findings = corruptedStateFindings(loadedState);
      if (findings.length >= 3) {
        const fallbackState = cleanFallbackState();
        state = fallbackState || defaultState();
        saveLocked = true;
        saveStatus = `文字化けした保存データを検出したため保存を止めました。ページを再読み込みしてください。`;
        saveTone = "error";
        renderAll();
        scrollAllToAppTitle("auto");
        return;
      }
      state = loadedState;
      saveLocked = false;
      localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(state));
      saveStatus = "WordPressから読み込み済み";
      saveTone = "saved";
    } catch (error) {
      const fallbackState = cleanFallbackState();
      state = fallbackState || defaultState();
      saveLocked = !fallbackState;
      saveStatus = fallbackState
        ? `一時保存で起動: ${error.message}`
        : `読み込みに失敗したため保存を止めました: ${error.message}`;
      saveTone = "error";
    }
    renderAll();
    scrollAllToAppTitle("auto");
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
      if (saveLocked) {
        saveStatus = "保護モード中のため保存を止めました。ページを再読み込みしてください。";
        saveTone = "error";
        renderAll(false);
        return;
      }
      const findings = corruptedStateFindings(state);
      if (findings.length >= 3) {
        saveLocked = true;
        localStorage.removeItem(STORAGE_FALLBACK_KEY);
        saveStatus = "文字化けした可能性のあるデータを検出したため保存を止めました。ページを再読み込みしてください。";
        saveTone = "error";
        renderAll(false);
        return;
      }
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
    if (activeTab === "archive") return renderArchive();
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
          <header><h2>逆算の目標設定</h2></header>
          <div class="hm-form-grid hm-plan-grid">
            ${planField("longTitle", "長期目標", goal.plan.longTitle || goal.title, "textarea", "wide")}
            ${planField("longDate", "長期目標の日付", goal.plan.longDate || goal.deadline, "date")}
            ${planField("recentTitle", "直近の目標", goal.plan.recentTitle, "textarea", "wide")}
            ${planField("recentDate", "直近の目標の日付", goal.plan.recentDate, "date")}
            ${planField("nextTitle", "次の目標", goal.plan.nextTitle, "textarea", "wide")}
            ${planField("nextDate", "次の目標の日付", goal.plan.nextDate, "date")}
          </div>
          <div class="hm-buttons">
            <button type="button" class="hm-ai-instruction" data-make-instruction="plan">AI指示書を作成（逆算を深める）</button>
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
            ${planField("achievedNote", "達成メモ・保存したい成長", goal.plan.achievedNote, "textarea", "wide")}
          </div>
          <div class="hm-buttons hm-goal-actions">
            <button type="button" data-archive-goal>達成として過去目標へ保存</button>
          </div>
        </section>
      </div>
      <section class="hm-panel">
        <header><h2>目的・目標の4観点</h2></header>
        ${renderPerspectives(goal)}
        <div class="hm-buttons">
          <button type="button" class="hm-ai-instruction" data-make-instruction="perspectives">AI指示書を作成（4観点を深める）</button>
        </div>
      </section>
    `;
  }

  function field(key, label, value, type, extra = "") {
    const control = type === "textarea"
      ? `<textarea data-goal-field="${key}" data-autosize>${escapeHtml(value)}</textarea>`
      : `<input type="${type}" data-goal-field="${key}" value="${escapeHtml(value)}">`;
    return `<label class="${extra}"><span>${label}</span>${control}</label>`;
  }

  function planField(key, label, value, type, extra = "") {
    const control = type === "textarea"
      ? `<textarea data-goal-plan-field="${key}" data-autosize>${escapeHtml(value)}</textarea>`
      : `<input type="${type}" data-goal-plan-field="${key}" value="${escapeHtml(value)}">`;
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
          <div class="hm-perspective hm-perspective-${key}">
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
    const themes = boardThemesAtPath(goal, false);
    return `
      <section class="hm-panel">
        <header>
          <h2>${state.boardMode === "open" ? "オープンウィンドウ64" : "64分解"}</h2>
          <div class="hm-segment">
            <button type="button" data-board-mode="edit" class="${state.boardMode === "edit" ? "active" : ""}">編集ビュー</button>
            <button type="button" data-board-mode="open" class="${state.boardMode === "open" ? "active" : ""}">一枚ビュー</button>
          </div>
        </header>
        <div class="hm-board-toolbar">
          <div class="hm-segment">
            ${["long", "recent", "next"].map((scope) => `<button type="button" data-board-scope="${scope}" class="${boardScope === scope ? "active" : ""}">${escapeHtml(boardScopeLabel(scope))}</button>`).join("")}
          </div>
          <div class="hm-buttons">
            ${boardPath.length ? '<button type="button" data-board-path-back>上の64へ戻る</button>' : ""}
            <button type="button" class="hm-ai-instruction" data-make-instruction="board">AI指示書を作成（この64を深める）</button>
            <button type="button" data-archive-board>この64を履歴へ保存</button>
          </div>
        </div>
        <div class="hm-board-context">
          <strong>${escapeHtml(boardPathLabel(goal))}</strong>
          <span>${escapeHtml(boardCenterTitle(goal))}${boardCenterDate(goal) ? ` / ${escapeHtml(boardCenterDate(goal))}` : ""}</span>
          ${boardScope !== "long" && !Array.isArray(goal.boardVariants?.[boardScope]) ? '<small>長期目標の64を引き継いで表示中です。編集するとこの目標用にコピーして保存します。</small>' : ""}
        </div>
        ${state.boardMode === "open" ? renderOpenBoard(goal, themes) : renderEditBoard(goal, themes)}
      </section>
    `;
  }

  function renderEditBoard(goal, themes) {
    const map = [0, 1, 2, 3, "center", 4, 5, 6, 7];
    const selected = themes[selectedThemeIndex] || themes[0];
    return `
      <div class="hm-board-edit">
        <div class="hm-theme-column">
          <div class="hm-theme-map">
            ${map.map((item) => {
              if (item === "center") return `<div class="hm-theme-card center"><b>${escapeHtml(boardCenterTitle(goal))}</b><span>${escapeHtml(boardCenterDate(goal) || (boardPath.length ? boardPathLabel(goal) : "期限なし"))}</span></div>`;
              const theme = themes[item];
              const subCount = themeSubCount(theme);
              return `<button type="button" data-theme-index="${item}" class="hm-theme-card ${selectedThemeIndex === item ? "active" : ""}"><small>テーマ ${item + 1}</small><b>${escapeHtml(theme.title || "未設定")}</b><span>${theme.actions.filter((action) => action.text.trim()).length}/8 行動${subCount ? ` / サブ${subCount}` : ""}</span></button>`;
            }).join("")}
          </div>
        </div>
        <div class="hm-actions">
          <label><span>テーマ名</span><input data-theme-title="${selectedThemeIndex}" value="${escapeHtml(selected.title)}"></label>
          ${renderSelectedThemeWindow(themes, selectedThemeIndex)}
          ${selected.actions.map((action, index) => `
            <div class="hm-action-row">
              <span>${index + 1}</span>
              <input data-action-theme-index="${selectedThemeIndex}" data-action-index="${index}" value="${escapeHtml(action.text)}" placeholder="行動">
              <textarea class="hm-action-note" data-action-note-theme="${selectedThemeIndex}" data-action-note-index="${index}" data-autosize placeholder="メモ（→以降のアドバイス）">${escapeHtml(action.note || "")}</textarea>
              <div class="hm-action-buttons">
                <button type="button" data-routine-theme="${selectedThemeIndex}" data-routine-action="${index}" class="${action.routine ? "active" : ""}">${action.routine ? "毎日" : "候補"}</button>
                <button type="button" data-open-child-board="${selectedThemeIndex}:${index}">下位64</button>
                <button type="button" class="hm-action-move" data-move-action="${selectedThemeIndex}:${index}" data-move-action-direction="up" ${index === 0 ? "disabled" : ""}>上へ</button>
                <button type="button" class="hm-action-move" data-move-action="${selectedThemeIndex}:${index}" data-move-action-direction="down" ${index === 7 ? "disabled" : ""}>下へ</button>
              </div>
            </div>
          `).join("")}
          ${renderThemeSubs(selected, selectedThemeIndex)}
        </div>
      </div>
    `;
  }

  function renderThemeSubs(theme, themeIndex) {
    const subs = Array.isArray(theme && theme.subs) ? theme.subs : [];
    return `
      <section class="hm-theme-subs-panel">
        <div class="hm-theme-subs-head">
          <div>
            <strong>テーマ ${themeIndex + 1} のサブ</strong>
            <small>8つに絞る前の候補や補足を残せます</small>
          </div>
          <button type="button" data-add-theme-sub="${themeIndex}">追加</button>
        </div>
        <div class="hm-theme-subs-list">
          ${subs.length ? subs.map((item, index) => `
            <div class="hm-theme-sub-row">
              <span>${index + 1}</span>
              <input data-theme-sub-index="${themeIndex}:${index}" value="${escapeHtml(String(item || ""))}" placeholder="サブ項目">
              <button type="button" data-remove-theme-sub="${themeIndex}:${index}">削除</button>
            </div>
          `).join("") : '<p class="hm-muted">必要になったら追加できます。</p>'}
        </div>
      </section>
    `;
  }

  function renderSelectedThemeWindow(themes, themeIndex) {
    const theme = themes[themeIndex] || themes[0];
    if (!theme) return "";
    const order = [0, 1, 2, 3, "theme", 4, 5, 6, 7];
    return `
      <div class="hm-selected-theme-window">
        <div class="hm-selected-theme-window-head">
          <strong>テーマ ${themeIndex + 1} のオープンウィンドウ</strong>
          <small>中心にテーマ、周囲に8つの行動</small>
        </div>
        <div class="hm-open-block hm-open-block-selected">
          ${order.map((item) => {
            if (item === "theme") {
              return `<div class="hm-open-cell center"><small>テーマ ${themeIndex + 1}</small><b data-theme-preview-title="${themeIndex}">${escapeHtml(theme.title || "未設定")}</b></div>`;
            }
            const action = theme.actions[item];
            return `<div class="hm-open-cell"><small>${themeIndex + 1}-${item + 1}${action.subs.length ? ` / サブ${action.subs.length}` : ""}</small><p data-theme-preview-action="${themeIndex}:${item}">${escapeHtml(action.text || "未設定")}</p>${action.routine ? "<em>毎日</em>" : ""}</div>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderOpenBoard(goal, themes) {
    const blockOrder = [0, 1, 2, 3, "center", 4, 5, 6, 7];
    return `
      <div class="hm-open-scroll">
        <div class="hm-open-board">
          ${blockOrder.map((item) => item === "center" ? renderCenterBlock(goal, themes) : renderActionBlock(goal, themes, item)).join("")}
        </div>
      </div>
    `;
  }

  function renderCenterBlock(goal, themes) {
    const order = [0, 1, 2, 3, "goal", 4, 5, 6, 7];
    return `<div class="hm-open-block center">${order.map((item) => {
      if (item === "goal") return `<div class="hm-open-cell center"><b>${escapeHtml(boardCenterTitle(goal))}</b></div>`;
      const theme = themes[item];
      return `<div class="hm-open-cell center"><small>テーマ ${item + 1}</small><input data-theme-title="${item}" value="${escapeHtml(theme.title)}" placeholder="テーマ"></div>`;
    }).join("")}</div>`;
  }

  function renderActionBlock(goal, themes, themeIndex) {
    const theme = themes[themeIndex];
    const order = [0, 1, 2, 3, "theme", 4, 5, 6, 7];
    return `<div class="hm-open-block">${order.map((item) => {
      if (item === "theme") return `<div class="hm-open-cell center"><small>テーマ ${themeIndex + 1}</small><input data-theme-title="${themeIndex}" value="${escapeHtml(theme.title)}" placeholder="テーマ"></div>`;
      const action = theme.actions[item];
      return `<div class="hm-open-cell"><small>${themeIndex + 1}-${item + 1}${action.subs.length ? ` / サブ${action.subs.length}` : ""}</small><textarea data-action-theme-index="${themeIndex}" data-action-index="${item}" placeholder="行動">${escapeHtml(action.text)}</textarea><button type="button" data-routine-theme="${themeIndex}" data-routine-action="${item}" class="${action.routine ? "active" : ""}">${action.routine ? "毎日" : "候補"}</button></div>`;
    }).join("")}</div>`;
  }

  function updateThemePreview(root, themeIndex, actionIndex = null) {
    const theme = boardThemesAtPath(activeGoal(), false)[themeIndex];
    if (!theme) return;
    root.querySelectorAll(`[data-theme-preview-title="${themeIndex}"]`).forEach((element) => {
      element.textContent = theme.title || "未設定";
    });
    if (actionIndex === null) return;
    const action = theme.actions[actionIndex];
    root.querySelectorAll(`[data-theme-preview-action="${themeIndex}:${actionIndex}"]`).forEach((element) => {
      element.textContent = action?.text || "未設定";
    });
  }

  function renderJournal() {
    const daily = dailyRecord();
    const journal = journalRecord();
    const items = routineItems();
    const todayItems = todayActionItems();
    return `
      <div class="hm-grid hm-grid-2">
        <section class="hm-panel">
          <header><h2>コンディション</h2></header>
          ${slider("mood", "気分", daily.mood)}
          ${slider("energy", "体力", daily.energy)}
          ${slider("load", "負荷", daily.load)}
          ${slider("focus", "集中", daily.focus)}
          <h3>ルーティン</h3>
          ${items.length ? items.map((item) => renderRoutineCheck(item, daily)).join("") : '<p class="hm-muted">64分解で毎日の行動を選ぶと表示されます。</p>'}
          <h3>今日やること</h3>
          ${todayItems.length ? todayItems.map((item) => renderRoutineCheck(item, daily)).join("") : '<p class="hm-muted">前日の「明日の一手」や、下で追加した項目がここに表示されます。</p>'}
          <div class="hm-today-add">
            <input type="text" data-today-task-input placeholder="今日やることを追加" aria-label="今日やることを追加">
            <button type="button" data-add-today-task>追加</button>
          </div>
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
          <div class="hm-buttons">
            <button type="button" class="hm-ai-instruction" data-make-instruction="journal">日誌を良くする相談（AI指示書を作成）</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderRoutineCheck(item, daily) {
    const sourceIds = Array.isArray(item.sourceIds) && item.sourceIds.length ? item.sourceIds : [item.id];
    const checked = sourceIds.some((id) => daily.checks[id]);
    const mergedLabel = sourceIds.length > 1 ? ` / 同じルーティン${sourceIds.length}件` : "";
    const deleteButton = item.removableTaskId ? `<button type="button" class="hm-today-del" data-del-today-task="${escapeHtml(item.removableTaskId)}" title="削除" aria-label="削除">×</button>` : "";
    return `<label class="hm-check"><input type="checkbox" data-routine-check="${escapeHtml(item.id)}" data-routine-source-ids="${escapeHtml(JSON.stringify(sourceIds))}" ${checked ? "checked" : ""}> <span>${escapeHtml(item.text)}<small>${escapeHtml(item.goalTitle)} / ${escapeHtml(item.themeTitle)}${escapeHtml(mergedLabel)}</small></span>${deleteButton}</label>`;
  }

  function slider(key, label, value) {
    return `<label class="hm-slider"><span>${label}</span><input type="range" min="1" max="5" data-daily-field="${key}" value="${value}"><b>${value}</b></label>`;
  }

  function journalField(key, label, value, extra = "") {
    return `<label class="${extra}"><span>${label}</span><textarea data-journal-field="${key}" data-autosize>${escapeHtml(value)}</textarea></label>`;
  }

  function renderCoachLegacy() {
    const memory = activeAiMemory();
    const historyHtml = renderCoachHistory(memory);
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
          ${renderCoachStatus()}
        </div>
      </section>
    `;
  }

  function coachTargetOptions(goal) {
    if (coachArea === "board") {
      return [
        ["board.current", `今開いている64: ${boardPathLabel(goal)}`],
        ["board.long", "長期目標の64"],
        ["board.recent", "直近目標の64"],
        ["board.next", "次の目標の64"],
        ["board.theme", `選択中テーマ: ${(activeBoardTheme(goal, false)?.title || "未設定")}`],
        ["board.tomorrow", "明日やった方がいいこと"]
      ];
    }
    if (coachArea === "journal") {
      return [
        ["journal.tomorrow", "明日やった方がいいこと"],
        ["journal.today", "今日の日誌"],
        ["journal.recent", "最近の日誌"],
        ["journal.condition", "コンディション"]
      ];
    }
    return [
      ["goal.long", "長期目標"],
      ["goal.recent", "直近の目標"],
      ["goal.next", "次の目標"],
      ["goal.target", "達成したい結果"],
      ["goal.perspectives", "4観点"],
      ["goal.firstStep", "最初の一手"],
      ["goal.achieved", "達成メモ"]
    ];
  }

  function normalizeCoachTarget(goal) {
    const options = coachTargetOptions(goal);
    if (!options.some(([value]) => value === coachTarget)) {
      coachTarget = options[0][0];
    }
    return options;
  }

  function coachSelectionContext(goal) {
    const journal = journalRecord(false);
    const selectedTheme = activeBoardTheme(goal, false);
    const selectedActions = selectedTheme?.actions || [];
    return {
      area: coachArea,
      target: coachTarget,
      label: coachTargetOptions(goal).find(([value]) => value === coachTarget)?.[1] || coachTarget,
      boardScope,
      boardPath: boardPath.map((step) => ({ themeIndex: step.themeIndex, actionIndex: step.actionIndex })),
      boardPathLabel: boardPathLabel(goal),
      selectedThemeIndex,
      selectedTheme,
      selectedActions,
      goalPlan: goal.plan,
      todayJournal: journal,
      recentJournals: recentJournalSummaries()
    };
  }

  function instructionTargets() {
    return {
      board: { area: "board", target: "board.current" },
      perspectives: { area: "goal", target: "goal.perspectives" },
      plan: { area: "goal", target: "goal.long" },
      journal: { area: "journal", target: "journal.recent" }
    };
  }

  function buildInstructionSheet(kind) {
    const goal = activeGoal();
    if (kind === "board") {
      const themes = boardThemesAtPath(goal, false);
      const summary = summarizeThemes(themes);
      const dateText = boardCenterDate(goal) ? `（${boardCenterDate(goal)}）` : "";
      return [
        "いまの64分解（マンダラチャート）を、いっしょにさらに深めてください。",
        "",
        `【中心の目標】${boardCenterTitle(goal)}${dateText}`,
        `【対象の64】${boardScopeLabel()} / ${boardPathLabel(goal)}`,
        "",
        "【現在の64分解】",
        summary || "（まだほとんど空欄です。ゼロから提案してください）",
        "",
        "お願いしたいこと:",
        "- 空欄のテーマ・行動を、目標の達成に効く具体的な内容で埋めてください。",
        "- すでに書いてある項目は、より具体的で実行しやすい言葉に磨いてください。",
        "- テーマ同士の粒度をそろえ、重複や抜けを整理してください。",
        "- とくに深掘りすべきテーマには、下位64のテーマ候補も挙げてください。",
        "- 反映できるよう、最後に反映候補のJSONブロックも必ず出してください。"
      ].join("\n");
    }
    if (kind === "perspectives") {
      const p = goal.perspectives || {};
      return [
        "「目的・目標の4観点」を、いっしょに深めてください。",
        "",
        `【目標】${goal.title || "（未設定）"}`,
        `【何のために】${goal.purpose || "（未記入）"}`,
        "",
        "【現在の4観点】",
        `■ 私・無形（内面の変化）\n${p.selfIntangible || "（未記入）"}`,
        `■ 私・有形（見える成果）\n${p.selfTangible || "（未記入）"}`,
        `■ 社会・他者・無形（心への影響）\n${p.othersIntangible || "（未記入）"}`,
        `■ 社会・他者・有形（具体的な貢献）\n${p.othersTangible || "（未記入）"}`,
        "",
        "お願いしたいこと:",
        "- 各観点を、より具体的で自分ごとの言葉に深める案を出してください。",
        "- 抜けている観点や、内容が薄い観点があれば候補を足してください。",
        "- 4つの観点が一本につながるように整理してください。"
      ].join("\n");
    }
    if (kind === "plan") {
      const plan = goal.plan || {};
      return [
        "「逆算の目標設定」を、いっしょに点検して深めてください。",
        "",
        `【長期目標】${plan.longTitle || goal.title || "（未設定）"}（${plan.longDate || goal.deadline || "日付未設定"}）`,
        `【直近の目標】${plan.recentTitle || "（未設定）"}（${plan.recentDate || "日付未設定"}）`,
        `【次の目標】${plan.nextTitle || "（未設定）"}（${plan.nextDate || "日付未設定"}）`,
        `【達成メモ・残したい成長】${plan.achievedNote || "（未記入）"}`,
        "",
        "お願いしたいこと:",
        "- 長期から逆算して、直近・次の目標の順序や時期が妥当か点検してください。",
        "- 足りていないマイルストーン（中間目標）があれば提案してください。",
        "- 各目標の達成基準（ものさし）を、測れる形に具体化してください。"
      ].join("\n");
    }
    const todayJournal = journalRecord(false);
    const recent = recentJournalSummaries(7);
    const recentText = recent.length
      ? recent.map((j) => `・${j.date}｜できたこと: ${j.best || "—"} / 学び: ${j.learned || "—"} / 明日: ${j.next || "—"}`).join("\n")
      : "（まだ記録がありません）";
    return [
      "日誌の質を上げたいです。いっしょに振り返り方を相談させてください。",
      "",
      "【今日の日誌】",
      `できたこと: ${todayJournal.best || "（未記入）"}`,
      `気づき・学び: ${todayJournal.learned || "（未記入）"}`,
      `明日の一手: ${todayJournal.next || "（未記入）"}`,
      "",
      "【最近の日誌】",
      recentText,
      "",
      "お願いしたいこと:",
      "- 私の最近の日誌の傾向やパターンから、気づくことを教えてください。",
      "- 振り返りがもっと深くなる書き方のコツを教えてください。",
      "- 明日から日誌で自分に問いかけると良い「振り返りの問い」を3〜5個提案してください。"
    ].join("\n");
  }

  function startCoachWith(kind, root) {
    const target = instructionTargets()[kind] || instructionTargets().board;
    coachArea = target.area;
    coachTarget = target.target;
    coachDraft = buildInstructionSheet(kind);
    coachText = "";
    coachSuggestions = [];
    coachApplied = {};
    coachApplyStatus = "下の「AIに相談する」を押すと、この指示書で相談できます。内容は編集できます。";
    activeTab = "coach";
    renderAll();
    if (root) scheduleScrollToAppTitle(root, "smooth");
  }

  async function regenerateHistorySuggestions(id, root) {
    const memory = activeAiMemory();
    const entry = (Array.isArray(memory.history) ? memory.history : []).find((h) => h.id === id);
    if (!entry || coachBusy) return;

    coachBusy = true;
    coachApplyStatus = "履歴の相談から反映候補を作成中...";
    renderAll();

    try {
      const goal = activeGoal();
      const data = await apiFetch("/coach", {
        method: "POST",
        body: JSON.stringify({
          mode: String(entry.mode || "").startsWith("board") ? entry.mode : "board.current",
          message: [
            "次の過去の相談とAI回答をふまえて、いまの64分解に反映できる候補を出してください。",
            "",
            "【過去の相談】",
            String(entry.message || "（記録なし）"),
            "",
            "【その時のAI回答】",
            String(entry.response || "（記録なし）"),
            "",
            "反映候補のJSONブロックを必ず出してください。"
          ].join("\n"),
          context: {
            activeDate,
            goal,
            daily: dailyRecord(false),
            journal: journalRecord(false),
            recentJournals: recentJournalSummaries(),
            coachSelection: coachSelectionContext(goal),
            aiMemory: activeAiMemory()
          }
        })
      });
      const suggestions = normalizeBoardSuggestions(data.suggestions);
      entry.suggestions = suggestions;
      coachSuggestions = suggestions;
      coachApplied = {};
      coachApplyStatus = suggestions.length
        ? "履歴の相談から反映候補を作りました。下の候補から選んで反映できます。"
        : "今回は反映候補が作れませんでした。相談カテゴリを「64分解」にして相談し直すと出やすくなります。";
      queueSave();
    } catch (error) {
      coachApplyStatus = `反映候補の作成エラー: ${error.message}`;
    }

    coachBusy = false;
    renderAll();
    if (root) scheduleScrollToAppTitle(root, "smooth");
  }

  function renderCoachHistory(memory) {
    const history = Array.isArray(memory.history) ? memory.history : [];
    if (!history.length) return '<p class="hm-muted">まだ相談履歴はありません。</p>';
    return history.map((item) => {
      const date = (item.at || "").slice(0, 10) || "相談";
      const mode = item.mode || "goal";
      const message = String(item.message || "").trim();
      const response = String(item.response || "").trim();
      const handoff = String(item.handoff || "").trim();
      const suggestions = Array.isArray(item.suggestions) ? item.suggestions : [];
      return `
        <details class="hm-memory-history-item">
          <summary>
            <strong>${escapeHtml(date)}</strong>
            <span>${escapeHtml(mode)}</span>
            <p>${escapeHtml(limitText(message, 180))}</p>
          </summary>
          <div class="hm-memory-history-detail">
            <div>
              <b>相談内容</b>
              <p>${message ? escapeHtml(message).replaceAll("\n", "<br>") : "保存された相談内容はありません。"}</p>
            </div>
            <div>
              <b>AI回答</b>
              <p>${response ? escapeHtml(response).replaceAll("\n", "<br>") : "保存されたAI回答はありません。"}</p>
            </div>
            ${handoff ? `<div><b>AI引き継ぎメモ</b><p>${escapeHtml(handoff).replaceAll("\n", "<br>")}</p></div>` : ""}
            <div class="hm-history-apply">
              ${suggestions.length
                ? `<button type="button" class="hm-ai-instruction" data-load-history-suggestions="${escapeHtml(item.id)}">この回答を64の反映候補にする（${suggestions.length}件）</button>`
                : `<button type="button" class="hm-ai-instruction" data-regen-history-suggestions="${escapeHtml(item.id)}"${coachBusy ? " disabled" : ""}>${coachBusy ? "作成中..." : "この相談から64の反映候補を作る"}</button>`}
            </div>
          </div>
        </details>
      `;
    }).join("");
  }

  function renderCoachStatus() {
    if (!coachApplyStatus || coachSuggestions.length) return "";
    return `<p class="hm-coach-status">${escapeHtml(coachApplyStatus)}</p>`;
  }

  function renderCoach() {
    const memory = activeAiMemory();
    const goal = activeGoal();
    const targetOptions = normalizeCoachTarget(goal);
    const historyHtml = renderCoachHistory(memory);

    return `
      <section class="hm-panel">
        <header><h2>AI目標コーチ</h2></header>
        <div class="hm-coach">
          <details class="hm-memory-history" open>
            <summary>最近の相談履歴</summary>
            ${historyHtml}
          </details>
          <div class="hm-coach-select-grid">
            <label class="hm-coach-select">
              <span>相談カテゴリ</span>
              <select data-coach-area>
                <option value="goal" ${coachArea === "goal" ? "selected" : ""}>目標</option>
                <option value="board" ${coachArea === "board" ? "selected" : ""}>64分解</option>
                <option value="journal" ${coachArea === "journal" ? "selected" : ""}>日誌</option>
              </select>
            </label>
            <label class="hm-coach-select">
              <span>詳しく相談したい項目</span>
              <select data-coach-target>
                ${targetOptions.map(([value, label]) => `<option value="${value}" ${coachTarget === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="hm-coach-question">
            <span>相談したい質問内容</span>
            <textarea data-coach-message data-autosize placeholder="例: この目標に対して、明日やった方がいいことを一緒に整理してほしい。">${escapeHtml(coachDraft)}</textarea>
          </label>
          <button type="button" data-ask-coach ${coachBusy ? "disabled" : ""}>${coachBusy ? "相談中..." : "AIに相談する"}</button>
          ${config.hasApiKey ? "" : '<p class="hm-muted">AIを使うには、WordPress管理画面のAI設定にOpenAI APIキーを保存してください。</p>'}
          <div class="hm-coach-result">${coachText ? escapeHtml(coachText).replaceAll("\n", "<br>") : "AIの返答がここに表示されます。"}</div>
          ${renderCoachStatus()}
          ${renderCoachSuggestions()}
          <label class="hm-handoff-box">
            <span>AI引き継ぎメモ</span>
            <textarea data-ai-memory-field="handoff" placeholder="AIとの相談後に自動で追記されます。必要に応じて手で直せます。">${escapeHtml(memory.handoff)}</textarea>
          </label>
          ${renderMemoryVault(memory)}
        </div>
      </section>
    `;
  }

  function renderCoachSuggestions() {
    if (!coachSuggestions.length) return "";
    return `
      <div class="hm-coach-suggestions">
        <div class="hm-coach-suggestions-head">
          <div>
            <strong>64への反映候補</strong>
            <small>${escapeHtml(coachApplyStatus || "選んだものだけ64分解へ入ります")}</small>
          </div>
          <button type="button" data-open-board-from-coach>64で確認</button>
        </div>
        ${coachSuggestions.map((suggestion) => {
          const allApplied = isCoachSuggestionApplied(suggestion, "all");
          return `
          <div class="hm-coach-suggestion">
            <div class="hm-coach-suggestion-title">
              <div>
                <strong>テーマ ${suggestion.themeIndex + 1}${suggestion.title ? `: ${escapeHtml(suggestion.title)}` : ""}</strong>
                <small>${escapeHtml(suggestionScopeLabel(suggestion))}${suggestion.reason ? ` / ${escapeHtml(suggestion.reason)}` : ""}</small>
              </div>
              <button type="button" data-apply-coach-suggestion="${escapeHtml(suggestion.id)}"${allApplied ? " disabled" : ""}>${allApplied ? "反映済み" : "このテーマ全体を反映"}</button>
            </div>
            ${suggestion.title ? `
              <div class="hm-coach-suggestion-row">
                <span>テーマ名</span>
                <p>${escapeHtml(suggestion.title)}</p>
                <button type="button" data-apply-coach-suggestion-title="${escapeHtml(suggestion.id)}"${coachSuggestionDisabledAttr(suggestion, "title")}>${coachSuggestionAppliedLabel(suggestion, "title")}</button>
              </div>
            ` : ""}
            ${suggestion.actions.map((action) => `
              <div class="hm-coach-suggestion-row">
                <span>${suggestion.themeIndex + 1}-${action.index + 1}</span>
                <p>${escapeHtml(action.text)}${action.routine ? " / 毎日候補" : ""}${action.note ? `<br><small>→ ${escapeHtml(action.note)}</small>` : ""}</p>
                <button type="button" data-apply-coach-suggestion-action="${escapeHtml(suggestion.id)}:${action.index}"${coachSuggestionDisabledAttr(suggestion, "action", action.index)}>${coachSuggestionAppliedLabel(suggestion, "action", action.index)}</button>
              </div>
            `).join("")}
          </div>
        `;
        }).join("")}
      </div>
    `;
  }

  function summarizeThemes(themes) {
    if (!Array.isArray(themes)) return "";
    return themes.map((theme, themeIndex) => {
      const subItems = normalizeLines(theme.subs);
      const actions = theme.actions
        .map((action, actionIndex) => action.text ? `${themeIndex + 1}-${actionIndex + 1}. ${action.text}${action.note ? ` → ${action.note}` : ""}` : "")
        .filter(Boolean)
        .slice(0, 8)
        .join("\n");
      const subs = subItems.length ? `\n  サブ: ${subItems.join(" / ")}` : "";
      return `${themeIndex + 1}. ${theme.title || "未設定"}${subs}${actions ? `\n${actions}` : ""}`;
    }).join("\n\n");
  }

  function renderArchive() {
    const goal = activeGoal();
    const archives = Array.isArray(goal.archives) ? goal.archives : [];
    const list = archives.length ? archives.map((item) => `
      <details class="hm-archive-entry">
        <summary>
          <span>
            <strong>${escapeHtml(item.title || "履歴")}</strong>
            <small>${escapeHtml((item.at || "").slice(0, 10))} / ${item.type === "board" ? "64履歴" : "過去目標"}</small>
          </span>
          <em>${escapeHtml(item.note || item.pathLabel || item.target || "")}</em>
        </summary>
        ${item.type === "goal" ? `
          <div class="hm-archive-grid">
            <div><b>長期目標</b><p>${escapeHtml(item.plan?.longTitle || "")}</p><small>${escapeHtml(item.plan?.longDate || "")}</small></div>
            <div><b>直近の目標</b><p>${escapeHtml(item.plan?.recentTitle || "")}</p><small>${escapeHtml(item.plan?.recentDate || "")}</small></div>
            <div><b>次の目標</b><p>${escapeHtml(item.plan?.nextTitle || "")}</p><small>${escapeHtml(item.plan?.nextDate || "")}</small></div>
          </div>
          <pre>${escapeHtml([
            item.target ? `達成したい結果:\n${item.target}` : "",
            item.purpose ? `何のために:\n${item.purpose}` : "",
            item.note ? `達成メモ:\n${item.note}` : "",
            item.themes ? `64分解:\n${summarizeThemes(item.themes)}` : ""
          ].filter(Boolean).join("\n\n"))}</pre>
        ` : `
          <pre>${escapeHtml(summarizeThemes(item.themes))}</pre>
        `}
      </details>
    `).join("") : '<p class="hm-muted">まだ保存した過去目標や64履歴はありません。</p>';

    return `
      <section class="hm-panel">
        <header><h2>過去目標・64履歴</h2></header>
        <p class="hm-muted">達成した目標や、その時点の64分解を成長履歴として残せます。</p>
        <div class="hm-archive-list">${list}</div>
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
    if (target.dataset.goalField === "title" && !goal.plan.longTitle) goal.plan.longTitle = target.value;
    if (target.dataset.goalField === "deadline" && !goal.plan.longDate) goal.plan.longDate = target.value;
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
        scheduleScrollToAppTitle(root, "smooth");
        return;
      }

      const makeInstruction = event.target.closest("[data-make-instruction]");
      if (makeInstruction) {
        startCoachWith(makeInstruction.dataset.makeInstruction, root);
        return;
      }

      const regenHistory = event.target.closest("[data-regen-history-suggestions]");
      if (regenHistory) {
        await regenerateHistorySuggestions(regenHistory.dataset.regenHistorySuggestions, root);
        return;
      }

      const loadHistory = event.target.closest("[data-load-history-suggestions]");
      if (loadHistory) {
        const memory = activeAiMemory();
        const entry = (Array.isArray(memory.history) ? memory.history : []).find((h) => h.id === loadHistory.dataset.loadHistorySuggestions);
        if (entry && Array.isArray(entry.suggestions) && entry.suggestions.length) {
          coachSuggestions = normalizeBoardSuggestions({ boardSuggestions: entry.suggestions });
          coachApplied = {};
          coachApplyStatus = "履歴の回答から64の反映候補を開きました。下の候補から選んで反映できます。";
          renderAll();
          scheduleScrollToAppTitle(root, "smooth");
        }
        return;
      }

      const goalButton = event.target.closest("[data-goal-id]");
      if (goalButton) {
        state.activeGoalId = goalButton.dataset.goalId;
        selectedThemeIndex = 0;
        boardPath = [];
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

      if (event.target.closest("[data-add-today-task]")) {
        const input = root.querySelector("[data-today-task-input]");
        const text = (input?.value || "").trim();
        if (!text) return;
        state.todayTasks = plainObject(state.todayTasks);
        const key = dayKey();
        if (!Array.isArray(state.todayTasks[key])) state.todayTasks[key] = [];
        state.todayTasks[key].push({ id: uid("task"), text });
        queueSave();
        renderAll();
        return;
      }

      const delToday = event.target.closest("[data-del-today-task]");
      if (delToday) {
        event.preventDefault();
        const taskId = delToday.dataset.delTodayTask;
        const key = dayKey();
        if (state.todayTasks && Array.isArray(state.todayTasks[key])) {
          state.todayTasks[key] = state.todayTasks[key].filter((t) => t && t.id !== taskId);
        }
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

      const boardScopeButton = event.target.closest("[data-board-scope]");
      if (boardScopeButton) {
        boardScope = boardScopeButton.dataset.boardScope || "long";
        boardPath = [];
        selectedThemeIndex = 0;
        renderAll();
        return;
      }

      if (event.target.closest("[data-board-path-back]")) {
        boardPath = boardPath.slice(0, -1);
        selectedThemeIndex = 0;
        renderAll();
        return;
      }

      if (event.target.closest("[data-archive-board]")) {
        archiveBoard(activeGoal());
        queueSave();
        activeTab = "archive";
        renderAll();
        scheduleScrollToAppTitle(root, "smooth");
        return;
      }

      if (event.target.closest("[data-archive-goal]")) {
        archiveGoal(activeGoal());
        queueSave();
        activeTab = "archive";
        renderAll();
        scheduleScrollToAppTitle(root, "smooth");
        return;
      }

      const addThemeSub = event.target.closest("[data-add-theme-sub]");
      if (addThemeSub) {
        const themeIndex = Number(addThemeSub.dataset.addThemeSub);
        const theme = boardThemesAtPath(activeGoal(), true)[themeIndex];
        if (!theme) return;
        if (!Array.isArray(theme.subs)) theme.subs = [];
        if (theme.subs.length < 24) theme.subs.push("");
        selectedThemeIndex = themeIndex;
        queueSave();
        renderAll();
        window.setTimeout(() => {
          root.querySelector(`[data-theme-sub-index="${themeIndex}:${theme.subs.length - 1}"]`)?.focus();
        }, 0);
        return;
      }

      const removeThemeSub = event.target.closest("[data-remove-theme-sub]");
      if (removeThemeSub) {
        const [themeIndex, subIndex] = removeThemeSub.dataset.removeThemeSub.split(":").map(Number);
        const theme = boardThemesAtPath(activeGoal(), true)[themeIndex];
        if (!theme || !Array.isArray(theme.subs)) return;
        theme.subs.splice(subIndex, 1);
        selectedThemeIndex = themeIndex;
        queueSave();
        renderAll();
        return;
      }

      const childBoard = event.target.closest("[data-open-child-board]");
      if (childBoard) {
        const [themeIndex, actionIndex] = childBoard.dataset.openChildBoard.split(":").map(Number);
        const themes = boardThemesAtPath(activeGoal(), true);
        const action = themes[themeIndex]?.actions?.[actionIndex];
        if (action && !Array.isArray(action.childThemes)) action.childThemes = blankThemes();
        boardPath = boardPath.concat([{ themeIndex, actionIndex }]);
        selectedThemeIndex = 0;
        queueSave();
        renderAll();
        return;
      }

      const routineButton = event.target.closest("[data-routine-action]");
      if (routineButton) {
        const themeIndex = Number(routineButton.dataset.routineTheme);
        const actionIndex = Number(routineButton.dataset.routineAction);
        const action = boardThemesAtPath(activeGoal(), true)[themeIndex].actions[actionIndex];
        action.routine = !action.routine;
        selectedThemeIndex = themeIndex;
        queueSave();
        renderAll();
        return;
      }

      const moveActionButton = event.target.closest("[data-move-action]");
      if (moveActionButton && !moveActionButton.disabled) {
        const [themeIndex, actionIndex] = moveActionButton.dataset.moveAction.split(":").map(Number);
        const direction = moveActionButton.dataset.moveActionDirection === "up" ? -1 : 1;
        const nextIndex = actionIndex + direction;
        const theme = boardThemesAtPath(activeGoal(), true)[themeIndex];
        if (!theme || !Array.isArray(theme.actions) || nextIndex < 0 || nextIndex > 7) return;
        [theme.actions[actionIndex], theme.actions[nextIndex]] = [theme.actions[nextIndex], theme.actions[actionIndex]];
        selectedThemeIndex = themeIndex;
        queueSave();
        renderAll();
        window.setTimeout(() => {
          root.querySelector(`[data-action-theme-index="${themeIndex}"][data-action-index="${nextIndex}"]`)?.focus();
        }, 0);
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

      if (event.target.closest("[data-open-board-from-coach]")) {
        activeTab = "board";
        state.boardMode = "edit";
        renderAll();
        scrollAllToAppTitle("smooth");
        return;
      }

      const applySuggestion = event.target.closest("[data-apply-coach-suggestion]");
      if (applySuggestion) {
        const suggestion = findCoachSuggestion(applySuggestion.dataset.applyCoachSuggestion);
        if (suggestion) applyCoachSuggestion(suggestion, "all");
        return;
      }

      const applySuggestionTitle = event.target.closest("[data-apply-coach-suggestion-title]");
      if (applySuggestionTitle) {
        const suggestion = findCoachSuggestion(applySuggestionTitle.dataset.applyCoachSuggestionTitle);
        if (suggestion) applyCoachSuggestion(suggestion, "title");
        return;
      }

      const applySuggestionAction = event.target.closest("[data-apply-coach-suggestion-action]");
      if (applySuggestionAction) {
        const [id, index] = applySuggestionAction.dataset.applyCoachSuggestionAction.split(":");
        const suggestion = findCoachSuggestion(id);
        if (suggestion) applyCoachSuggestion(suggestion, "action", Number(index));
        return;
      }

      if (event.target.closest("[data-ask-coach]")) {
        const message = root.querySelector("[data-coach-message]")?.value.trim() || "";
        const mode = coachTarget || coachArea || "goal";
        if (!message) return;
        let memoryChanged = false;
        coachBusy = true;
        coachText = "";
        coachSuggestions = [];
        coachApplied = {};
        coachApplyStatus = "";
        renderAll();
        try {
          const data = await apiFetch("/coach", {
            method: "POST",
            body: JSON.stringify({
              mode,
              message,
              context: {
                activeDate,
                goal: activeGoal(),
                daily: dailyRecord(false),
                journal: journalRecord(false),
                recentJournals: recentJournalSummaries(),
                coachSelection: coachSelectionContext(activeGoal()),
                aiMemory: activeAiMemory()
              }
            })
          });
          coachText = data.text || "返答を取得しましたが、本文が空でした。";
          coachSuggestions = normalizeBoardSuggestions(data.suggestions);
          recordCoachMemory(mode, message, coachText, coachSuggestions);
          coachDraft = "";
          memoryChanged = true;
        } catch (error) {
          coachText = `AI相談エラー: ${error.message}`;
          coachSuggestions = [];
        }
        coachBusy = false;
        renderAll();
        if (memoryChanged) queueSave();
      }
    });

    root.addEventListener("input", (event) => {
      const target = event.target;
      if (target.matches("textarea[data-autosize]")) resizeAutosizeTextarea(target);
      if (target.matches("[data-coach-message]")) coachDraft = target.value;
      if (target.matches("[data-goal-field]")) updateGoalField(target);
      if (target.matches("[data-goal-plan-field]")) {
        const goal = activeGoal();
        goal.plan[target.dataset.goalPlanField] = target.value;
        if (target.dataset.goalPlanField === "longTitle") goal.title = target.value || goal.title;
        if (target.dataset.goalPlanField === "longDate") goal.deadline = target.value || goal.deadline;
        queueSave();
      }
      if (target.matches("[data-perspective-field]")) {
        activeGoal().perspectives[target.dataset.perspectiveField] = target.value;
        queueSave();
      }
      if (target.matches("[data-theme-title]")) {
        const themeIndex = Number(target.dataset.themeTitle);
        boardThemesAtPath(activeGoal(), true)[themeIndex].title = target.value;
        selectedThemeIndex = themeIndex;
        updateThemePreview(root, themeIndex);
        queueSave();
      }
      if (target.matches("[data-theme-sub-index]")) {
        const [themeIndex, subIndex] = target.dataset.themeSubIndex.split(":").map(Number);
        const theme = boardThemesAtPath(activeGoal(), true)[themeIndex];
        if (!theme) return;
        if (!Array.isArray(theme.subs)) theme.subs = [];
        theme.subs[subIndex] = target.value;
        selectedThemeIndex = themeIndex;
        queueSave();
      }
      if (target.matches("[data-theme-subs]")) {
        const themeIndex = Number(target.dataset.themeSubs);
        boardThemesAtPath(activeGoal(), true)[themeIndex].subs = normalizeLines(target.value);
        selectedThemeIndex = themeIndex;
        queueSave();
      }
      if (target.matches("[data-action-note-index]")) {
        const themeIndex = Number(target.dataset.actionNoteTheme);
        const actionIndex = Number(target.dataset.actionNoteIndex);
        boardThemesAtPath(activeGoal(), true)[themeIndex].actions[actionIndex].note = target.value;
        selectedThemeIndex = themeIndex;
        queueSave();
      }
      if (target.matches("[data-action-index]")) {
        const themeIndex = Number(target.dataset.actionThemeIndex);
        const actionIndex = Number(target.dataset.actionIndex);
        const action = boardThemesAtPath(activeGoal(), true)[themeIndex].actions[actionIndex];
        if (target.matches("[data-action-subs]")) {
          action.subs = normalizeLines(target.value);
        } else {
          action.text = target.value;
          updateThemePreview(root, themeIndex, actionIndex);
        }
        selectedThemeIndex = themeIndex;
        queueSave();
      }
      if (target.matches("[data-daily-field]")) {
        const value = dailyValue(target.value);
        dailyRecord(true)[target.dataset.dailyField] = value;
        target.value = String(value);
        const output = target.closest(".hm-slider")?.querySelector("b");
        if (output) output.textContent = String(value);
        queueSave();
      }
      if (target.matches("[data-journal-field]")) {
        journalRecord(true)[target.dataset.journalField] = target.value;
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
      if (target.matches("[data-active-date]")) {
        activeDate = target.value || today();
        renderAll();
      }
      if (target.matches("[data-coach-area]")) {
        coachArea = target.value || "goal";
        coachTarget = coachTargetOptions(activeGoal())[0][0];
        renderAll();
      }
      if (target.matches("[data-coach-target]")) {
        coachTarget = target.value || coachTargetOptions(activeGoal())[0][0];
      }
      if (target.matches("[data-routine-check]")) {
        let sourceIds = [];
        try {
          sourceIds = JSON.parse(target.dataset.routineSourceIds || "[]");
        } catch (error) {
          sourceIds = [];
        }
        if (!Array.isArray(sourceIds) || !sourceIds.length) {
          sourceIds = [target.dataset.routineCheck];
        }
        const checks = dailyRecord(true).checks;
        sourceIds.forEach((id) => {
          if (id) checks[id] = target.checked;
        });
        queueSave();
      }
      if (target.matches("[data-memory-item-kind]")) {
        updateMemoryItem(target.dataset.memoryItemKind, "kind", target.value);
      }
      if (target.matches("[data-import-json]") && target.files[0]) {
        const text = await target.files[0].text();
        const importedState = normalizeState(JSON.parse(text));
        if (hasCorruptedState(importedState)) {
          saveStatus = "文字化けした可能性のあるJSONのため読み込みを止めました。";
          saveTone = "error";
          renderAll(false);
          return;
        }
        state = importedState;
        saveLocked = false;
        queueSave();
        renderAll();
      }
    });
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) scrollAllToAppTitle("auto");
  });

  loadState();
})();
