# Citation Formats Reference

## In-Text Citation Styles

### APA 7th Edition

- Single author: `(Smith, 2023)` or `Smith (2023)`
- Two authors: `(Smith & Jones, 2023)` or `Smith and Jones (2023)`
- Three+ authors: `(Smith et al., 2023)` or `Smith et al. (2023)`
- Multiple citations: `(Smith, 2023; Jones et al., 2022)` — chronological order
- Direct quote: `(Smith, 2023, p. 42)`

### IEEE

- Numbered brackets: `[1]`, `[2]`, `[1], [3]`, `[1]–[5]`
- Ordered by appearance in text, not alphabetically

### Chicago (Author-Date)

- Single author: `(Smith 2023)` or `Smith (2023)`
- Two authors: `(Smith and Jones 2023)`
- Three+ authors: `(Smith et al. 2023)`

### ACM

- Numbered brackets: `[Smith et al. 2023]` or `[42]`
- Varies by venue (numbered vs. author-date)

## Reference List Formats

### APA 7th Edition

```
Smith, J. A., & Jones, B. C. (2023). Title of the paper in sentence case.
    Journal Name in Title Case, 42(3), 123–145.
    https://doi.org/10.1234/example

Smith, J. A., Jones, B. C., & Lee, D. (2023). Conference paper title.
    In Proceedings of the Conference Name (pp. 100–110). Publisher.
    https://doi.org/10.1234/example
```

### IEEE

```
[1] J. A. Smith and B. C. Jones, "Title of the paper in sentence case,"
    Journal Name, vol. 42, no. 3, pp. 123–145, Mar. 2023,
    doi: 10.1234/example.

[2] J. A. Smith, B. C. Jones, and D. Lee, "Conference paper title,"
    in Proc. Conf. Name, City, Country, 2023, pp. 100–110.
```

### arXiv Preprint

```
# APA
Smith, J. A., & Jones, B. C. (2023). Title of the preprint. arXiv.
    https://arxiv.org/abs/2301.07041

# IEEE
[1] J. A. Smith and B. C. Jones, "Title of the preprint," arXiv preprint
    arXiv:2301.07041, 2023.
```

## Default Format for Literature Reviews

When no format is specified, use **APA-style author-date** in-text citations with a full reference list at the end. This is the most widely recognized format in AI/ML research contexts.

For NLP and AI conference papers (ACL, EMNLP, NeurIPS, ICML, ICLR), note that published versions take precedence over arXiv preprints. Cite the venue version when available, with arXiv as a secondary link.

## Constructing Citations from arxiv-search Output

The `arxiv-search` utility returns:

```json
{
  "id": "2301.07041v1",
  "title": "Paper Title",
  "authors": ["First Author", "Second Author"],
  "published": "2023-01-17T18:59:00+00:00",
  "doi": "10.1234/example",
  "journal_ref": "Nature 2023",
  "entry_url": "http://arxiv.org/abs/2301.07041v1"
}
```

Map to APA:

```
Author, F., & Author, S. (2023). Paper title. Nature.
    https://doi.org/10.1234/example
```

If `journal_ref` is null (preprint only):

```
Author, F., & Author, S. (2023). Paper title. arXiv.
    https://arxiv.org/abs/2301.07041
```
