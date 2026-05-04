# Market Sizing Reference

## Data Triangulation Methodology

Never rely on a single data source. Triangulate every key estimate from at least two
independent sources or methods.

### Triangulation Process

1. **Gather estimates from multiple sources.** Seek at least two of: industry report,
   government data, bottom-up calculation, public company extrapolation, academic study.
2. **Compare methodologies.** Understand how each source derived its number. Top-down
   and bottom-up estimates have different systematic biases.
3. **Identify convergence.** Where sources agree, confidence increases. Where they
   diverge, investigate the root cause.
4. **Reconcile or range.** If sources can be reconciled (different definitions, different
   years), normalize and present a single figure. If they cannot, present a range with
   the methodology behind each bound.

### Source Hierarchy (Confidence Ranking)

1. Government statistical agencies (Census, BLS, OECD) — highest reliability
2. Public company filings (10-K, 10-Q) — audited, segment-level data
3. Industry associations — good for volume data, sometimes biased on growth
4. Market research firms (Gartner, IDC, Statista) — synthesized but methodology varies
5. Venture capital / investment bank reports — forward-looking, optimism bias
6. News articles and press releases — lowest reliability, use only for leads

## Estimation Techniques for Sparse Data

### Proxy Market Method

When direct market data does not exist, size a closely related market and adjust.

```
Target market size = Proxy market size x adjustment factor
```

Adjustment factors to consider:

- Target audience size relative to proxy audience
- Price point differential
- Adoption friction (higher friction = smaller adjustment)
- Geographic relevance

Document the proxy choice and adjustment rationale explicitly.

### Comparable Company Extrapolation

Use revenue data from known companies to estimate total market.

```
Estimated market size = Known company revenue / estimated market share
```

Sources for company revenue:

- Public filings (EDGAR, Companies House)
- Crunchbase estimated revenue ranges
- Job posting volume as revenue proxy (more employees = more revenue)
- LinkedIn headcount data

### Chain Ratio Method

Start from a large known quantity and multiply through a chain of ratios.

```
Market size = Population
  x % in target age range
  x % with relevant need
  x % with purchasing power
  x % reachable by channel
  x average spend per buyer
```

Each ratio should come from a different source. The chain is only as strong as its
weakest link — flag any ratio based on assumption rather than data.

### Fermi Estimation

For first-pass sizing when data is truly unavailable. Structure the problem as a series
of estimable components.

Rules:

- Break into 3-5 multiplicative factors
- Each factor should be estimable within an order of magnitude
- Cross-check the final result against any available benchmark
- Label as "Fermi estimate" — this is a starting point, not a conclusion

## Government and Public Data Sources

### United States

| Source                            | URL                 | Best For                                  |
| --------------------------------- | ------------------- | ----------------------------------------- |
| Census Bureau                     | census.gov          | Population, demographics, business counts |
| Bureau of Labor Statistics (BLS)  | bls.gov             | Employment, wages, consumer expenditure   |
| Bureau of Economic Analysis (BEA) | bea.gov             | GDP, industry output, regional economics  |
| Federal Reserve (FRED)            | fred.stlouisfed.org | Economic time series, monetary data       |
| SEC EDGAR                         | sec.gov/edgar       | Public company financials, segment data   |
| USPTO                             | uspto.gov           | Patent data for innovation tracking       |
| SBA Office of Advocacy            | sba.gov             | Small business statistics                 |
| USDA ERS                          | ers.usda.gov        | Agriculture and food industry data        |

### International

| Source               | URL                   | Best For                                |
| -------------------- | --------------------- | --------------------------------------- |
| World Bank Open Data | data.worldbank.org    | Global economic indicators, development |
| OECD Data            | data.oecd.org         | Cross-country economic comparisons      |
| UN Data              | data.un.org           | Population, trade, human development    |
| Eurostat             | ec.europa.eu/eurostat | European economic and social statistics |
| IMF Data             | data.imf.org          | Global financial and trade data         |
| WIPO                 | wipo.int              | International patent and IP statistics  |

### Free Industry Data

| Source                             | Best For                                                 |
| ---------------------------------- | -------------------------------------------------------- |
| Google Trends                      | Relative search interest over time, geographic breakdown |
| Crunchbase (free tier)             | Startup funding data, company profiles                   |
| LinkedIn Talent Insights (limited) | Headcount growth, skill demand                           |
| App Annie / data.ai (limited free) | Mobile app market data                                   |
| SimilarWeb (free tier)             | Website traffic estimates                                |
| GitHub (public repos)              | Open source adoption metrics                             |
| Stack Overflow Survey              | Developer tool adoption, technology trends               |

## Industry-Specific Data Sources

### Technology / SaaS

- Gartner Magic Quadrant reports (methodology is well-documented)
- IDC Worldwide Tracker series (hardware and software market data)
- Synergy Research Group (cloud infrastructure data)
- Bessemer Cloud Index (public cloud company metrics)
- KeyBanc SaaS survey (private SaaS benchmarks)

### Healthcare

- CMS (Centers for Medicare & Medicaid Services) — spending data
- NIH RePORTER — research funding by disease area
- FDA databases — drug/device approvals, clinical trials
- WHO Global Health Observatory — international health data
- IQVIA — pharmaceutical market data (subscription)

### Financial Services

- FDIC — banking industry data
- Federal Reserve — payment system data, bank holding company data
- CFPB — consumer finance complaints, market monitoring
- BIS — international banking and financial statistics

### E-commerce / Retail

- Census Bureau Monthly Retail Trade — e-commerce as % of retail
- National Retail Federation — industry forecasts
- Shopify economic reports — SMB e-commerce trends
- Adobe Digital Economy Index — online spending data

### Energy / Climate

- EIA (Energy Information Administration) — energy production, consumption, pricing
- IRENA — renewable energy statistics
- IEA — global energy data and projections
- EPA — emissions data, environmental regulations

## Confidence Level Framework

Assign a confidence level to every market size estimate based on data quality.

### Levels

| Level  | Definition                              | Data Characteristics                                                                                   | Typical Error Range |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| High   | Well-sourced, triangulated              | 2+ independent sources agree within 20%. Recent data (< 2 years). Government or audited data.          | +/- 20%             |
| Medium | Reasonable estimate with gaps           | Single credible source. Data 2-4 years old. Some extrapolation required.                               | +/- 50%             |
| Low    | Rough estimate, significant assumptions | No direct data. Proxy market or Fermi estimation. Data > 4 years old. Single non-authoritative source. | +/- 100% or more    |

### Rules

- State the confidence level alongside every quantitative estimate
- If confidence is Low, recommend specific research to improve it
- Never present a Low-confidence estimate without the confidence label
- Aggregate confidence for the analysis is the minimum of its component estimates

## Common Market Sizing Pitfalls

### Double-Counting

Adding overlapping market segments. If "cloud security" includes both "email security"
and "data loss prevention," adding all three produces inflated figures.

**Fix:** Map the taxonomy. Ensure segments are mutually exclusive before summing.

### Survivorship Bias

Using data only from successful companies to estimate market size. Failed companies
and churned customers are part of the market too.

**Fix:** Include market churn rates. Look at total addressable demand, not just current
revenue.

### Ignoring Price Sensitivity

Assuming current pricing holds at scale. Many markets see price compression as
competition increases and volume grows.

**Fix:** Model market size at both current and projected pricing. Size by volume
(units) in addition to revenue.

### Confusing Market Size with Market Opportunity

A $100B market does not mean $100B of opportunity for a new entrant. Switching costs,
incumbent lock-in, and channel access dramatically reduce the addressable portion.

**Fix:** Apply realistic SAM and SOM filters. A 1-2% SOM in year 1 is ambitious for
most markets.

### Year-Zero Problem

Using year 0 of a new market category and extrapolating exponential growth indefinitely.
All markets follow S-curves, not exponentials.

**Fix:** Model using S-curve or logistic growth. Identify the ceiling (total addressable
population x penetration cap).

### Geography Generalization

Applying US market data globally without adjustment. Market sizes, growth rates, and
competitive dynamics vary dramatically by region.

**Fix:** Size each geography independently. Use PPP-adjusted figures for price-sensitive
comparisons.

### TAM Inflation Through Bundling

Including adjacent features or products in the TAM that the product does not address.
A project management tool should not include the entire collaboration software TAM.

**Fix:** Define the TAM by the specific problem the product solves, not the broadest
category it could be placed in.
