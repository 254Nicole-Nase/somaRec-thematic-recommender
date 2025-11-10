import * as React from "react";
import { DataTable, Column } from "./DataTable";
import { DataTableToolbar, FilterOption } from "./DataTableToolbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Edit3, Trash2, Eye, Plus, Loader2 } from "lucide-react";
import { exportToCSV } from "../../utils/exportToCSV";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../contexts/UserContext";

interface Book {
  id: string;
  title: string;
  author: string;
  published_year?: number;
  genre?: string;
  language?: string;
  description?: string;
  cover_url?: string;
  isbn10?: string;
  isbn13?: string;
  legacy_item_id?: number;
  themes?: string[];
  status?: "published" | "draft" | "pending";
  created_at?: string;
  updated_at?: string;
}

export function BooksManagement() {
  const { user, loading: userLoading } = useUser();
  const [books, setBooks] = React.useState<Book[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchValue, setSearchValue] = React.useState("");
  const [selectedFilters, setSelectedFilters] = React.useState<Record<string, string>>({});
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = React.useState<string>("");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc" | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [showBookDialog, setShowBookDialog] = React.useState(false);
  const [editingBook, setEditingBook] = React.useState<Book | null>(null);
  const [availableThemes, setAvailableThemes] = React.useState<string[]>([]);

  // Form state
  const [bookForm, setBookForm] = React.useState({
    title: "",
    author: "",
    published_year: new Date().getFullYear(),
    genre: "",
    language: "English",
    description: "",
    cover_url: "",
    isbn10: "",
    isbn13: "",
    themes: [] as string[],
    status: "draft" as Book["status"],
  });

  // Load books from Supabase
  const loadBooks = React.useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading books:", error);
        // Fallback to backend API if Supabase fails
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
        const response = await fetch(`${API_URL}/api/books`);
        if (response.ok) {
          const data = await response.json();
          const mappedBooks = (data || []).map((book: any) => ({
            id: book.id || String(Math.random()),
            title: book.title || "",
            author: book.author || "",
            published_year: book.year || (book.pubdate ? new Date(book.pubdate).getFullYear() : new Date().getFullYear()),
            genre: book.genre || "",
            language: book.language || "English",
            description: book.description || "",
            cover_url: book.image_url || book.cover_url || "",
            themes: Array.isArray(book.themes) ? book.themes : book.themes ? [book.themes] : [],
            status: book.status || "published",
          }));
          setBooks(mappedBooks);
        }
      } else {
        setBooks(data || []);
      }
    } catch (err) {
      console.error("Error loading books:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load themes from Supabase
  const loadThemes = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("themes")
        .select("name")
        .order("name");

      if (!error && data) {
        const themeNames = data.map((t: any) => t.name || t.theme || t.title || t.value || "").filter(Boolean);
        setAvailableThemes(themeNames);
      } else {
        // Fallback themes
        setAvailableThemes([
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
          "Moral Integrity",
        ]);
      }
    } catch (err) {
      console.error("Error loading themes:", err);
    }
  }, []);

  React.useEffect(() => {
    // Only load data after user authentication is complete
    if (!userLoading && user) {
      loadBooks();
      loadThemes();
    }
  }, [userLoading, user, loadBooks, loadThemes]);

  // Filter and search books
  const filteredBooks = React.useMemo(() => {
    let filtered = [...books];

    // Search filter
    if (searchValue) {
      const search = searchValue.toLowerCase();
      filtered = filtered.filter(
        (book) =>
          book.title?.toLowerCase().includes(search) ||
          book.author?.toLowerCase().includes(search) ||
          book.genre?.toLowerCase().includes(search) ||
          book.language?.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (selectedFilters.status) {
      filtered = filtered.filter((book) => book.status === selectedFilters.status);
    }

    // Genre filter
    if (selectedFilters.genre) {
      filtered = filtered.filter((book) => book.genre === selectedFilters.genre);
    }

    // Language filter
    if (selectedFilters.language) {
      filtered = filtered.filter((book) => book.language === selectedFilters.language);
    }

    // Sorting
    if (sortBy && sortDirection) {
      filtered.sort((a, b) => {
        const column = columns.find((col) => col.id === sortBy);
        if (!column) return 0;

        let aValue: any;
        let bValue: any;

        if (column.accessorFn) {
          aValue = column.accessorFn(a);
          bValue = column.accessorFn(b);
        } else if (column.accessorKey) {
          aValue = a[column.accessorKey as keyof Book];
          bValue = b[column.accessorKey as keyof Book];
        } else {
          return 0;
        }

        if (Array.isArray(aValue)) aValue = aValue.join(", ");
        if (Array.isArray(bValue)) bValue = bValue.join(", ");

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [books, searchValue, selectedFilters, sortBy, sortDirection]);

  // Get unique genres and languages for filters
  const uniqueGenres = React.useMemo(() => {
    const genres = new Set(books.map((b) => b.genre).filter(Boolean));
    return Array.from(genres).sort();
  }, [books]);

  const uniqueLanguages = React.useMemo(() => {
    const languages = new Set(books.map((b) => b.language).filter(Boolean));
    return Array.from(languages).sort();
  }, [books]);

  // Filter options
  const filterOptions: FilterOption[] = React.useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "published", label: "Published" },
          { value: "draft", label: "Draft" },
          { value: "pending", label: "Pending" },
        ],
      },
      {
        key: "genre",
        label: "Genre",
        options: uniqueGenres.map((g) => ({ value: g, label: g })),
      },
      {
        key: "language",
        label: "Language",
        options: uniqueLanguages.map((l) => ({ value: l, label: l })),
      },
    ],
    [uniqueGenres, uniqueLanguages]
  );

  // Handle sort
  const handleSort = (columnId: string, direction: "asc" | "desc" | null) => {
    setSortBy(direction ? columnId : "");
    setSortDirection(direction);
    setPage(1);
  };

  // Handle filter change
  const handleFilterChange = (key: string, value: string) => {
    setSelectedFilters((prev) => {
      const newFilters = { ...prev };
      if (value === "") {
        delete newFilters[key];
      } else {
        newFilters[key] = value;
      }
      return newFilters;
    });
    setPage(1);
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setSelectedFilters({});
    setSearchValue("");
    setPage(1);
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!confirm(`Delete ${selectedRows.size} book(s)?`)) return;

    try {
      const bookIds = Array.from(selectedRows);
      const { error } = await supabase.from("books").delete().in("id", bookIds);

      if (error) {
        console.error("Error deleting books:", error);
        alert("Failed to delete books");
      } else {
        await loadBooks();
        setSelectedRows(new Set());
        console.log(`Deleted ${selectedRows.size} book(s)`);
      }
    } catch (err) {
      console.error("Error deleting books:", err);
      alert("Failed to delete books");
    }
  };

  // Handle export
  const handleExport = () => {
    const dataToExport =
      selectedRows.size > 0
        ? filteredBooks.filter((book) => selectedRows.has(book.id))
        : filteredBooks;

    exportToCSV(
      dataToExport,
      `books-export-${new Date().toISOString().split("T")[0]}.csv`,
      [
        { key: "title", label: "Title" },
        { key: "author", label: "Author" },
        { key: "published_year", label: "Year" },
        { key: "genre", label: "Genre" },
        { key: "language", label: "Language" },
        { key: "status", label: "Status" },
        { key: "themes", label: "Themes" },
      ]
    );
    console.log(`Exported ${dataToExport.length} book(s) to CSV`);
  };

  // Reset form
  const resetBookForm = () => {
    setBookForm({
      title: "",
      author: "",
      published_year: new Date().getFullYear(),
      genre: "",
      language: "English",
      description: "",
      cover_url: "",
      isbn10: "",
      isbn13: "",
      themes: [],
      status: "draft",
    });
    setEditingBook(null);
  };

  // Edit book
  const editBook = (book: Book) => {
    setEditingBook(book);
    setBookForm({
      title: book.title || "",
      author: book.author || "",
      published_year: book.published_year || new Date().getFullYear(),
      genre: book.genre || "",
      language: book.language || "English",
      description: book.description || "",
      cover_url: book.cover_url || "",
      isbn10: book.isbn10 || "",
      isbn13: book.isbn13 || "",
      themes: Array.isArray(book.themes) ? book.themes : [],
      status: book.status || "draft",
    });
    setShowBookDialog(true);
  };

  // Toggle theme
  const toggleTheme = (theme: string) => {
    setBookForm((prev) => ({
      ...prev,
      themes: prev.themes.includes(theme)
        ? prev.themes.filter((t) => t !== theme)
        : [...prev.themes, theme],
    }));
  };

  // Save book
  const saveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const bookData = {
        title: bookForm.title,
        author: bookForm.author,
        published_year: bookForm.published_year,
        genre: bookForm.genre || null,
        language: bookForm.language,
        description: bookForm.description || null,
        cover_url: bookForm.cover_url || null,
        isbn10: bookForm.isbn10 || null,
        isbn13: bookForm.isbn13 || null,
        themes: bookForm.themes.length > 0 ? bookForm.themes : null,
        status: bookForm.status,
      };

      if (editingBook) {
        // Update existing book
        const { error } = await supabase
          .from("books")
          .update(bookData)
          .eq("id", editingBook.id);

        if (error) {
          console.error("Error updating book:", error);
          alert("Failed to update book");
        } else {
          await loadBooks();
          setShowBookDialog(false);
          resetBookForm();
          console.log("Book updated successfully");
        }
      } else {
        // Create new book
        const { error } = await supabase.from("books").insert(bookData);

        if (error) {
          console.error("Error creating book:", error);
          alert("Failed to create book");
        } else {
          await loadBooks();
          setShowBookDialog(false);
          resetBookForm();
          console.log("Book created successfully");
        }
      }
    } catch (err) {
      console.error("Error saving book:", err);
      alert("Failed to save book");
    }
  };

  // Delete book
  const deleteBook = async (id: string) => {
    if (!confirm("Are you sure you want to delete this book?")) return;

    try {
      const { error } = await supabase.from("books").delete().eq("id", id);

      if (error) {
        console.error("Error deleting book:", error);
        alert("Failed to delete book");
      } else {
        await loadBooks();
        console.log("Book deleted successfully");
      }
    } catch (err) {
      console.error("Error deleting book:", err);
      alert("Failed to delete book");
    }
  };

  // Define columns
  const columns: Column<Book>[] = React.useMemo(
    () => [
      {
        id: "title",
        header: "Title",
        accessorKey: "title",
        sortable: true,
        cell: (row) => <div className="font-medium">{row.title || ""}</div>,
      },
      {
        id: "author",
        header: "Author",
        accessorKey: "author",
        sortable: true,
      },
      {
        id: "published_year",
        header: "Year",
        accessorKey: "published_year",
        sortable: true,
      },
      {
        id: "genre",
        header: "Genre",
        accessorKey: "genre",
        sortable: true,
      },
      {
        id: "language",
        header: "Language",
        accessorKey: "language",
        sortable: true,
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        sortable: true,
        cell: (row) => {
          const variant =
            row.status === "published"
              ? "default"
              : row.status === "draft"
              ? "secondary"
              : "outline";
          return (
            <Badge variant={variant} className="capitalize">
              {row.status || "published"}
            </Badge>
          );
        },
      },
      {
        id: "themes",
        header: "Themes",
        accessorFn: (row) => (Array.isArray(row.themes) ? row.themes.join(", ") : ""),
        cell: (row) => {
          const themes = Array.isArray(row.themes) ? row.themes : [];
          return (
            <div className="flex flex-wrap gap-1">
              {themes.slice(0, 2).map((theme) => (
                <Badge key={theme} variant="outline" className="text-xs">
                  {theme}
                </Badge>
              ))}
              {themes.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{themes.length - 2}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: (row) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                editBook(row);
              }}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                deleteBook(row.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  // Bulk actions
  const bulkActions = [
    {
      label: "Delete Selected",
      onClick: handleBulkDelete,
      variant: "destructive" as const,
    },
  ];

  if (loading && books.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading books...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Books Management</CardTitle>
              <CardDescription>Manage your book catalog ({books.length} books)</CardDescription>
            </div>
            <Dialog open={showBookDialog} onOpenChange={setShowBookDialog}>
              <DialogTrigger asChild>
                <Button onClick={resetBookForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Book
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingBook ? "Edit Book" : "Add New Book"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={saveBook} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        value={bookForm.title}
                        onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="author">Author *</Label>
                      <Input
                        id="author"
                        value={bookForm.author}
                        onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="year">Year *</Label>
                      <Input
                        id="year"
                        type="number"
                        value={bookForm.published_year}
                        onChange={(e) =>
                          setBookForm({ ...bookForm, published_year: parseInt(e.target.value) || new Date().getFullYear() })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="genre">Genre</Label>
                      <Input
                        id="genre"
                        value={bookForm.genre}
                        onChange={(e) => setBookForm({ ...bookForm, genre: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="language">Language</Label>
                      <Select
                        value={bookForm.language}
                        onValueChange={(value: string) => setBookForm({ ...bookForm, language: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="English">English</SelectItem>
                          <SelectItem value="Kiswahili">Kiswahili</SelectItem>
                          <SelectItem value="Gikuyu">Gikuyu</SelectItem>
                          <SelectItem value="Luo">Luo</SelectItem>
                          <SelectItem value="Sheng">Sheng</SelectItem>
                          <SelectItem value="Spanish">Spanish</SelectItem>
                          <SelectItem value="Indonesian">Indonesian</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="isbn10">ISBN-10</Label>
                      <Input
                        id="isbn10"
                        value={bookForm.isbn10}
                        onChange={(e) => setBookForm({ ...bookForm, isbn10: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="isbn13">ISBN-13</Label>
                      <Input
                        id="isbn13"
                        value={bookForm.isbn13}
                        onChange={(e) => setBookForm({ ...bookForm, isbn13: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Themes</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto">
                      {availableThemes.map((theme) => (
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
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={bookForm.description}
                      onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="cover_url">Cover Image URL</Label>
                    <Input
                      id="cover_url"
                      value={bookForm.cover_url}
                      onChange={(e) => setBookForm({ ...bookForm, cover_url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={bookForm.status}
                      onValueChange={(value: Book["status"]) => setBookForm({ ...bookForm, status: value })}
                    >
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
                    {editingBook ? "Update Book" : "Create Book"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toolbar */}
          <DataTableToolbar
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="Search books by title, author, genre..."
            filters={filterOptions}
            selectedFilters={selectedFilters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            bulkActions={bulkActions}
            selectedCount={selectedRows.size}
            onExport={handleExport}
          />

          {/* DataTable */}
          <DataTable
            data={filteredBooks}
            columns={columns}
            selectable
            selectedRows={selectedRows}
            onSelectionChange={setSelectedRows}
            getRowId={(row) => row.id}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyMessage="No books found. Try adjusting your filters or add a new book."
          />

          {/* Stats */}
          <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
            <div>
              {filteredBooks.length} of {books.length} books
              {filteredBooks.length !== books.length && " (filtered)"}
            </div>
            <div>{selectedRows.size > 0 && `${selectedRows.size} selected`}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

