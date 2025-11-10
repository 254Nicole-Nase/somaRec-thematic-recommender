import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { BookCard } from "./BookCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Alert, AlertDescription } from "./ui/alert";
import { 
  Heart, 
  Plus, 
  BookOpen, 
  Trash2, 
  Edit3,
  Star,
  Clock,
  CheckCircle,
  Loader2
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { supabase } from "../utils/supabase/client";

interface ReadingList {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  createdAt: string;
  bookCount: number;
}

interface SavedBook {
  id: string;
  bookId: string;
  listId: string;
  status: "want_to_read" | "reading" | "completed";
  rating?: number;
  notes?: string;
  addedAt: string;
  // Book details
  title: string;
  author: string;
  year: number;
  genre: string;
  language: string;
  themes: string[];
  coverImage?: string;
}

export function ReadingList({ onThemeClick, onBookClick }: { 
  onThemeClick?: (theme: string) => void;
  onBookClick?: (bookId: string) => void;
}) {
  const { user } = useUser();
  const [lists, setLists] = useState<ReadingList[]>([]);
  const [savedBooks, setSavedBooks] = useState<SavedBook[]>([]);
  const [selectedList, setSelectedList] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all"); // Track selected status tab
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Create list dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newListForm, setNewListForm] = useState({
    name: "",
    description: "",
    isPublic: false
  });

  useEffect(() => {
    if (user) {
      loadUserLists();
      loadSavedBooks();
    }
  }, [user, selectedList, selectedStatus]);

  const loadUserLists = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Get the authenticated user's ID from Supabase session
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        return;
      }

      // Fetch reading list collections (where name is not null and book_id is null)
      const { data, error } = await supabase
        .from('reading_lists')
        .select('id, name, description, is_public, created_at, user_id')
        .eq('user_id', authUser.id) // Use auth user ID from Supabase session
        .not('name', 'is', null) // Only get list collections
        .is('book_id', null); // Ensure book_id is null (list collections, not book entries)
      
      if (error) {
        // Check if it's a table not found error or missing columns
        if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist') || error.code === '42P01') {
          setError('Reading lists feature requires Supabase table setup. Please run the migration in Supabase Dashboard. See SUPABASE_UPDATE_GUIDE.md for details.');
          setLists([]);
        } else if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          // Table exists but missing columns - need to run migration
          setError('Table needs to be updated. Please run migration 002_update_reading_lists.sql. See SUPABASE_UPDATE_GUIDE.md for details.');
          setLists([]);
        } else {
          console.error('Supabase error:', error);
          setError('Failed to load reading lists: ' + (error.message || error.code || 'Unknown error'));
          setLists([]);
        }
      } else {
        // Map database snake_case to frontend camelCase
        const mappedLists = (data || []).map((list: any) => ({
          id: list.id,
          name: list.name,
          description: list.description,
          isPublic: list.is_public || false,
          createdAt: list.created_at || new Date().toISOString(),
          bookCount: 0 // Will be calculated separately if needed
        }));
        
        // Always add "My Library" as the default list (books with list_id IS NULL)
        const defaultList = {
          id: 'default',
          name: 'My Library',
          description: 'All my saved books',
          isPublic: false,
          createdAt: new Date().toISOString(),
          bookCount: 0
        };
        
        // Put "My Library" first, then other lists
        setLists([defaultList, ...mappedLists]);
      }
    } catch (err: any) {
      console.error('Error loading lists:', err);
      setError('Failed to load reading lists. Please ensure Supabase tables are set up.');
      setLists([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedBooks = async (showLoading: boolean = true) => {
    if (!user) return;

    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Fetch book entries from Supabase (where book_id is not null)
      try {
        // Get the authenticated user's ID from Supabase session
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          if (showLoading) {
            setLoading(false);
          }
          return;
        }

        // Fetch book entries from reading_lists table
        // Note: The existing table uses uuid for book_id, and status values: 'to-read', 'reading', 'completed'
        let query = supabase
          .from('reading_lists')
          .select('id, user_id, book_id, status, added_at, list_id')
          .eq('user_id', authUser.id) // Use auth user ID from Supabase session
          .not('book_id', 'is', null); // Only get book entries
        
        if (selectedList !== 'all') {
          // If a specific list is selected, filter by list_id
          if (selectedList === 'default') {
            // Default "My Library" - books with list_id IS NULL
            query = query.is('list_id', null);
          } else {
            // Specific list - filter by list_id
            query = query.eq('list_id', selectedList);
          }
        }
        // If selectedList === 'all', show all books (no additional filter)
        
        const { data: bookEntries, error } = await query;
        
        if (error) {
          // If Supabase table doesn't exist, try localStorage fallback
          if (error.code === 'PGRST116' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
            // Fallback to localStorage
            const savedBooksJson = localStorage.getItem(`saved_books_${user.id}`);
            if (savedBooksJson) {
              setSavedBooks(JSON.parse(savedBooksJson));
            } else {
              setSavedBooks([]);
            }
          } else {
            setError('Failed to load saved books: ' + error.message);
            setSavedBooks([]);
          }
        } else if (bookEntries && bookEntries.length > 0) {
          // Fetch book details from Supabase books table (using UUIDs)
          const bookIds = bookEntries.map((entry: any) => entry.book_id).filter(Boolean);
          
          // Fetch books from Supabase books table
          const { data: supabaseBooks, error: booksError } = await supabase
            .from('books')
            .select('id, title, author, description, cover_url, published_year, isbn10, isbn13')
            .in('id', bookIds);
          
          if (booksError) {
            console.error('Error fetching books from Supabase:', booksError);
            setError('Failed to load book details: ' + booksError.message);
            setSavedBooks([]);
            if (showLoading) {
              setLoading(false);
            }
            return;
          }
          
          // Create a map of book_id -> book details for quick lookup
          const booksMap = new Map();
          if (supabaseBooks) {
            supabaseBooks.forEach((book: any) => {
              booksMap.set(book.id, book);
            });
          }
          
          // Also fetch from backend API as fallback for books not in Supabase
          const API_URL = (import.meta as any).env.VITE_API_URL || "http://localhost:5000";
          let backendBooks: any[] = [];
          try {
            const allBooksResponse = await fetch(`${API_URL}/api/books`);
            if (allBooksResponse.ok) {
              backendBooks = await allBooksResponse.json();
            }
          } catch (err) {
            console.warn('Could not fetch backend books:', err);
          }
          
          // Map book entries to full book details
          // Note: Existing table uses 'to-read', 'reading', 'completed' for status
          const savedBooks = bookEntries
            .map((entry: any) => {
              // First try to find in Supabase books
              let book = booksMap.get(entry.book_id);
              
              // If not found in Supabase, try backend books (fallback)
              if (!book) {
                book = backendBooks.find((b: any) => {
                  // Try matching by legacy_item_id if available
                  return String(b.id) === String(entry.book_id);
                });
              }
              
              if (book) {
                // Map status from existing table format to frontend format
                let status: 'want_to_read' | 'reading' | 'completed' = 'want_to_read';
                if (entry.status === 'reading') status = 'reading';
                else if (entry.status === 'completed') status = 'completed';
                else if (entry.status === 'to-read') status = 'want_to_read';
                
                // Map Supabase book fields to frontend format
                const mappedBook = {
                  id: entry.id,
                  bookId: entry.book_id,
                  listId: entry.list_id || 'default', // Use actual list_id, or 'default' if NULL
                  status: status,
                  rating: undefined, // Not in existing table
                  notes: undefined, // Not in existing table
                  addedAt: entry.added_at || new Date().toISOString(),
                  // Map Supabase book fields
                  title: book.title || '',
                  author: book.author || '',
                  description: book.description || '',
                  coverImage: book.cover_url || book.image_url || '',
                  year: book.published_year || book.pubdate ? new Date(book.pubdate).getFullYear() : new Date().getFullYear(),
                  genre: book.genre || 'Unknown',
                  language: book.language || 'English',
                  themes: Array.isArray(book.themes) ? book.themes : (book.themes ? [book.themes] : []),
                  isbn10: book.isbn10 || '',
                  isbn13: book.isbn13 || ''
                };
                
                return mappedBook;
              }
              return null;
            })
            .filter((b: any) => b !== null);
            
            setSavedBooks(savedBooks);
        } else {
          // No book entries found
          setSavedBooks([]);
        }
      } catch (supabaseErr) {
        // Fallback to localStorage
        const savedBooksJson = localStorage.getItem(`saved_books_${user.id}`);
        if (savedBooksJson) {
          setSavedBooks(JSON.parse(savedBooksJson));
        } else {
          setSavedBooks([]);
        }
      }
    } catch (err) {
      console.error('Error loading saved books:', err);
      setSavedBooks([]);
    } finally {
      setLoading(false);
    }
  };

  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      // Get the authenticated user's ID from Supabase session
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setError('You must be authenticated to create reading lists');
        setLoading(false);
        return;
      }

      // Create a new reading list collection
      // Use authUser.id which is guaranteed to exist in auth.users
      const { data, error } = await supabase
        .from('reading_lists')
        .insert([
          {
            name: newListForm.name,
            description: newListForm.description,
            is_public: newListForm.isPublic,
            user_id: authUser.id, // Use auth user ID from Supabase session
            book_id: null, // This is a list collection, not a book entry
            status: 'to-read' // Set a default status (required by constraint, but won't be used for lists)
          }
        ])
        .select();
      
      if (error) {
        console.error('Supabase error:', error);
        // Check if it's a missing column error
        if (error.message?.includes('column') || error.message?.includes('does not exist')) {
          setError('Table needs to be updated. Please run migration 002_update_reading_lists.sql. See SUPABASE_UPDATE_GUIDE.md for details.');
        } else {
          setError('Failed to create reading list: ' + (error.message || error.code || 'Unknown error'));
        }
      } else {
        // Map database response to frontend format
        const mappedLists = (data || []).map((list: any) => ({
          id: list.id,
          name: list.name,
          description: list.description,
          isPublic: list.is_public || false,
          createdAt: list.created_at || list.added_at || new Date().toISOString(),
          bookCount: 0
        }));
        setLists(prev => [...prev, ...mappedLists]);
        setNewListForm({ name: "", description: "", isPublic: false });
        setShowCreateDialog(false);
        setSuccess('Reading list created successfully!');
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Error creating list:', err);
      setError('Failed to create reading list');
    } finally {
      setLoading(false);
    }
  };

  const updateBookStatus = async (bookId: string, status: SavedBook['status'], rating?: number) => {
    if (!user) return;

    // Optimistically update UI first
    setSavedBooks(prev => prev.map(book => 
      book.id === bookId ? { ...book, status, rating } : book
    ));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Revert if no session (without showing loading)
        loadSavedBooks(false);
        return;
      }

      // Map frontend status to database status format
      let dbStatus = 'to-read';
      if (status === 'reading') dbStatus = 'reading';
      else if (status === 'completed') dbStatus = 'completed';
      
      const { data, error } = await supabase
        .from('reading_lists')
        .update({ status: dbStatus }) // Note: rating not in existing table
        .eq('id', bookId)
        .select();
      
      if (error) {
        console.error('Error updating book status:', error);
        setError('Failed to update book status');
        // Reload to revert optimistic update (without showing loading)
        loadSavedBooks(false);
      } else {
        setSuccess(`Book marked as ${status.replace('_', ' ')}`);
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Error updating book status:', err);
      setError('Failed to update book status');
      // Reload to revert optimistic update (without showing loading)
      loadSavedBooks(false);
    }
  };

  const removeFromList = async (bookId: string) => {
    if (!user) return;

    // Optimistically update UI first (instant feedback)
    setSavedBooks(prev => prev.filter(book => book.id !== bookId));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Revert if no session - reload without showing loading
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: bookEntries } = await supabase
            .from('reading_lists')
            .select('id, user_id, book_id, status, added_at')
            .eq('user_id', authUser.id)
            .not('book_id', 'is', null);
          
          if (bookEntries && bookEntries.length > 0) {
            // Reload books silently
            const bookIds = bookEntries.map((entry: any) => entry.book_id).filter(Boolean);
            const { data: supabaseBooks } = await supabase
              .from('books')
              .select('id, title, author, description, cover_url, published_year, isbn10, isbn13')
              .in('id', bookIds);
            
            if (supabaseBooks) {
              const booksMap = new Map();
              supabaseBooks.forEach((book: any) => {
                booksMap.set(book.id, book);
              });
              
              const reloadedBooks = bookEntries
                .map((entry: any) => {
                  const book = booksMap.get(entry.book_id);
                  if (book) {
                    let status: 'want_to_read' | 'reading' | 'completed' = 'want_to_read';
                    if (entry.status === 'reading') status = 'reading';
                    else if (entry.status === 'completed') status = 'completed';
                    
                    return {
                      id: entry.id,
                      bookId: entry.book_id,
                      listId: 'default',
                      status: status,
                      rating: undefined,
                      notes: undefined,
                      addedAt: entry.added_at || new Date().toISOString(),
                      title: book.title || '',
                      author: book.author || '',
                      description: book.description || '',
                      coverImage: book.cover_url || '',
                      year: book.published_year || new Date().getFullYear(),
                      genre: 'Unknown',
                      language: 'English',
                      themes: [],
                      isbn10: book.isbn10 || '',
                      isbn13: book.isbn13 || ''
                    };
                  }
                  return null;
                })
                .filter((b: any) => b !== null);
              
              setSavedBooks(reloadedBooks);
            }
          }
        }
        return;
      }

      const { error } = await supabase
        .from('reading_lists')
        .delete()
        .eq('id', bookId);
      
      if (error) {
        console.error('Error removing book:', error);
        setError('Failed to remove book from list');
        // Reload silently to revert optimistic update (without showing loading)
        loadSavedBooks(false);
      } else {
        setSuccess('Book removed from library');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Error removing book:', err);
      setError('Failed to remove book from list');
      // Reload silently to revert optimistic update (without showing loading)
      loadSavedBooks(false);
    }
  };

  const getStatusIcon = (status: SavedBook['status']) => {
    switch (status) {
      case 'want_to_read': return <Heart className="h-4 w-4" />;
      case 'reading': return <Clock className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: SavedBook['status']) => {
    switch (status) {
      case 'want_to_read': return 'secondary';
      case 'reading': return 'default';
      case 'completed': return 'outline';
    }
  };

  // Filter books by selected list and status
  let filteredBooks = selectedList === 'all' 
    ? savedBooks 
    : savedBooks.filter(book => {
        // For 'default' list, match books with listId === 'default' or null/undefined
        if (selectedList === 'default') {
          return !book.listId || book.listId === 'default';
        }
        // For specific lists, match by listId
        return book.listId === selectedList;
      });
  
  // Filter by status if a status tab is selected
  if (selectedStatus !== 'all') {
    filteredBooks = filteredBooks.filter(book => book.status === selectedStatus);
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-12 text-center">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl mb-2">Sign In Required</h3>
            <p className="text-muted-foreground">
              Please sign in to access your reading lists and saved books.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl mb-2">My Library</h1>
            <p className="text-muted-foreground">
              Manage your reading lists and track your literary journey
            </p>
          </div>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New List
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Reading List</DialogTitle>
              </DialogHeader>
              <form onSubmit={createList} className="space-y-4">
                <div>
                  <Label htmlFor="list-name">List Name</Label>
                  <Input
                    id="list-name"
                    value={newListForm.name}
                    onChange={(e) => setNewListForm({...newListForm, name: e.target.value})}
                    placeholder="e.g., Kenyan Classics, CBC Grade 7..."
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="list-description">Description (Optional)</Label>
                  <Textarea
                    id="list-description"
                    value={newListForm.description}
                    onChange={(e) => setNewListForm({...newListForm, description: e.target.value})}
                    placeholder="Describe what this list is about..."
                  />
                </div>
                <Button type="submit" className="w-full">Create List</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Lists Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <h3>Reading Lists</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant={selectedList === 'all' ? 'default' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setSelectedList('all')}
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  All Books ({savedBooks.length})
                </Button>
                
                {lists.map(list => (
                  <Button
                    key={list.id}
                    variant={selectedList === list.id ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setSelectedList(list.id)}
                  >
                    <Heart className="h-4 w-4 mr-2" />
                    {list.name} ({list.bookCount})
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Books Content */}
          <div className="lg:col-span-3">
            <Tabs value={selectedStatus} onValueChange={setSelectedStatus} className="space-y-6">
              <TabsList>
                <TabsTrigger value="all">All Books</TabsTrigger>
                <TabsTrigger value="want_to_read">Want to Read</TabsTrigger>
                <TabsTrigger value="reading">Currently Reading</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                {loading ? (
                  <Card className="p-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p>Loading your books...</p>
                  </Card>
                ) : filteredBooks.length > 0 ? (
                  <div className="space-y-4">
                    {filteredBooks.map(book => (
                      <Card key={book.id} className="p-4">
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h3 className="font-semibold">{book.title}</h3>
                                <p className="text-muted-foreground">by {book.author}</p>
                              </div>
                              <Badge 
                                variant={getStatusColor(book.status)}
                                className="flex items-center gap-1"
                              >
                                {getStatusIcon(book.status)}
                                {book.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            
                            <div className="flex flex-wrap gap-1 mb-3">
                              {book.themes.slice(0, 3).map(theme => (
                                <Badge 
                                  key={theme}
                                  variant="outline"
                                  className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground"
                                  onClick={() => onThemeClick?.(theme)}
                                >
                                  {theme}
                                </Badge>
                              ))}
                            </div>

                            {book.rating && (
                              <div className="flex items-center gap-1 mb-2">
                                {[...Array(5)].map((_, i) => (
                                  <Star 
                                    key={i}
                                    className={`h-4 w-4 ${i < book.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                                  />
                                ))}
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={async () => {
                                  // Fetch full book details and pass to onBookClick
                                  // The book.bookId is a Supabase UUID, so we need to fetch it
                                  try {
                                    const { data: supabaseBook } = await supabase
                                      .from('books')
                                      .select('*')
                                      .eq('id', book.bookId)
                                      .single();
                                    
                                    if (supabaseBook) {
                                      // Map to frontend format and pass to onBookClick
                                      const mappedBook = {
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
                                      // Pass the book object directly if possible, otherwise use ID
                                      onBookClick?.(supabaseBook.id);
                                    } else {
                                      // Fallback: try backend API
                                      const API_URL = (import.meta as any).env.VITE_API_URL || "http://localhost:5000";
                                      const response = await fetch(`${API_URL}/api/books`);
                                      if (response.ok) {
                                        const backendBooks = await response.json();
                                        const backendBook = backendBooks.find((b: any) => 
                                          b.title === book.title && b.author === book.author
                                        );
                                        if (backendBook) {
                                          onBookClick?.(backendBook.id);
                                        } else {
                                          onBookClick?.(book.bookId);
                                        }
                                      } else {
                                        onBookClick?.(book.bookId);
                                      }
                                    }
                                  } catch (err) {
                                    console.error('Error fetching book details:', err);
                                    onBookClick?.(book.bookId);
                                  }
                                }}
                              >
                                View Details
                              </Button>
                              
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => updateBookStatus(book.id, 'reading')}
                              >
                                <Clock className="h-3 w-3 mr-1" />
                                Reading
                              </Button>
                              
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => updateBookStatus(book.id, 'completed')}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Done
                              </Button>
                              
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => removeFromList(book.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="p-12 text-center">
                    <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl mb-2">No Books Yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start building your library by saving books you're interested in.
                    </p>
                    <Button onClick={() => window.history.back()}>
                      Browse Books
                    </Button>
                  </Card>
                )}
              </TabsContent>

              {/* Similar content for other tabs with filtered books */}
              {['want_to_read', 'reading', 'completed'].map(status => (
                <TabsContent key={status} value={status}>
                  <div className="space-y-4">
                    {filteredBooks.filter(book => book.status === status).map(book => (
                      <Card key={book.id} className="p-4">
                        {/* Same card content as above */}
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h3 className="font-semibold">{book.title}</h3>
                                <p className="text-muted-foreground">by {book.author}</p>
                              </div>
                              <Badge variant={getStatusColor(book.status)} className="flex items-center gap-1">
                                {getStatusIcon(book.status)}
                                {book.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            
                            <div className="flex flex-wrap gap-1 mb-3">
                              {book.themes.slice(0, 3).map(theme => (
                                <Badge 
                                  key={theme}
                                  variant="outline"
                                  className="text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground"
                                  onClick={() => onThemeClick?.(theme)}
                                >
                                  {theme}
                                </Badge>
                              ))}
                            </div>

                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={async () => {
                                  // Fetch full book details and pass to onBookClick
                                  try {
                                    const { data: supabaseBook } = await supabase
                                      .from('books')
                                      .select('*')
                                      .eq('id', book.bookId)
                                      .single();
                                    
                                    if (supabaseBook) {
                                      onBookClick?.(supabaseBook.id);
                                    } else {
                                      // Fallback: try backend API
                                      const API_URL = (import.meta as any).env.VITE_API_URL || "http://localhost:5000";
                                      const response = await fetch(`${API_URL}/api/books`);
                                      if (response.ok) {
                                        const backendBooks = await response.json();
                                        const backendBook = backendBooks.find((b: any) => 
                                          b.title === book.title && b.author === book.author
                                        );
                                        if (backendBook) {
                                          onBookClick?.(backendBook.id);
                                        } else {
                                          onBookClick?.(book.bookId);
                                        }
                                      } else {
                                        onBookClick?.(book.bookId);
                                      }
                                    }
                                  } catch (err) {
                                    console.error('Error fetching book details:', err);
                                    onBookClick?.(book.bookId);
                                  }
                                }}
                              >
                                View Details
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => removeFromList(book.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}