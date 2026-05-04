# Search Strategy Reference

## arXiv Query Syntax

arXiv supports boolean field-prefixed queries through the Atom API.

### Field Prefixes

| Prefix | Field       | Notes                                        |
| ------ | ----------- | -------------------------------------------- |
| `ti:`  | Title       | Matches words in the title                   |
| `au:`  | Author      | Last name or "lastname_firstname"            |
| `abs:` | Abstract    | Matches words in the abstract                |
| `cat:` | Category    | arXiv category (e.g., cs.CL, cs.AI, stat.ML) |
| `all:` | All fields  | Searches across all metadata                 |
| `co:`  | Comment     | Author comments field                        |
| `jr:`  | Journal ref | Journal reference field                      |

### Boolean Operators

- `AND` — both terms must match
- `OR` — either term matches
- `ANDNOT` — first term matches, second does not

Operators must be uppercase. Implicit operator between terms is AND.

### Examples

```
# Papers about attention in NLP
ti:attention AND cat:cs.CL

# Papers by Vaswani about transformers
au:vaswani AND ti:transformer

# RAG papers excluding computer vision
abs:retrieval augmented generation ANDNOT cat:cs.CV

# Multi-author collaboration
au:bengio AND au:lecun

# Recent survey papers
ti:survey AND abs:large language models AND cat:cs.CL
```

### arXiv Categories (Common CS/AI)

| Category | Description                    |
| -------- | ------------------------------ |
| cs.AI    | Artificial Intelligence        |
| cs.CL    | Computation and Language (NLP) |
| cs.CV    | Computer Vision                |
| cs.LG    | Machine Learning               |
| cs.IR    | Information Retrieval          |
| cs.SE    | Software Engineering           |
| cs.CR    | Cryptography and Security      |
| cs.DB    | Databases                      |
| cs.DC    | Distributed Computing          |
| cs.HC    | Human-Computer Interaction     |
| stat.ML  | Machine Learning (Statistics)  |

## Semantic Scholar API

Base URL: `https://api.semanticscholar.org/graph/v1`

### Paper Search

```
GET /paper/search?query=QUERY&limit=20&fields=title,authors,abstract,year,citationCount,externalIds,venue
```

### Paper Details (by arXiv ID)

```
GET /paper/ARXIV:2301.07041?fields=title,authors,abstract,year,citationCount,references,citations
```

### Citation Graph

```
# Papers that cite a given paper
GET /paper/ARXIV:2301.07041/citations?fields=title,authors,year,citationCount&limit=50

# Papers referenced by a given paper
GET /paper/ARXIV:2301.07041/references?fields=title,authors,year,citationCount&limit=50
```

### Rate Limits

- Without API key: 100 requests per 5 minutes
- With API key (free): 1 request per second

## Search Strategy Patterns

### Exhaustive Search (Systematic Review)

1. Define 3-5 query variations covering different terminology
2. Run each query across arXiv and Semantic Scholar
3. Deduplicate by arXiv ID or DOI
4. Apply date range filter post-search
5. Track query-to-result mapping for reproducibility

### Targeted Search (Related Work)

1. Start from 2-3 known key papers
2. Forward snowball: papers citing them (Semantic Scholar citations endpoint)
3. Backward snowball: papers they reference (Semantic Scholar references endpoint)
4. Fill gaps with keyword search for uncovered themes

### Exploratory Search (Scoping Review)

1. Single broad query, sorted by citation count
2. Identify top-cited papers as anchors
3. Read abstracts to identify sub-themes
4. Refine queries for each sub-theme
5. Stop when new queries return mostly already-seen papers (saturation)
