
import pandas as pd
import os

CBC_CSV_PATH = os.path.join(os.path.dirname(__file__), 'data', 'cbc_alignment.csv')
BOOKS_CSV_PATH = os.path.join(os.path.dirname(__file__), 'data', 'kenyan_works_with_themes.csv')


class CBCAlignment:
    def __init__(self):
        self.df = pd.read_csv(CBC_CSV_PATH, comment='#')
        self.df.fillna('', inplace=True)
        self.books_df = pd.read_csv(BOOKS_CSV_PATH)
        self.books_df.fillna('', inplace=True)

    def _merge_with_books(self, cbc_df):
        # Normalize for matching: lower, strip
        books = self.books_df.copy()
        books['title_norm'] = books['title'].str.lower().str.strip()
        cbc_df = cbc_df.copy()
        cbc_df['book_id_norm'] = cbc_df['book_id'].str.lower().str.strip()
        merged = pd.merge(
            cbc_df,
            books,
            left_on='book_id_norm',
            right_on='title_norm',
            how='left',
            suffixes=('_cbc', '_book')
        )
        # Merge: CBC fields + all book fields
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
                'image_url', 'source', 'description', 'year', 'genre', 'themes', 'cover_url'
            ]
            book_data = {k: row.get(k, '') for k in book_fields}
            # Merge, CBC fields take precedence for overlap
            merged_record = {**book_data, **cbc_data}
            merged_records.append(merged_record)
        return merged_records

    def get_all(self):
        return self._merge_with_books(self.df)

    def filter(self, grade=None, learning_area=None, strand=None, sub_strand=None, competencies=None):
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
