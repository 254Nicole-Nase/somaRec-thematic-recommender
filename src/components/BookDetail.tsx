import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { BookCard } from "./BookCard";
import { 
  ArrowLeft, 
  ExternalLink, 
  Download, 
  Heart, 
  Share2, 
  Calendar,
  BookOpen,
  User,
  Globe,
  Tag
} from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useState, useEffect } from "react";

interface BookDetailProps {
  book: {
    id: string;
    title: string;
    author: string;
    year: number;
    genre: string;
    language: string;
    coverImage?: string;
    themes: string[];
    cbcAlignment?: string;
    description: string;
    fullDescription?: string;
    isbn?: string;
    publisher?: string;
    pages?: number;
    availability: string;
  };
  onBack: () => void;
  onThemeClick?: (theme: string) => void;
  onBookClick?: (bookId: string) => void;
}

export function BookDetail({ 
  book, 
  onBack, 
  onThemeClick,
  onBookClick 
}: BookDetailProps) {
  // State for recommendations
  const [recommendedBooks, setRecommendedBooks] = useState<any[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // Fetch recommendations from backend
  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!book.id) return;
      setLoadingRecommendations(true);
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
        const response = await fetch(`${API_URL}/api/recommend?book_id=${book.id}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setRecommendedBooks(data || []);
      } catch (e: any) {
        console.error("An unexpected error occurred during recommendation fetch:", e);
        setRecommendedBooks([]);
      } finally {
        setLoadingRecommendations(false);
      }
    };
    fetchRecommendations();
  }, [book.id]);
  const themeDescriptions: Record<string, string> = {
    "Postcolonial Identity": "Explores themes of identity, belonging, and cultural heritage in post-independence Africa.",
    "Environmental Stewardship": "Addresses humanity's relationship with nature and environmental conservation.",
    "Ubuntu Philosophy": "Embodies the African philosophy of interconnectedness and communal responsibility.",
    "Gender & Society": "Examines women's roles, gender dynamics, and social expectations in African society.",
    "Cultural Heritage": "Celebrates and preserves traditional African customs, values, and practices.",
    "Education & Growth": "Focuses on the transformative power of education and personal development."
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-16 z-40">
        <div className="container mx-auto px-4 py-4">
          <Button 
            variant="ghost" 
            onClick={onBack}
            className="mb-4 hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Book Cover and Actions */}
          <div className="lg:col-span-1">
            <Card className="sticky top-32">
              <CardContent className="p-6">
                <div className="aspect-[3/4] mb-6">
                  <ImageWithFallback
                    src={book.coverImage || "https://images.unsplash.com/photo-1707542989144-3fad4049c9d9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhZnJpY2FuJTIwYm9vayUyMGNvdmVyc3xlbnwxfHx8fDE3NTY2NTM1NDl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"}
                    alt={`Cover of ${book.title}`}
                    className="w-full h-full object-cover rounded-lg shadow-lg"
                  />
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <Button className="w-full" size="lg">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Read Full Text
                  </Button>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm">
                      <Heart className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                    <Button variant="outline" size="sm">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  </div>

                  <Button variant="outline" size="sm" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Summary
                  </Button>
                </div>

                <Separator className="my-6" />

                {/* Quick Info */}
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Published: {book.year}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span>Language: {book.language}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span>Genre: {book.genre}</span>
                  </div>

                  {book.pages && (
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span>{book.pages} pages</span>
                    </div>
                  )}

                  {book.publisher && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>Publisher: {book.publisher}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Book Details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title and Author */}
            <div>
              <h1 className="text-3xl lg:text-4xl mb-2">{book.title}</h1>
              <p className="text-xl text-muted-foreground mb-4">by {book.author}</p>
              
              {/* CBC Alignment */}
              {book.cbcAlignment && (
                <Badge variant="secondary" className="mb-4">
                  <BookOpen className="h-3 w-3 mr-1" />
                  CBC: {book.cbcAlignment}
                </Badge>
              )}

              <p className="text-lg leading-relaxed">{book.description}</p>
            </div>

            {/* Themes Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Tag className="h-5 w-5 text-primary" />
                <h2 className="text-xl">Themes</h2>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {Array.isArray(book.themes) && book.themes.length > 0 ? (
                  book.themes.map((theme) => (
                    <Badge 
                      key={theme}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground border-primary/20"
                      onClick={() => onThemeClick?.(theme)}
                    >
                      {theme}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground">No themes available.</span>
                )}
              </div>
            </div>

            {/* Extended Description */}
            {book.fullDescription && (
              <>
                <div>
                  <h2 className="text-xl mb-4">About This Book</h2>
                  <div className="prose prose-gray max-w-none">
                    <p className="leading-relaxed">{book.fullDescription}</p>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Publisher and Genre */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-4">
              {book.publisher && (
                <span><b>Publisher:</b> {book.publisher}</span>
              )}
              {book.genre && (
                <span><b>Genre:</b> {book.genre}</span>
              )}
            </div>
          </div>
        </div>

        {/* Recommended Books */}
        <div className="mt-16">
          <h2 className="text-2xl mb-8">Recommended Next Reads</h2>
          {loadingRecommendations ? (
            <div className="text-center py-4">Loading recommendations...</div>
          ) : recommendedBooks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendedBooks.map((recBook) => (
                <BookCard
                  key={recBook.id || `${recBook.title}-${recBook.author}-${recBook.year}`}
                  book={recBook}
                  onThemeClick={onThemeClick}
                  onBookClick={onBookClick}
                  variant="grid"
                />
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground text-center">No recommendations available.</div>
          )}
        </div>
      </div>
    </div>
  );
}