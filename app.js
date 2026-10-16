"use strict";

const STORAGE_KEY = "study-cards-decks-v1";

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const DECKS = [
  {
    id: makeId(),
    name: "My Deck",
    cards: []
  }
];

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDecks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return cloneData(DECKS);

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return cloneData(DECKS);

    return parsed
      .filter(deck =>
        deck &&
        typeof deck.name === "string" &&
        Array.isArray(deck.cards)
      )
      .map(deck => ({
        id: String(deck.id || makeId()),
        name: deck.name,
        cards: deck.cards
          .filter(card =>
            card &&
            typeof card.question === "string" &&
            typeof card.answer === "string"
          )
          .map(card => ({
            id: String(card.id || makeId()),
            question: card.question,
            answer: card.answer
          }))
      }));
  } catch (error) {
    console.warn("Could not load saved decks:", error);
    return cloneData(DECKS);
  }
}

let decks = loadDecks();
let selectedDeckId = decks[0]?.id || null;
let currentMode = "flashcards";
let isAdminOpen = false;
let currentCardIndex = 0;
let isCardFlipped = false;

let quizCards = [];
let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;

const $ = id => document.getElementById(id);

const deckSelect = $("deck-select");
const studyPanel = $("study-panel");
const adminPanel = $("admin-panel");
const saveStatus = $("save-status");

function currentDeck() {
  return decks.find(deck => deck.id === selectedDeckId) || null;
}

function saveDecks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    saveStatus.textContent = "Saved in this browser";
    saveStatus.classList.remove("is-error");
    return true;
  } catch (error) {
    console.error("Could not save decks:", error);
    saveStatus.textContent = "Could not save — download a backup";
    saveStatus.classList.add("is-error");
    return false;
  }
}

function renderDeckOptions() {
  if (!decks.some(deck => deck.id === selectedDeckId)) {
    selectedDeckId = decks[0]?.id || null;
  }

  deckSelect.replaceChildren();

  if (decks.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No decks";
    deckSelect.append(option);
    return;
  }

  for (const deck of decks) {
    const option = document.createElement("option");
    option.value = deck.id;
    option.textContent = deck.name;
    option.selected = deck.id === selectedDeckId;
    deckSelect.append(option);
  }
}

function setMode(mode) {
  currentMode = mode;
  isCardFlipped = false;

  document.querySelectorAll(".mode-tab").forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  $("flashcards-view").hidden = mode !== "flashcards";
  $("quiz-view").hidden = mode !== "quiz";
  $("overview-view").hidden = mode !== "overview";

  if (mode === "quiz") startQuiz();
  renderStudy();
}

function renderStudy() {
  renderFlashcard();
  renderQuiz();
  renderOverview();
}

function renderFlashcard() {
  const cards = currentDeck()?.cards || [];
  const card = cards[currentCardIndex];

  if (!card) {
    $("card-position").textContent = "No cards in this deck yet.";
    $("card-side-label").textContent = "EMPTY DECK";
    $("card-content").textContent = "Add cards in Admin mode to start studying.";
    $("flashcard").disabled = true;
    $("flashcard").setAttribute("aria-label", "No cards in this deck");
    $("flip-card").disabled = true;
    $("previous-card").disabled = true;
    $("next-card").disabled = true;
    $("shuffle-button").disabled = true;
    return;
  }

  $("flashcard").disabled = false;
  $("flip-card").disabled = false;
  $("shuffle-button").disabled = false;
  $("card-position").textContent = `Card ${currentCardIndex + 1} of ${cards.length}`;
  $("card-side-label").textContent = isCardFlipped ? "ANSWER" : "QUESTION";
  $("card-content").textContent = isCardFlipped ? card.answer : card.question;
  $("flashcard").setAttribute(
    "aria-label",
    isCardFlipped ? "Show question" : "Show answer"
  );
  $("flip-card").textContent = isCardFlipped ? "Show question" : "Show answer";
  $("previous-card").disabled = cards.length < 2;
  $("next-card").disabled = cards.length < 2;
}

function shuffleCards() {
  const deck = currentDeck();
  if (!deck || deck.cards.length < 2) return;

  for (let i = deck.cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck.cards[i], deck.cards[j]] = [deck.cards[j], deck.cards[i]];
  }

  currentCardIndex = 0;
  isCardFlipped = false;
  saveDecks();
  renderStudy();
}

function renderOverview() {
  const cards = currentDeck()?.cards || [];
  const list = $("overview-list");

  $("overview-count").textContent =
    `${cards.length} card${cards.length === 1 ? "" : "s"}`;
  list.replaceChildren();

  if (!cards.length) {
    list.append(makeEmptyState("This deck is empty. Add cards in Admin mode."));
    return;
  }

  cards.forEach((card, index) => {
    const item = document.createElement("article");
    item.className = "overview-item";

    const question = document.createElement("div");
    question.className = "overview-side";

    const questionLabel = document.createElement("strong");
    questionLabel.textContent = `QUESTION ${index + 1}`;

    const questionText = document.createElement("span");
    questionText.textContent = card.question;

    question.append(questionLabel, questionText);

    const answer = document.createElement("div");
    answer.className = "overview-side";

    const answerLabel = document.createElement("strong");
    answerLabel.textContent = "ANSWER";

    const answerText = document.createElement("span");
    answerText.textContent = card.answer;

    answer.append(answerLabel, answerText);
    item.append(question, answer);
    list.append(item);
  });
}

function startQuiz() {
  quizCards = [...(currentDeck()?.cards || [])]
    .sort(() => Math.random() - 0.5);
  quizIndex = 0;
  quizScore = 0;
  quizAnswered = false;
  renderQuiz();
}

function renderQuiz() {
  const questionElement = $("quiz-question");
  const optionsElement = $("quiz-options");
  const feedback = $("quiz-feedback");
  const nextButton = $("quiz-next");

  optionsElement.replaceChildren();
  feedback.textContent = "";
  nextButton.hidden = true;

  if (!quizCards.length) {
    $("quiz-score").textContent = "No cards in this deck yet.";
    questionElement.textContent = "Add cards in Admin mode to start a quiz.";
    return;
  }

  if (quizIndex >= quizCards.length) {
    $("quiz-score").textContent =
      `Final score: ${quizScore} out of ${quizCards.length}`;
    questionElement.textContent = "Quiz complete!";
    feedback.textContent = "Restart the quiz to try again.";
    return;
  }

  const card = quizCards[quizIndex];
  $("quiz-score").textContent =
    `Question ${quizIndex + 1} of ${quizCards.length} · Score: ${quizScore}`;
  questionElement.textContent = card.question;

  const distractors = [...new Set(
    quizCards
      .map(item => item.answer)
      .filter(answer => answer !== card.answer)
  )].sort(() => Math.random() - 0.5);

  const options = [card.answer, ...distractors.slice(0, 3)]
    .sort(() => Math.random() - 0.5);

  options.forEach(optionText => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quiz-option";
    button.textContent = optionText;
    button.addEventListener("click", () => {
      chooseQuizAnswer(button, optionText, card.answer);
    });
    optionsElement.append(button);
  });
}

function chooseQuizAnswer(button, chosenAnswer, correctAnswer) {
  if (quizAnswered) return;
  quizAnswered = true;

  const isCorrect = chosenAnswer === correctAnswer;
  if (isCorrect) quizScore += 1;

  document.querySelectorAll(".quiz-option").forEach(option => {
    option.disabled = true;
    if (option.textContent === correctAnswer) {
      option.classList.add("is-correct");
    }
  });

  if (!isCorrect) button.classList.add("is-incorrect");

  $("quiz-feedback").textContent = isCorrect
    ? "Correct!"
    : `Not quite. Answer: ${correctAnswer}`;

  $("quiz-next").textContent =
    quizIndex === quizCards.length - 1 ? "See score" : "Next question";
  $("quiz-next").hidden = false;
}

function parseBulkCards(text) {
  const cards = [];
  const invalidLines = [];

  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;

    const separatorIndex = line.indexOf("|");
    if (separatorIndex < 0) {
      invalidLines.push(index + 1);
      return;
    }

    const question = line.slice(0, separatorIndex).trim();
    const answer = line.slice(separatorIndex + 1).trim();

    if (!question || !answer) {
      invalidLines.push(index + 1);
      return;
    }

    cards.push({ id: makeId(), question, answer });
  });

  return { cards, invalidLines };
}

function makeEmptyState(message) {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

function resetCardForm() {
  $("card-form").reset();
  $("editing-card-id").value = "";
  $("card-form-title").textContent = "Add a card";
  $("save-card-button").textContent = "Add card";
  $("cancel-edit-button").hidden = true;
}

function beginEditingCard(cardId) {
  const card = currentDeck()?.cards.find(item => item.id === cardId);
  if (!card) return;

  $("editing-card-id").value = card.id;
  $("question-input").value = card.question;
  $("answer-input").value = card.answer;
  $("card-form-title").textContent = "Edit a card";
  $("save-card-button").textContent = "Save changes";
  $("cancel-edit-button").hidden = false;
  $("question-input").focus();
}

function renderAdmin() {
  const deck = currentDeck();
  const list = $("admin-card-list");
  list.replaceChildren();

  if (!deck) {
    $("admin-deck-summary").textContent = "Create a deck to manage cards.";
    $("delete-deck-button").disabled = true;
    list.append(makeEmptyState("No deck selected."));
    return;
  }

  $("admin-deck-summary").textContent =
    `${deck.name} · ${deck.cards.length} card${deck.cards.length === 1 ? "" : "s"}`;
  $("delete-deck-button").disabled = false;

  if (!deck.cards.length) {
    list.append(makeEmptyState("This deck is empty."));
    return;
  }

  deck.cards.forEach((card, index) => {
    const row = document.createElement("div");
    row.className = "admin-card-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "card-select";
    checkbox.value = card.id;
    checkbox.setAttribute("aria-label", `Select card ${index + 1}`);

    const text = document.createElement("div");
    text.className = "admin-card-text";

    const question = document.createElement("strong");
    question.textContent = `${index + 1}. ${card.question}`;

    const answer = document.createElement("span");
    answer.textContent = card.answer;

    text.append(question, answer);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "small-button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => beginEditingCard(card.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      if (!confirm("Delete this card?")) return;

      deck.cards = deck.cards.filter(item => item.id !== card.id);
      saveDecks();
      if (currentMode === "quiz") startQuiz();
      renderAll();
    });

    actions.append(editButton, deleteButton);
    row.append(checkbox, text, actions);
    list.append(row);
  });
}

function renderAll() {
  renderDeckOptions();
  renderStudy();
  renderAdmin();

  studyPanel.hidden = isAdminOpen;
  adminPanel.hidden = !isAdminOpen;

  $("admin-toggle").setAttribute("aria-pressed", String(isAdminOpen));
  $("admin-toggle").textContent = isAdminOpen ? "Close admin" : "Admin mode";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

deckSelect.addEventListener("change", event => {
  selectedDeckId = event.target.value || null;
  currentCardIndex = 0;
  isCardFlipped = false;
  resetCardForm();

  if (currentMode === "quiz") startQuiz();
  renderAll();
});

document.querySelectorAll(".mode-tab").forEach(button => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

$("admin-toggle").addEventListener("click", () => {
  isAdminOpen = !isAdminOpen;
  renderAll();
});

$("flashcard").addEventListener("click", () => {
  if (!currentDeck()?.cards.length) return;
  isCardFlipped = !isCardFlipped;
  renderFlashcard();
});

$("flip-card").addEventListener("click", () => {
  if (!currentDeck()?.cards.length) return;
  isCardFlipped = !isCardFlipped;
  renderFlashcard();
});

$("previous-card").addEventListener("click", () => {
  const length = currentDeck()?.cards.length || 0;
  if (length < 2) return;

  currentCardIndex = (currentCardIndex - 1 + length) % length;
  isCardFlipped = false;
  renderFlashcard();
});

$("next-card").addEventListener("click", () => {
  const length = currentDeck()?.cards.length || 0;
  if (length < 2) return;

  currentCardIndex = (currentCardIndex + 1) % length;
  isCardFlipped = false;
  renderFlashcard();
});

$("shuffle-button").addEventListener("click", shuffleCards);

$("restart-quiz").addEventListener("click", startQuiz);

$("quiz-next").addEventListener("click", () => {
  quizIndex += 1;
  quizAnswered = false;
  renderQuiz();
});

$("card-form").addEventListener("submit", event => {
  event.preventDefault();

  const deck = currentDeck();
  if (!deck) {
    alert("Create or select a deck first.");
    return;
  }

  const question = $("question-input").value.trim();
  const answer = $("answer-input").value.trim();
  if (!question || !answer) return;

  const editingId = $("editing-card-id").value;

  if (editingId) {
    const card = deck.cards.find(item => item.id === editingId);
    if (card) {
      card.question = question;
      card.answer = answer;
    }
  } else {
    deck.cards.push({ id: makeId(), question, answer });
  }

  resetCardForm();
  currentCardIndex = 0;
  saveDecks();

  if (currentMode === "quiz") startQuiz();
  renderAll();
});

$("cancel-edit-button").addEventListener("click", resetCardForm);

$("bulk-import-form").addEventListener("submit", event => {
  event.preventDefault();

  const deck = currentDeck();
  if (!deck) {
    alert("Create or select a deck first.");
    return;
  }

  const result = parseBulkCards($("bulk-import-input").value);
  if (!result.cards.length) {
    alert("No valid cards found. Use one card per line: Question | Answer");
    return;
  }

  deck.cards.push(...result.cards);
  $("bulk-import-input").value = "";
  saveDecks();

  if (currentMode === "quiz") startQuiz();
  renderAll();

  const message = `${result.cards.length} card(s) imported.`;
  alert(result.invalidLines.length
    ? `${message} Skipped invalid line(s): ${result.invalidLines.join(", ")}.`
    : message);
});

$("create-deck-form").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("new-deck-name").value.trim();
  if (!name) return;

  const result = parseBulkCards($("new-deck-cards").value);
  const deck = {
    id: makeId(),
    name,
    cards: result.cards
  };

  decks.push(deck);
  selectedDeckId = deck.id;
  currentCardIndex = 0;
  $("create-deck-form").reset();
  saveDecks();

  if (currentMode === "quiz") startQuiz();
  renderAll();

  if (result.invalidLines.length) {
    alert(`Deck created. Skipped invalid card line(s): ${result.invalidLines.join(", ")}.`);
  }
});

$("delete-selected-button").addEventListener("click", () => {
  const deck = currentDeck();
  if (!deck) return;

  const selectedIds = [
    ...document.querySelectorAll(".card-select:checked")
  ].map(input => input.value);

  if (!selectedIds.length) {
    alert("Select at least one card to delete.");
    return;
  }

  if (!confirm(`Delete ${selectedIds.length} selected card(s)?`)) return;

  const selected = new Set(selectedIds);
  deck.cards = deck.cards.filter(card => !selected.has(card.id));
  currentCardIndex = 0;
  saveDecks();

  if (currentMode === "quiz") startQuiz();
  renderAll();
});

$("delete-all-cards-button").addEventListener("click", () => {
  const deck = currentDeck();
  if (!deck || !deck.cards.length) return;

  if (!confirm(`Delete all ${deck.cards.length} cards in this deck?`)) return;

  deck.cards = [];
  currentCardIndex = 0;
  saveDecks();

  if (currentMode === "quiz") startQuiz();
  renderAll();
});

$("delete-deck-button").addEventListener("click", () => {
  const deck = currentDeck();
  if (!deck) return;

  if (!confirm(`Delete the deck “${deck.name}” and all its cards?`)) return;

  decks = decks.filter(item => item.id !== deck.id);
  selectedDeckId = decks[0]?.id || null;
  currentCardIndex = 0;
  resetCardForm();
  saveDecks();

  if (currentMode === "quiz") startQuiz();
  renderAll();
});

$("export-backup").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(decks, null, 2)], {
    type: "application/json"
  });

  downloadBlob(blob, "study-cards-backup.json");
});

$("import-backup").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported)) throw new Error("Invalid backup format");

    const validDecks = imported
      .filter(deck =>
        deck &&
        typeof deck.name === "string" &&
        Array.isArray(deck.cards)
      )
      .map(deck => ({
        id: String(deck.id || makeId()),
        name: deck.name.trim() || "Imported deck",
        cards: deck.cards
          .filter(card =>
            card &&
            typeof card.question === "string" &&
            typeof card.answer === "string"
          )
          .map(card => ({
            id: String(card.id || makeId()),
            question: card.question,
            answer: card.answer
          }))
      }));

    if (!validDecks.length) throw new Error("No valid decks found");

    if (!confirm("Restore this backup? It will replace the decks currently in this browser.")) {
      event.target.value = "";
      return;
    }

    decks = validDecks;
    selectedDeckId = decks[0].id;
    currentCardIndex = 0;
    resetCardForm();
    saveDecks();

    if (currentMode === "quiz") startQuiz();
    renderAll();
  } catch (error) {
    alert("That backup file could not be read.");
    console.error(error);
  }

  event.target.value = "";
});

$("download-site").addEventListener("click", async () => {
  try {
    const responses = await Promise.all([
      fetch("./index.html"),
      fetch("./style.css"),
      fetch("./app.js")
    ]);

    if (responses.some(response => !response.ok)) {
      throw new Error("Could not fetch the website files.");
    }

    let html = await responses[0].text();
    const css = await responses[1].text();
    const js = (await responses[2].text())
      .replace(/<\/script/gi, "<\\/script");

    html = html.replace(
      /<link\b[^>]*href=["'][^"']*style\.css[^"']*["'][^>]*>/i,
      `<style>\n${css}\n</style>`
    );

    html = html.replace(
      /<script\b(?=[^>]*src=["'][^"']*app\.js[^"']*["'])[^>]*>\s*<\/script>/i,
      `<script>\n${js}\n</script>`
    );

    downloadBlob(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      "study-cards.html"
    );
  } catch (error) {
    alert("Could not download the website. Open it from a web server and try again.");
    console.error(error);
  }
});

if (decks.length === 0) {
  decks.push({ id: makeId(), name: "My Deck", cards: [] });
  saveDecks();
}

renderAll();
