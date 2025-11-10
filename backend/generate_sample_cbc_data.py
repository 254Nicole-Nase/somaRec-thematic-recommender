"""
Script to generate sample CBC curriculum alignment data for books in Supabase.

This script creates sample CBC alignments for books in your database.
You can modify the logic to match books to competencies based on your needs.
"""

import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client
import random
from typing import List, Dict, Any

# Load environment variables
load_dotenv()

# Get Supabase credentials
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL') or os.getenv('SUPABASE_URL')
# Try service role key first (for admin operations like inserting data)
# Falls back to anon key if service role key is not available
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_ANON_KEY') or os.getenv('SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) must be set in .env file")
    print("\nFor inserting data, it's recommended to use SUPABASE_SERVICE_ROLE_KEY")
    print("which bypasses RLS policies. Get it from:")
    print("  Supabase Dashboard → Settings → API → service_role key (secret)")
    sys.exit(1)

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Check if we're using service role key
if os.getenv('SUPABASE_SERVICE_ROLE_KEY'):
    print("✅ Using service role key (bypasses RLS) - good for admin operations")
else:
    print("⚠️  Using anon key - may fail if RLS policies require authentication")
    print("   Consider using SUPABASE_SERVICE_ROLE_KEY for inserting data")
    print("   Get it from: Supabase Dashboard → Settings → API → service_role key (secret)")

# CBC Competencies by Grade Level (matching frontend)
CBC_COMPETENCIES = {
    "Grade 1-3": {
        "Communication": ["Listening and speaking", "Reading", "Writing"],
        "Critical Thinking": ["Problem solving", "Decision making", "Creative thinking"],
        "Citizenship": ["Social awareness", "Cultural identity", "Environmental care"]
    },
    "Grade 4-6": {
        "Communication": ["Effective communication", "Reading comprehension", "Creative writing"],
        "Critical Thinking": ["Analysis and evaluation", "Innovation", "Research skills"],
        "Citizenship": ["National unity", "Cultural diversity", "Global citizenship"]
    },
    "Grade 7-9": {
        "Communication": ["Advanced literacy", "Digital communication", "Multilingual competence"],
        "Critical Thinking": ["Scientific inquiry", "Logical reasoning", "Creative expression"],
        "Citizenship": ["Leadership skills", "Ethical decision making", "Environmental stewardship"]
    },
    "Form 1-2": {
        "Literary Analysis": ["Character development", "Plot structure", "Theme identification"],
        "Cultural Understanding": ["African heritage", "Contemporary issues", "Cross-cultural dialogue"],
        "Communication Skills": ["Essay writing", "Oral presentation", "Critical discussion"]
    },
    "Form 3-4": {
        "Advanced Analysis": ["Literary criticism", "Historical context", "Comparative literature"],
        "Research Skills": ["Independent study", "Source evaluation", "Academic writing"],
        "Cultural Synthesis": ["Pan-African literature", "Global perspectives", "Social justice"]
    }
}

# Learning areas (common across CBC)
LEARNING_AREAS = [
    "English",
    "Kiswahili",
    "Mathematics",
    "Science",
    "Social Studies",
    "Creative Arts",
    "Physical Education"
]

# Strands (examples)
STRANDS = [
    "Reading",
    "Writing",
    "Listening",
    "Speaking",
    "Literature",
    "Language",
    "Comprehension"
]

# Sub-strands (examples)
SUB_STRANDS = [
    "Comprehension",
    "Creative Writing",
    "Literary Analysis",
    "Cultural Context",
    "Theme Analysis",
    "Character Development"
]


def get_random_books(limit: int = 20) -> List[Dict[str, Any]]:
    """Fetch random books from Supabase."""
    try:
        # Get all books
        response = supabase.table('books').select('id, title, author').limit(1000).execute()
        
        if not response.data:
            print("No books found in database")
            return []
        
        # Select random books
        books = response.data
        selected = random.sample(books, min(limit, len(books))) if len(books) > limit else books
        
        print(f"Selected {len(selected)} books for CBC alignment")
        return selected
    except Exception as e:
        print(f"Error fetching books: {e}")
        return []


def generate_cbc_alignment(book: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a random CBC alignment for a book."""
    # Randomly select a grade level
    grade_level = random.choice(list(CBC_COMPETENCIES.keys()))
    
    # Randomly select a competency category
    competency_category = random.choice(list(CBC_COMPETENCIES[grade_level].keys()))
    
    # Get competencies for this category
    competencies_list = CBC_COMPETENCIES[grade_level][competency_category]
    
    # Select 1-2 random competencies
    selected_competencies = random.sample(competencies_list, min(2, len(competencies_list)))
    
    # Randomly select learning area, strand, sub-strand
    learning_area = random.choice(LEARNING_AREAS)
    strand = random.choice(STRANDS)
    sub_strand = random.choice(SUB_STRANDS)
    
    # Generate notes
    notes = f"Sample alignment for {book.get('title', 'Unknown')}. This book supports {competency_category} competencies."
    
    return {
        "book_id": book["id"],
        "grade": grade_level,
        "learning_area": learning_area,
        "strand": strand,
        "sub_strand": sub_strand,
        "competencies": selected_competencies,  # Array of competencies
        "notes": notes
    }


def insert_cbc_alignments(alignments: List[Dict[str, Any]]) -> int:
    """Insert CBC alignments into Supabase."""
    try:
        # Insert in batches of 10
        batch_size = 10
        inserted = 0
        
        for i in range(0, len(alignments), batch_size):
            batch = alignments[i:i + batch_size]
            try:
                response = supabase.table('book_curriculum').insert(batch).execute()
                
                if response.data:
                    inserted += len(response.data)
                    print(f"Inserted batch {i//batch_size + 1}: {len(response.data)} alignments")
                else:
                    print(f"Warning: Batch {i//batch_size + 1} returned no data")
            except Exception as batch_error:
                error_msg = str(batch_error)
                if 'row-level security' in error_msg.lower() or '42501' in error_msg:
                    print(f"\n❌ RLS Policy Error on batch {i//batch_size + 1}")
                    print(f"   Error: {error_msg}")
                    print(f"\n   💡 Solution: Use SUPABASE_SERVICE_ROLE_KEY in your .env file")
                    print(f"   Get it from: Supabase Dashboard → Settings → API → service_role key (secret)")
                    print(f"   This key bypasses RLS policies for admin operations.")
                    return inserted
                else:
                    print(f"Error on batch {i//batch_size + 1}: {batch_error}")
        
        return inserted
    except Exception as e:
        error_msg = str(e)
        if 'row-level security' in error_msg.lower() or '42501' in error_msg:
            print(f"\n❌ RLS Policy Error: {error_msg}")
            print(f"\n   💡 Solution: Use SUPABASE_SERVICE_ROLE_KEY in your .env file")
            print(f"   Get it from: Supabase Dashboard → Settings → API → service_role key (secret)")
            print(f"   This key bypasses RLS policies for admin operations.")
        else:
            print(f"Error inserting alignments: {e}")
        return 0


def main():
    """Main function to generate and insert sample CBC data."""
    print("=" * 60)
    print("Sample CBC Data Generator")
    print("=" * 60)
    print()
    
    # Show which key is being used
    if os.getenv('SUPABASE_SERVICE_ROLE_KEY'):
        print("✅ Using service role key (bypasses RLS)")
    else:
        print("⚠️  Using anon key - may fail if RLS blocks inserts")
        print("   Add SUPABASE_SERVICE_ROLE_KEY to .env for admin operations")
    print()
    
    # Ask user how many books to align
    try:
        num_books = input("How many books would you like to create CBC alignments for? (default: 20): ").strip()
        num_books = int(num_books) if num_books else 20
    except ValueError:
        num_books = 20
    
    print(f"\nGenerating CBC alignments for {num_books} books...")
    print()
    
    # Get random books
    books = get_random_books(num_books)
    
    if not books:
        print("No books found. Exiting.")
        return
    
    # Generate alignments
    print("Generating CBC alignments...")
    alignments = []
    for book in books:
        alignment = generate_cbc_alignment(book)
        alignments.append(alignment)
        print(f"  - {book.get('title', 'Unknown')} → {alignment['grade']} - {alignment['competencies'][0]}")
    
    print()
    print(f"Generated {len(alignments)} alignments")
    print()
    
    # Confirm before inserting
    confirm = input("Insert these alignments into Supabase? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Cancelled.")
        return
    
    # Insert alignments
    print("\nInserting alignments into Supabase...")
    inserted = insert_cbc_alignments(alignments)
    
    print()
    print("=" * 60)
    print(f"✅ Successfully inserted {inserted} CBC alignments!")
    print("=" * 60)
    print()
    print("You can now test the CBC Dashboard in your app.")
    print("The alignments are randomly generated - you can edit them in Supabase Table Editor.")


if __name__ == "__main__":
    main()

