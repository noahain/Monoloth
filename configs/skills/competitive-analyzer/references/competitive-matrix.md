# Competitive Matrix — Reference

Framework for structuring feature comparison, pricing analysis, and gap identification across competitors.

## Feature Comparison Matrix Structure

### Category Framework

Organize features into standard categories. Adapt category names to the specific market but maintain the hierarchical structure.

| Category                  | What It Covers                                                               |
| ------------------------- | ---------------------------------------------------------------------------- |
| Core functionality        | Primary value-delivering features. What the product fundamentally does.      |
| Integrations              | Third-party connections, APIs, ecosystem breadth.                            |
| Pricing & packaging       | Model, tiers, free tier, trial, billing flexibility.                         |
| Support & service         | SLA, support channels, response time, onboarding, documentation.             |
| Scalability & performance | Throughput, latency, concurrency, data limits, uptime guarantees.            |
| Security & compliance     | Certifications (SOC2, HIPAA, GDPR), encryption, access controls, audit logs. |
| User experience           | Ease of setup, learning curve, UI quality, mobile support, accessibility.    |
| Extensibility             | Customization, plugin/extension system, white-labeling, API coverage.        |
| Analytics & reporting     | Built-in analytics, custom reports, data export, dashboards.                 |
| Collaboration             | Multi-user, roles/permissions, real-time collaboration, sharing.             |

### Scoring Convention

Use consistent scoring across all competitors:

| Score        | Meaning                   | Criteria                                                                           |
| ------------ | ------------------------- | ---------------------------------------------------------------------------------- |
| **Full**     | Complete implementation   | Feature is production-ready, well-documented, and actively maintained              |
| **Superior** | Exceeds category standard | Feature goes beyond what competitors offer (unique capability, better performance) |
| **Partial**  | Incomplete implementation | Feature exists but is limited, in beta, or missing key aspects                     |
| **None**     | Not available             | Feature does not exist. Distinguish from "not applicable."                         |
| **Planned**  | On public roadmap         | Feature announced but not yet available. Date-stamp if known.                      |

### Weighting Features by Customer Importance

Not all features matter equally. Weight by customer impact:

**Weight assignment:**

- **Critical (3x):** Features that are deal-breakers. Without them, the product is not considered. Identify from: support tickets, churn reasons, sales loss analysis, G2/Capterra "must-have" mentions.
- **Important (2x):** Features that influence the decision. Identified from: RFP frequency, feature request volume, competitor marketing emphasis.
- **Nice-to-have (1x):** Features that add value but do not drive decisions. Identified from: low mention frequency in reviews, rarely in RFPs.

**Weighted scoring formula:**

```
Weighted Score = Sum(feature_score × weight) / Sum(weights)
Where: Full=3, Superior=4, Partial=1, None=0
```

## Gap Analysis Methodology

### Gap Types

| Gap Type            | Definition                                    | Strategic Value                                                   |
| ------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| **Opportunity gap** | No competitor offers this feature             | High — potential first-mover advantage if customer demand exists  |
| **Parity gap**      | Competitors offer it, you do not              | Urgent — table stakes missing, likely causing churn or lost deals |
| **Quality gap**     | You offer it, but competitors do it better    | Medium — improvement opportunity, customer satisfaction risk      |
| **Over-investment** | You invest heavily, customers do not value it | Negative — redirect resources to higher-impact areas              |

### Identifying Gaps

1. Build the full feature matrix
2. Mark cells where your product scores lower than 2+ competitors = parity gaps
3. Mark cells where no competitor scores Full or Superior = opportunity gaps
4. Cross-reference with customer importance weights: a parity gap on a Critical feature is a strategic emergency; on a Nice-to-have, it is low priority
5. Validate opportunity gaps against customer demand signals before investing

### Gap Prioritization Matrix

|                             | High Customer Demand           | Low Customer Demand                     |
| --------------------------- | ------------------------------ | --------------------------------------- |
| **No competitor offers it** | Innovation opportunity (build) | Validate demand before investing        |
| **Competitors offer it**    | Parity gap (close urgently)    | Deprioritize or differentiate elsewhere |

## Pricing Model Comparison Framework

### Pricing Model Taxonomy

| Model                   | How It Works                                        | Best For                            | Risk For Buyer                      |
| ----------------------- | --------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| **Flat subscription**   | Fixed monthly/annual fee                            | Predictable budgets, SMB            | Overpaying if underutilized         |
| **Tiered subscription** | Price increases with tier (features or limits)      | Segmented markets                   | Forced upgrades, tier confusion     |
| **Per-seat**            | Price per user                                      | Collaboration tools                 | Cost scales linearly with team size |
| **Usage-based**         | Pay per unit consumed (API calls, storage, compute) | Variable workloads, developer tools | Unpredictable costs, bill shock     |
| **Freemium**            | Free tier with paid upgrades                        | PLG, broad adoption                 | Conversion rate uncertainty         |
| **Enterprise custom**   | Negotiated pricing                                  | Large accounts, complex deployments | Opaque, long sales cycle            |
| **Hybrid**              | Combination (base + usage, seat + tier)             | Complex value delivery              | Complexity in comparison            |

### Pricing Analysis Dimensions

| Dimension               | What to Compare                                                             |
| ----------------------- | --------------------------------------------------------------------------- |
| Entry price             | Lowest paid tier. What does it cost to start?                               |
| Price per seat at scale | Cost at 10, 50, 100, 500 seats. Linearity vs. volume discounts.             |
| Feature gating          | Which features are restricted to higher tiers? Are critical features gated? |
| Usage limits            | Storage, API calls, records, bandwidth limits per tier.                     |
| Contract requirements   | Monthly vs. annual commitment. Early termination terms.                     |
| Discount patterns       | Annual discount percentage. Startup/nonprofit programs.                     |
| Free tier scope         | What is included free? Is it genuinely useful or a demo?                    |
| Hidden costs            | Implementation fees, training, migration, support tiers, overages.          |

### Price Sensitivity Signals

Indicators that the market is price-sensitive (buyer power on pricing is high):

- Multiple competitors advertising price as a primary differentiator
- "Affordable alternative to X" positioning is common
- Review sites frequently mention pricing in negative reviews
- Free and open-source alternatives exist with significant adoption
- Customers frequently negotiate or request discounts
- Usage-based models are gaining share (buyers want to pay only for what they use)

### Price-to-Feature Ratio Positioning

Map competitors on a price vs. feature richness grid:

| Quadrant                  | Position     | Strategy Signal                |
| ------------------------- | ------------ | ------------------------------ |
| High price, high features | Premium      | Sustainable if moat exists     |
| High price, low features  | Overpriced   | Vulnerable to disruption       |
| Low price, high features  | Value leader | Growth play, margin pressure   |
| Low price, low features   | Budget       | Serves price-sensitive segment |

The most defensible positions are Premium (with moats) and Value Leader (with cost advantages). Overpriced positions erode over time as competitors close feature gaps.
