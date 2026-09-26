import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { BookCard } from "./BookCard";
import { GraduationCap, Download, Plus, BookOpen, Users, CheckCircle, ShieldCheck, Lightbulb } from "lucide-react";
import { useState, useEffect } from "react";

interface CBCDashboardProps {
  onThemeClick?: (theme: string) => void;
  onBookClick?: (bookId: string) => void;
}

interface CBCOptions {
  levels: string[];
  learning_areas: string[];
  focus_areas: Array<{ name: string; description: string }>;
}

interface CBCBook {
  id: string;
  title: string;
  author: string;
  year: number | null;
  language: string;
  themes: string[];
  description: string;
  coverImage?: string;
  genre: string;
  cbc: {
    level: string;
    learning_area: string;
    focus: string;
    notes?: string;
    status: "reviewed" | "suggested";
    source?: string;
    reviewed_by?: string;
  };
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function downloadLessonPlan(books: CBCBook[], level: string, area: string, focus: string) {
  const header = ["Title", "Author", "Year", "Language", "Status", "Level", "Learning area", "Focus", "Notes"];
  const rows = books.map((b) => [
    b.title, b.author, b.year ?? "", b.language, b.cbc.status,
    b.cbc.level || level, b.cbc.learning_area || area, b.cbc.focus || focus, b.cbc.notes || "",
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "somarec-lesson-plan.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CBCDashboard({ onThemeClick, onBookClick }: CBCDashboardProps) {
  const [options, setOptions] = useState<CBCOptions | null>(null);
  const [level, setLevel] = useState("");
  const [area, setArea] = useState("");
  const [focus, setFocus] = useState("");
  const [reviewed, setReviewed] = useState<CBCBook[]>([]);
  const [suggested, setSuggested] = useState<CBCBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonPlan, setLessonPlan] = useState<CBCBook[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/cbc/options`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setOptions)
      .catch(() => setError("Could not reach the SomaRec API."));
  }, []);

  useEffect(() => {
    if (!area || !focus) {
      setReviewed([]);
      setSuggested([]);
      return;
    }
    const params = new URLSearchParams({ learning_area: area, focus });
    if (level) params.append("level", level);
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/cbc?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        setReviewed(data.reviewed || []);
        setSuggested(data.suggested || []);
      })
      .catch(() => setError("Could not load books for this selection."))
      .finally(() => setLoading(false));
  }, [level, area, focus]);

  const inPlan = (id: string) => lessonPlan.some((b) => b.id === id);
  const addToPlan = (book: CBCBook) => !inPlan(book.id) && setLessonPlan((p) => [...p, book]);
  const focusDescription = options?.focus_areas.find((f) => f.name === focus)?.description;

  const renderBooks = (books: CBCBook[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {books.map((book) => (
        <div key={book.id} className="relative">
          <BookCard
            book={{
              ...book,
              year: book.year || 0,
              cbcAlignment: [book.cbc.level, book.cbc.learning_area, book.cbc.focus].filter(Boolean).join(" | "),
            }}
            onThemeClick={onThemeClick}
            onBookClick={onBookClick}
            variant="list"
          />
          <Button
            size="sm"
            variant="outline"
            className="absolute top-2 right-2 h-8 px-2"
            onClick={() => addToPlan(book)}
            disabled={inPlan(book.id)}
            aria-label={inPlan(book.id) ? "In lesson plan" : "Add to lesson plan"}
          >
            {inPlan(book.id) ? <CheckCircle className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <GraduationCap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl">CBC Reading Finder</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Find Kenyan books for your learning area and the competency or value you are teaching.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <h3>Your class</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Learning area</label>
                  <Select value={area} onValueChange={setArea}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose learning area..." />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.learning_areas.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Competency, value or issue</label>
                  <Select value={focus} onValueChange={setFocus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose focus..." />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.focus_areas.map((f) => (
                        <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {focusDescription && <p className="text-xs text-muted-foreground mt-2">{focusDescription}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Level (optional)</label>
                  <Select value={level || "any"} onValueChange={(v: string) => setLevel(v === "any" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any level</SelectItem>
                      {options?.levels.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Only teacher-reviewed books carry a level. Suggestions ignore this filter.
                  </p>
                </div>

                {lessonPlan.length > 0 && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Lesson plan</span>
                      <Badge variant="secondary">
                        {lessonPlan.length} book{lessonPlan.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <Button size="sm" className="w-full" onClick={() => downloadLessonPlan(lessonPlan, level, area, focus)}>
                      <Download className="h-4 w-4 mr-2" />
                      Export plan (CSV)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3 space-y-8">
            {error && (
              <Card className="p-6 text-center text-muted-foreground">{error}</Card>
            )}

            {!area || !focus ? (
              <Card className="p-12 text-center">
                <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl mb-2">Welcome, Educator!</h3>
                <p className="text-muted-foreground">
                  Choose a learning area and a competency, value or issue to see matching Kenyan books.
                </p>
              </Card>
            ) : loading ? (
              <div className="p-12 text-center text-muted-foreground">Finding books...</div>
            ) : (
              <>
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h2 className="text-xl">Teacher-reviewed</h2>
                    <Badge variant="outline">{reviewed.length}</Badge>
                  </div>
                  {reviewed.length > 0 ? (
                    renderBooks(reviewed)
                  ) : (
                    <Card className="p-6 text-sm text-muted-foreground">
                      No teacher-reviewed books for this selection yet. Reviewed alignments are added by
                      educators, with the level and source recorded for each book.
                    </Card>
                  )}
                </section>

                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-primary" />
                    <h2 className="text-xl">Suggested from book content</h2>
                    <Badge variant="outline">{suggested.length}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    These are matched automatically from each book's description and language. They have not
                    been checked by a teacher; confirm the reading level and suitability before using them in class.
                  </p>
                  {suggested.length > 0 ? (
                    renderBooks(suggested)
                  ) : (
                    <Card className="p-6 text-center">
                      <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">No suggestions for this combination yet.</p>
                    </Card>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
