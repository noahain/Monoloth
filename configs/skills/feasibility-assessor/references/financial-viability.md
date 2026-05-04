# Financial Viability Reference

## Revenue Modeling Templates

### Subscription Revenue (SaaS)

```
Monthly Revenue = Paying Customers * ARPU
Growth: New MRR + Expansion MRR - Churned MRR - Contraction MRR
```

Key drivers: conversion rate from free to paid, monthly churn rate, expansion rate.

Typical conversion benchmarks:

- Free trial to paid: 2-5% (self-serve), 15-25% (sales-assisted)
- Freemium to paid: 1-4%
- Annual vs monthly: 20-40% of customers choose annual (offer 15-20% discount)

### Transaction Revenue (Marketplace / E-commerce)

```
Revenue = GMV * Take Rate
GMV = Transactions * Average Order Value
```

Key drivers: transaction volume, average order value, take rate sustainability.

Growth levers: increase supply (more sellers/providers), increase demand (more buyers), increase transaction frequency, increase AOV through bundling or upsell.

### Advertising Revenue

```
Revenue = Impressions * CPM / 1000
Revenue = Pageviews * Ads per Page * CPM / 1000
```

CPM benchmarks by category:

- General display: $1-5
- Targeted display: $5-15
- Premium / niche: $15-50
- Sponsored content: $20-80
- Video pre-roll: $10-30

Minimum viable audience for ad-supported business: 1M+ monthly pageviews for general content, 100K+ for niche with high-value audience.

### Data / API Revenue

```
Revenue = API Calls * Price per Call
Revenue = Data Subscribers * Monthly License Fee
```

Pricing models: per-call, tiered volume, flat subscription, usage-based with commitment.

Key consideration: data must be proprietary, continuously refreshed, or uniquely aggregated to command pricing power.

## Break-Even Analysis

### Formula

```
Break-Even Units = Fixed Costs / (Price per Unit - Variable Cost per Unit)
Break-Even Revenue = Fixed Costs / Contribution Margin %
Break-Even Customers = Fixed Costs / (ARPU * Gross Margin % - Variable Cost per Customer)
```

### Fixed Cost Categories

| Category           | Examples                               | Typical Monthly Range (Startup) |
| ------------------ | -------------------------------------- | ------------------------------- |
| Personnel          | Salaries, benefits, contractors        | $20K-200K                       |
| Infrastructure     | Cloud hosting, SaaS tools, domains     | $500-10K                        |
| Office / workspace | Rent, utilities, co-working            | $0-10K                          |
| Legal / accounting | Legal counsel, bookkeeping, compliance | $1K-5K                          |
| Insurance          | D&O, E&O, general liability            | $500-2K                         |

### Variable Cost Categories

| Category           | Examples                                | Scales With          |
| ------------------ | --------------------------------------- | -------------------- |
| COGS               | Hosting per user, API calls, data costs | Users / transactions |
| Payment processing | Stripe/payment gateway fees             | Revenue              |
| Customer support   | Support tickets, chat agents            | Users                |
| Fulfillment        | Shipping, packaging, returns            | Orders               |
| Sales commission   | Per-deal commission                     | New customers        |

### Scenario Modeling

Build three scenarios with explicit assumptions:

**Pessimistic scenario**:

- Conversion: 50th percentile of industry benchmarks
- Churn: 1.5x industry average
- Growth: linear, no viral coefficient
- CAC: 1.3x planned budget
- Timeline: 1.5x base estimate

**Base scenario**:

- Conversion: industry average
- Churn: industry average
- Growth: moderate compounding
- CAC: planned budget
- Timeline: base estimate

**Optimistic scenario**:

- Conversion: top quartile
- Churn: 0.7x industry average
- Growth: compounding with network effects or viral coefficient
- CAC: 0.8x planned (organic growth contribution)
- Timeline: 0.8x base estimate

## Cash Flow Projection

### Monthly Cash Flow Framework

```
Cash Inflow:
  + Revenue collected (not booked — cash basis)
  + Investment / funding received
  + Grants or credits

Cash Outflow:
  - Payroll and contractor payments
  - Infrastructure and hosting
  - Marketing and sales spend
  - Rent and utilities
  - Software subscriptions
  - Legal and professional services
  - Tax payments

Net Cash Flow = Inflow - Outflow
Ending Cash = Beginning Cash + Net Cash Flow
```

### Runway Calculation

```
Runway (months) = Current Cash Balance / Monthly Net Burn Rate
Net Burn Rate = Monthly Cash Outflow - Monthly Cash Inflow
```

Minimum comfortable runway: 12 months. Start fundraising at 6-9 months remaining.

## Funding Requirements

### How to Calculate

1. Determine monthly burn rate (total operating expenses - revenue)
2. Estimate months to reach cash-flow positive or next funding milestone
3. Add 6-month buffer for delays and unexpected costs
4. Total funding needed = monthly burn \* (months to milestone + buffer)

### Funding Stage Benchmarks

| Stage    | Typical Raise | Expected Traction                                   |
| -------- | ------------- | --------------------------------------------------- |
| Pre-seed | $100K-500K    | Idea + team, maybe prototype                        |
| Seed     | $500K-3M      | MVP live, early users, initial revenue signal       |
| Series A | $3M-15M       | Product-market fit, $1M+ ARR, clear growth path     |
| Series B | $15M-50M      | Scaling proven model, $5M+ ARR, unit economics work |

## Industry Benchmark Sources

Where to find comparable data:

- **SaaS**: OpenView Partners benchmarks, KeyBanc SaaS survey, Bessemer cloud index
- **E-commerce**: Shopify benchmark reports, NRF retail data
- **Marketplace**: a16z marketplace metrics, Sharetribe marketplace data
- **Fintech**: Plaid fintech reports, CB Insights financial services data
- **General**: Crunchbase, PitchBook, Y Combinator startup data
- **Public companies**: SEC filings (10-K, 10-Q) for comparable public companies

Use WebSearch to find current-year versions of these reports during assessment.

## Key Financial Ratios

| Ratio              | Formula                                                     | What It Indicates                  | Healthy Range                               |
| ------------------ | ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| Gross margin       | (Revenue - COGS) / Revenue                                  | Efficiency of core delivery        | SaaS: 70-85%, E-com: 30-50%                 |
| Operating margin   | Operating Income / Revenue                                  | Overall business efficiency        | Positive for mature, negative OK for growth |
| Burn multiple      | Net Burn / Net New ARR                                      | Efficiency of growth spending      | < 2x good, < 1x excellent                   |
| Rule of 40         | Revenue Growth % + Profit Margin %                          | Growth-profitability balance       | > 40% for SaaS                              |
| Magic number       | Net New ARR / Prior Quarter S&M Spend                       | Sales efficiency                   | > 1.0 good, > 1.5 excellent                 |
| CAC payback        | CAC / (ARPU \* Gross Margin)                                | Months to recover acquisition cost | < 12 months                                 |
| Quick ratio (SaaS) | (New MRR + Expansion MRR) / (Churned MRR + Contraction MRR) | Growth health                      | > 4.0                                       |

## Path to Profitability Patterns

### SaaS Pattern

1. **Year 0-1**: negative margins, high CAC, building product. Burn $50K-200K/mo.
2. **Year 1-2**: improving unit economics, churn stabilizing, gross margin climbing to 60-70%.
3. **Year 2-3**: gross margin 70-80%, operating expenses scaling sub-linearly, approaching contribution margin breakeven.
4. **Year 3-5**: operating leverage kicks in, path to operating profitability visible.

Key inflection: when net revenue retention exceeds 100%, existing customer base grows without additional CAC.

### Marketplace Pattern

1. **Year 0-1**: subsidize one or both sides to solve chicken-and-egg. Heavy burn.
2. **Year 1-2**: liquidity improving in core market, take rate established.
3. **Year 2-3**: network effects compound, CAC drops as word-of-mouth grows.
4. **Year 3-5**: operating leverage from network effects, expand to adjacent categories.

Key inflection: when organic supply growth exceeds paid acquisition — the marketplace is self-sustaining.

### E-commerce / DTC Pattern

1. **Year 0-1**: high CAC, building brand, testing channels. Negative contribution margin possible.
2. **Year 1-2**: channel optimization, repeat purchase rate improving, contribution margin positive.
3. **Year 2-3**: brand recognition reduces CAC, product line expansion increases LTV.
4. **Year 3-5**: profitable unit economics, growth from reinvested profits + selective paid acquisition.

Key inflection: when repeat purchase revenue exceeds new customer revenue — the brand has loyalty.

### Ad-Supported Pattern

1. **Year 0-1**: build audience, no meaningful ad revenue. Pure investment phase.
2. **Year 1-2**: reach ad revenue minimums, CPMs are low, experimenting with formats.
3. **Year 2-3**: audience large enough for direct ad sales, CPMs increase.
4. **Year 3-5**: diversify revenue (subscriptions, events, data), reduce ad dependency.

Key inflection: 1M+ monthly uniques for general content, or strong niche positioning that commands premium CPMs.
