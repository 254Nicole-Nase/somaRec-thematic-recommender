Known-item search, 200 books (seed 42)

| query type              | system                                       |   Hit@1 |   Hit@10 |   MRR |
|:------------------------|:---------------------------------------------|--------:|---------:|------:|
| exact title             | tfidf                                        |   0.770 |    0.990 | 0.865 |
| exact title             | keyword                                      |   0.980 |    1.000 | 0.990 |
| exact title             | dense:all-MiniLM-L6-v2                       |   0.785 |    0.930 | 0.841 |
| exact title             | hybrid:all-MiniLM-L6-v2                      |   0.980 |    1.000 | 0.990 |
| exact title             | dense:paraphrase-multilingual-MiniLM-L12-v2  |   0.575 |    0.830 | 0.663 |
| exact title             | hybrid:paraphrase-multilingual-MiniLM-L12-v2 |   0.980 |    1.000 | 0.990 |
| exact title             | dense:multilingual-e5-small                  |   0.670 |    0.830 | 0.717 |
| exact title             | hybrid:multilingual-e5-small                 |   0.980 |    1.000 | 0.990 |
| exact title             | original-ivf:all-MiniLM-L6-v2                |   0.720 |    0.835 | 0.766 |
| partial title + surname | tfidf                                        |   0.495 |    0.955 | 0.648 |
| partial title + surname | keyword                                      |   0.880 |    0.990 | 0.927 |
| partial title + surname | dense:all-MiniLM-L6-v2                       |   0.500 |    0.825 | 0.605 |
| partial title + surname | hybrid:all-MiniLM-L6-v2                      |   0.765 |    0.985 | 0.838 |
| partial title + surname | dense:paraphrase-multilingual-MiniLM-L12-v2  |   0.305 |    0.610 | 0.409 |
| partial title + surname | hybrid:paraphrase-multilingual-MiniLM-L12-v2 |   0.600 |    0.960 | 0.714 |
| partial title + surname | dense:multilingual-e5-small                  |   0.235 |    0.490 | 0.317 |
| partial title + surname | hybrid:multilingual-e5-small                 |   0.525 |    0.960 | 0.653 |
| partial title + surname | original-ivf:all-MiniLM-L6-v2                |   0.475 |    0.760 | 0.566 |
| description phrase      | tfidf                                        |   0.880 |    1.000 | 0.934 |
| description phrase      | keyword                                      |   0.890 |    1.000 | 0.940 |
| description phrase      | dense:all-MiniLM-L6-v2                       |   0.460 |    0.725 | 0.550 |
| description phrase      | hybrid:all-MiniLM-L6-v2                      |   0.725 |    0.965 | 0.806 |
| description phrase      | dense:paraphrase-multilingual-MiniLM-L12-v2  |   0.380 |    0.645 | 0.460 |
| description phrase      | hybrid:paraphrase-multilingual-MiniLM-L12-v2 |   0.650 |    0.955 | 0.744 |
| description phrase      | dense:multilingual-e5-small                  |   0.415 |    0.720 | 0.500 |
| description phrase      | hybrid:multilingual-e5-small                 |   0.750 |    0.995 | 0.839 |
| description phrase      | original-ivf:all-MiniLM-L6-v2                |   0.440 |    0.690 | 0.525 |
