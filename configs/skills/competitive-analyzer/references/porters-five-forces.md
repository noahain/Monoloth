# Porter's Five Forces — Reference

Framework for assessing industry structure and competitive intensity. Each force represents a dimension of competitive pressure that determines the profit potential of an industry.

## Force 1: Threat of New Entrants

New entrants bring new capacity and a desire for market share, putting pressure on prices, costs, and investment.

### Sub-Criteria

| Factor               | Low Threat (1)                        | Moderate (3)                        | High Threat (5)                |
| -------------------- | ------------------------------------- | ----------------------------------- | ------------------------------ |
| Capital requirements | >$10M to compete                      | $1-10M                              | <$1M, bootstrappable           |
| Regulatory barriers  | Licensed, regulated industry          | Some compliance requirements        | No regulatory barriers         |
| Technology barriers  | Deep proprietary tech required        | Moderate technical complexity       | Off-the-shelf tech stack       |
| Brand loyalty        | Incumbents have strong brand lock-in  | Some brand preference               | Commoditized, brand-agnostic   |
| Distribution access  | Exclusive channels, long sales cycles | Established but accessible channels | Direct-to-consumer, self-serve |
| Economies of scale   | Massive scale advantages in cost      | Moderate scale benefits             | Minimal scale advantage        |
| Network effects      | Strong network effects in incumbents  | Mild network effects                | No network effects             |

### Scoring Rubric

- **1 (Very Low):** Multiple high barriers exist. New entrants rare in the past 5 years. Incumbents control distribution and have strong brands.
- **2 (Low):** Significant barriers but not insurmountable. Occasional new entrants with substantial funding.
- **3 (Moderate):** Barriers exist but are surmountable with focused effort. New entrants appear regularly but most fail.
- **4 (High):** Low barriers to entry. Multiple new entrants annually. Technology is accessible.
- **5 (Very High):** Trivial to enter. Open-source tools, low capital, no regulatory barriers. Market flooded with new entrants.

### Common Mistakes

- Confusing current competitor count with threat of new entrants. A crowded market can still have high barriers.
- Ignoring technology disruption that lowers barriers overnight (cloud computing eliminated infrastructure barriers for SaaS).
- Treating regulatory barriers as permanent. Regulation changes.
- Overlooking adjacent market players who already have the capabilities and customer relationships.

## Force 2: Supplier Power

Suppliers with leverage can capture value by charging higher prices, limiting quality or availability, or shifting costs to industry participants.

### Sub-Criteria

| Factor                     | Low Power (1)                            | Moderate (3)                             | High Power (5)                         |
| -------------------------- | ---------------------------------------- | ---------------------------------------- | -------------------------------------- |
| Supplier concentration     | Many suppliers, commoditized inputs      | Several suppliers, some differentiation  | Few suppliers, unique inputs           |
| Switching costs            | Easy to switch, standard interfaces      | Moderate migration effort                | High switching costs, deep integration |
| Forward integration threat | Suppliers unlikely to compete            | Suppliers have explored direct offerings | Suppliers actively moving downstream   |
| Input uniqueness           | Commodity inputs, many alternatives      | Some specialized inputs                  | Unique, irreplaceable inputs           |
| Revenue dependency         | Supplier depends heavily on the industry | Balanced dependency                      | Industry depends heavily on supplier   |

### Industry-Specific Considerations

- **Software/SaaS:** Key suppliers are cloud providers (AWS, GCP, Azure), API providers, and talent. Cloud provider concentration creates moderate-high supplier power.
- **Hardware:** Component suppliers (chips, displays) often have high power due to concentration and capacity constraints.
- **Data-dependent businesses:** Data providers can have extreme power if the data is proprietary and non-substitutable.

### Scoring Rubric

- **1 (Very Low):** Commodity inputs from many suppliers. Switching is trivial. Suppliers compete aggressively for the business.
- **2 (Low):** Multiple supplier options with low switching costs. Some standardization.
- **3 (Moderate):** Limited supplier options in some areas. Moderate switching costs. Some dependency on key vendors.
- **4 (High):** Few suppliers for critical inputs. Significant switching costs. Supplier has leverage in negotiations.
- **5 (Very High):** Single-source dependency on critical inputs. Supplier could forward-integrate. Switching is prohibitively expensive.

## Force 3: Buyer Power

Buyers with leverage can force down prices, demand better quality or service, and play competitors against each other.

### Sub-Criteria

| Factor                   | Low Power (1)                      | Moderate (3)                      | High Power (5)                            |
| ------------------------ | ---------------------------------- | --------------------------------- | ----------------------------------------- |
| Buyer concentration      | Highly fragmented buyers           | Some large buyers                 | Few buyers, large contracts               |
| Price sensitivity        | Price-insensitive, value-driven    | Moderate price awareness          | Highly price-sensitive, commoditized      |
| Switching costs          | High switching costs for buyers    | Moderate switching effort         | Low switching costs, easy migration       |
| Information availability | Opaque pricing, complex comparison | Some price transparency           | Full price transparency, comparison tools |
| Backward integration     | Buyers cannot build it themselves  | Some buyers have build capability | Buyers can and do build in-house          |

### Scoring Rubric

- **1 (Very Low):** Fragmented buyers with high switching costs. Product is critical and differentiated. Low price transparency.
- **2 (Low):** Many buyers, moderate switching costs. Some product differentiation protects pricing.
- **3 (Moderate):** Buyers have options and some leverage. Price comparison is possible. Switching is feasible but not trivial.
- **4 (High):** Concentrated buyers or low switching costs. Price transparency is high. Buyers actively compare alternatives.
- **5 (Very High):** Few large buyers control most revenue. Commodity product. Buyers can easily switch or build in-house.

## Force 4: Threat of Substitutes

Substitutes perform the same function through different means. They cap the profit potential of an industry.

### Sub-Criteria

| Factor                        | Low Threat (1)                   | Moderate (3)                             | High Threat (5)                        |
| ----------------------------- | -------------------------------- | ---------------------------------------- | -------------------------------------- |
| Substitute availability       | No viable alternatives           | Some alternatives in adjacent categories | Many ways to solve the same problem    |
| Performance/price ratio       | Substitutes inferior on value    | Substitutes comparable                   | Substitutes offer better value         |
| Switching costs to substitute | High effort to adopt substitute  | Moderate adoption effort                 | Easy to switch to substitute           |
| Buyer propensity              | Buyers loyal to current approach | Buyers open to alternatives              | Buyers actively exploring alternatives |

### Scoring Rubric

- **1 (Very Low):** No viable substitutes exist. The product category is the only way to address the need.
- **2 (Low):** Substitutes exist but are clearly inferior in performance or value.
- **3 (Moderate):** Substitutes are viable for some segments. Performance/price tradeoffs exist.
- **4 (High):** Multiple substitutes with competitive value propositions. Some buyers have already switched.
- **5 (Very High):** Superior substitutes available. The product category is being disrupted or commoditized.

### Common Mistakes

- Only considering substitutes within the same product category. The real threat is often from a completely different approach (email replacing fax, not a better fax machine).
- Ignoring non-consumption as a substitute. Doing nothing (or doing it manually) is always an alternative.
- Underestimating how quickly substitutes improve. Today's inferior substitute may be tomorrow's dominant solution.

## Force 5: Competitive Rivalry

The intensity of competition among existing competitors determines how much of the value created flows to industry participants vs. being competed away.

### Sub-Criteria

| Factor                  | Low Rivalry (1)                           | Moderate (3)                          | High Rivalry (5)                                |
| ----------------------- | ----------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| Number of competitors   | Few players, clear leader                 | Several players, some differentiation | Many players, fragmented                        |
| Industry growth         | High growth, expanding pie                | Moderate growth                       | Slow/no growth, zero-sum                        |
| Product differentiation | Highly differentiated offerings           | Some differentiation                  | Commoditized, feature parity                    |
| Exit barriers           | Low exit barriers, consolidation possible | Moderate exit barriers                | High exit barriers, players stay despite losses |
| Fixed costs             | Low fixed costs, variable model           | Moderate fixed costs                  | High fixed costs, pressure to fill capacity     |
| Strategic stakes        | Low strategic importance                  | Moderate stakes                       | High stakes, flagship products                  |

### Scoring Rubric

- **1 (Very Low):** Clear market leader, few competitors, high growth, differentiated products.
- **2 (Low):** Stable competitive structure. Growth absorbs new capacity. Competitors have distinct positions.
- **3 (Moderate):** Active competition but with differentiation. Market growing enough to support multiple players.
- **4 (High):** Aggressive competition on price or features. Slowing growth. Competitors converging on similar offerings.
- **5 (Very High):** Intense price wars. Commoditized products. Many undifferentiated competitors. High exit barriers trap underperformers.

## Synthesis: Overall Industry Attractiveness

After scoring all five forces, synthesize:

### Calculation

1. Score each force 1-5
2. Calculate the simple average (baseline)
3. Apply weighting if one force disproportionately shapes the industry (justify the weighting)

### Interpretation

| Average Score | Industry Attractiveness | Implication                                                 |
| ------------- | ----------------------- | ----------------------------------------------------------- |
| 1.0 - 1.5     | Very Attractive         | High profit potential, favorable structure                  |
| 1.6 - 2.5     | Attractive              | Above-average profit potential                              |
| 2.6 - 3.5     | Moderate                | Average profit potential, selective positioning needed      |
| 3.6 - 4.5     | Unattractive            | Below-average profit potential, requires strong positioning |
| 4.6 - 5.0     | Very Unattractive       | Low profit potential, consider adjacent markets             |

### Connecting to Strategy

- Forces scoring 4-5 are strategic priorities. The strategy must address or circumvent them.
- Forces scoring 1-2 are structural advantages. The strategy should leverage them.
- The dominant force (highest score) typically dictates the primary strategic challenge.
- Multiple high-scoring forces compound the challenge and require a more focused niche strategy.
