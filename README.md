# SomaRec: Kenyan Literature Recommendation System

SomaRec is a robust, full-stack book recommendation platform for Kenyan literature, built with a modern React (Vite) frontend, Flask backend for semantic search, and Supabase for data persistence and authentication. The system supports advanced semantic search, filtering, CBC curriculum alignment, reading lists, and secure admin features.

## Key Features

- **User Authentication:** Secure login/signup via Supabase Auth (students and admins; admin access is role-based).
- **Book Browsing & Search:** Browse, search, and filter books using FAISS-based semantic search with IVF (Voronoi) clustering for intelligent topic-based discovery.
- **Theme Filtering:** All book themes are loaded from Supabase database, and users can filter or quick-pick themes.
- **CBC Dashboard:** Dedicated dashboard for Competency-Based Curriculum (CBC) alignment, with books aligned to specific competencies and learning outcomes.
- **Reading Lists (My Library):** Save books to personalized reading lists, track reading status (to-read, reading, completed), and manage multiple lists.
- **Admin Panel:** Forest Admin-style dashboard with:
  - **Books Management:** Full CRUD operations, search, filtering, pagination, bulk actions, and CSV export
  - **Users Management:** User role and status management with RLS policies
  - **Analytics Dashboard:** Comprehensive analytics with charts for users, books, reading lists, themes, grades, and publication years
- **Modern UI/UX:** Responsive, accessible, and educator-friendly interface based on Figma wireframes.

## Architecture

### Data Storage (Supabase)
- **Books:** Stored in Supabase `books` table (509+ books)
- **Themes:** Stored in Supabase `themes` table (59+ themes)
- **Reading Lists:** Stored in Supabase `reading_lists` table with Row Level Security (RLS)
- **CBC Alignment:** Stored in Supabase `book_curriculum` table
- **User Profiles:** Stored in Supabase `profiles` table with RLS policies
- **Authentication:** Supabase Auth for user management

### Backend (Flask)
- **Semantic Search:** FAISS-based semantic search using IVF (Voronoi) clustering
- **Search API:** `/api/search` endpoint for semantic book discovery
- **Book Recommendations:** Similarity-based recommendations using sentence embeddings

### Frontend (React + Vite)
- **Components:** Modern React components with TypeScript
- **UI Library:** Shadcn UI components
- **Charts:** Recharts for analytics visualization
- **State Management:** React Context for user state

## Project Structure

```
├── backend/
│   ├── app.py              # Flask API (semantic search endpoints)
│   ├── recommender.py      # FAISS-based semantic search logic
│   ├── cbc_alignment.py    # CBC alignment logic
│   ├── data/
│   │   └── kenyan_works_augmented.csv  # Book data for semantic search
│   └── requirements.txt    # Python dependencies
├── src/
│   ├── components/         # React UI components
│   │   ├── admin/         # Admin panel components
│   │   ├── auth/          # Authentication components
│   │   └── ui/            # Shadcn UI components
│   ├── contexts/          # React context (UserContext)
│   ├── utils/             # Utility functions
│   └── App.tsx            # Main app logic
├── supabase/
│   └── migrations/        # Database migrations
├── package.json           # Frontend dependencies
├── vite.config.ts         # Vite config
└── index.html             # App entry point
```

## Setup Instructions

### Prerequisites
- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher)
- **Supabase account** and project
- **npm** or **yarn** package manager
- **pip** Python package manager

### 1. Clone the repository
```sh
git clone <repo-url>
cd <project-folder>
```

### 2. Install frontend dependencies
```sh
npm install
```

### 3. Set up environment variables
Create a `.env` file in the root directory (you can copy from `.env.example`):
```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_URL=http://localhost:5000

# Optional: For admin operations (uploading books, generating CBC data)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Where to find these values:**
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: Supabase Dashboard → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Settings → API → service_role key (secret)
  - ⚠️ **Important**: Never commit this key or use it in frontend code!

### 4. Set up Supabase database
You need to create the following tables in your Supabase database. You can either:

**Option A: Use Supabase SQL Editor** (Recommended)
1. Go to your Supabase Dashboard → SQL Editor
2. Create the following tables with appropriate RLS policies:
   - `books` - Book catalog
   - `themes` - Literary themes
   - `reading_lists` - User reading lists
   - `book_curriculum` - CBC curriculum alignment
   - `profiles` - User profiles with admin functions

**Option B: Use Migration Files** (If available)
If you have migration files, run them in order through the Supabase SQL Editor.

**Required Tables:**
- **Books**: `id` (UUID), `title`, `author`, `published_year`, `description`, `cover_url`, `created_at`
- **Themes**: `id` (UUID), `name`
- **Reading Lists**: `id` (UUID), `user_id` (UUID), `book_id` (UUID, nullable), `list_id` (UUID, nullable), `name` (text, nullable), `status`, `created_at`
- **Book Curriculum**: `id` (UUID), `book_id` (UUID), `grade`, `learning_area`, `strand`, `sub_strand`, `competencies` (text[])
- **Profiles**: `id` (UUID), `email`, `name`, `role`, `is_admin`, `is_active`, `created_at`, `updated_at`

**Note**: Make sure to enable Row Level Security (RLS) on all tables and create appropriate policies.

### 5. Install backend dependencies
```sh
pip install -r backend/requirements.txt
```

### 6. Run the backend (Flask API)
```sh
python backend/app.py
```
The backend will start on `http://localhost:5000` and load the FAISS semantic search model.

### 7. Run the frontend (React/Vite)
```sh
npm run dev
```
The app will start on `http://localhost:3000` (or another port if 3000 is busy).

## Database Schema

### Books Table
- `id` (UUID): Primary key
- `title` (text): Book title
- `author` (text): Book author
- `published_year` (integer): Publication year
- `description` (text): Book description
- `cover_url` (text): Cover image URL
- `created_at` (timestamp): Creation timestamp

### Themes Table
- `id` (UUID): Primary key
- `name` (text): Theme name

### Reading Lists Table
- `id` (UUID): Primary key
- `user_id` (UUID): Foreign key to auth.users
- `book_id` (UUID): Foreign key to books (nullable for list collections)
- `list_id` (UUID): Foreign key to list collection (nullable)
- `name` (text): List name (nullable for book entries)
- `status` (text): Reading status (to-read, reading, completed)
- `created_at` (timestamp): Creation timestamp

### Book Curriculum Table
- `id` (UUID): Primary key
- `book_id` (UUID): Foreign key to books
- `grade` (text): Grade level
- `learning_area` (text): Learning area
- `strand` (text): Strand
- `sub_strand` (text): Sub-strand
- `competencies` (text[]): Array of competencies

### Profiles Table
- `id` (UUID): Primary key (references auth.users)
- `email` (text): User email
- `name` (text): User name
- `role` (text): User role (reader, admin)
- `is_admin` (boolean): Admin status
- `is_active` (boolean): Active status
- `created_at` (timestamp): Creation timestamp
- `updated_at` (timestamp): Last update timestamp

## Security & Best Practices

- **Row Level Security (RLS):** All Supabase tables have RLS policies enabled
- **Authentication:** Supabase Auth handles user authentication and session management
- **Admin Access:** Admin functions are protected by database-level RLS policies
- **Environment Variables:** No secrets committed to GitHub
- **Error Handling:** Comprehensive error handling throughout the application
- **Type Safety:** TypeScript for type safety in the frontend

## Major Implementation Milestones

- ✅ Migrated from CSV to Supabase for data persistence
- ✅ Implemented FAISS-based semantic search with IVF clustering
- ✅ Created comprehensive admin panel with DataTable components
- ✅ Implemented reading lists with RLS policies
- ✅ Integrated CBC curriculum alignment
- ✅ Built analytics dashboard with Recharts
- ✅ Implemented user management with role-based access control
- ✅ Fixed authentication timeout issues
- ✅ Added comprehensive error handling and loading states

## Development Notes

- All experimental features and tests should be done in a separate branch before merging.
- For admin access, set `is_admin = true` in the `profiles` table for your user.
- Book data can be uploaded to Supabase using `backend/upload_books_to_supabase.py`.
  - Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env` file
  - Run: `python backend/upload_books_to_supabase.py`
- CBC alignment data can be generated using `backend/generate_sample_cbc_data.py`.
  - Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env` file (recommended)
  - Run: `python backend/generate_sample_cbc_data.py`
- Make sure your Supabase database has RLS policies configured correctly.
- The backend Flask API is only needed for semantic search (`/api/search` endpoint).
- All other data operations (CRUD) are handled directly through Supabase client.

## API Endpoints

### Backend (Flask)
- `GET /api/search?q=<query>&top_k=<number>` - Semantic search for books (FAISS-based)
  - Example: `GET /api/search?q=Kikuyu%20books&top_k=10`
  - Returns: Array of books with similarity scores
- `GET /api/books` - Get all books (fallback, primarily uses Supabase)
- `GET /api/themes` - Get all themes (fallback, primarily uses Supabase)
- `GET /api/genres` - Get all genres (fallback)
- `GET /api/cbc/filter?grade=<grade>&competency=<competency>` - Filter CBC-aligned books

### Supabase
- All CRUD operations are performed directly through Supabase client
- RLS policies ensure data security and access control
- Tables: `books`, `themes`, `reading_lists`, `book_curriculum`, `profiles`
- Authentication: Supabase Auth handles login/signup

## Credits

- UI/UX design: [Figma Wireframes](https://www.figma.com/design/INGtyIHdCE0UyVRezrDxWc/High-Fidelity-Wireframes-for-SomaRec)
- Project owner: 254Nicole-Nase
- Contributors: See GitHub history

---

For questions or improvements, open an issue or contact the project owner.

[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/blswXyO9)
[![Open in Visual Studio Code](https://classroom.github.com/assets/open-in-vscode-2e0aaae1b6195c2367325f4f02e2d04e9abb55f0b24a779b69b11b9e10269abc.svg)](https://classroom.github.com/online_ide?assignment_repo_id=20098783&assignment_repo_type=AssignmentRepo)
