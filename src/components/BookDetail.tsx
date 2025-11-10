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
import { useUser } from "../contexts/UserContext";
import { supabase } from "../utils/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

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
  const { user } = useUser();
  // State for recommendations
  const [recommendedBooks, setRecommendedBooks] = useState<any[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("default");
  const [userLists, setUserLists] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  
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
  
  const handleSaveBook = async (listId?: string) => {
    if (!user || saving) return;
    
    const targetListId = listId || selectedListId;
    setSaving(true);
    setShowListDialog(false);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        try {
          // Get the authenticated user's ID from Supabase session
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) {
            throw new Error('Not authenticated');
          }

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
          
          // If still not found, use backend ID as fallback
          if (!supabaseBookId) {
            console.warn(`Could not find Supabase book for backend ID: ${book.id}. Using backend ID as fallback.`);
            supabaseBookId = String(book.id);
          }
          
          // Insert into reading_lists with Supabase book UUID
          // Use list_id if a specific list is selected, otherwise save to default "My Library" (list_id = NULL)
          const insertData: any = {
            user_id: authUser.id,
            book_id: supabaseBookId,
            status: 'to-read',
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
            if (error.message?.includes('columns')) {
              console.warn('Supabase columns parameter warning (insert may have succeeded):', error);
              alert('Book saved to reading list!');
            } else if (error.code === 'PGRST116' || error.message?.includes('relation')) {
              throw new Error('Table not found');
            } else {
              throw error;
            }
          } else {
            alert('Book saved to reading list!');
          }
        } catch (err: any) {
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
            alert('Book saved to reading list (local storage)!');
          } else {
            alert('Book already saved!');
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
          alert('Book saved to reading list (local storage)!');
        } else {
          alert('Book already saved!');
        }
      }
    } catch (err) {
      console.error('Error saving book:', err);
      alert('Failed to save book');
    } finally {
      setSaving(false);
    }
  };

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
                  {/* Read Full Text - Link to external source if available */}
                  {book.isbn && (
                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={() => {
                        // Try to open in Google Books or Open Library
                        const googleBooksUrl = `https://books.google.com/books?vid=ISBN${book.isbn}`;
                        window.open(googleBooksUrl, '_blank');
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Find Full Text
                    </Button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        if (!user) {
                          alert('Please log in to save books');
                          return;
                        }
                        setShowListDialog(true);
                      }}
                      disabled={saving}
                    >
                      <Heart className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        // Share book
                        if (navigator.share) {
                          navigator.share({
                            title: book.title,
                            text: `Check out "${book.title}" by ${book.author}`,
                            url: window.location.href
                          }).catch(() => {
                            // Fallback to clipboard
                            navigator.clipboard.writeText(window.location.href);
                            alert('Link copied to clipboard!');
                          });
                        } else {
                          // Fallback to clipboard
                          navigator.clipboard.writeText(window.location.href);
                          alert('Link copied to clipboard!');
                        }
                      }}
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  </div>

                  {/* Download Summary - Generate a simple text summary */}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => {
                      // Generate and download a simple summary
                      const summary = `${book.title}\nby ${book.author}\n\n${book.description}\n\nThemes: ${Array.isArray(book.themes) ? book.themes.join(', ') : 'N/A'}`;
                      const blob = new Blob([summary], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${book.title.replace(/[^a-z0-9]/gi, '_')}_summary.txt`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                  >
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
    </div>
  );
}