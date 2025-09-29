import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { BookOpen, ExternalLink, Heart, Calendar, Plus } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useUser } from "../contexts/UserContext";
import { supabase } from "../utils/supabase/client";
import { useState } from "react";

interface BookCardProps {
  book: {
    id: string;
    title: string;
    author: string;
    year: number;
    genre: string;
    language: string;
    coverImage?: string;
    themes: string[];
    curriculumTags?: string[];
    cbcAlignment?: string;
    description?: string;
  };
  onThemeClick?: (theme: string) => void;
  onBookClick?: (bookId: string) => void;
  variant?: "grid" | "list";
  onSaveBook?: (book: any) => void;
}

export function BookCard({ book, onThemeClick, onBookClick, variant = "grid", onSaveBook }: BookCardProps) {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const isListView = variant === "list";

  const handleSaveBook = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!user || saving) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/saved-books`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          bookId: book.id,
          listId: 'default', // Default reading list
          bookData: book,
          status: 'want_to_read'
        })
      });

      if (response.ok) {
        onSaveBook?.(book);
      } else {
        console.error('Failed to save book');
      }
    } catch (error) {
      console.error('Error saving book:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={`group cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/20 ${isListView ? 'flex' : ''}`}>
      <div className={`relative ${isListView ? 'w-32 flex-shrink-0' : 'aspect-[3/4] w-full'}`}>
        <ImageWithFallback
          src={book.coverImage || "https://images.unsplash.com/photo-1707542989144-3fad4049c9d9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhZnJpY2FuJTIwYm9vayUyMGNvdmVyc3xlbnwxfHx8fDE3NTY2NTM1NDl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"}
          alt={`Cover of ${book.title}`}
          className={`w-full h-full object-cover ${isListView ? 'rounded-l-lg' : 'rounded-t-lg'}`}
        />
        {/* Hover overlay with themes and curriculum tags */}
        <div className={`absolute inset-0 bg-primary/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center p-4 ${isListView ? 'rounded-l-lg' : 'rounded-t-lg'}`}>
          <div className="text-center">
            <p className="text-primary-foreground text-sm mb-2">Themes:</p>
            <div className="flex flex-wrap gap-1 justify-center mb-2">
              {book.themes?.slice(0, 3).map((theme) => (
                <Badge 
                  key={theme}
                  variant="secondary"
                  className="text-xs bg-background text-foreground"
                  onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                    e.stopPropagation();
                    onThemeClick?.(theme);
                  }}
                >
                  {theme}
                </Badge>
              ))}
            </div>
            {book.curriculumTags && book.curriculumTags.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-center">
                <p className="text-primary-foreground text-xs mb-1">Curriculum:</p>
                {book.curriculumTags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs bg-background text-foreground">
                    {tag}
                  </Badge>
                ))}
                {book.curriculumTags.length > 2 && (
                  <Badge variant="outline" className="text-xs border-primary/20">
                    +{book.curriculumTags.length - 2} more
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        {user && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleSaveBook}
            disabled={saving}
          >
            {saving ? (
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            ) : (
              <Heart className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      <div className={`${isListView ? 'flex-1' : ''}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="line-clamp-2 group-hover:text-primary transition-colors cursor-pointer"
                  onClick={() => onBookClick?.(book.id)}>
                {book.title}
              </h3>
              <p className="text-muted-foreground text-sm mt-1">{book.author}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{book.year}</span>
            </div>
            <span>•</span>
            <span>{book.genre}</span>
            <span>•</span>
            <span>{book.language}</span>
          </div>

          {book.description && isListView && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {book.description}
            </p>
          )}

          {/* Theme and curriculum tags */}
          <div className="flex flex-wrap gap-1 mb-3">
            {book.themes?.slice(0, isListView ? 4 : 2).map((theme) => (
              <Badge 
                key={theme}
                variant="outline"
                className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground border-primary/20"
                onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                  e.stopPropagation();
                  onThemeClick?.(theme);
                }}
              >
                {theme}
              </Badge>
            ))}
            {book.themes && book.themes.length > (isListView ? 4 : 2) && (
              <Badge variant="outline" className="text-xs border-primary/20">
                +{book.themes.length - (isListView ? 4 : 2)} more
              </Badge>
            )}
            {/* Curriculum tags */}
            {book.curriculumTags && book.curriculumTags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs bg-background text-foreground">
                {tag}
              </Badge>
            ))}
            {book.curriculumTags && book.curriculumTags.length > 2 && (
              <Badge variant="outline" className="text-xs border-primary/20">
                +{book.curriculumTags.length - 2} more
              </Badge>
            )}
          </div>
          {/* CBC Alignment */}
          {book.cbcAlignment && (
            <div className="flex items-center gap-1 text-xs text-secondary mb-3">
              <BookOpen className="h-3 w-3" />
              <span>CBC: {book.cbcAlignment}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button 
              size="sm" 
              className="flex-1 h-8"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                onBookClick?.(book.id);
              }}
            >
              View Details
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              className="h-8 px-2"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                // Handle external link
              }}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}