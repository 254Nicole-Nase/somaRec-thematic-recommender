# Invitation to write ten reader requests

Please work from your own reading experience, conversations with readers or knowledge of Kenyan books. Before opening any search results, catalog exports, taxonomy, development queries or ranking code, make a private copy of the [blank author input](../experiments/catalog_v2/readiness/holdout_b_author_input.json). Submit that file to the evaluation coordinator. No need to run SomaRec.

Write four requests in English, three in Kiswahili and three in naturally mixed language. Aim for requests where you believe a Kenyan book could meet the need. At least two should plausibly admit several books. Across the ten, vary literary form, setting, theme and reader interest. Use the words a reader would actually type. There is no requirement to name a book.

Keep the supplied IDs and languages. Fill in each request, its intent, your chosen identifier and the actual creation date (YYYY-MM-DD). For the broad category use one of `theme`, `genre`, `literary_interest`, `ambiguous` or `irrelevant`; use literary_interest for a setting or a form-related reading need if appropriate. Set `potentially_multiple` to true or false. If you already know possible books independently, list them in `expected_candidates`; an empty list is valid. Record doubts or possible alternate interpretations in `uncertainty_notes`. Candidates and the multi-book flag are hypotheses, with no relevance scores attached.

If you have seen either the implementation or results that might influence your wording, disclose that to the coordinator before submitting. A new independent author can supply replacement requests before sealing.
