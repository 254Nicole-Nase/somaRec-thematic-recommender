# SomaRec search API, packaged for a Hugging Face Space (Docker SDK) or any container host.
FROM python:3.11-slim

# Spaces run the container as user 1000.
RUN useradd -m -u 1000 user && mkdir -p /app && chown user /app
WORKDIR /app

COPY requirements.txt .
# CPU-only PyTorch keeps the image ~1.5 GB smaller than the default CUDA build.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

USER user
ENV HOME=/home/user \
    HF_HOME=/home/user/.cache/huggingface \
    PORT=7860
# Download the model at build time so the first request doesn't wait for it.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')"

COPY --chown=user . .
EXPOSE 7860
# One worker: the model and index live in memory; threads handle concurrent requests.
CMD ["sh", "-c", "exec gunicorn --workers 1 --threads 4 --timeout 300 --bind 0.0.0.0:${PORT} 'app:create_app()'"]
