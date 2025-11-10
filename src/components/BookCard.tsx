import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { BookOpen, ExternalLink, Heart, Calendar, Plus } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useUser } from "../contexts/UserContext";
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

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
    // CBC fields for dashboard
    grade?: string;
    learning_area?: string;
    strand?: string;
    sub_strand?: string;
    competencies?: string | string[];
    notes?: string;
  };
  onThemeClick?: (theme: string) => void;
  onBookClick?: (bookId: string) => void;
  variant?: "grid" | "list";
  onSaveBook?: (book: any) => void;
}

export function BookCard({ book, onThemeClick, onBookClick, variant = "grid", onSaveBook }: BookCardProps) {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("default");
  const [userLists, setUserLists] = useState<Array<{ id: string; name: string }>>([]);
  const isListView = variant === "list";
  
  // Load user's reading lists when dialog opens
  useEffect(() => {
    if (showListDialog && user) {
      loadUserLists();
    }
  }, [showListDialog, user]);
  
  const loadUserLists = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      
      // Fetch reading list collections
      const { data, error } = await supabase
        .from('reading_lists')
        .select('id, name')
        .eq('user_id', authUser.id)
        .not('name', 'is', null)
        .is('book_id', null);
      
      if (!error && data) {
        // Add default "My Library" option
        const lists = [
          { id: 'default', name: 'My Library' },
          ...data.map((list: any) => ({ id: list.id, name: list.name }))
        ];
        setUserLists(lists);
        // Set default selection
        if (lists.length > 0) {
          setSelectedListId(lists[0].id);
        }
      } else {
        // Fallback to default list
        setUserLists([{ id: 'default', name: 'My Library' }]);
        setSelectedListId('default');
      }
    } catch (err) {
      console.error('Error loading lists:', err);
      setUserLists([{ id: 'default', name: 'My Library' }]);
      setSelectedListId('default');
    }
  };

  const handleSaveBookClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!user) return;
    // Show dialog to select list
    setShowListDialog(true);
  };
  
  const handleSaveBook = async (listId?: string) => {
    if (!user || saving) return;
    
    const targetListId = listId || selectedListId;
    setSaving(true);
    setShowListDialog(false);
    try {
      // Try to save to Supabase first, fallback to localStorage
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          // Get the authenticated user's ID from Supabase session
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) {
            throw new Error('Not authenticated');
          }

          // Try Supabase - insert book entry
          // First, find the Supabase book UUID by matching title/author or legacy_item_id
          let supabaseBookId: string | null = null;
          
          // Try to find book by legacy_item_id (original CSV ID)
          const csvId = parseInt(String(book.id), 10);
          if (!isNaN(csvId)) {
            try {
              const { data: supabaseBooks, error: lookupError } = await supabase
                .from('books')
                .select('id')
                .eq('legacy_item_id', csvId)
                .limit(1);
              
              if (!lookupError && supabaseBooks && supabaseBooks.length > 0) {
                supabaseBookId = supabaseBooks[0].id;
              }
            } catch (err) {
              console.warn('Error looking up book by legacy_item_id:', err);
            }
          }
          
          // If not found by legacy_item_id, try matching by title and author
          if (!supabaseBookId) {
            try {
              const { data: supabaseBooks, error: titleError } = await supabase
                .from('books')
                .select('id')
                .eq('title', book.title || '')
                .eq('author', book.author || '')
                .limit(1);
              
              if (!titleError && supabaseBooks && supabaseBooks.length > 0) {
                supabaseBookId = supabaseBooks[0].id;
              }
            } catch (err) {
              console.warn('Error looking up book by title/author:', err);
            }
          }
          
          // If still not found, use backend ID as fallback (for backward compatibility)
          // Note: This will work if reading_lists.book_id is TEXT, not UUID
          if (!supabaseBookId) {
            console.warn(`Could not find Supabase book for backend ID: ${book.id}. Using backend ID as fallback.`);
            supabaseBookId = String(book.id);
          }
          
          // Insert into reading_lists with Supabase book UUID
          // Use list_id if a specific list is selected, otherwise save to default "My Library" (list_id = NULL)
          const insertData: any = {
            user_id: authUser.id, // Use auth user ID from Supabase session
            book_id: supabaseBookId, // Use Supabase book UUID
            status: 'to-read', // Use existing table's status format
            added_at: new Date().toISOString()
          };
          
          // If a specific list is selected (not default), add list_id
          if (targetListId && targetListId !== 'default') {
            insertData.list_id = targetListId;
          }
          // If targetListId is 'default' or null, list_id will be NULL (default "My Library")
          
          const { error } = await supabase
            .from('reading_lists')
            .insert(insertData);
          
          if (error) {
            console.error('Supabase insert error:', error);
            // Log full error details for debugging
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error details:', error.details);
            console.error('Error hint:', error.hint);
            
            // Check if it's a columns parameter error (Supabase client library issue)
            if (error.message?.includes('columns')) {
              // This is likely a Supabase client library bug - the insert might have worked
              console.warn('Supabase columns parameter warning (insert may have succeeded):', error);
              // Don't throw - allow the success path to continue
            } else if (error.code === 'PGRST116' || error.message?.includes('relation')) {
              // If table doesn't exist, use localStorage
              throw new Error('Table not found');
            } else if (error.code === '23503') {
              // Foreign key constraint violation
              console.error('Foreign key constraint violation - user_id might not exist in auth.users');
              throw new Error('Authentication error - please log out and log back in');
            } else if (error.code === '23514') {
              // Check constraint violation
              console.error('Check constraint violation:', error.message);
              throw new Error('Invalid data: ' + (error.message || 'Check constraint failed'));
            } else {
              // Other errors - throw to fallback
              throw error;
            }
          }
          
          // Success with Supabase
          if (onSaveBook) {
            onSaveBook(book);
          }
        } catch (supabaseErr: any) {
          // Fallback to localStorage
          const savedBooksJson = localStorage.getItem(`saved_books_${user.id}`);
          const savedBooks = savedBooksJson ? JSON.parse(savedBooksJson) : [];
          const bookExists = savedBooks.find((b: any) => b.id === book.id);
          if (!bookExists) {
            savedBooks.push({
              ...book,
              status: 'want_to_read',
              addedAt: new Date().toISOString()
            });
            localStorage.setItem(`saved_books_${user.id}`, JSON.stringify(savedBooks));
            if (onSaveBook) {
              onSaveBook(book);
            }
          }
        }
      } else {
        // No session, use localStorage
        const savedBooksJson = localStorage.getItem(`saved_books_${user.id}`);
        const savedBooks = savedBooksJson ? JSON.parse(savedBooksJson) : [];
        const bookExists = savedBooks.find((b: any) => b.id === book.id);
        if (!bookExists) {
          savedBooks.push({
            ...book,
            status: 'want_to_read',
            addedAt: new Date().toISOString()
          });
          localStorage.setItem(`saved_books_${user.id}`, JSON.stringify(savedBooks));
          if (onSaveBook) {
            onSaveBook(book);
          }
        }
      }
    } catch (err) {
      console.error('Error saving book:', err);
    } finally {
      setSaving(false);
    }
  };

  // Utility to get a valid cover image from book object
  function getBookCover(book: any) {
    const defaultCover = "https://images.unsplash.com/photo-1707542989144-3fad4049c9d9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhZnJpY2FuJTIwYm9vayUyMGNvdmVyc3xlbnwxfHx8fDE3NTY2NTM1NDl8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";
    if (book.coverImage && typeof book.coverImage === 'string' && book.coverImage.trim() !== '') return book.coverImage;
    if (book.cover_url && typeof book.cover_url === 'string' && book.cover_url.trim() !== '') return book.cover_url;
    if (book.image_url && typeof book.image_url === 'string' && book.image_url.trim() !== '') return book.image_url;
    return defaultCover;
  }

  // Make the entire card clickable except for interactive elements
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent navigation if clicking on a button, badge, or link
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('.theme-badge') ||
      target.closest('a')
    ) {
      return;
    }
    onBookClick?.(book.id);
  };

  return (
    <Card
      className={`group cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/20 ${isListView ? 'flex' : ''}`}
      onClick={handleCardClick}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${book.title}`}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          onBookClick?.(book.id);
        }
      }}
    >
      <div className={`relative ${isListView ? 'w-32 flex-shrink-0' : 'aspect-[3/4] w-full'}`}>
        <ImageWithFallback
          src={getBookCover(book)}
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
                  className="text-xs bg-background text-foreground theme-badge"
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
            onClick={handleSaveBookClick}
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
              <h3 className="line-clamp-2 group-hover:text-primary transition-colors">
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
          {/* CBC Alignment - expanded for CBC dashboard/list view */}
          {isListView && (
            <>
              {book.cbcAlignment && (
                <div className="flex items-center gap-1 text-xs text-secondary mb-1">
                  <BookOpen className="h-3 w-3" />
                  <span className="font-semibold">CBC Alignment:</span>
                  <span>{book.cbcAlignment}</span>
                </div>
              )}
              {/* Show extra CBC fields if present */}
              {book.grade && (
                <div className="text-xs text-muted-foreground mb-0.5"><span className="font-medium">Grade:</span> {book.grade}</div>
              )}
              {book.learning_area && (
                <div className="text-xs text-muted-foreground mb-0.5"><span className="font-medium">Learning Area:</span> {book.learning_area}</div>
              )}
              {book.strand && (
                <div className="text-xs text-muted-foreground mb-0.5"><span className="font-medium">Strand:</span> {book.strand}</div>
              )}
              {book.sub_strand && (
                <div className="text-xs text-muted-foreground mb-0.5"><span className="font-medium">Sub-strand:</span> {book.sub_strand}</div>
              )}
              {book.competencies && (
                <div className="text-xs text-muted-foreground mb-0.5"><span className="font-medium">Competencies:</span> {Array.isArray(book.competencies) ? book.competencies.join(', ') : book.competencies}</div>
              )}
              {book.notes && (
                <div className="text-xs text-muted-foreground mb-0.5"><span className="font-medium">Notes:</span> {book.notes}</div>
              )}
            </>
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
      
      {/* List Selection Dialog */}
      <Dialog open={showListDialog} onOpenChange={setShowListDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Reading List</DialogTitle>
            <DialogDescription>
              Select which reading list to add "{book.title}" to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="list-select">Reading List</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger id="list-select">
                  <SelectValue placeholder="Select a list" />
                </SelectTrigger>
                <SelectContent>
                  {userLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowListDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSaveBook()}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Add to List'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}