# Unit Economics Reference

## Customer Acquisition Cost (CAC)

### Fully Loaded CAC Formula

```
CAC = (Marketing Spend + Sales Spend + Overhead Allocation) / New Customers Acquired
```

**Marketing spend**: ad spend, content production, SEO tools, sponsorships, events, agency fees.

**Sales spend**: sales team salaries + commissions + bonuses, CRM tools, sales enablement platforms.

**Overhead allocation**: proportion of operations, engineering (if building growth features), and management time spent on acquisition.

### CAC by Channel

Track CAC per acquisition channel independently. Blended CAC masks underperforming channels.

| Channel           | Typical B2B SaaS CAC | Typical B2C CAC |
| ----------------- | -------------------- | --------------- |
| Organic search    | $50-200              | $10-50          |
| Paid search       | $200-800             | $30-150         |
| Content marketing | $100-400             | $15-80          |
| Social ads        | $150-500             | $20-100         |
| Outbound sales    | $500-2000            | N/A             |
| Referral          | $50-150              | $5-30           |

These ranges are directional. Actual CAC depends on market, product, and execution quality.

### CAC Payback Period

```
Payback Period (months) = CAC / (ARPU * Gross Margin %)
```

Benchmark targets:

- SaaS: < 12 months (good), < 18 months (acceptable), > 24 months (concerning)
- E-commerce: < 3 months (good), < 6 months (acceptable)
- Marketplace: < 18 months (good), < 24 months (acceptable)

## Customer Lifetime Value (LTV)

### Simple LTV

```
LTV = ARPU * Average Customer Lifetime (months) * Gross Margin %
```

Where average customer lifetime = 1 / monthly churn rate.

### DCF-Based LTV

For businesses with long customer lifetimes, discount future revenue:

```
LTV = Sum over t=1 to T of: (ARPU_t * Gross Margin %) / (1 + discount_rate)^t
```

Use a discount rate of 10-15% for startups, 8-10% for established businesses.

### LTV with Expansion Revenue

```
Adjusted LTV = LTV_base * (1 + Net Revenue Retention - 1)
```

Net revenue retention > 100% means existing customers grow in value over time. This is the strongest signal for SaaS viability.

## LTV:CAC Benchmarks by Industry

| Industry              | Minimum Viable | Good | Excellent |
| --------------------- | -------------- | ---- | --------- |
| B2B SaaS              | 3:1            | 5:1  | 7:1+      |
| E-commerce / DTC      | 2:1            | 3:1  | 4:1+      |
| Marketplace           | 3:1            | 4:1  | 6:1+      |
| Consumer subscription | 2.5:1          | 4:1  | 5:1+      |
| Fintech               | 3:1            | 5:1  | 8:1+      |
| Enterprise software   | 5:1            | 8:1  | 10:1+     |

An LTV:CAC below the minimum viable ratio indicates the business burns cash on every customer acquired.

## Contribution Margin

```
Contribution Margin = Revenue per Unit - Variable Cost per Unit
Contribution Margin % = Contribution Margin / Revenue per Unit
```

**Variable costs include**: COGS, payment processing fees, hosting costs that scale with usage, customer support per ticket, fulfillment and shipping (physical goods).

**Fixed costs excluded**: salaries (non-variable), office rent, insurance, SaaS tools with flat pricing.

Target contribution margins:

- Software / SaaS: 70-85%
- Marketplace (net revenue): 60-80%
- E-commerce: 30-50%
- Physical subscription box: 25-40%

## SaaS-Specific Metrics

### Monthly Recurring Revenue (MRR)

```
MRR = Number of paying customers * Average revenue per account
```

MRR components:

- **New MRR**: revenue from new customers this month
- **Expansion MRR**: upsells, cross-sells, seat additions from existing customers
- **Churned MRR**: revenue lost from cancellations
- **Contraction MRR**: downgrades from existing customers
- **Net New MRR**: New + Expansion - Churned - Contraction

### Annual Recurring Revenue (ARR)

```
ARR = MRR * 12
```

Use ARR only when MRR is stable or growing. Annualizing a spike month is misleading.

### Net Revenue Retention (NRR)

```
NRR = (Starting MRR + Expansion - Contraction - Churn) / Starting MRR
```

Benchmarks:

- < 90%: churn problem, business contracts over time
- 90-100%: stable but no growth from existing base
- 100-110%: healthy, existing customers grow modestly
- 110-130%: strong, expansion outpaces churn
- 130%+: exceptional, typical of PLG with usage-based pricing

## Marketplace-Specific Metrics

### Gross Merchandise Value (GMV)

Total value of transactions facilitated through the marketplace.

```
GMV = Number of Transactions * Average Transaction Value
```

### Take Rate

```
Take Rate = Marketplace Revenue / GMV
```

Benchmarks by category:

- Ride-sharing: 20-30%
- Food delivery: 15-30%
- E-commerce marketplace: 8-15%
- Freelance / services: 10-20%
- Real estate: 2-5%
- B2B wholesale: 3-8%

### Liquidity

Percentage of listings that result in a transaction within a given time period. A marketplace with high GMV but low liquidity has a matching problem.

## Common Unit Economics Mistakes

1. **Ignoring fully loaded CAC**: counting only ad spend while ignoring sales salaries, tooling, and overhead
2. **Overstating LTV**: using gross revenue instead of gross profit, or assuming zero churn
3. **Blending channels**: masking a losing channel with a winning one
4. **Ignoring cohort degradation**: assuming month-12 retention matches month-3 retention
5. **Excluding variable costs**: hosting, support, and transaction fees erode margin
6. **Projecting LTV from immature cohorts**: extrapolating lifetime value from 3 months of data
7. **Comparing ratios across different business models**: a 3:1 LTV:CAC in enterprise SaaS is not equivalent to 3:1 in consumer mobile
8. **Ignoring negative working capital effects**: recognizing annual subscription revenue upfront while costs accrue monthly
