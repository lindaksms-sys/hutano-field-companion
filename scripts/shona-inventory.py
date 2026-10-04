#!/usr/bin/env python3
"""Generate docs/shona-translation.csv from the actual source code (synthetic data only).

  python3 scripts/shona-inventory.py

Rows:
  - UI text: JSX text, user-facing attributes and quoted user-facing messages in app screens/libs
    (src/routes, src/components except ui/, selected src/lib and src/domain files).
  - i18n draft dictionary (src/lib/i18n.tsx) with current Shona drafts.
  - Extraction cue dictionary (SHONA_CUES and Shona words inside rule/check regexes).
  - Meaning distinctions the reviewer must confirm.
  - Synthetic Shona/mixed examples: demo fixtures, eval dev + held-out (FROZEN originals).
Keys are stable: <category>.<file>.<sha1(text)[:8]>.
Heuristic extraction: see docs/shona-review.md "Known gaps" for dynamic strings it cannot see.
"""
import csv, hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "shona-translation.csv"
COLS = ["key", "category", "english_source_meaning", "current_shona_draft", "reviewer_proposed_shona", "context_placeholders", "notes"]

UI_FILES = sorted(
    [*ROOT.glob("src/routes/*.tsx"), *[p for p in ROOT.glob("src/components/*.tsx")],
     *[ROOT / f for f in ["src/lib/labels.ts", "src/lib/auth.tsx", "src/lib/ai-model.ts", "src/lib/use-offline.ts",
                          "src/lib/pwa.ts", "src/lib/sync-runner.ts", "src/lib/hooks.ts", "src/lib/error-page.ts",
                          "src/domain/repository.ts", "src/domain/sync.ts", "src/domain/extraction.ts",
                          "src/domain/ai-extraction.ts", "src/domain/fixtures.ts"]]]
)
SKIP_FILES = {"src/lib/i18n.tsx"}
ATTRS = ("placeholder", "aria-label", "title", "label", "note", "alt")
NON_UI = re.compile(r"^(?:[a-z0-9_.:/@#\-\[\]]+|[A-Z_]+|https?://.*|.*\.(?:ts|tsx|js|json|png|ico|svg|webmanifest)|use client)$")

SPLIT_FRAGMENTS = {"Account created for",
    ". Open the confirmation link sent to that address, then sign in here. You can keep capturing offline meanwhile.",
    "Signed in as"}
rows, seen = [], set()


def key(cat, src, text):
    return f"{cat}.{src}.{hashlib.sha1(text.encode()).hexdigest()[:8]}"


def add(cat, src, en, sn="", ctx="", notes=""):
    en = re.sub(r"\s+", " ", en).strip()
    if not en:
        return
    k = key(cat, src, en)
    if k in seen:
        return
    seen.add(k)
    rows.append({"key": k, "category": cat, "english_source_meaning": en, "current_shona_draft": sn,
                 "reviewer_proposed_shona": "", "context_placeholders": ctx, "notes": notes})


def ui_category(path: str, text: str) -> str:
    t = text.lower()
    if "auth" in path or re.search(r"sign[ -]?in|sign[ -]?up|password|email|account|confirm", t):
        return "auth"
    if "sync" in path or re.search(r"\bsync|upload|queue|backend", t):
        return "sync"
    if re.search(r"offline|install|download|model|on-device|cache", t):
        return "offline_ai_install"
    if re.search(r"fail|error|could not|not saved|cannot|invalid|stale|timed out", t):
        return "error"
    if re.search(r"privacy|synthetic|real patient|diagnos|advice|shared device|unencrypted", t):
        return "safety_privacy"
    if re.search(r"verif|review|pending|accept|not recorded|edited|draft", t):
        return "review_states"
    return "ui"


STOP_IDS = {"Math", "round", "String", "e", "as", "Error", "message", "toFixed", "length", "slice", "join", "n", "x", "d", "rec", "extraction", "ai", "manifest", "s", "m", "r", "Number", "new", "Date", "toLocaleString", "null", "undefined", "String", "ms", "1000", "1e6"}
def ph_name(expr: str) -> str:
    ids = [t for t in re.findall(r"[A-Za-z_][A-Za-z0-9_]*", expr) if t not in STOP_IDS]
    return ids[-1] if ids else "value"


CODEY = re.compile(r";|=>|useState|Promise|const |\|\||&&|\s=\s|\]\+|\(\)|\)\.|typeof |\bvoid\b|null\)")
def user_facing(s: str) -> bool:
    s = s.strip()
    if s.startswith((":", "width=")) or "===" in s or s in ("Linda Kisimisi",):
        return False
    if CODEY.search(s) or re.match(r"^[A-Z]{2,5}-\d+$", s):
        return False
    if len(s) < 2 or not re.search(r"[A-Za-z]{2}", s) or NON_UI.match(s):
        return False
    if re.search(r"\b(?:bg|text|border|rounded|flex|grid|px|py|mt|mb|gap|h|w|min|max|sm|md|lg)-", s):
        return False  # tailwind classes
    if s.startswith(("@/", "./", "../", "hutano.", "sb-", "--")) or re.match(r"^[a-z]+(?:[A-Z][a-z]+)+$", s):
        return False  # imports, storage keys, camelCase identifiers
    return bool(re.search(r"[A-Z]", s[:1]) or " " in s)


for p in UI_FILES:
    rel = str(p.relative_to(ROOT))
    if rel in SKIP_FILES or not p.exists():
        continue
    src = p.stem.replace(".", "_").replace("$", "")
    code = p.read_text(encoding="utf-8")
    code_nc = re.sub(r"/\*[\s\S]*?\*/", "", code)
    code_nc = "\n".join(l for l in code_nc.splitlines() if not l.strip().startswith(("//", "import ", "*", "export type", "type ")))
    found = []
    # JSX text between tags
    for m in re.finditer(r">([^<>{}]*[A-Za-z][^<>{}]*)<", code_nc):
        found.append((m.group(1), "JSX text"))
    # attributes
    for a in ATTRS:
        for m in re.finditer(rf'\b{re.escape(a)}[=:]\s*"([^"]+)"', code_nc):
            found.append((m.group(1), f"{a} attribute"))
    # quoted strings ("..." and '...') and template literals
    for m in re.finditer(r'"((?:[^"\\\n]|\\.)*)"', code_nc):  # double-quoted only (avoids apostrophes)
        s = m.group(1)
        pre = code_nc[max(0, m.start() - 40):m.start()]
        if re.search(r"(className|class|from|import|key|type|id|name|role|tone|variant|size|href|to|rel|lang|property|content: \"width)\s*[=:]\s*\(?$", pre):
            continue
        if re.search(r"(new RegExp|\.test|\.match|\.replace|\.split|\.includes|\.startsWith|\.endsWith|getItem|setItem|querySelector|addEventListener|\.get|\.has)\(\s*$", pre):
            continue
        found.append((s, "message string"))
    # Template literals are NOT scanned: full templates are hand-written in MANUAL_TEMPLATES below.
    for text, kind in found:
        text = text.replace("\\n", " ").strip()
        if text in SPLIT_FRAGMENTS:
            continue
        if not user_facing(text):
            continue
        if rel == "src/domain/fixtures.ts" and not text.endswith("example"):
            continue  # narratives/mappings handled in the examples section; only titles are UI
        if rel == "src/domain/ai-extraction.ts" and kind != "message string":
            continue
        if rel == "src/domain/ai-extraction.ts" and not (re.search(r"too long|empty|No sentences|Too many|Model (returned|output)|Shona:|On-device AI", text)):
            add("out_of_scope_model_prompt", src, text, ctx=f"{rel} · model prompt", notes="Model prompt text. NOT for translation (changing it changes evaluated behaviour).")
            continue
        ph = ", ".join(sorted(set(re.findall(r"\{[A-Za-z0-9_.]+\}", text))))
        add(ui_category(rel, text), src, text, ctx=f"{rel} · {kind}" + (f" · placeholders: {ph}" if ph else ""),
            notes="Keep placeholders exactly; reorder words around them if natural." if ph else "")

# i18n draft dictionary
i18n = (ROOT / "src/lib/i18n.tsx").read_text(encoding="utf-8")
for m in re.finditer(r"(\w+):\s*\{\s*en:\s*\"([^\"]+)\",\s*sn:\s*\"([^\"]+)\"", i18n):
    add("i18n_core", "i18n", m.group(2), m.group(3), f"src/lib/i18n.tsx key {m.group(1)}", "Existing DRAFT Shona; confirm or replace.")

# cue dictionary
rules = (ROOT / "src/domain/rules.ts").read_text(encoding="utf-8")
cue_meaning = {
    "makore": "years (age: 'ane makore 4' = is 4 years old)", "mwedzi": "months (age in months)",
    "rimwe": "one", "mumwe": "one (other noun class)", "maviri": "two", "mbiri": "two (other class)", "matatu": "three",
    "mana": "four", "mashanu": "five", "matanhatu": "six", "manomwe": "seven", "masere": "eight", "mapfumbamwe": "nine", "gumi": "ten",
    "kwemazuva": "for … days (duration)", "kwemavhiki": "for … weeks", "kwesvondo": "for … week", "kwemasvondo": "for … weeks",
    "kwemwedzi": "for … months", "kwemakore": "for … years (duration, NOT age)", "kwenguva": "for a period of",
    "anogara": "lives (at/in)", "anobva": "comes from", "amai": "mother", "baba": "father", "mukoma": "older sibling",
    "hanzvadzi": "sibling of opposite sex", "sekuru": "grandfather / maternal uncle", "ambuya": "grandmother",
    "murume": "man OR husband (ambiguous; currently treated as another person -> over-abstains)",
    "mukadzi": "woman OR wife (ambiguous; currently treated as another person -> over-abstains)",
    "tete": "paternal aunt", "babamunini": "father's younger brother", "ndichadzoka": "I will come back (worker follow-up)",
    "dzoka": "come back / return", "achadzoka": "he/she will come back", "svondo rinouya": "next week",
}
cues = re.search(r"SHONA_CUES = \{([\s\S]*?)\} as const;", rules).group(1)
for w in sorted(set(re.findall(r'"([a-z][a-z ]+)"', cues)) | set(re.findall(r"\b([a-z]+):\s*\d", cues))):
    add("cue_dictionary", "rules", cue_meaning.get(w, w), w, "src/domain/rules.ts SHONA_CUES (draft)",
        "Give common spellings/variants and whether the meaning is right in rural VHW notes.")
extra = {
    "vanoti": "they say (respectful; carer reports)", "anoti": "he/she says (patient reports)", "akati": "he/she said",
    "vakati": "they said (respectful)", "anochema": "complains / cries of", "anonyunyuta": "complains of", "ari kunzwa": "is feeling",
    "ndaona": "I have seen/observed (worker observation)", "ndakaona": "I saw (worker observation)", "ndakatarisa": "I looked at/checked",
    "ndayera": "I have measured", "ndakayera": "I measured", "hapana": "there is no / none (negation)", "hakuna": "there is none (negation)",
    "haana": "he/she does not have (negation)", "ndichauya": "I will come", "ndichadzokera": "I will return to", "rinouya": "coming/next",
    "tichaona": "we will see (follow-up)", "kurwara": "to be sick", "ari kurwara": "is sick", "rwadzo": "pain", "kurwadza": "to hurt",
    "anorwadza": "it hurts", "chikosoro": "cough", "manyoka": "diarrhoea", "fivha": "fever", "musoro": "head / headache",
    "dzihwa": "cold / runny nose", "kurutsa": "vomiting", "haadyi": "does not eat", "haarari": "does not sleep",
    "nhasi": "today", "nezuro": "yesterday", "kubva nezuro": "since yesterday (duration)", "mangwana": "tomorrow",
    "akazvarwa": "was born", "musha": "village / home", "dunhu": "ward / district", "zuva": "day / date", "mwana": "child",
    "mukomana": "boy", "musikana": "girl", "murwere": "patient", "kuMutasa": "at/to Mutasa (ku- location prefix)",
}
for w, mng in extra.items():
    add("cue_dictionary", "checks", mng, w, "src/domain/rules.ts / ai-extraction.ts cue regex (draft)",
        "Used only to filter/abstain, never to create values. Add variants and correct meaning.")

# meaning distinctions
for en, notes in [
    ("Missing: the note does not say it (field empty)", "Distinguish from 'not recorded' and from a negative finding."),
    ("Not recorded: worker confirms it was not recorded, with a reason", "Different from missing and from 'no fever'."),
    ("Negative finding: checked and absent, e.g. 'no fever' / 'Hapana fivha'", "Must stay a statement of absence."),
    ("Patient (the person being seen)", "Who the record is about."),
    ("Carer / caregiver (reports on behalf of the patient)", "e.g. amai vanoti."),
    ("Health worker / VHW (the person writing the note)", "First person ndaona, ndichadzoka."),
    ("Age of the patient (e.g. 4 years old / ane makore 4)", "Never confuse with duration."),
    ("Duration of the problem (e.g. for 3 days / kwemazuva matatu)", "Never confuse with age; kwemakore = for years."),
    ("Woman vs wife (mukadzi)", "How do VHWs write 'a woman aged 25' vs 'his wife'? Rules currently abstain."),
    ("Man vs husband (murume)", "Same question as mukadzi."),
    ("Yes / affirmed (e.g. ehe, hongu)", "Common affirmative spellings in notes."),
    ("No / denied (e.g. kwete, hapana, haana)", "Common negation forms."),
    ("Today / yesterday / tomorrow / next week / last week", "nhasi, nezuro, mangwana, svondo rinouya, svondo rapera?"),
    ("Lives in / comes from / at (village)", "anogara, anobva, ku-/mu- prefixes."),
    ("Village / ward labels written in notes", "musha, dunhu, Ward; common abbreviations."),
    ("Patient-reported problem (concern)", "What the patient/carer says."),
    ("Worker-observed or measured finding (observation)", "What the worker saw/measured."),
    ("Explicit worker follow-up plan (not advice)", "Only what the worker wrote they will do."),
]:
    add("meaning_distinction", "concepts", en, "", "Concept for parsers and UI wording", notes)

# synthetic examples
fx = (ROOT / "src/domain/fixtures.ts").read_text(encoding="utf-8")
for m in re.finditer(r'id: "([^"]+)",\s*title: "[^"]*",\s*language: "(sn|mixed)",\s*narrative:\s*"([^"]+)"', fx):
    add("synthetic_example_demo", "fixtures", m.group(3), m.group(3), f"src/domain/fixtures.ts {m.group(1)} ({m.group(2)})",
        "Demo fixture. Reviewer may propose natural rewording; mappings must then be updated together.")
for split in ("dev", "heldout"):
    data = json.loads((ROOT / f"eval/cases.{split}.json").read_text(encoding="utf-8"))
    for c in data["cases"]:
        if c["language"] in ("sn", "mixed"):
            add(f"synthetic_example_{split}", "eval", c["narrative"], c["narrative"], f"eval/cases.{split}.json {c['id']} ({c['language']}) · {c['notes']}",
                "FROZEN benchmark original. Proposed rewording goes into a NEW versioned file; existing metrics are never silently changed.")

# Priority batch 1: core workflow + meanings/cues. Marked in notes and sorted first.
# Hand-written full messages (named placeholders). Replaces regex-captured templates and split JSX fragments.
PH = "Keep {placeholders} exactly; reorder words around them if natural."
MANUAL_TEMPLATES = [
 ("manual.auth.account_created", "auth", "Account created for {email}. Open the confirmation link sent to that address, then sign in here. You can keep capturing offline meanwhile.", "src/routes/auth.tsx · sign-up confirmation · {email} = address typed by the user", "[P1] " + PH),
 ("manual.auth.signed_in_as", "auth", "Signed in as {email}", "src/routes/auth.tsx · account card · {email} shown on its own line below this label", PH),
 ("manual.ai.storage_read_failed", "offline_ai_install", "Could not read model storage: {errorMessage}", "src/lib/ai-model.ts · {errorMessage} = raw browser error (not translated)", PH),
 ("manual.ai.diag_ram", "offline_ai_install", "~{gb} GB RAM reported", "src/lib/ai-model.ts · diagnostic text · {gb} = number", PH),
 ("manual.ai.diag_mobile", "offline_ai_install", "mobile", "src/lib/ai-model.ts · diagnostic text, device type", "Usually left in English inside copied diagnostics."),
 ("manual.ai.gpu_status", "offline_ai_install", "GPU: {status}", "src/lib/ai-model.ts · diagnostic · {status} = one of: available / not available / unknown (rows manual.ai.gpu_*)", PH),
 ("manual.ai.gpu_available", "offline_ai_install", "available", "value for {status} in GPU: {status}", ""),
 ("manual.ai.gpu_not_available", "offline_ai_install", "not available", "value for {status} in GPU: {status}", ""),
 ("manual.ai.gpu_unknown", "offline_ai_install", "unknown", "value for {status} in GPU: {status}", ""),
 ("manual.ai.not_enough_storage", "offline_ai_install", "Not enough browser storage: about {freeMb} MB free, about {neededMb} MB needed.", "src/lib/ai-model.ts · before download · {freeMb}, {neededMb} = numbers", "[P1] " + PH),
 ("manual.ai.worker_start_failed", "error", "Could not start the AI worker: {errorMessage}", "src/lib/ai-model.ts · {errorMessage} = raw browser error", PH),
 ("manual.ai.download_stalled", "error", "No download progress for {seconds} s (stalled).", "src/lib/ai-model.ts · watchdog · {seconds} = number", PH),
 ("manual.ai.stage_timeout", "error", "Timed out after {seconds} s during {stage}.", "src/lib/ai-model.ts · watchdog · {stage} = technical step name (download/initialize/verify), stays English", PH),
 ("manual.ai.worker_error", "error", "Worker error: {errorMessage}", "src/lib/ai-model.ts · {errorMessage} = raw error, or the fallback row manual.ai.worker_crashed", PH),
 ("manual.ai.worker_crashed", "error", "worker crashed or failed to load", "fallback value for {errorMessage} in Worker error", ""),
 ("manual.review.not_verified", "review_states", "Not verified: {errorMessage}", "src/routes/encounters.$id.tsx · verify failed · {errorMessage} = raw storage error", PH),
 ("manual.review.adopt_failed", "error", "Adopt failed: {errorMessage}", "src/routes/encounters.$id.tsx and src/routes/sync.tsx", PH),
 ("manual.review.extraction_none", "review_states", "{adapterLabel} · no suggestions ({failureReason}) — fill fields manually", "src/routes/encounters.$id.tsx · {adapterLabel} = Manual / Demo extraction — not AI / On-device AI (experimental); {failureReason} = app reason text", PH),
 ("manual.review.extraction_summary", "review_states", "{adapterLabel} · {modelId} ({backend}/{dtype}) · {seconds} s · rules: {ruleCount} field(s), AI: {aiCount} field(s) · check each against the note", "src/routes/encounters.$id.tsx · AI provenance line · {modelId}/{backend}/{dtype} technical, stay English. Optional suffixes follow: manual.review.summary_warning, manual.review.summary_discarded", PH),
 ("manual.review.summary_warning", "review_states", " · {warning}", "optional suffix · {warning} = Shona/mixed warning text (separate row)", PH),
 ("manual.review.summary_discarded", "review_states", " · {count} invalid selection(s) discarded", "optional suffix of extraction summary", PH),
 ("manual.review.fields_empty", "review_states", "{count} field(s) empty — fill or mark \"not recorded\".", "src/routes/encounters.$id.tsx · verify blocker", "[P1] " + PH),
 ("manual.review.no_reason", "review_states", "{count} \"not recorded\" without reason.", "src/routes/encounters.$id.tsx · verify blocker", "[P1] " + PH),
 ("manual.new.write_failed", "error", "Not saved. Local storage write failed: {errorMessage}", "src/routes/encounters.new.tsx · {errorMessage} = raw storage error", "[P1] " + PH),
 ("manual.new.ai_no_suggestions", "offline_ai_install", "Draft saved. On-device AI gave no suggestions: {reason} Continue with manual review.", "src/routes/encounters.new.tsx · {reason} = app reason sentence (timeout/cancel/invalid output)", PH),
 ("manual.new.extraction_failed", "error", "Draft saved, but extraction failed: {errorMessage}", "src/routes/encounters.new.tsx", PH),
 ("manual.settings.export_failed", "error", "Export failed: {errorMessage}", "src/routes/settings.tsx", PH),
 ("manual.settings.delete_failed", "error", "Delete failed: {errorMessage}", "src/routes/settings.tsx", PH),
 ("manual.sync.offline", "sync", "Offline — {sent} sent, {remaining} kept in queue.", "src/routes/sync.tsx · result · numbers", PH),
 ("manual.sync.auth_paused", "sync", "Paused: sign-in required ({errorMessage}). {remaining} kept in queue; retries after sign-in.", "src/routes/sync.tsx · {errorMessage} = raw sign-in service error", PH),
 ("manual.sync.done", "sync", "Server acknowledged {sent}. {remaining} still queued.", "src/routes/sync.tsx · result · optional parts inserted before the final full stop: manual.sync.done_rejected, manual.sync.done_last_error", "[P1] " + PH),
 ("manual.sync.done_rejected", "sync", ", {rejected} rejected", "optional insert in manual.sync.done", PH),
 ("manual.sync.done_last_error", "sync", " — last error: {errorMessage}", "optional insert in manual.sync.done · {errorMessage} raw", PH),
]
for k, cat, en, ctx, notes in MANUAL_TEMPLATES:
    rows.append({"key": k, "category": cat, "english_source_meaning": en, "current_shona_draft": "",
                 "reviewer_proposed_shona": "", "context_placeholders": "hand-written full template · " + ctx, "notes": notes})

P1_TEXT = {
    "Patient code", "Age (with units if stated)", "Village / ward", "Encounter date", "Reported concern", "Stated duration",
    "Worker-recorded observations", "Follow-up notes (worker-entered)", "Empty", "Suggestion pending", "Accepted",
    "Edited by worker", "Not recorded", "Draft", "Needs review", "Verified", "Accept suggestion", "Mark not recorded",
    "Verify record", "Save changes", "Original narrative", "Reason (e.g. not stated by client)",
    "Unknown — leave empty if not stated", "I reviewed every field against the original narrative and confirm this record is accurate.",
    "What happened during the visit?", "Use synthetic data only. Do not enter real names or identifiers.",
    "Save draft & fill in manually", "On this device only", "Verified — waiting to upload", "Synced", "Sync now",
}
P1_CATS = {"i18n_core", "meaning_distinction"}
P1_CUES = {"makore", "mwedzi", "kwemazuva", "kwesvondo", "kwemakore", "anogara", "amai", "baba", "mukadzi", "murume",
           "vanoti", "anoti", "ndaona", "ndakaona", "hapana", "hakuna", "ndichadzoka", "nhasi", "nezuro", "musha", "dunhu", "mwana", "murwere"}
for r in rows:
    if r["english_source_meaning"] in P1_TEXT or r["category"] in P1_CATS or (r["category"] == "cue_dictionary" and r["current_shona_draft"] in P1_CUES):
        if not r["notes"].startswith("[P1]"):
            r["notes"] = ("[P1] " + r["notes"]).strip()
rows.sort(key=lambda r: 0 if r["notes"].startswith("[P1]") else 1)

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    w.writerows(rows)
from collections import Counter
print(len(rows), "rows;", sum(r["notes"].startswith("[P1]") for r in rows), "priority-1")
for k, v in sorted(Counter(r["category"] for r in rows).items()):
    print(f"  {k}: {v}")
