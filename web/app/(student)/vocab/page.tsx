"use client";

import { useEffect, useMemo, useState } from "react";
import { Sora } from "next/font/google";

const uiFont = Sora({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type Word = {
  id: string;
  term: string;
  definition: string;
  difficulty: "easy" | "medium" | "hard";
};

type Pack = {
  id: string;
  title: string;
  createdBy: string;
  words: Word[];
};

const initialPacks: Pack[] = [];

const difficultyTone: Record<Word["difficulty"], string> = {
  easy: "border-emerald-200 bg-emerald-50 text-emerald-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  hard: "border-red-200 bg-red-50 text-red-900",
};

export default function Page() {
  const [packList, setPackList] = useState<Pack[]>(initialPacks);
  const [activePackId, setActivePackId] = useState(initialPacks[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<"all" | Word["difficulty"]>("all");
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [detailRevealed, setDetailRevealed] = useState(false);
  const [sentence, setSentence] = useState("");
  const [newPackName, setNewPackName] = useState("");
  const [newWordTerm, setNewWordTerm] = useState("");
  const [newWordDefinition, setNewWordDefinition] = useState("");
  const [newWordDifficulty, setNewWordDifficulty] = useState<Word["difficulty"]>("easy");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);

  const activePack = packList.find((p) => p.id === activePackId) ?? packList[0];

  const filteredWords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (activePack?.words ?? []).filter((w) => {
      if (difficulty !== "all" && w.difficulty !== difficulty) return false;
      if (!q) return true;
      return w.term.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q);
    });
  }, [activePack, search, difficulty]);

  const activeIndex = selectedWordId
    ? filteredWords.findIndex((w) => w.id === selectedWordId)
    : -1;
  const selectedWord = activeIndex >= 0 ? filteredWords[activeIndex] : null;

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (access) {
          const me = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
            headers: { Authorization: `Bearer ${access}` },
          }).catch(() => null);
          if (me && me.ok) {
            const prof = await me.json().catch(() => null);
            const role = (prof?.role ?? "").toLowerCase();
            setIsStaff(!!prof?.is_admin || role === "admin" || role === "teacher");
          }
        }
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/vocab/packs/`, {
          headers: {
            ...(access ? { Authorization: `Bearer ${access}` } : {}),
          },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load packs");
        const packs = (json.packs ?? []).map((p: any) => ({
          id: String(p.id),
          title: p.title,
          createdBy: "Admin",
          words: (p.words ?? []).map((w: any) => ({
            id: String(w.id),
            term: w.term,
            definition: w.definition,
            difficulty: w.difficulty,
          })),
        }));
        setPackList(packs);
        setActivePackId(packs[0]?.id ?? "");
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load packs");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function createPack() {
    const name = newPackName.trim();
    if (!name) return;
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/vocab/packs/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: JSON.stringify({ title: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create pack");
      const pack = json.pack as any;
      const normalized: Pack = {
        id: String(pack.id),
        title: pack.title,
        createdBy: "Admin",
        words: pack.words ?? [],
      };
      setPackList((p) => [normalized, ...p]);
      setActivePackId(normalized.id);
      setNewPackName("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create pack");
    }
  }

  async function addWord() {
    if (!activePack) return;
    const term = newWordTerm.trim();
    const definition = newWordDefinition.trim();
    if (!term || !definition) return;
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/vocab/words/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: JSON.stringify({
          pack: Number(activePack.id),
          term,
          definition,
          difficulty: newWordDifficulty,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to add word");
      const word = json.word as Word;
      setPackList((packs) =>
        packs.map((p) =>
          p.id === activePack.id ? { ...p, words: [word, ...p.words] } : p
        )
      );
      setNewWordTerm("");
      setNewWordDefinition("");
      setNewWordDifficulty("easy");
    } catch (e: any) {
      setError(e?.message ?? "Failed to add word");
    }
  }

  async function deleteWord(wordId: string) {
    if (!activePack) return;
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/vocab/words/${wordId}/`, {
        method: "DELETE",
        headers: {
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to delete word");
      }
      setPackList((packs) =>
        packs.map((p) =>
          p.id === activePack.id ? { ...p, words: p.words.filter((w) => String(w.id) !== String(wordId)) } : p
        )
      );
      if (selectedWordId === wordId) {
        setSelectedWordId(null);
        setDetailRevealed(false);
        setSentence("");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete word");
    }
  }

  async function deletePack(packId: string) {
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/vocab/packs/${packId}/`, {
        method: "DELETE",
        headers: {
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to delete pack");
      }
      setPackList((prev) => {
        const next = prev.filter((p) => String(p.id) !== String(packId));
        if (activePackId === packId) {
          setActivePackId(next[0]?.id ?? "");
          setSelectedWordId(null);
          setDetailRevealed(false);
          setSentence("");
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete pack");
    }
  }

  return (
    <div className={`${uiFont.className} min-h-screen bg-[#f7f7fb] text-slate-900`}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              Vocabulary Practice
            </div>
            <h1 className="mt-3 text-3xl font-semibold">Lesson Packs</h1>
            <p className="mt-1 text-sm text-slate-600">
              Choose a pack made by your admin and practice with flashcards.
            </p>
          </div>
          <button className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm">
            Start Practice
          </button>
        </div>

        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Packs</div>
            {isStaff ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-[#fbfaf7] p-3">
                <div className="text-xs font-semibold text-slate-700">Create pack</div>
                <input
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Pack name"
                  value={newPackName}
                  onChange={(e) => setNewPackName(e.target.value)}
                />
                <button
                  className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                  onClick={createPack}
                >
                  Create
                </button>
              </div>
            ) : null}
            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="text-sm text-slate-500">Loading packs...</div>
              ) : packList.length === 0 ? (
                <div className="text-sm text-slate-500">No packs yet.</div>
              ) : (
                packList.map((pack) => (
                  <div key={pack.id} className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActivePackId(pack.id);
                        setSelectedWordId(null);
                        setDetailRevealed(false);
                      }}
                      className={`flex-1 rounded-xl border px-3 py-3 text-left transition ${
                        pack.id === activePackId
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                      }`}
                    >
                      <div className="text-sm font-semibold">{pack.title}</div>
                      <div className="mt-1 text-xs opacity-80">{pack.words.length} words · {pack.createdBy}</div>
                    </button>
                    {isStaff ? (
                      <button
                        className="h-9 w-9 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700"
                        onClick={() => deletePack(pack.id)}
                        aria-label="Delete pack"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            {!selectedWord ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm">
                    <input
                      className="w-48 bg-transparent text-sm outline-none"
                      placeholder="Search words..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                  >
                    <option value="all">Difficulty</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                {isStaff ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Add a word</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Word"
                        value={newWordTerm}
                        onChange={(e) => setNewWordTerm(e.target.value)}
                        disabled={!activePack}
                      />
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Definition"
                        value={newWordDefinition}
                        onChange={(e) => setNewWordDefinition(e.target.value)}
                        disabled={!activePack}
                      />
                      <select
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={newWordDifficulty}
                        onChange={(e) => setNewWordDifficulty(e.target.value as Word["difficulty"])}
                        disabled={!activePack}
                      >
                        <option value="easy">Difficulty: Easy</option>
                        <option value="medium">Difficulty: Medium</option>
                        <option value="hard">Difficulty: Hard</option>
                      </select>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
                        onClick={addWord}
                        disabled={!activePack}
                      >
                        Save word
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {filteredWords.map((word) => (
                    <button
                      key={word.id}
                      onClick={() => {
                        setSelectedWordId(word.id);
                        setDetailRevealed(false);
                        setSentence("");
                      }}
                      className={`relative h-24 rounded-xl border px-3 py-3 text-left text-sm transition ${
                        difficultyTone[word.difficulty]
                      }`}
                    >
                      {isStaff ? (
                        <button
                          className="absolute left-2 top-2 h-5 w-5 rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWord(word.id);
                          }}
                          aria-label="Delete word"
                        >
                          ×
                        </button>
                      ) : null}
                      <div className="font-semibold">{word.term}</div>
                      <div className="mt-2 text-[11px] opacity-70">Tap to open</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <button
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                    onClick={() => setSelectedWordId(null)}
                  >
                    ← Back to word bank
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {selectedWord.difficulty}
                    </div>
                    {isStaff ? (
                      <button
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                        onClick={() => deleteWord(selectedWord.id)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>

                <button
                  className="flex h-[360px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-center shadow-sm"
                  onClick={() => setDetailRevealed((v) => !v)}
                >
                  <div>
                    <div className="text-4xl font-semibold">
                      {detailRevealed ? selectedWord.definition : selectedWord.term}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {detailRevealed ? "Tap to hide definition" : "Tap to reveal definition"}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-3">
                  <input
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    placeholder="Use this word in a sentence..."
                    value={sentence}
                    onChange={(e) => setSentence(e.target.value)}
                  />
                  <button className="rounded-2xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white">
                    Check ● 2
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
                    disabled={activeIndex <= 0}
                    onClick={() => {
                      const prev = filteredWords[activeIndex - 1];
                      if (!prev) return;
                      setSelectedWordId(prev.id);
                      setDetailRevealed(false);
                      setSentence("");
                    }}
                  >
                    ← Previous
                  </button>
                  <button
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
                    onClick={() => setSelectedWordId(null)}
                  >
                    View all words
                  </button>
                  <button
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
                    disabled={activeIndex >= filteredWords.length - 1}
                    onClick={() => {
                      const next = filteredWords[activeIndex + 1];
                      if (!next) return;
                      setSelectedWordId(next.id);
                      setDetailRevealed(false);
                      setSentence("");
                    }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
