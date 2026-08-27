const notes = [];
const noteForm = document.querySelector("#note-form");
const noteInput = document.querySelector("#note-input");
const notesList = document.querySelector("#notes");
const noteCount = document.querySelector("#note-count");
const emptyState = document.querySelector("#empty-state");
const webmcpStatus = document.querySelector("#webmcp-status");

function renderNotes() {
  notesList.replaceChildren();
  emptyState.hidden = notes.length > 0;
  noteCount.textContent = `${notes.length}件`;

  for (const note of notes) {
    const item = document.createElement("li");
    item.className = "note";
    item.textContent = note;
    notesList.append(item);
  }
}

function addNote(note) {
  const normalizedNote = String(note ?? "").trim();
  if (!normalizedNote) {
    throw new Error("note must not be empty");
  }

  notes.push(normalizedNote);
  renderNotes();
  return { ok: true, note: normalizedNote, count: notes.length };
}

noteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addNote(noteInput.value);
  noteInput.value = "";
  noteInput.focus();
});

async function registerWebMcpTools() {
  if (!document.modelContext) {
    webmcpStatus.textContent = "WebMCPは無効です。ChromeのWebMCP testing flagを確認してください。";
    webmcpStatus.dataset.state = "warning";
    return;
  }

  await document.modelContext.registerTool({
    name: "getNotes",
    title: "Get notes",
    description: "現在のページに表示されているメモ一覧を取得します。",
    inputSchema: {
      type: "object",
      properties: {},
    },
    annotations: { readOnlyHint: true },
    execute: () => ({ notes: [...notes], count: notes.length }),
  });

  await document.modelContext.registerTool({
    name: "addNote",
    title: "Add a note",
    description: "現在のページのメモ一覧に新しいメモを1件追加します。",
    inputSchema: {
      type: "object",
      properties: {
        note: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description: "追加するメモの本文",
        },
      },
      required: ["note"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    execute: ({ note }) => addNote(note),
  });

  webmcpStatus.textContent = "WebMCP有効: getNotes / addNote を登録しました。";
  webmcpStatus.dataset.state = "ready";
}

renderNotes();
registerWebMcpTools().catch((error) => {
  webmcpStatus.textContent = `WebMCP登録エラー: ${error.message}`;
  webmcpStatus.dataset.state = "warning";
});

