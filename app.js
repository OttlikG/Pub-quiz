(() => {
  const STORAGE_KEY = "pub-quiz-state-v6";
  const KNOWN_PLAYERS_KEY = "pub-quiz-known-players-v1";
  const QUESTIONS_PER_ROUND = 5;
  const TOTAL_ROUNDS = 6;

  const TITLE_PARTS = {
    prefix: ["The", "The Most", "The Glorious", "The Legendary", "Sir Hopsalot's", "Lady Lager's", "Captain Quaff's", "Council of"],
    adjective: ["Mighty", "Sneaky", "Fluffy", "Drunken", "Glorious", "Dastardly", "Wobbly", "Mysterious", "Roaring", "Velvet", "Brave", "Ancient", "Forgotten", "Curious", "Notorious", "Splendid", "Bewildered", "Soggy"],
    noun: ["Tankards", "Pints", "Brains", "Wizards", "Owls", "Knights", "Goblets", "Pirates", "Bards", "Scribes", "Foxes", "Dragons", "Sleuths", "Crusaders", "Hedgehogs", "Pickles"],
    topic: ["Trivia", "Knowledge", "Mischief", "Curiosity", "Brain Cells", "Brews", "Wisdom", "Folly", "Hops", "Hearsay"],
    suffix: ["Showdown", "Saga", "Brawl", "Bash", "Olympics", "Cup", "Tournament", "Reckoning", "Jamboree", "Inquisition", "Gauntlet"],
  };

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomTitle() {
    const patterns = [
      () => `${pick(TITLE_PARTS.prefix)} ${pick(TITLE_PARTS.adjective)} ${pick(TITLE_PARTS.noun)} of ${pick(TITLE_PARTS.topic)}`,
      () => `${pick(TITLE_PARTS.adjective)} ${pick(TITLE_PARTS.noun)}' ${pick(TITLE_PARTS.suffix)}`,
      () => `${pick(TITLE_PARTS.prefix)} ${pick(TITLE_PARTS.noun)} ${pick(TITLE_PARTS.suffix)}`,
      () => `${pick(TITLE_PARTS.adjective)} ${pick(TITLE_PARTS.topic)} ${pick(TITLE_PARTS.suffix)}`,
    ];
    return pick(patterns)();
  }

  const app = document.getElementById("app");
  const titleEl = document.getElementById("title");
  const leaderboardEl = document.getElementById("leaderboard");
  const leaderboardList = document.getElementById("leaderboard-list");
  const resetBtn = document.getElementById("reset-btn");

  const state = load() || newState();

  function newState() {
    return {
      phase: "setup", // setup | roundIntro | passPicker | passHandoff | question | final
      title: "Pub Quiz",
      players: [], // { id, name, score }
      rounds: [], // built once the quiz starts
      cursor: { round: 0, question: 0 },
      scoredThisQuestion: {}, // playerId -> bool, reset per question
    };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function loadKnownPlayers() {
    try {
      const raw = localStorage.getItem(KNOWN_PLAYERS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function saveKnownPlayers(arr) {
    localStorage.setItem(KNOWN_PLAYERS_KEY, JSON.stringify(arr));
  }
  function rememberPlayer(name) {
    const list = loadKnownPlayers();
    if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) {
      list.push(name);
      saveKnownPlayers(list);
    }
  }
  function forgetPlayer(name) {
    saveKnownPlayers(
      loadKnownPlayers().filter((n) => n.toLowerCase() !== name.toLowerCase())
    );
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function buildRounds(s) {
    const generalCount = TOTAL_ROUNDS - 1; // always reserve one slot for the pass round

    const topics = shuffle(GENERAL_ROUNDS);
    const generalTopics = topics.slice(0, generalCount);

    const rounds = generalTopics.map((r) => ({
      title: r.title,
      description: r.description,
      kind: "general",
      questions: shuffle(r.questions).slice(0, QUESTIONS_PER_ROUND).map((q) => ({ ...q })),
    }));

    {
      // Pick a topic that wasn't used by the general rounds, falling back
      // to any topic if we've somehow used them all.
      const passTopic = topics[generalCount] || pick(GENERAL_ROUNDS);
      rounds.push({
        title: `Pass the Phone — ${passTopic.title}`,
        description: `Pass the phone after each question. The current holder picks who goes next — they'll get a new question from "${passTopic.title}".`,
        kind: "pass",
        topic: passTopic.title,
        // Fresh shuffled pool; a question is drawn each time a player is picked.
        pool: shuffle(passTopic.questions).map((q) => ({ ...q })),
        // Players who haven't had a turn yet.
        pending: s.players.map((p) => p.id),
        // Turns as they're played, in order; cursor.question indexes into this.
        questions: [],
      });
    }

    return rounds;
  }

  // ---------- rendering ----------

  function render() {
    titleEl.textContent = state.title || "Pub Quiz";
    document.title = state.title ? `${state.title} — Pub Quiz` : "Pub Quiz";

    renderLeaderboard();
    app.innerHTML = "";

    switch (state.phase) {
      case "setup": return renderSetup();
      case "roundIntro": return renderRoundIntro();
      case "passPicker": return renderPassPicker();
      case "passHandoff": return renderPassHandoff();
      case "question": return renderQuestion();
      case "final": return renderFinal();
    }
  }

  function renderLeaderboard() {
    if (state.phase === "setup") {
      leaderboardEl.classList.add("hidden");
      return;
    }
    leaderboardEl.classList.remove("hidden");
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    leaderboardList.innerHTML = sorted
      .map(
        (p) =>
          `<li><span>${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`
      )
      .join("");
  }

  function instantiateTemplate(id) {
    const tpl = document.getElementById(id);
    const node = tpl.content.cloneNode(true);
    app.appendChild(node);
  }

  // Setup -------------

  function renderSetup() {
    instantiateTemplate("tpl-setup");

    const titleInput = document.getElementById("quiz-title");
    const form = document.getElementById("player-form");
    const nameInput = document.getElementById("player-name");
    const list = document.getElementById("player-list");
    const savedList = document.getElementById("saved-list");
    const savedEmptyHint = document.getElementById("saved-empty-hint");
    const startBtn = document.getElementById("start-btn");

    titleInput.value = state.title === "Pub Quiz" ? "" : state.title;
    titleInput.addEventListener("input", () => {
      state.title = titleInput.value.trim() || "Pub Quiz";
      titleEl.textContent = state.title;
      save();
    });

    const titleRandomBtn = document.getElementById("title-random");
    titleRandomBtn.addEventListener("click", () => {
      const generated = randomTitle();
      titleInput.value = generated;
      state.title = generated;
      titleEl.textContent = generated;
      save();
    });

    function isInQuiz(name) {
      return state.players.some(
        (p) => p.name.toLowerCase() === name.toLowerCase()
      );
    }

    function redrawPlayers() {
      list.innerHTML = state.players
        .map(
          (p) =>
            `<li data-id="${p.id}">${escapeHtml(p.name)} <button aria-label="Remove ${escapeHtml(p.name)}" data-remove="${p.id}">×</button></li>`
        )
        .join("");
      startBtn.disabled = state.players.length < 2;
    }

    function redrawSaved() {
      const known = loadKnownPlayers();
      savedEmptyHint.classList.toggle("hidden", known.length > 0);
      savedList.innerHTML = known
        .map((name) => {
          const selected = isInQuiz(name);
          return `<li class="${selected ? "selected" : ""}" data-name="${escapeHtml(name)}">
            <button class="chip-toggle" data-toggle="${escapeHtml(name)}" aria-pressed="${selected}">
              ${selected ? "✓ " : "+ "}${escapeHtml(name)}
            </button>
            <button class="chip-forget" data-forget="${escapeHtml(name)}" title="Forget ${escapeHtml(name)}" aria-label="Forget ${escapeHtml(name)}">×</button>
          </li>`;
        })
        .join("");
    }

    function redrawAll() {
      redrawPlayers();
      redrawSaved();
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      if (isInQuiz(name)) {
        nameInput.setCustomValidity("Name already added");
        nameInput.reportValidity();
        return;
      }
      state.players.push({ id: uid(), name, score: 0 });
      rememberPlayer(name);
      nameInput.value = "";
      nameInput.setCustomValidity("");
      save();
      redrawAll();
    });
    nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));

    list.addEventListener("click", (e) => {
      const id = e.target?.dataset?.remove;
      if (!id) return;
      state.players = state.players.filter((p) => p.id !== id);
      save();
      redrawAll();
    });

    savedList.addEventListener("click", (e) => {
      const toggleName = e.target?.dataset?.toggle || e.target.closest?.("[data-toggle]")?.dataset?.toggle;
      const forgetName = e.target?.dataset?.forget;

      if (forgetName) {
        if (!confirm(`Forget "${forgetName}"? They'll need to be re-added next time.`)) return;
        forgetPlayer(forgetName);
        state.players = state.players.filter(
          (p) => p.name.toLowerCase() !== forgetName.toLowerCase()
        );
        save();
        redrawAll();
        return;
      }

      if (toggleName) {
        if (isInQuiz(toggleName)) {
          state.players = state.players.filter(
            (p) => p.name.toLowerCase() !== toggleName.toLowerCase()
          );
        } else {
          state.players.push({ id: uid(), name: toggleName, score: 0 });
        }
        save();
        redrawAll();
      }
    });

    startBtn.addEventListener("click", () => {
      if (state.players.length < 2) return;
      state.rounds = buildRounds(state);
      state.phase = "roundIntro";
      state.cursor = { round: 0, question: 0 };
      save();
      render();
    });

    redrawAll();
  }

  // Round intro -----------

  function renderRoundIntro() {
    instantiateTemplate("tpl-round-intro");
    const round = state.rounds[state.cursor.round];
    document.getElementById("intro-num").textContent = state.cursor.round + 1;
    document.getElementById("intro-title").textContent = round.title;
    document.getElementById("intro-desc").textContent = round.description;

    document.getElementById("intro-start").addEventListener("click", () => {
      state.cursor.question = 0;
      state.scoredThisQuestion = {};
      state.phase = round.kind === "pass" ? "passPicker" : "question";
      save();
      render();
    });
  }

  // Pass-the-phone handoff -----------

  // Pass-the-phone: pick who goes next -----------

  function renderPassPicker() {
    instantiateTemplate("tpl-pass-picker");
    const round = state.rounds[state.cursor.round];
    const total = state.players.length;
    const pendingIds = round.pending || [];
    const played = total - pendingIds.length;

    document.getElementById("picker-title").textContent =
      played === 0 ? "Who starts?" : "Who's next?";
    document.getElementById("picker-progress").textContent =
      `${played} of ${total} done`;

    const grid = document.getElementById("picker-players");
    grid.innerHTML = "";
    pendingIds.forEach((pid) => {
      const player = state.players.find((p) => p.id === pid);
      if (!player) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker-btn";
      btn.innerHTML = `<span>${escapeHtml(player.name)}</span><span class="badge">${player.score}</span>`;
      btn.addEventListener("click", () => pickNextPassPlayer(round, pid));
      grid.appendChild(btn);
    });
  }

  function pickNextPassPlayer(round, playerId) {
    if (!round.pool || round.pool.length === 0) return;
    const nextQ = round.pool.shift();
    nextQ.assignedTo = playerId;
    round.questions.push(nextQ);
    round.pending = round.pending.filter((id) => id !== playerId);
    state.cursor.question = round.questions.length - 1;
    state.phase = "passHandoff";
    save();
    render();
  }

  function renderPassHandoff() {
    instantiateTemplate("tpl-pass-handoff");
    const round = state.rounds[state.cursor.round];
    const q = round.questions[state.cursor.question];
    const player = state.players.find((p) => p.id === q.assignedTo);
    const total = state.players.length;
    const number = (q.playerIndex ?? state.cursor.question) + 1;

    document.getElementById("pass-player").textContent = player ? player.name : "?";
    document.getElementById("pass-progress").textContent = `Player ${number} of ${total}`;

    const hintEl = document.getElementById("pass-hint");
    if (hintEl) {
      hintEl.textContent =
        "When you're holding the phone, tap the button. The question is just for you — tap an option to lock in your answer.";
    }

    document.getElementById("pass-ready").addEventListener("click", () => {
      state.phase = "question";
      save();
      render();
    });
  }

  // Question --------------

  function renderQuestion() {
    instantiateTemplate("tpl-question");

    const round = state.rounds[state.cursor.round];
    const q = round.questions[state.cursor.question];

    document.getElementById("q-round").textContent = state.cursor.round + 1;
    document.getElementById("q-num").textContent = state.cursor.question + 1;
    document.getElementById("q-total").textContent =
      round.kind === "pass" ? state.players.length : round.questions.length;
    document.getElementById("q-category").textContent = round.title;
    document.getElementById("q-text").textContent = q.q;

    const authorEl = document.getElementById("q-author");
    if (round.kind === "pass") {
      const player = state.players.find((p) => p.id === q.assignedTo);
      authorEl.textContent = player ? `For ${player.name} — tap your answer` : "";
      authorEl.classList.remove("hidden");
    }

    const answerBox = document.getElementById("q-answer");
    const answerText = document.getElementById("q-answer-text");
    const scoring = document.getElementById("q-scoring");
    const playersGrid = document.getElementById("q-players");
    const optionsEl = document.getElementById("q-options");
    const revealBtn = document.getElementById("q-reveal");
    const nextBtn = document.getElementById("q-next");

    answerText.textContent = q.a;

    // Use a stable shuffle cached on the question so a re-render (e.g. after
    // toggling a score) doesn't reshuffle the options under the players' feet.
    if (!q._optionOrder) {
      const pool = [q.a, ...(q.wrong || [])];
      q._optionOrder = shuffle(pool);
      save();
    }

    const letters = ["A", "B", "C", "D"];
    optionsEl.innerHTML = "";
    q._optionOrder.forEach((text, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.dataset.option = text;
      btn.innerHTML = `<span class="letter">${letters[i] || ""}</span><span class="opt-text">${escapeHtml(text)}</span>`;
      optionsEl.appendChild(btn);
    });

    function highlightOptions(pickedText) {
      optionsEl.querySelectorAll("button.option").forEach((btn) => {
        if (btn.dataset.option === q.a) btn.classList.add("correct");
        else btn.classList.add("wrong");
        if (pickedText && btn.dataset.option === pickedText) btn.classList.add("picked");
        btn.disabled = true;
      });
    }

    if (round.kind === "pass") {
      // The assigned player taps their own answer; scoring is automatic.
      scoring.classList.add("hidden");
      revealBtn.classList.add("hidden");

      if (q._answered) {
        highlightOptions(q._pickedOption);
        answerBox.classList.remove("hidden");
        nextBtn.classList.remove("hidden");
      } else {
        optionsEl.querySelectorAll("button.option").forEach((btn) => {
          btn.addEventListener("click", () => {
            if (q._answered) return;
            const picked = btn.dataset.option;
            const player = state.players.find((p) => p.id === q.assignedTo);
            if (player && picked === q.a) player.score += 1;
            q._answered = true;
            q._pickedOption = picked;
            highlightOptions(picked);
            answerBox.classList.remove("hidden");
            nextBtn.classList.remove("hidden");
            renderLeaderboard();
            save();
          });
        });
      }

      nextBtn.addEventListener("click", () => advanceFromQuestion(round));
      return;
    }

    function renderPlayerButtons() {
      playersGrid.innerHTML = "";
      state.players.forEach((p) => {
        const btn = document.createElement("button");
        btn.dataset.id = p.id;
        btn.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="badge">${p.score}</span>`;
        if (state.scoredThisQuestion[p.id]) btn.classList.add("scored");
        btn.addEventListener("click", () => toggleScore(p.id, btn));
        playersGrid.appendChild(btn);
      });
    }

    function toggleScore(playerId, btn) {
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return;
      if (state.scoredThisQuestion[playerId]) {
        state.scoredThisQuestion[playerId] = false;
        player.score = Math.max(0, player.score - 1);
        btn.classList.remove("scored");
      } else {
        state.scoredThisQuestion[playerId] = true;
        player.score += 1;
        btn.classList.add("scored");
      }
      btn.querySelector(".badge").textContent = player.score;
      renderLeaderboard();
      save();
    }

    revealBtn.addEventListener("click", () => {
      answerBox.classList.remove("hidden");
      scoring.classList.remove("hidden");
      revealBtn.classList.add("hidden");
      nextBtn.classList.remove("hidden");
      highlightOptions();
      renderPlayerButtons();
    });

    nextBtn.addEventListener("click", () => advanceFromQuestion(round));
  }

  function advanceFromQuestion(round) {
    state.scoredThisQuestion = {};
    if (round.kind === "pass") {
      // After each pass answer, go back to the picker (if anyone is left)
      // or straight to the next round / final.
      if ((round.pending || []).length > 0) {
        state.phase = "passPicker";
      } else if (state.cursor.round + 1 < state.rounds.length) {
        state.cursor.round += 1;
        state.cursor.question = 0;
        state.phase = "roundIntro";
      } else {
        state.phase = "final";
      }
    } else if (state.cursor.question + 1 < round.questions.length) {
      state.cursor.question += 1;
      state.phase = "question";
    } else if (state.cursor.round + 1 < state.rounds.length) {
      state.cursor.round += 1;
      state.cursor.question = 0;
      state.phase = "roundIntro";
    } else {
      state.phase = "final";
    }
    save();
    render();
  }

  // Final ---------------

  function renderFinal() {
    instantiateTemplate("tpl-final");
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const tied = sorted.filter((p) => p.score === top.score);

    const winnerEl = document.getElementById("final-winner");
    if (tied.length > 1) {
      winnerEl.textContent = `It's a tie! ${tied.map((p) => p.name).join(" & ")} — ${top.score} points`;
    } else {
      winnerEl.textContent = `🏆 ${top.name} wins with ${top.score} points!`;
    }

    const list = document.getElementById("final-list");
    list.innerHTML = sorted
      .map(
        (p, i) =>
          `<li><span>${i + 1}. ${escapeHtml(p.name)}</span><span class="score">${p.score}</span></li>`
      )
      .join("");

    document.getElementById("final-reset").addEventListener("click", hardReset);
  }

  // Utilities ------------

  function hardReset() {
    if (!confirm("Start a new quiz? Current scores will be cleared.")) return;
    localStorage.removeItem(STORAGE_KEY);
    const fresh = newState();
    Object.assign(state, fresh);
    // remove any leftover keys
    for (const k of Object.keys(state)) if (!(k in fresh)) delete state[k];
    render();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  resetBtn.addEventListener("click", hardReset);
  render();
})();
