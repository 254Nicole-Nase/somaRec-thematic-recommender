
# SomaRec: Kenyan Literature Recommendation System

SomaRec is a robust, full-stack book recommendation platform for Kenyan literature, built with a Flask backend and a modern React (Vite) frontend. Supabase is used **only for authentication** (login/signup); all book and user data is managed by the Flask backend. The system supports advanced search, filtering, CBC curriculum alignment, and secure admin features.

## Key Features

- **User Authentication:** Secure login/signup via Supabase Auth (students and admins; admin sign-up is restricted for security).
- **Book Browsing & Search:** Browse, search, and filter books by title, author, language, genre, and dynamically loaded themes.
- **Theme Filtering:** All book themes are loaded from real backend data (not hardcoded), and users can filter or quick-pick themes.
- **CBC Dashboard:** Dedicated dashboard for Competency-Based Curriculum (CBC) alignment, merging curated CBC data with main book data. Every CBC competency/level combination is guaranteed to have at least one book.
- **Admin Panel:** Secure admin-only dashboard for managing books and users (access controlled; no public admin sign-up).
- **Modern UI/UX:** Responsive, accessible, and educator-friendly interface based on Figma wireframes.
- **Backend API:** RESTful Flask API for all book/user/CBC CRUD, search, and filter operations. All navigation, search, and filter features use real backend data.
- **Data Integrity:** CBC alignment and book data are robustly merged; unmatched CBC entries are logged for easy debugging.
- **Security:** All sensitive operations are protected; Supabase is used only for authentication, not for book/user CRUD.

## Project Structure

```
├── backend/
│   ├── app.py              # Flask API (all endpoints)
│   ├── recommender.py      # Book data/model logic (loads kenyan_works_with_themes.csv)
│   ├── cbc_alignment.py    # CBC alignment logic (merges cbc_alignment.csv with book data)
│   ├── data/
│   │   ├── kenyan_works_with_themes.csv  # Main book data (with themes)
│   │   └── cbc_alignment.csv             # CBC alignment data (all competencies covered)
├── src/
│   ├── components/         # React UI (BookCard, CBCDashboard, AdminPanel, etc.)
│   ├── contexts/           # React context for user/session
│   ├── styles/             # CSS
│   ├── utils/              # Helpers
│   └── App.tsx             # Main app logic
├── package.json            # Frontend dependencies
├── vite.config.ts          # Vite config
├── index.html              # App entry point
```

## Setup Instructions

1. **Clone the repository**
  ```sh
  git clone <repo-url>
  cd <project-folder>
  ```
2. **Install frontend dependencies**
  ```sh
  npm install
  ```
3. **Set up environment variables**
  - Copy `.env.example` to `.env` and add your Supabase project URL and anon key:
    ```env
    VITE_SUPABASE_URL=your-supabase-url
    VITE_SUPABASE_ANON_KEY=your-anon-key
    VITE_API_URL=http://localhost:5000
    ```
4. **Install backend dependencies**
  ```sh
  pip install -r backend/requirements.txt
  ```
5. **Run the backend (Flask API)**
  ```sh
  python backend/app.py
  ```
6. **Run the frontend (React/Vite)**
  ```sh
  npm run dev
  ```
  - The app will start on `http://localhost:3000/` (or another port if 3000 is busy).

## Major Implementation Milestones

- Removed all legacy Supabase CRUD; Flask backend now handles all book/user data.
- Implemented robust REST API for books, users, search, recommendations, themes, and CBC endpoints.
- Integrated CBC dashboard: merges curated CBC alignment data with main book data, with guaranteed coverage for all competencies/levels.
- Dynamic theme filtering and quick-pick themes, based on real backend data.
- Secure admin access: admin sign-up removed, only existing admins can access admin panel.
- All navigation, search, and filter features use real backend data (no hardcoded lists).
- Defensive UI: BookCard, BookDetail, and CBCDashboard robust to missing data and errors.
- Data integrity: unmatched CBC book_ids are logged for easy debugging.

## Security & Best Practices

- Supabase is used **only for authentication**; all other data is managed by Flask backend.
- No secrets or `.env` files are committed to GitHub.
- Use `.gitignore` to exclude `node_modules/`, build output, and editor/OS files.
- Test as anon, regular user, and admin to verify access control.

## Development Notes

- All experimental features and tests should be done in a separate branch before merging.
- For admin access, add your user to the admin table in Supabase or set `is_admin` in your profile.
- CBC and book data are in `backend/data/` and can be updated as needed.

## Credits

- UI/UX design: [Figma Wireframes](https://www.figma.com/design/INGtyIHdCE0UyVRezrDxWc/High-Fidelity-Wireframes-for-SomaRec)
- Project owner: 254Nicole-Nase
- Contributors: See GitHub history

---
For questions or improvements, open an issue or contact the project owner.

[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/blswXyO9)
[![Open in Visual Studio Code](https://classroom.github.com/assets/open-in-vscode-2e0aaae1b6195c2367325f4f02e2d04e9abb55f0b24a779b69b11b9e10269abc.svg)](https://classroom.github.com/online_ide?assignment_repo_id=20098783&assignment_repo_type=AssignmentRepo)
