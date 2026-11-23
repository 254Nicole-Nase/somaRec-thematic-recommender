# Independent form review pilot

The [seven ballots](../experiments/catalog_v2/readiness/review_packet.json) cover *Juices* and *Sauti ya dhiki* (poetry), *Maua kwenye jua la asubuhi* and *Betrayal in the City* (play), and *Petals of Blood*, *Kidagaa Kimemwozea* and *Dust* (novel). The selection spans retained, previously corrected and newly proposed claims. No real decisions have been supplied.

Open one ballot at a time. Compare the exact work, author and bibliographic source with its proposed form. Each ballot contains the frozen assertion, proposed assertion, exact public references, both fingerprints, an evidence note, competing source identities, linked edition IDs, ISBN conflicts and legacy candidates. The `ballot_assertion.fingerprint` is the one to decide. The two fingerprints differ for a new replacement. Approval covers only `literary_form` for the named work.

**Record your own decision** in a private JSON array. For each ballot you review, copy its `work_id`, `field` and ballot fingerprint verbatim into an object with keys `work_id`, `field`, `fingerprint`, `status`, `reviewer`, `evidence` and `note`. Supply your own reviewer identifier, a non-empty array of exact public evidence URLs you checked, and a concise reason. Omit unreviewed ballots. The existing format has no timestamp or separate reject field.

| Reviewer action | Entry to record | Approved-only effect |
| --- | --- | --- |
| Approve | Use `verified` when the sources establish both the work and the asserted form. Explain how. | This claim may match. Other fields require their own decisions. |
| Reject a contradicted or misattributed claim | Use `conflicting`, cite the contradiction, and state the rejection and reason in the note. | Withholds the claim in both policies. Editorial correction is a separate step. |
| Request more evidence | Use `needs_review`. Identify the missing source or unresolved edition detail. | Withholds the claim from approved-only. It remains provisional in diagnostics. |

The packet generator uses only the saved catalog and editorial inputs. It never invokes retrieval. From the repository root:

```sh
python backend/prepare_form_pilot.py --output-dir /tmp/somarec-pilot-input
diff experiments/catalog_v2/readiness/review_packet.json /tmp/somarec-pilot-input/review_packet.json
```

After an independent reviewer supplies the decision file, set `review_file` to its actual path and run:

```sh
review_file=/path/to/actual-reviewer-decisions.json
python backend/review_catalog_v2.py \
  --corrections /tmp/somarec-pilot-input/pilot_corrections.json \
  --decisions "$review_file" \
  --queries experiments/catalog_v2/readiness/pilot_smoke.json \
  --output-dir /tmp/somarec-reviewed-pilot
```

Inspect `evaluation_approved_only.json` and the corresponding `literary_profiles.json` in that output directory. The three form lookups are smoke checks for access to accepted metadata; they cannot measure literary relevance. Check whether each returned explanation cites the reviewed field, status and fingerprint, whether rejected and pending claims are absent, and whether missing approvals account for empty lists. Forms alone do not approve title display, language, or work-to-edition links. More than five eligible works may exceed the display limit. Record actual observations, the subset adjudicated and any failures. If a fingerprint fails validation, regenerate the packet and review the changed assertion before deciding it.

The committed synthetic tests exercise this same boundary with deliberately fabricated unit-test ballots held in memory. Their outcomes are engineering checks. The genuine pilot remains pending and requires independent reviewer input. Neither process uses the 15 held-out discovery requests.
