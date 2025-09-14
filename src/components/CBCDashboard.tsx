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
import { useState } from "react";

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

const alignedBooks = {
  "Communication": [
    {
      id: "comm1",
      title: "Weep Not, Child",
      author: "Ngugi wa Thiong'o",
      year: 1964,
      genre: "Fiction",
      language: "English",
      themes: ["Education & Growth", "Family Dynamics", "Colonial Experience"],
      cbcAlignment: "Form 1-2 Literature",
      description: "Excellent for developing reading comprehension and discussion of educational themes."
    },
    {
      id: "comm2", 
      title: "The River and the Source",
      author: "Margaret Ogola",
      year: 1994,
      genre: "Fiction",
      language: "English",
      themes: ["Gender & Society", "Cultural Heritage", "Generational Change"],
      cbcAlignment: "Form 3 Literature",
      description: "Rich narrative perfect for advanced literary analysis and cultural discussion."
    }
  ],
  "Critical Thinking": [
    {
      id: "crit1",
      title: "Petals of Blood",
      author: "Ngugi wa Thiong'o",
      year: 1977,
      genre: "Fiction", 
      language: "English",
      themes: ["Economic Development", "Social Justice", "Political Criticism"],
      cbcAlignment: "Form 4 Literature",
      description: "Complex social commentary ideal for developing critical analysis skills."
    }
  ],
  "Citizenship": [
    {
      id: "cit1",
      title: "Mwangi wa Mutahi Stories",
      author: "Mwangi wa Mutahi",
      year: 1985,
      genre: "Humor",
      language: "Kiswahili/English",
      themes: ["Cultural Heritage", "Social Commentary", "Oral Tradition"],
      cbcAlignment: "Grade 7-9",
      description: "Culturally rooted stories that strengthen national identity and values."
    }
  ]
};

export function CBCDashboard({ onThemeClick, onBookClick }: CBCDashboardProps) {
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedCompetency, setSelectedCompetency] = useState<string>("");
  const [lessonPlan, setLessonPlan] = useState<string[]>([]);

  const handleAddToLessonPlan = (bookId: string) => {
    setLessonPlan(prev => [...prev, bookId]);
  };

  const currentCompetencies = selectedLevel ? cbcCompetencies[selectedLevel as keyof typeof cbcCompetencies] : {};
  const relevantBooks = selectedCompetency ? alignedBooks[selectedCompetency as keyof typeof alignedBooks] || [] : [];

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
                      {currentCompetencies[selectedCompetency as keyof typeof currentCompetencies].map((outcome: string) => (
                        <div key={outcome} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-secondary" />
                          <span>{outcome}</span>
                        </div>
                      ))}
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
                {relevantBooks.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {relevantBooks.map((book) => (
                      <div key={book.id} className="relative">
                        <BookCard
                          book={book}
                          onThemeClick={onThemeClick}
                          onBookClick={onBookClick}
                          variant="list"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2 h-8 px-2"
                          onClick={() => handleAddToLessonPlan(book.id)}
                          disabled={lessonPlan.includes(book.id)}
                        >
                          {lessonPlan.includes(book.id) ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ))}
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