import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Alert, AlertDescription } from "../ui/alert";
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Upload, 
  Users, 
  BookOpen,
  Shield,
  Settings,
  Eye,
  EyeOff,
  Loader2,
  Check,
  X
} from "lucide-react";
import { useUser } from "../../contexts/UserContext";
import { supabase } from "../../utils/supabase/client";

interface Book {
  id: string;
  title: string;
  author: string;
  year: number;
  genre: string;
  language: string;
  themes: string[];
  cbcAlignment?: string;
  description: string;
  coverImage?: string;
  status: 'published' | 'draft' | 'pending';
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'reader' | 'admin';
  createdAt: string;
  lastActive: string;
  isActive: boolean;
}

export function AdminPanel() {
  const { user, isAdmin } = useUser();
  const [books, setBooks] = useState<Book[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Book form state
  const [showBookDialog, setShowBookDialog] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookForm, setBookForm] = useState({
    title: "",
    author: "",
    year: new Date().getFullYear(),
    genre: "",
    language: "English",
    themes: [] as string[],
    cbcAlignment: "",
    description: "",
    coverImage: "",
    status: "draft" as Book['status']
  });

  const availableThemes = [
    "Postcolonial Identity",
    "Environmental Stewardship", 
    "Ubuntu Philosophy",
    "Gender & Society",
    "Cultural Heritage",
    "Education & Growth",
    "Economic Development",
    "Social Justice",
    "Family Dynamics",
    "Rural-Urban Migration",
    "Political Corruption",
    "Moral Integrity"
  ];

  useEffect(() => {
    if (isAdmin) {
      loadBooks();
      loadUsers();
    }
  }, [isAdmin]);

  const loadBooks = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/admin/books`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBooks(data.books || []);
      }
    } catch (err) {
      console.error('Error loading books:', err);
      setError('Failed to load books');
    }
  };

  const loadUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/admin/users`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const url = editingBook 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/admin/books/${editingBook.id}`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/admin/books`;

      const response = await fetch(url, {
        method: editingBook ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(bookForm)
      });

      if (response.ok) {
        const data = await response.json();
        if (editingBook) {
          setBooks(prev => prev.map(book => book.id === editingBook.id ? data.book : book));
          setSuccess('Book updated successfully');
        } else {
          setBooks(prev => [...prev, data.book]);
          setSuccess('Book created successfully');
        }
        resetBookForm();
        setShowBookDialog(false);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save book');
      }
    } catch (err) {
      console.error('Error saving book:', err);
      setError('Failed to save book');
    }
  };

  const deleteBook = async (bookId: string) => {
    if (!isAdmin || !confirm('Are you sure you want to delete this book?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/admin/books/${bookId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        setBooks(prev => prev.filter(book => book.id !== bookId));
        setSuccess('Book deleted successfully');
      }
    } catch (err) {
      console.error('Error deleting book:', err);
      setError('Failed to delete book');
    }
  };

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    if (!isAdmin) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/make-server-8f661324/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ isActive })
      });

      if (response.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive } : u));
        setSuccess(`User ${isActive ? 'activated' : 'deactivated'} successfully`);
      }
    } catch (err) {
      console.error('Error updating user status:', err);
      setError('Failed to update user status');
    }
  };

  const editBook = (book: Book) => {
    setEditingBook(book);
    setBookForm({
      title: book.title,
      author: book.author,
      year: book.year,
      genre: book.genre,
      language: book.language,
      themes: book.themes,
      cbcAlignment: book.cbcAlignment || "",
      description: book.description,
      coverImage: book.coverImage || "",
      status: book.status
    });
    setShowBookDialog(true);
  };

  const resetBookForm = () => {
    setEditingBook(null);
    setBookForm({
      title: "",
      author: "",
      year: new Date().getFullYear(),
      genre: "",
      language: "English",
      themes: [],
      cbcAlignment: "",
      description: "",
      coverImage: "",
      status: "draft"
    });
  };

  const toggleTheme = (theme: string) => {
    setBookForm(prev => ({
      ...prev,
      themes: prev.themes.includes(theme)
        ? prev.themes.filter(t => t !== theme)
        : [...prev.themes, theme]
    }));
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-12 text-center">
            <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              You need administrator privileges to access this page.
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
            <h1 className="text-3xl mb-2">Admin Panel</h1>
            <p className="text-muted-foreground">
              Manage books, users, and platform content
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              <Shield className="h-3 w-3 mr-1" />
              Administrator
            </Badge>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="books" className="space-y-6">
          <TabsList>
            <TabsTrigger value="books">
              <BookOpen className="h-4 w-4 mr-2" />
              Books Management
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              User Management
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <Settings className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Books Management */}
          <TabsContent value="books">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl">Books ({books.length})</h2>
                <Dialog open={showBookDialog} onOpenChange={setShowBookDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={resetBookForm}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Book
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingBook ? 'Edit Book' : 'Add New Book'}
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={saveBook} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="title">Title</Label>
                          <Input
                            id="title"
                            value={bookForm.title}
                            onChange={(e) => setBookForm({...bookForm, title: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="author">Author</Label>
                          <Input
                            id="author"
                            value={bookForm.author}
                            onChange={(e) => setBookForm({...bookForm, author: e.target.value})}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="year">Year</Label>
                          <Input
                            id="year"
                            type="number"
                            value={bookForm.year}
                            onChange={(e) => setBookForm({...bookForm, year: parseInt(e.target.value)})}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="genre">Genre</Label>
                          <Input
                            id="genre"
                            value={bookForm.genre}
                            onChange={(e) => setBookForm({...bookForm, genre: e.target.value})}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="language">Language</Label>
                          <Select value={bookForm.language} onValueChange={(value: string) => setBookForm({...bookForm, language: value})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="English">English</SelectItem>
                              <SelectItem value="Kiswahili">Kiswahili</SelectItem>
                              <SelectItem value="Kikuyu">Kikuyu</SelectItem>
                              <SelectItem value="Luo">Luo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label>Themes</Label>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {availableThemes.map(theme => (
                            <div key={theme} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={bookForm.themes.includes(theme)}
                                onChange={() => toggleTheme(theme)}
                                className="rounded"
                              />
                              <label className="text-sm">{theme}</label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="cbcAlignment">CBC Alignment</Label>
                        <Input
                          id="cbcAlignment"
                          value={bookForm.cbcAlignment}
                          onChange={(e) => setBookForm({...bookForm, cbcAlignment: e.target.value})}
                          placeholder="e.g., Form 3 Literature"
                        />
                      </div>

                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={bookForm.description}
                          onChange={(e) => setBookForm({...bookForm, description: e.target.value})}
                          rows={3}
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="coverImage">Cover Image URL</Label>
                        <Input
                          id="coverImage"
                          value={bookForm.coverImage}
                          onChange={(e) => setBookForm({...bookForm, coverImage: e.target.value})}
                          placeholder="https://..."
                        />
                      </div>

                      <div>
                        <Label htmlFor="status">Status</Label>
                        <Select value={bookForm.status} onValueChange={(value: Book['status']) => setBookForm({...bookForm, status: value})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="published">Published</SelectItem>
                            <SelectItem value="pending">Pending Review</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button type="submit" className="w-full">
                        {editingBook ? 'Update Book' : 'Create Book'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-4">
                {loading ? (
                  <Card className="p-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                    <p>Loading books...</p>
                  </Card>
                ) : books.length > 0 ? (
                  books.map(book => (
                    <Card key={book.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{book.title}</h3>
                              <Badge 
                                variant={book.status === 'published' ? 'default' : 'secondary'}
                              >
                                {book.status}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground mb-2">by {book.author} ({book.year})</p>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {book.themes.slice(0, 3).map(theme => (
                                <Badge key={theme} variant="outline" className="text-xs">
                                  {theme}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {book.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => editBook(book)}
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteBook(book.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="p-12 text-center">
                    <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl mb-2">No Books Yet</h3>
                    <p className="text-muted-foreground">
                      Start by adding your first book to the platform.
                    </p>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          {/* User Management */}
          <TabsContent value="users">
            <div className="space-y-6">
              <h2 className="text-xl">Users ({users.length})</h2>
              <div className="space-y-4">
                {users.map(user => (
                  <Card key={user.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{user.name}</h3>
                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                              {user.role}
                            </Badge>
                            <Badge variant={user.isActive ? 'default' : 'destructive'}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground">{user.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Joined: {new Date(user.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleUserStatus(user.id, !user.isActive)}
                          >
                            {user.isActive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <h3>Total Books</h3>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{books.length}</div>
                  <p className="text-muted-foreground text-sm">
                    {books.filter(b => b.status === 'published').length} published
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <h3>Total Users</h3>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{users.length}</div>
                  <p className="text-muted-foreground text-sm">
                    {users.filter(u => u.isActive).length} active
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <h3>Administrators</h3>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {users.filter(u => u.role === 'admin').length}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Platform administrators
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}