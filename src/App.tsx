import React, { useState, useEffect } from "react";
// import { supabase } from "./utils/supabase/client";
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



function AppContent() {
  const [allThemes, setAllThemes] = useState<string[]>([]);
  const [quickThemes, setQuickThemes] = useState<string[]>([]);
  // Fetch all themes for quick-pick from Supabase
  useEffect(() => {
    const fetchThemes = async () => {
      try {
        // Try Supabase first
        const { supabase } = await import('./utils/supabase/client');
        const { data: themesData, error } = await supabase
          .from('themes')
          .select('name')
          .order('name');
        
        if (!error && themesData && themesData.length > 0) {
          const themeNames = themesData.map((t: any) => {
            // Handle different possible column names
            return t.name || t.theme || t.title || t.value || '';
          }).filter(Boolean);
          setAllThemes(themeNames);
          // Pick up to 8 random or first themes for quick-pick
          const pickCount = 8;
          let picked: string[] = [];
          if (themeNames.length <= pickCount) {
            picked = themeNames;
          } else {
            // Shuffle and pick first N
            picked = [...themeNames].sort(() => 0.5 - Math.random()).slice(0, pickCount);
          }
          setQuickThemes(picked);
        } else {
          // Log error for debugging
          if (error) {
            console.log('Themes table error (using backend API fallback):', error);
            console.log('Themes table structure check - error details:', {
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint
            });
          }
          // Fallback to backend API if Supabase fails
          try {
            const API_URL = (import.meta as any).env.VITE_API_URL || "http://localhost:5000";
            const res = await fetch(`${API_URL}/api/themes`);
            const data = await res.json();
            setAllThemes(Array.isArray(data) ? data : []);
            const pickCount = 8;
            let picked: string[] = [];
            if (Array.isArray(data) && data.length > 0) {
              if (data.length <= pickCount) {
                picked = data;
              } else {
                picked = [...data].sort(() => 0.5 - Math.random()).slice(0, pickCount);
              }
            }
            setQuickThemes(picked);
          } catch (fallbackError) {
            console.error('Backend API fallback also failed:', fallbackError);
            setAllThemes([]);
            setQuickThemes([]);
          }
        }
      } catch (err) {
        console.error('Error loading themes:', err);
        setAllThemes([]);
        setQuickThemes([]);
      }
    };
    fetchThemes();
  }, []);
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

  const [books, setBooks] = useState<any[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [displayedResults, setDisplayedResults] = useState(10); // Show top 10 initially
  const INITIAL_RESULTS = 10;
  const LOAD_MORE_INCREMENT = 10;

  // Semantic search using FAISS-based API (Voronoi clustering)
  useEffect(() => {
    const performSemanticSearch = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        setDisplayedResults(INITIAL_RESULTS);
        return;
      }

      setIsSearching(true);
      setSearchError(null);
      setDisplayedResults(INITIAL_RESULTS); // Reset to initial when new search
      
      try {
        const API_URL = (import.meta as any).env.VITE_API_URL || "http://localhost:5000";
        // Fetch top 50 results (we'll display them progressively)
        const response = await fetch(
          `${API_URL}/api/search?q=${encodeURIComponent(searchQuery)}&top_k=50`
        );
        
        if (response.ok) {
          const data = await response.json();
          // Results are already sorted by similarity score (highest first)
          // This is from FAISS IVF (Voronoi) clustering - most semantically similar first
          setSearchResults(Array.isArray(data) ? data : []);
        } else {
          const errorData = await response.json().catch(() => ({}));
          setSearchError(errorData.error || "Search failed");
          setSearchResults([]);
        }
      } catch (err) {
        setSearchError("Failed to perform semantic search");
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    // Debounce search to avoid too many API calls
    const timeoutId = setTimeout(performSemanticSearch, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Filter books based on search and filters
  // If there's a search query, use semantic search results; otherwise use all books
  const booksToFilter = searchQuery.trim() ? searchResults : books;
  
  // Get displayed books (for "Load More" functionality)
  const displayedBooks = booksToFilter.slice(0, displayedResults);
  const hasMoreResults = booksToFilter.length > displayedResults;
  
  const filteredBooks = displayedBooks.filter(book => {
    // If we're using semantic search results, they're already filtered by relevance
    // So we only need to apply theme/language/genre/CBC filters
    
    const matchesThemes = filters.themes.length === 0 || 
      (Array.isArray(book.themes) && filters.themes.some(theme => book.themes.includes(theme)));

    const matchesLanguages = filters.languages.length === 0 ||
      (book.language && filters.languages.includes(book.language));

    const matchesGenres = filters.genres.length === 0 ||
      (book.genre && filters.genres.includes(book.genre));

    const matchesCBC = filters.cbcLevels.length === 0 ||
      (book.cbcAlignment && filters.cbcLevels.some(level => book.cbcAlignment?.includes(level)));

    return matchesThemes && matchesLanguages && matchesGenres && matchesCBC;
  });

  const handleThemeSelect = (theme: string) => {
    setSearchQuery(theme);
    setCurrentView("search");
  };

  const handleBookClick = async (bookId: string) => {
    // First try to find in current books array (backend CSV IDs)
    let book = books.find(b => b.id === bookId);
    
    // If not found, it might be a Supabase UUID - try to fetch from Supabase
    if (!book) {
      try {
        // Check if it looks like a UUID (Supabase book ID)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookId);
        if (isUUID) {
          // Try to fetch from Supabase
          const { supabase } = await import('./utils/supabase/client');
          const { data: supabaseBook } = await supabase
            .from('books')
            .select('*')
            .eq('id', bookId)
            .single();
          
          if (supabaseBook) {
            // Map Supabase book to frontend format
            book = {
              id: supabaseBook.id,
              title: supabaseBook.title || '',
              author: supabaseBook.author || '',
              year: supabaseBook.published_year || new Date().getFullYear(),
              genre: 'Unknown',
              language: 'English',
              coverImage: supabaseBook.cover_url || '',
              themes: [],
              description: supabaseBook.description || '',
              availability: 'Available'
            };
          }
        }
      } catch (err) {
        console.error('Error fetching book from Supabase:', err);
      }
    }
    
    // Fallback: try to match by composite key
    if (!book) {
      book = books.find(b => `${b.title}-${b.author}-${b.year}` === bookId);
    }
    
    if (book) {
      setSelectedBook(book);
      setCurrentView("detail");
    } else {
      console.warn('Book not found:', bookId);
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
                {isSearching ? (
                  "Searching using FAISS Voronoi clustering..."
                ) : searchError ? (
                  <span className="text-destructive">{searchError}</span>
                ) : (
                  <>
                    Showing {filteredBooks.length} of {booksToFilter.length} most relevant results
                    {searchQuery.trim() && (
                      <span className="ml-2 text-xs">
                        (ranked by semantic similarity)
                      </span>
                    )}
                  </>
                )}
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
                {filteredBooks.map((book) => {
                  const key = book.id || `${book.title}-${book.author}-${book.year}`;
                  return (
                    <BookCard
                      key={key}
                      book={book}
                      onThemeClick={handleThemeSelect}
                      onBookClick={() => {
                        const realId = book.id || `${book.title}-${book.author}-${book.year}`;
                        handleBookClick(realId);
                      }}
                      variant={displayMode}
                    />
                  );
                })}
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
            {/* Load More Button */}
            {!isSearching && hasMoreResults && filteredBooks.length > 0 && (
              <div className="mt-8 text-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setDisplayedResults(prev => prev + LOAD_MORE_INCREMENT)}
                >
                  Load More Results ({booksToFilter.length - displayedResults} remaining)
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  useEffect(() => {
    const fetchBooks = async () => {
      setLoadingBooks(true);
      try {
        const API_URL = (import.meta as any).env.VITE_API_URL || "http://localhost:5000";
        const response = await fetch(`${API_URL}/api/books`);
        if (response.ok) {
          const data = await response.json();
          setBooks(Array.isArray(data) ? data : []);
        } else {
          setBooks([]);
        }
      } catch (err) {
        setBooks([]);
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
        quickThemes={quickThemes}
      />
      <FeaturedBooks 
        onThemeClick={handleThemeSelect}
        onBookClick={handleBookClick}
        onViewAll={() => {
          clearFilters();
          setSearchQuery("");
          setCurrentView("search");
        }}
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
                  {filteredBooks.map((book) => {
                    const key = book.id || `${book.title}-${book.author}-${book.year}`;
                    return (
                      <BookCard
                        key={key}
                        book={book}
                        onThemeClick={handleThemeSelect}
                        onBookClick={() => {
                          const realId = book.id || `${book.title}-${book.author}-${book.year}`;
                          handleBookClick(realId);
                        }}
                        variant={displayMode}
                      />
                    );
                  })}
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
    
    // If BookDetail supports recommendedBooks, keep this. Otherwise, remove the prop.
    // const recommendedBooks = books
    //   .filter(book => 
    //     book.id !== selectedBook.id && 
    //     Array.isArray(book.themes) && Array.isArray(selectedBook.themes) &&
    //     book.themes.some((theme: string) => selectedBook.themes.includes(theme))
    //   )
    //   .slice(0, 3);

    return (
      <BookDetail
        book={selectedBook}
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