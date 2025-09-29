import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', logger(console.log));

// Create Supabase client with service role key for admin operations
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Helper function to get authenticated user
async function getAuthenticatedUser(request: Request) {
  const accessToken = request.headers.get('Authorization')?.split(' ')[1];
  if (!accessToken) {
    return null;
  }

  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) {
    return null;
  }

  return user;
}

// Helper function to get user profile
async function getUserProfile(userId: string) {
  const profile = await kv.get(`user_profile:${userId}`);
  return profile ? JSON.parse(profile) : null;
}

// Routes

// User signup
app.post('/make-server-8f661324/signup', async (c) => {
  try {
    const { email, password, name, role } = await c.req.json();

    // Create user with admin privileges (auto-confirm email)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log(`Signup error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    // Store user profile in KV store
    const userProfile = {
      id: data.user.id,
      email: data.user.email,
      name,
      role,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isActive: true
    };

    await kv.set(`user_profile:${data.user.id}`, JSON.stringify(userProfile));

    return c.json({ 
      message: 'User created successfully',
      user: {
        id: data.user.id,
        email: data.user.email,
        name,
        role
      }
    });
  } catch (error) {
    console.log(`Signup error: ${error}`);
    return c.json({ error: 'Signup failed' }, 500);
  }
});

// Get user profile
app.get('/make-server-8f661324/profile', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const profile = await getUserProfile(user.id);
    if (!profile) {
      // Create profile from auth metadata if not exists
      const newProfile = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || 'User',
        role: user.user_metadata?.role || 'reader',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        isActive: true
      };
      
      await kv.set(`user_profile:${user.id}`, JSON.stringify(newProfile));
      return c.json(newProfile);
    }

    // Update last active time
    profile.lastActive = new Date().toISOString();
    await kv.set(`user_profile:${user.id}`, JSON.stringify(profile));

    return c.json(profile);
  } catch (error) {
    console.log(`Profile fetch error: ${error}`);
    return c.json({ error: 'Failed to fetch profile' }, 500);
  }
});

// Reading Lists Management

// Get user's reading lists
app.get('/make-server-8f661324/reading-lists', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const listsData = await kv.getByPrefix(`reading_list:${user.id}:`);
    const lists = listsData.map(data => JSON.parse(data));
    
    // Get book counts for each list
    for (const list of lists) {
      const booksData = await kv.getByPrefix(`saved_book:${user.id}:${list.id}:`);
      list.bookCount = booksData.length;
    }

    return c.json({ lists });
  } catch (error) {
    console.log(`Reading lists fetch error: ${error}`);
    return c.json({ error: 'Failed to fetch reading lists' }, 500);
  }
});

// Create reading list
app.post('/make-server-8f661324/reading-lists', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { name, description, isPublic } = await c.req.json();
    
    const listId = crypto.randomUUID();
    const list = {
      id: listId,
      userId: user.id,
      name,
      description: description || '',
      isPublic: isPublic || false,
      createdAt: new Date().toISOString(),
      bookCount: 0
    };

    await kv.set(`reading_list:${user.id}:${listId}`, JSON.stringify(list));
    
    return c.json({ list });
  } catch (error) {
    console.log(`Create reading list error: ${error}`);
    return c.json({ error: 'Failed to create reading list' }, 500);
  }
});

// Saved Books Management

// Get user's saved books
app.get('/make-server-8f661324/saved-books', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const listId = c.req.query('listId');
    const prefix = listId 
      ? `saved_book:${user.id}:${listId}:`
      : `saved_book:${user.id}:`;

    const booksData = await kv.getByPrefix(prefix);
    const books = booksData.map(data => JSON.parse(data));

    return c.json({ books });
  } catch (error) {
    console.log(`Saved books fetch error: ${error}`);
    return c.json({ error: 'Failed to fetch saved books' }, 500);
  }
});

// Save book to reading list
app.post('/make-server-8f661324/saved-books', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { bookId, listId, bookData, status } = await c.req.json();
    
    const savedBookId = crypto.randomUUID();
    const savedBook = {
      id: savedBookId,
      userId: user.id,
      bookId,
      listId: listId || 'default',
      status: status || 'want_to_read',
      rating: null,
      notes: '',
      addedAt: new Date().toISOString(),
      // Store book metadata for easy access
      title: bookData.title,
      author: bookData.author,
      year: bookData.year,
      genre: bookData.genre,
      language: bookData.language,
      themes: bookData.themes,
      coverImage: bookData.coverImage
    };

    const key = `saved_book:${user.id}:${listId || 'default'}:${savedBookId}`;
    await kv.set(key, JSON.stringify(savedBook));
    
    return c.json({ savedBook });
  } catch (error) {
    console.log(`Save book error: ${error}`);
    return c.json({ error: 'Failed to save book' }, 500);
  }
});

// Update saved book
app.put('/make-server-8f661324/saved-books/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const bookId = c.req.param('id');
    const { status, rating, notes } = await c.req.json();

    // Find the book
    const booksData = await kv.getByPrefix(`saved_book:${user.id}:`);
    const books = booksData.map(data => JSON.parse(data));
    const book = books.find(b => b.id === bookId);

    if (!book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    // Update book
    book.status = status || book.status;
    book.rating = rating !== undefined ? rating : book.rating;
    book.notes = notes !== undefined ? notes : book.notes;

    const key = `saved_book:${user.id}:${book.listId}:${bookId}`;
    await kv.set(key, JSON.stringify(book));

    return c.json({ book });
  } catch (error) {
    console.log(`Update saved book error: ${error}`);
    return c.json({ error: 'Failed to update book' }, 500);
  }
});

// Delete saved book
app.delete('/make-server-8f661324/saved-books/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const bookId = c.req.param('id');

    // Find and delete the book
    const booksData = await kv.getByPrefix(`saved_book:${user.id}:`);
    const books = booksData.map(data => JSON.parse(data));
    const book = books.find(b => b.id === bookId);

    if (!book) {
      return c.json({ error: 'Book not found' }, 404);
    }

    const key = `saved_book:${user.id}:${book.listId}:${bookId}`;
    await kv.del(key);

    return c.json({ success: true });
  } catch (error) {
    console.log(`Delete saved book error: ${error}`);
    return c.json({ error: 'Failed to delete book' }, 500);
  }
});

// Admin Routes

// Get all books (admin only)
app.get('/make-server-8f661324/admin/books', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const profile = await getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  try {
    const booksData = await kv.getByPrefix('book:');
    const books = booksData.map(data => JSON.parse(data));
    
    return c.json({ books });
  } catch (error) {
    console.log(`Admin books fetch error: ${error}`);
    return c.json({ error: 'Failed to fetch books' }, 500);
  }
});

// Create book (admin only)
app.post('/make-server-8f661324/admin/books', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const profile = await getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  try {
    const bookData = await c.req.json();
    
    const bookId = crypto.randomUUID();
    const book = {
      id: bookId,
      ...bookData,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };

    await kv.set(`book:${bookId}`, JSON.stringify(book));
    
    return c.json({ book });
  } catch (error) {
    console.log(`Create book error: ${error}`);
    return c.json({ error: 'Failed to create book' }, 500);
  }
});

// Update book (admin only)
app.put('/make-server-8f661324/admin/books/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const profile = await getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  try {
    const bookId = c.req.param('id');
    const updates = await c.req.json();

    const existingBook = await kv.get(`book:${bookId}`);
    if (!existingBook) {
      return c.json({ error: 'Book not found' }, 404);
    }

    const book = {
      ...JSON.parse(existingBook),
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id
    };

    await kv.set(`book:${bookId}`, JSON.stringify(book));
    
    return c.json({ book });
  } catch (error) {
    console.log(`Update book error: ${error}`);
    return c.json({ error: 'Failed to update book' }, 500);
  }
});

// Delete book (admin only)
app.delete('/make-server-8f661324/admin/books/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const profile = await getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  try {
    const bookId = c.req.param('id');
    
    const existingBook = await kv.get(`book:${bookId}`);
    if (!existingBook) {
      return c.json({ error: 'Book not found' }, 404);
    }

    await kv.del(`book:${bookId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Delete book error: ${error}`);
    return c.json({ error: 'Failed to delete book' }, 500);
  }
});

// Get all users (admin only)
app.get('/make-server-8f661324/admin/users', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const profile = await getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  try {
    const usersData = await kv.getByPrefix('user_profile:');
    const users = usersData.map(data => JSON.parse(data));
    
    return c.json({ users });
  } catch (error) {
    console.log(`Admin users fetch error: ${error}`);
    return c.json({ error: 'Failed to fetch users' }, 500);
  }
});

// Update user status (admin only)
app.put('/make-server-8f661324/admin/users/:id/status', async (c) => {
  const user = await getAuthenticatedUser(c.req);
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const profile = await getUserProfile(user.id);
  if (!profile || profile.role !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  try {
    const userId = c.req.param('id');
    const { isActive } = await c.req.json();

    const userProfile = await getUserProfile(userId);
    if (!userProfile) {
      return c.json({ error: 'User not found' }, 404);
    }

    userProfile.isActive = isActive;
    await kv.set(`user_profile:${userId}`, JSON.stringify(userProfile));
    
    return c.json({ user: userProfile });
  } catch (error) {
    console.log(`Update user status error: ${error}`);
    return c.json({ error: 'Failed to update user status' }, 500);
  }
});

// Health check
app.get('/make-server-8f661324/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
Deno.serve(app.fetch);