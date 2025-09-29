import { BookCard } from "./BookCard";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";

interface FeaturedBooksProps {
  onThemeClick?: (theme: string) => void;
  onBookClick?: (bookId: string) => void;
}



export function FeaturedBooks({ onThemeClick, onBookClick }: FeaturedBooksProps) {
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const booksPerView = 3;

  useEffect(() => {
    const fetchBooks = async () => {
      setLoading(true);
      setError(null);
      // Fetch books with themes and curriculum tags
      const { data, error } = await supabase
        .from('books')
        .select(`*, book_themes(theme_id, themes(name)), book_curriculum(curriculum_id, curriculum_tags(name))`);
      if (error) {
        setError('Failed to load books.');
        setBooks([]);
      } else {
        // Map themes and curriculum tags to arrays for BookCard
        const booksWithTags = (data || []).map((book: any) => ({
          ...book,
          themes: book.book_themes?.map((bt: any) => bt.themes?.name) || [],
          curriculumTags: book.book_curriculum?.map((bc: any) => bc.curriculum_tags?.name) || [],
        }));
        setBooks(booksWithTags);
      }
      setLoading(false);
    };
    fetchBooks();
  }, []);

  const nextSlide = () => {
    setCurrentIndex((prev) => 
      prev + booksPerView >= books.length ? 0 : prev + booksPerView
    );
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => 
      prev === 0 ? Math.max(0, books.length - booksPerView) : prev - booksPerView
    );
  };

  const visibleBooks = books.slice(currentIndex, currentIndex + booksPerView);

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h2 className="text-2xl lg:text-3xl">Featured Books</h2>
          </div>
          
          <div className="hidden lg:flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={prevSlide}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={nextSlide}
              disabled={currentIndex + booksPerView >= books.length}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Books Grid */}
        {loading ? (
          <div className="text-center py-8">Loading books...</div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {visibleBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onThemeClick={onThemeClick}
                onBookClick={onBookClick}
                variant="grid"
              />
            ))}
          </div>
        )}

        {/* Mobile Navigation */}
        <div className="flex lg:hidden items-center justify-center gap-4 mt-8">
          <Button
            variant="outline"
            onClick={prevSlide}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {Math.floor(currentIndex / booksPerView) + 1} of {Math.ceil(books.length / booksPerView)}
          </span>
          <Button
            variant="outline"
            onClick={nextSlide}
            disabled={currentIndex + booksPerView >= books.length}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {/* View All Button */}
        <div className="text-center mt-8">
          <Button variant="outline" className="px-8">
            View All Books
          </Button>
        </div>
      </div>
    </section>
  );
}