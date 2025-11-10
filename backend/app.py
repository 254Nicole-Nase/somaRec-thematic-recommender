



from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import recommender  # This imports recommender.py and runs load_models_and_data()
import pandas as pd
from datetime import datetime

app = Flask(__name__)
CORS(app)

import json

# --- CBC Alignment import ---
import cbc_alignment

@app.route('/api/recommend', methods=['GET'])
def api_recommend():
    """
    API endpoint to get recommendations.
    e.g., http://localhost:5000/api/recommend?book_id=...UUID...
    """
    book_id = request.args.get('book_id')

    if not book_id:
        return jsonify({"error": "A 'book_id' query parameter is required."}), 400

    try:
        recommendations = recommender.get_recommendations_by_id(book_id, limit=6)
        return Response(json.dumps(recommendations, default=str), mimetype='application/json')
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@app.route('/api/books', methods=['GET'])
def api_get_books():
    """API endpoint to get the main list of all books."""
    try:
        all_books = recommender.get_all_books()
        return Response(json.dumps(all_books, default=str), mimetype='application/json')
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@app.route('/api/books', methods=['POST'])
def api_create_book():
    """API endpoint to create a new book."""
    try:
        data = request.get_json()
        # Note: Currently data is read from CSV, so this would need database integration
        # For now, return the book data as if it was created
        # In production, you'd save to a database here
        book = {
            'id': str(len(recommender.get_all_books()) + 1),
            'title': data.get('title', ''),
            'author': data.get('author', ''),
            'year': data.get('year', 2024),
            'genre': data.get('genre', ''),
            'language': data.get('language', 'English'),
            'themes': data.get('themes', []),
            'description': data.get('description', ''),
            'image_url': data.get('coverImage', ''),
            'status': data.get('status', 'draft'),
            'createdAt': datetime.now().isoformat()
        }
        return jsonify(book), 201
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@app.route('/api/books/<book_id>', methods=['PUT'])
def api_update_book(book_id):
    """API endpoint to update a book."""
    try:
        data = request.get_json()
        # Note: Currently data is read from CSV, so this would need database integration
        # For now, return the updated book data
        # In production, you'd update the database here
        all_books = recommender.get_all_books()
        book = next((b for b in all_books if str(b.get('id')) == str(book_id)), None)
        if not book:
            return jsonify({"error": "Book not found"}), 404
        
        # Merge updates
        updated_book = {**book, **data}
        return jsonify(updated_book), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@app.route('/api/books/<book_id>', methods=['DELETE'])
def api_delete_book(book_id):
    """API endpoint to delete a book."""
    try:
        # Note: Currently data is read from CSV, so this would need database integration
        # For now, just return success
        # In production, you'd delete from the database here
        all_books = recommender.get_all_books()
        book = next((b for b in all_books if str(b.get('id')) == str(book_id)), None)
        if not book:
            return jsonify({"error": "Book not found"}), 404
        return jsonify({"message": "Book deleted successfully"}), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@app.route('/api/search', methods=['GET'])
def api_search():
    """
    API endpoint for semantic search using FAISS IVF (Voronoi) clustering.
    This is NOT filtering - it uses sentence similarity to find semantically similar books.
    
    Query parameters:
        q: Search query (e.g., "Kikuyu culture", "colonialism", "love and betrayal")
        top_k: Number of results to return (default: 10)
    
    Example:
        http://localhost:5000/api/search?q=Kikuyu%20books&top_k=5
    """
    query = request.args.get('q')
    top_k = request.args.get('top_k', default=10, type=int)
    
    if not query:
        return jsonify({"error": "A 'q' query parameter is required."}), 400
    
    try:
        results = recommender.semantic_search(query, top_k=top_k)
        return Response(json.dumps(results, default=str), mimetype='application/json')
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

# --- New: API endpoint to get all unique themes ---
@app.route('/api/themes', methods=['GET'])
def api_get_themes():
    """API endpoint to get all unique book themes."""
    try:
        # Since we're using semantic search, themes might not be in the data
        # Return empty list for now - themes can be discovered through semantic search
        # Or we can extract common themes from search results
        all_books = recommender.get_all_books()
        themes = set()
        for book in all_books:
            book_themes = book.get('themes', [])
            if isinstance(book_themes, list):
                themes.update(book_themes)
            elif isinstance(book_themes, str) and book_themes:
                # Handle string themes (comma-separated)
                themes.update([t.strip() for t in book_themes.split(',') if t.strip()])
        return jsonify(sorted(list(themes)))
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@app.route('/api/languages', methods=['GET'])
def api_get_languages():
    """API endpoint to get all unique book languages."""
    try:
        all_books = recommender.get_all_books()
        languages = set()
        for book in all_books:
            lang = book.get('language')
            if lang and isinstance(lang, str) and lang.strip():
                languages.add(lang.strip())
        return jsonify(sorted(list(languages)))
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

@app.route('/api/genres', methods=['GET'])
def api_get_genres():
    """API endpoint to get all unique book genres."""
    try:
        all_books = recommender.get_all_books()
        genres = set()
        for book in all_books:
            genre = book.get('genre')
            if genre and isinstance(genre, str) and genre.strip():
                genres.add(genre.strip())
        return jsonify(sorted(list(genres)))
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

# --- User Management Endpoints ---
@app.route('/api/users', methods=['GET'])
def api_get_users():
    """
    API endpoint to get all users.
    Note: Since authentication is handled by Supabase, this returns a message
    indicating that user management should be done through Supabase admin panel.
    """
    # Since we're using Supabase for auth, user management should be done there
    # Return empty list with a note, or you could integrate Supabase Admin API here
    return jsonify({
        "message": "User management is handled by Supabase. Use Supabase Admin API or dashboard for user operations.",
        "users": []
    })

@app.route('/api/users/<user_id>/status', methods=['PUT'])
def api_update_user_status(user_id):
    """API endpoint to update user status."""
    # Since we're using Supabase for auth, this would need Supabase Admin API integration
    return jsonify({
        "message": "User status updates should be done through Supabase Admin API",
        "error": "Not implemented - requires Supabase Admin API integration"
    }), 501


# --- CBC Alignment Endpoints ---
@app.route('/api/cbc', methods=['GET'])
def api_get_cbc_alignments():
    """API endpoint to get all CBC alignments (raw)."""
    try:
        cbc_data = cbc_alignment.cbc_alignment.get_all()
        return Response(json.dumps(cbc_data, default=str), mimetype='application/json')
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500


@app.route('/api/cbc/filter', methods=['GET'])
def api_filter_cbc_alignments():
    """API endpoint to filter CBC alignments by grade, learning_area, strand, sub_strand, or competencies."""
    try:
        grade = request.args.get('grade')
        learning_area = request.args.get('learning_area')
        strand = request.args.get('strand')
        sub_strand = request.args.get('sub_strand')
        competencies = request.args.get('competencies')
        filtered = cbc_alignment.cbc_alignment.filter(
            grade=grade,
            learning_area=learning_area,
            strand=strand,
            sub_strand=sub_strand,
            competencies=competencies
        )
        return Response(json.dumps(filtered, default=str), mimetype='application/json')
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

if __name__ == '__main__':
    print("Starting Flask server on http://localhost:5000")
    app.run(debug=True, port=5000)
