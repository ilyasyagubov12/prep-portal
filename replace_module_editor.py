from pathlib import Path
path = Path('web/app/(student)/practice/modules/page.tsx')
text = path.read_text(encoding='utf-8')
start = text.find('const countLabel = canStart')
if start == -1:
    raise SystemExit('start marker not found')
end = text.find(');\n}', start)
if end == -1:
    raise SystemExit('end marker not found')
new_block = """const countLabel = canStart ? \"Ready\" : `${remaining} remaining`;

  return (
    <div className=\"rounded-xl border border-slate-200 bg-white p-4 shadow-sm\">
      <div className=\"flex items-center justify-between gap-2\">
        <div>
          <div className=\"text-xs uppercase tracking-[0.18em] text-slate-400\">Module</div>
          <div className=\"text-sm font-semibold text-slate-900\">
            {module.subject.toUpperCase()} module {module.module_index}
          </div>
        </div>
        <div className=\"text-xs text-slate-500 text-right\">
          {moduleQuestions.length}/{requiredCount} questions · {module.time_limit_minutes} min
          <div className={canStart ? \"text-emerald-600\" : \"text-amber-600\"}>{countLabel}</div>
        </div>
      </div>

      <div className=\"mt-3 flex flex-wrap items-center gap-2\">
        <button
          className=\"rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700\"
          type=\"button\"
          onClick={() => window.open(createQuestionUrl, \"_blank\")}
        >
          Create new {module.subject} question
        </button>
        <div className=\"text-[11px] text-slate-500\">Questions are saved directly into this module.</div>
      </div>

      {err ? <div className=\"mt-3 text-xs text-red-600\">{err}</div> : null}

      <div className=\"mt-4\">
        <div className=\"text-[11px] uppercase tracking-[0.2em] text-slate-400\">Module questions</div>
        <div className=\"mt-2 grid gap-2\">
          {loadingQuestions ? (
            <div className=\"rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500\">
              Loading questions...
            </div>
          ) : moduleQuestions.length ? (
            moduleQuestions.map((q, idx) => (
              <div key={q.id} className=\"rounded-lg border border-slate-200 bg-slate-50 px-3 py-2\">
                <div className=\"flex items-center justify-between gap-2\">
                  <div className=\"text-[10px] uppercase tracking-[0.14em] text-slate-500\">{q.topic_tag}</div>
                  <div className=\"flex items-center gap-2\">
                    <button
                      className=\"text-[11px] font-semibold text-slate-600\"
                      onClick={() => togglePreview(q.id)}
                    >
                      {activePreviewId === q.id ? \"Hide\" : \"Preview\"}
                    </button>
                    <button
                      className=\"text-[11px] font-semibold text-slate-600\"
                      onClick={() => window.open(`/practice/modules/${practiceId}/questions/${q.id}/edit`, \"_blank\")}
                    >
                      Edit
                    </button>
                    <button
                      className=\"text-[11px] font-semibold text-red-600\"
                      onClick={() => deleteQuestion(q.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className=\"mt-1 text-xs text-slate-700 line-clamp-2\">{q.question_text}</div>
                <div className=\"mt-1 text-[10px] text-slate-400\">#{idx + 1}</div>
              </div>
            ))
          ) : (
            <div className=\"rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500\">
              No questions added yet.
            </div>
          )}
        </div>
      </div>

      <div className=\"mt-4\">
        <div className=\"text-[11px] uppercase tracking-[0.2em] text-slate-400\">Preview</div>
        <div className=\"mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4\">
          {previewQuestion ? (
            <QuestionPreview question={previewQuestion} />
          ) : (
            <div className=\"text-xs text-slate-500\">Select “Preview” on a question to view it here.</div>
          )}
        </div>
      </div>
    </div>
  );
"""
new_text = text[:start] + new_block + text[end+3:]
path.write_text(new_text, encoding='utf-8', newline='\n')
print('updated')
