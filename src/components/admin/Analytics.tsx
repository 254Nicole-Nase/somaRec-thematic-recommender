import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { 
  Users, 
  BookOpen, 
  TrendingUp, 
  Activity,
  Loader2
} from "lucide-react";
import { supabase } from "../../utils/supabase/client";
import { useUser } from "../../contexts/UserContext";
import {
  LineChart as RechartsLineChart,
  Line,
  BarChart as RechartsBarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface AnalyticsData {
  users: {
    total: number;
    active: number;
    admins: number;
    newThisMonth: number;
    signupsOverTime: Array<{ date: string; count: number }>;
  };
  books: {
    total: number;
    published: number;
    byTheme: Array<{ name: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    topAuthors: Array<{ author: string; count: number }>;
    byPublicationYear: Array<{ year: number; count: number }>;
    byGrade: Array<{ grade: string; count: number }>;
    mostSaved: Array<{ title: string; count: number }>;
  };
  readingLists: {
    total: number;
    createdOverTime: Array<{ date: string; count: number }>;
    averageBooksPerList: number;
  };
  themes: {
    total: number;
    mostUsed: Array<{ name: string; count: number }>;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

export function Analytics() {
  const { user, loading: userLoading, isAdmin } = useUser();
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadAnalytics = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [
        usersResult,
        booksResult,
        readingListsResult,
        bookEntriesResult,
        themesResult,
        bookCurriculumResult,
      ] = await Promise.all([
        // Users
        supabase
          .from("profiles")
          .select("id, is_admin, is_active, created_at")
          .order("created_at", { ascending: false }),
        
        // Books - note: themes column doesn't exist in books table
        supabase
          .from("books")
          .select("id, title, author, published_year, created_at"),
        
        // Reading Lists - get list collections (where name is not null and book_id is null)
        supabase
          .from("reading_lists")
          .select("id, user_id, name, created_at")
          .not('name', 'is', null)
          .is('book_id', null),
        
        // Book entries in reading lists (where book_id is not null)
        supabase
          .from("reading_lists")
          .select("id, user_id, book_id, created_at, list_id")
          .not('book_id', 'is', null),
        
        // Themes
        supabase
          .from("themes")
          .select("id, name"),
        
        // Book Curriculum (for CBC alignment stats)
        supabase
          .from("book_curriculum")
          .select("id, book_id, grade, learning_area"),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (booksResult.error) throw booksResult.error;
      if (readingListsResult.error) throw readingListsResult.error;
      if (bookEntriesResult.error) throw bookEntriesResult.error;
      if (themesResult.error) throw themesResult.error;

      const users = usersResult.data || [];
      const books = booksResult.data || [];
      const readingLists = readingListsResult.data || [];
      const bookEntries = bookEntriesResult.data || [];
      const themes = themesResult.data || [];
      const bookCurriculum = bookCurriculumResult.data || [];

      // Process user data
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const newUsersThisMonth = users.filter(
        (u) => new Date(u.created_at) >= thisMonth
      ).length;

      // User signups over time (last 12 months)
      const signupsOverTime = processTimeSeries(
        users.map((u) => u.created_at),
        12
      );

      // Process books data
      // Note: books table doesn't have status column, so all books are considered published
      const publishedBooks = books;
      
      // Books by theme - try to count from books.themes if it exists
      const themeCounts: Record<string, number> = {};
      books.forEach((book: any) => {
        // Check if book has themes as array
        if (book.themes && Array.isArray(book.themes)) {
          book.themes.forEach((theme: string) => {
            if (theme) {
              themeCounts[theme] = (themeCounts[theme] || 0) + 1;
            }
          });
        }
        // Check if themes is stored as JSON string
        else if (book.themes && typeof book.themes === 'string') {
          try {
            const parsed = JSON.parse(book.themes);
            if (Array.isArray(parsed)) {
              parsed.forEach((theme: string) => {
                if (theme) {
                  themeCounts[theme] = (themeCounts[theme] || 0) + 1;
                }
              });
            }
          } catch (e) {
            // Not JSON, might be comma-separated
            if (book.themes.includes(',')) {
              book.themes.split(',').forEach((theme: string) => {
                const trimmed = theme.trim();
                if (trimmed) {
                  themeCounts[trimmed] = (themeCounts[trimmed] || 0) + 1;
                }
              });
            }
          }
        }
      });
      
      // If we have theme counts, use them; otherwise return empty array (will hide chart)
      const booksByTheme = Object.keys(themeCounts).length > 0
        ? Object.entries(themeCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
        : []; // Empty array - chart will be hidden

      // Books by status - all books are published, so skip this
      const booksByStatus = [
        { status: "Published", count: books.length },
      ];

      // Top authors
      const authorCounts: Record<string, number> = {};
      books.forEach((book) => {
        if (book.author) {
          authorCounts[book.author] = (authorCounts[book.author] || 0) + 1;
        }
      });
      const topAuthors = Object.entries(authorCounts)
        .map(([author, count]) => ({ author, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Books by publication year
      const yearCounts: Record<number, number> = {};
      books.forEach((book: any) => {
        if (book.published_year && typeof book.published_year === 'number') {
          const year = book.published_year;
          yearCounts[year] = (yearCounts[year] || 0) + 1;
        }
      });
      
      // Convert to array, sort by year, and take the most recent 20 years
      const booksByPublicationYear = Object.entries(yearCounts)
        .map(([year, count]) => ({ year: parseInt(year), count }))
        .sort((a, b) => b.year - a.year) // Sort by year descending (most recent first)
        .slice(0, 20) // Take top 20 most recent years
        .reverse(); // Reverse to show oldest to newest

      // Reading lists data
      const listsCreatedOverTime = processTimeSeries(
        readingLists.map((rl) => rl.created_at),
        12
      );

      // Calculate average books per list
      // Count book entries grouped by list_id (null means "My Library" default list)
      const booksPerList: Record<string, number> = {};
      bookEntries.forEach((entry) => {
        const listId = entry.list_id || 'default';
        booksPerList[listId] = (booksPerList[listId] || 0) + 1;
      });
      
      // Calculate average: total book entries / total lists (including default)
      const totalLists = readingLists.length + 1; // +1 for default "My Library" list
      const totalBookEntries = bookEntries.length;
      const averageBooksPerList = totalLists > 0 ? totalBookEntries / totalLists : 0;

      // Most used themes - same as books by theme (duplicate data)
      const mostUsedThemes = booksByTheme;

      // Books by grade (from CBC alignment)
      const gradeCounts: Record<string, number> = {};
      if (bookCurriculum && Array.isArray(bookCurriculum)) {
        bookCurriculum.forEach((curriculum: any) => {
          if (curriculum && curriculum.grade) {
            gradeCounts[curriculum.grade] = (gradeCounts[curriculum.grade] || 0) + 1;
          }
        });
      }
      const booksByGrade = Object.entries(gradeCounts)
        .map(([grade, count]) => ({ grade, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Most saved books (books that appear most in reading lists)
      const bookSaveCounts: Record<string, { title: string; count: number }> = {};
      if (bookEntries && Array.isArray(bookEntries) && books && Array.isArray(books)) {
        bookEntries.forEach((entry: any) => {
          if (entry && entry.book_id) {
            if (!bookSaveCounts[entry.book_id]) {
              // Find the book title
              const book = books.find((b: any) => b && b.id === entry.book_id);
              bookSaveCounts[entry.book_id] = {
                title: book?.title || 'Unknown',
                count: 0
              };
            }
            bookSaveCounts[entry.book_id].count++;
          }
        });
      }
      const mostSaved = Object.values(bookSaveCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const analyticsData: AnalyticsData = {
        users: {
          total: users.length,
          active: users.filter((u) => u.is_active).length,
          admins: users.filter((u) => u.is_admin).length,
          newThisMonth: newUsersThisMonth,
          signupsOverTime,
        },
        books: {
          total: books.length,
          published: publishedBooks.length,
          byTheme: booksByTheme,
          byStatus: booksByStatus,
          topAuthors,
          byPublicationYear: booksByPublicationYear,
          byGrade: booksByGrade,
          mostSaved,
        },
        readingLists: {
          total: readingLists.length + 1, // +1 for default "My Library" list
          createdOverTime: listsCreatedOverTime,
          averageBooksPerList: Math.round(averageBooksPerList * 10) / 10,
        },
        themes: {
          total: themes.length,
          mostUsed: mostUsedThemes,
        },
      };

      setData(analyticsData);
    } catch (err: any) {
      console.error("Error loading analytics:", err);
      setError(err.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, []); // Empty deps since this function doesn't depend on any props/state

  React.useEffect(() => {
    // Only load analytics after user context is loaded and user is authenticated
    if (!userLoading && user && isAdmin) {
      loadAnalytics();
    } else if (!userLoading && !user) {
      // User is not authenticated
      setLoading(false);
      setError("Authentication required to view analytics");
    } else if (!userLoading && user && !isAdmin) {
      // User is authenticated but not admin
      setLoading(false);
      setError("Admin access required to view analytics");
    }
  }, [userLoading, user, isAdmin, loadAnalytics]);

  // Helper function to process time series data
  const processTimeSeries = (dates: string[], months: number) => {
    const now = new Date();
    const result: Array<{ date: string; count: number }> = [];
    
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const count = dates.filter((d) => {
        const dateObj = new Date(d);
        return dateObj >= monthStart && dateObj <= monthEnd;
      }).length;
      
      result.push({ date: monthKey, count });
    }
    
    return result;
  };

  // Show loading state while user context is loading or analytics are loading
  if (userLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">
          {userLoading ? "Loading user session..." : "Loading analytics..."}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            <p>Error loading analytics: {error}</p>
            {user && isAdmin && (
              <Button
                onClick={() => loadAnalytics()}
                className="mt-4"
                variant="outline"
              >
                Try again
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Key Metrics Cards - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.users.total}</div>
            <p className="text-xs text-muted-foreground">
              {data.users.active} active, {data.users.newThisMonth} new this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Books</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.books.total}</div>
            <p className="text-xs text-muted-foreground">
              {data.books.published} published
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reading Lists</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.readingLists.total}</div>
            <p className="text-xs text-muted-foreground">
              {data.readingLists.averageBooksPerList} avg books/list
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Themes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.themes.total}</div>
            <p className="text-xs text-muted-foreground">
              Active themes in catalog
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts - 3 columns on large screens, compact */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User Signups Over Time */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">User Signups</CardTitle>
            <CardDescription className="text-xs">New users by month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <RechartsLineChart data={data.users.signupsOverTime}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#0088FE"
                  strokeWidth={2}
                  dot={false}
                  name="Users"
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Reading Lists Created Over Time */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Reading Lists</CardTitle>
            <CardDescription className="text-xs">New lists by month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <RechartsLineChart data={data.readingLists.createdOverTime}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#00C49F"
                  strokeWidth={2}
                  dot={false}
                  name="Lists"
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Books by Grade - Pie Chart */}
        {data.books.byGrade.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Books by Grade</CardTitle>
              <CardDescription className="text-xs">CBC-aligned books by grade level</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <RechartsPieChart>
                  <Pie
                    data={data.books.byGrade}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="grade"
                  >
                    {data.books.byGrade.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          data.books.byPublicationYear.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Books by Publication Year</CardTitle>
                <CardDescription className="text-xs">Books published by year (last 20 years)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <RechartsBarChart data={data.books.byPublicationYear}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis 
                      dataKey="year" 
                      tick={{ fontSize: 10 }} 
                      angle={-45} 
                      textAnchor="end" 
                      height={70}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" name="Books" radius={[4, 4, 0, 0]}>
                      {data.books.byPublicationYear.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Bar Charts - 2 columns, compact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Authors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Authors</CardTitle>
            <CardDescription className="text-xs">Most represented (top 10)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <RechartsBarChart data={data.books.topAuthors.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="author" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#FF8042" name="Books" radius={[4, 4, 0, 0]}>
                  {data.books.topAuthors.slice(0, 10).map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Themes - Only show if we have data */}
        {data.books.byTheme.some(t => t.count > 0) ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top Themes</CardTitle>
              <CardDescription className="text-xs">Books by theme (top 10)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <RechartsBarChart data={data.books.byTheme.filter(t => t.count > 0).slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" name="Books" radius={[4, 4, 0, 0]}>
                    {data.books.byTheme.filter(t => t.count > 0).slice(0, 10).map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Bar>
                </RechartsBarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          data.books.byPublicationYear.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Books by Publication Year</CardTitle>
                <CardDescription className="text-xs">Books published by year (last 20 years)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <RechartsBarChart data={data.books.byPublicationYear}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis 
                      dataKey="year" 
                      tick={{ fontSize: 10 }} 
                      angle={-45} 
                      textAnchor="end" 
                      height={70}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8884d8" name="Books" radius={[4, 4, 0, 0]}>
                      {data.books.byPublicationYear.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )
        )}
      </div>

      {/* Most Used Themes - Only show if we have data */}
      {data.themes.mostUsed.some(t => t.count > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Most Used Themes</CardTitle>
            <CardDescription className="text-xs">Theme usage across all books</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <RechartsBarChart data={data.themes.mostUsed.filter(t => t.count > 0).slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#00C49F" name="Usage" radius={[4, 4, 0, 0]}>
                  {data.themes.mostUsed.filter(t => t.count > 0).slice(0, 10).map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                  ))}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

