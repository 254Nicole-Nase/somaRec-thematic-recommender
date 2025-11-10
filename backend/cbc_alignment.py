
import pandas as pd
import os

CBC_CSV_PATH = os.path.join(os.path.dirname(__file__), 'data', 'cbc_alignment.csv')
BOOKS_CSV_PATH = os.path.join(os.path.dirname(__file__), 'data', 'kenyan_works_augmented.csv')


class CBCAlignment:
    def __init__(self):
        # Check if CBC CSV exists, if not create empty dataframe
        if os.path.exists(CBC_CSV_PATH):
            self.df = pd.read_csv(CBC_CSV_PATH, comment='#')
            self.df.fillna('', inplace=True)
        else:
            print(f"[WARNING] CBC alignment file not found at {CBC_CSV_PATH}")
            print("   CBC alignment features will be disabled. Creating empty dataframe.")
            # Create empty dataframe with expected columns
            self.df = pd.DataFrame(columns=['book_id', 'grade', 'learning_area', 'strand', 'sub_strand', 'competencies', 'notes'])
        
        # Load books CSV
        if os.path.exists(BOOKS_CSV_PATH):
            self.books_df = pd.read_csv(BOOKS_CSV_PATH)
            self.books_df.fillna('', inplace=True)
        else:
            print(f"[WARNING] Books file not found at {BOOKS_CSV_PATH}")
            self.books_df = pd.DataFrame()

    def _merge_with_books(self, cbc_df):
        if cbc_df.empty or self.books_df.empty:
            return []
        
        # Normalize for matching: lower, strip
        books = self.books_df.copy()
        if 'title' in books.columns:
            books['title_norm'] = books['title'].str.lower().str.strip()
        else:
            return []
        
        cbc_df = cbc_df.copy()
        if 'book_id' in cbc_df.columns:
            cbc_df['book_id_norm'] = cbc_df['book_id'].str.lower().str.strip()
        else:
            return []
        
        merged = pd.merge(
            cbc_df,
            books,
            left_on='book_id_norm',
            right_on='title_norm',
            how='left',
            suffixes=('_cbc', '_book')
        )
        # Merge: CBC fields + all book fields
        if not cbc_df.empty and not books.empty and 'book_id_norm' in cbc_df.columns and 'title_norm' in books.columns:
            unmatched = cbc_df[~cbc_df['book_id_norm'].isin(books['title_norm'])]['book_id'].tolist()
            if unmatched:
                print("CBC alignment: Unmatched book_ids (not found in main book data):")
                for book_id in unmatched:
                    print(f"  - {book_id}")
            else:
                print("CBC alignment: All book_ids matched main book data.")
        merged_records = []
        for _, row in merged.iterrows():
            # CBC fields
            cbc_fields = ['book_id', 'grade', 'learning_area', 'strand', 'sub_strand', 'competencies', 'notes']
            cbc_data = {k: row.get(k, '') for k in cbc_fields}
            # Book fields (main)
            book_fields = [
                'title', 'author', 'publisher', 'isbn10', 'isbn13', 'language', 'pubdate', 'ol_work_key',
                'image_url', 'source', 'description', 'year', 'genre', 'cover_url'
            ]
            book_data = {k: row.get(k, '') for k in book_fields}
            # Merge, CBC fields take precedence for overlap
            merged_record = {**book_data, **cbc_data}
            merged_records.append(merged_record)
        return merged_records

    def get_all(self):
        if self.df.empty:
            return []
        return self._merge_with_books(self.df)

    def filter(self, grade=None, learning_area=None, strand=None, sub_strand=None, competencies=None):
        if self.df.empty:
            return []
        df = self.df
        if grade:
            df = df[df['grade'] == grade]
        if learning_area:
            df = df[df['learning_area'] == learning_area]
        if strand:
            df = df[df['strand'] == strand]
        if sub_strand:
            df = df[df['sub_strand'] == sub_strand]
        if competencies:
            # Match if competencies is in the list (robust to formatting)
            def has_competency(cell):
                if not isinstance(cell, str):
                    return False
                # Remove brackets and quotes, split by comma
                items = [x.strip().strip("'\"") for x in cell.strip('[]').split(',')]
                return competencies.strip() in items
            df = df[df['competencies'].apply(has_competency)]
        return self._merge_with_books(df)

cbc_alignment = CBCAlignment()
