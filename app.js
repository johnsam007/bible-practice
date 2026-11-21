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
let round = [];
let position = 0;
let attempts = [];

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

function show(screen) {
  for (const id of ["home", "quiz", "results"]) byId(id).hidden = id !== screen;
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

function start(items) {
  round = [...items];
  position = 0;
  attempts = [];
  show("quiz");
  renderQuestion();
}

function renderQuestion() {
  const item = round[position];
  byId("position").textContent = "Question " + (position + 1) + " of " + round.length;
  byId("progress").max = round.length;
  byId("progress").value = position;
  byId("chapter").textContent = item.chapter;
  byId("question").textContent = item.prompt;
  byId("answers").replaceChildren();
  byId("answers").disabled = false;
  for (const option of shuffle([item.answer, ...item.distractors])) {
    const label = document.createElement("label");
    label.className = "option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = option;
    label.append(input, document.createTextNode(option));
    byId("answers").append(label);
  }
  byId("feedback").replaceChildren();
  byId("check").hidden = false;
  byId("check").disabled = true;
  byId("next").hidden = true;
  byId("next").textContent = position === round.length - 1 ? "See results" : "Next question";
  byId("question").focus();
  window.scrollTo(0, 0);
}

function finish() {
  const missed = attempts.filter(({ item, selected }) => item.answer !== selected);
  byId("score").textContent = (round.length - missed.length) + " out of " + round.length + " correct";
  byId("summary").textContent = missed.length ? "Review the questions you missed or try them again." : "You answered every question correctly.";
  byId("retry").hidden = missed.length === 0;
  byId("retry").onclick = () => start(shuffle(missed.map(({ item }) => item)));
  byId("review").replaceChildren();
  if (missed.length) {
    const heading = document.createElement("h2");
    heading.textContent = "Missed questions";
    byId("review").append(heading);
  }
  for (const { item, selected } of missed) {
    const row = document.createElement("div");
    row.className = "review-item";
    const title = document.createElement("strong");
    title.textContent = item.prompt;
    const detail = document.createElement("p");
    detail.textContent = "You chose " + selected + ". Correct answer: " + item.answer + ". ";
    detail.append(reference(item));
    row.append(title, detail);
    byId("review").append(row);
  }
  show("results");
  byId("score").focus();
}

byId("answers").addEventListener("change", () => { byId("check").disabled = false; });
byId("form").addEventListener("submit", (event) => {
  event.preventDefault();
  const choice = byId("answers").querySelector("input:checked");
  if (!choice || byId("answers").disabled) return;

  const item = round[position];
  const selected = choice.value;
  attempts.push({ item, selected });
  byId("progress").value = position + 1;
  for (const option of byId("answers").querySelectorAll("input")) {
    if (option.value === item.answer) option.parentElement.classList.add("correct");
    else if (option.checked) option.parentElement.classList.add("incorrect");
  }
  byId("answers").disabled = true;
  const message = selected === item.answer ? "Correct. " : "Correct answer: " + item.answer + ". ";
  byId("feedback").replaceChildren(document.createTextNode(message), reference(item));
  byId("check").hidden = true;
  byId("next").hidden = false;
  byId("next").focus();
});
byId("next").onclick = () => {
  position++;
  if (position < round.length) renderQuestion();
  else finish();
};
function returnHome() {
  show("home");
  byId("mixed").focus();
}
byId("exit").onclick = returnHome;
byId("menu").onclick = returnHome;
byId("total").textContent = questions.length;
byId("mixed").onclick = () => start(shuffle(chapters.flatMap(({ questions }) => shuffle(questions).slice(0, 12))));
byId("all").onclick = () => start(shuffle(questions));
for (const { chapter, questions } of chapters) {
  const button = document.createElement("button");
  button.textContent = chapter + " · " + questions.length + " questions";
  button.onclick = () => start(shuffle(questions));
  byId("chapters").append(button);
}
