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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
  }, [user]);

  const loadUserLists = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('reading_lists')
        .select('*')
        .eq('user_id', user.id);
      if (error) {
        setError('Failed to load reading lists');
        setLists([]);
      } else {
        setLists(data || []);
      }
    } catch (err) {
      console.error('Error loading lists:', err);
      setError('Failed to load reading lists');
    }
  };

  const loadSavedBooks = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let query = supabase
        .from('reading_lists')
        .select('*, books:book_id(*)')
        .eq('user_id', user.id);
      if (selectedList !== 'all') {
        query = query.eq('id', selectedList);
      }
      const { data, error } = await query;
      if (error) {
        setError('Failed to load saved books');
        setSavedBooks([]);
      } else {
        // Flatten books from reading lists
        const books = (data || []).flatMap((list: any) => list.books ? [list.books] : []);
        setSavedBooks(books);
      }
    } catch (err) {
      console.error('Error loading saved books:', err);
    } finally {
      setLoading(false);
    }
  };

  const createList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('reading_lists')
        .insert([
          {
            name: newListForm.name,
            description: newListForm.description,
            isPublic: newListForm.isPublic,
            user_id: user.id
          }
        ])
        .select();
      if (error) {
        setError('Failed to create reading list');
      } else {
        setLists(prev => [...prev, ...(data || [])]);
        setNewListForm({ name: "", description: "", isPublic: false });
        setShowCreateDialog(false);
      }
    } catch (err) {
      console.error('Error creating list:', err);
      setError('Failed to create reading list');
    }
  };

  const updateBookStatus = async (bookId: string, status: SavedBook['status'], rating?: number) => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('reading_lists')
        .update({ status, rating })
        .eq('id', bookId)
        .select();
      if (error) {
        setError('Failed to update book status');
      } else {
        setSavedBooks(prev => prev.map(book => 
          book.id === bookId ? { ...book, status, rating } : book
        ));
      }
    } catch (err) {
      console.error('Error updating book status:', err);
    }
  };

  const removeFromList = async (bookId: string) => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('reading_lists')
        .delete()
        .eq('id', bookId);
      if (error) {
        setError('Failed to remove book from list');
      } else {
        setSavedBooks(prev => prev.filter(book => book.id !== bookId));
      }
    } catch (err) {
      console.error('Error removing book:', err);
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

  const filteredBooks = selectedList === 'all' 
    ? savedBooks 
    : savedBooks.filter(book => book.listId === selectedList);

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
            <Tabs defaultValue="all" className="space-y-6">
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
                              <Button size="sm" onClick={() => onBookClick?.(book.bookId)}>
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
                              <Button size="sm" onClick={() => onBookClick?.(book.bookId)}>
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