import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { BookCard } from "./BookCard";
import { 
  GraduationCap, 
  Download, 
  Plus, 
  BookOpen, 
  Users,
  Target,
  CheckCircle
} from "lucide-react";
import { useState, useEffect } from "react";

interface CBCDashboardProps {
  onThemeClick?: (theme: string) => void;
  onBookClick?: (bookId: string) => void;
}

const cbcCompetencies = {
  "Grade 1-3": {
    "Communication": ["Listening and speaking", "Reading", "Writing"],
    "Critical Thinking": ["Problem solving", "Decision making", "Creative thinking"],
    "Citizenship": ["Social awareness", "Cultural identity", "Environmental care"]
  },
  "Grade 4-6": {
    "Communication": ["Effective communication", "Reading comprehension", "Creative writing"],
    "Critical Thinking": ["Analysis and evaluation", "Innovation", "Research skills"],
    "Citizenship": ["National unity", "Cultural diversity", "Global citizenship"]
  },
  "Grade 7-9": {
    "Communication": ["Advanced literacy", "Digital communication", "Multilingual competence"],
    "Critical Thinking": ["Scientific inquiry", "Logical reasoning", "Creative expression"],
    "Citizenship": ["Leadership skills", "Ethical decision making", "Environmental stewardship"]
  },
  "Form 1-2": {
    "Literary Analysis": ["Character development", "Plot structure", "Theme identification"],
    "Cultural Understanding": ["African heritage", "Contemporary issues", "Cross-cultural dialogue"],
    "Communication Skills": ["Essay writing", "Oral presentation", "Critical discussion"]
  },
  "Form 3-4": {
    "Advanced Analysis": ["Literary criticism", "Historical context", "Comparative literature"],
    "Research Skills": ["Independent study", "Source evaluation", "Academic writing"],
    "Cultural Synthesis": ["Pan-African literature", "Global perspectives", "Social justice"]
  }
};

// CBC-aligned books fetched from backend
interface CBCBook {
  book_id: string;
  title: string;
  author: string;
  year: string;
  genre: string;
  language: string;
  themes: string;
  grade: string;
  learning_area: string;
  strand: string;
  sub_strand: string;
  competencies: string;
  notes: string;
}

export function CBCDashboard({ onThemeClick, onBookClick }: CBCDashboardProps) {
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedCompetency, setSelectedCompetency] = useState<string>("");
  const [lessonPlan, setLessonPlan] = useState<string[]>([]);
  const [cbcBooks, setCbcBooks] = useState<CBCBook[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAddToLessonPlan = (bookId: string) => {
    setLessonPlan(prev => [...prev, bookId]);
  };

  const currentCompetencies = selectedLevel ? cbcCompetencies[selectedLevel as keyof typeof cbcCompetencies] : {};

  // Fetch CBC-aligned books from Supabase when level/competency changes
  useEffect(() => {
    if (!selectedLevel || !selectedCompetency) {
      setCbcBooks([]);
      return;
    }
    setLoading(true);
    
    const fetchCBCBooks = async () => {
      try {
        const { supabase } = await import('../utils/supabase/client');
        
        // Try to query book_curriculum table if it exists
        let query = supabase
          .from('book_curriculum')
          .select('*')
          .eq('grade', selectedLevel);
        
        // Filter by competency (check if competencies column contains the selected competency)
        // Note: This assumes competencies is stored as an array or comma-separated string
        const { data: curriculumData, error: curriculumError } = await query;
        
        // If table doesn't exist (400/404) or is empty, fall back to backend API
        if (curriculumError) {
          console.log('book_curriculum table error (will use backend API):', curriculumError);
          // Don't throw - fall through to backend API fallback
        }
        
        if (!curriculumError && curriculumData && curriculumData.length > 0) {
          // Filter by competency in the frontend
          // The selectedCompetency is the category name (e.g., "Critical Thinking")
          // Get the list of competencies for this category (e.g., ["Problem solving", "Decision making", ...])
          const competencyList = currentCompetencies[selectedCompetency as keyof typeof currentCompetencies];
          const competencyValues = Array.isArray(competencyList) ? competencyList : [];
          
          // Filter curriculum entries where competencies array contains any of the competency values for this category
          const filtered = curriculumData.filter((item: any) => {
            const itemCompetencies = item.competencies || [];
            
            if (Array.isArray(itemCompetencies)) {
              // Check if any of the item's competencies match any competency in the selected category
              return itemCompetencies.some((itemComp: string) => {
                if (!itemComp) return false;
                // Normalize for comparison (trim, lowercase)
                const normalizedItemComp = itemComp.trim().toLowerCase();
                // Check against each competency in the category
                return competencyValues.some((catComp: string) => {
                  if (!catComp) return false;
                  const normalizedCatComp = catComp.trim().toLowerCase();
                  // Match if item competency contains category competency or vice versa
                  return normalizedItemComp === normalizedCatComp ||
                         normalizedItemComp.includes(normalizedCatComp) ||
                         normalizedCatComp.includes(normalizedItemComp);
                });
              });
            }
            
            // Fallback for string competencies
            const compStr = String(itemCompetencies).toLowerCase();
            return competencyValues.some((catComp: string) => 
              catComp && compStr.includes(catComp.toLowerCase())
            );
          });
          
          // If no books match the competency filter, return empty array
          if (filtered.length === 0) {
            setCbcBooks([]);
            setLoading(false);
            return;
          }
          
          // Fetch book details for each curriculum entry
          const bookIds = filtered.map((item: any) => item.book_id).filter(Boolean);
          
          // Don't query if bookIds is empty (would cause 400 error)
          if (bookIds.length === 0) {
            setCbcBooks([]);
            setLoading(false);
            return;
          }
          
          const { data: booksData, error: booksError } = await supabase
            .from('books')
            .select('id, title, author, description, cover_url, published_year, isbn10, isbn13')
            .in('id', bookIds);
          
          if (booksError) {
            console.error('Error fetching books:', booksError);
            // Fall through to backend API fallback
            throw booksError;
          }
          
          // Create a map of book_id -> book data
          const booksMap = new Map();
          if (booksData) {
            booksData.forEach((book: any) => {
              booksMap.set(book.id, book);
            });
          }
          
          // Map to CBCBook format
          const mappedBooks = filtered
            .map((item: any) => {
              const book = booksMap.get(item.book_id);
              // Only include books that were found in the books table
              if (!book) {
                return null;
              }
              
              const competencies = item.competencies || [];
              const compStr = Array.isArray(competencies) 
                ? competencies.join(', ') 
                : String(competencies);
              
              return {
                book_id: book.id || item.book_id || '',
                title: book.title || '',
                author: book.author || '',
                year: book.published_year ? String(book.published_year) : '',
                genre: '', // Genre not in books table - can be added later if needed
                language: '', // Language not in books table - can be added later if needed
                themes: '', // Will be populated from themes table if needed
                grade: item.grade || selectedLevel,
                learning_area: item.learning_area || '',
                strand: item.strand || '',
                sub_strand: item.sub_strand || '',
                competencies: compStr,
                notes: item.notes || ''
              };
            })
            .filter((book: any) => book !== null); // Remove null entries
          
          setCbcBooks(mappedBooks);
          setLoading(false);
        } else {
          // Fallback to backend API if Supabase table doesn't exist or query fails
          const params = new URLSearchParams();
          params.append('grade', selectedLevel);
          params.append('competencies', selectedCompetency);
          
          const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
          const res = await fetch(`${API_URL}/api/cbc/filter?${params.toString()}`);
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          const data = await res.json();
          setCbcBooks(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading CBC books:', err);
        // Fallback to backend API
        try {
          const params = new URLSearchParams();
          params.append('grade', selectedLevel);
          params.append('competencies', selectedCompetency);
          
          const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
          const res = await fetch(`${API_URL}/api/cbc/filter?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            setCbcBooks(Array.isArray(data) ? data : []);
          } else {
            setCbcBooks([]);
          }
        } catch (fallbackErr) {
          console.error('Fallback API also failed:', fallbackErr);
          setCbcBooks([]);
        }
        setLoading(false);
      }
    };
    
    fetchCBCBooks();
  }, [selectedLevel, selectedCompetency]);

  const relevantBooks = cbcBooks;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <GraduationCap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl">CBC Alignment Dashboard</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Find books aligned with Competency-Based Curriculum learning outcomes and build lesson plans.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Selection Panel */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <h3>Select CBC Level & Competency</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Education Level</label>
                  <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose level..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(cbcCompetencies).map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedLevel && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Core Competency</label>
                    <Select value={selectedCompetency} onValueChange={setSelectedCompetency}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose competency..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(currentCompetencies).map((competency) => (
                          <SelectItem key={competency} value={competency}>
                            {competency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedCompetency && currentCompetencies[selectedCompetency as keyof typeof currentCompetencies] && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Learning Outcomes</label>
                    <div className="space-y-2">
                      {Array.isArray(currentCompetencies[selectedCompetency as keyof typeof currentCompetencies]) ?
                        (currentCompetencies[selectedCompetency as keyof typeof currentCompetencies] as string[]).map((outcome: string) => (
                          <div key={outcome} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-secondary" />
                            <span>{outcome}</span>
                          </div>
                        )) : null}
                    </div>
                  </div>
                )}

                {lessonPlan.length > 0 && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Lesson Plan</span>
                      <Badge variant="secondary">
                        {lessonPlan.length} book{lessonPlan.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <Button size="sm" className="w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Export Plan
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {!selectedLevel ? (
              <Card className="p-12 text-center">
                <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl mb-2">Welcome, Educator!</h3>
                <p className="text-muted-foreground">
                  Select an education level to begin exploring CBC-aligned literature.
                </p>
              </Card>
            ) : !selectedCompetency ? (
              <Card className="p-12 text-center">
                <Target className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl mb-2">Choose a Competency</h3>
                <p className="text-muted-foreground">
                  Select a core competency to see relevant books and learning outcomes.
                </p>
              </Card>
            ) : (
              <div className="space-y-8">
                {/* Competency Overview */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl">{selectedCompetency} - {selectedLevel}</h2>
                        <p className="text-muted-foreground">
                          Books aligned with this competency and learning outcomes
                        </p>
                      </div>
                      <Badge variant="outline" className="h-fit">
                        {relevantBooks.length} book{relevantBooks.length !== 1 ? 's' : ''} available
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                {/* Books Grid */}
                {loading ? (
                  <div className="p-12 text-center text-muted-foreground">Loading CBC-aligned books...</div>
                ) : relevantBooks.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {relevantBooks.map((book) => {
                      // Convert CBCBook to BookCard props
                      const id = book.book_id || `${book.title}-${book.author}`;
                      // Try to parse themes as array, fallback to splitting by comma
                      let themes: string[] = [];
                      if (Array.isArray(book.themes)) {
                        themes = book.themes as unknown as string[];
                      } else if (typeof book.themes === 'string') {
                        themes = book.themes.split(',').map(t => t.trim()).filter(Boolean);
                      }
                      const bookCardProps = {
                        id,
                        title: book.title,
                        author: book.author,
                        year: Number(book.year) || 0,
                        genre: book.genre,
                        language: book.language,
                        themes,
                        cbcAlignment: [book.grade, book.learning_area, book.strand, book.sub_strand].filter(Boolean).join(' | '),
                        description: book.notes || '',
                      };
                      return (
                        <div key={id} className="relative">
                          <BookCard
                            book={bookCardProps}
                            onThemeClick={onThemeClick}
                            onBookClick={onBookClick}
                            variant="list"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="absolute top-2 right-2 h-8 px-2"
                            onClick={() => handleAddToLessonPlan(id)}
                            disabled={lessonPlan.includes(id)}
                          >
                            {lessonPlan.includes(id) ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="p-12 text-center">
                    <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl mb-2">No Books Found</h3>
                    <p className="text-muted-foreground">
                      We're working on adding more books for this competency. Check back soon!
                    </p>
                  </Card>
                )}

                {/* Lesson Planning Tips */}
                <Card>
                  <CardHeader>
                    <h3>Lesson Planning Tips</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <h4 className="font-medium mb-2 text-primary">Pre-Reading</h4>
                        <p className="text-muted-foreground">
                          Introduce themes and cultural context. Discuss learning objectives.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium mb-2 text-primary">During Reading</h4>
                        <p className="text-muted-foreground">
                          Guide analysis discussions. Connect to CBC competencies.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium mb-2 text-primary">Post-Reading</h4>
                        <p className="text-muted-foreground">
                          Assess understanding. Apply lessons to real-world contexts.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}