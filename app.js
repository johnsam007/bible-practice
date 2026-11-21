"use strict";

const byId = (id) => document.getElementById(id);
const chapters = questionSource.trim().split(/\n(?=Genesis |Philippians )/).map((section) => {
  const [heading, ...rows] = section.split(/\r?\n/);
  const [chapter, code] = heading.split("|");
  return {
    chapter,
    questions: rows.map((row) => {
      const [verse, prompt, answer, ...distractors] = row.split("|");
      return { chapter, code, verse, prompt, answer, distractors };
    }),
  };
});
const questions = chapters.flatMap(({ questions }) => questions);
const storagePrefix = "bible-practice-v1:";
const modes = ["practice", "exam"];
const saved = Object.fromEntries(modes.map((mode) => [mode, readSaved(mode)]));
let session;

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

function storageUnavailable() {
  const note = byId("storage-note");
  note.textContent = "Browser storage is unavailable. Keep this tab open to retain your progress.";
  note.hidden = false;
}

function readSaved(key) {
  try {
    return JSON.parse(localStorage.getItem(storagePrefix + key));
  } catch {
    storageUnavailable();
    return null;
  }
}

function writeSaved(key, value) {
  try {
    localStorage.setItem(storagePrefix + key, JSON.stringify(value));
  } catch {
    storageUnavailable();
  }
}

function save() {
  saved[session.mode] = session;
  writeSaved(session.mode, session);
  writeSaved("active", session.mode);
}

function show(screen) {
  for (const id of ["home", "quiz", "submit", "results"]) byId(id).hidden = id !== screen;
  window.scrollTo(0, 0);
}

function reference(question) {
  const link = document.createElement("a");
  link.href = "https://ebible.org/engwebp/" + question.code + ".htm";
  link.textContent = question.chapter + ":" + question.verse;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function mixedQuestions() {
  return shuffle(chapters.flatMap(({ questions }) => shuffle(questions).slice(0, 12)));
}

function multipleChoicePage(question) {
  return { ...question, options: shuffle([question.answer, ...question.distractors]) };
}

function examPages() {
  const groups = chapters.map(({ chapter }) =>
    shuffle(matchingBank.filter((group) => group.chapter === chapter))[0],
  );
  const matchingPages = shuffle(groups).slice(0, 4).map((group) => ({
    ...group,
    pairs: shuffle(group.pairs),
    options: shuffle(group.pairs.map(([, answer]) => answer)),
  }));
  return [...mixedQuestions().map(multipleChoicePage), ...matchingPages];
}

function start(mode, pages) {
  if (saved[mode] && saved[mode].screen !== "results" &&
      !window.confirm("Replace your saved " + mode + " with a new one?")) return;

  session = { mode, pages, position: 0, responses: {}, screen: "quiz" };
  save();
  renderQuestion();
}

function openSaved(mode) {
  session = saved[mode];
  if (!session) return;

  save();
  if (session.screen === "results") renderResults();
  else if (session.screen === "submit") reviewSubmission();
  else renderQuestion();
}

function returnHome() {
  writeSaved("active", null);
  for (const mode of modes) {
    const button = byId("resume-" + mode);
    button.hidden = !saved[mode] || saved[mode].screen === "results";
  }
  show("home");
  byId("exam").focus();
}

function response() {
  return session.responses[session.position] ?? null;
}

function record(value) {
  session.responses[session.position] = value;
  save();
}

function renderChoices(page) {
  const selected = response()?.selected;
  for (const option of page.options) {
    const label = document.createElement("label");
    label.className = "option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = option;
    input.checked = option === selected;
    input.onchange = () => {
      record({ selected: option });
      if (session.mode === "exam") updateExamProgress();
      else byId("check").disabled = false;
    };
    label.append(input, document.createTextNode(option));
    byId("answers").append(label);
  }
}

function addOption(select, label, value) {
  const option = document.createElement("option");
  option.textContent = label;
  option.value = value;
  select.append(option);
}

function renderMatches(page) {
  const values = [...(response()?.matches ?? page.pairs.map(() => ""))];
  const selects = page.pairs.map(([prompt], index) => {
    const label = document.createElement("label");
    label.className = "match-row";
    const select = document.createElement("select");
    addOption(select, "Choose a match", "");
    for (const option of page.options) addOption(select, option, option);
    select.value = values[index];
    label.append(prompt, select);
    byId("answers").append(label);
    return select;
  });

  function updateAvailableMatches() {
    for (const select of selects) {
      for (const option of select.options) {
        option.disabled = Boolean(option.value && option.value !== select.value && values.includes(option.value));
      }
    }
  }

  selects.forEach((select, index) => {
    select.onchange = () => {
      values[index] = select.value;
      record({ matches: values });
      updateAvailableMatches();
      updateExamProgress();
    };
  });
  updateAvailableMatches();
}

function renderJump() {
  const jump = byId("jump");
  jump.replaceChildren();
  session.pages.forEach((page, index) => {
    const label = page.pairs ? "Matching group " + (index - 59) : "Question " + (index + 1);
    addOption(jump, label, index);
  });
  jump.value = session.position;
}

function examTotals() {
  let multipleChoice = 0;
  let matching = 0;
  let answeredChoices = 0;
  let answeredMatches = 0;

  session.pages.forEach((page, index) => {
    const answer = session.responses[index];
    if (page.pairs) {
      page.pairs.forEach(([, correct], pairIndex) => {
        const selected = answer?.matches?.[pairIndex];
        if (selected) answeredMatches++;
        if (selected === correct) matching += 2;
      });
    } else {
      if (answer?.selected) answeredChoices++;
      if (answer?.selected === page.answer) multipleChoice++;
    }
  });

  return { multipleChoice, matching, answeredChoices, answeredMatches };
}

function updateExamProgress() {
  const { answeredChoices, answeredMatches } = examTotals();
  byId("progress").value = answeredChoices + answeredMatches;
}

function renderQuestion() {
  show("quiz");
  const { pages, position, mode } = session;
  const page = pages[position];
  const exam = mode === "exam";
  const checked = Boolean(response()?.checked);
  byId("position").textContent = page.pairs
    ? "Matching group " + (position - 59) + " of 4"
    : "Question " + (position + 1) + " of " + (exam ? 60 : pages.length);
  byId("progress").max = exam ? 72 : pages.length;
  if (exam) updateExamProgress();
  else byId("progress").value = position + Number(checked);
  byId("chapter").textContent = page.chapter;
  byId("question").textContent = page.title ?? page.prompt;
  byId("answers").replaceChildren();
  byId("answers").disabled = false;
  byId("feedback").replaceChildren();

  if (page.pairs) renderMatches(page);
  else renderChoices(page);

  byId("check").hidden = exam || checked;
  byId("check").disabled = exam || !response()?.selected;
  byId("back").hidden = !exam || position === 0;
  byId("next").hidden = !exam && !checked;
  byId("next").textContent = position === pages.length - 1
    ? (exam ? "Review and submit" : "See results")
    : "Next";
  byId("jump-label").hidden = !exam;
  if (exam) renderJump();
  if (checked && !exam) showPracticeFeedback();
  byId("question").focus();
  window.scrollTo(0, 0);
}

function showPracticeFeedback() {
  const page = session.pages[session.position];
  const { selected } = response();
  for (const input of byId("answers").querySelectorAll("input")) {
    if (input.value === page.answer) input.parentElement.classList.add("correct");
    else if (input.checked) input.parentElement.classList.add("incorrect");
  }
  byId("answers").disabled = true;
  const message = selected === page.answer ? "Correct. " : "Correct answer: " + page.answer + ". ";
  byId("feedback").replaceChildren(document.createTextNode(message), reference(page));
  byId("progress").value = session.position + 1;
  byId("check").hidden = true;
  byId("next").hidden = false;
}

function goTo(position) {
  session.position = position;
  session.screen = "quiz";
  save();
  renderQuestion();
}

function reviewSubmission() {
  session.screen = "submit";
  save();
  const { answeredChoices, answeredMatches } = examTotals();
  byId("completion").textContent =
    "Answered " + answeredChoices + " of 60 multiple-choice questions and " +
    answeredMatches + " of 12 matching items.";
  show("submit");
  byId("submit-title").focus();
}

function missedAnswers() {
  return session.pages.flatMap((page, index) => {
    const response = session.responses[index];
    if (page.pairs) {
      return page.pairs.flatMap(([prompt, answer, verse], pairIndex) => {
        const selected = response?.matches?.[pairIndex];
        return selected === answer ? [] : [{ item: { ...page, prompt, answer, verse }, selected }];
      });
    }

    const selected = response?.selected;
    return selected === page.answer ? [] : [{ item: page, selected }];
  });
}

function renderResults() {
  const exam = session.mode === "exam";
  const missed = missedAnswers();
  byId("result-mode").textContent = exam ? "Exam complete" : "Practice complete";
  if (exam) {
    const { multipleChoice, matching } = examTotals();
    byId("score").textContent = (multipleChoice + matching) + " out of 84 marks";
    byId("summary").textContent = "Multiple choice: " + multipleChoice + "/60. Matching: " + matching + "/24.";
  } else {
    const total = session.pages.length;
    byId("score").textContent = (total - missed.length) + " out of " + total + " correct";
    byId("summary").textContent = missed.length
      ? "Review the questions you missed or try them again."
      : "You answered every question correctly.";
  }
  byId("retry").hidden = exam || missed.length === 0;
  byId("retry").onclick = () => start("practice", shuffle(missed.map(({ item }) => multipleChoicePage(item))));
  byId("review").replaceChildren();
  if (missed.length) {
    const heading = document.createElement("h2");
    heading.textContent = exam ? "Review missed or blank answers" : "Missed questions";
    byId("review").append(heading);
  }
  for (const { item, selected } of missed) {
    const row = document.createElement("div");
    row.className = "review-item";
    const title = document.createElement("strong");
    title.textContent = item.prompt;
    const detail = document.createElement("p");
    detail.textContent = (selected ? "You chose " + selected + ". " : "Unanswered. ") +
      "Correct answer: " + item.answer + ". ";
    detail.append(reference(item));
    row.append(title, detail);
    byId("review").append(row);
  }
  show("results");
  byId("score").focus();
}

function finish() {
  session.screen = "results";
  save();
  renderResults();
}

byId("form").addEventListener("submit", (event) => {
  event.preventDefault();
  const answer = response();
  if (session.mode !== "practice" || !answer?.selected || answer.checked) return;

  record({ ...answer, checked: true });
  showPracticeFeedback();
  byId("next").focus();
});
byId("next").onclick = () => {
  if (session.position < session.pages.length - 1) goTo(session.position + 1);
  else if (session.mode === "exam") reviewSubmission();
  else finish();
};
byId("back").onclick = () => goTo(session.position - 1);
byId("jump").onchange = (event) => goTo(Number(event.target.value));
byId("submit-exam").onclick = finish;
byId("keep-working").onclick = () => goTo(session.position);
byId("exit").onclick = returnHome;
byId("menu").onclick = returnHome;
byId("total").textContent = questions.length;
byId("mixed").onclick = () => start("practice", mixedQuestions().map(multipleChoicePage));
byId("all").onclick = () => start("practice", shuffle(questions).map(multipleChoicePage));
byId("exam").onclick = () => start("exam", examPages());
for (const mode of modes) byId("resume-" + mode).onclick = () => openSaved(mode);
for (const { chapter, questions } of chapters) {
  const button = document.createElement("button");
  button.textContent = chapter + " · " + questions.length + " questions";
  button.onclick = () => start("practice", shuffle(questions).map(multipleChoicePage));
  byId("chapters").append(button);
}

const active = readSaved("active");
if (modes.includes(active) && saved[active]) openSaved(active);
else returnHome();
