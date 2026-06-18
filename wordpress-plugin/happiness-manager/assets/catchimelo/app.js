(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const NOTE_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const PC_TO_NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const PC_TO_SOLFEGE = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];
  const BASIC_OVERTONE_PHRASE = ["do", "doHigh", "so", "mi", "do"];
  const ROOTS = Array.from({ length: 25 }, (_, index) => {
    const midi = 36 + index;
    const pc = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    const id = `${PC_TO_NOTE[pc]}${octave}`;
    const freq = 440 * 2 ** ((midi - 69) / 12);
    return { id, label: `${id} / ${PC_TO_SOLFEGE[pc]}`, freq };
  });
  const DEFAULT_OVERTONE_LEVELS = {
    root: 70,
    octave: 48,
    fifth: 36,
    highOctave: 24,
    third: 30,
  };

  const OVERTONES = [
    {
      id: "root",
      label: "ド",
      tag: "基音",
      ratio: 1,
      semitone: 0,
      detail: "基音",
      color: "#d75c45",
      dot: "13%",
      level: 1,
    },
    {
      id: "octave",
      label: "ド↑",
      tag: "2倍音",
      ratio: 2,
      semitone: 12,
      detail: "1オクターブ",
      color: "#cc5d79",
      dot: "29%",
      level: 2,
    },
    {
      id: "fifth",
      label: "ソ",
      tag: "3倍音",
      ratio: 3,
      semitone: 19,
      detail: "1オクターブ+完全5度",
      color: "#2f80a8",
      dot: "48%",
      level: 3,
    },
    {
      id: "highOctave",
      label: "ドー",
      tag: "4倍音",
      ratio: 4,
      semitone: 24,
      detail: "2オクターブ",
      color: "#668c3a",
      dot: "66%",
      level: 4,
    },
    {
      id: "third",
      label: "ミ",
      tag: "5倍音",
      ratio: 5,
      semitone: 28,
      detail: "2オクターブ+長3度",
      color: "#d5a020",
      dot: "82%",
      level: 5,
    },
  ];

  const SCALE = [
    { id: "do", label: "ド", degree: "1度", ratio: 1, semitone: 0, color: "#d75c45" },
    { id: "re", label: "レ", degree: "2度", ratio: 9 / 8, semitone: 2, color: "#d58432" },
    { id: "mi", label: "ミ", degree: "3度", ratio: 5 / 4, semitone: 4, color: "#d5a020" },
    { id: "fa", label: "ファ", degree: "4度", ratio: 4 / 3, semitone: 5, color: "#668c3a" },
    { id: "so", label: "ソ", degree: "5度", ratio: 3 / 2, semitone: 7, color: "#168781" },
    { id: "la", label: "ラ", degree: "6度", ratio: 5 / 3, semitone: 9, color: "#2f80a8" },
    { id: "ti", label: "シ", degree: "7度", ratio: 15 / 8, semitone: 11, color: "#7a6da9" },
    { id: "doHigh", label: "ド↑", degree: "8度", ratio: 2, semitone: 12, color: "#cc5d79" },
  ];

  const RHYTHMS = [
    {
      id: "p1",
      no: 1,
      name: "4分音符連打",
      formula: "1 / 1 / 1 / 1",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 1, 2, 3],
    },
    {
      id: "p2",
      no: 2,
      name: "8分音符連打",
      formula: "0.5 x 8",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    },
    {
      id: "p3",
      no: 3,
      name: "8分音符ウラのみ",
      formula: "裏 / 裏 / 裏 / 裏",
      loopBeats: 4,
      divisions: 16,
      onsets: [0.5, 1.5, 2.5, 3.5],
    },
    {
      id: "p4",
      no: 4,
      name: "8分ウラからシンコペーション",
      formula: "裏で出して次の8分まで伸ばす",
      loopBeats: 4,
      divisions: 16,
      onsets: [0.5, 1.5, 2.5, 3.5],
      durations: [0.5, 0.5, 0.5, 0.5],
    },
    {
      id: "p5",
      no: 5,
      name: "付点4分音符 + 8分音符",
      formula: "1.5 / 0.5 / 1.5 / 0.5",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 1.5, 2, 3.5],
    },
    {
      id: "p6",
      no: 6,
      name: "4分音符4回 → 全音符1回",
      formula: "1 / 1 / 1 / 1 / 4",
      loopBeats: 8,
      divisions: 32,
      onsets: [0, 1, 2, 3, 4],
    },
    {
      id: "p7",
      no: 7,
      name: "3・3・2型",
      formula: "付点4分 / 付点4分 / 4分",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 1.5, 3],
    },
    {
      id: "p8",
      no: 8,
      name: "2・3・3型",
      formula: "4分 / 付点4分 / 付点4分",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 1, 2.5],
    },
    {
      id: "p9",
      no: 9,
      name: "3・2・3型",
      formula: "付点4分 / 4分 / 付点4分",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 1.5, 2.5],
    },
    {
      id: "p10",
      no: 10,
      name: "倍速3・3・2型",
      formula: "付点8分 / 付点8分 / 8分",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 0.75, 1.5, 2, 2.75, 3.5],
    },
    {
      id: "p11",
      no: 11,
      name: "倍速2・3・3型",
      formula: "8分 / 付点8分 / 付点8分",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 0.5, 1.25, 2, 2.5, 3.25],
    },
    {
      id: "p12",
      no: 12,
      name: "倍速3・2・3型",
      formula: "付点8分 / 8分 / 付点8分",
      loopBeats: 4,
      divisions: 16,
      onsets: [0, 0.75, 1.25, 2, 2.75, 3.25],
    },
    {
      id: "p13",
      no: 13,
      name: "1拍3連",
      formula: "3連 x 4拍",
      loopBeats: 4,
      divisions: 12,
      onsets: [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3, 2, 7 / 3, 8 / 3, 3, 10 / 3, 11 / 3],
    },
    {
      id: "p14",
      no: 14,
      name: "2拍3連",
      formula: "2拍を3等分 x 2",
      loopBeats: 4,
      divisions: 12,
      onsets: [0, 2 / 3, 4 / 3, 2, 8 / 3, 10 / 3],
    },
  ];

  const state = {
    tuning: "equal",
    rootId: "C3",
    currentItem: OVERTONES[0],
    currentSource: "overtone",
    phraseIds: [...BASIC_OVERTONE_PHRASE],
    pitchNodes: [],
    pitchTimers: [],
    mixerNodes: [],
    overtoneMixerRunning: false,
    overtoneLevels: { ...DEFAULT_OVERTONE_LEVELS },
    draggedPhraseIndex: -1,
    pointerPhraseIndex: -1,
    pointerDropIndex: -1,
    phraseLoopRunning: false,
    phraseLoopTimer: 0,
    phraseNextStart: 0,
    rhythmNodes: [],
    rhythmPatternId: "p1",
    rhythmSound: "click",
    practiceMode: "both",
    countIn: true,
    rhythmRunning: false,
    rhythmTimer: 0,
    rhythmFrame: 0,
    rhythmOrigin: 0,
    rhythmNextStart: 0,
    rhythmVisualUntil: 0,
    pitchVolume: 0.62,
    rhythmVolume: 0.7,
  };

  let audioCtx;
  let pitchGain;
  let rhythmGain;

  const rootSelect = $("#rootSelect");
  const volumeSlider = $("#volumeSlider");
  const rhythmVolumeSlider = $("#rhythmVolumeSlider");
  const bpmSlider = $("#bpmSlider");
  const bpmInput = $("#bpmInput");
  const phraseBpmSlider = $("#phraseBpmSlider");
  const phraseBpmInput = $("#phraseBpmInput");
  const countInToggle = $("#countInToggle");
  const audioNotice = $("#audioNotice");
  const overtoneMap = $("#overtoneMap");
  const phraseSteps = $("#phraseSteps");
  const phraseSummary = $("#phraseSummary");
  const overtoneMixerRows = $("#overtoneMixerRows");
  const scaleGrid = $("#scaleGrid");
  const rhythmList = $("#rhythmList");
  const rhythmTimeline = $("#rhythmTimeline");
  const timelineProgress = $("#timelineProgress");

  function getRoot() {
    return ROOTS.find((root) => root.id === state.rootId) || ROOTS.find((root) => root.id === "C3") || ROOTS[0];
  }

  function midiFromNoteName(noteName) {
    const match = noteName.match(/^([A-G])(#?)(-?\d+)$/);
    if (!match) return 48;
    const [, letter, accidental, octaveText] = match;
    const pc = NOTE_TO_PC[letter] + (accidental ? 1 : 0);
    return (Number(octaveText) + 1) * 12 + pc;
  }

  function noteNameFromMidi(midi) {
    const pc = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    return `${PC_TO_NOTE[pc]}${octave}`;
  }

  function noteNameFor(item) {
    return noteNameFromMidi(midiFromNoteName(getRoot().id) + item.semitone);
  }

  function getScaleItem(id) {
    return SCALE.find((item) => item.id === id) || SCALE[0];
  }

  function getPhraseItems() {
    return state.phraseIds.map(getScaleItem);
  }

  function getRhythm() {
    return RHYTHMS.find((pattern) => pattern.id === state.rhythmPatternId) || RHYTHMS[0];
  }

  function tuningLabel(tuning = state.tuning) {
    return tuning === "just" ? "純正律" : "12平均律";
  }

  function equalFrequency(item) {
    return getRoot().freq * 2 ** (item.semitone / 12);
  }

  function justFrequency(item) {
    return getRoot().freq * item.ratio;
  }

  function frequencyFor(item, tuning = state.tuning) {
    return tuning === "just" ? justFrequency(item) : equalFrequency(item);
  }

  function centsDifference(item) {
    return 1200 * Math.log2(justFrequency(item) / equalFrequency(item));
  }

  function formatHz(value) {
    return `${value.toFixed(2)} Hz`;
  }

  function formatCents(value) {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)} cents`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  async function ensureAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        audioNotice.textContent = "この環境では音声再生APIが使えません。Chrome、Edge、Safariで開くと音が出ます。";
        audioNotice.hidden = false;
        return false;
      }
      audioCtx = new AudioContextClass();
      pitchGain = audioCtx.createGain();
      rhythmGain = audioCtx.createGain();
      pitchGain.gain.value = state.pitchVolume;
      rhythmGain.gain.value = state.rhythmVolume;
      pitchGain.connect(audioCtx.destination);
      rhythmGain.connect(audioCtx.destination);
    }

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    audioNotice.hidden = true;
    return true;
  }

  function syncVolumes() {
    state.pitchVolume = Number(volumeSlider.value) / 100;
    state.rhythmVolume = Number(rhythmVolumeSlider.value) / 100;
    if (pitchGain) {
      pitchGain.gain.setTargetAtTime(state.pitchVolume, audioCtx.currentTime, 0.015);
    }
    if (rhythmGain) {
      rhythmGain.gain.setTargetAtTime(state.rhythmVolume, audioCtx.currentTime, 0.015);
    }
  }

  function scheduleTone(freq, duration, startTime) {
    const envelope = audioCtx.createGain();
    envelope.connect(pitchGain);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(0.72, startTime + 0.03);
    envelope.gain.setTargetAtTime(0.5, startTime + 0.08, 0.18);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    const harmonics = [
      { multiple: 1, gain: 0.78, type: "sine" },
      { multiple: 2, gain: 0.24, type: "triangle" },
      { multiple: 3, gain: 0.12, type: "sine" },
      { multiple: 5, gain: 0.05, type: "sine" },
    ];

    harmonics.forEach((harmonic) => {
      if (freq * harmonic.multiple > 12000) {
        return;
      }
      const osc = audioCtx.createOscillator();
      const harmonicGain = audioCtx.createGain();
      osc.type = harmonic.type;
      osc.frequency.setValueAtTime(freq * harmonic.multiple, startTime);
      harmonicGain.gain.setValueAtTime(harmonic.gain, startTime);
      osc.connect(harmonicGain);
      harmonicGain.connect(envelope);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.06);
      state.pitchNodes.push(osc);
      osc.onended = () => {
        state.pitchNodes = state.pitchNodes.filter((node) => node !== osc);
      };
    });
  }

  function clearPitchTimers() {
    state.pitchTimers.forEach((timer) => window.clearTimeout(timer));
    state.pitchTimers = [];
  }

  function setPitchHighlight(id, source, stepIndex = -1) {
    $$(".overtone-note, .note-button, .phrase-step").forEach((button) => {
      button.classList.remove("active");
    });

    let selector = `[data-overtone-id="${id}"]`;
    if (source === "scale") {
      selector = `[data-scale-id="${id}"]`;
    }
    if (source === "phrase") {
      selector = `[data-phrase-index="${stepIndex}"]`;
    }
    const button = $(selector);
    if (button) {
      button.classList.add("active");
    }
  }

  function queuePitchHighlight(item, source, startTime, duration, stepIndex = -1) {
    const now = audioCtx.currentTime;
    const startDelay = Math.max(0, (startTime - now) * 1000);
    const endDelay = startDelay + duration * 1000;
    state.pitchTimers.push(
      window.setTimeout(() => setPitchHighlight(item.id, source, stepIndex), startDelay),
      window.setTimeout(() => {
        let selector = source === "scale" ? `[data-scale-id="${item.id}"]` : `[data-overtone-id="${item.id}"]`;
        if (source === "phrase") {
          selector = `[data-phrase-index="${stepIndex}"]`;
        }
        const button = $(selector);
        if (button) {
          button.classList.remove("active");
        }
      }, endDelay),
    );
  }

  function stopPitchSequenceOnly() {
    clearPitchTimers();
    state.pitchNodes.forEach((node) => {
      try {
        node.stop(0);
      } catch {
        // Already stopped.
      }
    });
    state.pitchNodes = [];
    $$(".overtone-note, .note-button, .phrase-step").forEach((button) => button.classList.remove("active"));
  }

  function stopOvertoneMixer() {
    state.mixerNodes.forEach(({ oscillator, gain }) => {
      try {
        const stopTime = audioCtx ? audioCtx.currentTime + 0.04 : 0;
        if (audioCtx) {
          gain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.015);
        }
        oscillator.stop(stopTime);
      } catch {
        // Already stopped.
      }
    });
    state.mixerNodes = [];
    state.overtoneMixerRunning = false;
  }

  function stopPitch() {
    stopPhraseLoop();
    stopPitchSequenceOnly();
    stopOvertoneMixer();
  }

  async function playSinglePitch(item, source = state.currentSource, tuning = state.tuning) {
    if (!(await ensureAudio())) return;
    stopPitch();
    const start = audioCtx.currentTime + 0.04;
    scheduleTone(frequencyFor(item, tuning), 0.85, start);
    queuePitchHighlight(item, source, start, 0.85);
  }

  function schedulePitchSequence(items, source, tuning, startTime, duration = 0.56, gap = 0.08) {
    let cursor = startTime;
    items.forEach((item, index) => {
      scheduleTone(frequencyFor(item, tuning), duration, cursor);
      queuePitchHighlight(item, source, cursor, duration, index);
      cursor += duration + gap;
    });
    return cursor;
  }

  async function playPitchSequence(items, source, tuning = state.tuning) {
    if (!(await ensureAudio())) return;
    stopPitch();
    schedulePitchSequence(items, source, tuning, audioCtx.currentTime + 0.06);
  }

  function getPhraseBpm() {
    return clamp(Number(phraseBpmInput.value) || 96, 40, 220);
  }

  function phraseTiming() {
    const beatSeconds = 60 / getPhraseBpm();
    return { beatSeconds, duration: beatSeconds * 0.85, gap: beatSeconds * 0.15 };
  }

  function setPhraseBpm(value, source) {
    const bpm = clamp(Math.round(Number(value) || 96), 40, 220);
    phraseBpmInput.value = String(bpm);
    phraseBpmSlider.value = String(clamp(bpm, 40, 180));
    if (state.phraseLoopRunning && source !== "init") {
      void startPhraseLoop();
    }
  }

  function stopPhraseLoop() {
    state.phraseLoopRunning = false;
    window.clearTimeout(state.phraseLoopTimer);
    state.phraseLoopTimer = 0;
    setLoopButtonActive(false);
  }

  function setLoopButtonActive(active) {
    const button = $('[data-action="loopOvertonePhrase"]');
    if (button) {
      button.classList.toggle("active", active);
    }
  }

  async function playPhraseOnce() {
    if (!(await ensureAudio())) return;
    stopPitch();
    const { duration, gap } = phraseTiming();
    schedulePitchSequence(getPhraseItems(), "phrase", state.tuning, audioCtx.currentTime + 0.06, duration, gap);
  }

  async function startPhraseLoop() {
    if (!(await ensureAudio())) return;
    stopPitch();
    const items = getPhraseItems();
    if (!items.length) return;
    const { beatSeconds, duration, gap } = phraseTiming();
    // 1拍ぶんの余白を挟んでフレーズを繰り返す
    const loopSeconds = (items.length + 1) * beatSeconds;
    state.phraseLoopRunning = true;
    setLoopButtonActive(true);
    state.phraseNextStart = audioCtx.currentTime + 0.08;

    const queue = () => {
      if (!state.phraseLoopRunning) return;
      schedulePitchSequence(items, "phrase", state.tuning, state.phraseNextStart, duration, gap);
      state.phraseNextStart += loopSeconds;
      const delayMs = Math.max(20, (state.phraseNextStart - audioCtx.currentTime - 0.2) * 1000);
      state.phraseLoopTimer = window.setTimeout(queue, delayMs);
    };

    queue();
  }

  async function comparePitchSequence(items, source) {
    if (!(await ensureAudio())) return;
    stopPitch();
    const start = audioCtx.currentTime + 0.06;
    const nextStart = schedulePitchSequence(items, source, "equal", start, 0.5, 0.07) + 0.46;
    schedulePitchSequence(items, source, "just", nextStart, 0.5, 0.07);
  }

  async function compareCurrentPitch() {
    if (!(await ensureAudio())) return;
    stopPitch();
    const item = state.currentItem;
    const source = state.currentSource;
    const first = audioCtx.currentTime + 0.06;
    const second = first + 1.0;
    scheduleTone(equalFrequency(item), 0.72, first);
    scheduleTone(justFrequency(item), 0.72, second);
    queuePitchHighlight(item, source, first, 0.72);
    queuePitchHighlight(item, source, second, 0.72);
  }

  function updateReadout() {
    const item = state.currentItem;
    const equal = equalFrequency(item);
    const just = justFrequency(item);
    const current = frequencyFor(item);
    const detail = item.detail || item.degree || "";
    const noteName = noteNameFor(item);

    $("#readoutName").textContent = `${item.label} / ${noteName}${detail ? ` (${detail})` : ""}`;
    $("#currentTuning").textContent = tuningLabel();
    $("#currentFrequency").textContent = formatHz(current);
    $("#equalFrequency").textContent = formatHz(equal);
    $("#justFrequency").textContent = formatHz(just);
    $("#centDifference").textContent = formatCents(centsDifference(item));
  }

  function selectPitch(item, source, play = false) {
    state.currentItem = item;
    state.currentSource = source;
    updateReadout();
    setPitchHighlight(item.id, source);
    if (play) {
      void playSinglePitch(item, source);
    }
  }

  function renderRootOptions() {
    rootSelect.innerHTML = ROOTS.map(
      (root) => `<option value="${root.id}">${root.label} ${formatHz(root.freq)}</option>`,
    ).join("");
    rootSelect.value = state.rootId;
  }

  function renderOvertoneMap() {
    overtoneMap.innerHTML = [...OVERTONES]
      .sort((a, b) => b.level - a.level)
      .map(
        (item) => `
          <div class="overtone-row" style="--tone-color:${item.color}; --dot-left:${item.dot}">
            <div class="overtone-tag">${item.tag}</div>
            <div class="overtone-line" aria-hidden="true"><span class="overtone-dot"></span></div>
            <button class="overtone-note" type="button" data-overtone-id="${item.id}">${item.label}</button>
          </div>
        `,
      )
      .join("");
  }

  function mixerFrequency(item) {
    return justFrequency(item);
  }

  function renderOvertoneMixer() {
    overtoneMixerRows.innerHTML = OVERTONES.map((item) => {
      const value = state.overtoneLevels[item.id] ?? 0;
      return `
        <div class="mixer-row" style="--tone-color:${item.color}" data-mixer-row="${item.id}">
          <div>
            <strong>${item.tag} ${item.label}</strong>
            <span>${noteNameFor(item)} / ${formatHz(mixerFrequency(item))}</span>
          </div>
          <input type="range" min="0" max="100" value="${value}" data-overtone-level="${item.id}" aria-label="${item.tag} ${item.label} 音量" />
          <div class="mixer-value" data-overtone-value="${item.id}">${value}%</div>
        </div>
      `;
    }).join("");
  }

  function setOvertoneLevel(id, value) {
    const level = clamp(Math.round(Number(value) || 0), 0, 100);
    state.overtoneLevels[id] = level;
    const valueNode = $(`[data-overtone-value="${id}"]`);
    if (valueNode) {
      valueNode.textContent = `${level}%`;
    }
    const node = state.mixerNodes.find((candidate) => candidate.id === id);
    if (node && audioCtx) {
      node.gain.gain.setTargetAtTime((level / 100) * 0.42, audioCtx.currentTime, 0.02);
    }
  }

  function resetOvertoneMixerLevels() {
    state.overtoneLevels = { ...DEFAULT_OVERTONE_LEVELS };
    renderOvertoneMixer();
    if (!audioCtx || !state.overtoneMixerRunning) return;
    state.mixerNodes.forEach((node) => {
      const level = (state.overtoneLevels[node.id] ?? 0) / 100;
      node.gain.gain.setTargetAtTime(level * 0.42, audioCtx.currentTime, 0.02);
    });
  }

  async function startOvertoneMixer() {
    if (!(await ensureAudio())) return;
    stopPitchSequenceOnly();
    stopOvertoneMixer();

    const startTime = audioCtx.currentTime + 0.04;
    OVERTONES.forEach((item) => {
      const level = (state.overtoneLevels[item.id] ?? 0) / 100;
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = item.id === "root" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(mixerFrequency(item), startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(level * 0.42, startTime + 0.08);
      oscillator.connect(gain);
      gain.connect(pitchGain);
      oscillator.start(startTime);
      state.mixerNodes.push({ id: item.id, oscillator, gain });
    });

    state.overtoneMixerRunning = true;
  }

  function renderScaleGrid() {
    scaleGrid.innerHTML = SCALE.map((item) => {
      const freq = frequencyFor(item);
      return `
        <button class="note-button" type="button" data-scale-id="${item.id}" style="--tone-color:${item.color}">
          <strong>${item.label}</strong>
          <span>${noteNameFor(item)} / ${item.degree}</span>
          <span>${formatHz(freq)}</span>
        </button>
      `;
    }).join("");
  }

  function phraseOptionLabel(item) {
    return `${item.label} / ${noteNameFor(item)} / ${formatHz(frequencyFor(item))}`;
  }

  function updatePhraseSummary() {
    phraseSummary.textContent = getPhraseItems().map(noteNameFor).join(" → ");
  }

  function renderPhraseBuilder() {
    phraseSteps.innerHTML = state.phraseIds
      .map((selectedId, index) => {
        const options = SCALE.map((item) => {
          const selected = item.id === selectedId ? " selected" : "";
          return `<option value="${item.id}"${selected}>${phraseOptionLabel(item)}</option>`;
        }).join("");
        return `
          <div class="phrase-step" draggable="true" data-phrase-index="${index}">
            <div class="drag-handle" draggable="true" data-phrase-handle="${index}" aria-hidden="true">↕</div>
            <div class="phrase-step-body">
              <label for="phraseStep${index}">${index + 1}</label>
              <select id="phraseStep${index}" data-phrase-select="${index}">${options}</select>
            </div>
          </div>
        `;
      })
      .join("");
    updatePhraseSummary();
  }

  function movePhraseStep(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= state.phraseIds.length || toIndex >= state.phraseIds.length) return;
    const next = [...state.phraseIds];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    state.phraseIds = next;
    renderPhraseBuilder();
    updateReadout();
  }

  function clearPhraseDragClasses() {
    $$(".phrase-step").forEach((step) => step.classList.remove("dragging", "drop-target"));
  }

  function updatePointerDropTarget(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY)?.closest("[data-phrase-index]");
    clearPhraseDragClasses();
    const source = $(`[data-phrase-index="${state.pointerPhraseIndex}"]`);
    if (source) {
      source.classList.add("dragging");
    }
    if (target) {
      target.classList.add("drop-target");
      state.pointerDropIndex = Number(target.dataset.phraseIndex);
    }
  }

  function setPhraseStep(index, id) {
    state.phraseIds[index] = id;
    const item = getScaleItem(id);
    state.currentItem = item;
    state.currentSource = "phrase";
    updateReadout();
    updatePhraseSummary();
    setPitchHighlight(item.id, "phrase", index);
  }

  function addPhraseStep() {
    if (state.phraseIds.length >= 8) return;
    state.phraseIds.push(state.phraseIds[state.phraseIds.length - 1] || "do");
    renderPhraseBuilder();
  }

  function removePhraseStep() {
    if (state.phraseIds.length <= 2) return;
    state.phraseIds.pop();
    renderPhraseBuilder();
  }

  function resetOvertonePhrase() {
    state.phraseIds = [...BASIC_OVERTONE_PHRASE];
    renderPhraseBuilder();
    updateReadout();
  }

  function renderRhythmList() {
    rhythmList.innerHTML = RHYTHMS.map(
      (pattern) => `
        <button class="rhythm-card${pattern.id === state.rhythmPatternId ? " active" : ""}" type="button" data-pattern-id="${pattern.id}">
          <strong>【${pattern.no}】${pattern.name}</strong>
          <span>${pattern.formula}</span>
        </button>
      `,
    ).join("");
  }

  function renderRhythmTimeline() {
    const pattern = getRhythm();
    const step = pattern.loopBeats / pattern.divisions;
    const hitIndexes = new Set(pattern.onsets.map((beat) => Math.round(beat / step)));
    const voiceHolds = pattern.onsets.map((beat, index) => ({
      startIndex: Math.round(beat / step),
      endIndex: Math.round((beat + (pattern.durations?.[index] || 0)) / step),
    }));
    const beatIndexes = new Set(
      Array.from({ length: pattern.loopBeats }, (_, beat) => Math.round(beat / step)),
    );
    const makeSlots = (lane) => Array.from({ length: pattern.divisions }, (_, index) => {
      const beat = index * step;
      const isBeat = Math.abs(beat - Math.round(beat)) < 0.001;
      const classes = ["timeline-slot", lane];
      if (lane === "clap" && beatIndexes.has(index)) classes.push("hit");
      if (lane === "voice" && hitIndexes.has(index)) classes.push("hit");
      if (lane === "voice") {
        voiceHolds.forEach((hold) => {
          if (hold.endIndex - hold.startIndex <= 1) return;
          if (index === hold.startIndex) classes.push("hold-start");
          if (index > hold.startIndex && index < hold.endIndex - 1) classes.push("hold-mid");
          if (index === hold.endIndex - 1) classes.push("hold-end");
        });
      }
      if (isBeat) classes.push("beat");
      return `<div class="${classes.join(" ")}" data-lane="${lane}" data-slot-index="${index}"></div>`;
    }).join("");
    const gridStyle = `grid-template-columns: repeat(${pattern.divisions}, minmax(8px, 1fr))`;
    rhythmTimeline.innerHTML = `
      <div class="timeline-row">
        <div class="timeline-row-label">手拍子<span>4分一定</span></div>
        <div class="timeline-row-grid" data-timeline-lane="clap" style="${gridStyle}">${makeSlots("clap")}</div>
      </div>
      <div class="timeline-row">
        <div class="timeline-row-label">口<span>メニュー</span></div>
        <div class="timeline-row-grid" data-timeline-lane="voice" style="${gridStyle}">${makeSlots("voice")}</div>
      </div>
    `;
  }

  function updateRhythmMonitor() {
    const pattern = getRhythm();
    $("#rhythmName").textContent = pattern.name;
    $("#rhythmFormula").textContent = pattern.formula;
    $("#rhythmPracticeHint").textContent = practiceHintText();
    $("#rhythmLength").textContent = `${pattern.loopBeats}拍`;
    $("#rhythmBpm").textContent = `${getBpm()} BPM`;
    $$(".rhythm-card").forEach((button) => {
      button.classList.toggle("active", button.dataset.patternId === state.rhythmPatternId);
    });
    renderRhythmTimeline();
  }

  function getBpm() {
    return clamp(Number(bpmInput.value) || 82, 40, 220);
  }

  function includesClapGuide() {
    return state.practiceMode === "both" || state.practiceMode === "clap";
  }

  function includesVoiceGuide() {
    return state.practiceMode === "both" || state.practiceMode === "voice";
  }

  function practiceHintText() {
    if (state.practiceMode === "clap") {
      return "手拍子だけで4分を固定。小節の長さを体に入れる";
    }
    if (state.practiceMode === "voice") {
      return "口リズムだけを確認。手拍子なしで型を覚える";
    }
    return "手拍子は4分で一定、口はメニューのリズム";
  }

  function setBpm(value, source) {
    const bpm = clamp(Math.round(Number(value) || 82), 40, 220);
    bpmInput.value = String(bpm);
    bpmSlider.value = String(clamp(bpm, 40, 180));
    $("#rhythmBpm").textContent = `${bpm} BPM`;
    if (state.rhythmRunning && source !== "init") {
      void startRhythmLoop();
    }
  }

  function trackRhythmNode(node) {
    state.rhythmNodes.push(node);
    node.onended = () => {
      state.rhythmNodes = state.rhythmNodes.filter((currentNode) => currentNode !== node);
    };
  }

  function scheduleClapHit(time, accent) {
    const duration = 0.075;
    const envelope = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const noise = audioCtx.createBufferSource();
    const sampleCount = Math.ceil(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, sampleCount, audioCtx.sampleRate);
    const samples = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(accent ? 1350 : 1050, time);
    filter.Q.setValueAtTime(0.9, time);
    envelope.connect(rhythmGain);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.62, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(envelope);
    noise.start(time);
    noise.stop(time + duration + 0.02);
    trackRhythmNode(noise);
  }

  function scheduleVoiceHit(time, accent, durationBeats = 0, beatSeconds = 1) {
    const duration = durationBeats > 0 ? durationBeats * beatSeconds * 0.96 : state.rhythmSound === "tone" ? 0.13 : 0.06;
    const envelope = audioCtx.createGain();
    envelope.connect(rhythmGain);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(accent ? 0.95 : 0.58, time + 0.004);
    if (durationBeats > 0) {
      envelope.gain.setTargetAtTime(accent ? 0.68 : 0.48, time + 0.03, 0.06);
    }
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    const osc = audioCtx.createOscillator();
    osc.type = durationBeats > 0 ? "triangle" : state.rhythmSound === "tone" ? "sine" : "square";
    osc.frequency.setValueAtTime(
      state.rhythmSound === "tone" ? (accent ? 440 : 330) : accent ? 1560 : 980,
      time,
    );
    osc.connect(envelope);
    osc.start(time);
    osc.stop(time + duration + 0.02);
    trackRhythmNode(osc);
  }

  function scheduleCountIn(startTime, beatSeconds) {
    if (!state.countIn) return;
    const countStart = startTime - beatSeconds * 4;
    for (let beat = 0; beat < 4; beat += 1) {
      scheduleClapHit(countStart + beat * beatSeconds, beat === 0);
    }
  }

  function scheduleRhythmPattern(pattern, startTime, options = {}) {
    const beatSeconds = 60 / getBpm();
    if (options.withCountIn) {
      scheduleCountIn(startTime, beatSeconds);
    }
    if (includesClapGuide()) {
      for (let beat = 0; beat < pattern.loopBeats; beat += 1) {
        scheduleClapHit(startTime + beat * beatSeconds, beat === 0);
      }
    }
    if (includesVoiceGuide()) {
      pattern.onsets.forEach((beat, index) => {
        scheduleVoiceHit(startTime + beat * beatSeconds, index === 0, pattern.durations?.[index] || 0, beatSeconds);
      });
    }
  }

  function resetTimelineVisual() {
    timelineProgress.style.width = "0%";
    $$(".timeline-slot").forEach((slot) => slot.classList.remove("active"));
  }

  function updateTimelineVisual() {
    if (!audioCtx) return;
    const pattern = getRhythm();
    const beatSeconds = 60 / getBpm();
    const loopSeconds = pattern.loopBeats * beatSeconds;
    const now = audioCtx.currentTime;

    if (!state.rhythmRunning && state.rhythmVisualUntil && now > state.rhythmVisualUntil) {
      state.rhythmVisualUntil = 0;
      resetTimelineVisual();
      return;
    }

    if (now < state.rhythmOrigin) {
      timelineProgress.style.width = "0%";
      $$(".timeline-slot").forEach((slot) => slot.classList.remove("active"));
      state.rhythmFrame = window.requestAnimationFrame(updateTimelineVisual);
      return;
    }

    const elapsed = now - state.rhythmOrigin;
    const beat = (elapsed % loopSeconds) / beatSeconds;
    const progress = clamp((beat / pattern.loopBeats) * 100, 0, 100);
    timelineProgress.style.width = `${progress}%`;

    const step = pattern.loopBeats / pattern.divisions;
    let activeVoiceIndex = -1;
    let activeVoiceDistance = Infinity;
    let activeClapIndex = -1;
    let activeClapDistance = Infinity;

    for (let onset = 0; onset < pattern.loopBeats; onset += 1) {
      const direct = Math.abs(beat - onset);
      const wrapped = Math.abs(beat - (onset + pattern.loopBeats));
      const distance = Math.min(direct, wrapped);
      if (distance < activeClapDistance) {
        activeClapDistance = distance;
        activeClapIndex = Math.round(onset / step);
      }
    }

    pattern.onsets.forEach((onset) => {
      const direct = Math.abs(beat - onset);
      const wrapped = Math.abs(beat - (onset + pattern.loopBeats));
      const distance = Math.min(direct, wrapped);
      if (distance < activeVoiceDistance) {
        activeVoiceDistance = distance;
        activeVoiceIndex = Math.round(onset / step);
      }
    });

    $$(".timeline-slot").forEach((slot) => {
      const index = Number(slot.dataset.slotIndex);
      const lane = slot.dataset.lane;
      const shouldActivate =
        (lane === "clap" &&
          includesClapGuide() &&
          index === activeClapIndex &&
          activeClapDistance <= Math.max(0.12, step * 0.55)) ||
        (lane === "voice" &&
          includesVoiceGuide() &&
          index === activeVoiceIndex &&
          activeVoiceDistance <= Math.max(0.12, step * 0.55));
      slot.classList.toggle("active", shouldActivate);
    });

    state.rhythmFrame = window.requestAnimationFrame(updateTimelineVisual);
  }

  function stopRhythm(clearNodes = true) {
    state.rhythmRunning = false;
    state.rhythmVisualUntil = 0;
    window.clearTimeout(state.rhythmTimer);
    window.cancelAnimationFrame(state.rhythmFrame);
    state.rhythmTimer = 0;
    state.rhythmFrame = 0;

    if (clearNodes) {
      state.rhythmNodes.forEach((node) => {
        try {
          node.stop(0);
        } catch {
          // Already stopped.
        }
      });
      state.rhythmNodes = [];
    }
    resetTimelineVisual();
  }

  async function startRhythmLoop() {
    if (!(await ensureAudio())) return;
    stopRhythm();
    const pattern = getRhythm();
    const beatSeconds = 60 / getBpm();
    const loopSeconds = pattern.loopBeats * beatSeconds;
    const countInBeats = state.countIn ? 4 : 0;
    state.rhythmRunning = true;
    state.rhythmOrigin = audioCtx.currentTime + 0.12 + countInBeats * beatSeconds;
    state.rhythmNextStart = state.rhythmOrigin;
    let firstPattern = true;

    const queue = () => {
      if (!state.rhythmRunning) return;
      scheduleRhythmPattern(pattern, state.rhythmNextStart, { withCountIn: firstPattern });
      firstPattern = false;
      state.rhythmNextStart += loopSeconds;
      const delayMs = Math.max(20, (state.rhythmNextStart - audioCtx.currentTime - 0.16) * 1000);
      state.rhythmTimer = window.setTimeout(queue, delayMs);
    };

    queue();
    updateTimelineVisual();
  }

  async function playRhythmOnce() {
    if (!(await ensureAudio())) return;
    stopRhythm();
    const pattern = getRhythm();
    const beatSeconds = 60 / getBpm();
    const countInBeats = state.countIn ? 4 : 0;
    const start = audioCtx.currentTime + 0.12 + countInBeats * beatSeconds;
    state.rhythmOrigin = start;
    state.rhythmVisualUntil = start + pattern.loopBeats * beatSeconds;
    scheduleRhythmPattern(pattern, start, { withCountIn: true });
    updateTimelineVisual();
  }

  function refreshPitchAfterSettingChange() {
    const shouldRestartMixer = state.overtoneMixerRunning;
    renderScaleGrid();
    renderPhraseBuilder();
    renderOvertoneMixer();
    updateReadout();
    if (shouldRestartMixer) {
      void startOvertoneMixer();
    }
  }

  function selectRhythmPattern(patternId) {
    state.rhythmPatternId = patternId;
    updateRhythmMonitor();
    if (state.rhythmRunning) {
      void startRhythmLoop();
    }
  }

  function switchTab(target) {
    $$(".tab-button").forEach((button) => {
      const active = button.dataset.tabTarget === target;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$(".tab-panel").forEach((panel) => {
      const active = panel.id === `${target}Panel`;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  function setTuning(tuning) {
    state.tuning = tuning;
    $$("[data-tuning]").forEach((button) => {
      const active = button.dataset.tuning === tuning;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    refreshPitchAfterSettingChange();
  }

  function setRhythmSound(sound) {
    state.rhythmSound = sound;
    $$("[data-rhythm-sound]").forEach((button) => {
      const active = button.dataset.rhythmSound === sound;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (state.rhythmRunning) {
      void startRhythmLoop();
    }
  }

  function setPracticeMode(mode) {
    state.practiceMode = mode;
    $$("[data-practice-mode]").forEach((button) => {
      const active = button.dataset.practiceMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("#rhythmPracticeHint").textContent = practiceHintText();
    resetTimelineVisual();
    if (state.rhythmRunning) {
      void startRhythmLoop();
    }
  }

  const actions = {
    playOvertonePhrase: playPhraseOnce,
    loopOvertonePhrase: startPhraseLoop,
    compareOvertonePhrase: () => comparePitchSequence(getPhraseItems(), "phrase"),
    stopPitch,
    playCurrentPitch: () => playSinglePitch(state.currentItem, state.currentSource),
    compareCurrentPitch,
    addPhraseStep,
    removePhraseStep,
    resetOvertonePhrase,
    startOvertoneMixer,
    resetOvertoneMixerLevels,
    stopOvertoneMixer,
    playScaleUp: () => playPitchSequence(SCALE, "scale"),
    playScaleDown: () => playPitchSequence([...SCALE].reverse(), "scale"),
    compareScale: () => comparePitchSequence(SCALE, "scale"),
    startRhythm: startRhythmLoop,
    playRhythmOnce,
    stopRhythm,
  };

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actions[actionButton.dataset.action];
      if (action) {
        void action();
      }
      return;
    }

    const tabButton = event.target.closest("[data-tab-target]");
    if (tabButton) {
      switchTab(tabButton.dataset.tabTarget);
      return;
    }

    const tuningButton = event.target.closest("[data-tuning]");
    if (tuningButton) {
      setTuning(tuningButton.dataset.tuning);
      return;
    }

    const practiceButton = event.target.closest("[data-practice-mode]");
    if (practiceButton) {
      setPracticeMode(practiceButton.dataset.practiceMode);
      return;
    }

    const soundButton = event.target.closest("[data-rhythm-sound]");
    if (soundButton) {
      setRhythmSound(soundButton.dataset.rhythmSound);
      return;
    }

    const overtoneButton = event.target.closest("[data-overtone-id]");
    if (overtoneButton) {
      const item = OVERTONES.find((candidate) => candidate.id === overtoneButton.dataset.overtoneId);
      if (item) selectPitch(item, "overtone", true);
      return;
    }

    const scaleButton = event.target.closest("[data-scale-id]");
    if (scaleButton) {
      const item = SCALE.find((candidate) => candidate.id === scaleButton.dataset.scaleId);
      if (item) selectPitch(item, "scale", true);
      return;
    }

    const patternButton = event.target.closest("[data-pattern-id]");
    if (patternButton) {
      selectRhythmPattern(patternButton.dataset.patternId);
    }
  });

  rootSelect.addEventListener("change", () => {
    state.rootId = rootSelect.value;
    refreshPitchAfterSettingChange();
  });

  phraseSteps.addEventListener("change", (event) => {
    const select = event.target.closest("[data-phrase-select]");
    if (!select) return;
    setPhraseStep(Number(select.dataset.phraseSelect), select.value);
  });

  phraseSteps.addEventListener("dragstart", (event) => {
    const step = event.target.closest("[data-phrase-index]");
    if (!step) return;
    state.draggedPhraseIndex = Number(step.dataset.phraseIndex);
    step.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(state.draggedPhraseIndex));
  });

  phraseSteps.addEventListener("dragover", (event) => {
    const step = event.target.closest("[data-phrase-index]");
    if (!step) return;
    event.preventDefault();
    $$(".phrase-step.drop-target").forEach((item) => item.classList.remove("drop-target"));
    step.classList.add("drop-target");
  });

  phraseSteps.addEventListener("dragleave", (event) => {
    const step = event.target.closest("[data-phrase-index]");
    if (step) {
      step.classList.remove("drop-target");
    }
  });

  phraseSteps.addEventListener("drop", (event) => {
    const step = event.target.closest("[data-phrase-index]");
    if (!step) return;
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData("text/plain") || state.draggedPhraseIndex);
    const toIndex = Number(step.dataset.phraseIndex);
    movePhraseStep(fromIndex, toIndex);
  });

  phraseSteps.addEventListener("dragend", () => {
    state.draggedPhraseIndex = -1;
    clearPhraseDragClasses();
  });

  phraseSteps.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-phrase-handle]");
    if (!handle) return;
    const step = handle.closest("[data-phrase-index]");
    if (!step) return;
    state.pointerPhraseIndex = Number(step.dataset.phraseIndex);
    state.pointerDropIndex = state.pointerPhraseIndex;
    step.classList.add("dragging");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  phraseSteps.addEventListener("pointermove", (event) => {
    if (state.pointerPhraseIndex < 0) return;
    updatePointerDropTarget(event.clientX, event.clientY);
  });

  phraseSteps.addEventListener("pointerup", (event) => {
    if (state.pointerPhraseIndex < 0) return;
    updatePointerDropTarget(event.clientX, event.clientY);
    movePhraseStep(state.pointerPhraseIndex, state.pointerDropIndex);
    state.pointerPhraseIndex = -1;
    state.pointerDropIndex = -1;
    clearPhraseDragClasses();
  });

  phraseSteps.addEventListener("pointercancel", () => {
    state.pointerPhraseIndex = -1;
    state.pointerDropIndex = -1;
    clearPhraseDragClasses();
  });

  overtoneMixerRows.addEventListener("input", (event) => {
    const slider = event.target.closest("[data-overtone-level]");
    if (!slider) return;
    setOvertoneLevel(slider.dataset.overtoneLevel, slider.value);
  });

  volumeSlider.addEventListener("input", syncVolumes);
  rhythmVolumeSlider.addEventListener("input", syncVolumes);
  bpmSlider.addEventListener("input", (event) => setBpm(event.target.value, "slider"));
  bpmInput.addEventListener("input", (event) => setBpm(event.target.value, "input"));
  phraseBpmSlider.addEventListener("input", (event) => setPhraseBpm(event.target.value, "slider"));
  phraseBpmInput.addEventListener("input", (event) => setPhraseBpm(event.target.value, "input"));
  countInToggle.addEventListener("change", () => {
    state.countIn = countInToggle.checked;
    if (state.rhythmRunning) {
      void startRhythmLoop();
    }
  });

  renderRootOptions();
  renderOvertoneMap();
  renderScaleGrid();
  renderPhraseBuilder();
  renderOvertoneMixer();
  renderRhythmList();
  updateRhythmMonitor();
  updateReadout();
  setBpm(82, "init");
  setPhraseBpm(96, "init");
})();
