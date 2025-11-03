

import pandas as pd
import numpy as np
def clean_nans(obj):
    """Recursively replace NaN/None in dicts/lists for JSON serialization."""
    if isinstance(obj, float) and (np.isnan(obj) or obj is None):
        return None
    if obj is None:
        return None
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nans(x) for x in obj]
    return obj
import ast
import re
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import OneHotEncoder
from sklearn.neighbors import NearestNeighbors
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from scipy.sparse import hstack, csr_matrix

# --- Global Variables to hold models and data ---
DF = pd.DataFrame()
INDICES = dict()
NN_MODEL = None
FEATURE_PIPELINE = None
X_HYBRID = None

def normalize_text(text):
    """Cleans text for TF-IDF."""
    if pd.isna(text): return ""
    text = str(text).lower().strip()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text

def load_models_and_data():
    """
    This function runs ONCE on server startup.
    It loads the CSV and trains the complete hybrid model from 'part5'.
    """
    global DF, INDICES, NN_MODEL, FEATURE_PIPELINE, X_HYBRID
    import os
    print("--- Loading data... ---")

    # Always load from kenyan_works_with_themes.csv, which includes the 'themes' column
    try:
        DF = pd.read_csv(os.path.join(os.path.dirname(__file__), 'data', 'kenyan_works_with_themes.csv'))
    except FileNotFoundError:
        print("FATAL ERROR: data/kenyan_works_with_themes.csv not found.")
        return

    # --- 1. Preprocess Data (from part5) ---
    DF['description'] = DF['description'].fillna('')
    DF['summary'] = DF['summary'].fillna('') if 'summary' in DF.columns else ''
    DF['source_text'] = DF['title'].fillna('') + ' ' + DF['summary'] + ' ' + DF['description']
    DF['genre'] = DF['genre'].fillna('Unknown') if 'genre' in DF.columns else 'Unknown'
    DF['cbc_alignment'] = DF['cbc_alignment'].fillna('None') if 'cbc_alignment' in DF.columns else 'None'

    # Safely parse the 'themes' column (it's a string list)
    if 'themes' in DF.columns:
        DF['themes'] = DF['themes'].apply(
            lambda x: ast.literal_eval(x) if pd.notna(x) else []
        )

    # Create the ID-to-index mapping
    DF = DF.reset_index(drop=True) # Ensure index is 0, 1, 2...
    if 'id' in DF.columns:
        INDICES = pd.Series(DF.index, index=DF['id']).to_dict()
    else:
        INDICES = {i: i for i in range(len(DF))}

    print(f"Loaded {len(DF)} book records.")

    # --- 2. Build Feature Pipelines (from part5) ---
    print("--- Building feature pipelines... ---")

    # Text Embedding Pipeline (Sentence Transformer)
    st_model = SentenceTransformer('all-MiniLM-L6-v2')

    # Metadata Pipeline (TF-IDF for description, OHE for genre/cbc)
    text_transformer = TfidfVectorizer(stop_words='english', max_features=100, preprocessor=normalize_text)
    categorical_transformer = OneHotEncoder(handle_unknown='ignore')

    # Combine metadata transformers
    metadata_preprocessor = ColumnTransformer(
        transformers=[
            ('tfidf_desc', text_transformer, 'description'),
            ('ohe_genre', categorical_transformer, ['genre', 'cbc_alignment'])
        ],
        remainder='drop'
    )

    # --- 3. Create Hybrid Feature Matrix (X_hybrid) ---
    print("--- Calculating all feature matrices... ---")

    # 3a. Calculate Sentence Transformer embeddings
    print("Calculating SentenceTransformer embeddings (this may take a minute)...")
    X_text = st_model.encode(DF['source_text'].tolist(), show_progress_bar=True)

    # 3b. Calculate Metadata features
    print("Calculating metadata features...")
    X_meta = metadata_preprocessor.fit_transform(DF)

    # 3c. Combine into Hybrid Matrix
    print("Combining into hybrid matrix...")
    X_HYBRID = hstack([csr_matrix(X_text), X_meta]).tocsr()

    # --- 4. Train the KNN Model (from part5) ---
    print("--- Training Nearest Neighbors model... ---")
    NN_MODEL = NearestNeighbors(n_neighbors=10, metric='cosine', algorithm='brute')
    NN_MODEL.fit(X_HYBRID)

    print("✅✅✅ Backend is ready to serve recommendations. ✅✅✅")

def get_recommendations_by_id(book_id, limit=6):
    """
    Finds a book by its UUID and returns similar books.
    """
    if NN_MODEL is None or X_HYBRID is None:
        raise Exception("Models are not loaded.")

    if book_id not in INDICES:
        return [] # Book ID not found

    # 1. Get the index and feature vector for the source book
    idx = INDICES[book_id]
    feature_vector = X_HYBRID[idx]

    # 2. Find nearest neighbors
    distances, indices = NN_MODEL.kneighbors(feature_vector, n_neighbors=limit+1)

    # 3. Get the actual DataFrame indices (and skip the first one - itself)
    book_indices = indices.flatten()[1:]

    # 4. Return the full book data for the recommendations, replacing NaN with None
    recs_df = DF.iloc[book_indices].replace({np.nan: None})
    recs = recs_df.to_dict('records')
    return [clean_nans(r) for r in recs]

def get_all_books():
    """Returns all books, formatted for the frontend, with NaN replaced by None."""
    if DF.empty:
        return []
    books = DF.replace({np.nan: None}).to_dict('records')
    return [clean_nans(b) for b in books]

# --- This runs when the file is first imported by app.py ---
load_models_and_data()
