import { useState } from "react";
import { useEffect } from "react";
import { supabase } from "./utils/supabase/client";
import { Navigation } from "./components/Navigation";
import { HeroSection } from "./components/HeroSection";
import { FeaturedBooks } from "./components/FeaturedBooks";
import { FilterSidebar } from "./components/FilterSidebar";
import { BookCard } from "./components/BookCard";
import { BookDetail } from "./components/BookDetail";
import { CBCDashboard } from "./components/CBCDashboard";
import { LoginModal } from "./components/auth/LoginModal";
import { ReadingList } from "./components/ReadingList";
import { AdminPanel } from "./components/admin/AdminPanel";
import { UserProvider, useUser } from "./contexts/UserContext";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Card } from "./components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Grid, List, SlidersHorizontal, BookOpen, Users, Heart, Shield } from "lucide-react";

export type ViewMode = "home" | "search" | "detail" | "cbc" | "profile" | "admin";
export type DisplayMode = "grid" | "list";

// Sample data for demonstration
const sampleBooks = [
  {
    id: "1",
    title: "Weep Not, Child",
    author: "Ngugi wa Thiong'o",
    year: 1964,
    genre: "Fiction",
    language: "English",
    themes: ["Postcolonial Identity", "Education & Growth", "Family Dynamics"],
    cbcAlignment: "Form 1-2 Literature",
    description: "A powerful novel about a boy's education during colonial Kenya.",
    fullDescription: "Ngugi wa Thiong'o's debut novel tells the story of Njoroge, a young Kenyan boy whose life is shaped by the tumultuous period of the Mau Mau uprising. Through Njoroge's eyes, we see the devastating effects of colonialism on African families and communities, while also witnessing the transformative power of education and the enduring strength of the human spirit.",
    publisher: "Heinemann",
    pages: 154,
    availability: "Available in print and digital formats. Commonly used in Kenyan secondary schools."
  },
  {
    id: "2", 
    title: "The River and the Source",
    author: "Margaret Ogola",
    year: 1994,
    genre: "Fiction",
    language: "English",
    themes: ["Gender & Society", "Cultural Heritage", "Generational Change"],
    cbcAlignment: "Form 3 Literature",
    description: "A multi-generational saga of Kenyan women and their struggles.",
    fullDescription: "This sweeping novel follows four generations of Kenyan women, from Akoko, a strong-willed woman in pre-colonial Kenya, to her descendants navigating the challenges of modern Africa. The story explores themes of tradition versus modernity, women's rights, and the enduring power of family bonds across time.",
    publisher: "Focus Books",
    pages: 286,
    availability: "Widely available in East African bookstores and online platforms."
  },
  {
    id: "3",
    title: "Petals of Blood",
    author: "Ngugi wa Thiong'o", 
    year: 1977,
    genre: "Fiction",
    language: "English",
    themes: ["Economic Development", "Social Justice", "Rural-Urban Migration"],
    cbcAlignment: "Form 4 Literature",
    description: "A critique of post-independence Kenya's economic policies.",
    fullDescription: "Set in post-independence Kenya, this novel examines the corrupting influence of capitalism and neocolonialism on African society. Through the interconnected stories of four characters, Ngugi explores themes of economic exploitation, social inequality, and the betrayal of independence ideals.",
    publisher: "Heinemann",
    pages: 344,
    availability: "Available in academic libraries and specialized bookstores."
  }
];

function AppContent() {
  const { user, isAdmin } = useUser();
  const [currentView, setCurrentView] = useState<ViewMode>("home");
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [filters, setFilters] = useState({
    themes: [] as string[],
    languages: [] as string[],
    genres: [] as string[],
    cbcLevels: [] as string[]
  });

  // Filter books based on search and filters
  const filteredBooks = sampleBooks.filter(book => {
    const matchesSearch = searchQuery === "" || 
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.themes.some(theme => theme.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesThemes = filters.themes.length === 0 || 
      filters.themes.some(theme => book.themes.includes(theme));

    const matchesLanguages = filters.languages.length === 0 ||
      filters.languages.includes(book.language);

    const matchesGenres = filters.genres.length === 0 ||
      filters.genres.includes(book.genre);

    const matchesCBC = filters.cbcLevels.length === 0 ||
      (book.cbcAlignment && filters.cbcLevels.some(level => book.cbcAlignment?.includes(level)));

    return matchesSearch && matchesThemes && matchesLanguages && matchesGenres && matchesCBC;
  });

  const handleThemeSelect = (theme: string) => {
    setSearchQuery(theme);
    setCurrentView("search");
  };

  const handleBookClick = (bookId: string) => {
    const book = sampleBooks.find(b => b.id === bookId);
    if (book) {
      setSelectedBook(book);
      setCurrentView("detail");
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      setCurrentView("search");
    }
  };

  const clearFilters = () => {
    setFilters({
      themes: [],
      languages: [],
      genres: [],
      cbcLevels: []
    });
  };

  const renderSearchView = () => (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Search Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl mb-2">
                {searchQuery ? `Results for "${searchQuery}"` : "Browse Literature"}
              </h1>
              <p className="text-muted-foreground">
                {filteredBooks.length} book{filteredBooks.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filters
              </Button>
              <Tabs value={displayMode} onValueChange={(v: string) => setDisplayMode(v as DisplayMode)}>
                <TabsList>
                  <TabsTrigger value="grid" size="sm">
                    <Grid className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="list" size="sm">
                    <List className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          {/* Active Filters */}
          {Object.values(filters).some(arr => arr.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {Object.entries(filters).map(([category, values]) => 
                values.map(value => (
                  <Badge key={`${category}-${value}`} variant="secondary">
                    {value}
                  </Badge>
                ))
              )}
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className={`lg:col-span-1 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <FilterSidebar
              selectedFilters={filters}
              onFilterChange={setFilters}
              onClearFilters={clearFilters}
            />
          </div>
          {/* Results */}
          <div className="lg:col-span-3">
            {filteredBooks.length > 0 ? (
              <div className={displayMode === "grid" 
                ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" 
                : "space-y-4"
              }>
                {filteredBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onThemeClick={handleThemeSelect}
                    onBookClick={handleBookClick}
                    variant={displayMode}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl mb-2">No books found</h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your search or filters to find more results.
                </p>
                <Button onClick={clearFilters}>Clear filters</Button>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  const [books, setBooks] = useState<any[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  useEffect(() => {
    const fetchBooks = async () => {
      setLoadingBooks(true);
      // Fetch books with themes and curriculum tags
      const { data, error } = await supabase
        .from('books')
        .select(`*, book_themes(theme_id, themes(name)), book_curriculum(curriculum_id, curriculum_tags(name))`);
      if (!error && data) {
        const booksWithTags = data.map((book: any) => ({
          ...book,
          themes: book.book_themes?.map((bt: any) => bt.themes?.name) || [],
          curriculumTags: book.book_curriculum?.map((bc: any) => bc.curriculum_tags?.name) || [],
        }));
        setBooks(booksWithTags);
      }
      setLoadingBooks(false);
    };
    fetchBooks();
  }, []);

  // Filter books based on search and filters

  const renderHomeView = () => (
    <div>
      <HeroSection 
        onThemeSelect={handleThemeSelect}
        onSearchChange={handleSearch}
      />
      <FeaturedBooks 
        onThemeClick={handleThemeSelect}
        onBookClick={handleBookClick}
      />
      {/* Quick Stats */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <Card className="p-6">
              <BookOpen className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl mb-2">500+</h3>
              <p className="text-muted-foreground">Kenyan Literary Works</p>
            </Card>
            <Card className="p-6">
              <Users className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl mb-2">50+</h3>
              <p className="text-muted-foreground">Featured Authors</p>
            </Card>
            <Card className="p-6">
              <Heart className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl mb-2">15</h3>
              <p className="text-muted-foreground">Literary Themes</p>
            </Card>
          </div>
        </div>
      </section>
      {/* Book Grid and Sidebar */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Filters Sidebar */}
            <div className={`lg:col-span-1 ${showFilters ? 'block' : 'hidden lg:block'}`}>
              <FilterSidebar
                selectedFilters={filters}
                onFilterChange={setFilters}
                onClearFilters={clearFilters}
              />
            </div>
            {/* Results */}
            <div className="lg:col-span-3">
              {filteredBooks.length > 0 ? (
                <div className={displayMode === "grid" 
                  ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" 
                  : "space-y-4"
                }>
                  {filteredBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      book={book}
                      onThemeClick={handleThemeSelect}
                      onBookClick={handleBookClick}
                      variant={displayMode}
                    />
                  ))}
                </div>
              ) : (
                <Card className="p-12 text-center">
                  <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl mb-2">No books found</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search or filters to find more results.
                  </p>
                  <Button onClick={clearFilters}>Clear filters</Button>
                </Card>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderDetailView = () => {
    if (!selectedBook) return null;
    
    const recommendedBooks = sampleBooks
      .filter(book => 
        book.id !== selectedBook.id && 
        book.themes.some(theme => selectedBook.themes.includes(theme))
      )
      .slice(0, 3);

    return (
      <BookDetail
        book={selectedBook}
        recommendedBooks={recommendedBooks}
        onBack={() => setCurrentView("search")}
        onThemeClick={handleThemeSelect}
        onBookClick={handleBookClick}
      />
    );
  };

  const renderCBCView = () => (
    <CBCDashboard
      onThemeClick={handleThemeSelect}
      onBookClick={handleBookClick}
    />
  );

  const renderProfileView = () => (
    <ReadingList
      onThemeClick={handleThemeSelect}
      onBookClick={handleBookClick}
    />
  );

  const renderAdminView = () => (
    <AdminPanel />
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation 
        onSearchChange={handleSearch}
        searchValue={searchQuery}
        user={user}
        onLoginClick={() => setShowLoginModal(true)}
        setCurrentView={setCurrentView}
      />
      {/* Navigation Tabs - Mobile */}
      <div className="lg:hidden border-b bg-card">
        <div className="container mx-auto px-4">
          <Tabs value={currentView} onValueChange={(v: string) => setCurrentView(v as ViewMode)}>
            <TabsList className="w-full">
              <TabsTrigger value="home" className="flex-1">Home</TabsTrigger>
              <TabsTrigger value="search" className="flex-1">Browse</TabsTrigger>
              <TabsTrigger value="cbc" className="flex-1">CBC</TabsTrigger>
              <TabsTrigger value="profile" className="flex-1">Library</TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="admin" className="flex-1">Admin</TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Desktop Navigation */}
      <div className="hidden lg:block border-b bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-8 py-2">
            <Button 
              variant={currentView === "home" ? "default" : "ghost"}
              onClick={() => setCurrentView("home")}
            >
              Home
            </Button>
            <Button 
              variant={currentView === "search" ? "default" : "ghost"}
              onClick={() => setCurrentView("search")}
            >
              Browse Themes
            </Button>
            <Button 
              variant={currentView === "cbc" ? "default" : "ghost"}
              onClick={() => setCurrentView("cbc")}
            >
              CBC Alignment
            </Button>
            <Button 
              variant={currentView === "profile" ? "default" : "ghost"}
              onClick={() => setCurrentView("profile")}
            >
              My Library
            </Button>
            {isAdmin && (
              <Button 
                variant={currentView === "admin" ? "default" : "ghost"}
                onClick={() => setCurrentView("admin")}
                className="flex items-center gap-2"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main>
        {currentView === "home" && renderHomeView()}
        {currentView === "search" && renderSearchView()}
        {currentView === "detail" && renderDetailView()}
        {currentView === "cbc" && renderCBCView()}
        {currentView === "profile" && renderProfileView()}
        {currentView === "admin" && renderAdminView()}
      </main>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={(userData) => {
          // Login success is handled by the UserContext
          setShowLoginModal(false);
        }}
      />

      {/* Footer */}
      <footer className="border-t bg-card mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>&copy; 2024 SomaRec - Discover Kenyan Literature</p>
            <p className="text-sm mt-2">
              Connecting readers with Kenya's rich literary heritage through thematic exploration and CBC alignment.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}