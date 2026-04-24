(() => {
  const STORAGE_KEY = "pub-quiz-state-v1";
  const PLAYER_ROUND_INDEX = 5; // 0-based; round 6

  const app = document.getElementById("app");
  const titleEl = document.getElementById("title");
  const leaderboardEl = document.getElementById("leaderboard");
  const leaderboardList = document.getElementById("leaderboard-list");
  const resetBtn = document.getElementById("reset-btn");

  const state = load() || newState();

  function newState() {
    return {
      phase: "setup", // setup | collect | roundIntro | question | final
      title: "Pub Quiz",
      players: [], // { id, name, score }
      rounds: [], // built once the quiz starts
      cursor: { round: 0, question: 0, collectIdx: 0 },
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

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function buildRounds(players) {
    const rounds = GENERAL_ROUNDS.map((r) => ({
      title: r.title,
      description: r.description,
      kind: "general",
      questions: r.questions.map((q) => ({ ...q, authorId: null })),
    }));
    rounds.push({
      title: "Player Round",
      description: "Each player contributed a question. You can't score on your own.",
      kind: "player",
      questions: [], // filled during collection
    });
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
      case "collect": return renderCollect();
      case "roundIntro": return renderRoundIntro();
      case "question": return renderQuestion();
      case "final": return renderFinal();
    }
  }

  function renderLeaderboard() {
    if (state.phase === "setup" || state.phase === "collect") {
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
    const startBtn = document.getElementById("start-btn");

    titleInput.value = state.title === "Pub Quiz" ? "" : state.title;
    titleInput.addEventListener("input", () => {
      state.title = titleInput.value.trim() || "Pub Quiz";
      titleEl.textContent = state.title;
      save();
    });

    function redrawPlayers() {
      list.innerHTML = state.players
        .map(
          (p) =>
            `<li data-id="${p.id}">${escapeHtml(p.name)} <button aria-label="Remove ${escapeHtml(p.name)}" data-remove="${p.id}">×</button></li>`
        )
        .join("");
      startBtn.disabled = state.players.length < 2;
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        nameInput.setCustomValidity("Name already added");
        nameInput.reportValidity();
        return;
      }
      state.players.push({ id: uid(), name, score: 0 });
      nameInput.value = "";
      nameInput.setCustomValidity("");
      save();
      redrawPlayers();
    });
    nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));

    list.addEventListener("click", (e) => {
      const id = e.target?.dataset?.remove;
      if (!id) return;
      state.players = state.players.filter((p) => p.id !== id);
      save();
      redrawPlayers();
    });

    startBtn.addEventListener("click", () => {
      if (state.players.length < 2) return;
      state.rounds = buildRounds(state.players);
      state.phase = "collect";
      state.cursor = { round: 0, question: 0, collectIdx: 0 };
      save();
      render();
    });

    redrawPlayers();
  }

  // Collect ------------- (build Round 6)

  function renderCollect() {
    instantiateTemplate("tpl-collect");

    const playerRound = state.rounds[PLAYER_ROUND_INDEX];
    const idx = state.cursor.collectIdx;
    const player = state.players[idx];

    document.getElementById("collect-player").textContent = player.name;
    document.getElementById("collect-progress").textContent =
      `${idx + 1} of ${state.players.length}`;

    const qInput = document.getElementById("collect-question");
    const aInput = document.getElementById("collect-answer");
    const nextBtn = document.getElementById("collect-next");

    qInput.value = "";
    aInput.value = "";
    qInput.focus();

    nextBtn.addEventListener("click", () => {
      const q = qInput.value.trim();
      const a = aInput.value.trim();
      if (!q || !a) {
        qInput.focus();
        return;
      }
      playerRound.questions.push({ q, a, authorId: player.id });
      state.cursor.collectIdx += 1;

      if (state.cursor.collectIdx >= state.players.length) {
        // Shuffle the player round so a player doesn't always get asked their own
        // question first and the order feels fair.
        playerRound.questions = shuffle(playerRound.questions);
        state.phase = "roundIntro";
        state.cursor.round = 0;
        state.cursor.question = 0;
      }
      save();
      render();
    });
  }

  // Round intro -----------

  function renderRoundIntro() {
    instantiateTemplate("tpl-round-intro");
    const round = state.rounds[state.cursor.round];
    document.getElementById("intro-num").textContent = state.cursor.round + 1;
    document.getElementById("intro-title").textContent = round.title;
    document.getElementById("intro-desc").textContent = round.description;

    document.getElementById("intro-start").addEventListener("click", () => {
      state.phase = "question";
      state.cursor.question = 0;
      state.scoredThisQuestion = {};
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
    document.getElementById("q-total").textContent = round.questions.length;
    document.getElementById("q-category").textContent = round.title;
    document.getElementById("q-text").textContent = q.q;

    if (round.kind === "player") {
      const author = state.players.find((p) => p.id === q.authorId);
      const authorEl = document.getElementById("q-author");
      authorEl.textContent = author ? `Question by ${author.name}` : "";
      authorEl.classList.remove("hidden");
    }

    const answerBox = document.getElementById("q-answer");
    const answerText = document.getElementById("q-answer-text");
    const scoring = document.getElementById("q-scoring");
    const playersGrid = document.getElementById("q-players");
    const revealBtn = document.getElementById("q-reveal");
    const nextBtn = document.getElementById("q-next");

    answerText.textContent = q.a;

    function renderPlayerButtons() {
      playersGrid.innerHTML = "";
      state.players.forEach((p) => {
        const btn = document.createElement("button");
        btn.dataset.id = p.id;
        btn.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="badge">${p.score}</span>`;
        const disabled = round.kind === "player" && p.id === q.authorId;
        if (disabled) {
          btn.disabled = true;
          btn.title = "Author can't score on their own question";
        }
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
      renderPlayerButtons();
    });

    nextBtn.addEventListener("click", () => {
      state.scoredThisQuestion = {};
      if (state.cursor.question + 1 < round.questions.length) {
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
    });
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
