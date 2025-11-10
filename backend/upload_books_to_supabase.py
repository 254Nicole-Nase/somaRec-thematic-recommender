"""
Script to upload books from CSV to Supabase books table.
This will create UUID IDs for each book and store them in Supabase.
"""

import pandas as pd
import os
from supabase import create_client, Client
import json
from typing import Dict, Any
from dotenv import load_dotenv

# Load environment variables from .env file
# Try project root first, then backend directory
def find_env_file():
    """Find .env file in project root or backend directory."""
    root_env = os.path.join(os.path.dirname(__file__), '..', '.env')
    backend_env = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(root_env):
        return root_env
    elif os.path.exists(backend_env):
        return backend_env
    return None

env_path = find_env_file()
if env_path:
    load_dotenv(env_path)
else:
    # Try default location
    load_dotenv()

# Supabase configuration
# Load from .env file or environment variables
# Try VITE_SUPABASE_URL first (for Vite projects), then SUPABASE_URL
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL') or os.getenv('SUPABASE_URL', 'your-supabase-url')
# Use service role key for admin operations (required for inserting books)
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', 'your-service-role-key')

def load_csv_books():
    """Load books from CSV file."""
    csv_path = os.path.join(os.path.dirname(__file__), 'data', 'kenyan_works_augmented.csv')
    df = pd.read_csv(csv_path)
    
    # Fill missing values
    df = df.fillna('')
    
    return df

def map_csv_to_supabase(row: pd.Series) -> Dict[str, Any]:
    """
    Map CSV row to Supabase books table schema.
    
    Supabase books table has:
    - id (uuid, auto-generated)
    - title (text)
    - author (text, nullable)
    - description (text, nullable)
    - cover_url (text, nullable)
    - published_year (integer, nullable)
    - isbn10 (text, nullable)
    - isbn13 (text, nullable)
    - legacy_item_id (integer, nullable) - to store original CSV ID
    - created_at (timestamp, auto-generated)
    """
    # Map CSV columns to Supabase columns
    book = {
        'title': str(row.get('title', '')),
        'author': str(row.get('author', '')) if pd.notna(row.get('author')) else None,
        'description': str(row.get('description', '')) if pd.notna(row.get('description')) else None,
        'cover_url': str(row.get('image_url', '')) if pd.notna(row.get('image_url')) else None,
        'published_year': int(row.get('pubdate', 0)) if pd.notna(row.get('pubdate')) and str(row.get('pubdate', '')).isdigit() else None,
        'isbn10': str(row.get('isbn10', '')) if pd.notna(row.get('isbn10')) else None,
        'isbn13': str(row.get('isbn13', '')) if pd.notna(row.get('isbn13')) else None,
    }
    
    # Store original CSV ID in legacy_item_id for reference
    if 'id' in row and pd.notna(row.get('id')):
        try:
            book['legacy_item_id'] = int(row['id'])
        except (ValueError, TypeError):
            pass
    
    # Remove None values (Supabase will use NULL)
    book = {k: v for k, v in book.items() if v is not None and v != ''}
    
    return book

def upload_books_to_supabase(batch_size: int = 100):
    """
    Upload books from CSV to Supabase.
    
    Args:
        batch_size: Number of books to upload in each batch
    """
    # Initialize Supabase client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Load books from CSV
    print("Loading books from CSV...")
    df = load_csv_books()
    print(f"Loaded {len(df)} books from CSV")
    
    # Map CSV rows to Supabase format
    books_to_upload = []
    for idx, row in df.iterrows():
        book = map_csv_to_supabase(row)
        books_to_upload.append(book)
    
    print(f"Prepared {len(books_to_upload)} books for upload")
    
    # Upload in batches
    uploaded = 0
    failed = 0
    
    for i in range(0, len(books_to_upload), batch_size):
        batch = books_to_upload[i:i + batch_size]
        try:
            result = supabase.table('books').insert(batch).execute()
            uploaded += len(batch)
            print(f"Uploaded batch {i//batch_size + 1}: {len(batch)} books (Total: {uploaded}/{len(books_to_upload)})")
        except Exception as e:
            failed += len(batch)
            print(f"Error uploading batch {i//batch_size + 1}: {e}")
            print(f"Failed to upload {len(batch)} books")
    
    print(f"\nUpload complete!")
    print(f"Successfully uploaded: {uploaded} books")
    print(f"Failed: {failed} books")
    
    return uploaded, failed

if __name__ == '__main__':
    print("=" * 60)
    print("Upload Books to Supabase")
    print("=" * 60)
    print()
    print("Make sure you have:")
    print("1. VITE_SUPABASE_URL or SUPABASE_URL in your .env file")
    print("2. SUPABASE_SERVICE_ROLE_KEY in your .env file")
    print("3. The books table exists in Supabase")
    print()
    
    # Check environment variables
    if SUPABASE_URL == 'your-supabase-url' or SUPABASE_KEY == 'your-service-role-key':
        print("ERROR: Please set VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in your .env file")
        if env_path:
            print(f"Looking for .env at: {env_path}")
        else:
            print("Looking for .env at: project root or backend directory")
        print("\nYour .env should have:")
        print("  VITE_SUPABASE_URL=https://your-project.supabase.co")
        print("  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key")
        exit(1)
    
    print(f"[OK] Found Supabase URL: {SUPABASE_URL[:30]}...")
    print(f"[OK] Found Supabase Key: {SUPABASE_KEY[:20]}...")
    print()
    
    try:
        uploaded, failed = upload_books_to_supabase()
        print()
        print("=" * 60)
        print("Upload Summary")
        print("=" * 60)
        print(f"Uploaded: {uploaded} books")
        print(f"Failed: {failed} books")
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()

