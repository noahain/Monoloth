# TAM / SAM / SOM Reference

## Definitions

**TAM (Total Addressable Market)** — The total revenue opportunity if a product achieved
100% market share in its category. TAM represents the theoretical ceiling, not a
realistic target. It answers: "How big is the universe of demand for this type of
solution?"

**SAM (Serviceable Available Market)** — The portion of TAM that the product can actually
serve given its geographic reach, distribution channels, product capabilities, and
customer segment focus. SAM answers: "Of the total market, which part could we realistically
reach with our current business model?"

**SOM (Serviceable Obtainable Market)** — The portion of SAM that the company can
realistically capture in a defined timeframe (typically 1-3 years), given competitive
dynamics, go-to-market execution, and resource constraints. SOM answers: "What market
share can we actually win?"

## Relationships

```
TAM > SAM > SOM (always)

TAM = entire market
SAM = TAM filtered by:
  - Geography served
  - Customer segments targeted
  - Product capability match
  - Channel reach
SOM = SAM filtered by:
  - Competitive win rate
  - Sales/marketing capacity
  - Brand awareness
  - Time to ramp
```

A healthy ratio benchmark (varies by industry):

- SAM is typically 10-40% of TAM
- SOM Year 1 is typically 1-5% of SAM
- SOM Year 3 is typically 5-15% of SAM

## Top-Down Calculation

Start from published total market data and narrow progressively.

### Formula

```
TAM = Industry total revenue (from market reports)
SAM = TAM x geographic_filter x segment_filter x capability_filter
SOM = SAM x estimated_market_share x ramp_factor
```

### Step-by-Step

1. **Find the industry total.** Use market research reports (Statista, Grand View Research,
   IBISWorld, Gartner) for the broadest relevant market.
2. **Apply geographic filter.** If the product operates only in the US, multiply by the
   US share of the global market.
3. **Apply segment filter.** If the product targets only SMBs, multiply by the SMB
   share of the industry.
4. **Apply capability filter.** If the product covers only a subset of use cases (e.g.,
   only email marketing within the broader marketing automation market), multiply by
   the relevant sub-segment share.
5. **Estimate market share.** For SOM, apply a realistic capture rate based on competitive
   analysis and go-to-market capacity.

### Example

```
Global CRM market (TAM): $65B (Gartner 2024)
US-only (geographic filter): $65B x 0.42 = $27.3B
SMB segment (segment filter): $27.3B x 0.35 = $9.6B (SAM)
Year 1 capture at 2% share: $9.6B x 0.02 = $192M (SOM)
```

## Bottom-Up Calculation

Start from unit economics and scale by reachable customers.

### Formula

```
SOM = target_customers x conversion_rate x avg_revenue_per_customer
SAM = total_serviceable_customers x avg_revenue_per_customer
TAM = total_market_customers x avg_revenue_per_customer
```

### Step-by-Step

1. **Count reachable customers.** Identify the number of potential customers you can
   reach through your planned channels in the target timeframe.
2. **Estimate conversion rate.** What percentage of reached prospects will convert?
   Use industry benchmarks or analogous product data.
3. **Calculate average revenue per customer.** Annual contract value, average order
   value x purchase frequency, or subscription revenue.
4. **Scale to SAM.** Remove channel constraints — how many customers match your
   product profile in total?
5. **Scale to TAM.** Remove geographic and segment constraints — how many customers
   exist in the entire market?

### Example

```
US fitness studios (reachable via digital marketing): 45,000
Conversion rate (B2B SaaS benchmark): 3%
Average annual revenue per studio: $2,400
SOM = 45,000 x 0.03 x $2,400 = $3.24M
Total US fitness studios: 120,000
SAM = 120,000 x $2,400 = $288M
Global fitness studios: 400,000
TAM = 400,000 x $2,400 = $960M
```

## Cross-Validation

Run both top-down and bottom-up independently, then compare:

- **Agreement within 2x:** High confidence. Average the two.
- **Divergence 2x-5x:** Medium confidence. Investigate which assumptions differ.
  Common causes: top-down includes adjacent products, bottom-up underestimates
  price elasticity at scale.
- **Divergence > 5x:** Low confidence. One approach has a flawed assumption.
  Do not average — identify and fix the error.

## Common Mistakes

### Vanity TAM

Inflating TAM by using an overly broad market definition. An AI writing assistant's
TAM is not "the global software market" — it's the content creation and editing tools
market.

**Fix:** Define TAM as the market for the product category, not the broadest possible
interpretation.

### Ignoring Substitutes

Counting only direct competitors and missing substitute solutions (spreadsheets
competing with project management tools, manual processes competing with automation).

**Fix:** Include the value of workarounds and manual processes in the market size.

### Static Market Assumption

Using current market size without accounting for growth. A market at $5B growing at
25% CAGR will be $15B in 5 years.

**Fix:** State the base year and growth rate. Project forward for the relevant timeframe.

### Uniform Pricing

Assuming every customer pays the same price. Enterprise and SMB segments have
dramatically different willingness-to-pay.

**Fix:** Size each segment separately with segment-appropriate pricing.

### Conflating Revenue and GMV

Marketplace businesses often report Gross Merchandise Value, not revenue. A marketplace
with $1B GMV and a 15% take rate has $150M in revenue.

**Fix:** Use revenue, not GMV, unless specifically sizing transaction volume.

## Industry Benchmark Ranges

| Industry              | Typical TAM Range     | Growth (CAGR) | Notes                                        |
| --------------------- | --------------------- | ------------- | -------------------------------------------- |
| Enterprise SaaS       | $10B-$500B by segment | 10-20%        | High SAM/TAM ratio due to global delivery    |
| Consumer mobile apps  | $1B-$50B by category  | 5-15%         | Low conversion, high volume                  |
| Healthcare IT         | $20B-$200B            | 8-15%         | Regulatory friction, long sales cycles       |
| Fintech               | $10B-$300B by segment | 15-25%        | Strong growth, regulatory variance by region |
| E-commerce (vertical) | $5B-$100B             | 8-15%         | Category-dependent, commodity pressure       |
| EdTech                | $5B-$50B              | 10-20%        | Institutional vs consumer segments differ    |
| Climate/cleantech     | $10B-$500B            | 15-30%        | Policy-driven, subsidy-dependent             |

## Data Source Recommendations

| Source               | Best For                                    | Cost              | Freshness         |
| -------------------- | ------------------------------------------- | ----------------- | ----------------- |
| Statista             | Quick market size figures, charts           | Paid/free tier    | Updated regularly |
| Grand View Research  | Detailed segment breakdowns, CAGR           | Reports ($2K-$5K) | Annual            |
| IBISWorld            | US industry analysis, competitive landscape | Subscription      | Annual            |
| Gartner / IDC        | Technology markets, vendor landscape        | Subscription      | Quarterly         |
| Census Bureau / BLS  | US demographics, employment, wages          | Free              | Annual/monthly    |
| World Bank Open Data | Global economic indicators                  | Free              | Annual            |
| Crunchbase           | Startup funding, competitor tracking        | Freemium          | Real-time         |
| Google Trends        | Relative interest over time                 | Free              | Real-time         |
| SEC Filings (EDGAR)  | Public company revenue, segment data        | Free              | Quarterly         |
| PitchBook            | Private company data, deal flow             | Subscription      | Real-time         |
