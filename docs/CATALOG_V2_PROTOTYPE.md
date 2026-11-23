# Catalog V2 prototype and comparative quality report

Run and reviewed on 23 November 2026. The sample is a local research dataset kept under [experiments/catalog_v2](../experiments/catalog_v2), separate from the production catalog. See the [source and licensing review](CATALOG_V2_SOURCES.md), [data model and roadmap](CATALOG_V2_DESIGN.md), and [recommendation feasibility study](CATALOG_V2_RECOMMENDATIONS.md).

## Reproduce the sample

From the repository root, with Python 3.11 or later and `Unidecode` installed:

```sh
python backend/catalog_v2.py --build /tmp/catalog-v2
cmp /tmp/catalog-v2/sample.json experiments/catalog_v2/sample.json
cmp /tmp/catalog-v2/sample.csv experiments/catalog_v2/sample.csv
cmp /tmp/catalog-v2/quality.json experiments/catalog_v2/quality.json
python -m pytest backend/tests/test_catalog_v2.py -q
```

- `seeds.json` records editorial candidates, scoped name variants, provider query IDs and manually checked bibliographic citations. It includes draft original summaries where enough evidence was found. The seeds are intentionally selected. This is a verification pipeline prototype with a bounded discovery process, not a general-purpose nationwide harvester.
- `evidence.json` preserves only selected bibliographic fields from real Open Library search and edition responses and Wikidata entity responses. Evidence was projected from local scratch responses obtained by low-volume HTTP retrieval. It includes capture date, accepted and conflicting candidate IDs, title/contributor facts, links and request errors. Full provider payloads, blurbs, cover bytes, excerpts and books were excluded.
- `sample.json` separates contributors, works and linked edition candidates. `sample.csv` is a work-level review export. `quality.json` records valid and rejected matches, unresolved identity conflicts, edition and language coverage, and possible mappings to legacy UUIDs. The JSON ties each result to a version and fingerprint of the evidence and seed manifests.

To refresh against public bibliographic APIs, provide a public project contact and choose a new filename. This is allowed only as a bounded, low-volume refresh. Use the existing snapshot for routine runs. A refresh may differ as the source data changes.

```sh
python backend/catalog_v2.py \
  --capture /tmp/catalog-v2-new-evidence.json \
  --contact '<public project contact email>'
python backend/catalog_v2.py \
  --snapshot /tmp/catalog-v2-new-evidence.json \
  --build /tmp/catalog-v2-refreshed
```

The adapter serializes requests with at least 1.1 seconds between them and pauses requests to a provider after a rate limit response. Capture writes the recorded issues and exits nonzero if a request fails. Offline build rejects a snapshot that came from a different manifest. For unresolved cross-work identifier or title collisions it writes the quality report only and exits nonzero. Use a fresh output directory for each run. Compare snapshots before replacing frozen outputs.

## Observed results

| Metric | Catalog V2 sample | Equivalent legacy records |
| --- | --- | --- |
| Work coverage | 30 included from 32 seeds, 17 contributors. Two works quarantined. | 23 V2 works had title/author candidates across 24 legacy rows. The other seven are outside the comparison join. |
| Title and contributor | 30 works have a structured provider match plus a second provider or checked bibliographic citation. These sources may share lineage. | Name matching finds plausible candidates. It cannot establish that a legacy work, edition or contributor assignment was correct. |
| Work versus edition | 25 works have at least one selected Open Library edition candidate, with 97 edition records total. | Legacy stores a flat book row and no reliably separate edition entity. |
| Valid ISBN | 23 V2 works have at least one checksum-valid ISBN on an edition candidate. Among the 23 overlapping works, 16 do. | One of the 23 overlapping works has a checksum-valid ISBN on a matched legacy row. ISBN checksums validate structure only. |
| Edition language | 21 works have an edition marked English and four have one marked Kiswahili. There are no retained edition records in other languages in this bounded sample. Original language was left unknown. | Twenty-two of the 23 overlapping works had a language label on a legacy candidate. Twelve had a guessed label. The V2 overlap had edition-level language evidence for 18 works. These fields are not directly equivalent. |
| Forms and genres | 13 fiction, four poetry, three children’s, five memoir, four nonfiction and one drama. These are editorial form candidates. Fine-grained genres still need review. | All matching legacy rows have blank genre. |
| Synopsis provenance | Five original editorial drafts with sources. The other 25 are blank. No comprehensive accuracy review was attempted. | Nineteen overlapping works have descriptions on at least one candidate. Legacy data includes confirmed mismatches and generally lacks field-level synopsis sources. |
| Covers and access | No cover assets copied. Open Library catalog links give a checkable record and do not guarantee an available copy. | Some covers and generated links are present, with uneven source attribution and match quality. No cover accuracy or availability benchmark was run. |

### Which errors it prevented

- *Juices* is matched as Jared Angira’s work, with a library record identifying it as poems. Its unrelated *Columbia Guide* synopsis is absent. *Olduvai Gorge* was not selected for this literary sample, and the known wrong *Encyclopedia of Human Evolution* enrichment was not carried over. This is intentional source exclusion, not a claim that the prototype can detect arbitrary incorrect descriptions.
- Wikidata returned an unusable *Going Down River Road* candidate without an attributable author and a *The Challenge for Africa* candidate without a matching contributor claim. Those candidates were rejected. In the more general search, *A Grain of Wheat* also matched a painting, a useful illustration of why matching stops short of trusting result order.
- *Greedy Zebra* and *Tricky Tortoise* were quarantined because multiple exact-looking Open Library work hits could not be resolved to one provider identity. Paper Lion confirms the titles and pen name but does not resolve those competing Open Library IDs.
- *The Dragonfly Sea* is one V2 work, supported by Wikidata and a library bibliography. Both legacy UUIDs are retained as review candidates and neither was mapped or merged. V2 accepted no edition for it in this capture. For *The Challenge for Africa*, a checked publisher ISBN selects one of four Open Library work candidates. Its Wikidata edition was kept as edition evidence. The Wikidata cross-link for *Unbowed* names an edition. The pipeline only uses it where the Open Library evidence links that edition back to the matched work.
- Across the sample, three mismatched Open Library search hits, two pinned Wikidata candidates and 36 edition candidates were rejected. An edition can fail because the title, parent or ISBN claims do not reconcile. Rejection is a review signal and does not establish that the upstream record is wrong. The machine-readable report retains two Wikidata edition identities separately from work IDs, lists nine duplicate edition candidate groups by ISBN, and reports no cross-work identifier collision in the sample.

### Cost and limitations

The exploratory data acquisition used 36 Open Library search calls, 47 edition-list calls, 36 Wikidata search calls and two Wikidata entity batches, including comparisons that were kept outside the final manifest. The frozen sample has no recorded request failures. Official and institutional pages were inspected for hand-selected corroboration and rights. A separate live smoke run of the committed adapter retrieved *Petals of Blood* using four requests, and the offline builder returned one work and seven linked edition candidates. There were no paid API calls or model jobs in the prototype. The local offline build took under one second in this environment. Time for manual source review was not instrumented and is likely the largest cost at 150 books.

The pipeline caps responses at five Open Library work candidates and 12 editions per candidate. Earlier editions and translations can be missed. ISBN and language statements need edition-level human checking, and multiple providers may repeat one underlying record. The prototype handles controlled aliases and simple cross-links. It has no authority reconciliation across every contributor or translation system, no automated legal permissions review, and no ranking benchmark. It deliberately does not read the legacy data as metadata enrichment. Retain ambiguous mapping candidates and resolve them before any future UUID reconciliation.
