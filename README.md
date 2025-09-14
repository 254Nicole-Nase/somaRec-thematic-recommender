# SomaRec: Kenyan Literature Recommendation System

This project is a high-fidelity React + Supabase application for recommending Kenyan literature, supporting user registration, authentication, role-based access, and secure data management. It is based on Figma wireframes and implements modern UI/UX and security best practices.

## Features
- User registration and login forms for students and administrators
- Two-factor authentication (2FA) for secure login
- Secure credential storage using Supabase Auth
- Role-based access control (student, administrator)
- User profile management (view/update info)
- Book browsing, filtering, and search by themes/curriculum
- Admin dashboard for managing books, users, and system data
- Row Level Security (RLS) policies for all sensitive tables
- Edge Functions for secure profile and data access

## Project Structure
```
├── src/
│   ├── components/         # UI components (BookCard, Navigation, AdminPanel, etc.)
│   ├── contexts/           # React context for user/session management
│   ├── styles/             # Global and component CSS
│   ├── utils/              # Supabase client and helpers
│   ├── supabase/           # Edge Functions and server logic
│   └── App.tsx             # Main app logic
├── supabase_schema.sql     # Database schema and policies
├── package.json            # Project dependencies
├── vite.config.ts          # Vite configuration
├── index.html              # App entry point
```

## Setup Instructions
1. **Clone the repository**
  ```sh
  git clone <repo-url>
  cd <project-folder>
  ```
2. **Install dependencies**
  ```sh
  npm install
  ```
3. **Configure environment variables**
  - Copy `.env.example` to `.env` and add your Supabase project URL and anon key:
    ```env
    VITE_SUPABASE_URL=your-supabase-url
    VITE_SUPABASE_ANON_KEY=your-anon-key
    ```
4. **Run the development server**
  ```sh
  npm run dev
  ```
  - The app will start on `http://localhost:3000/` (or another port if 3000 is busy).

## Security & Best Practices
- All sensitive tables have RLS enabled and policies applied.
- Do NOT commit `.env` or secrets to GitHub.
- Use `.gitignore` to exclude `node_modules/`, build output, and editor/OS files.
- Enable leaked password protection and MFA in Supabase Auth.
- Test as anon, regular user, and admin to verify access control.

## Development Notes
- Experimental features and tests should be done in a separate folder/branch before merging to main development.
- For admin access, add your user to the `public.admins` table or set `is_admin` in `profiles`.
- Edge Functions are used for secure profile and data access.

## Credits
- UI/UX design: [Figma Wireframes](https://www.figma.com/design/INGtyIHdCE0UyVRezrDxWc/High-Fidelity-Wireframes-for-SomaRec)
- Project owner: 254Nicole-Nase
- Contributors: See GitHub history

---
For questions or improvements, open an issue or contact the project owner.

[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/blswXyO9)
[![Open in Visual Studio Code](https://classroom.github.com/assets/open-in-vscode-2e0aaae1b6195c2367325f4f02e2d04e9abb55f0b24a779b69b11b9e10269abc.svg)](https://classroom.github.com/online_ide?assignment_repo_id=20098783&assignment_repo_type=AssignmentRepo)
