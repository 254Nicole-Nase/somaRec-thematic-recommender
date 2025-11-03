



from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import recommender  # This imports recommender.py and runs load_models_and_data()

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


# --- New: API endpoint to get all unique themes ---
@app.route('/api/themes', methods=['GET'])
def api_get_themes():
    """API endpoint to get all unique book themes."""
    try:
        # Flatten all themes from all books
        all_books = recommender.get_all_books()
        themes = set()
        for book in all_books:
            book_themes = book.get('themes', [])
            if isinstance(book_themes, list):
                themes.update(book_themes)
        return jsonify(sorted(list(themes)))
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": f"An internal error occurred: {str(e)}"}), 500

# --- New: API endpoint to get all users (stub, returns empty list) ---
@app.route('/api/users', methods=['GET'])
def api_get_users():
    """API endpoint to get all users (stub)."""
    # TODO: Replace with real user management logic
    return jsonify([])


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
