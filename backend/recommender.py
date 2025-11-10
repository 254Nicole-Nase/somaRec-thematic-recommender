
import pandas as pd
import numpy as np
import os
import faiss
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

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

# --- Global Variables to hold models and data ---
DF = pd.DataFrame()
INDICES = dict()
MODEL = None
INDEX_IVF = None
BOOK_EMBEDDINGS = None

def load_models_and_data():
    """
    This function runs ONCE on server startup.
    It loads the CSV, generates embeddings, and builds a FAISS IVF (Voronoi) index.
    This enables semantic search using sentence similarity and unsupervised clustering.
    """
    global DF, INDICES, MODEL, INDEX_IVF, BOOK_EMBEDDINGS
    
    print("--- Loading data... ---")
    
    # Load from kenyan_works_augmented.csv
    try:
        csv_path = os.path.join(os.path.dirname(__file__), 'data', 'kenyan_works_augmented.csv')
        DF = pd.read_csv(csv_path)
        print(f"[OK] Loaded {len(DF)} books from kenyan_works_augmented.csv")
    except FileNotFoundError:
        print(f"FATAL ERROR: {csv_path} not found.")
        return
    
    # Fill missing values
    DF['title'] = DF['title'].fillna('')
    DF['author'] = DF['author'].fillna('')
    DF['description'] = DF['description'].fillna('')
    
    # Create combined text for embedding (title + author + description)
    DF['combined_text'] = (
        DF['title'].fillna('') + " by " +
        DF['author'].fillna('') + ". " +
        DF['description'].fillna('')
    )
    
    # Create the ID-to-index mapping
    DF = DF.reset_index(drop=True)
    if 'id' in DF.columns:
        INDICES = pd.Series(DF.index, index=DF['id']).to_dict()
    else:
        # Create IDs from index if not present
        DF['id'] = DF.index.astype(str)
        INDICES = {str(i): i for i in range(len(DF))}
    
    print(f"Loaded {len(DF)} book records.")
    
    # --- 2. Load Sentence Transformer Model ---
    print("--- Loading Sentence Transformer model... ---")
    MODEL = SentenceTransformer('all-MiniLM-L6-v2')
    print("[OK] Model loaded.")
    
    # --- 3. Generate Embeddings ---
    print("--- Generating embeddings (this may take a minute)... ---")
    BOOK_EMBEDDINGS = MODEL.encode(
        DF['combined_text'].tolist(),
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True
    )
    print(f"[OK] Generated embeddings shape: {BOOK_EMBEDDINGS.shape}")
    
    # --- 4. Build FAISS IVF (Voronoi) Index ---
    print("--- Building FAISS IVF (Voronoi) index... ---")
    d = BOOK_EMBEDDINGS.shape[1]  # Embedding dimension
    n_books = len(BOOK_EMBEDDINGS)
    
    # Dynamically adjust nlist based on dataset size
    # FAISS recommends at least 39 points per cluster for good clustering
    # So nlist should be <= n_books / 39
    max_nlist = max(1, n_books // 39)
    # Use a reasonable range: 10-25 for small datasets, up to 50 for larger ones
    if n_books < 100:
        nlist = min(10, max_nlist)
    elif n_books < 500:
        nlist = min(15, max_nlist)
    elif n_books < 1000:
        nlist = min(25, max_nlist)
    else:
        nlist = min(50, max_nlist)
    
    # Ensure nlist is at least 1
    nlist = max(1, nlist)
    
    print(f"[INFO] Using {nlist} clusters for {n_books} books (recommended: <= {max_nlist})")
    
    # Define the base quantizer (FlatIP because embeddings are normalized)
    quantizer = faiss.IndexFlatIP(d)
    
    # Create the IVF (Voronoi partitioned) index
    index_ivf = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)
    
    # Train the index (performs unsupervised KMeans clustering internally)
    print("[TRAINING] Training FAISS IVF index (unsupervised clustering)...")
    index_ivf.train(BOOK_EMBEDDINGS.astype('float32'))
    print("[OK] Training complete.")
    
    # Add all book embeddings to the index
    index_ivf.add(BOOK_EMBEDDINGS.astype('float32'))
    print(f"[OK] Indexed {index_ivf.ntotal} books into {nlist} clusters.")
    
    # Set search depth (how many clusters to probe per search)
    # Adjust nprobe based on nlist: use ~30-50% of clusters
    nprobe = max(1, min(8, nlist // 2))
    index_ivf.nprobe = nprobe
    print(f"[INFO] Using nprobe = {index_ivf.nprobe} for semantic matching.")
    
    INDEX_IVF = index_ivf
    
    print("[SUCCESS] Backend is ready to serve semantic recommendations.")

def semantic_search(query: str, top_k: int = 10):
    """
    Performs semantic search using FAISS IVF (Voronoi) clustering.
    This is NOT filtering - it uses sentence similarity to find semantically similar books.
    
    Args:
        query: Any search query (e.g., "Kikuyu culture", "colonialism", "love and betrayal")
        top_k: Number of results to return
    
    Returns:
        List of book dictionaries with similarity scores
    """
    if INDEX_IVF is None or MODEL is None:
        raise Exception("Models are not loaded.")
    
    if DF.empty:
        return []
    
    # Encode query to vector
    query_vec = MODEL.encode(
        [query],
        convert_to_numpy=True,
        normalize_embeddings=True
    ).astype('float32')
    
    # Search in FAISS IVF index
    D, I = INDEX_IVF.search(query_vec, top_k)
    
    # Fetch top results
    results = DF.iloc[I[0]].copy()
    results['similarity_score'] = D[0]
    
    # Convert to dict format
    results_dict = results.replace({np.nan: None}).to_dict('records')
    
    # Add similarity score to each result
    for i, result in enumerate(results_dict):
        result['similarity_score'] = float(D[0][i])
    
    return [clean_nans(r) for r in results_dict]

def get_recommendations_by_id(book_id, limit=6):
    """
    Finds a book by its ID and returns semantically similar books.
    Uses the same FAISS IVF index for consistency.
    """
    if INDEX_IVF is None or MODEL is None:
        raise Exception("Models are not loaded.")
    
    if DF.empty:
        return []
    
    # Find the book by ID
    if book_id not in INDICES:
        return []  # Book ID not found
    
    idx = INDICES[book_id]
    
    # Get the book's embedding
    book_embedding = BOOK_EMBEDDINGS[idx:idx+1].astype('float32')
    
    # Search for similar books (limit+1 to exclude the book itself)
    D, I = INDEX_IVF.search(book_embedding, limit + 1)
    
    # Filter out the book itself
    result_indices = [i for i in I[0] if i != idx][:limit]
    result_scores = [D[0][i] for i, idx_val in enumerate(I[0]) if idx_val != idx][:limit]
    
    if not result_indices:
        return []
    
    # Get the actual DataFrame rows
    recs_df = DF.iloc[result_indices].copy()
    recs_df['similarity_score'] = result_scores
    
    # Convert to dict format
    recs = recs_df.replace({np.nan: None}).to_dict('records')
    
    # Add similarity scores
    for i, rec in enumerate(recs):
        rec['similarity_score'] = float(result_scores[i])
    
    return [clean_nans(r) for r in recs]

def get_all_books():
    """Returns all books, formatted for the frontend, with NaN replaced by None."""
    if DF.empty:
        return []
    books = DF.replace({np.nan: None}).to_dict('records')
    return [clean_nans(b) for b in books]

# --- This runs when the file is first imported by app.py ---
load_models_and_data()
